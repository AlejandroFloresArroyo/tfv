/**
 * El suplente del procesador de pagos: su pantalla de cobro y sus eventos.
 *
 * Ver `openspec/specs/subscriptions-and-entitlements/spec.md` y `payment-webhooks/spec.md`.
 *
 * ## Por qué el suplente tiene pantalla propia
 *
 * Antes, `createCheckoutSession` devolvía **la dirección de vuelta** con la referencia de la sesión
 * pegada detrás. Eso dejaba una sola forma de completar el pago: que la pantalla de planes leyera
 * ese parámetro y activara la suscripción por su cuenta. Y esa vía **producción no la tiene**: allí
 * la suscripción nace de un evento firmado que el procesador manda a `/payments/events`, y el
 * navegador sólo vuelve a mirar el resultado.
 *
 * Construirla habría dejado dos caminos: uno que sólo existe en desarrollo, y el de verdad sin
 * ejercer nunca. Así que el suplente hace lo que hace el procesador: **tiene su propia página de
 * cobro**, y cuando alguien paga en ella, firma el evento y lo entrega por HTTP al mismo endpoint
 * público que atenderá al procesador real, con su firma, su ventana temporal y su unicidad.
 *
 * ## La pieza que hizo falta añadir, y por qué
 *
 * Un disparador explícito. Emitir el evento al abrir la sesión habría activado la suscripción sin
 * que nadie pulsara nada, y con eso se pierde el escenario que la spec pide poder recorrer:
 * «abandonar el pago no deja suscripción, y puede volver a intentarlo». Con página de por medio hay
 * dos salidas de verdad —pagar y abandonar—, que son las dos que el procesador ofrece.
 *
 * ## Dos eventos, no uno
 *
 * Igual que el procesador: `checkout.session.completed` hace nacer la suscripción, e `invoice.paid`
 * cobra el primer periodo. El primero **no trae periodo** —el de verdad tampoco—, así que sin el
 * segundo la pantalla no tendría fecha de renovación que enseñar ni habría un solo cobro en el
 * historial. Los dos llevan identificador estable derivado de la sesión: reintentar el pago —o
 * volver atrás en el navegador— entrega los mismos eventos, y la unicidad de `payment_events` los
 * reconoce en lugar de duplicar la suscripción.
 *
 * ## Lo que este archivo no es
 *
 * No es media integración con nadie. Todo lo que hay aquí desaparece el día que se conecte el
 * procesador real: las referencias llevan el prefijo `local_`, no se mueve dinero, y las rutas que
 * lo sirven responden `404` mientras no esté puesto (`PAYMENTS_PROVIDER=local`).
 */

import { createHmac } from "node:crypto"
import {
  applyPercent,
  formatMoney,
  type Money,
  money,
  multiply,
  percent,
  subtract,
  toMinorUnits,
} from "@tfv/contracts"
import type { BillingInterval } from "@tfv/contracts/billing"
import { db } from "@tfv/db"
import { subscriptionPlans } from "@tfv/db/schema"
import { eq } from "drizzle-orm"
import type { CheckoutRequest, CheckoutSession, SubscriptionSnapshot } from "../billing/provider.ts"
import { env } from "../env.ts"
import { webhookSecret } from "./webhooks.ts"

// ─── Precios ─────────────────────────────────────────────────────────────────

/**
 * Precio por asiento y periodo, derivado del nivel del plan.
 *
 * El nivel viaja dentro de la referencia del producto —`local_plan_<nivel>`— porque el suplente no
 * tiene catálogo propio que consultar.
 */
export function localUnitAmount(tier: number, interval: BillingInterval): Money {
  const perMonth = money(tier === 0 ? "0.00" : `${tier * 349}.00`)
  // El año sale a diez meses: es el descuento por permanencia que cualquier catálogo tiene, y
  // tenerlo hace visible en la pantalla que la periodicidad cambia el importe.
  return interval === "year" ? ((perMonth * 10n) as Money) : perMonth
}

/** El nivel y la periodicidad que lleva dentro una referencia de precio del suplente. */
function readPrice(priceId: string): { tier: number; interval: BillingInterval } {
  const [, , tier, interval] = priceId.split("_")
  return {
    tier: Number(tier) || 0,
    interval: interval === "year" || interval === "week" || interval === "day" ? interval : "month",
  }
}

/** Lo que se cobra por el periodo entero: precio por asiento, por asientos, menos el descuento. */
function periodAmount(checkout: LocalCheckout): Money {
  const { tier, interval } = readPrice(checkout.priceId)
  const gross = multiply(localUnitAmount(tier, interval), checkout.seats)

  const applied = checkout.metadata.discountPercent
  if (applied === undefined) return gross

  return subtract(gross, applyPercent(gross, percent(applied)))
}

// ─── Las sesiones que el suplente ha abierto ─────────────────────────────────

export interface LocalCheckout {
  readonly id: string
  readonly priceId: string
  readonly seats: number
  readonly successUrl: string
  readonly cancelUrl: string
  readonly metadata: Readonly<Record<string, string>>
  /** Nula mientras nadie haya pulsado pagar. */
  paidAt: Date | null
}

/**
 * En memoria, y a propósito.
 *
 * Una tabla para las sesiones de un procesador que no existe sería esquema que producción no
 * necesita. Lo que se pierde al reiniciar es una sesión de pago a medias, que es exactamente lo que
 * también se pierde cuando alguien cierra la pestaña.
 */
const checkouts = new Map<string, LocalCheckout>()

/** Abre una sesión y devuelve a dónde mandar al navegador: **la página del suplente**. */
export function openLocalCheckout(request: CheckoutRequest): CheckoutSession {
  const id = `local_cs_${request.companyId}_${Date.now().toString(36)}`

  checkouts.set(id, {
    id,
    priceId: request.priceId,
    seats: request.seats,
    successUrl: request.successUrl,
    cancelUrl: request.cancelUrl,
    metadata: { ...request.metadata },
    paidAt: null,
  })

  return { id, url: `${standInOrigin()}/payments/local/checkouts/${encodeURIComponent(id)}` }
}

export function readLocalCheckout(id: string): LocalCheckout | null {
  return checkouts.get(id) ?? null
}

/**
 * Dónde ve el navegador la página del suplente.
 *
 * Sale del origen al que la aplicación devuelve al usuario más el prefijo bajo el que el navegador
 * ve la API — los dos ya configurados, y los dos por el mismo motivo: el navegador habla con la API
 * a través de la aplicación, no con su puerto. Componerlo con `API_PORT` daría una dirección que
 * funciona en la máquina de quien desarrolla y en ninguna otra.
 */
function standInOrigin(): string {
  return `${env.BILLING_RETURN_ORIGIN}${env.COOKIE_PATH_PREFIX}`
}

// ─── Las suscripciones que el suplente ha emitido ────────────────────────────

interface LocalSubscription {
  priceId: string
  seats: number
  readonly periodStart: Date
  readonly periodEnd: Date
}

const subscriptions = new Map<string, LocalSubscription>()

/**
 * El periodo que corresponde a una periodicidad, contado desde ahora.
 *
 * Lo decide el suplente porque en el flujo real lo decide el procesador: es su calendario de
 * facturación, no el nuestro.
 */
function periodOf(interval: BillingInterval, from: Date): { start: Date; end: Date } {
  // Al segundo, sin milisegundos: las marcas de tiempo del procesador van en segundos, así que un
  // periodo con milisegundos deja de coincidir consigo mismo en cuanto viaja dentro de un evento —
  // y entonces cancelar parece mover el vencimiento medio segundo.
  const start = new Date(Math.floor(from.getTime() / 1000) * 1000)
  const end = new Date(start)
  if (interval === "year") end.setUTCFullYear(end.getUTCFullYear() + 1)
  else if (interval === "week") end.setUTCDate(end.getUTCDate() + 7)
  else if (interval === "day") end.setUTCDate(end.getUTCDate() + 1)
  else end.setUTCMonth(end.getUTCMonth() + 1)
  return { start, end }
}

/**
 * Lo que el suplente responde cuando se le pregunta por una suscripción suya.
 *
 * **Conserva el periodo.** Antes lo inventaba en cada respuesta, así que cancelar devolvía un
 * vencimiento posterior al real: la suscripción se alargaba justo al darla de baja, y con ella la
 * ventana en la que la empresa opera sin pagar. Ver `HALLAZGOS.md` H-164.
 *
 * De una suscripción que no recuerda —emitida antes de un reinicio— devuelve un periodo nuevo y lo
 * dice aquí: es lo mejor que puede hacer sin haber estado presente cuando nació.
 */
export function localSnapshot(
  externalSubscriptionId: string,
  changes: { priceId?: string | undefined; seats?: number | undefined } = {},
  now: Date = new Date(),
): SubscriptionSnapshot {
  const known = subscriptions.get(externalSubscriptionId)
  const fallbackPrice = changes.priceId ?? "local_price_0_month"
  const fresh = periodOf(readPrice(fallbackPrice).interval, now)

  const record: LocalSubscription = known ?? {
    priceId: fallbackPrice,
    seats: changes.seats ?? 1,
    periodStart: fresh.start,
    periodEnd: fresh.end,
  }

  if (changes.priceId !== undefined && changes.priceId !== "") record.priceId = changes.priceId
  if (changes.seats !== undefined) record.seats = changes.seats
  subscriptions.set(externalSubscriptionId, record)

  return {
    externalSubscriptionId,
    externalPriceId: record.priceId,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
  }
}

// ─── Pagar ───────────────────────────────────────────────────────────────────

/**
 * A dónde entrega el suplente sus eventos.
 *
 * Es este mismo servicio: el suplente vive dentro de él, pero **entra por la puerta de la calle**,
 * que es lo que hace que el camino que se ejerce sea el del procesador y no una llamada interna.
 *
 * Se puede sustituir —y por eso devuelve cómo deshacerlo, como el resto de las costuras de esta
 * casa— porque una prueba necesita apuntarlo a su propio servidor. Componerlo sólo de `API_PORT`
 * dejaría a una prueba entregando eventos contra el servicio de desarrollo de alguien.
 */
let deliveryOrigin: string | null = null

export function useLocalDeliveryOrigin(origin: string): () => void {
  const previous = deliveryOrigin
  deliveryOrigin = origin
  return () => {
    deliveryOrigin = previous
  }
}

function selfOrigin(): string {
  if (deliveryOrigin !== null) return deliveryOrigin
  // `0.0.0.0` y `::` son «todas las interfaces», no una dirección a la que se pueda llamar.
  const host = env.API_HOST === "0.0.0.0" || env.API_HOST === "::" ? "127.0.0.1" : env.API_HOST
  return `http://${host}:${env.API_PORT}`
}

/** No se pudo entregar el evento. Se distingue para que la página lo cuente en lugar de callarlo. */
export class LocalDeliveryFailed extends Error {
  constructor(type: string, detail: string) {
    super(`El suplente no pudo entregar «${type}»: ${detail}`)
  }
}

/**
 * Firma y entrega un evento contra `/payments/events`, como lo haría el procesador.
 *
 * La firma es la del procesador —`t=<segundos>,v1=<hexadecimal>` sobre `<segundos>.<cuerpo>`— y se
 * calcula sobre **el texto que se envía**, no sobre el objeto: cualquier otra cosa firmaría algo
 * distinto de lo que se va a verificar.
 */
async function deliver(event: {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}): Promise<void> {
  const secret = webhookSecret()
  if (secret === undefined) {
    throw new LocalDeliveryFailed(event.type, "no hay secreto con el que firmar")
  }

  const body = JSON.stringify(event)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")

  const response = await fetch(`${selfOrigin()}/payments/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
    body,
  })

  if (!response.ok) {
    throw new LocalDeliveryFailed(event.type, `${response.status} ${await response.text()}`)
  }
}

/**
 * Alguien pulsó pagar: nacen la suscripción y su primer cobro, por la vía de siempre.
 *
 * Los dos eventos van **en orden y esperando cada uno**: el del cobro busca la suscripción por su
 * referencia externa, que la escribe el primero. Entregarlos a la vez dejaría el cobro sin
 * suscripción a la que atribuirse una de cada dos veces.
 *
 * Devuelve a dónde mandar al navegador, que es la dirección de vuelta que la aplicación declaró al
 * abrir la sesión.
 */
export async function payLocalCheckout(id: string): Promise<string> {
  const checkout = checkouts.get(id)
  if (!checkout) throw new Error(`sesión desconocida: ${id}`)

  const subscriptionId = `local_sub_${checkout.id}`
  const { interval } = readPrice(checkout.priceId)
  const now = new Date()
  // Si la sesión ya se pagó, el periodo es el que se emitió entonces: reintentar no lo mueve.
  const emitida = subscriptions.get(subscriptionId)
  const { start, end } = emitida
    ? { start: emitida.periodStart, end: emitida.periodEnd }
    : periodOf(interval, now)

  subscriptions.set(subscriptionId, {
    priceId: checkout.priceId,
    seats: checkout.seats,
    periodStart: start,
    periodEnd: end,
  })

  await deliver({
    // Identificador estable: reintentar entrega el mismo evento, y la unicidad lo reconoce.
    id: `local_evt_${checkout.id}_completed`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: checkout.id,
        object: "checkout.session",
        subscription: subscriptionId,
        customer: `local_cus_${checkout.metadata.companyId ?? "desconocido"}`,
        metadata: checkout.metadata,
      },
    },
  })

  await deliver({
    id: `local_evt_${checkout.id}_invoice`,
    type: "invoice.paid",
    data: {
      object: {
        id: `local_in_${checkout.id}`,
        subscription: subscriptionId,
        amount_paid: toMinorUnits(periodAmount(checkout)),
        amount_due: toMinorUnits(periodAmount(checkout)),
        currency: "mxn",
        quantity: checkout.seats,
        period_start: Math.floor(start.getTime() / 1000),
        period_end: Math.floor(end.getTime() / 1000),
        payment_intent: `local_pi_${checkout.id}`,
        ...(checkout.metadata.companyId === undefined
          ? {}
          : { metadata: { companyId: checkout.metadata.companyId } }),
      },
    },
  })

  checkout.paidAt = now
  return checkout.successUrl
}

// ─── La página ───────────────────────────────────────────────────────────────

export interface CheckoutView {
  readonly id: string
  readonly planTitle: string
  readonly seats: number
  readonly interval: BillingInterval
  readonly unitAmount: string
  readonly total: string
  readonly discountPercent: string | null
  /**
   * A dónde envía el formulario de pagar, **absoluta**.
   *
   * No relativa: el navegador ve esta página bajo el prefijo con el que la aplicación reenvía a la
   * API, y una dirección que empiece por `/` saldría del reenvío y acabaría en la aplicación.
   */
  readonly payUrl: string
  readonly cancelUrl: string
  readonly paid: boolean
}

/**
 * Lo que la página del suplente enseña.
 *
 * El título del plan se lee de la base porque el procesador **sí sabe** cómo se llama lo que está
 * cobrando —lo tiene dado de alta como producto— y el suplente no tiene catálogo propio. Es lectura
 * y sólo para pintar: nada de lo que decide el cobro sale de aquí.
 */
export async function localCheckoutView(id: string): Promise<CheckoutView | null> {
  const checkout = checkouts.get(id)
  if (!checkout) return null

  const { tier, interval } = readPrice(checkout.priceId)
  const planId = checkout.metadata.planId

  const [plan] = planId
    ? await db
        .select({ title: subscriptionPlans.title })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId))
        .limit(1)
    : []

  return {
    id: checkout.id,
    planTitle: plan?.title ?? "Plan",
    seats: checkout.seats,
    interval,
    unitAmount: formatMoney(localUnitAmount(tier, interval)),
    total: formatMoney(periodAmount(checkout)),
    discountPercent: checkout.metadata.discountPercent ?? null,
    payUrl: `${standInOrigin()}/payments/local/checkouts/${encodeURIComponent(checkout.id)}/pay`,
    cancelUrl: checkout.cancelUrl,
    paid: checkout.paidAt !== null,
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

const INTERVALS: Readonly<Record<string, string>> = {
  day: "día",
  week: "semana",
  month: "mes",
  year: "año",
}

/**
 * La página de cobro del suplente.
 *
 * Deliberadamente fea y deliberadamente explícita: quien la ve tiene que saber en el acto que no
 * está pagando nada. Es HTML suelto, sin nada de la aplicación, porque **no es una pantalla del
 * producto**: es la del procesador, y el día que haya uno de verdad esta página se borra entera.
 */
export function renderCheckoutPage(view: CheckoutView): string {
  const periodo = INTERVALS[view.interval] ?? view.interval

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Procesador de pagos suplente</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 2rem 1rem; background: #f5f5f4;
         color: #1c1917; display: flex; justify-content: center; }
  main { background: #fff; border: 2px dashed #a8a29e; border-radius: 12px; max-width: 30rem;
         width: 100%; padding: 1.5rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
  .aviso { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: .75rem;
           margin: 0 0 1.25rem; font-size: .875rem; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: .35rem 1rem; margin: 0 0 1.5rem; }
  dt { color: #57534e; } dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
  .total { font-weight: 700; font-size: 1.125rem; }
  .acciones { display: flex; gap: .75rem; align-items: center; }
  button { font: inherit; padding: .6rem 1.1rem; border-radius: 8px; border: 0; cursor: pointer;
           background: #15803d; color: #fff; font-weight: 600; }
  a { font: inherit; color: #57534e; }
</style>
</head>
<body>
<main>
  <h1>Procesador de pagos suplente</h1>
  <p class="aviso">Esto <strong>no cobra nada</strong>. Está aquí para que el ciclo de contratación
  se pueda recorrer entero sin una cuenta del procesador: al pagar se emite el mismo evento firmado
  que emitiría el procesador de verdad.</p>

  <dl>
    <dt>Plan</dt><dd>${escapeHtml(view.planTitle)}</dd>
    <dt>Asientos</dt><dd>${view.seats}</dd>
    <dt>Por asiento y ${escapeHtml(periodo)}</dt><dd>${escapeHtml(view.unitAmount)} MXN</dd>
    ${view.discountPercent === null ? "" : `<dt>Descuento</dt><dd>${escapeHtml(view.discountPercent)} %</dd>`}
    <dt class="total">Total</dt><dd class="total">${escapeHtml(view.total)} MXN</dd>
  </dl>

  <form method="post" action="${escapeHtml(view.payUrl)}" class="acciones">
    <button type="submit">Pagar ${escapeHtml(view.total)} MXN</button>
    <a href="${escapeHtml(view.cancelUrl)}">Cancelar y volver</a>
  </form>
</main>
</body>
</html>`
}
