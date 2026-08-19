/**
 * Planes, suscripción y cobros de la plataforma.
 *
 * Ver `openspec/specs/subscriptions-and-entitlements/spec.md` y la rebanada 11.
 *
 * Éste es **uno** de los dos flujos de dinero del sistema: lo que la plataforma le cobra a sus
 * empresas clientes. El otro —lo que una empresa le cobra a sus compradores— vive en
 * `merchants.ts`. Confundirlos es fácil y caro, así que están en archivos distintos.
 *
 * ## Dos correcciones que gobiernan el diseño
 *
 * **M-07 — la renovación no borra los descuentos.** La pila anterior sincronizaba los asientos
 * reescribiendo las líneas de la suscripción y se llevaba por delante descuentos y códigos. Aquí el
 * descuento vive en columna propia de la suscripción y la sincronización de asientos no la toca.
 *
 * **M-08 — un fallo de cobro no borra la suscripción.** La pila anterior la eliminaba al primer
 * rechazo de tarjeta, lo que tumbaba la empresa y sus tiendas públicas. Aquí pasa a pago pendiente
 * con un plazo de gracia durante el cual todo sigue funcionando.
 *
 * ## Todo pasa por las políticas
 *
 * Cada operación de usuario corre dentro de `withRequester`, así que el motor vuelve a comprobar el
 * alcance aunque la compuerta de permisos ya lo haya hecho. Lo que llega por evento del procesador
 * no tiene solicitante —lo manda un tercero— y corre con `withSystem`, que declara su alcance de
 * forma explícita y **tampoco elude las políticas**.
 */

import {
  buildPage,
  ConflictError,
  formatMoney,
  formatPercent,
  type Money,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  percent,
  type QuerySchema,
  UnprocessableError,
} from "@tfv/contracts"
import {
  type BillingInterval,
  decideDiscount,
  prorate,
  type SubscriptionStatus,
} from "@tfv/contracts/billing"
import { db, type Transaction, withRequester, withSystem } from "@tfv/db"
import {
  companyMembers,
  companySubscriptions,
  subscriptionPayments,
  subscriptionPlans,
} from "@tfv/db/schema"
import { and, asc, count, eq, isNull, ne } from "drizzle-orm"
import { env } from "../env.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { readSubscription, type SubscriptionState } from "./entitlements.ts"
import { type ProviderPrice, paymentProvider } from "./provider.ts"

/** Quién realiza la operación. La misma forma que el resto del servicio. */
export interface Actor {
  readonly userId: string
  readonly sessionId: string
  readonly asPlatformAdmin?: boolean | undefined
}

// ─── Catálogo de planes ──────────────────────────────────────────────────────

export interface PlanRecord {
  readonly id: string
  readonly tier: number
  readonly title: string
  readonly description: string
  readonly isIndividual: boolean
  readonly isRecommended: boolean
  /**
   * Lista de prestaciones. **Material descriptivo y nada más.**
   *
   * La spec le dedica un requisito entero: no se usa como control de acceso ni como límite
   * operativo, y superar un número que aparezca aquí no bloquea ninguna operación. Está escrito
   * para que nadie lo asuma al revés y construya encima.
   */
  readonly features: readonly unknown[]
  /** Vienen del procesador en cada consulta. La spec prohíbe guardarlos por duplicado. */
  readonly prices: readonly ProviderPrice[]
}

/**
 * El catálogo, con los precios vigentes del procesador.
 *
 * Los precios **no se guardan**: se piden. Una copia local se desincroniza en cuanto alguien cambia
 * una tarifa en el procesador, y la pantalla enseñaría un importe distinto del que se va a cobrar.
 *
 * Un plan sin producto en el procesador sale sin precios en lugar de romper la lista: es el caso
 * del plan gratuito, que no tiene nada que cobrar.
 */
export async function listPlans(): Promise<readonly PlanRecord[]> {
  const rows = await db
    .select()
    .from(subscriptionPlans)
    .where(isNull(subscriptionPlans.deletedAt))
    .orderBy(asc(subscriptionPlans.tier))

  const provider = paymentProvider()

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      tier: row.tier,
      title: row.title,
      description: row.description,
      isIndividual: row.isIndividual,
      isRecommended: row.isRecommended,
      features: row.features,
      prices: row.externalProductId ? await provider.listPrices(row.externalProductId) : [],
    })),
  )
}

/**
 * ¿Le queda a esta persona el plan gratuito?
 *
 * La spec pide poder consultarlo por separado —«obtiene una respuesta booleana»— para que la
 * pantalla pueda ofrecerlo o no, en lugar de ofrecerlo siempre y fallar al intentarlo.
 */
export async function freePlanAvailable(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: companySubscriptions.id })
    .from(companySubscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, companySubscriptions.planId))
    .where(
      and(
        eq(companySubscriptions.subscribedById, userId),
        eq(subscriptionPlans.tier, 0),
        ne(companySubscriptions.status, "canceled"),
      ),
    )
    .limit(1)

  return row === undefined
}

// ─── Contratación ────────────────────────────────────────────────────────────

export interface SubscribeInput {
  readonly planId: string
  readonly interval: BillingInterval
  readonly seats: number
  readonly promotionCode?: string | undefined
}

export type SubscribeResult =
  /** Plan de pago: hay que pasar por el procesador. */
  | { readonly kind: "checkout"; readonly url: string; readonly sessionId: string }
  /** Plan gratuito: no hay nada que cobrar, así que queda contratado en el acto. */
  | { readonly kind: "activada"; readonly subscription: SubscriptionState }

/**
 * Contrata un plan para una empresa.
 *
 * ## Por qué la fila no se crea aquí
 *
 * Para un plan de pago se devuelve la dirección de la sesión y **no se escribe nada**. Lo exige la
 * spec: «abandonar el pago no deja suscripción, y puede volver a intentarlo». Una fila en estado
 * incompleto creada al abrir la sesión chocaría con el índice único al segundo intento, y el
 * segundo intento es exactamente lo que la spec pide que funcione.
 *
 * La suscripción nace cuando llega el evento del procesador, que es el único momento en que consta
 * que alguien pagó. Ver `events.ts`.
 */
export async function subscribe(
  actor: Actor,
  companyId: string,
  input: SubscribeInput,
): Promise<SubscribeResult> {
  const existing = await readSubscription(companyId)
  if (existing) {
    throw new ConflictError(
      "Esta empresa ya tiene una suscripción. Para pasar a otro plan, cámbialo desde aquí.",
    )
  }

  const plan = await requirePlan(input.planId)

  if (plan.tier === 0) return subscribeToFreePlan(actor, companyId, plan, input)

  const price = await requirePrice(plan.externalProductId, input.interval)
  const discount = decideDiscount(input.seats, volumePolicy())

  // Un código escrito a mano por encima del umbral se descarta en lugar de acumularse: el descuento
  // por volumen ya está puesto, y sumarle otro sería conceder algo que nadie autorizó.
  const promotionCode = discount.allowsPromotionCode ? input.promotionCode : undefined

  const session = await paymentProvider().createCheckoutSession({
    companyId,
    priceId: price.id,
    seats: input.seats,
    allowsPromotionCode: discount.allowsPromotionCode,
    ...(promotionCode === undefined ? {} : { promotionCode }),
    successUrl: `${env.BILLING_RETURN_ORIGIN}/c/${companyId}/settings/plan`,
    cancelUrl: `${env.BILLING_RETURN_ORIGIN}/c/${companyId}/settings/plan`,
    metadata: {
      companyId,
      planId: plan.id,
      seats: String(input.seats),
      interval: input.interval,
      subscribedById: actor.userId,
      ...(discount.percent === null ? {} : { discountPercent: formatPercent(discount.percent) }),
      ...(promotionCode === undefined ? {} : { promotionCode }),
    },
  })

  return { kind: "checkout", url: session.url, sessionId: session.id }
}

/**
 * El plan gratuito, con sus dos restricciones.
 *
 * Un asiento como máximo, y una empresa por persona. No hay procesador de por medio: no hay nada
 * que cobrar, así que la suscripción queda activa en el acto y sin periodo — un plan gratuito no
 * vence.
 */
async function subscribeToFreePlan(
  actor: Actor,
  companyId: string,
  plan: { readonly id: string },
  input: SubscribeInput,
): Promise<SubscribeResult> {
  if (input.seats > 1) {
    throw new UnprocessableError("El plan gratuito admite un solo asiento")
  }

  if (!(await freePlanAvailable(actor.userId))) {
    throw new ConflictError("Ya dispones del plan gratuito en otra empresa")
  }

  const active = await activeMembers(companyId)
  if (active > 1) {
    throw new UnprocessableError(
      `El plan gratuito admite un solo asiento y esta empresa tiene ${active} miembros activos`,
    )
  }

  await withRequester(actor, async (tx) => {
    await tx.insert(companySubscriptions).values({
      id: newId(),
      companyId,
      planId: plan.id,
      subscribedById: actor.userId,
      status: "active",
      seats: 1,
      interval: input.interval,
    })
  })

  const subscription = await readSubscription(companyId)
  if (!subscription) throw new Error("la suscripción recién creada debería existir")

  return { kind: "activada", subscription }
}

// ─── Cambio de plan ──────────────────────────────────────────────────────────

export interface ChangePlanResult {
  readonly subscription: SubscriptionState
  /** Lo que el cambio cuesta ahora mismo, prorrateado. Negativo es saldo a favor. */
  readonly due: string
  readonly credit: string
  readonly charge: string
}

/**
 * Cambia de plan conservando los asientos.
 *
 * Los asientos **no se piden**: se conservan, que es lo que dice la spec. El importe se prorratea
 * por el tiempo que queda del periodo en curso, y el descuento aplicado sigue donde estaba — no se
 * recalcula ni se pierde.
 */
export async function changePlan(
  actor: Actor,
  companyId: string,
  input: { readonly planId: string; readonly interval?: BillingInterval | undefined },
): Promise<ChangePlanResult> {
  const current = await requireSubscription(companyId)
  if (current.planId === input.planId && input.interval === undefined) {
    throw new ConflictError("Esta empresa ya está en ese plan")
  }

  const plan = await requirePlan(input.planId)
  const interval = (input.interval ?? current.interval) as BillingInterval

  const currentPlan = await requirePlan(current.planId)
  const [currentPrice, nextPrice] = await Promise.all([
    optionalPrice(currentPlan.externalProductId, current.interval as BillingInterval),
    plan.tier === 0
      ? Promise.resolve(null)
      : requirePrice(plan.externalProductId, interval).then((price) => price),
  ])

  const quote = quoteChange(current, currentPrice, nextPrice)

  // El procesador es quien decide el periodo nuevo. Sin suscripción externa —el plan gratuito no la
  // tiene— no hay a quién preguntarle, y el cambio se aplica aquí y ahora.
  const snapshot = current.externalSubscriptionId
    ? await paymentProvider().changePlan(current.externalSubscriptionId, nextPrice?.id ?? "")
    : null

  await withRequester(actor, async (tx) => {
    await tx
      .update(companySubscriptions)
      .set({
        planId: plan.id,
        interval,
        ...(snapshot
          ? {
              externalPriceId: snapshot.externalPriceId,
              periodStart: snapshot.periodStart,
              periodEnd: snapshot.periodEnd,
            }
          : {}),
      })
      .where(eq(companySubscriptions.id, current.id))
  })

  const subscription = await readSubscription(companyId)
  if (!subscription) throw new Error("la suscripción debería seguir existiendo")

  return { subscription, ...quote }
}

/**
 * El importe del cambio, prorrateado.
 *
 * Sin periodo anotado —el plan gratuito no tiene— no hay tiempo restante que repartir y el
 * prorrateo es cero. No es un caso raro: es el camino de quien sube desde el plan gratuito.
 */
function quoteChange(
  current: SubscriptionState,
  currentPrice: ProviderPrice | null,
  nextPrice: ProviderPrice | null,
): { readonly due: string; readonly credit: string; readonly charge: string } {
  if (!current.periodStart || !current.periodEnd) {
    const charge = amountOf(nextPrice, current.seats)
    return { due: formatMoney(charge), credit: "0.00", charge: formatMoney(charge) }
  }

  const result = prorate({
    periodStart: current.periodStart,
    periodEnd: current.periodEnd,
    at: new Date(),
    currentUnitAmount: unitOf(currentPrice),
    currentSeats: current.seats,
    nextUnitAmount: unitOf(nextPrice),
    nextSeats: current.seats,
  })

  return {
    due: formatMoney(result.due),
    credit: formatMoney(result.credit),
    charge: formatMoney(result.charge),
  }
}

function unitOf(price: ProviderPrice | null): Money {
  return price === null ? (0n as Money) : (parseAmount(price.unitAmount) as Money)
}

function amountOf(price: ProviderPrice | null, seats: number): Money {
  return (unitOf(price) * BigInt(seats)) as Money
}

/** Una cadena decimal de dos posiciones a unidades mínimas, sin pasar por coma flotante. */
function parseAmount(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".")
  return BigInt(whole + fraction.padEnd(2, "0").slice(0, 2))
}

// ─── Cancelación y reactivación ──────────────────────────────────────────────

/**
 * Cancela al vencimiento, **no de inmediato**.
 *
 * La spec lo dice con esas palabras, y la razón es la que se ve en la pantalla: quien cancela un
 * día tres ya pagó hasta fin de mes, y cortarle el servicio ese mismo día le cobra un mes por tres
 * días. Mientras el periodo siga vigente, todo funciona.
 */
export async function cancelSubscription(
  actor: Actor,
  companyId: string,
): Promise<SubscriptionState> {
  const current = await requireSubscription(companyId)
  if (current.cancelAtPeriodEnd) {
    throw new ConflictError("Esta suscripción ya está marcada para terminar")
  }

  const snapshot = current.externalSubscriptionId
    ? await paymentProvider().cancelAtPeriodEnd(current.externalSubscriptionId)
    : null

  await withRequester(actor, async (tx) => {
    await tx
      .update(companySubscriptions)
      .set({
        cancelAtPeriodEnd: true,
        ...(snapshot ? { periodEnd: snapshot.periodEnd } : {}),
      })
      .where(eq(companySubscriptions.id, current.id))
  })

  return requireSubscription(companyId)
}

/** Deshace la cancelación mientras el periodo siga vigente. */
export async function reactivateSubscription(
  actor: Actor,
  companyId: string,
): Promise<SubscriptionState> {
  const current = await requireSubscription(companyId)
  if (!current.cancelAtPeriodEnd) {
    throw new ConflictError("Esta suscripción no está marcada para terminar")
  }

  if (!current.isOperating) {
    throw new UnprocessableError(
      "El periodo ya terminó, así que no hay cancelación que revertir. Contrata un plan de nuevo.",
    )
  }

  if (current.externalSubscriptionId) {
    await paymentProvider().resume(current.externalSubscriptionId)
  }

  await withRequester(actor, async (tx) => {
    await tx
      .update(companySubscriptions)
      .set({ cancelAtPeriodEnd: false })
      .where(eq(companySubscriptions.id, current.id))
  })

  return requireSubscription(companyId)
}

// ─── Asientos ────────────────────────────────────────────────────────────────

export interface SeatSync {
  readonly seats: number
  readonly activeMembers: number
  /** ¿Hubo que ampliar? Cuando no, no se genera cargo alguno. */
  readonly widened: boolean
  /** Lo que costó ampliar, prorrateado. Cadena decimal. */
  readonly due: string
}

/**
 * Los asientos siguen a los miembros activos.
 *
 * Se llama al incorporar y al retirar. Amplía **sólo cuando hace falta** —con asientos libres no se
 * amplía ni se cobra nada— y no reduce por su cuenta al retirar: el asiento queda libre para el
 * siguiente, que es lo que la spec pide con «retirar a un miembro libera su asiento». Reducir
 * además el contrato obligaría a devolver dinero que nadie pidió que se devolviera.
 *
 * **No toca el descuento.** Es la corrección M-07: lo que aquí se sincroniza es el número de
 * asientos, y el descuento vive en otra columna que esta función no menciona.
 */
export async function syncSeats(companyId: string): Promise<SeatSync | null> {
  const current = await readSubscription(companyId)
  if (!current) return null

  const active = await activeMembers(companyId)

  if (active <= current.seats) {
    return { seats: current.seats, activeMembers: active, widened: false, due: "0.00" }
  }

  const plan = await requirePlan(current.planId)
  const price = await optionalPrice(plan.externalProductId, current.interval as BillingInterval)

  const due =
    current.periodStart && current.periodEnd
      ? prorate({
          periodStart: current.periodStart,
          periodEnd: current.periodEnd,
          at: new Date(),
          currentUnitAmount: unitOf(price),
          currentSeats: current.seats,
          nextUnitAmount: unitOf(price),
          nextSeats: active,
        }).due
      : (0n as Money)

  if (current.externalSubscriptionId) {
    await paymentProvider().changeSeats(current.externalSubscriptionId, active)
  }

  await withSystem("sincronizar_asientos", [companyId], async (tx) => {
    await tx
      .update(companySubscriptions)
      .set({ seats: active })
      .where(eq(companySubscriptions.id, current.id))
  })

  return { seats: active, activeMembers: active, widened: true, due: formatMoney(due) }
}

async function activeMembers(companyId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.isActive, true)))

  return row?.total ?? 0
}

// ─── Historial de cobros ─────────────────────────────────────────────────────

export interface PaymentRecord {
  readonly id: string
  readonly amount: string
  readonly currency: string
  readonly seats: number
  readonly periodStart: Date | null
  readonly periodEnd: Date | null
  readonly succeeded: boolean
  readonly externalInvoiceId: string | null
  readonly createdAt: Date
}

/**
 * Qué se puede pedir del historial de cobros. Declaración cerrada, como todas.
 *
 * Sin búsqueda: un cobro no tiene texto que buscar, y declararla vacía es distinto de no
 * declararla — lo primero responde `400` a `?search=`, lo segundo lo ignoraría en silencio.
 */
export const paymentQuery: QuerySchema = {
  filters: {
    succeeded: { type: "boolean", label: "Resultado" },
    createdAt: { type: "date", range: true, label: "Fecha" },
  },
  searchable: [],
  sortable: ["createdAt"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
}

const paymentMapping = {
  fields: {
    succeeded: subscriptionPayments.succeeded,
    createdAt: subscriptionPayments.createdAt,
  },
  tiebreak: subscriptionPayments.id,
}

export async function listPayments(
  actor: Actor,
  companyId: string,
  query: ParsedQuery,
): Promise<Page<PaymentRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    const where = and(
      eq(subscriptionPayments.companyId, companyId),
      ...collectionConditions(query, paymentMapping),
    )

    const [total] = await tx.select({ value: count() }).from(subscriptionPayments).where(where)

    const rows = await tx
      .select()
      .from(subscriptionPayments)
      .where(where)
      .orderBy(...collectionOrder(query, paymentMapping))
      .limit(limit)
      .offset(offset)

    return buildPage(
      rows.map(
        (row): PaymentRecord => ({
          id: row.id,
          amount: row.amount,
          currency: row.currency,
          seats: row.seats,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          succeeded: row.succeeded,
          externalInvoiceId: row.externalInvoiceId,
          createdAt: row.createdAt,
        }),
      ),
      total?.value ?? 0,
      page,
      limit,
    )
  })
}

// ─── El periodo de gracia ────────────────────────────────────────────────────

/** Cuándo termina la gracia que se concede a partir de ahora. */
export function graceEndsAt(from: Date = new Date()): Date {
  const until = new Date(from)
  until.setUTCDate(until.getUTCDate() + env.BILLING_GRACE_DAYS)
  return until
}

/**
 * Las que agotaron la gracia pasan a impagada.
 *
 * Es la otra mitad de M-08: conceder gracia sin barrerla después dejaría a una empresa operando
 * indefinidamente sin pagar. Corre como trabajo de fondo y devuelve cuántas movió.
 */
export async function sweepExpiredGrace(now: Date = new Date()): Promise<number> {
  const stale = await db
    .select({ id: companySubscriptions.id, companyId: companySubscriptions.companyId })
    .from(companySubscriptions)
    .where(eq(companySubscriptions.status, "past_due"))

  const expired = await Promise.all(
    stale.map(async (row) => {
      const [full] = await db
        .select({ gracePeriodEndsAt: companySubscriptions.gracePeriodEndsAt })
        .from(companySubscriptions)
        .where(eq(companySubscriptions.id, row.id))
        .limit(1)

      const until = full?.gracePeriodEndsAt
      return until && until.getTime() <= now.getTime() ? row : null
    }),
  )

  const toUnpaid = expired.filter((row) => row !== null)
  if (toUnpaid.length === 0) return 0

  await withSystem(
    "vencer_gracia",
    toUnpaid.map((row) => row.companyId),
    async (tx) => {
      for (const row of toUnpaid) {
        await tx
          .update(companySubscriptions)
          .set({ status: "unpaid" })
          .where(eq(companySubscriptions.id, row.id))
      }
    },
  )

  return toUnpaid.length
}

// ─── Ayudas ──────────────────────────────────────────────────────────────────

function volumePolicy() {
  return {
    thresholdSeats: env.BILLING_VOLUME_SEATS,
    percent: percent(env.BILLING_VOLUME_PERCENT),
  }
}

interface PlanRow {
  readonly id: string
  readonly tier: number
  readonly title: string
  readonly externalProductId: string | null
}

async function requirePlan(planId: string): Promise<PlanRow> {
  const [row] = await db
    .select({
      id: subscriptionPlans.id,
      tier: subscriptionPlans.tier,
      title: subscriptionPlans.title,
      externalProductId: subscriptionPlans.externalProductId,
    })
    .from(subscriptionPlans)
    .where(and(eq(subscriptionPlans.id, planId), isNull(subscriptionPlans.deletedAt)))
    .limit(1)

  if (!row) throw new NotFoundError("Ese plan no existe")
  return row
}

async function requireSubscription(companyId: string): Promise<SubscriptionState> {
  const current = await readSubscription(companyId)
  if (!current) throw new NotFoundError("Esta empresa no tiene ninguna suscripción")
  return current
}

async function requirePrice(
  externalProductId: string | null,
  interval: BillingInterval,
): Promise<ProviderPrice> {
  const price = await optionalPrice(externalProductId, interval)
  if (!price) {
    throw new UnprocessableError(
      `Este plan no tiene precio para la periodicidad «${interval}» en el procesador de pagos`,
    )
  }
  return price
}

async function optionalPrice(
  externalProductId: string | null,
  interval: BillingInterval,
): Promise<ProviderPrice | null> {
  if (!externalProductId) return null
  const prices = await paymentProvider().listPrices(externalProductId)
  return prices.find((price) => price.interval === interval) ?? null
}

// ─── Escritura desde los eventos del procesador ──────────────────────────────

export interface ActivationInput {
  readonly companyId: string
  readonly planId: string
  readonly seats: number
  readonly interval: BillingInterval
  readonly status: SubscriptionStatus
  readonly subscribedById?: string | undefined
  readonly periodStart?: Date | undefined
  readonly periodEnd?: Date | undefined
  readonly discountPercent?: string | undefined
  readonly promotionCode?: string | undefined
  readonly externalSubscriptionId?: string | undefined
  readonly externalCustomerId?: string | undefined
  readonly externalPriceId?: string | undefined
}

/**
 * Deja la suscripción de una empresa en el estado que el procesador acaba de confirmar.
 *
 * Corre **dentro de la transacción del evento**: si algo falla después, se revierte también la
 * reclamación del evento y el procesador puede reintentarlo. Ver `payments/webhooks.ts`.
 *
 * Es idempotente por empresa: si ya hay una suscripción no cancelada, se actualiza en lugar de
 * insertar otra — el índice único no admitiría la segunda, y un reintento del procesador no debe
 * responder con error.
 */
export async function upsertSubscription(tx: Transaction, input: ActivationInput): Promise<void> {
  const [existing] = await tx
    .select({ id: companySubscriptions.id })
    .from(companySubscriptions)
    .where(
      and(
        eq(companySubscriptions.companyId, input.companyId),
        ne(companySubscriptions.status, "canceled"),
      ),
    )
    .limit(1)

  const values = {
    planId: input.planId,
    status: input.status,
    seats: input.seats,
    interval: input.interval,
    ...(input.periodStart === undefined ? {} : { periodStart: input.periodStart }),
    ...(input.periodEnd === undefined ? {} : { periodEnd: input.periodEnd }),
    ...(input.discountPercent === undefined ? {} : { discountPercent: input.discountPercent }),
    ...(input.promotionCode === undefined ? {} : { promotionCode: input.promotionCode }),
    ...(input.externalSubscriptionId === undefined
      ? {}
      : { externalSubscriptionId: input.externalSubscriptionId }),
    ...(input.externalCustomerId === undefined
      ? {}
      : { externalCustomerId: input.externalCustomerId }),
    ...(input.externalPriceId === undefined ? {} : { externalPriceId: input.externalPriceId }),
  }

  if (existing) {
    await tx
      .update(companySubscriptions)
      .set(values)
      .where(eq(companySubscriptions.id, existing.id))
    return
  }

  await tx.insert(companySubscriptions).values({
    id: newId(),
    companyId: input.companyId,
    ...(input.subscribedById === undefined ? {} : { subscribedById: input.subscribedById }),
    ...values,
  })
}
