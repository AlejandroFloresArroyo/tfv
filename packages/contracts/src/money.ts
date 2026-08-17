/**
 * Dinero en decimal exacto.
 *
 * Ver `openspec/project.md` D-03 y `openspec/specs/quotation-pricing/design.md`.
 *
 * Internamente un importe es un `bigint` en la unidad mínima (dos decimales), de modo que la
 * aritmética es exacta y no hay coma flotante en ningún punto. En el transporte viaja como
 * **cadena decimal**, porque la representación numérica de JSON es de coma flotante y `1234.56`
 * no sobrevive intacto a un viaje de ida y vuelta.
 *
 * Los porcentajes se representan aparte, con cuatro decimales, porque retenciones como `10.6667`
 * necesitan esa precisión y multiplicar con menos arrastra error.
 */

const MONEY_SCALE = 2n

const PERCENT_SCALE = 4n
const PERCENT_FACTOR = 10_000n

/**
 * Divisor para aplicar un porcentaje.
 *
 * Son dos conversiones en una: deshacer la escala del porcentaje y dividir entre cien para pasar
 * de tanto por ciento a fracción.
 */
const PERCENT_DIVISOR = PERCENT_FACTOR * 100n

declare const MoneyBrand: unique symbol
declare const PercentBrand: unique symbol

/** Importe en unidades mínimas. Nunca se opera directamente: usa las funciones de este módulo. */
export type Money = bigint & { readonly [MoneyBrand]: true }

/** Porcentaje con cuatro decimales. `16` es dieciséis por ciento, no el 1600 %. */
export type Percent = bigint & { readonly [PercentBrand]: true }

export const ZERO = 0n as Money

// ─── Análisis y formato ──────────────────────────────────────────────────────

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/

function parseDecimal(input: string, scale: bigint, label: string): bigint {
  const trimmed = input.trim()
  if (!DECIMAL_PATTERN.test(trimmed)) {
    throw new TypeError(`${label} inválido: ${JSON.stringify(input)}`)
  }

  const negative = trimmed.startsWith("-")
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [whole = "0", fraction = ""] = unsigned.split(".")

  const width = Number(scale)
  if (fraction.length > width) {
    throw new TypeError(
      `${label} con más de ${width} decimales: ${JSON.stringify(input)}. ` +
        "Redondea de forma explícita antes de convertir.",
    )
  }

  const padded = fraction.padEnd(width, "0")
  const magnitude = BigInt(whole + padded)
  return negative ? -magnitude : magnitude
}

function formatDecimal(value: bigint, scale: bigint): string {
  const factor = 10n ** scale
  const negative = value < 0n
  const magnitude = negative ? -value : value

  const whole = magnitude / factor
  const fraction = magnitude % factor
  const padded = fraction.toString().padStart(Number(scale), "0")

  return `${negative ? "-" : ""}${whole}.${padded}`
}

/** Convierte una cadena decimal a importe. Rechaza más de dos decimales. */
export function money(input: string): Money {
  return parseDecimal(input, MONEY_SCALE, "Importe") as Money
}

/** Convierte un porcentaje escrito como cadena. `"16"` es dieciséis por ciento. */
export function percent(input: string): Percent {
  return parseDecimal(input, PERCENT_SCALE, "Porcentaje") as Percent
}

/** Representación para el transporte: siempre con dos decimales. */
export function formatMoney(value: Money): string {
  return formatDecimal(value, MONEY_SCALE)
}

export function formatPercent(value: Percent): string {
  return formatDecimal(value, PERCENT_SCALE)
}

/**
 * Unidades mínimas para el procesador de pagos.
 *
 * Sale como `number` porque es lo que espera su interfaz, y es seguro: el entero seguro más grande
 * de JavaScript cubre importes muy por encima de cualquiera que este sistema vaya a mover.
 */
export function toMinorUnits(value: Money): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`Importe fuera del rango representable: ${formatMoney(value)}`)
  }
  return Number(value)
}

// ─── Aritmética ──────────────────────────────────────────────────────────────

export function add(a: Money, b: Money): Money {
  return (a + b) as Money
}

export function subtract(a: Money, b: Money): Money {
  return (a - b) as Money
}

export function negate(value: Money): Money {
  return -value as Money
}

export function sum(values: readonly Money[]): Money {
  let total = 0n
  for (const value of values) total += value
  return total as Money
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0
}

export function isZero(value: Money): boolean {
  return value === 0n
}

export function isNegative(value: Money): boolean {
  return value < 0n
}

export function max(a: Money, b: Money): Money {
  return a >= b ? a : b
}

/**
 * División entera con redondeo al más cercano, resolviendo el empate alejándose de cero.
 *
 * Es la convención que produce lo que un cliente espera ver en una factura: `0.005` sube a `0.01`
 * y `-0.005` baja a `-0.01`.
 */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("División por cero")

  const negative = numerator < 0n !== denominator < 0n
  const absNumerator = numerator < 0n ? -numerator : numerator
  const absDenominator = denominator < 0n ? -denominator : denominator

  const quotient = absNumerator / absDenominator
  const remainder = absNumerator % absDenominator
  const rounded = remainder * 2n >= absDenominator ? quotient + 1n : quotient

  return negative ? -rounded : rounded
}

/** Multiplica por una cantidad entera. Exacto, sin redondeo. */
export function multiply(value: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) {
    throw new TypeError(`La cantidad debe ser entera: ${quantity}. Usa scale() para factores.`)
  }
  return (value * BigInt(quantity)) as Money
}

/** Aplica un porcentaje, redondeando a dos decimales. */
export function applyPercent(value: Money, rate: Percent): Money {
  return divideRounded(value * rate, PERCENT_DIVISOR) as Money
}

/**
 * Multiplica por un factor decimal arbitrario, redondeando a dos decimales.
 *
 * Lo usa el cálculo de renta, donde los días aplicados pueden ser fraccionarios: `1.43` semanas.
 */
export function scale(value: Money, factor: string): Money {
  const trimmed = factor.trim()
  if (!DECIMAL_PATTERN.test(trimmed)) {
    throw new TypeError(`Factor inválido: ${JSON.stringify(factor)}`)
  }

  const [, fraction = ""] = trimmed.replace("-", "").split(".")
  const factorScale = BigInt(fraction.length)
  const factorUnits = parseDecimal(trimmed, factorScale, "Factor")

  return divideRounded(value * factorUnits, 10n ** factorScale) as Money
}

/**
 * Reparte un importe entre varias partes con el peso indicado.
 *
 * El reparto es **exacto**: cuando la división no es entera, el residuo se asigna a la última
 * parte, de modo que la suma de las partes siempre es igual al total. Es lo que exige
 * `openspec/specs/quotation-pricing/spec.md` para el prorrateo de comisiones.
 */
export function distribute(total: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) return []
  if (weights.some((weight) => !Number.isInteger(weight) || weight < 0)) {
    throw new TypeError("Los pesos del reparto deben ser enteros no negativos")
  }

  const totalWeight = weights.reduce((accumulator, weight) => accumulator + weight, 0)
  if (totalWeight === 0) {
    throw new RangeError("El peso total del reparto no puede ser cero")
  }

  const parts: Money[] = []
  let assigned = 0n

  // Todas las partes menos la última se calculan por truncamiento; la última absorbe el residuo.
  for (let index = 0; index < weights.length - 1; index++) {
    const weight = weights[index] as number
    const part = (total * BigInt(weight)) / BigInt(totalWeight)
    parts.push(part as Money)
    assigned += part
  }

  parts.push((total - assigned) as Money)
  return parts
}
