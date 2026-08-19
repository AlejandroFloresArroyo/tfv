/**
 * Lo que se puede escribir de una suscripción y de un perfil de facturación, dicho una sola vez.
 *
 * Ver `openspec/specs/subscriptions-and-entitlements/spec.md` y `merchant-onboarding/spec.md`.
 *
 * Vive aquí por lo mismo que el esquema de producto: el **asistente de facturación valida paso a
 * paso**, y validar por paso sin compartir las reglas obliga a escribirlas dos veces. La copia que
 * se queda vieja es siempre la del navegador, que es la que decide si el usuario puede seguir.
 *
 * Aquí además hay cálculo, no sólo forma. El prorrateo es dinero, así que se hace con `Money`
 * —`bigint` en unidades mínimas— y nunca con coma flotante. Que sea puro es lo que permite probarlo
 * sin base de datos ni procesador de pagos, que es justo donde más falta hace.
 */

import { z } from "zod"
import { applyPercent, type Money, type Percent, scale, subtract } from "./money.ts"

// ─── Vocabulario ─────────────────────────────────────────────────────────────

export const BILLING_INTERVALS = ["day", "week", "month", "year"] as const
export type BillingInterval = (typeof BILLING_INTERVALS)[number]

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "canceled",
] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/**
 * Los estados con los que la empresa conserva sus funciones.
 *
 * `past_due` está dentro **a propósito**: un cobro fallido concede periodo de gracia, y durante él
 * la empresa opera. La pila anterior eliminaba la suscripción al primer rechazo de tarjeta y con
 * ella tumbaba la empresa y sus tiendas públicas (`DEFECTS.md` M-08). Si la gracia sigue vigente lo
 * decide quien pregunta, mirando la fecha; aquí sólo se dice qué estados son candidatos.
 */
export const OPERATING_STATUSES: readonly SubscriptionStatus[] = ["trialing", "active", "past_due"]

export const MERCHANT_STATUSES = ["pending", "limited", "active", "inactive"] as const
export type MerchantStatus = (typeof MERCHANT_STATUSES)[number]

/** Los estados de perfil con los que se puede cobrar, si además es el primario y tiene cuenta. */
export const CHARGING_MERCHANT_STATUSES: readonly MerchantStatus[] = ["limited", "active"]

// ─── Suscripción ─────────────────────────────────────────────────────────────

export const seats = z
  .number()
  .int("Los asientos se cuentan en enteros")
  .min(1, "Hace falta al menos un asiento")
  .max(500, "Para más de quinientos asientos hablamos primero")

export const subscribeInput = z.object({
  planId: z.string().uuid(),
  interval: z.enum(BILLING_INTERVALS),
  seats,
  /** Sólo se admite por debajo del umbral de volumen; por encima manda el descuento automático. */
  promotionCode: z.string().trim().min(1).max(60).optional(),
})

/**
 * Cambiar de plan **no lleva asientos**: se conservan los contratados.
 *
 * Es requisito de la spec, y admitirlos aquí sería ofrecer una forma de perderlos por descuido en
 * la misma petición que cambia el plan.
 */
export const changePlanInput = z.object({
  planId: z.string().uuid(),
  interval: z.enum(BILLING_INTERVALS).optional(),
})

// ─── Perfil de facturación ───────────────────────────────────────────────────

export const MERCHANT_BUSINESS_TYPES = [
  "individual",
  "company",
  "government_entity",
  "non_profit",
] as const

/**
 * Clave interbancaria: dieciocho dígitos.
 *
 * **Sólo longitud y dígitos**, que es lo que la spec exige antes de intentar registrarla. El dígito
 * de control existe y se podría comprobar; no se hace porque el requisito escrito es el formato, y
 * rechazar aquí una cuenta que el banco acepta sería inventar una regla que nadie pidió.
 */
export const clabe = z
  .string()
  .trim()
  .regex(/^\d{18}$/, "La clave interbancaria son dieciocho dígitos")

export const merchantBusinessInput = z.object({
  type: z.enum(MERCHANT_BUSINESS_TYPES),
  legalName: z.string().trim().min(1, "La razón social es obligatoria").max(200),
  taxId: z.string().trim().min(1, "El registro fiscal es obligatorio").max(20),
  taxRegime: z.string().trim().max(120).optional(),
  invoiceUse: z.string().trim().max(120).optional(),
  email: z.string().email().optional(),
  dialCode: z.string().trim().max(8).optional(),
  phone: z.string().trim().max(20).optional(),
})

export const merchantBankInput = z.object({
  bankName: z.string().trim().max(120).optional(),
  holderType: z.enum(["individual", "company"]),
  holder: z.string().trim().min(1, "El titular es obligatorio").max(200),
  clabe,
  currency: z.enum(["MXN", "USD"]),
  country: z.string().trim().length(2).default("MX"),
})

export const birthdateInput = z.object({
  day: z.number().int().min(1).max(31),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1900).max(2100),
})

export const merchantRepresentativeInput = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  lastname: z.string().trim().min(1, "El apellido es obligatorio").max(120),
  email: z.string().email().optional(),
  dialCode: z.string().trim().max(8).optional(),
  phone: z.string().trim().max(20).optional(),
  taxId: z.string().trim().max(20).optional(),
  birthdate: birthdateInput,
  address: z.object({
    line1: z.string().trim().min(1, "La calle y el número son obligatorios").max(200),
    city: z.string().trim().min(1, "La ciudad es obligatoria").max(120),
    state: z.string().trim().min(1, "El estado es obligatorio").max(120),
    postalCode: z.string().trim().min(1, "El código postal es obligatorio").max(12),
    country: z.string().trim().length(2).default("MX"),
  }),
  relationship: z.object({
    title: z.string().trim().max(120).optional(),
    isDirector: z.boolean().optional(),
    isExecutive: z.boolean().optional(),
    isRepresentative: z.boolean().optional(),
    isOwner: z.boolean().optional(),
    percentOwnership: z.number().min(0).max(100).optional(),
  }),
})

export const createMerchantProfileInput = z.object({
  alias: z.string().trim().min(1, "El alias es obligatorio").max(160),
  addressId: z.string().uuid().optional(),
  business: merchantBusinessInput,
  bank: merchantBankInput,
  representative: merchantRepresentativeInput,
})

/** Modificar admite bloques sueltos: cambiar la cuenta bancaria no obliga a reescribir el resto. */
export const updateMerchantProfileInput = z.object({
  alias: z.string().trim().min(1).max(160).optional(),
  addressId: z.string().uuid().nullable().optional(),
  business: merchantBusinessInput.optional(),
  bank: merchantBankInput.optional(),
  representative: merchantRepresentativeInput.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})

// ─── Mayoría de edad ─────────────────────────────────────────────────────────

/** Años que la ley pide del representante legal. */
export const LEGAL_AGE = 18

/**
 * ¿Alcanza la mayoría de edad?
 *
 * Se compara por partes —año, mes, día— y no restando milisegundos: la resta arrastra la zona
 * horaria de quien pregunta, y quien nació el mismo día de hace dieciocho años sería mayor en
 * Madrid y menor en Ciudad de México.
 */
export function isOfLegalAge(
  birthdate: { readonly day: number; readonly month: number; readonly year: number },
  now: Date = new Date(),
): boolean {
  const years = now.getUTCFullYear() - birthdate.year
  const months = now.getUTCMonth() + 1 - birthdate.month
  const days = now.getUTCDate() - birthdate.day

  if (years > LEGAL_AGE) return true
  if (years < LEGAL_AGE) return false
  if (months > 0) return true
  if (months < 0) return false
  return days >= 0
}

// ─── Prorrateo ───────────────────────────────────────────────────────────────

/** Decimales con los que se expresa la fracción de periodo que queda. */
const RATIO_SCALE = 6n

/**
 * Qué parte del periodo queda por consumir, como cadena decimal exacta.
 *
 * Se calcula con `bigint` y sale como cadena porque es lo que `scale()` sabe multiplicar sin pasar
 * por coma flotante. Fuera del periodo devuelve cero: no se prorratea lo que ya se consumió.
 */
export function remainingRatio(periodStart: Date, periodEnd: Date, at: Date): string {
  const total = BigInt(periodEnd.getTime() - periodStart.getTime())
  if (total <= 0n) return "0.000000"

  const remaining = BigInt(periodEnd.getTime() - at.getTime())
  if (remaining <= 0n) return "0.000000"
  if (remaining >= total) return "1.000000"

  const factor = 10n ** RATIO_SCALE
  const units = (remaining * factor) / total
  return `${units / factor}.${(units % factor).toString().padStart(Number(RATIO_SCALE), "0")}`
}

export interface ProrationInput {
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly at: Date
  /** Precio por asiento y periodo de lo que se deja. */
  readonly currentUnitAmount: Money
  readonly currentSeats: number
  /** Precio por asiento y periodo de lo que se contrata. */
  readonly nextUnitAmount: Money
  readonly nextSeats: number
}

export interface Proration {
  /** La fracción tal como se aplicó. Se conserva para poder explicar de dónde sale el importe. */
  readonly remainingRatio: string
  /** Lo que se abona por el tiempo no consumido de lo que se deja. */
  readonly credit: Money
  /** Lo que se cobra por el tiempo restante de lo que se contrata. */
  readonly charge: Money
  /** La diferencia. Negativa cuando el cambio abarata: es saldo a favor, no un cobro. */
  readonly due: Money
}

/**
 * El importe de un cambio a mitad de periodo.
 *
 * La regla de la spec es «según el tiempo restante del periodo en curso», y eso son dos partes: se
 * abona lo no consumido de lo que se deja y se cobra lo que queda de lo que se contrata. Calcular
 * sólo la segunda cobraría dos veces el mismo tiempo.
 *
 * Sirve igual para cambiar de plan y para ampliar asientos: ampliar es este mismo cálculo con el
 * mismo precio unitario y distinto número de asientos.
 */
export function prorate(input: ProrationInput): Proration {
  const ratio = remainingRatio(input.periodStart, input.periodEnd, input.at)

  const credit = scale(perSeat(input.currentUnitAmount, input.currentSeats), ratio)
  const charge = scale(perSeat(input.nextUnitAmount, input.nextSeats), ratio)

  return { remainingRatio: ratio, credit, charge, due: subtract(charge, credit) }
}

function perSeat(unit: Money, count: number): Money {
  return (unit * BigInt(count)) as Money
}

// ─── Descuento por volumen ───────────────────────────────────────────────────

export interface VolumePolicy {
  /** A partir de cuántos asientos se aplica. El umbral **no** entra: se aplica por encima. */
  readonly thresholdSeats: number
  readonly percent: Percent
}

export interface DiscountDecision {
  /** El porcentaje aplicado automáticamente, o nulo cuando no se llega al umbral. */
  readonly percent: Percent | null
  /**
   * ¿Se admite escribir un código promocional en la sesión de pago?
   *
   * Sólo por debajo del umbral. Con el descuento por volumen ya aplicado, admitir además un código
   * manual acumularía dos descuentos que nadie autorizó.
   */
  readonly allowsPromotionCode: boolean
}

export function decideDiscount(seatCount: number, policy: VolumePolicy): DiscountDecision {
  if (seatCount > policy.thresholdSeats) {
    return { percent: policy.percent, allowsPromotionCode: false }
  }
  return { percent: null, allowsPromotionCode: true }
}

/** Aplica un descuento a un importe. Sin descuento devuelve el importe intacto. */
export function withDiscount(amount: Money, percent: Percent | null): Money {
  if (percent === null) return amount
  return subtract(amount, applyPercent(amount, percent))
}
