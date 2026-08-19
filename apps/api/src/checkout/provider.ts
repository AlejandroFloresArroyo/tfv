/**
 * La costura con el procesador para el cobro de una tienda pública.
 *
 * Ver `openspec/specs/storefront-checkout/spec.md`. Rebanada 18.
 *
 * ## Por qué es una costura aparte de la de suscripciones
 *
 * `billing/provider.ts` abre sesiones de pago **de suscripción**: un precio del catálogo del
 * procesador, unos asientos y un descuento. Un cobro de tienda no se parece: son líneas con su
 * nombre y su importe, un concepto de envío aparte, y sobre todo una **comisión de aplicación con
 * destino** —el dinero entra en la plataforma, que retiene su parte y transfiere el resto a la
 * cuenta de comercio de la empresa vendedora—.
 *
 * Meter las dos en la misma interfaz obligaría a un método con la unión de los dos juegos de
 * parámetros, donde la mitad sobra en cada llamada. Son dos operaciones distintas del mismo
 * proveedor, y así están escritas. Cuando llegue el procesador real, la implementación es una sola
 * clase que satisface las dos. Anotado en `HALLAZGOS.md` H-107.
 *
 * ## Las tres implementaciones, y para qué es cada una
 *
 * Las mismas que la costura de suscripciones, por el mismo motivo: **el valor por defecto es el que
 * falla**. Un suplente por defecto sería la misma clase de error que el secreto de firma con valor
 * `"secret"` (`DEFECTS.md` S-13) — algo que parece funcionar en producción y no está cobrando nada.
 */

import { PaymentProviderUnavailableError } from "../billing/provider.ts"

/** Una línea tal y como la ve el procesador: un nombre, un importe unitario y una cantidad. */
export interface StorefrontSessionLine {
  readonly name: string
  /** Cadena decimal. El importe nunca pasa por coma flotante. */
  readonly unitAmount: string
  readonly quantity: number
}

export interface StorefrontSessionRequest {
  /** La compra que se está cobrando. Vuelve en el evento y es lo que permite materializarla. */
  readonly checkoutId: string
  readonly companyId: string
  /** La cuenta de comercio que recibe el neto. Sin ella no hay a dónde transferir. */
  readonly merchantAccountId: string
  readonly currency: string
  readonly lines: readonly StorefrontSessionLine[]
  /**
   * El envío, como concepto identificable y separado.
   *
   * «El envío SHALL presentarse como concepto separado en la sesión de pago»: no se reparte entre
   * las líneas ni se suma a la última, porque quien mira el cargo tiene que poder ver cuánto fue
   * transporte.
   */
  readonly shippingAmount: string
  /** Lo que retiene la plataforma. El resto va a la cuenta de comercio. */
  readonly applicationFee: string
  readonly successUrl: string
  readonly cancelUrl: string
  /** Cuándo caduca. La misma vigencia con la que se apartó el inventario. */
  readonly expiresAt: Date
  readonly metadata: Readonly<Record<string, string>>
}

export interface StorefrontSession {
  readonly id: string
  /** La dirección a la que se redirige al comprador. Es lo único que el navegador recibe. */
  readonly url: string
  /**
   * La referencia del cobro, cuando el procesador la emite al abrir la sesión.
   *
   * Puede no venir: en el flujo real nace con el primer intento de pago y llega en el evento. Se
   * guarda si viene porque es lo que enlaza la compra con el cobro cuando el evento no trae
   * metadatos —un reintento manual desde el panel del procesador, por ejemplo—.
   */
  readonly paymentIntentId?: string | undefined
}

export interface StorefrontPaymentProvider {
  readonly name: string
  createStorefrontSession(request: StorefrontSessionRequest): Promise<StorefrontSession>
}

/** El de por defecto: falla, y dice exactamente qué falta. */
export const unconfiguredStorefrontProvider: StorefrontPaymentProvider = {
  name: "sin-configurar",
  createStorefrontSession: () => {
    throw new PaymentProviderUnavailableError("cobrar una compra de tienda")
  },
}

/**
 * Suplente en memoria, para poder comprar de principio a fin sin cuenta del procesador.
 *
 * **No mueve dinero y no lo disimula**: la dirección que devuelve es la de vuelta a la propia
 * tienda y las referencias que emite llevan el prefijo `local_`. Se activa con
 * `PAYMENTS_PROVIDER=local` y nunca por defecto.
 */
export function localStorefrontProvider(): StorefrontPaymentProvider {
  return {
    name: "local",
    createStorefrontSession: async (request) => {
      const id = `local_cs_${request.checkoutId}`
      return {
        id,
        url: `${request.successUrl}${request.successUrl.includes("?") ? "&" : "?"}sesion=${encodeURIComponent(id)}`,
        paymentIntentId: `local_pi_${request.checkoutId}`,
      }
    },
  }
}

// ─── Cuál está puesto ────────────────────────────────────────────────────────

let current: StorefrontPaymentProvider = unconfiguredStorefrontProvider

export function storefrontProvider(): StorefrontPaymentProvider {
  return current
}

/**
 * Pone otro procesador y devuelve cómo deshacerlo.
 *
 * Devolver la función de vuelta —y no un `reset()` global— es lo que hace que una prueba no pueda
 * dejar puesto su doble para las siguientes.
 */
export function useStorefrontProvider(provider: StorefrontPaymentProvider): () => void {
  const previous = current
  current = provider
  return () => {
    current = previous
  }
}
