/**
 * Cálculo de cotizaciones.
 *
 * Transcribe la cadena de `openspec/specs/quotation-pricing/spec.md`. El orden de las operaciones
 * **no es negociable**: las comisiones van sobre el neto, después de los impuestos, y el precio por
 * paquete sustituye al total de las líneas —no al subtotal, ni al descuento, que se aplica encima.
 *
 * Es una función pura, sin acceso a datos, porque la ejecutan los dos lados: el navegador la usa
 * para previsualizar mientras se edita, y el servidor la recalcula al guardar. Misma función,
 * mismo resultado — es lo que exige el requisito de que la previsualización coincida.
 */

import {
  add,
  applyPercent,
  distribute,
  formatMoney,
  isZero,
  type Money,
  money,
  multiply,
  negate,
  percent,
  scale,
  subtract,
  sum,
  ZERO,
} from "./money.ts"

/** Periodicidad de cobro de una línea de renta. */
export const RENT_FREQUENCIES = ["daily", "weekly", "monthly"] as const
export type RentFrequency = (typeof RENT_FREQUENCIES)[number]

/** Dirección del redondeo de los días aplicados. */
export const ROUND_DIRECTIONS = ["up", "down"] as const
export type RoundDirection = (typeof ROUND_DIRECTIONS)[number]

/** Días que cubre una unidad de cada frecuencia. */
const FREQUENCY_DIVISOR: Record<RentFrequency, bigint> = {
  daily: 1n,
  weekly: 7n,
  monthly: 30n,
}

const DAYS_SCALE = 100n

function formatDays(units: bigint): string {
  const whole = units / DAYS_SCALE
  const fraction = units % DAYS_SCALE
  return `${whole}.${fraction.toString().padStart(2, "0")}`
}

/**
 * Convierte los días del periodo a unidades de la frecuencia, con dos decimales.
 *
 * Diez días en frecuencia semanal son `1.43` semanas, no `1` ni `2`: el redondeo es una decisión
 * aparte y opcional.
 */
export function frequencyDays(days: number, frequency: RentFrequency): string {
  if (!Number.isInteger(days) || days < 0) {
    throw new TypeError(`Los días del periodo deben ser un entero no negativo: ${days}`)
  }

  const divisor = FREQUENCY_DIVISOR[frequency]
  const numerator = BigInt(days) * DAYS_SCALE
  const quotient = numerator / divisor
  const remainder = numerator % divisor

  return formatDays(remainder * 2n >= divisor ? quotient + 1n : quotient)
}

/** Cómo trata la cotización el redondeo de los días aplicados. */
export interface DayRounding {
  readonly round: boolean
  readonly direction: RoundDirection
}

/**
 * Aplica el redondeo opcional al valor convertido.
 *
 * Un redondeo que daría cero **conserva el valor sin redondear**: cobrar cero por un periodo que
 * existió es peor que cobrar la fracción.
 */
export function appliedDays(converted: string, rounding: DayRounding): string {
  if (!rounding.round) return converted

  const [whole = "0", fraction = ""] = converted.split(".")
  const hasFraction = /[1-9]/.test(fraction)

  const floor = BigInt(whole)
  const rounded = rounding.direction === "up" && hasFraction ? floor + 1n : floor

  return rounded === 0n ? converted : rounded.toString()
}

// ─── Entrada ─────────────────────────────────────────────────────────────────

/**
 * Tarifa de renta o de penalización: fija, o distinta por periodicidad.
 *
 * Con `| undefined` explícito porque lo que llega de un esquema de ruta es «presente con valor
 * indefinido», no «ausente».
 */
/**
 * Contacto de una de las partes.
 *
 * Vive aquí y no en el esquema por lo mismo que el resto del documento: lo enseña el navegador y lo
 * guarda el servidor, y dos copias de la misma estructura acaban divergiendo.
 *
 * Con `| undefined` explícito porque lo que llega de un esquema de ruta es «presente con valor
 * indefinido», no «ausente».
 */
export interface QuoteContact {
  readonly name: string
  readonly phone?: string | undefined
  readonly position?: string | undefined
}

export interface RateSchedule {
  readonly isFixed: boolean
  readonly fixed?: string | undefined
  readonly daily?: string | undefined
  readonly weekly?: string | undefined
  readonly monthly?: string | undefined
}

/**
 * Una línea con su precio y su cantidad **ya resueltos**.
 *
 * Resolver qué tarifa aplica es trabajo del servidor, que tiene la lista de precios; el motor
 * recibe el resultado. Es lo que le permite ser puro y correr igual en el navegador.
 */
export interface QuotationLineInput {
  readonly id: string
  readonly productId: string
  readonly measurementId: string
  /** Determinada por el número de unidades reservadas. Ver `stock-reservation`. */
  readonly quantity: number
  readonly frequency: RentFrequency
  /** Tarifa de venta, o precio del producto, o cero. Ver `warehouse-catalog`. */
  readonly basePrice: string
  /**
   * Precio negociado de la línea: **el total, para el periodo completo**.
   *
   * Sustituye a toda tarifa y no se multiplica ni por los días ni por la cantidad. Es como se
   * cotiza en la práctica cuando la lista de precios está sin llenar, que es casi siempre.
   *
   * Convive con la tarifa sin borrarla: retirarlo devuelve el cálculo por tarifa.
   */
  readonly linePrice?: string | undefined
  readonly rent?: RateSchedule | undefined
  readonly penalty?: RateSchedule | undefined
  /** Orden de presentación de la línea dentro de su producto. */
  readonly position?: number | undefined
  /** Orden de presentación del producto dentro de la cotización. */
  readonly positionProduct?: number | undefined
}

/** Concepto suelto que se suma al subtotal sin ser una línea de catálogo. */
export interface QuotationAdditional {
  readonly name: string
  readonly description?: string | undefined
  readonly amount: string
}

/** Descuento global, o por producto si así se declara. */
export interface QuotationDiscount {
  readonly type: "percent" | "amount"
  readonly value: string
  readonly perProduct?: boolean | undefined
}

/** Un anticipo o un depósito, tal y como se pactan. */
export interface QuotationPayment {
  readonly amount: string
  readonly method?: "card" | "cash" | "transfer" | undefined
  readonly date?: string | undefined
}

/** Condiciones de pago. Se leen enteras y no se consultan por campo suelto. */
export interface QuotePaymentTerms {
  readonly version: 1
  readonly additionals?: readonly QuotationAdditional[] | undefined
  readonly transferFeeRate?: string | undefined
  readonly additionalFeeRate?: string | undefined
  readonly spreadFeesAcrossLines?: boolean | undefined
  readonly advance?: QuotationPayment | undefined
  readonly deposit?: QuotationPayment | undefined
  readonly fixedPrice?: string | undefined
  readonly penalty?: { fixed?: string | undefined; concept?: string | undefined } | undefined
  readonly discount?: QuotationDiscount | undefined
}

/** Lo que el motor necesita para calcular una cotización entera. */
export interface QuotationInput {
  readonly type: "rent" | "sale"
  readonly startsOn?: Date | null | undefined
  readonly endsOn?: Date | null | undefined
  readonly roundDays?: boolean | undefined
  readonly roundDirection?: RoundDirection | undefined
  readonly lines: readonly QuotationLineInput[]
  readonly payment?: QuotePaymentTerms | undefined
  readonly taxes?: QuoteTaxes | undefined
  /**
   * Lo **cobrado** hasta ahora: la suma de los pagos registrados contra la cotización.
   *
   * No se confunde con el anticipo de las condiciones de pago. El anticipo es lo **pactado** y
   * mueve el documento; esto es lo que de verdad entró y es lo que decide el saldo. Pactar no es
   * cobrar, y hasta que alguien registre el pago las dos cifras no tienen por qué coincidir.
   *
   * Llega ya sumado porque los pagos son filas de una tabla y el motor no toca datos.
   */
  readonly collected?: string | undefined
}

/** Si un concepto fiscal aumenta o disminuye la base. Ver la tabla de tratamiento. */
export type TaxEffect = "increase" | "decrease"

/** Un impuesto del bloque fiscal. Se desactiva sin perder el porcentaje registrado. */
export interface TaxEntry {
  readonly enabled: boolean
  readonly rate: string
  readonly concept?: string | undefined
}

/** Contribución adicional: porcentaje o importe, con el signo que declare. */
export interface AdditionalTax {
  readonly name: string
  readonly enabled: boolean
  readonly type: "percent" | "amount"
  readonly value: string
  readonly effect: TaxEffect
}

/** Bloque fiscal mexicano. Ver la tabla de tratamiento en `quotation-pricing`. */
export interface QuoteTaxes {
  readonly version: 1
  readonly iva?: (TaxEntry & { readonly type: "trasladado" | "acreditable" | "exento" }) | undefined
  readonly isr?: (TaxEntry & { readonly type: "retenido" | "directo" }) | undefined
  readonly ivaRetention?: TaxEntry | undefined
  readonly isrRetention?: TaxEntry | undefined
  readonly ieps?: TaxEntry | undefined
  readonly isn?: TaxEntry | undefined
  readonly hospitality?: TaxEntry | undefined
  readonly frontier?: TaxEntry | undefined
  readonly additional?: readonly AdditionalTax[] | undefined
}

// ─── Salida ──────────────────────────────────────────────────────────────────

/** El desglose de una línea. Todos los importes son cadenas decimales de dos decimales. */
export interface QuotationLineBreakdown {
  readonly lineId: string
  readonly productId: string
  readonly measurementId: string
  readonly quantity: number
  readonly frequency: RentFrequency
  readonly appliedDays: string
  /**
   * **Ausente en una línea con precio negociado.**
   *
   * Repartir un total entre sus unidades no da un importe exacto, y un unitario que no multiplica
   * hasta el total es un dato falso en el documento con el que el cliente discute. Se prefiere no
   * informarlo a informarlo mal.
   */
  readonly unitCost?: string | undefined
  /**
   * **Ausentes cuando el descuento por producto es un importe fijo.**
   *
   * Ese importe se resta una vez al total de la línea, así que no hay unitario que informar:
   * `100.00` entre tres no existe en pesos, y un unitario que no multiplica hasta el total es un
   * dato falso en el documento. Con porcentaje siguen saliendo exactos.
   */
  readonly unitDiscount?: string | undefined
  readonly unitTotal?: string | undefined
  readonly cost: string
  readonly discount: string
  readonly total: string
  readonly penalty: string
  /** Comisión repartida a esta línea. Cero cuando las comisiones se muestran aparte. */
  readonly fee: string
  readonly unitFee: string
  /** El total de la línea con su comisión incorporada. Es lo que se imprime al repartir. */
  readonly totalWithFee: string
  /**
   * Nadie fijó precio para esta línea.
   *
   * Una renta cuya lista no tiene tarifa para la frecuencia elegida y que tampoco lleva precio
   * negociado. El total es cero porque **no hay precio**, no porque sea gratis, y la interfaz tiene
   * que poder distinguir las dos cosas para pedir uno.
   */
  readonly unpriced: boolean
}

/**
 * Un impuesto aplicado.
 *
 * El importe es **siempre positivo**; el signo lo lleva el efecto. Así el documento puede
 * presentar «retención de IVA … 106.70» sin decidir por su cuenta si resta o suma.
 */
export interface QuotationTaxBreakdown {
  readonly key: string
  /**
   * Lo que escribió quien registró el impuesto. **Ausente cuando no escribió nada.**
   *
   * No se rellena con la clave: `iva` es un identificador interno, y un documento que se lo enseña
   * al cliente está enseñando el nombre de una columna. Ponerle nombre es trabajo de quien traduce.
   */
  readonly concept?: string
  readonly effect: TaxEffect
  readonly rate?: string
  readonly amount: string
}

/** Las líneas de un producto, con su subtotal, para presentarlas juntas en el documento. */
export interface QuotationGroupBreakdown {
  readonly productId: string
  readonly lineIds: readonly string[]
  readonly subtotal: string
}

/** El desglose de la cotización, con cada paso intermedio de la cadena. */
export interface QuotationBreakdown {
  readonly version: 1
  readonly days: number
  readonly lines: readonly QuotationLineBreakdown[]
  readonly groups: readonly QuotationGroupBreakdown[]
  readonly linesTotal: string
  /**
   * El precio pactado por el paquete. **Ausente cuando no se pactó ninguno.**
   *
   * Sustituye al total de las líneas en la cadena, y viaja resuelto para que el documento no tenga
   * que volver a componérselo por su cuenta a partir de las condiciones de pago.
   */
  readonly packagePrice?: string | undefined
  readonly additionals: string
  readonly subtotal: string
  readonly discount: string
  readonly base: string
  readonly taxes: readonly QuotationTaxBreakdown[]
  readonly taxTotal: string
  readonly net: string
  readonly fees: string
  readonly feesSpread: boolean
  readonly gross: string
  readonly advance: string
  readonly total: string
  /** Lo que entró. Cero cuando nadie ha registrado ningún pago. */
  readonly collected: string
  /**
   * Lo que falta por cobrar: **bruto menos cobrado**.
   *
   * Desde el bruto y no desde el total, porque el total ya descontó el anticipo *pactado* y
   * descontarlo otra vez contaría dos veces el mismo dinero. Cuando el anticipo se cobra y se
   * registra, saldo y total coinciden — que es el caso normal y la comprobación de que la cuenta
   * está bien planteada.
   *
   * **Puede ser negativo.** Un cobro de más no se recorta a cero: esconderlo lo perpetúa.
   */
  readonly balance: string
  /** Contingente: no forma parte del total. Sólo se cobra si procede. */
  readonly penalty: string
  /** Contingente: se cobra por adelantado y se devuelve. Tampoco forma parte del total. */
  readonly deposit: string
}

// ─── El motor ────────────────────────────────────────────────────────────────

const MILLISECONDS_PER_DAY = 86_400_000

/**
 * Días que cubre la ventana de la cotización.
 *
 * Se redondea al día más cercano para que un cambio de horario de verano no reste un día a un
 * periodo de dos semanas.
 */
export function periodDays(startsOn?: Date | null, endsOn?: Date | null): number {
  if (!startsOn || !endsOn) return 0
  const elapsed = endsOn.getTime() - startsOn.getTime()
  return elapsed <= 0 ? 0 : Math.round(elapsed / MILLISECONDS_PER_DAY)
}

/**
 * El importe de una tarifa según su periodicidad. **Cero cuando nadie la fijó.**
 *
 * **Una tarifa fija ignora la frecuencia.** Mirar la frecuencia antes haría que una tarifa fija con
 * un importe semanal suelto cobrara el semanal, que es lo que marcarla fija evita.
 *
 * Lo que **no** hace, y hacía: recaer en el precio base del producto. Ese precio es el de venta, y
 * multiplicado por los días de una renta cobra el equipo tantas veces como días tenga la ventana.
 * Con las listas de precios sin llenar —la situación normal— ése era el camino por omisión. Ver la
 * corrección en `quotation-pricing/spec.md`: sin tarifa la línea queda **sin precio**, y quien
 * cotiza fija uno.
 *
 * Se publica porque la interfaz enseña este importe antes de que exista la línea —en el buscador
 * del constructor—, y enseñar ahí otro número sería prometer un precio que luego no se cobra.
 */
export function rateFor(schedule: RateSchedule | undefined, frequency: RentFrequency): Money {
  if (!schedule) return ZERO
  if (schedule.isFixed) return schedule.fixed === undefined ? ZERO : money(schedule.fixed)

  const rate = schedule[frequency]
  return rate === undefined ? ZERO : money(rate)
}

function computeLine(
  input: QuotationLineInput,
  type: "rent" | "sale",
  days: string,
  discount: QuotationDiscount | undefined,
): QuotationLineBreakdown {
  const basePrice = money(input.basePrice)
  const penaltyPrice = rateFor(input.penalty, input.frequency)

  // El precio negociado es el total de la línea para el periodo completo: ni se multiplica por los
  // días ni por la cantidad, y por eso la línea no tiene precio unitario que informar.
  if (input.linePrice !== undefined) {
    const negotiated = money(input.linePrice)
    const lineDiscount = discount?.perProduct ? discountOf(negotiated, discount) : ZERO
    const total = subtract(negotiated, lineDiscount)

    return {
      lineId: input.id,
      productId: input.productId,
      measurementId: input.measurementId,
      quantity: input.quantity,
      frequency: input.frequency,
      appliedDays: days,
      discount: formatMoney(lineDiscount),
      cost: formatMoney(negotiated),
      total: formatMoney(total),
      penalty: formatMoney(multiply(penaltyPrice, input.quantity)),
      fee: "0.00",
      unitFee: "0.00",
      totalWithFee: formatMoney(total),
      unpriced: false,
    }
  }

  const rentPrice = rateFor(input.rent, input.frequency)

  const unitCost = type === "rent" ? rentPrice : basePrice
  const unitGross = type === "rent" ? scale(rentPrice, days) : basePrice
  const gross = multiply(unitGross, input.quantity)

  // El descuento por producto baja **lo que vale la línea**, no la tarifa. Calculado sobre la
  // tarifa, un diez por ciento en una renta de diez días descontaba el uno por ciento.
  const perUnit = perUnitDiscount(discount, unitGross)
  const lineDiscount =
    perUnit === undefined
      ? fixedLineDiscount(discount, input.quantity)
      : multiply(perUnit, input.quantity)
  const total = subtract(gross, lineDiscount)

  return {
    lineId: input.id,
    productId: input.productId,
    measurementId: input.measurementId,
    quantity: input.quantity,
    frequency: input.frequency,
    appliedDays: days,
    unitCost: formatMoney(unitCost),
    // Un importe fijo por producto no divide entre las unidades: la línea se queda sin unitarios.
    ...(perUnit === undefined
      ? {}
      : {
          unitDiscount: formatMoney(perUnit),
          unitTotal: formatMoney(subtract(unitGross, perUnit)),
        }),
    cost: formatMoney(multiply(unitCost, input.quantity)),
    discount: formatMoney(lineDiscount),
    total: formatMoney(total),
    penalty: formatMoney(multiply(penaltyPrice, input.quantity)),
    fee: "0.00",
    unitFee: "0.00",
    totalWithFee: formatMoney(total),
    // Una renta sin tarifa para su frecuencia no vale cero: **no tiene precio**, y hay que fijarlo.
    unpriced: type === "rent" && isZero(rentPrice),
  }
}

/**
 * Lo que le toca a cada unidad del descuento por producto, cuando se puede repartir exacto.
 *
 * Devuelve `undefined` cuando el descuento es un **importe fijo por producto**: ése se resta una
 * vez al total de la línea y no hay reparto que hacer. Con porcentaje sí lo hay, porque el
 * porcentaje es distributivo y las unidades suman exactamente el descuento de la línea.
 */
function perUnitDiscount(
  discount: QuotationDiscount | undefined,
  unitGross: Money,
): Money | undefined {
  if (discount === undefined || discount.perProduct !== true) return ZERO
  if (discount.type === "amount") return undefined
  return applyPercent(unitGross, percent(discount.value))
}

/** El importe fijo que baja la línea entera. Una línea sin unidades no descuenta nada. */
function fixedLineDiscount(discount: QuotationDiscount | undefined, quantity: number): Money {
  if (discount === undefined || discount.perProduct !== true || discount.type !== "amount") {
    return ZERO
  }
  return quantity > 0 ? money(discount.value) : ZERO
}

/**
 * Reparte las comisiones entre las **unidades** cotizadas, no entre las líneas.
 *
 * Cada unidad carga lo mismo —el suelo de la división— y el residuo va a la última línea, de modo
 * que la suma de las líneas es exactamente la comisión. Repartir por línea daría un recargo
 * unitario distinto en cada una, que es lo contrario de lo que dice «entre las unidades».
 *
 * El reparto es **de presentación**: no toca la cadena de cálculo, así que activarlo no mueve ni
 * la base ni los impuestos ni el total.
 */
function spreadFees(lines: QuotationLineBreakdown[], fees: Money): QuotationLineBreakdown[] {
  const units = lines.reduce((total, line) => total + line.quantity, 0)
  if (units === 0 || isZero(fees)) return lines

  const perUnit = distribute(
    fees,
    Array.from({ length: units }, () => 1),
  )
  // Todas las unidades cargan lo mismo salvo la última, que absorbe el residuo.
  const [unitFee = ZERO] = perUnit

  let consumed = 0
  return lines.map((line) => {
    const share = sum(perUnit.slice(consumed, consumed + line.quantity))
    consumed += line.quantity

    return {
      ...line,
      fee: formatMoney(share),
      unitFee: formatMoney(unitFee),
      totalWithFee: formatMoney(add(money(line.total), share)),
    }
  })
}

/**
 * Agrupa las líneas por producto, conservando el orden de presentación de la cotización.
 *
 * El orden lo fijan dos campos por línea: `positionProduct` ordena los productos entre sí y
 * `position` ordena las líneas dentro de cada producto. Ver `quotations`.
 */
function groupByProduct(lines: readonly QuotationLineBreakdown[]): QuotationGroupBreakdown[] {
  const groups = new Map<string, QuotationLineBreakdown[]>()
  for (const line of lines) {
    const group = groups.get(line.productId)
    if (group) group.push(line)
    else groups.set(line.productId, [line])
  }

  return [...groups].map(([productId, group]) => ({
    productId,
    lineIds: group.map((line) => line.lineId),
    subtotal: formatMoney(sum(group.map((line) => money(line.total)))),
  }))
}

/** Un porcentaje opcional, resuelto a importe. Ausente es cero, no un error. */
function rateAmount(value: Money, rate: string | undefined): Money {
  return rate === undefined ? ZERO : applyPercent(value, percent(rate))
}

/** Un descuento, resuelto a importe sobre la cantidad que se le pase. */
function discountOf(value: Money, discount: QuotationDiscount): Money {
  return discount.type === "percent"
    ? applyPercent(value, percent(discount.value))
    : money(discount.value)
}

/** Calcula el desglose completo de una cotización. Pura: no toca datos ni reloj. */
export function computeQuotation(input: QuotationInput): QuotationBreakdown {
  const days = periodDays(input.startsOn, input.endsOn)
  const rounding: DayRounding = {
    round: input.roundDays ?? false,
    direction: input.roundDirection ?? "up",
  }

  const discount = input.payment?.discount
  const ordered = [...input.lines].sort(
    (a, b) =>
      (a.positionProduct ?? 0) - (b.positionProduct ?? 0) || (a.position ?? 0) - (b.position ?? 0),
  )
  const lines = ordered.map((line) =>
    computeLine(
      line,
      input.type,
      appliedDays(frequencyDays(days, line.frequency), rounding),
      discount,
    ),
  )

  const linesTotal = sum(lines.map((line) => money(line.total)))
  const additionals = sum(
    (input.payment?.additionals ?? []).map((additional) => money(additional.amount)),
  )

  // El precio por paquete sustituye a **lo que suman las líneas**, no al subtotal: un flete
  // registrado como concepto adicional no es parte del paquete de equipo, y absorberlo en silencio
  // se descubre al facturar.
  const packagePrice = input.payment?.fixedPrice
  const priced = packagePrice === undefined ? linesTotal : money(packagePrice)
  const subtotal = add(priced, additionals)

  // El descuento global se aplica igualmente sobre el precio del paquete. Y un descuento por
  // producto ya viajó dentro de las líneas, así que aquí es cero.
  const documentDiscount = discount && !discount.perProduct ? discountOf(subtotal, discount) : ZERO
  const base = subtract(subtotal, documentDiscount)

  const taxes = computeTaxes(base, input.taxes)
  const taxTotal = sum(
    taxes.map((tax) => (tax.effect === "increase" ? money(tax.amount) : negate(money(tax.amount)))),
  )
  const net = add(base, taxTotal)

  // Las comisiones van **sobre el neto**, después de los impuestos. Aplicarlas antes cambiaría la
  // base imponible y con ella el importe de cada impuesto.
  const fees = add(
    rateAmount(net, input.payment?.transferFeeRate),
    rateAmount(net, input.payment?.additionalFeeRate),
  )
  const gross = add(net, fees)
  const advance = money(input.payment?.advance?.amount ?? "0")
  const collected = money(input.collected ?? "0")

  const spread = input.payment?.spreadFeesAcrossLines === true
  const presented = spread ? spreadFees(lines, fees) : lines

  const fixedPenalty = input.payment?.penalty?.fixed
  const penalty =
    fixedPenalty === undefined ? sum(lines.map((line) => money(line.penalty))) : money(fixedPenalty)

  return {
    version: 1,
    days,
    lines: presented,
    groups: groupByProduct(presented),
    linesTotal: formatMoney(linesTotal),
    ...(packagePrice === undefined ? {} : { packagePrice: formatMoney(money(packagePrice)) }),
    additionals: formatMoney(additionals),
    subtotal: formatMoney(subtotal),
    discount: formatMoney(documentDiscount),
    base: formatMoney(base),
    taxes,
    taxTotal: formatMoney(taxTotal),
    net: formatMoney(net),
    fees: formatMoney(fees),
    feesSpread: spread,
    gross: formatMoney(gross),
    advance: formatMoney(advance),
    total: formatMoney(subtract(gross, advance)),
    collected: formatMoney(collected),
    balance: formatMoney(subtract(gross, collected)),
    penalty: formatMoney(penalty),
    deposit: formatMoney(money(input.payment?.deposit?.amount ?? "0")),
  }
}

// ─── Tratamiento fiscal ──────────────────────────────────────────────────────

/**
 * Cómo afecta cada concepto a la base. **Un solo lugar, una sola convención de signo.**
 *
 * La implementación anterior usaba dos convenciones incompatibles según se repartieran o no las
 * comisiones (`DEFECTS.md` M-05): una pasada calculaba `IVA + ISR − retención` y la otra
 * `IVA − ISR + retención`. Aquí hay una tabla y sólo una, y el reparto de comisiones no la toca.
 *
 * **El ISR directo está pendiente de confirmación de administración** (M-05). La spec adopta el
 * criterio fiscal habitual —aumenta la base— y es una fila de esta tabla, no una reestructuración.
 */
const TAX_TREATMENT = {
  "iva:trasladado": "increase",
  "iva:acreditable": "none",
  "iva:exento": "none",
  "isr:retenido": "decrease",
  "isr:directo": "increase",
  ivaRetention: "decrease",
  isrRetention: "decrease",
  ieps: "increase",
  isn: "increase",
  hospitality: "increase",
  frontier: "increase",
} as const satisfies Readonly<Record<string, TaxEffect | "none">>

/** Orden de presentación en el documento. */
const TAX_ORDER = [
  "iva",
  "isr",
  "ivaRetention",
  "isrRetention",
  "ieps",
  "isn",
  "hospitality",
  "frontier",
] as const

type TaxKey = (typeof TAX_ORDER)[number]

/**
 * El efecto de un concepto, resuelto por su clave y —cuando lo tiene— su modalidad.
 *
 * El IVA y el ISR cambian de signo según su tipo; el resto lo tiene fijo. Una modalidad que no
 * figure en la tabla no interviene, en lugar de suponerle un signo.
 */
function treatmentOf(
  key: TaxKey,
  entry: TaxEntry & { readonly type?: string },
): TaxEffect | "none" {
  const lookup: string = entry.type === undefined ? key : `${key}:${entry.type}`
  const table: Readonly<Record<string, TaxEffect | "none">> = TAX_TREATMENT
  return table[lookup] ?? "none"
}

function computeTaxes(base: Money, taxes: QuoteTaxes | undefined): QuotationTaxBreakdown[] {
  if (!taxes) return []
  const applied: QuotationTaxBreakdown[] = []

  for (const key of TAX_ORDER) {
    const entry = taxes[key]
    if (!entry?.enabled) continue

    const effect = treatmentOf(key, entry)
    if (effect === "none") continue

    applied.push({
      key,
      ...(entry.concept === undefined ? {} : { concept: entry.concept }),
      effect,
      rate: entry.rate,
      amount: formatMoney(applyPercent(base, percent(entry.rate))),
    })
  }

  for (const [index, entry] of (taxes.additional ?? []).entries()) {
    if (!entry.enabled) continue

    applied.push({
      key: `additional:${index}`,
      concept: entry.name,
      effect: entry.effect,
      ...(entry.type === "percent" ? { rate: entry.value } : {}),
      amount: formatMoney(
        entry.type === "percent" ? applyPercent(base, percent(entry.value)) : money(entry.value),
      ),
    })
  }

  return applied
}
