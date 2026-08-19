/**
 * Rutas de archivos.
 *
 * Rebanada 08. Ver `openspec/specs/media-storage/spec.md`.
 *
 * ## Por qué estas tres rutas no exigen una clave de permiso
 *
 * Registrar un archivo no es, por sí solo, una acción de dominio: lo que importa es **la entidad
 * que después lo referencia**, y ésa sí tiene su clave —publicar una foto de producto exige la de
 * producto, y adjuntar un comprobante, la del pago—. Una clave propia de «subir» no existe en el
 * catálogo, que está cerrado en las 255 migradas, y ampliarlo es decisión de producto.
 *
 * Lo que sí se exige es **pertenecer a la empresa** bajo cuyo prefijo se va a escribir, y eso lo
 * comprueba el motor: la clave del objeto empieza por el identificador de la empresa, y pedir un
 * archivo desde otra responde que no existe.
 */

import { z } from "@hono/zod-openapi"
import { UPLOAD_FAILURES, UPLOAD_KINDS, UPLOAD_VARIANTS } from "@tfv/contracts/media"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import { authorizeUpload, confirmUpload, reissueTargets } from "../media/uploads.ts"
import { AUTHENTICATED, defineRoute } from "../runtime/route.ts"

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

const companyParams = z.object({ companyId: z.string() })
const uploadParams = companyParams.extend({ uploadId: z.string() })

const uploadSchema = z.object({
  id: z.string(),
  kind: z.enum(UPLOAD_KINDS),
  status: z.enum(["pending", "uploaded", "error"]),
  url: z.string(),
  variants: z
    .object({
      thumbnail: z.string().nullable(),
      small: z.string().nullable(),
      medium: z.string().nullable(),
      large: z.string().nullable(),
    })
    .nullable(),
  fileName: z.string(),
  extension: z.string(),
  contentType: z.string(),
  byteSize: z.number(),
})

const targetSchema = z.object({
  variant: z.enum(UPLOAD_VARIANTS),
  method: z.literal("PUT"),
  /** Lleva el permiso dentro y sólo sirve para **este** objeto. */
  url: z.string(),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string(),
})

const authorizationSchema = z.object({
  upload: uploadSchema,
  targets: z.array(targetSchema),
})

function serialize(upload: Awaited<ReturnType<typeof authorizeUpload>>["upload"]) {
  return {
    id: upload.id,
    kind: upload.kind,
    status: upload.status,
    url: upload.url,
    variants: upload.variants,
    fileName: upload.fileName,
    extension: upload.extension,
    contentType: upload.contentType,
    byteSize: upload.byteSize,
  }
}

export const authorizeUploadRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/companies/{companyId}/uploads",
    summary: "Registrar un archivo y autorizar su escritura",
    tags: ["Archivos"],
    request: {
      params: companyParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              fileName: z.string().min(1).max(255),
              contentType: z.string().min(1).max(128),
              byteSize: z.number().int().positive(),
              /** Ausente, se deduce de la extensión. */
              kind: z.enum(UPLOAD_KINDS).optional(),
              /** Lo que el navegador va a producir para los derivados. Ausente, `image/jpeg`. */
              derivativeContentType: z.string().min(1).max(128).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description:
          "Registrado en estado pendiente, con una autorización por objeto: cinco para una " +
          "imagen o un video, una para lo demás",
        content: { "application/json": { schema: authorizationSchema } },
      },
      400: { description: "Nombre sin extensión, tipo incoherente o tamaño fuera de rango" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const result = await authorizeUpload(actorOf(c), params.companyId, c.req.valid("json"))
    return c.json({ upload: serialize(result.upload), targets: result.targets }, 201)
  },
})

export const reissueTargetsRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/companies/{companyId}/uploads/{uploadId}/targets",
    summary: "Volver a autorizar la escritura de un archivo pendiente",
    tags: ["Archivos"],
    request: {
      params: uploadParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({ derivativeContentType: z.string().min(1).max(128).optional() }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Autorizaciones nuevas para el mismo registro",
        content: { "application/json": { schema: authorizationSchema } },
      },
      409: { description: "El archivo ya no está pendiente" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const { derivativeContentType } = c.req.valid("json")
    const result = await reissueTargets(
      actorOf(c),
      params.companyId,
      params.uploadId,
      derivativeContentType,
    )
    return c.json({ upload: serialize(result.upload), targets: result.targets }, 200)
  },
})

export const confirmUploadRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/companies/{companyId}/uploads/{uploadId}/confirm",
    summary: "Decir qué se escribió de verdad",
    tags: ["Archivos"],
    request: {
      params: uploadParams,
      body: {
        content: {
          "application/json": {
            schema: z.union([
              z.object({ written: z.array(z.enum(UPLOAD_VARIANTS)).min(1) }),
              z.object({ failed: z.literal(true), reason: z.enum(UPLOAD_FAILURES).optional() }),
            ]),
          },
        },
      },
    },
    responses: {
      200: {
        description:
          "Subido, con las variantes que existan. Sin el original queda en erróneo, aunque " +
          "hayan entrado derivados",
        content: { "application/json": { schema: uploadSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const upload = await confirmUpload(
      actorOf(c),
      params.companyId,
      params.uploadId,
      c.req.valid("json"),
    )
    return c.json(serialize(upload), 200)
  },
})
