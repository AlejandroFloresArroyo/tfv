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
  addContinuityItem,
  addContinuityVideo,
  addRecordingNote,
  assignCharacters,
  characterContinuity,
  closeRecording,
  createContinuity,
  createRecording,
  deleteContinuity,
  deleteRecording,
  deleteRecordingNote,
  getRecording,
  listRecordings,
  openRecording,
  RECORDING_KINDS,
  RECORDING_STATUSES,
  recordingQuery,
  setContinuityCharacter,
  setContinuityItems,
  setContinuityVideos,
  updateRecording,
  updateRecordingNote,
} from "../productions/continuity.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const companyParams = z.object({ companyId: z.string() })
const productionParams = companyParams.extend({ productionId: z.string() })
const recordingParams = productionParams.extend({ recordingId: z.string() })
const continuityParams = recordingParams.extend({ continuityId: z.string() })

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

const propSchema = z.object({
  id: z.string(),
  continuityId: z.string(),
  kind: z.enum(["item", "video"]),
  itemId: z.string().nullable(),
  videoId: z.string().nullable(),
  name: z.string(),
  code: z.string().nullable(),
  createdAt: z.string(),
})

const continuitySchema = z.object({
  id: z.string(),
  recordingId: z.string(),
  characterId: z.string().nullable(),
  characterName: z.string().nullable(),
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  props: z.array(propSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const noteSchema = z.object({
  id: z.string(),
  recordingId: z.string(),
  body: z.string(),
  authorId: z.string().nullable(),
  authorName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const sceneSchema = z.object({
  id: z.string(),
  name: z.string(),
  index: z.number().int(),
  chapter: z.object({ id: z.string(), name: z.string(), index: z.number().int() }),
})

const recordingDetailSchema = recordingSchema.extend({
  scene: sceneSchema.nullable(),
  continuities: z.array(continuitySchema),
  notes: z.array(noteSchema),
})

const characterHistorySchema = z.object({
  characterId: z.string(),
  characterName: z.string(),
  recordings: z.array(
    z.object({
      recordingId: z.string(),
      recordingName: z.string(),
      kind: z.enum(RECORDING_KINDS),
      status: z.enum(RECORDING_STATUSES),
      sceneId: z.string().nullable(),
      sceneName: z.string().nullable(),
      chapterName: z.string().nullable(),
      continuityId: z.string(),
      props: z.array(propSchema),
    }),
  ),
})

const characterParams = productionParams.extend({ characterId: z.string() })

const noteParams = recordingParams.extend({ noteId: z.string() })

/** El cuaderno del script: texto libre, y hay que poder escribir rápido. */
const noteBody = z.object({ body: z.string().trim().min(1, "La nota está vacía").max(10_000) })

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

function serializeRecording(row: Awaited<ReturnType<typeof createRecording>>) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

function serializeProp(row: Awaited<ReturnType<typeof addContinuityItem>>) {
  return { ...row, createdAt: toInstant(row.createdAt) }
}

function serializeContinuity(row: Awaited<ReturnType<typeof createContinuity>>) {
  return {
    ...row,
    props: row.props.map(serializeProp),
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  }
}

function serializeNote(row: Awaited<ReturnType<typeof addRecordingNote>>) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

function serializeDetail(row: Awaited<ReturnType<typeof getRecording>>) {
  return {
    ...serializeRecording(row),
    scene: row.scene,
    continuities: row.continuities.map(serializeContinuity),
    notes: row.notes.map(serializeNote),
  }
}

function serializeHistory(row: Awaited<ReturnType<typeof characterContinuity>>) {
  return {
    ...row,
    recordings: row.recordings.map((entry) => ({
      ...entry,
      props: entry.props.map(serializeProp),
    })),
  }
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
        description: "La jornada, con sus continuidades",
        content: { "application/json": { schema: recordingDetailSchema } },
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
    return c.json(serializeDetail(recording), 200)
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

// ─── El reparto de la jornada ────────────────────────────────────────────────

export const assignCharactersRoute = defineRoute({
  access: REQUIRES("productions.recordings.characters"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}/characters",
    summary: "Asignar personajes a una jornada de rodaje",
    tags: ["Continuidad"],
    request: {
      params: recordingParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({ characterIds: z.array(z.string()).max(500) }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "La jornada en curso, con una continuidad por personaje",
        content: { "application/json": { schema: recordingDetailSchema } },
      },
      404: { description: "La jornada no existe, o alguno de los personajes no es suyo" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const recording = await assignCharacters(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
      c.req.valid("json").characterIds,
    )
    return c.json(serializeDetail(recording), 200)
  },
})

// ─── Continuidades ───────────────────────────────────────────────────────────

export const createContinuityRoute = defineRoute({
  access: REQUIRES("productions.continuities.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities",
    summary: "Abrir una continuidad en una jornada",
    tags: ["Continuidad"],
    request: {
      params: recordingParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              characterId: z.string().nullable().optional(),
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Continuidad abierta. Sin personaje si no se indicó ninguno",
        content: { "application/json": { schema: continuitySchema } },
      },
      404: { description: "La jornada no existe, o el personaje no es de esta producción" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const continuity = await createContinuity(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
      c.req.valid("json"),
    )
    return c.json(serializeContinuity(continuity), 201)
  },
})

/**
 * Poner o retirar el personaje.
 *
 * Clave propia —`productions.continuities.character`— porque decidir a quién pertenece lo que se
 * registró es una decisión distinta de registrarlo.
 */
export const setContinuityCharacterRoute = defineRoute({
  access: REQUIRES("productions.continuities.character"),
  config: {
    method: "put",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}/character",
    summary: "Poner o retirar el personaje de una continuidad",
    tags: ["Continuidad"],
    request: {
      params: continuityParams,
      body: {
        content: {
          "application/json": { schema: z.object({ characterId: z.string().nullable() }) },
        },
      },
    },
    responses: {
      200: {
        description: "La continuidad. Sigue existiendo aunque se le retire el personaje",
        content: { "application/json": { schema: continuitySchema } },
      },
      404: { description: "No existe, o el personaje no es de esta producción" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const continuity = await setContinuityCharacter(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
      params.continuityId,
      c.req.valid("json").characterId,
    )
    return c.json(serializeContinuity(continuity), 200)
  },
})

export const deleteContinuityRoute = defineRoute({
  access: REQUIRES("productions.continuities.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}",
    summary: "Eliminar una continuidad",
    tags: ["Continuidad"],
    request: { params: continuityParams },
    responses: {
      204: { description: "Eliminada, con su utilería. Los artículos y los videos siguen ahí" },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteContinuity(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
      params.continuityId,
    )
    return c.body(null, 204)
  },
})

export const deleteRecordingRoute = defineRoute({
  access: REQUIRES("productions.recordings.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}",
    summary: "Dar de baja una jornada de rodaje",
    tags: ["Continuidad"],
    request: { params: recordingParams },
    responses: {
      204: {
        description: "Dada de baja, con sus continuidades. Los artículos y videos siguen ahí",
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteRecording(actorOf(c), params.companyId, params.productionId, params.recordingId)
    return c.body(null, 204)
  },
})

// ─── Cómo apareció un personaje a lo largo del rodaje ────────────────────────

/**
 * El historial de un personaje.
 *
 * Cuelga del personaje y no de la jornada porque la pregunta es del personaje —«¿cómo iba Marta en
 * marzo?»—, pero **lo que devuelve es continuidad**, así que la clave es
 * `productions.continuities.view` y no una de personajes: quien no puede ver la continuidad de una
 * jornada tampoco puede verla enumerada por personaje.
 */
export const characterContinuityRoute = defineRoute({
  access: REQUIRES("productions.continuities.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/characters/{characterId}/continuity",
    summary: "Ver cómo apareció un personaje a lo largo del rodaje",
    tags: ["Continuidad"],
    request: { params: characterParams },
    responses: {
      200: {
        description: "Las jornadas en las que aparece, con la utilería registrada en cada una",
        content: { "application/json": { schema: characterHistorySchema } },
      },
      404: { description: "El personaje no existe en esta producción" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const history = await characterContinuity(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.characterId,
    )
    return c.json(serializeHistory(history), 200)
  },
})

// ─── Notas de la jornada ─────────────────────────────────────────────────────

/**
 * Las tres notas comparten clave —`productions.recordings.notes`—, y es correcto.
 *
 * El catálogo trae una sola para las tres operaciones, y no se reparte por verbo lo que el catálogo
 * dio junto: quien puede anotar puede corregir lo que anotó. Lo que **no** se hace es colapsarla
 * con `edit`, que gobierna la jornada: anotar durante el rodaje es lo que hace el script, y mover
 * la jornada de escena o de responsable es de quien la programa.
 */
export const addRecordingNoteRoute = defineRoute({
  access: REQUIRES("productions.recordings.notes"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}/notes",
    summary: "Anotar una jornada de rodaje",
    tags: ["Continuidad"],
    request: {
      params: recordingParams,
      body: { content: { "application/json": { schema: noteBody } } },
    },
    responses: {
      201: {
        description: "La nota, con su autor y su instante",
        content: { "application/json": { schema: noteSchema } },
      },
      404: { description: "La jornada no existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const note = await addRecordingNote(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
      c.req.valid("json").body,
    )
    return c.json(serializeNote(note), 201)
  },
})

export const updateRecordingNoteRoute = defineRoute({
  access: REQUIRES("productions.recordings.notes"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}/notes/{noteId}",
    summary: "Corregir una nota de la jornada",
    tags: ["Continuidad"],
    request: {
      params: noteParams,
      body: { content: { "application/json": { schema: noteBody } } },
    },
    responses: {
      200: {
        description: "La nota corregida",
        content: { "application/json": { schema: noteSchema } },
      },
      404: { description: "No existe, o no es de esta jornada" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const note = await updateRecordingNote(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
      params.noteId,
      c.req.valid("json").body,
    )
    return c.json(serializeNote(note), 200)
  },
})

export const deleteRecordingNoteRoute = defineRoute({
  access: REQUIRES("productions.recordings.notes"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}/notes/{noteId}",
    summary: "Eliminar una nota de la jornada",
    tags: ["Continuidad"],
    request: { params: noteParams },
    responses: {
      204: { description: "Eliminada" },
      404: { description: "No existe, o no es de esta jornada" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteRecordingNote(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
      params.noteId,
    )
    return c.body(null, 204)
  },
})

// ─── La utilería de una continuidad ──────────────────────────────────────────

/**
 * Los cuatro caminos de la utilería, dos por tipo.
 *
 * `POST` cuelga una pieza; `PUT` establece el conjunto entero. Y hay **un camino por tipo**, no uno
 * que reciba los dos y decida: así «artículo o video, nunca ambos ni ninguno» no es una
 * comprobación que se pueda olvidar, sino una forma que no se puede escribir.
 *
 * Es además lo que hace ejercibles las dos claves que el catálogo separa: quien lleva el vestuario
 * cuelga artículos, y quien documenta con referencias visuales cuelga videos.
 */
export const addContinuityItemRoute = defineRoute({
  access: REQUIRES("productions.continuities.products"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}/items",
    summary: "Colgar un artículo de una continuidad",
    tags: ["Continuidad"],
    request: {
      params: continuityParams,
      body: {
        content: { "application/json": { schema: z.object({ itemId: z.string() }) } },
      },
    },
    responses: {
      201: {
        description: "La pieza de utilería, con el artículo resuelto",
        content: { "application/json": { schema: propSchema } },
      },
      404: { description: "La continuidad no existe, o el artículo no es de esta producción" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const prop = await addContinuityItem(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
      params.continuityId,
      c.req.valid("json").itemId,
    )
    return c.json(serializeProp(prop), 201)
  },
})

export const setContinuityItemsRoute = defineRoute({
  access: REQUIRES("productions.continuities.products"),
  config: {
    method: "put",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}/items",
    summary: "Establecer el conjunto de artículos de una continuidad",
    tags: ["Continuidad"],
    request: {
      params: continuityParams,
      body: {
        content: {
          "application/json": { schema: z.object({ itemIds: z.array(z.string()).max(500) }) },
        },
      },
    },
    responses: {
      200: {
        description: "La continuidad. Las piezas de video siguen donde estaban",
        content: { "application/json": { schema: continuitySchema } },
      },
      404: { description: "No existe, o alguno de los artículos no es de esta producción" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const continuity = await setContinuityItems(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
      params.continuityId,
      c.req.valid("json").itemIds,
    )
    return c.json(serializeContinuity(continuity), 200)
  },
})

export const addContinuityVideoRoute = defineRoute({
  access: REQUIRES("productions.continuities.videos"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}/videos",
    summary: "Colgar un video de referencia de una continuidad",
    tags: ["Continuidad"],
    request: {
      params: continuityParams,
      body: {
        content: { "application/json": { schema: z.object({ videoId: z.string() }) } },
      },
    },
    responses: {
      201: {
        description: "La pieza de utilería, con el video resuelto",
        content: { "application/json": { schema: propSchema } },
      },
      404: { description: "La continuidad no existe, o el video no es de esta producción" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const prop = await addContinuityVideo(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
      params.continuityId,
      c.req.valid("json").videoId,
    )
    return c.json(serializeProp(prop), 201)
  },
})

export const setContinuityVideosRoute = defineRoute({
  access: REQUIRES("productions.continuities.videos"),
  config: {
    method: "put",
    path: "/companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}/videos",
    summary: "Establecer el conjunto de videos de una continuidad",
    tags: ["Continuidad"],
    request: {
      params: continuityParams,
      body: {
        content: {
          "application/json": { schema: z.object({ videoIds: z.array(z.string()).max(500) }) },
        },
      },
    },
    responses: {
      200: {
        description: "La continuidad. Las piezas de artículo siguen donde estaban",
        content: { "application/json": { schema: continuitySchema } },
      },
      404: { description: "No existe, o alguno de los videos no es de esta producción" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const continuity = await setContinuityVideos(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.recordingId,
      params.continuityId,
      c.req.valid("json").videoIds,
    )
    return c.json(serializeContinuity(continuity), 200)
  },
})
