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
  createScript,
  deleteScript,
  getScript,
  listScripts,
  SYNC_STATUSES,
  scriptQuery,
  scriptScope,
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

const productionParams = z.object({ companyId: z.string(), productionId: z.string() })
const scriptParams = productionParams.extend({ scriptId: z.string() })

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
