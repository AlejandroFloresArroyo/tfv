/**
 * La costura con el procesador de pagos.
 *
 * Ver `openspec/specs/subscriptions-and-entitlements/spec.md` y `merchant-onboarding/spec.md`.
 *
 * ## Por qué hay una costura y no una integración
 *
 * Cobrar de verdad exige una cuenta del procesador, sus claves y sus productos dados de alta —
 * configuración externa que este entorno no tiene. Se puede hacer una de dos cosas: media
 * integración real que nadie puede ejecutar, o **el ciclo entero contra una interfaz**, con la
 * implementación real detrás el día que haya credenciales.
 *
 * Aquí está lo segundo. Todo lo que el dominio necesita del procesador pasa por `PaymentProvider`,
 * y el dominio no sabe cuál hay puesto. Lo que se prueba es el ciclo completo —contratar, cambiar,
 * cancelar, reactivar, ampliar asientos, dar de alta un comercio y verificarlo—, incluido lo que
 * pasa **cuando el procesador falla**, que es la mitad que se suele dejar sin probar.
 *
 * ## Tres implementaciones, y para qué es cada una
 *
 * | Cuál | Cuándo | Qué hace |
 * |---|---|---|
 * | `unconfiguredProvider` | por defecto | Falla con un mensaje que dice exactamente qué falta |
 * | `localProvider` | `PAYMENTS_PROVIDER=local` | Suplente en memoria, para ejercer las pantallas |
 * | (real) | cuando haya credenciales | Pendiente. Ver `HALLAZGOS.md` H-85 |
 *
 * **El valor por defecto es el que falla.** Un suplente por defecto sería la misma clase de error
 * que el secreto de firma con valor `"secret"` (`DEFECTS.md` S-13): algo que parece funcionar en
 * producción y no está haciendo nada.
 */

import { DomainError } from "@tfv/contracts"
import type { BillingInterval } from "@tfv/contracts/billing"
import { localPrices, localSnapshot, openLocalCheckout } from "../payments/local-processor.ts"

// ─── Lo que el dominio necesita saber ────────────────────────────────────────

export interface ProviderPrice {
  /** Referencia del precio en el procesador. Es lo que se guarda, no el importe. */
  readonly id: string
  readonly interval: BillingInterval
  readonly intervalCount: number
  /** Por asiento y periodo. Cadena decimal: el importe nunca pasa por coma flotante. */
  readonly unitAmount: string
  readonly currency: string
}

export interface CheckoutSession {
  readonly id: string
  /** La dirección a la que redirigir. Es lo único que el navegador recibe. */
  readonly url: string
}

export interface SubscriptionSnapshot {
  readonly externalSubscriptionId: string
  readonly externalPriceId: string
  readonly periodStart: Date
  readonly periodEnd: Date
}

export interface ConnectedAccount {
  readonly id: string
  readonly canAcceptCharges: boolean
  readonly canReceivePayouts: boolean
  /** Queda documentación por entregar. Mientras sea cierto, el perfil no pasa a activo. */
  readonly requirementsPending: boolean
}

export interface CheckoutRequest {
  readonly companyId: string
  readonly priceId: string
  readonly seats: number
  /** Descuento por volumen ya resuelto, como referencia del procesador. */
  readonly discountId?: string | undefined
  /** Sólo por debajo del umbral de volumen. */
  readonly allowsPromotionCode: boolean
  readonly promotionCode?: string | undefined
  readonly successUrl: string
  readonly cancelUrl: string
  /**
   * Lo que hay que poder reconstruir cuando el evento vuelva.
   *
   * El procesador lo devuelve tal cual en `checkout.session.completed`, y es la única vía por la que
   * el manejador sabe de qué empresa y de qué plan hablaba la sesión: el evento llega sin sesión de
   * usuario y sin nada más que lo que se puso aquí. Ver `events.ts`.
   */
  readonly metadata: Readonly<Record<string, string>>
}

export interface AccountRequest {
  readonly companyId: string
  readonly legalName: string
  readonly taxId: string
  readonly email?: string | undefined
  readonly clabe: string
  readonly currency: string
  readonly country: string
  readonly holder: string
  /** Instante y origen de la aceptación de términos, que el procesador exige registrar. */
  readonly termsAcceptedAt: Date
  readonly termsAcceptedIp: string
}

/**
 * Todo lo que el dominio le pide al procesador.
 *
 * Es deliberadamente estrecha: cada método existe porque un requisito lo nombra. Lo que no está
 * aquí es que el dominio no lo necesita, y añadirlo «por si acaso» ampliaría la superficie que hay
 * que reimplementar el día que se conecte el procesador real.
 */
export interface PaymentProvider {
  readonly name: string

  /** Los precios vigentes de un producto. La spec prohíbe guardarlos por duplicado. */
  listPrices(externalProductId: string): Promise<readonly ProviderPrice[]>

  /** La sesión de pago a la que se redirige para contratar. */
  createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession>

  /** Cambio de plan con prorrateo. Conserva los asientos y el descuento. */
  changePlan(externalSubscriptionId: string, priceId: string): Promise<SubscriptionSnapshot>

  /** Ampliación o reducción de asientos, con prorrateo. */
  changeSeats(externalSubscriptionId: string, seats: number): Promise<SubscriptionSnapshot>

  /** Marcar para terminar al vencimiento. No corta el servicio de inmediato. */
  cancelAtPeriodEnd(externalSubscriptionId: string): Promise<SubscriptionSnapshot>

  /** Deshacer la cancelación mientras el periodo siga vigente. */
  resume(externalSubscriptionId: string): Promise<SubscriptionSnapshot>

  createConnectedAccount(request: AccountRequest): Promise<ConnectedAccount>
  updateConnectedAccount(accountId: string, request: AccountRequest): Promise<ConnectedAccount>
  deleteConnectedAccount(accountId: string): Promise<void>

  /** Enlace de un solo uso al formulario de documentación del procesador. */
  createAccountLink(input: {
    readonly accountId: string
    readonly returnUrl: string
    readonly refreshUrl: string
  }): Promise<{ readonly url: string }>
}

// ─── Cuando no hay procesador ────────────────────────────────────────────────

/**
 * No hay procesador configurado.
 *
 * Es `422` y no `500` a propósito: la petición está bien formada y el servicio está sano; lo que
 * falta es configuración del entorno, y quien la lee necesita saber **qué** falta. Un `500` con
 * mensaje genérico —que es lo que sale en producción— dejaría a quien lo monta adivinando.
 */
export class PaymentProviderUnavailableError extends DomainError {
  readonly status = 422 as const
  readonly code = "payment_provider_unavailable"

  constructor(operation: string) {
    super(
      "No hay procesador de pagos configurado, así que no se puede " +
        `${operation}. Define PAYMENTS_PROVIDER y las credenciales del procesador.`,
      { operation },
    )
  }
}

function unavailable(operation: string): never {
  throw new PaymentProviderUnavailableError(operation)
}

/**
 * El de por defecto: falla en todo, y dice por qué.
 *
 * `listPrices` falla como los demás. Devolver una lista vacía sería más cómodo —el catálogo de
 * planes se pintaría igual, sin precios— y sería exactamente la clase de silencio que hace que un
 * despliegue mal configurado parezca sano.
 */
export const unconfiguredProvider: PaymentProvider = {
  name: "sin-configurar",
  listPrices: () => unavailable("consultar los precios"),
  createCheckoutSession: () => unavailable("abrir una sesión de pago"),
  changePlan: () => unavailable("cambiar de plan"),
  changeSeats: () => unavailable("ajustar los asientos"),
  cancelAtPeriodEnd: () => unavailable("cancelar la suscripción"),
  resume: () => unavailable("reactivar la suscripción"),
  createConnectedAccount: () => unavailable("dar de alta la cuenta de comercio"),
  updateConnectedAccount: () => unavailable("actualizar la cuenta de comercio"),
  deleteConnectedAccount: () => unavailable("dar de baja la cuenta de comercio"),
  createAccountLink: () => unavailable("generar el enlace de verificación"),
}

// ─── El suplente local ───────────────────────────────────────────────────────

/**
 * Suplente en memoria, para poder ejercer el ciclo entero sin cuenta del procesador.
 *
 * **No mueve dinero y no lo disimula**: las referencias que emite llevan el prefijo `local_` y su
 * página de cobro lo dice en la primera línea. Se activa con `PAYMENTS_PROVIDER=local` y nunca por
 * defecto.
 *
 * Su maquinaria —la página, las sesiones abiertas y los eventos firmados que emite al pagarse—
 * vive en `payments/local-processor.ts`, que es donde vive todo lo que se borra el día que haya
 * procesador de verdad. Aquí queda sólo el adaptador a la costura.
 */
export function localProvider(now: () => Date = () => new Date()): PaymentProvider {
  const account = (id: string): ConnectedAccount => ({
    id,
    // Recién creada acepta cargos de forma limitada y le falta documentación, que es el estado en
    // el que la spec dice que debe quedar: limitado hasta que el procesador confirme.
    canAcceptCharges: true,
    canReceivePayouts: false,
    requirementsPending: true,
  })

  return {
    name: "local",

    listPrices: async (externalProductId) => localPrices(externalProductId),

    /**
     * Abre la sesión y devuelve **la página del suplente**, no la de vuelta.
     *
     * Antes devolvía la dirección de vuelta con la referencia pegada detrás, y eso dejaba la
     * activación en manos de la pantalla — una vía que producción no tiene. Ahora se pasa por la
     * página del suplente, se paga allí, y la suscripción nace del evento firmado que se entrega a
     * `/payments/events`, que es el camino que recorrerá el procesador de verdad.
     */
    createCheckoutSession: async (request) => openLocalCheckout(request),

    /**
     * Las cuatro respuestas salen del registro del suplente, que **recuerda el periodo**.
     *
     * Inventarlo en cada respuesta hacía que cancelar devolviera un vencimiento más lejano que el
     * real: la baja alargaba la suscripción. Ver `HALLAZGOS.md` H-164.
     */
    changePlan: async (id, priceId) => localSnapshot(id, { priceId }, now()),
    changeSeats: async (id, seats) => localSnapshot(id, { seats }, now()),
    cancelAtPeriodEnd: async (id) => localSnapshot(id, {}, now()),
    resume: async (id) => localSnapshot(id, {}, now()),

    createConnectedAccount: async (request) => account(`local_acct_${request.companyId}`),
    updateConnectedAccount: async (accountId) => account(accountId),
    deleteConnectedAccount: async () => {},

    createAccountLink: async ({ accountId, returnUrl }) => ({
      url: `${returnUrl}?verificacion=${encodeURIComponent(accountId)}`,
    }),
  }
}

// ─── Cuál está puesto ────────────────────────────────────────────────────────

let current: PaymentProvider = unconfiguredProvider

export function paymentProvider(): PaymentProvider {
  return current
}

/**
 * Pone otro procesador y devuelve cómo deshacerlo.
 *
 * Devolver la función de vuelta —y no un `reset()` global— es lo que hace que una prueba no pueda
 * dejar puesto su doble para las siguientes.
 */
export function usePaymentProvider(provider: PaymentProvider): () => void {
  const previous = current
  current = provider
  return () => {
    current = previous
  }
}
