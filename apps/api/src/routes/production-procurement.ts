/**
 * Rutas de las compras de una producción a los almacenes de otras empresas.
 *
 * Ver `openspec/specs/production-procurement/spec.md`. Rebanada 23.
 *
 * ## Las claves son las que hay, y no se inventa ninguna
 *
 * El catálogo cerrado da a esta rebanada exactamente siete: `productions.orders.view`, `create`,
 * `edit`, `quote_rented`, `quote_finished`, `reject` y `delete`. Cada ruta declara la suya y
 * ninguna se estira:
 *
 * ```
 * orders.view            mirar las órdenes, su ficha y sus líneas
 * orders.create          armar una orden — y por tanto abrir pedidos en empresas ajenas
 * orders.quote_finished  liquidar un pedido de venta
 * orders.delete          cancelar la orden, que cancela sus pedidos vigentes
 * ```
 *
 * **La tienda interna va con `create` y no con `view`**, y es deliberado: es la única lectura de
 * esta familia que enseña datos de **otras empresas** —el escaparate publicado—, y quien la mira
 * está componiendo una compra. Atarla a la clave que permite hacerla las mantiene juntas; con
 * `view`, quien sólo puede consultar el histórico de órdenes vería además el catálogo de terceros.
 *
 * **Tres claves se quedan sin ruta** y conviene decir cuáles y por qué:
 *
 * - `orders.edit` — una orden de compra no se edita después de abanicarse. Cambiar una línea
 *   significa cambiar el pedido que ya está en la bandeja de otra empresa, y eso es cancelar y
 *   volver a pedir. Se cancela.
 * - `orders.reject` — es la clave de rechazar **una cotización recibida**, que es una operación de
 *   la pantalla de la 29c y no de esta rebanada: hoy la producción que no quiere lo cotizado
 *   cancela la orden.
 * - `orders.quote_rented` — el gemelo de `quote_finished` para la renta, y la liquidación de renta
 *   no existe todavía. Ver `HALLAZGOS.md` H-285.
 *
 * ## Por qué la cancelación es un `POST` con motivo y no un `DELETE`
 *
 * Porque el motivo **lo lee la otra empresa**, en la conversación de su pedido, y un `DELETE` no
 * lleva cuerpo con el que decirlo. Y porque no es una baja: una orden que repartió pedidos fuera de
 * casa es un documento con consecuencias ajenas, y borrarla deja al almacén con un pedido cuyo
 * origen ya no se puede abrir. La spec las nombra juntas —«cancelar o eliminar»— y las dos hacen lo
 * mismo, así que hay una sola operación y se llama por lo que hace.
 */

import { z } from "@hono/zod-openapi"
import { ORDER_STATUSES, TRADE_TYPES, toInstant, toNullableInstant } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrderLines,
  listPurchaseOrders,
  listShopProducts,
  listShopWarehouses,
  PURCHASE_ORDER_STATUSES,
  type PurchaseOrderRecord,
  purchaseOrderQuery,
  type SettlementRecord,
  settleWarehouseOrder,
} from "../productions/procurement.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import { PAYMENT_METHODS } from "../warehouses/payments.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const instant = z.string().datetime()

/** Cadena decimal con dos decimales como mucho. El dinero nunca viaja como número. */
const amount = z.string().regex(/^\d+(\.\d{1,2})?$/, "El importe no es válido")

const productionParams = z.object({ companyId: z.string(), productionId: z.string() })
const purchaseOrderParams = productionParams.extend({ purchaseOrderId: z.string() })
const settlementParams = purchaseOrderParams.extend({ warehouseOrderId: z.string() })
const shopWarehouseParams = productionParams.extend({ warehouseId: z.string() })

const shipmentSchema = z.object({
  id: z.string(),
  warehouseId: z.string(),
  code: z.string(),
  status: z.enum(ORDER_STATUSES),
  quoteId: z.string().nullable(),
  /** Cuántas líneas de la orden fueron a este pedido. */
  lines: z.number().int(),
  cancelReason: z.string().nullable(),
})

const purchaseOrderSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  code: z.string(),
  name: z.string(),
  type: z.enum(TRADE_TYPES),
  status: z.enum(PURCHASE_ORDER_STATUSES),
  categoryId: z.string().nullable(),
  deliveryAddressId: z.string().nullable(),
  responsibleId: z.string().nullable(),
  canceledAt: instant.nullable(),
  cancelReason: z.string().nullable(),
  /** Cuántos pedidos generó y en qué estado está cada uno. */
  orders: z.array(shipmentSchema).readonly(),
  createdAt: instant,
  updatedAt: instant,
})

const purchaseOrderLineSchema = z.object({
  id: z.string(),
  purchaseOrderId: z.string(),
  measurementId: z.string(),
  /** Nulo si el producto salió del catálogo del almacén después de pedirlo. */
  measurementName: z.string().nullable(),
  productId: z.string().nullable(),
  productName: z.string().nullable(),
  quantity: z.number().int(),
  warehouseId: z.string().nullable(),
  warehouseOrderId: z.string().nullable(),
})

const shopWarehouseSchema = z.object({
  warehouseId: z.string(),
  companyId: z.string(),
  companyName: z.string(),
  name: z.string(),
  description: z.string(),
})

const shopProductSchema = z.object({
  productId: z.string(),
  name: z.string(),
  description: z.string(),
  code: z.string(),
  availableForSale: z.boolean(),
  availableForRent: z.boolean(),
  measurements: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        /** Unidades libres ahora mismo. */
        available: z.number().int(),
      }),
    )
    .readonly(),
})

const settlementSchema = z.object({
  purchaseOrder: purchaseOrderSchema,
  warehouseOrderId: z.string(),
  quoteId: z.string(),
  shoppingId: z.string(),
  amount: z.string(),
  /** Un artículo por cada unidad física adquirida, con su propio código. */
  items: z.array(z.object({ id: z.string(), name: z.string(), code: z.string() })).readonly(),
})

const lineInput = z.object({
  measurementId: z.string(),
  quantity: z.number().int().min(1).max(999),
})

// ─── Serialización ───────────────────────────────────────────────────────────

function serialize(order: PurchaseOrderRecord) {
  return {
    ...order,
    canceledAt: toNullableInstant(order.canceledAt),
    createdAt: toInstant(order.createdAt),
    updatedAt: toInstant(order.updatedAt),
  }
}

function serializeSettlement(settlement: SettlementRecord) {
  return { ...settlement, purchaseOrder: serialize(settlement.purchaseOrder) }
}

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

// ─── La tienda interna ───────────────────────────────────────────────────────

export const shopWarehousesRoute = defineRoute({
  access: REQUIRES("productions.orders.create"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/procurement/warehouses",
    summary: "El escaparate: los almacenes publicados a los que se puede comprar",
    tags: ["Compras de producción"],
    request: { params: productionParams },
    responses: {
      200: {
        description: "Almacenes publicados de otras empresas, con la suya",
        content: {
          "application/json": { schema: z.object({ items: z.array(shopWarehouseSchema) }) },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const items = await listShopWarehouses(actorOf(c), params.companyId, params.productionId)
    return c.json({ items: [...items] }, 200)
  },
})

export const shopProductsRoute = defineRoute({
  access: REQUIRES("productions.orders.create"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/procurement/warehouses/{warehouseId}/products",
    summary: "El catálogo publicado de un almacén del escaparate",
    tags: ["Compras de producción"],
    request: { params: shopWarehouseParams },
    responses: {
      200: {
        description: "Productos publicados con lo que queda libre de cada medida",
        content: {
          "application/json": { schema: z.object({ items: z.array(shopProductSchema) }) },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const items = await listShopProducts(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.warehouseId,
    )
    return c.json({ items: [...items] }, 200)
  },
})

// ─── Las órdenes de compra ───────────────────────────────────────────────────

export const listPurchaseOrdersRoute = defineRoute({
  access: REQUIRES("productions.orders.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/purchase-orders",
    summary: "Las órdenes de compra de una producción, con el resumen de sus pedidos",
    tags: ["Compras de producción"],
    request: { params: productionParams, query: collectionQuery(purchaseOrderQuery) },
    responses: {
      200: {
        description: "Cada orden con cuántos pedidos abrió y en qué estado están",
        content: { "application/json": { schema: pageSchema(purchaseOrderSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listPurchaseOrders(
      actorOf(c),
      params.companyId,
      params.productionId,
      queryOf(c, purchaseOrderQuery),
    )
    return c.json(serializePage(page, serialize), 200)
  },
})

export const createPurchaseOrderRoute = defineRoute({
  access: REQUIRES("productions.orders.create"),
  idempotent: true,
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/purchase-orders",
    summary: "Crear una orden de compra y abrir un pedido por almacén, en una transacción",
    tags: ["Compras de producción"],
    request: {
      params: productionParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().trim().min(1).max(250),
              type: z.enum(TRADE_TYPES),
              categoryId: z.string().nullable().optional(),
              deliveryAddressId: z.string().nullable().optional(),
              responsibleId: z.string().nullable().optional(),
              lines: z.array(lineInput).min(1).max(200),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "La orden con sus pedidos. Un fallo a mitad no deja nada",
        content: { "application/json": { schema: purchaseOrderSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const order = await createPurchaseOrder(
      actorOf(c),
      params.companyId,
      params.productionId,
      c.req.valid("json"),
    )
    return c.json(serialize(order), 201)
  },
})

export const getPurchaseOrderRoute = defineRoute({
  access: REQUIRES("productions.orders.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/purchase-orders/{purchaseOrderId}",
    summary: "Consultar una orden de compra y el estado de sus pedidos",
    tags: ["Compras de producción"],
    request: { params: purchaseOrderParams },
    responses: {
      200: {
        description: "La orden con el resumen de sus pedidos",
        content: { "application/json": { schema: purchaseOrderSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const order = await getPurchaseOrder(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.purchaseOrderId,
    )
    return c.json(serialize(order), 200)
  },
})

export const purchaseOrderLinesRoute = defineRoute({
  access: REQUIRES("productions.orders.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/purchase-orders/{purchaseOrderId}/lines",
    summary: "Las líneas de una orden de compra, con a qué pedido fue cada una",
    tags: ["Compras de producción"],
    request: { params: purchaseOrderParams },
    responses: {
      200: {
        description: "Cada línea con su medida, su cantidad y su pedido",
        content: {
          "application/json": { schema: z.object({ items: z.array(purchaseOrderLineSchema) }) },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const items = await listPurchaseOrderLines(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.purchaseOrderId,
    )
    return c.json({ items: [...items] }, 200)
  },
})

export const cancelPurchaseOrderRoute = defineRoute({
  access: REQUIRES("productions.orders.delete"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/purchase-orders/{purchaseOrderId}/cancellation",
    summary: "Cancelar una orden de compra y con ella sus pedidos vigentes",
    tags: ["Compras de producción"],
    request: {
      params: purchaseOrderParams,
      body: {
        content: {
          "application/json": {
            // Obligatorio: lo lee la otra empresa en la conversación de su pedido.
            schema: z.object({ reason: z.string().trim().min(1).max(2000) }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "La orden cancelada, con sus pedidos ya cancelados",
        content: { "application/json": { schema: purchaseOrderSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const order = await cancelPurchaseOrder(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.purchaseOrderId,
      c.req.valid("json").reason,
    )
    return c.json(serialize(order), 200)
  },
})

export const settleWarehouseOrderRoute = defineRoute({
  access: REQUIRES("productions.orders.quote_finished"),
  idempotent: true,
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/purchase-orders/{purchaseOrderId}/orders/{warehouseOrderId}/settlement",
    summary: "Liquidar un pedido de almacén: sus seis efectos, o ninguno",
    tags: ["Compras de producción"],
    request: {
      params: settlementParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              amount: amount,
              method: z.enum(PAYMENT_METHODS),
              description: z.string().max(2000).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "El pedido cerrado y el inventario materializado en la producción",
        content: { "application/json": { schema: settlementSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const settlement = await settleWarehouseOrder(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.purchaseOrderId,
      params.warehouseOrderId,
      c.req.valid("json"),
    )
    return c.json(serializeSettlement(settlement), 201)
  },
})
