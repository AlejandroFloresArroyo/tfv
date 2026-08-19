/**
 * Rutas del desglose del guion.
 *
 * Rebanada 20, sección «Desglose» de `openspec/changes/migrate-productions-core/tasks.md`.
 *
 * ## Tres familias de permisos, y una clave que aquí no se ejerce
 *
 * `productions.pdfs.*` gobierna los guiones —el catálogo los llama así porque en la pila anterior
 * un guion era un PDF—, `productions.chapters.*` los capítulos y `productions.scenes.*` las
 * escenas. Están separadas porque en un rodaje las escribe gente distinta: quien sube el guion es
 * producción, quien numera capítulos y escenas es continuidad.
 *
 * La cuarta clave de guiones, `productions.pdfs.sync`, **no la exige ninguna ruta de este archivo**
 * y es correcto: la extracción asistida es `script-ai-sync`, rebanada 21. Aparece aquí escrito para
 * que su ausencia se lea como una decisión y no como un olvido.
 *
 * ## Las consultas de índice van antes que la ficha
 *
 * Por el mismo motivo que el panel de la producción: nada garantiza que un identificador no se
 * parezca a `indices`. El orden de registro está en `routes/index.ts`, que es donde se resuelve.
 */

import { z } from "@hono/zod-openapi"
import { toInstant, toNullableInstant } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import {
  chapterQuery,
  chapterScope,
  createChapter,
  createScene,
  createScript,
  deleteChapter,
  deleteScene,
  deleteScript,
  getChapter,
  getScene,
  getScript,
  listChapters,
  listProductionScenes,
  listScenes,
  listScripts,
  SYNC_STATUSES,
  sceneQuery,
  sceneScope,
  scriptQuery,
  scriptScope,
  updateChapter,
  updateScene,
  updateScript,
} from "../productions/script.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const scriptSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  name: z.string(),
  index: z.number().int(),
  documentUploadId: z.string().nullable(),
  documentUrl: z.string().nullable(),
  documentFileName: z.string().nullable(),
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  syncStatus: z.enum(SYNC_STATUSES),
  syncError: z.string().nullable(),
  syncedAt: z.string().nullable(),
  scenesWithoutBody: z.number().int(),
  chapterCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const chapterSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  scriptId: z.string().nullable(),
  name: z.string(),
  synopsis: z.string(),
  index: z.number().int(),
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  sceneCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const sceneSchema = z.object({
  id: z.string(),
  chapterId: z.string(),
  chapterIndex: z.number().int(),
  name: z.string(),
  synopsis: z.string(),
  index: z.number().int(),
  label: z.string(),
  workflowCount: z.number().int(),
  synopsisEditedAt: z.string().nullable(),
  missingFromLastSync: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const productionParams = z.object({ companyId: z.string(), productionId: z.string() })
const scriptParams = productionParams.extend({ scriptId: z.string() })
const chapterParams = productionParams.extend({ chapterId: z.string() })
const sceneParams = chapterParams.extend({ sceneId: z.string() })

const nameField = z.string().trim().min(1, "El nombre es obligatorio").max(250)

/**
 * El índice de un guion, de una escena o de un capítulo.
 *
 * Entero y **no negativo**. No se acota por arriba: el número lo elige quien desglosa, y una serie
 * larga puede numerar por centenas.
 */
const indexField = z.number().int().min(0)

/** `null` lo retira e invalida la extracción; omitirlo lo deja como está. */
const documentInput = z.string().nullable().optional()

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

function serializeScript(row: Awaited<ReturnType<typeof getScript>>) {
  return {
    ...row,
    syncedAt: toNullableInstant(row.syncedAt),
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  }
}

function serializeChapter(row: Awaited<ReturnType<typeof getChapter>>) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

function serializeScene(row: Awaited<ReturnType<typeof getScene>>) {
  return {
    ...row,
    synopsisEditedAt: toNullableInstant(row.synopsisEditedAt),
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  }
}

// ─── Guiones ─────────────────────────────────────────────────────────────────

export const listScriptsRoute = defineRoute({
  access: REQUIRES("productions.pdfs.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/scripts",
    summary: "Listar los guiones de una producción",
    tags: ["Producciones"],
    request: { params: productionParams, query: collectionQuery(scriptQuery) },
    responses: {
      200: {
        description: "Guiones, por índice",
        content: { "application/json": { schema: pageSchema(scriptSchema) } },
      },
      404: { description: "La producción no existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listScripts(
      actorOf(c),
      params.companyId,
      params.productionId,
      queryOf(c, scriptQuery),
    )
    return c.json(serializePage(page, serializeScript), 200)
  },
})

export const createScriptRoute = defineRoute({
  access: REQUIRES("productions.pdfs.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/scripts",
    summary: "Registrar un guion",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              index: indexField.optional(),
              documentUploadId: documentInput,
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Guion registrado, y marcado como no extraído",
        content: { "application/json": { schema: scriptSchema } },
      },
      404: { description: "La producción o el archivo no existen" },
      422: { description: "El archivo no es un documento, o no llegó a subirse" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const script = await createScript(
      actorOf(c),
      params.companyId,
      params.productionId,
      c.req.valid("json"),
    )
    return c.json(serializeScript(script), 201)
  },
})

export const getScriptRoute = defineRoute({
  access: REQUIRES("productions.pdfs.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/scripts/{scriptId}",
    summary: "Ver un guion",
    tags: ["Producciones"],
    request: { params: scriptParams },
    responses: {
      200: {
        description: "El guion",
        content: { "application/json": { schema: scriptSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const script = await getScript(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.scriptId,
    )
    return c.json(serializeScript(script), 200)
  },
})

export const updateScriptRoute = defineRoute({
  access: REQUIRES("productions.pdfs.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/scripts/{scriptId}",
    summary: "Editar un guion, o sustituir su archivo",
    tags: ["Producciones"],
    request: {
      params: scriptParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              index: indexField.optional(),
              documentUploadId: documentInput,
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Guion actualizado. Sustituir el archivo lo devuelve a «no extraído»",
        content: { "application/json": { schema: scriptSchema } },
      },
      404: { description: "El guion o el archivo no existen" },
      422: { description: "El archivo no es un documento, o no llegó a subirse" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const script = await updateScript(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.scriptId,
      c.req.valid("json"),
    )
    return c.json(serializeScript(script), 200)
  },
})

export const scriptScopeRoute = defineRoute({
  access: REQUIRES("productions.pdfs.delete"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/scripts/{scriptId}/scope",
    summary: "Qué se desvincula al dar de baja el guion",
    tags: ["Producciones"],
    request: { params: scriptParams },
    responses: {
      200: {
        description: "Los capítulos que se quedarán sin guion. No se eliminan",
        content: { "application/json": { schema: z.object({ chapters: z.number().int() }) } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scope = await scriptScope(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.scriptId,
    )
    return c.json(scope, 200)
  },
})

export const deleteScriptRoute = defineRoute({
  access: REQUIRES("productions.pdfs.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/scripts/{scriptId}",
    summary: "Dar de baja un guion",
    tags: ["Producciones"],
    request: { params: scriptParams },
    responses: {
      204: { description: "Dado de baja. Sus capítulos se quedan, sin guion" },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteScript(actorOf(c), params.companyId, params.productionId, params.scriptId)
    return c.body(null, 204)
  },
})

// ─── Capítulos ───────────────────────────────────────────────────────────────

export const listChaptersRoute = defineRoute({
  access: REQUIRES("productions.chapters.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/chapters",
    summary: "Listar los capítulos de una producción",
    tags: ["Producciones"],
    request: { params: productionParams, query: collectionQuery(chapterQuery) },
    responses: {
      200: {
        description: "Capítulos, por índice",
        content: { "application/json": { schema: pageSchema(chapterSchema) } },
      },
      404: { description: "La producción no existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listChapters(
      actorOf(c),
      params.companyId,
      params.productionId,
      queryOf(c, chapterQuery),
    )
    return c.json(serializePage(page, serializeChapter), 200)
  },
})

export const createChapterRoute = defineRoute({
  access: REQUIRES("productions.chapters.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/chapters",
    summary: "Crear un capítulo",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              index: indexField,
              synopsis: z.string().max(4000).optional(),
              scriptId: z.string().nullable().optional(),
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Capítulo creado",
        content: { "application/json": { schema: chapterSchema } },
      },
      404: { description: "La producción o el guion no existen" },
      409: { description: "Ese número de capítulo ya existe en la producción" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const chapter = await createChapter(
      actorOf(c),
      params.companyId,
      params.productionId,
      c.req.valid("json"),
    )
    return c.json(serializeChapter(chapter), 201)
  },
})

export const getChapterRoute = defineRoute({
  access: REQUIRES("productions.chapters.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/chapters/{chapterId}",
    summary: "Ver un capítulo",
    tags: ["Producciones"],
    request: { params: chapterParams },
    responses: {
      200: {
        description: "El capítulo, con su recuento de escenas",
        content: { "application/json": { schema: chapterSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const chapter = await getChapter(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.chapterId,
    )
    return c.json(serializeChapter(chapter), 200)
  },
})

export const updateChapterRoute = defineRoute({
  access: REQUIRES("productions.chapters.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/chapters/{chapterId}",
    summary: "Editar un capítulo",
    tags: ["Producciones"],
    request: {
      params: chapterParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              index: indexField.optional(),
              synopsis: z.string().max(4000).optional(),
              scriptId: z.string().nullable().optional(),
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Capítulo actualizado",
        content: { "application/json": { schema: chapterSchema } },
      },
      404: { description: "El capítulo o el guion no existen" },
      409: { description: "Ese número de capítulo ya existe en la producción" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const chapter = await updateChapter(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.chapterId,
      c.req.valid("json"),
    )
    return c.json(serializeChapter(chapter), 200)
  },
})

export const chapterScopeRoute = defineRoute({
  access: REQUIRES("productions.chapters.delete"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scope",
    summary: "Qué se lleva por delante dar de baja el capítulo",
    tags: ["Producciones"],
    request: { params: chapterParams },
    responses: {
      200: {
        description:
          "Las escenas se van con él; las jornadas y los planes sobreviven, sin escena y en su estado inicial",
        content: {
          "application/json": {
            schema: z.object({
              scenes: z.number().int(),
              recordings: z.number().int(),
              workflows: z.number().int(),
            }),
          },
        },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scope = await chapterScope(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.chapterId,
    )
    return c.json(scope, 200)
  },
})

export const deleteChapterRoute = defineRoute({
  access: REQUIRES("productions.chapters.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/chapters/{chapterId}",
    summary: "Dar de baja un capítulo y sus escenas",
    tags: ["Producciones"],
    request: { params: chapterParams },
    responses: {
      204: {
        description:
          "Dado de baja con sus escenas. Los índices de los demás capítulos no se mueven",
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteChapter(actorOf(c), params.companyId, params.productionId, params.chapterId)
    return c.body(null, 204)
  },
})

// ─── Escenas ─────────────────────────────────────────────────────────────────

export const listScenesRoute = defineRoute({
  access: REQUIRES("productions.scenes.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scenes",
    summary: "Listar las escenas de un capítulo",
    tags: ["Producciones"],
    request: { params: chapterParams, query: collectionQuery(sceneQuery) },
    responses: {
      200: {
        description: "Escenas, por índice",
        content: { "application/json": { schema: pageSchema(sceneSchema) } },
      },
      404: { description: "El capítulo no existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listScenes(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.chapterId,
      queryOf(c, sceneQuery),
    )
    return c.json(serializePage(page, serializeScene), 200)
  },
})

export const listProductionScenesRoute = defineRoute({
  access: REQUIRES("productions.scenes.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/scenes",
    summary: "Listar todas las escenas de una producción, atravesando sus capítulos",
    tags: ["Producciones"],
    request: { params: productionParams, query: collectionQuery(sceneQuery) },
    responses: {
      200: {
        description: "Escenas de toda la producción, por capítulo y dentro por índice",
        content: { "application/json": { schema: pageSchema(sceneSchema) } },
      },
      404: { description: "La producción no existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listProductionScenes(
      actorOf(c),
      params.companyId,
      params.productionId,
      queryOf(c, sceneQuery),
    )
    return c.json(serializePage(page, serializeScene), 200)
  },
})

export const createSceneRoute = defineRoute({
  access: REQUIRES("productions.scenes.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scenes",
    summary: "Crear una escena en un capítulo",
    tags: ["Producciones"],
    request: {
      params: chapterParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              index: indexField,
              synopsis: z.string().max(4000).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Escena creada, con su etiqueta compuesta",
        content: { "application/json": { schema: sceneSchema } },
      },
      404: { description: "El capítulo no existe, o está fuera del alcance del solicitante" },
      409: { description: "Ese número de escena ya existe en el capítulo" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scene = await createScene(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.chapterId,
      c.req.valid("json"),
    )
    return c.json(serializeScene(scene), 201)
  },
})

export const getSceneRoute = defineRoute({
  access: REQUIRES("productions.scenes.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scenes/{sceneId}",
    summary: "Ver una escena",
    tags: ["Producciones"],
    request: { params: sceneParams },
    responses: {
      200: {
        description: "La escena, con su etiqueta compuesta y su recuento de planes",
        content: { "application/json": { schema: sceneSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scene = await getScene(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.chapterId,
      params.sceneId,
    )
    return c.json(serializeScene(scene), 200)
  },
})

export const updateSceneRoute = defineRoute({
  access: REQUIRES("productions.scenes.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scenes/{sceneId}",
    summary: "Editar una escena",
    tags: ["Producciones"],
    request: {
      params: sceneParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              index: indexField.optional(),
              synopsis: z.string().max(4000).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Escena actualizada. Corregir la sinopsis deja marca de edición manual",
        content: { "application/json": { schema: sceneSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
      409: { description: "Ese número de escena ya existe en el capítulo" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scene = await updateScene(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.chapterId,
      params.sceneId,
      c.req.valid("json"),
    )
    return c.json(serializeScene(scene), 200)
  },
})

export const sceneScopeRoute = defineRoute({
  access: REQUIRES("productions.scenes.delete"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scenes/{sceneId}/scope",
    summary: "Qué se queda sin escena al dar de baja ésta",
    tags: ["Producciones"],
    request: { params: sceneParams },
    responses: {
      200: {
        description:
          "Jornadas y planes que se quedarán sin escena. Sobreviven, en su estado inicial",
        content: {
          "application/json": {
            schema: z.object({ recordings: z.number().int(), workflows: z.number().int() }),
          },
        },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scope = await sceneScope(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.chapterId,
      params.sceneId,
    )
    return c.json(scope, 200)
  },
})

export const deleteSceneRoute = defineRoute({
  access: REQUIRES("productions.scenes.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scenes/{sceneId}",
    summary: "Dar de baja una escena",
    tags: ["Producciones"],
    request: { params: sceneParams },
    responses: {
      204: {
        description:
          "Dada de baja. Las jornadas y los planes que la referenciaban sobreviven, sin escena y en su estado inicial",
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteScene(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.chapterId,
      params.sceneId,
    )
    return c.body(null, 204)
  },
})
