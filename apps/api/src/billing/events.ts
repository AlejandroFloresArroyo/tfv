/**
 * Qué hace el sistema con cada evento del procesador de pagos.
 *
 * Ver `openspec/specs/payment-webhooks/spec.md` y `subscriptions-and-entitlements/spec.md`.
 *
 * La rebanada 07 dejó **la recepción verificada** —firma, ventana temporal, unicidad y
 * transaccionalidad— con la tabla de manejadores vacía y un comentario explicando que lo que
 * faltaba era esto: sobre qué actuar. Esto es eso.
 *
 * ## Lo que cada manejador puede dar por hecho
 *
 * Que el evento es legítimo, que es la primera vez que se atiende, y que corre dentro de una
 * transacción que **se revierte entera** si algo falla — incluida la reclamación del evento, de modo
 * que el reintento del procesador pueda volver a tomarlo. Nada de eso hay que comprobarlo aquí.
 *
 * ## Lo que un manejador no debe hacer
 *
 * Llamar al procesador. Está atendiendo lo que el procesador acaba de contar; volver a preguntarle
 * dentro de la transacción la alarga con una llamada de red que puede tardar o fallar, y el fallo
 * revertiría un evento que era correcto.
 *
 * ## La forma de la carga
 *
 * La del procesador: `data.object`. Se lee con cuidado y campo a campo —`readString`, `readDate`—
 * porque viene de fuera: un campo que falte o venga con otro tipo no debe reventar la transacción
 * con un error de programación, sino quedar como lo que es, un evento que no se pudo interpretar.
 */

import { formatMoney, type Money, newId } from "@tfv/contracts"
import type { BillingInterval, SubscriptionStatus } from "@tfv/contracts/billing"
import { SUBSCRIPTION_STATUSES } from "@tfv/contracts/billing"
import type { Transaction } from "@tfv/db"
import { companySubscriptions, merchantProfiles, subscriptionPayments } from "@tfv/db/schema"
import { and, eq, ne } from "drizzle-orm"
import { rootLogger } from "../runtime/logger.ts"
import { graceEndsAt, upsertSubscription } from "./subscriptions.ts"

export interface PaymentEvent {
  readonly id: string
  readonly type: string
  readonly data: Record<string, unknown>
}

type Handler = (tx: Transaction, event: PaymentEvent) => Promise<void>

// ─── Lectura defensiva de la carga ───────────────────────────────────────────

function object(event: PaymentEvent): Record<string, unknown> {
  const value = event.data.object
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function readBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
  const value = source[key]
  return typeof value === "boolean" ? value : undefined
}

/** Las marcas de tiempo del procesador vienen en segundos, no en milisegundos. */
function readDate(source: Record<string, unknown>, key: string): Date | undefined {
  const value = readNumber(source, key)
  return value === undefined ? undefined : new Date(value * 1000)
}

function readObject(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key]
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
}

/** Importe en unidades mínimas → cadena decimal. Nunca pasa por coma flotante. */
function readAmount(source: Record<string, unknown>, key: string): string {
  const minor = readNumber(source, key)
  return minor === undefined ? "0.00" : formatMoney(BigInt(Math.round(minor)) as Money)
}

function readStatus(source: Record<string, unknown>): SubscriptionStatus | undefined {
  const value = readString(source, "status")
  return value !== undefined && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
    ? (value as SubscriptionStatus)
    : undefined
}

function readInterval(source: Record<string, unknown>): BillingInterval {
  const value = readString(source, "interval")
  return value === "day" || value === "week" || value === "year" ? value : "month"
}

/**
 * La suscripción de la empresa que el evento nombra.
 *
 * Se busca por la referencia externa, que es lo único que el procesador conoce. Devolver nulo es un
 * resultado válido: un evento de una suscripción que aquí no existe —de otro entorno, de una prueba
 * del procesador— no es un fallo, y tratarlo como tal provocaría reintentos eternos.
 */
async function subscriptionByExternal(
  tx: Transaction,
  externalId: string,
): Promise<{ id: string; companyId: string; seats: number } | null> {
  const [row] = await tx
    .select({
      id: companySubscriptions.id,
      companyId: companySubscriptions.companyId,
      seats: companySubscriptions.seats,
    })
    .from(companySubscriptions)
    .where(eq(companySubscriptions.externalSubscriptionId, externalId))
    .limit(1)

  return row ?? null
}

// ─── Contratación completada ─────────────────────────────────────────────────

/**
 * La sesión de pago se completó: aquí nace la suscripción.
 *
 * **No nace antes.** `subscribe()` devuelve la dirección de pago y no escribe nada, porque
 * «abandonar el pago no deja suscripción» y hay que poder volver a intentarlo. Este es el único
 * momento en el que consta que alguien pagó.
 *
 * Lo que la sesión no lleva en sus propios campos viaja en `metadata`, que es donde se puso al
 * abrirla: qué empresa, qué plan, cuántos asientos y qué descuento se aplicó. Sin empresa no hay
 * nada que hacer y se deja constancia en lugar de fallar — fallar haría reintentar un evento que no
 * va a mejorar.
 */
const onCheckoutCompleted: Handler = async (tx, event) => {
  const session = object(event)
  const metadata = readObject(session, "metadata")

  const companyId = readString(metadata, "companyId")
  const planId = readString(metadata, "planId")

  if (!companyId || !planId) {
    rootLogger.warn("sesión de pago completada sin empresa ni plan", { event: event.id })
    return
  }

  await upsertSubscription(tx, {
    companyId,
    planId,
    seats: readNumber(metadata, "seats") ?? 1,
    interval: readInterval(metadata),
    status: "active",
    ...(readString(metadata, "subscribedById") === undefined
      ? {}
      : { subscribedById: readString(metadata, "subscribedById") }),
    ...(readString(metadata, "discountPercent") === undefined
      ? {}
      : { discountPercent: readString(metadata, "discountPercent") }),
    ...(readString(metadata, "promotionCode") === undefined
      ? {}
      : { promotionCode: readString(metadata, "promotionCode") }),
    ...(readString(session, "subscription") === undefined
      ? {}
      : { externalSubscriptionId: readString(session, "subscription") }),
    ...(readString(session, "customer") === undefined
      ? {}
      : { externalCustomerId: readString(session, "customer") }),
  })
}

// ─── Cobro de un periodo ─────────────────────────────────────────────────────

/**
 * Un periodo se cobró correctamente.
 *
 * Deja el registro que la spec pide —importe, moneda, periodo, asientos y resultado— y **restablece
 * la suscripción**: un reintento que cobra devuelve la empresa a activa y borra el plazo de gracia,
 * que es el escenario «un cobro posterior restablece».
 *
 * El registro se escribe aunque la suscripción no se encuentre: el cobro ocurrió, y perder su
 * constancia porque falte la fila de enlace sería perder dinero de vista.
 */
const onInvoicePaid: Handler = async (tx, event) => {
  const invoice = object(event)
  const externalId = readString(invoice, "subscription")
  const subscription = externalId ? await subscriptionByExternal(tx, externalId) : null

  const companyId =
    subscription?.companyId ?? readString(readObject(invoice, "metadata"), "companyId")
  if (!companyId) {
    rootLogger.warn("cobro sin empresa a la que atribuirlo", { event: event.id })
    return
  }

  const periodStart = readDate(invoice, "period_start")
  const periodEnd = readDate(invoice, "period_end")

  await tx
    .insert(subscriptionPayments)
    .values({
      id: newId(),
      companyId,
      ...(subscription ? { subscriptionId: subscription.id } : {}),
      amount: readAmount(invoice, "amount_paid"),
      currency: (readString(invoice, "currency") ?? "MXN").toUpperCase().slice(0, 3),
      seats: readNumber(invoice, "quantity") ?? subscription?.seats ?? 1,
      ...(periodStart === undefined ? {} : { periodStart }),
      ...(periodEnd === undefined ? {} : { periodEnd }),
      succeeded: true,
      ...(readString(invoice, "id") === undefined
        ? {}
        : { externalInvoiceId: readString(invoice, "id") }),
      ...(readString(invoice, "payment_intent") === undefined
        ? {}
        : { externalPaymentIntentId: readString(invoice, "payment_intent") }),
    })
    // El identificador de factura es único: un reintento del procesador con el mismo cobro no
    // duplica el asiento. Es la misma defensa que la unicidad del evento, una capa más abajo.
    .onConflictDoNothing({ target: subscriptionPayments.externalInvoiceId })

  if (!subscription) return

  await tx
    .update(companySubscriptions)
    .set({
      status: "active",
      gracePeriodEndsAt: null,
      ...(periodStart === undefined ? {} : { periodStart }),
      ...(periodEnd === undefined ? {} : { periodEnd }),
    })
    .where(eq(companySubscriptions.id, subscription.id))
}

/**
 * Falló el cobro de un periodo: **gracia, no borrado**.
 *
 * Es la corrección M-08 completa. La pila anterior eliminaba la suscripción ante el primer rechazo
 * de tarjeta, lo que dejaba a la empresa fuera de servicio y tumbaba sus tiendas públicas por algo
 * que en la mayoría de los casos se arregla solo al segundo intento.
 *
 * Aquí la suscripción **sigue existiendo**, pasa a pago pendiente y conserva sus funciones durante
 * el plazo de gracia. Quien lo cierra es `sweepExpiredGrace()`, no esto.
 */
const onInvoiceFailed: Handler = async (tx, event) => {
  const invoice = object(event)
  const externalId = readString(invoice, "subscription")
  const subscription = externalId ? await subscriptionByExternal(tx, externalId) : null

  const companyId =
    subscription?.companyId ?? readString(readObject(invoice, "metadata"), "companyId")
  if (!companyId) {
    rootLogger.warn("fallo de cobro sin empresa a la que atribuirlo", { event: event.id })
    return
  }

  const periodStart = readDate(invoice, "period_start")
  const periodEnd = readDate(invoice, "period_end")

  await tx
    .insert(subscriptionPayments)
    .values({
      id: newId(),
      companyId,
      ...(subscription ? { subscriptionId: subscription.id } : {}),
      // Lo que se debía, no lo que se pagó: en un fallo lo segundo es cero y no dice nada.
      amount: readAmount(invoice, "amount_due"),
      currency: (readString(invoice, "currency") ?? "MXN").toUpperCase().slice(0, 3),
      seats: readNumber(invoice, "quantity") ?? subscription?.seats ?? 1,
      ...(periodStart === undefined ? {} : { periodStart }),
      ...(periodEnd === undefined ? {} : { periodEnd }),
      succeeded: false,
      ...(readString(invoice, "id") === undefined
        ? {}
        : { externalInvoiceId: readString(invoice, "id") }),
    })
    .onConflictDoNothing({ target: subscriptionPayments.externalInvoiceId })

  if (!subscription) return

  await tx
    .update(companySubscriptions)
    .set({ status: "past_due", gracePeriodEndsAt: graceEndsAt() })
    .where(
      and(
        eq(companySubscriptions.id, subscription.id),
        // Una suscripción ya cancelada no vuelve a pago pendiente por un cobro rezagado.
        ne(companySubscriptions.status, "canceled"),
      ),
    )
}

// ─── Estado de la suscripción en el procesador ───────────────────────────────

/**
 * El procesador cambió la suscripción: se refleja aquí.
 *
 * Se copian estado, marca de cancelación, periodo, asientos y precio. **El descuento no se toca**:
 * es la corrección M-07 en su punto más peligroso, porque este manejador corre en cada renovación y
 * es exactamente donde la pila anterior lo borraba.
 */
const onSubscriptionUpdated: Handler = async (tx, event) => {
  const remote = object(event)
  const externalId = readString(remote, "id")
  if (!externalId) return

  const subscription = await subscriptionByExternal(tx, externalId)
  if (!subscription) {
    rootLogger.info("suscripción del procesador que aquí no existe", { external: externalId })
    return
  }

  const status = readStatus(remote)
  const periodStart = readDate(remote, "current_period_start")
  const periodEnd = readDate(remote, "current_period_end")
  const seats = readNumber(remote, "quantity")
  const cancelAtPeriodEnd = readBoolean(remote, "cancel_at_period_end")

  await tx
    .update(companySubscriptions)
    .set({
      ...(status === undefined ? {} : { status }),
      ...(cancelAtPeriodEnd === undefined ? {} : { cancelAtPeriodEnd }),
      ...(periodStart === undefined ? {} : { periodStart }),
      ...(periodEnd === undefined ? {} : { periodEnd }),
      ...(seats === undefined ? {} : { seats }),
      // Volver a activa cierra la gracia; cualquier otro estado la deja como esté.
      ...(status === "active" ? { gracePeriodEndsAt: null } : {}),
    })
    .where(eq(companySubscriptions.id, subscription.id))
}

/** La suscripción terminó en el procesador. Aquí queda cancelada, y la empresa deja de operar. */
const onSubscriptionDeleted: Handler = async (tx, event) => {
  const remote = object(event)
  const externalId = readString(remote, "id")
  if (!externalId) return

  const subscription = await subscriptionByExternal(tx, externalId)
  if (!subscription) return

  await tx
    .update(companySubscriptions)
    .set({ status: "canceled", cancelAtPeriodEnd: false, gracePeriodEndsAt: null })
    .where(eq(companySubscriptions.id, subscription.id))
}

// ─── Cuenta de comercio ──────────────────────────────────────────────────────

/**
 * El procesador cambió la cuenta de comercio de una empresa.
 *
 * La regla es la de `merchant-onboarding`: **activo cuando puede aceptar cargos y no queda
 * documentación pendiente**; limitado cuando falta algo. Y el estado de verificación es una cosa
 * distinta del estado del perfil, así que se guardan por separado — un perfil puede aceptar cargos
 * con documentación pendiente, que es el caso normal recién dado de alta.
 */
const onAccountUpdated: Handler = async (tx, event) => {
  const account = object(event)
  const accountId = readString(account, "id")
  if (!accountId) return

  const [profile] = await tx
    .select({ id: merchantProfiles.id })
    .from(merchantProfiles)
    .where(eq(merchantProfiles.externalAccountId, accountId))
    .limit(1)

  if (!profile) return

  const canAcceptCharges = readBoolean(account, "charges_enabled") ?? false
  const canReceivePayouts = readBoolean(account, "payouts_enabled") ?? false

  const requirements = readObject(account, "requirements")
  const due = requirements.currently_due
  const pending = Array.isArray(due) ? due.length > 0 : false

  await tx
    .update(merchantProfiles)
    .set({
      canAcceptCharges,
      canReceivePayouts,
      status: canAcceptCharges && !pending ? "active" : "limited",
      verificationStatus: pending ? "pending" : "verified",
    })
    .where(eq(merchantProfiles.id, profile.id))
}

// ─── La tabla ────────────────────────────────────────────────────────────────

/**
 * Qué tipo atiende qué.
 *
 * Un tipo que no esté aquí cae en «sin manejador»: se responde con éxito y queda constancia, que es
 * lo que la spec pide y lo que evita que el procesador reintente hasta desactivar el endpoint.
 *
 * **Falta el cobro en tienda pública** —`payment_intent.*`, `charge.refunded`, `charge.dispute.*`—,
 * que alimenta `merchant_payments`. Es de la rebanada 18, que es quien crea las sesiones de pago del
 * comprador; sin ellas no hay nada que estos eventos puedan nombrar. Anotado en H-88.
 */
export const BILLING_HANDLERS: Readonly<Record<string, Handler>> = {
  "checkout.session.completed": onCheckoutCompleted,
  "invoice.paid": onInvoicePaid,
  "invoice.payment_succeeded": onInvoicePaid,
  "invoice.payment_failed": onInvoiceFailed,
  "customer.subscription.updated": onSubscriptionUpdated,
  "customer.subscription.deleted": onSubscriptionDeleted,
  "account.updated": onAccountUpdated,
}
