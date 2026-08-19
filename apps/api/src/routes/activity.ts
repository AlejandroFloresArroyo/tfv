/**
 * Rutas de bitácora, bandeja, preferencias y dispositivos.
 *
 * Rebanada 09. Ver `openspec/specs/activity-and-notifications/spec.md`.
 *
 * ## Dos regímenes, y por qué
 *
 * | Superficie | Régimen | Motivo |
 * |---|---|---|
 * | Bitácora de la empresa | permiso | Es dato de la empresa: quién hizo qué dentro de ella |
 * | Bandeja, preferencias y dispositivos | autenticado | Son de la persona. No hay empresa contra la que resolver un permiso |
 *
 * ## La clave que la bitácora exige, y por qué es ésa
 *
 * El catálogo de permisos es un **conjunto cerrado de 255 claves migradas** y no trae ninguna de
 * bitácora: en la implementación anterior la actividad no se consultaba, se emitía. Añadir una es
 * decisión de producto, así que se usa la más cercana —`companies.companies.view`, ver la empresa—,
 * que es exactamente el alcance de lo que la bitácora enseña: lo ocurrido dentro de esa empresa.
 *
 * Queda anotado en `HALLAZGOS.md`. Si el negocio quiere que ver la bitácora sea un permiso aparte
 * —hay quien no querrá que cualquiera con acceso vea quién tocó qué—, hace falta una clave nueva.
 *
 * ## Por qué la bandeja no habla el lenguaje de consulta
 *
 * Sus filtros no son campos sino **estados de la relación con quien la mira** —no leídas, leídas,
 * archivadas—, y la gramática de colecciones es cerrada a propósito. Expresarlos como filtros de
 * campo obligaría a publicar `readAt` y `archivedAt` como filtrables por rango, que es una
 * superficie mayor para responder a tres botones. El sobre de paginación sí es el mismo de siempre.
 */

import { z } from "@hono/zod-openapi"
import { toInstant, toNullableInstant } from "@tfv/contracts"
import {
  type ActivityRecord,
  activityQuery,
  listCompanyActivity,
  listMyActivity,
} from "../activity/activity.ts"
import { type Category, CHANNELS, type Channel } from "../activity/delivery.ts"
import {
  availableChannels,
  CATEGORIES,
  type DeviceRecord,
  type InboxItem,
  inboxCounts,
  listDevices,
  listInbox,
  listPreferences,
  openInbox,
  type PreferenceRecord,
  registerDevice,
  revokeDevice,
  setArchived,
  setPreference,
  setRead,
} from "../activity/notifications.ts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import { AUTHENTICATED, defineRoute, REQUIRES } from "../runtime/route.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

// ─── Esquemas ────────────────────────────────────────────────────────────────

const activitySchema = z.object({
  id: z.string(),
  companyId: z.string(),
  companyName: z.string(),
  action: z.enum(["create", "update", "delete"]),
  entity: z.string(),
  entityId: z.string().nullable(),
  entityLabel: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  origin: z.string(),
  permissions: z.array(z.string()),
  performedById: z.string().nullable(),
  performedBy: z.string(),
  performedAsPlatformAdmin: z.boolean(),
  createdAt: z.string(),
})

function serializeActivity(activity: ActivityRecord) {
  return {
    id: activity.id,
    companyId: activity.companyId,
    companyName: activity.companyName,
    action: activity.action,
    entity: activity.entity,
    entityId: activity.entityId,
    entityLabel: activity.entityLabel,
    title: activity.title,
    description: activity.description,
    url: activity.url,
    origin: activity.origin,
    permissions: [...activity.permissions],
    performedById: activity.performedById,
    performedBy: activity.actorName,
    performedAsPlatformAdmin: activity.performedAsPlatformAdmin,
    createdAt: toInstant(activity.createdAt),
  }
}

const notificationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  url: z.string(),
  readAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
})

function serializeNotification(item: InboxItem) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    body: item.body,
    url: item.url,
    readAt: toNullableInstant(item.readAt),
    archivedAt: toNullableInstant(item.archivedAt),
    createdAt: toInstant(item.createdAt),
  }
}

const countsSchema = z.object({ unread: z.number().int(), news: z.number().int() })

const preferenceSchema = z.object({
  category: z.enum(["account", "activity", "billing", "stock"]),
  channel: z.enum(["inbox", "push", "email"]),
  enabled: z.boolean(),
  editable: z.boolean(),
})

const preferencesSchema = z.object({
  items: z.array(preferenceSchema),
  /** Los canales que hoy tienen proveedor. La pantalla no ofrece lo que no puede cumplir. */
  available: z.array(z.enum(["inbox", "push", "email"])),
})

function serializePreference(preference: PreferenceRecord) {
  return {
    category: preference.category,
    channel: preference.channel,
    enabled: preference.enabled,
    editable: preference.editable,
  }
}

const deviceSchema = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
})

function serializeDevice(device: DeviceRecord) {
  return {
    id: device.id,
    userAgent: device.userAgent,
    lastSeenAt: toNullableInstant(device.lastSeenAt),
    createdAt: toInstant(device.createdAt),
  }
}

const companyParams = z.object({ companyId: z.string() })
const notificationParams = z.object({ notificationId: z.string() })
const deviceParams = z.object({ deviceId: z.string() })

const inboxQuery = z.object({
  filter: z.enum(["unread", "read", "archived", "all"]).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
})

function pageOf(raw: { page?: string | undefined; limit?: string | undefined }) {
  const page = Math.max(1, Number(raw.page ?? 1) || 1)
  const limit = Math.min(100, Math.max(1, Number(raw.limit ?? 20) || 20))
  return { page, limit }
}

// ─── Bitácora ────────────────────────────────────────────────────────────────

export const companyActivityRoute = defineRoute({
  access: REQUIRES("companies.companies.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/activity",
    summary: "La bitácora de la empresa",
    tags: ["Bitácora"],
    request: { params: companyParams, query: collectionQuery(activityQuery) },
    responses: {
      200: {
        description: "Asientos, del más reciente al más antiguo",
        content: { "application/json": { schema: pageSchema(activitySchema) } },
      },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    const page = await listCompanyActivity(actorOf(c), companyId, queryOf(c, activityQuery))
    return c.json(serializePage(page, serializeActivity), 200)
  },
})

export const myActivityRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/me/activity",
    summary: "Mi actividad, en todas mis empresas",
    tags: ["Bitácora"],
    request: { query: collectionQuery(activityQuery) },
    responses: {
      200: {
        description: "Asientos propios, de todas las empresas a las que se pertenece",
        content: { "application/json": { schema: pageSchema(activitySchema) } },
      },
    },
  },
  handler: async (c) => {
    const page = await listMyActivity(actorOf(c), queryOf(c, activityQuery))
    return c.json(serializePage(page, serializeActivity), 200)
  },
})

// ─── Bandeja ─────────────────────────────────────────────────────────────────

export const inboxRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/me/notifications",
    summary: "Mi bandeja",
    tags: ["Notificaciones"],
    request: { query: inboxQuery },
    responses: {
      200: {
        description: "Notificaciones, de la más reciente a la más antigua",
        content: { "application/json": { schema: pageSchema(notificationSchema) } },
      },
    },
  },
  handler: async (c) => {
    const query = c.req.valid("query")
    const { page, limit } = pageOf(query)
    const result = await listInbox(actorOf(c), query.filter ?? "all", page, limit)
    return c.json(serializePage(result, serializeNotification), 200)
  },
})

export const inboxCountsRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/me/notifications/counts",
    summary: "Cuántas sin leer, y cuántas nuevas desde la última vez",
    tags: ["Notificaciones"],
    responses: {
      200: {
        description: "El contador y el aviso de novedades",
        content: { "application/json": { schema: countsSchema } },
      },
    },
  },
  handler: async (c) => c.json(await inboxCounts(actorOf(c)), 200),
})

export const openInboxRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/me/notifications/open",
    summary: "Marcar la bandeja como vista",
    tags: ["Notificaciones"],
    responses: {
      200: {
        description: "El contador, ya sin novedades",
        content: { "application/json": { schema: countsSchema } },
      },
    },
  },
  handler: async (c) => c.json(await openInbox(actorOf(c)), 200),
})

export const readNotificationRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/me/notifications/{notificationId}/read",
    summary: "Marcar como leída, o como no leída",
    tags: ["Notificaciones"],
    request: {
      params: notificationParams,
      body: { content: { "application/json": { schema: z.object({ read: z.boolean() }) } } },
    },
    responses: {
      200: {
        description: "La notificación, con su estado nuevo",
        content: { "application/json": { schema: notificationSchema } },
      },
      404: { description: "No es suya, o no existe" },
    },
  },
  handler: async (c) => {
    const { notificationId } = c.req.valid("param")
    const { read } = c.req.valid("json")
    return c.json(serializeNotification(await setRead(actorOf(c), notificationId, read)), 200)
  },
})

export const archiveNotificationRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/me/notifications/{notificationId}/archive",
    summary: "Archivar o desarchivar",
    tags: ["Notificaciones"],
    request: {
      params: notificationParams,
      body: { content: { "application/json": { schema: z.object({ archived: z.boolean() }) } } },
    },
    responses: {
      200: {
        description: "La notificación, dentro o fuera de las activas",
        content: { "application/json": { schema: notificationSchema } },
      },
    },
  },
  handler: async (c) => {
    const { notificationId } = c.req.valid("param")
    const { archived } = c.req.valid("json")
    return c.json(
      serializeNotification(await setArchived(actorOf(c), notificationId, archived)),
      200,
    )
  },
})

// ─── Preferencias ────────────────────────────────────────────────────────────

export const preferencesRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/me/notification-preferences",
    summary: "Por qué canales quiero enterarme",
    tags: ["Notificaciones"],
    responses: {
      200: {
        description: "Todas las combinaciones, incluidas las que nunca se han tocado",
        content: { "application/json": { schema: preferencesSchema } },
      },
    },
  },
  handler: async (c) => {
    const items = await listPreferences(actorOf(c))
    return c.json(
      { items: items.map(serializePreference), available: [...availableChannels()] },
      200,
    )
  },
})

export const setPreferenceRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "put",
    path: "/me/notification-preferences",
    summary: "Encender o apagar un canal para una categoría",
    tags: ["Notificaciones"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              category: z.enum(CATEGORIES as unknown as [Category, ...Category[]]),
              channel: z.enum(CHANNELS as unknown as [Channel, ...Channel[]]),
              enabled: z.boolean(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "La preferencia, tal y como queda",
        content: { "application/json": { schema: preferenceSchema } },
      },
      403: { description: "Ese canal no se puede apagar" },
    },
  },
  handler: async (c) => {
    const { category, channel, enabled } = c.req.valid("json")
    const preference = await setPreference(actorOf(c), category, channel, enabled)
    return c.json(serializePreference(preference), 200)
  },
})

// ─── Dispositivos ────────────────────────────────────────────────────────────

export const devicesRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/me/push-devices",
    summary: "Mis navegadores registrados",
    tags: ["Notificaciones"],
    responses: {
      200: {
        description: "Dispositivos, del más reciente al más antiguo",
        content: { "application/json": { schema: z.object({ items: z.array(deviceSchema) }) } },
      },
    },
  },
  handler: async (c) => {
    const items = await listDevices(actorOf(c))
    return c.json({ items: items.map(serializeDevice) }, 200)
  },
})

export const registerDeviceRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/me/push-devices",
    summary: "Registrar este navegador para avisos",
    tags: ["Notificaciones"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              token: z.string().min(8).max(4096),
              userAgent: z.string().max(500).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Registrado. El mismo dispositivo dos veces no duplica",
        content: { "application/json": { schema: deviceSchema } },
      },
    },
  },
  handler: async (c) => {
    const { token, userAgent } = c.req.valid("json")
    const device = await registerDevice(
      actorOf(c),
      token,
      userAgent ?? c.req.header("user-agent") ?? undefined,
    )
    return c.json(serializeDevice(device), 201)
  },
})

export const revokeDeviceRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "delete",
    path: "/me/push-devices/{deviceId}",
    summary: "Dejar de recibir avisos en este navegador",
    tags: ["Notificaciones"],
    request: { params: deviceParams },
    responses: {
      204: { description: "Revocado" },
      404: { description: "No es suyo, o no existe" },
    },
  },
  handler: async (c) => {
    await revokeDevice(actorOf(c), c.req.valid("param").deviceId)
    return c.body(null, 204)
  },
})
