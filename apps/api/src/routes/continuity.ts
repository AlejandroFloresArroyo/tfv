/**
 * Rutas de continuidad de rodaje.
 *
 * Rebanada 22, la parte de continuidad. Ver `openspec/specs/continuity-tracking/spec.md`.
 *
 * ## Dos familias de permisos para dos cosas distintas
 *
 * `productions.recordings.*` gobierna la jornada —programarla, editarla, asignarle reparto,
 * anotarla, cerrarla y reabrirla— y `productions.continuities.*` lo que se registra dentro de
 * ella. Están separadas en el catálogo cerrado de 255 claves porque en un rodaje son papeles
 * distintos: quien programa el día no es quien anota, plano a plano, con qué chaqueta salió cada
 * personaje.
 *
 * Dentro de la continuidad la separación va más fina todavía, y se respeta: el personaje
 * (`character`), los artículos (`products`) y los videos (`videos`) tienen cada uno su clave.
 *
 * ## La utilería no se declara en el cuerpo, se declara en la dirección
 *
 * No hay una ruta de «pieza de utilería» que reciba un artículo y un video y decida. Hay dos
 * caminos, uno por tipo, y cada uno con su clave. Así la exclusión —artículo **o** video, nunca
 * ambos ni ninguno— no depende de que un manejador se acuerde de comprobarla: **no se puede
 * expresar**. Debajo la sostienen el tipo del módulo y, al fondo, la restricción de comprobación
 * `production_props_item_xor_video` del motor.
 */

import { z } from "@hono/zod-openapi"
import { toInstant } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import {
  closeRecording,
  createRecording,
  getRecording,
  listRecordings,
  openRecording,
  RECORDING_KINDS,
  RECORDING_STATUSES,
  recordingQuery,
  updateRecording,
} from "../productions/continuity.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const companyParams = z.object({ companyId: z.string() })
const productionParams = companyParams.extend({ productionId: z.string() })
const recordingParams = productionParams.extend({ recordingId: z.string() })

const nameField = z.string().trim().min(1, "El nombre es obligatorio").max(250)

const recordingSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  sceneId: z.string().nullable(),
  name: z.string(),
  kind: z.enum(RECORDING_KINDS),
  status: z.enum(RECORDING_STATUSES),
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  continuityCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

function serializeRecording(row: Awaited<ReturnType<typeof getRecording>>) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

// ─── Jornadas de rodaje ──────────────────────────────────────────────────────

export const listRecordingsRoute = defineRoute({
  access: REQUIRES("productions.recordings.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/recordings",
    summary: "Listar las jornadas de rodaje de una producción",
    tags: ["Continuidad"],
    request: { params: productionParams, query: collectionQuery(recordingQuery) },
    responses: {
      200: {
        description: "Jornadas, de la más reciente a la más antigua",
        content: { "application/json": { schema: pageSchema(recordingSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listRecordings(
      actorOf(c),
      params.companyId,
      params.productionId,
      queryOf(c, recordingQuery),
    )
    return c.json(serializePage(page, serializeRecording), 200)
  },
})

export const createRecordingRoute = defineRoute({
  access: REQUIRES("productions.recordings.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/recordings",
    summary: "Programar una jornada de rodaje",
    tags: ["Continuidad"],
    request: {
      params: productionParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              sceneId: z.string().nullable().optional(),
              kind: z.enum(RECORDING_KINDS).optional(),
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Jornada programada, en borrador",
        content: { "application/json": { schema: recordingSchema } },
      },
      404: { description: "La producción no existe, o la escena no es suya" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const recording = await createRecording(
      actorOf(c),
      params.companyId,
      params.productionId,
      c.req.valid("json"),
    )
    return c.json(serializeRecording(recording), 201)
  },
})

export const getRecordingRoute = defineRoute({
  access: REQUIRES("productions.recordings.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}",
    summary: "Ver una jornada de rodaje",
    tags: ["Continuidad"],
    request: { params: recordingParams },
    responses: {
      200: {
        description: "La jornada",
        content: { "application/json": { schema: recordingSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const recording = await getRecording(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
    )
    return c.json(serializeRecording(recording), 200)
  },
})

export const updateRecordingRoute = defineRoute({
  access: REQUIRES("productions.recordings.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}",
    summary: "Editar una jornada de rodaje",
    tags: ["Continuidad"],
    request: {
      params: recordingParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              sceneId: z.string().nullable().optional(),
              kind: z.enum(RECORDING_KINDS).optional(),
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Jornada actualizada",
        content: { "application/json": { schema: recordingSchema } },
      },
      404: { description: "No existe, o la escena no es de esta producción" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const recording = await updateRecording(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
      c.req.valid("json"),
    )
    return c.json(serializeRecording(recording), 200)
  },
})

/**
 * Cerrar la jornada.
 *
 * **No exige que la continuidad esté completa.** El motivo está escrito en la cabecera de
 * `productions/continuity.ts`, que es donde alguien iría a añadir la validación.
 */
export const closeRecordingRoute = defineRoute({
  access: REQUIRES("productions.recordings.close"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}/close",
    summary: "Cerrar una jornada de rodaje",
    tags: ["Continuidad"],
    request: { params: recordingParams },
    responses: {
      200: {
        description: "Jornada completada",
        content: { "application/json": { schema: recordingSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const recording = await closeRecording(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
    )
    return c.json(serializeRecording(recording), 200)
  },
})

export const openRecordingRoute = defineRoute({
  access: REQUIRES("productions.recordings.open"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}/open",
    summary: "Volver a abrir una jornada de rodaje",
    tags: ["Continuidad"],
    request: { params: recordingParams },
    responses: {
      200: {
        description: "Jornada en curso",
        content: { "application/json": { schema: recordingSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const recording = await openRecording(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
    )
    return c.json(serializeRecording(recording), 200)
  },
})
