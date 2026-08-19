/**
 * Rutas de la conversación de un pedido.
 *
 * Ver `openspec/specs/order-chat/spec.md`. Rebanada 16.
 *
 * ## Las claves que se ejercen, y por qué éstas
 *
 * El catálogo de permisos es cerrado —255 claves— y **no tiene ninguna para conversar**. Mirar la
 * conversación va con `warehouses.orders.view`, que es mirar el pedido; escribir en ella va con
 * `warehouses.orders.edit`, la clave de escritura más cercana.
 *
 * Se eligió la de escritura y no la de lectura a sabiendas de que deja fuera a quien sólo mira:
 * colapsar las dos ampliaría en silencio la autoridad de quien tenía la general, que es justo el
 * error corregido en `HALLAZGOS.md` H-07. Marcar leído sí va con la de lectura, porque leer es lo
 * que hace, y no ejerce ninguna autoridad sobre el pedido.
 *
 * Añadir una clave propia es decisión de producto. Queda anotado en `HALLAZGOS.md` H-62.
 */

import { z } from "@hono/zod-openapi"
import { CHAT_SIDES, MESSAGE_MAX_LENGTH } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import {
  type ChatMessageRecord,
  deleteMessage,
  editMessage,
  markConversationRead,
  readConversation,
  sendMessage,
} from "../warehouses/order-chat.ts"

const instant = z.string().datetime()

const messageSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  side: z.enum(CHAT_SIDES),
  authorId: z.string().nullable(),
  /** Nulo cuando el motor no enseña esa cuenta a quien pregunta: el otro lado no tiene nombre. */
  authorName: z.string().nullable(),
  body: z.string(),
  replyToId: z.string().nullable(),
  readByClientAt: instant.nullable(),
  readByProviderAt: instant.nullable(),
  editedAt: instant.nullable(),
  deletedAt: instant.nullable(),
  createdAt: instant,
  updatedAt: instant,
})

const conversationSchema = z.object({
  items: z.array(messageSchema),
  side: z.enum(CHAT_SIDES),
  hasMore: z.boolean(),
  olderCursor: z.string().nullable(),
  syncCursor: z.string(),
  unread: z.number().int(),
})

const orderParams = z.object({
  companyId: z.string(),
  warehouseId: z.string(),
  orderId: z.string(),
})
const messageParams = orderParams.extend({ messageId: z.string() })

function serialize(message: ChatMessageRecord) {
  return {
    ...message,
    readByClientAt: message.readByClientAt?.toISOString() ?? null,
    readByProviderAt: message.readByProviderAt?.toISOString() ?? null,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  }
}

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

/**
 * Leer la conversación.
 *
 * Sin `since` devuelve historial, del más reciente al más antiguo, y `before` sigue hacia atrás.
 * Con `since` devuelve lo escrito, editado y borrado desde ese punto, en orden natural — que es lo
 * que hace de reconexión mientras no haya conexión persistente.
 */
export const readConversationRoute = defineRoute({
  access: REQUIRES("warehouses.orders.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/messages",
    summary: "La conversación del pedido",
    tags: ["Pedidos"],
    request: {
      params: orderParams,
      query: z.object({
        before: z.string().optional().openapi({
          description: "Identificador del mensaje más antiguo que ya se tiene",
        }),
        since: z.string().optional().openapi({
          description: "Cursor de sincronización: lo escrito, editado o borrado desde entonces",
        }),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      }),
    },
    responses: {
      200: {
        description: "El trozo pedido, con el cursor por donde seguir",
        content: { "application/json": { schema: conversationSchema } },
      },
      404: { description: "El pedido no existe en este almacén, o no se es parte de él" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const query = c.req.valid("query")

    const page = await readConversation(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.orderId,
      {
        ...(query.before === undefined ? {} : { before: query.before }),
        ...(query.since === undefined ? {} : { since: query.since }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
      },
    )

    return c.json({ ...page, items: page.items.map(serialize) }, 200)
  },
})

export const sendMessageRoute = defineRoute({
  access: REQUIRES("warehouses.orders.edit"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/messages",
    summary: "Escribir en la conversación",
    tags: ["Pedidos"],
    request: {
      params: orderParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              body: z.string().max(MESSAGE_MAX_LENGTH),
              replyToId: z.string().optional(),
              /** La referencia temporal de quien envía. Vuelve tal cual, y sólo a él. */
              clientRef: z.string().max(64).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Escrito, con la referencia temporal de quien lo envió",
        content: {
          "application/json": {
            schema: z.object({ message: messageSchema, clientRef: z.string().nullable() }),
          },
        },
      },
      422: { description: "Un mensaje sin texto no se envía" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const input = c.req.valid("json")

    const sent = await sendMessage(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.orderId,
      {
        body: input.body,
        ...(input.replyToId === undefined ? {} : { replyToId: input.replyToId }),
        ...(input.clientRef === undefined ? {} : { clientRef: input.clientRef }),
      },
    )

    return c.json({ message: serialize(sent.message), clientRef: sent.clientRef }, 201)
  },
})

export const markConversationReadRoute = defineRoute({
  access: REQUIRES("warehouses.orders.view"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/messages/read",
    summary: "Marcar como leído lo pendiente de este lado",
    tags: ["Pedidos"],
    request: {
      params: orderParams,
      body: { content: { "application/json": { schema: z.object({}) } } },
    },
    responses: {
      200: {
        description: "Cuántos quedaron leídos",
        content: {
          "application/json": {
            schema: z.object({
              read: z.number().int(),
              unread: z.number().int(),
              syncCursor: z.string(),
            }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const receipt = await markConversationRead(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.orderId,
    )
    return c.json(receipt, 200)
  },
})

export const editMessageRoute = defineRoute({
  access: REQUIRES("warehouses.orders.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/messages/{messageId}",
    summary: "Editar un mensaje propio",
    tags: ["Pedidos"],
    request: {
      params: messageParams,
      body: {
        content: {
          "application/json": { schema: z.object({ body: z.string().max(MESSAGE_MAX_LENGTH) }) },
        },
      },
    },
    responses: {
      200: { description: "Editado", content: { "application/json": { schema: messageSchema } } },
      403: { description: "No es un mensaje propio, o es del sistema" },
      404: { description: "El mensaje no es de esta conversación" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const message = await editMessage(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.orderId,
      params.messageId,
      c.req.valid("json").body,
    )
    return c.json(serialize(message), 200)
  },
})

export const deleteMessageRoute = defineRoute({
  access: REQUIRES("warehouses.orders.edit"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/messages/{messageId}",
    summary: "Borrar un mensaje propio",
    tags: ["Pedidos"],
    request: { params: messageParams },
    responses: {
      204: { description: "Borrado" },
      403: { description: "No es un mensaje propio, o es del sistema" },
      404: { description: "El mensaje no es de esta conversación" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteMessage(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.orderId,
      params.messageId,
    )
    return c.body(null, 204)
  },
})
