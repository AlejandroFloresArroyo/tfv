/**
 * Cálculo del costo de envío.
 *
 * Transcribe `openspec/specs/shipping-rates/spec.md`. Rebanada 17.
 *
 * Es una función pura, sin acceso a datos, por el mismo motivo que el motor de cotizaciones: la
 * ejecutan los dos lados. La interfaz enseña la estimación antes de pagar y el servidor cobra al
 * materializar, y **tienen que dar el mismo número**. El defecto M-11 es exactamente eso al revés:
 * el algoritmo estaba copiado palabra por palabra en el servidor y en el navegador, y las tarifas
 * escritas en el código, así que cambiar una tarifa exigía desplegar dos veces y las dos copias
 * podían divergir sin que nadie lo notara hasta que un cliente veía una cosa y pagaba otra.
 *
 * Las tarifas **entran como dato** (`ShippingRates`), no como constante de este módulo. Lo que hay
 * aquí es la regla; los números los pone quien llama, leyéndolos de la configuración de la empresa.
 * `DEFAULT_SHIPPING_RATES` es el cuadro de la spec, y sirve para sembrar la configuración de una
 * empresa nueva — no para calcular a espaldas de ella.
 *
 * ## Por qué hay aritmética decimal propia aquí
 *
 * El dinero es `Money` y no se toca: sale de `money.ts`. Pero **los pesos y las medidas no son
 * dinero** y también necesitan ser exactos, porque una libra son `0.453592` kilogramos y un peso
 * volumétrico es una división. Con coma flotante, `2` libras dan `0.9071839999999999` y el peso
 * facturable se decide comparando dos números que no son los que se escribieron. Así que las
 * magnitudes viajan como cadena decimal y se operan con enteros grandes, igual que el dinero.
 *
 * La distancia sí es coma flotante, y a propósito: es una magnitud geográfica que sólo se usa para
 * compararla con un umbral, nunca para multiplicar un importe. Ver `haversineKm`.
 */

import { UnprocessableError } from "./errors.ts"
import { add, formatMoney, type Money, money, scale, sum, ZERO } from "./money.ts"

// ─── Unidades ────────────────────────────────────────────────────────────────

export const SHIPPING_MODES = ["local", "national", "international", "pickup"] as const
export type ShippingMode = (typeof SHIPPING_MODES)[number]

export const LENGTH_UNITS = ["cm", "m", "in", "ft"] as const
export type LengthUnit = (typeof LENGTH_UNITS)[number]

export const WEIGHT_UNITS = ["g", "kg", "lb", "oz"] as const
export type WeightUnit = (typeof WEIGHT_UNITS)[number]

/** Factores del cuadro de conversión de la spec. Exactos, como cadena decimal. */
const LENGTH_TO_CM: Readonly<Record<LengthUnit, string>> = {
  cm: "1",
  m: "100",
  in: "2.54",
  ft: "30.48",
}

const WEIGHT_TO_KG: Readonly<Record<WeightUnit, string>> = {
  g: "0.001",
  kg: "1",
  lb: "0.453592",
  oz: "0.0283495",
}

/**
 * Posiciones decimales a las que se fijan las magnitudes normalizadas.
 *
 * Seis para el peso porque el cuadro de la spec llega hasta ahí —una libra son `0.453592`— y con
 * eso el miligramo ya es exacto. Cuatro para la longitud porque los cuatro factores del cuadro
 * tienen dos decimales, así que una medida escrita con dos ya no pierde nada.
 *
 * **El importe se calcula sobre estas cifras redondeadas, no sobre una precisión interna mayor.**
 * Es lo que hace que el desglose se pueda comprobar a mano: quien multiplique la tarifa por el peso
 * facturable que ve escrito obtiene el importe variable que ve escrito.
 */
const WEIGHT_PRECISION = 6
const LENGTH_PRECISION = 4

// ─── Decimal exacto para magnitudes ──────────────────────────────────────────

interface Decimal {
  readonly units: bigint
  readonly scale: number
}

/** Sin signo: no hay pesos ni medidas negativas, y admitirlos escondería un error de captura. */
const MAGNITUDE_PATTERN = /^\d+(\.\d+)?$/

function parseMagnitude(value: string, label: string): Decimal {
  const trimmed = value.trim()
  if (!MAGNITUDE_PATTERN.test(trimmed)) {
    throw new TypeError(`${label} inválido: ${JSON.stringify(value)}`)
  }

  const [whole = "0", fraction = ""] = trimmed.split(".")
  return { units: BigInt(whole + fraction), scale: fraction.length }
}

function multiplyMagnitude(a: Decimal, b: Decimal): Decimal {
  return { units: a.units * b.units, scale: a.scale + b.scale }
}

function alignMagnitudes(a: Decimal, b: Decimal): readonly [bigint, bigint, number] {
  const target = Math.max(a.scale, b.scale)
  return [
    a.units * 10n ** BigInt(target - a.scale),
    b.units * 10n ** BigInt(target - b.scale),
    target,
  ]
}

function addMagnitude(a: Decimal, b: Decimal): Decimal {
  const [left, right, target] = alignMagnitudes(a, b)
  return { units: left + right, scale: target }
}

function compareMagnitude(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const [left, right] = alignMagnitudes(a, b)
  return left < right ? -1 : left > right ? 1 : 0
}

/** División entera redondeando al más cercano. Las magnitudes son no negativas. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("División por cero")
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  return remainder * 2n >= denominator ? quotient + 1n : quotient
}

function roundMagnitude(value: Decimal, target: number): Decimal {
  if (value.scale <= target) {
    return { units: value.units * 10n ** BigInt(target - value.scale), scale: target }
  }
  return { units: divideRounded(value.units, 10n ** BigInt(value.scale - target)), scale: target }
}

function divideMagnitude(a: Decimal, b: Decimal, target: number): Decimal {
  const numerator = a.units * 10n ** BigInt(target + b.scale)
  const denominator = b.units * 10n ** BigInt(a.scale)
  return { units: divideRounded(numerator, denominator), scale: target }
}

/**
 * Cadena decimal canónica: sin ceros de relleno a la derecha.
 *
 * Doce kilogramos se escriben `12` y no `12.000000`. Lo que se guarda y lo que se enseña es la
 * cifra, no la precisión con la que se calculó, y `money.scale()` acepta las dos formas igual.
 */
function formatMagnitude(value: Decimal): string {
  if (value.scale === 0) return value.units.toString()

  const factor = 10n ** BigInt(value.scale)
  const whole = value.units / factor
  const fraction = value.units % factor
  if (fraction === 0n) return whole.toString()

  const padded = fraction.toString().padStart(value.scale, "0").replace(/0+$/, "")
  return `${whole}.${padded}`
}

const ZERO_MAGNITUDE: Decimal = { units: 0n, scale: 0 }

// ─── Normalización ───────────────────────────────────────────────────────────

/** Convierte una longitud a centímetros, según el cuadro de la spec. */
export function toCentimeters(value: string, unit: LengthUnit): string {
  const converted = multiplyMagnitude(
    parseMagnitude(value, "Longitud"),
    parseMagnitude(LENGTH_TO_CM[unit], "Factor"),
  )
  return formatMagnitude(roundMagnitude(converted, LENGTH_PRECISION))
}

/** Convierte un peso a kilogramos, según el cuadro de la spec. */
export function toKilograms(value: string, unit: WeightUnit): string {
  const converted = multiplyMagnitude(
    parseMagnitude(value, "Peso"),
    parseMagnitude(WEIGHT_TO_KG[unit], "Factor"),
  )
  return formatMagnitude(roundMagnitude(converted, WEIGHT_PRECISION))
}

/**
 * Peso volumétrico de un bulto, en kilogramos, a partir de sus tres lados **en centímetros**.
 *
 * El divisor es dato y no constante: es el que cada paquetería declara, y hoy vale cinco mil.
 */
export function volumetricWeightKg(
  lengthCm: string,
  widthCm: string,
  heightCm: string,
  divisor: string,
): string {
  const volume = multiplyMagnitude(
    multiplyMagnitude(parseMagnitude(lengthCm, "Largo"), parseMagnitude(widthCm, "Ancho")),
    parseMagnitude(heightCm, "Alto"),
  )
  return formatMagnitude(
    divideMagnitude(volume, parseMagnitude(divisor, "Divisor volumétrico"), WEIGHT_PRECISION),
  )
}

// ─── Distancia ───────────────────────────────────────────────────────────────

export interface Coordinates {
  readonly latitude: number
  readonly longitude: number
}

const EARTH_RADIUS_KM = 6371

/**
 * Distancia entre dos puntos sobre la superficie terrestre, en kilómetros.
 *
 * **Aquí sí hay coma flotante, y es lo correcto.** La fórmula usa senos y cosenos, que no tienen
 * representación decimal exacta, y el resultado no multiplica ningún importe: sólo se compara con
 * un umbral —quinientos, mil— para decidir qué recargo entra. Un error de milímetros en una
 * distancia de mil kilómetros no puede cambiar de qué lado del umbral cae.
 */
export function haversineKm(from: Coordinates, to: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180

  const deltaLatitude = toRadians(to.latitude - from.latitude)
  const deltaLongitude = toRadians(to.longitude - from.longitude)

  const chord =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLongitude / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(chord))
}

// ─── Entrada ─────────────────────────────────────────────────────────────────

/** Tarifa de una modalidad: lo que cuesta salir, y lo que cuesta cada kilogramo facturable. */
export interface ShippingTariff {
  readonly base: string
  readonly perKilogram: string
}

/**
 * Un recargo y el umbral que lo dispara.
 *
 * Se supera **estrictamente**: «más de tres artículos» son cuatro, no tres. Dentro de su grupo son
 * excluyentes, y por eso son una lista y no una suma: se elige el umbral más alto alcanzado.
 */
export interface ShippingThreshold {
  readonly over: number
  readonly amount: string
}

/**
 * El cuadro de tarifas de una empresa. **Todo esto es dato configurable**, ninguno es constante.
 *
 * La recolección no aparece: la spec la fija en cero —«SHALL tener costo cero»—, así que no es una
 * tarifa que alguien pueda cambiar sin dejar de ser recolección.
 */
export interface ShippingRates {
  /** Moneda en la que están escritas estas tarifas. */
  readonly currency: string
  readonly volumetricDivisor: string
  readonly local: ShippingTariff
  readonly national: ShippingTariff
  readonly international: ShippingTariff
  /** Sólo se aplican a los envíos nacionales, que es lo que dice el cuadro de la spec. */
  readonly distanceSurcharges: readonly ShippingThreshold[]
  readonly itemSurcharges: readonly ShippingThreshold[]
}

/** Conversión a otra moneda, con el tipo que se aplicó. */
export interface ShippingConversion {
  readonly currency: string
  readonly rate: string
}

/** Un bulto del envío, con sus medidas tal y como se declararon. */
export interface ShippingItem {
  readonly id: string
  /** Cuántas piezas iguales. Cuenta para el peso y para el recargo por número de artículos. */
  readonly quantity: number
  readonly length?: string | undefined
  readonly width?: string | undefined
  readonly height?: string | undefined
  readonly lengthUnit: LengthUnit
  readonly weight?: string | undefined
  readonly weightUnit: WeightUnit
}

export interface ShippingInput {
  readonly mode: ShippingMode
  readonly items: readonly ShippingItem[]
  readonly rates: ShippingRates
  /** Domicilio del comercio. Sin él no hay recargo por distancia. */
  readonly origin?: Coordinates | undefined
  /** Domicilio del comprador. Sin él tampoco. */
  readonly destination?: Coordinates | undefined
  readonly conversion?: ShippingConversion | undefined
}

// ─── Salida ──────────────────────────────────────────────────────────────────

export type ShippingSurchargeKind = "distance" | "item_count"

export interface ShippingSurcharge {
  readonly kind: ShippingSurchargeKind
  readonly threshold: number
  readonly amount: string
}

/**
 * El desglose que exige la spec: modalidad, pesos, artículos, base, variable, recargos y total.
 *
 * Se guarda íntegro junto a la compra (`checkouts.shipping_breakdown`), que es lo que permite
 * explicarle a un comprador —o a quien concilie— de dónde salió el importe meses después, aunque
 * las tarifas hayan cambiado desde entonces.
 */
export interface ShippingQuote {
  readonly version: 1
  readonly mode: ShippingMode
  readonly realWeightKg: string
  readonly volumetricWeightKg: string
  readonly billableWeightKg: string
  readonly itemCount: number
  /** Ausente cuando falta alguna de las dos coordenadas. */
  readonly distanceKm?: number | undefined
  readonly base: string
  readonly variable: string
  readonly surcharges: readonly ShippingSurcharge[]
  readonly surchargeTotal: string
  /** Moneda del total. La de las tarifas, salvo que se pidiera conversión. */
  readonly currency: string
  readonly total: string
  /** Sólo cuando hubo conversión: de dónde salió el total y con qué tipo. */
  readonly sourceCurrency?: string | undefined
  readonly sourceTotal?: string | undefined
  readonly exchangeRate?: string | undefined
  /** La recolección no lo exige; las tres modalidades con transporte, sí. */
  readonly requiresDeliveryAddress: boolean
}

/** Qué dato falta para poder calcular. */
export type ShippingDataField = "weight" | "length" | "width" | "height" | "quantity"

/**
 * Un artículo no trae lo que hace falta para calcular su envío.
 *
 * Se rechaza con `422` en lugar de suponer un valor: un peso inventado se convierte en un cobro
 * inventado, y el comprador paga la diferencia. Lleva el artículo y el campo para que la pantalla
 * pueda señalar la fila exacta en lugar de decir «faltan datos».
 */
export class ShippingDataError extends UnprocessableError {
  readonly itemId: string
  readonly field: ShippingDataField

  constructor(itemId: string, field: ShippingDataField) {
    super(
      `El artículo «${itemId}» no declara ${FIELD_LABELS[field]}, y sin ese dato no se puede ` +
        "calcular el envío",
      { itemId, field },
    )
    this.itemId = itemId
    this.field = field
  }
}

const FIELD_LABELS: Readonly<Record<ShippingDataField, string>> = {
  weight: "su peso",
  length: "su largo",
  width: "su ancho",
  height: "su alto",
  quantity: "una cantidad válida",
}

// ─── Tarifas de la spec ──────────────────────────────────────────────────────

/**
 * El cuadro de tarifas de `shipping-rates/spec.md`, tal cual.
 *
 * Es el punto de partida de la configuración de una empresa, **no el valor que usa el cálculo**:
 * quien llama trae las tarifas de la empresa. Que exista aquí es lo que permite que una empresa
 * recién dada de alta pueda cobrar envíos antes de que nadie entre a configurarlos.
 */
export const DEFAULT_SHIPPING_RATES: ShippingRates = {
  currency: "MXN",
  volumetricDivisor: "5000",
  local: { base: "99.00", perKilogram: "20.00" },
  national: { base: "199.00", perKilogram: "30.00" },
  international: { base: "499.00", perKilogram: "60.00" },
  distanceSurcharges: [
    { over: 500, amount: "40.00" },
    { over: 1000, amount: "80.00" },
  ],
  itemSurcharges: [
    { over: 3, amount: "20.00" },
    { over: 10, amount: "50.00" },
  ],
}

// ─── El motor ────────────────────────────────────────────────────────────────

/**
 * El umbral más alto que se supera, o ninguno.
 *
 * Es lo que hace excluyentes a los recargos de un grupo: la spec dice «se aplica sólo el que
 * corresponda al tramo alcanzado», y sumarlos cobraría dos veces el mismo hecho.
 */
function highestReached(
  thresholds: readonly ShippingThreshold[],
  value: number,
): ShippingThreshold | undefined {
  let reached: ShippingThreshold | undefined
  for (const threshold of thresholds) {
    if (value > threshold.over && (reached === undefined || threshold.over > reached.over)) {
      reached = threshold
    }
  }
  return reached
}

function requireField(item: ShippingItem, field: "length" | "width" | "height" | "weight"): string {
  const value = item[field]
  if (value === undefined || value.trim() === "") throw new ShippingDataError(item.id, field)
  return value
}

/** Tarifa de la modalidad. La recolección nunca llega aquí: se resuelve antes. */
function tariffFor(rates: ShippingRates, mode: Exclude<ShippingMode, "pickup">): ShippingTariff {
  return rates[mode]
}

/**
 * Calcula el costo de un envío.
 *
 * El orden de las operaciones es el de la spec: normalizar, sumar pesos, elegir el facturable,
 * componer base más variable, y sólo entonces los recargos. La conversión de moneda es lo último,
 * sobre el total ya compuesto, para que el desglose sea comprobable en la moneda de las tarifas.
 */
export function computeShipping(input: ShippingInput): ShippingQuote {
  const { mode, items, rates } = input

  const conversionOf = (total: Money) => {
    if (!input.conversion) {
      return { currency: rates.currency, total: formatMoney(total) }
    }
    const converted = scale(total, input.conversion.rate)
    return {
      currency: input.conversion.currency,
      total: formatMoney(converted),
      sourceCurrency: rates.currency,
      sourceTotal: formatMoney(total),
      exchangeRate: input.conversion.rate,
    }
  }

  // La recolección se resuelve antes de mirar las medidas: cuesta cero por definición de la spec,
  // y exigir peso y dimensiones para entregar en mostrador rechazaría compras que no se
  // transportan. Los recargos tampoco entran — cobrar cincuenta pesos por recoger quince piezas
  // no sería «costo cero».
  if (mode === "pickup") {
    const itemCount = items.reduce((total, current) => total + current.quantity, 0)
    return {
      version: 1,
      mode,
      realWeightKg: "0",
      volumetricWeightKg: "0",
      billableWeightKg: "0",
      itemCount,
      base: formatMoney(ZERO),
      variable: formatMoney(ZERO),
      surcharges: [],
      surchargeTotal: formatMoney(ZERO),
      ...conversionOf(ZERO),
      requiresDeliveryAddress: false,
    }
  }

  let realTotal = ZERO_MAGNITUDE
  let volumetricTotal = ZERO_MAGNITUDE
  let itemCount = 0

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ShippingDataError(item.id, "quantity")
    }

    const quantity: Decimal = { units: BigInt(item.quantity), scale: 0 }

    const weight = parseMagnitude(
      toKilograms(requireField(item, "weight"), item.weightUnit),
      "Peso",
    )
    const volumetric = parseMagnitude(
      volumetricWeightKg(
        toCentimeters(requireField(item, "length"), item.lengthUnit),
        toCentimeters(requireField(item, "width"), item.lengthUnit),
        toCentimeters(requireField(item, "height"), item.lengthUnit),
        rates.volumetricDivisor,
      ),
      "Peso volumétrico",
    )

    realTotal = addMagnitude(realTotal, multiplyMagnitude(weight, quantity))
    volumetricTotal = addMagnitude(volumetricTotal, multiplyMagnitude(volumetric, quantity))
    itemCount += item.quantity
  }

  const realWeight = roundMagnitude(realTotal, WEIGHT_PRECISION)
  const volumetricWeight = roundMagnitude(volumetricTotal, WEIGHT_PRECISION)
  const billableWeight =
    compareMagnitude(volumetricWeight, realWeight) > 0 ? volumetricWeight : realWeight

  const tariff = tariffFor(rates, mode)
  const base = money(tariff.base)
  const variable = scale(money(tariff.perKilogram), formatMagnitude(billableWeight))

  // Sin las dos coordenadas no hay distancia que medir, y sin distancia no hay recargo. Es la
  // situación normal en un domicilio recién capturado, y suponerla lejana cobraría de más.
  const distanceKm =
    input.origin && input.destination ? haversineKm(input.origin, input.destination) : undefined

  const surcharges: ShippingSurcharge[] = []

  if (mode === "national" && distanceKm !== undefined) {
    const reached = highestReached(rates.distanceSurcharges, distanceKm)
    if (reached) {
      surcharges.push({
        kind: "distance",
        threshold: reached.over,
        amount: formatMoney(money(reached.amount)),
      })
    }
  }

  const byCount = highestReached(rates.itemSurcharges, itemCount)
  if (byCount) {
    surcharges.push({
      kind: "item_count",
      threshold: byCount.over,
      amount: formatMoney(money(byCount.amount)),
    })
  }

  const surchargeTotal = sum(surcharges.map((surcharge) => money(surcharge.amount)))
  const total = add(add(base, variable), surchargeTotal)

  return {
    version: 1,
    mode,
    realWeightKg: formatMagnitude(realWeight),
    volumetricWeightKg: formatMagnitude(volumetricWeight),
    billableWeightKg: formatMagnitude(billableWeight),
    itemCount,
    ...(distanceKm === undefined ? {} : { distanceKm: Math.round(distanceKm * 100) / 100 }),
    base: formatMoney(base),
    variable: formatMoney(variable),
    surcharges,
    surchargeTotal: formatMoney(surchargeTotal),
    ...conversionOf(total),
    requiresDeliveryAddress: true,
  }
}
