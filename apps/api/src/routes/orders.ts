/**
 * Rutas de pedidos de almacén.
 *
 * Ver `openspec/specs/warehouse-orders/spec.md`. Rebanada 15.
 *
 * El reparto de claves sigue la matriz migrada: `view` para mirar, `accept` para aceptar —que crea
 * una cotización y aparta inventario—, `reject` para rechazar, `edit` para mover el estado y
 * `delete` para dar de baja. Aceptar y rechazar tienen clave propia porque son las dos decisiones
 * que se toman de cara a otra empresa.
 */

import { z } from "@hono/zod-openapi"
import { ORDER_ORIGINS, ORDER_STATUSES, TRADE_TYPES } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import {
  acceptOrder,
  changeOrderStatus,
  createOrder,
  deleteOrder,
  getOrder,
  listOrderLines,
  listOrders,
  type OrderLineRecord,
  type OrderRecord,
  orderQuery,
  rejectOrder,
} from "../warehouses/orders.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

const instant = z.string().datetime()

const orderSchema = z.object({
  id: z.string(),
  warehouseId: z.string(),
  code: z.string(),
  name: z.string(),
  observations: z.string(),
  origin: z.enum(ORDER_ORIGINS),
  type: z.enum(TRADE_TYPES),
  status: z.enum(ORDER_STATUSES),
  quoteId: z.string().nullable(),
  purchaseOrderId: z.string().nullable(),
  buyerOrderId: z.string().nullable(),
  clientId: z.string().nullable(),
  providerId: z.string().nullable(),
  canceledAt: instant.nullable(),
  canceledById: z.string().nullable(),
  cancelReason: z.string().nullable(),
  /** Mensajes de la conversación que este lado no ha leído. */
  unread: z.number().int(),
  createdAt: instant,
  updatedAt: instant,
})

const orderLineSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  measurementId: z.string(),
  measurementName: z.string(),
  productId: z.string(),
  productName: z.string(),
  productCode: z.string(),
  quantity: z.number().int(),
  /** Unidades libres de la medida. Es lo que decide si la línea cabe al aceptar. */
  available: z.number().int(),
  position: z.number().int(),
})

const warehouseParams = z.object({ companyId: z.string(), warehouseId: z.string() })
const orderParams = warehouseParams.extend({ orderId: z.string() })

function serialize(order: OrderRecord) {
  return {
    ...order,
    canceledAt: order.canceledAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }
}

function serializeLine(line: OrderLineRecord) {
  return line
}

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

export const listOrdersRoute = defineRoute({
  access: REQUIRES("warehouses.orders.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/orders",
    summary: "La bandeja de pedidos del almacén",
    tags: ["Pedidos"],
    request: { params: warehouseParams, query: collectionQuery(orderQuery) },
    responses: {
      200: {
        description: "Ordenados por lo que requiere atención antes",
        content: { "application/json": { schema: pageSchema(orderSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listOrders(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      queryOf(c, orderQuery),
    )
    return c.json(serializePage(page, serialize), 200)
  },
})

export const createOrderRoute = defineRoute({
  access: REQUIRES("warehouses.orders.edit"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses/{warehouseId}/orders",
    summary: "Registrar un pedido",
    tags: ["Pedidos"],
    request: {
      params: warehouseParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              origin: z.enum(ORDER_ORIGINS),
              type: z.enum(TRADE_TYPES),
              name: z.string().trim().max(250).optional(),
              observations: z.string().max(4000).optional(),
              clientId: z.string().optional(),
              providerId: z.string().optional(),
              purchaseOrderId: z.string().optional(),
              lines: z
                .array(
                  z.object({
                    measurementId: z.string(),
                    quantity: z.number().int().min(1).max(9999),
                  }),
                )
                .max(500)
                .default([]),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: "Registrado", content: { "application/json": { schema: orderSchema } } },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const order = await createOrder(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      c.req.valid("json"),
    )
    return c.json(serialize(order), 201)
  },
})

export const getOrderRoute = defineRoute({
  access: REQUIRES("warehouses.orders.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}",
    summary: "Un pedido",
    tags: ["Pedidos"],
    request: { params: orderParams },
    responses: {
      200: { description: "El pedido", content: { "application/json": { schema: orderSchema } } },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const order = await getOrder(actorOf(c), params.companyId, params.warehouseId, params.orderId)
    return c.json(serialize(order), 200)
  },
})

export const listOrderLinesRoute = defineRoute({
  access: REQUIRES("warehouses.orders.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/lines",
    summary: "Las líneas de un pedido, con la existencia libre de cada medida",
    tags: ["Pedidos"],
    request: { params: orderParams },
    responses: {
      200: {
        description: "Cada línea con lo que pide y lo que hay",
        content: { "application/json": { schema: z.object({ items: z.array(orderLineSchema) }) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const lines = await listOrderLines(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.orderId,
    )
    return c.json({ items: lines.map(serializeLine) }, 200)
  },
})

/**
 * Aceptar un pedido.
 *
 * Crea la cotización con su inventario apartado, **todo o nada**. Devuelve además lo que quedó
 * fuera y por qué: aceptar a medias y decirlo es más útil que rechazar entero, porque el operador
 * ve qué falta y decide.
 */
export const acceptOrderRoute = defineRoute({
  access: REQUIRES("warehouses.orders.accept"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/acceptance",
    summary: "Aceptar un pedido y generar su cotización",
    tags: ["Pedidos"],
    request: {
      params: orderParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              /** Incluir también las líneas sin existencia suficiente. */
              includeAll: z.boolean().default(false),
              /** `DEFECTS.md` M-04: crear inventario que no existe se autoriza expresamente. */
              allowMinting: z.boolean().default(false),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Aceptado, con su cotización y lo que quedó fuera",
        content: {
          "application/json": {
            schema: z.object({
              order: orderSchema,
              quoteId: z.string(),
              excluded: z.array(
                z.object({
                  lineId: z.string(),
                  productName: z.string(),
                  measurementName: z.string(),
                  requested: z.number().int(),
                  available: z.number().int(),
                }),
              ),
            }),
          },
        },
      },
      409: { description: "El pedido no está en un estado desde el que se acepte" },
      422: { description: "Ninguna línea cabe, o el pedido no tiene líneas" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const body = c.req.valid("json")
    const result = await acceptOrder(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.orderId,
      { includeAll: body.includeAll, allowMinting: body.allowMinting },
    )
    return c.json({ ...result, order: serialize(result.order) }, 201)
  },
})

export const rejectOrderRoute = defineRoute({
  access: REQUIRES("warehouses.orders.reject"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/rejection",
    summary: "Rechazar un pedido, con su motivo",
    tags: ["Pedidos"],
    request: {
      params: orderParams,
      body: {
        content: {
          "application/json": {
            // Obligatorio: lo lee quien hizo la solicitud desde otra empresa.
            schema: z.object({ reason: z.string().trim().min(1).max(2000) }),
          },
        },
      },
    },
    responses: {
      200: { description: "Rechazado", content: { "application/json": { schema: orderSchema } } },
      422: { description: "Falta el motivo" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const order = await rejectOrder(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.orderId,
      c.req.valid("json").reason,
    )
    return c.json(serialize(order), 200)
  },
})

export const changeOrderStatusRoute = defineRoute({
  access: REQUIRES("warehouses.orders.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/status",
    summary: "Avanzar el pedido",
    tags: ["Pedidos"],
    request: {
      params: orderParams,
      body: {
        content: { "application/json": { schema: z.object({ status: z.enum(ORDER_STATUSES) }) } },
      },
    },
    responses: {
      200: { description: "Cambiado", content: { "application/json": { schema: orderSchema } } },
      409: { description: "La transición no está prevista" },
      422: { description: "Cancelar exige motivo: se usa el rechazo" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const order = await changeOrderStatus(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.orderId,
      c.req.valid("json").status,
    )
    return c.json(serialize(order), 200)
  },
})

export const deleteOrderRoute = defineRoute({
  access: REQUIRES("warehouses.orders.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}",
    summary: "Dar de baja un pedido",
    tags: ["Pedidos"],
    request: { params: orderParams },
    responses: {
      204: { description: "Dado de baja" },
      422: { description: "Hay equipo sin devolver" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteOrder(actorOf(c), params.companyId, params.warehouseId, params.orderId)
    return c.body(null, 204)
  },
})
