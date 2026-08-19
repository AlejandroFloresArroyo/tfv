/**
 * La aritmética de una compra en tienda pública, y su ciclo de vida.
 *
 * Ver `openspec/specs/storefront-checkout/spec.md` —bloque «Cálculo del importe» y requisitos de
 * comisión, envío y estados— y `order-fulfillment`. Rebanada 18.
 *
 * ## Por qué el cálculo vive aquí
 *
 * Por lo mismo que el motor de cotizaciones y el de envíos: el carrito enseña un desglose **antes**
 * de pagar y el servidor cobra, y dos implementaciones de la misma fórmula acaban divergiendo —es
 * el defecto M-06 en las cotizaciones y el M-11 en los envíos, dos veces la misma historia—. Aquí
 * hay una sola función y la usan las dos orillas.
 *
 * Es una función **pura**: no consulta el catálogo ni sabe qué es una medida. Recibe precios ya
 * resueltos —que los resuelve el servidor, nunca el navegador— y devuelve importes.
 *
 * ## Dónde va cada peso
 *
 * ```
 * subtotal   = Σ precio × cantidad
 * comisión   = round(subtotal × comisión% ÷ 100, 2)
 * neto       = subtotal − comisión          ← lo que recibe el comercio
 * total      = subtotal + envío             ← lo que paga el comprador
 * ```
 *
 * El envío **suma al total y no al neto**, tal y como lo escribe la spec. Es una decisión de
 * negocio con consecuencias —el comercio despacha el paquete y el importe del transporte se queda
 * en la plataforma— y por eso está transcrita y no interpretada. Anotado en `HALLAZGOS.md` H-105.
 */

import {
  applyPercent,
  formatMoney,
  formatPercent,
  type Money,
  money,
  multiply,
  percent,
  subtract,
  sum,
} from "./money.ts"

// ─── Estados ─────────────────────────────────────────────────────────────────

/**
 * Los cuatro estados de una compra.
 *
 * «Todos SHALL alcanzarse efectivamente; ninguno SHALL quedar inalcanzable»: por eso la tabla de
 * transiciones se comprueba, y no sólo la lista.
 */
export const CHECKOUT_STATUSES = ["pending", "completed", "canceled", "expired"] as const

export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number]

/**
 * Las transiciones previstas.
 *
 * Los tres finales son terminales, y eso es lo que impide que el recolector de caducadas pise una
 * compra que acaba de cobrarse: el barrido corre cada pocos minutos y la confirmación del
 * procesador puede llegar en medio. Sin esta tabla, una compra pagada acabaría marcada como
 * caducada y con su inventario liberado —vendido y devuelto a la estantería a la vez—.
 */
export const CHECKOUT_TRANSITIONS: Readonly<Record<CheckoutStatus, readonly CheckoutStatus[]>> = {
  pending: ["completed", "canceled", "expired"],
  completed: [],
  canceled: [],
  expired: [],
}

/** A dónde puede ir una compra desde donde está. */
export function allowedCheckoutTransitions(status: CheckoutStatus): readonly CheckoutStatus[] {
  return CHECKOUT_TRANSITIONS[status]
}

export function canTransitionCheckout(from: CheckoutStatus, to: CheckoutStatus): boolean {
  return CHECKOUT_TRANSITIONS[from].includes(to)
}

/**
 * ¿Sigue apartando inventario?
 *
 * Sólo la pendiente. Al completarse, las unidades pasan al estado de la modalidad —vendidas o
 * rentadas— y dejan de estar apartadas; al cancelarse o caducar, vuelven a disponibles.
 */
export function isCheckoutOpen(status: CheckoutStatus): boolean {
  return status === "pending"
}

// ─── Qué se compra ───────────────────────────────────────────────────────────

/**
 * Las tres clases de artículo que puede llevar un carrito.
 *
 * Las dos verticales tienen la misma envolvente y distinto contenido: la tienda de almacén lleva
 * medidas de producto; la de mosaicos, productos de catálogo o mosaicos configurados.
 */
export const CART_ITEM_KINDS = ["warehouse_measurement", "pixit_product", "pixit_mosaic"] as const

export type CartItemKind = (typeof CART_ITEM_KINDS)[number]

/** Venta o renta. La compra entera declara una sola modalidad. */
export const CHECKOUT_TRADE_TYPES = ["sale", "rent"] as const

export type CheckoutTradeType = (typeof CHECKOUT_TRADE_TYPES)[number]

/**
 * Lo que el navegador manda: qué y cuánto. **Nunca el precio.**
 *
 * «No SHALL aceptar precios enviados por el navegador»: la forma más segura de cumplirlo es que el
 * precio no quepa en el tipo que entra.
 */
export interface CartItemInput {
  readonly kind: CartItemKind
  readonly refId: string
  readonly quantity: number
}

// ─── Importes ────────────────────────────────────────────────────────────────

/**
 * Comisión de la plataforma cuando la empresa no tiene una propia.
 *
 * Es el mismo valor que el modelo pone por omisión en `companies.commission_rate`; está escrito
 * aquí para que el cálculo pueda correr en el navegador, donde no hay tabla que consultar.
 */
export const DEFAULT_PLATFORM_COMMISSION = "12.5"

/** Una línea ya valorada por el servidor. */
export interface PricedLine {
  readonly unitPrice: string
  readonly quantity: number
}

export interface CheckoutTotalsInput {
  readonly lines: readonly PricedLine[]
  /** Ya calculado por `shipping-rates`. Cero en la recolección en tienda. */
  readonly shippingCost: string
  /** El de la empresa vendedora. Ausente: el de la plataforma. */
  readonly commissionRate?: string | undefined
}

export interface CheckoutTotals {
  readonly subtotal: string
  readonly platformFee: string
  readonly platformFeeRate: string
  /** Lo que recibe el comercio: subtotal menos comisión. */
  readonly netAmount: string
  readonly shippingCost: string
  /** Lo que paga el comprador: subtotal más envío. */
  readonly total: string
}

/**
 * Los importes de una compra, a partir de precios ya resueltos.
 *
 * Todo pasa por `bigint` en centavos y nunca por coma flotante: es la regla de la casa, y aquí es
 * además lo que hace que **neto más comisión sea exactamente el subtotal**. Calculando el neto por
 * su lado —subtotal × (100 − comisión) %— los dos redondeos podrían no cerrar, y un centavo suelto
 * por compra es una conciliación que no cuadra nunca.
 */
export function computeCheckoutTotals(input: CheckoutTotalsInput): CheckoutTotals {
  if (input.lines.length === 0) {
    throw new RangeError("Un carrito vacío no es una compra")
  }

  const amounts: Money[] = input.lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new RangeError(`Cantidad inválida en una línea del carrito: ${line.quantity}`)
    }
    return multiply(money(line.unitPrice), line.quantity)
  })

  const subtotal = sum(amounts)
  const rate = percent(input.commissionRate ?? DEFAULT_PLATFORM_COMMISSION)
  const platformFee = applyPercent(subtotal, rate)
  const shippingCost = money(input.shippingCost)

  return {
    subtotal: formatMoney(subtotal),
    platformFee: formatMoney(platformFee),
    platformFeeRate: formatPercent(rate),
    netAmount: formatMoney(subtract(subtotal, platformFee)),
    shippingCost: formatMoney(shippingCost),
    total: formatMoney((subtotal + shippingCost) as Money),
  }
}
