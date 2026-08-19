/**
 * Los pedidos del comprador, a través de todas las tiendas donde haya comprado.
 *
 * Ver `openspec/specs/order-fulfillment/spec.md`, requisito «El comprador consulta sus pedidos».
 * Rebanada 18.
 *
 * ## Lo que devuelven estas lecturas
 *
 * **Pedidos.** Suena a perogrullada y no lo es: la pila anterior devolvía registros de **envío** en
 * las lecturas de pedidos, de pagos y de compras —cuatro endpoints, cuatro veces el mismo error
 * (`DEFECTS.md` C-01 a C-04)—, así que quien pedía sus pedidos recibía una lista de paquetes sin
 * importes ni artículos. Aquí el pedido trae lo suyo y el envío va **dentro**, como lo que es: una
 * propiedad del pedido.
 *
 * ## Quién ve qué
 *
 * Se lee con la sesión del comprador, y las políticas hacen el resto: `buyer_orders` lo concede a su
 * comprador y a la empresa vendedora, y el pedido de otro sencillamente no está — que es el `404`
 * que la spec pide, sin decir si existe.
 *
 * El nombre de la tienda no se puede leer así: `websites` es de la empresa, y el comprador no es
 * miembro de ninguna. Se resuelve declarando el alcance de la empresa vendedora, que es la misma
 * forma que usa la tienda pública para servir un catálogo a quien no tiene cuenta.
 */

import { NotFoundError } from "@tfv/contracts"
import { withRequester, withSystem } from "@tfv/db"
import type { CheckoutLine } from "@tfv/db/schema"
import {
  buyerOrderLines,
  buyerOrders,
  checkouts,
  payments,
  shipments,
  websites,
} from "@tfv/db/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"

const OPERATION = "tienda_publica.pedidos"

export interface BuyerOrderShipment {
  readonly id: string
  readonly mode: string
  readonly status: string
  readonly cost: string
  readonly carrier: string
  readonly trackingNumber: string | null
  readonly estimatedDeliveryAt: string | null
  readonly deliveredAt: string | null
}

export interface BuyerOrderPayment {
  readonly status: string
  readonly method: string | null
  readonly grossAmount: string
  readonly receiptUrl: string | null
  readonly refundedAmount: string
}

export interface BuyerOrderRecord {
  readonly id: string
  readonly reference: string
  readonly status: string
  readonly type: string
  readonly storeSlug: string
  readonly storeName: string
  readonly subtotal: string
  readonly shippingCost: string
  readonly total: string
  readonly currency: string
  readonly createdAt: string
  readonly lines: readonly CheckoutLine[]
  readonly payment: BuyerOrderPayment | null
  readonly shipment: BuyerOrderShipment | null
}

/** Los pedidos del comprador, de la más reciente a la más antigua, **cruzando tiendas**. */
export async function listMyOrders(actor: Actor, limit = 20): Promise<readonly BuyerOrderRecord[]> {
  const rows = await withRequester(actor, async (tx) => {
    const orders = await tx
      .select({ order: buyerOrders, websiteId: checkouts.websiteId })
      .from(buyerOrders)
      .leftJoin(checkouts, eq(checkouts.id, buyerOrders.checkoutId))
      .where(eq(buyerOrders.buyerId, actor.userId))
      .orderBy(desc(buyerOrders.createdAt))
      .limit(limit)

    return compose(tx, orders)
  })

  return withStoreNames(rows)
}

/** Un pedido del comprador. El de otro responde `404` sin decir si existe. */
export async function readMyOrder(actor: Actor, orderId: string): Promise<BuyerOrderRecord> {
  const rows = await withRequester(actor, async (tx) => {
    const orders = await tx
      .select({ order: buyerOrders, websiteId: checkouts.websiteId })
      .from(buyerOrders)
      .leftJoin(checkouts, eq(checkouts.id, buyerOrders.checkoutId))
      .where(and(eq(buyerOrders.id, orderId), eq(buyerOrders.buyerId, actor.userId)))
      .limit(1)

    return compose(tx, orders)
  })

  const [record] = await withStoreNames(rows)
  if (!record) throw new NotFoundError("No se encontró el pedido")
  return record
}

interface Composed {
  readonly record: Omit<BuyerOrderRecord, "storeSlug" | "storeName">
  readonly companyId: string
  readonly websiteId: string | null
}

/**
 * Reúne cada pedido con sus líneas, su pago y su envío.
 *
 * En tres consultas y no en tres por pedido: la lista del comprador cruza tiendas y puede ser larga,
 * y una consulta por fila es la forma más fácil de que una pantalla que funcionaba con tres pedidos
 * deje de funcionar con treinta.
 */
async function compose(
  tx: Parameters<Parameters<typeof withRequester>[1]>[0],
  orders: readonly { order: typeof buyerOrders.$inferSelect; websiteId: string | null }[],
): Promise<readonly Composed[]> {
  if (orders.length === 0) return []

  const ids = orders.map((row) => row.order.id)

  const lines = await tx
    .select()
    .from(buyerOrderLines)
    .where(inArray(buyerOrderLines.orderId, ids))
    .orderBy(buyerOrderLines.orderId, buyerOrderLines.position)

  const paymentIds = orders
    .map((row) => row.order.paymentId)
    .filter((id): id is string => id !== null)
  const charged =
    paymentIds.length === 0
      ? []
      : await tx.select().from(payments).where(inArray(payments.id, paymentIds))

  const shipmentIds = orders
    .map((row) => row.order.shipmentId)
    .filter((id): id is string => id !== null)
  const parcels =
    shipmentIds.length === 0
      ? []
      : await tx.select().from(shipments).where(inArray(shipments.id, shipmentIds))

  return orders.map(({ order, websiteId }) => {
    const payment = charged.find((row) => row.id === order.paymentId)
    const shipment = parcels.find((row) => row.id === order.shipmentId)

    return {
      companyId: order.companyId,
      websiteId,
      record: {
        id: order.id,
        reference: order.reference,
        status: order.status,
        type: order.type,
        subtotal: order.subtotal,
        shippingCost: order.shippingCost,
        total: order.total,
        currency: order.currency,
        createdAt: order.createdAt.toISOString(),
        lines: lines.filter((row) => row.orderId === order.id).map((row) => row.line),
        payment: payment
          ? {
              status: payment.status,
              method: payment.method,
              grossAmount: payment.grossAmount,
              receiptUrl: payment.receiptUrl,
              refundedAmount: payment.refundedAmount,
            }
          : null,
        shipment: shipment
          ? {
              id: shipment.id,
              mode: shipment.mode,
              status: shipment.status,
              cost: shipment.cost,
              carrier: shipment.carrier,
              trackingNumber: shipment.trackingNumber,
              estimatedDeliveryAt: shipment.estimatedDeliveryAt?.toISOString() ?? null,
              deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
            }
          : null,
      },
    }
  })
}

/**
 * Le pone a cada pedido el nombre de la tienda donde se compró.
 *
 * Una consulta por empresa distinta, no por pedido: quien compra en la misma tienda diez veces la
 * resuelve una vez.
 */
async function withStoreNames(rows: readonly Composed[]): Promise<readonly BuyerOrderRecord[]> {
  const names = new Map<string, { slug: string; name: string }>()

  for (const row of rows) {
    if (row.websiteId === null || names.has(row.websiteId)) continue

    const found = await withSystem(`${OPERATION}.tienda`, [row.companyId], async (tx) => {
      const [site] = await tx
        .select({ slug: websites.slug, name: websites.name })
        .from(websites)
        .where(eq(websites.id, row.websiteId as string))
        .limit(1)

      return site
    })

    if (found) names.set(row.websiteId, found)
  }

  return rows.map((row) => {
    const store = row.websiteId === null ? undefined : names.get(row.websiteId)
    return { ...row.record, storeSlug: store?.slug ?? "", storeName: store?.name ?? "" }
  })
}
