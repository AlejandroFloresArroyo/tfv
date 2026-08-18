/**
 * Rutas de prospectos.
 *
 * Ver `openspec/specs/user-accounts/spec.md`. Rebanada 10.
 *
 * La captura es **pública**: si exigiera cuenta no sería un formulario de contacto. La gestión y la
 * aceptación las lleva la administración de plataforma, y no por un permiso de empresa —un
 * prospecto no pertenece a ninguna—, sino por la misma comprobación que gobierna la taxonomía
 * global. Es un caso más de lo que ya está anotado allí: si el negocio quiere delegarlo, hace falta
 * una clave nueva en el catálogo.
 */

import { z } from "@hono/zod-openapi"
import { ForbiddenError, toInstant, toNullableInstant } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import {
  acceptProspect,
  captureProspect,
  discardProspect,
  listProspects,
  type ProspectRecord,
  prospectQuery,
  updateProspect,
} from "../auth/prospects.ts"
import { AUTHENTICATED, defineRoute, PUBLIC } from "../runtime/route.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

const prospectSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastname: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  companyName: z.string(),
  message: z.string(),
  acceptedAt: z.string().datetime().nullable(),
  acceptedById: z.string().nullable(),
  userId: z.string().nullable(),
  createdAt: z.string().datetime(),
})

function serialize(prospect: ProspectRecord) {
  return {
    ...prospect,
    acceptedAt: toNullableInstant(prospect.acceptedAt),
    createdAt: toInstant(prospect.createdAt),
  }
}

/**
 * La administración de plataforma, y sólo ella.
 *
 * Es la misma comprobación que la taxonomía global, por la misma razón: no hay permiso *de empresa*
 * que pueda autorizar algo que no pertenece a ninguna.
 */
function assertPlatform(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): void {
  if (!requireSession(c).isPlatformAdmin) {
    throw new ForbiddenError("Los prospectos los administra la plataforma")
  }
}

export const captureProspectRoute = defineRoute({
  access: PUBLIC("Es el formulario de contacto: exigir cuenta lo dejaría sin sentido"),
  config: {
    method: "post",
    path: "/prospects",
    summary: "Dejar los datos de contacto sin crear cuenta",
    tags: ["Acceso"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().trim().min(1).max(120),
              lastname: z.string().trim().max(120).optional(),
              email: z.string().email().max(320),
              phone: z.string().trim().max(40).optional(),
              companyName: z.string().trim().max(250).optional(),
              message: z.string().max(4000).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Registrado, con su acuse encolado. No se crea ninguna cuenta.",
        content: { "application/json": { schema: z.object({ message: z.string() }) } },
      },
    },
  },
  handler: async (c) => {
    await captureProspect(c.req.valid("json"))
    // No se devuelve el prospecto: quien envía el formulario no tiene por qué recibir de vuelta un
    // identificador con el que preguntar por él.
    return c.json({ message: "Gracias. Te contactaremos en breve." }, 201)
  },
})

export const listProspectsRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/prospects",
    summary: "La bandeja de contactos pendientes",
    tags: ["Acceso"],
    request: { query: collectionQuery(prospectQuery) },
    responses: {
      200: {
        description: "Sólo los que nadie ha aceptado ni descartado",
        content: { "application/json": { schema: pageSchema(prospectSchema) } },
      },
      403: { description: "No es administración de plataforma" },
    },
  },
  handler: async (c) => {
    assertPlatform(c)
    const page = await listProspects(queryOf(c, prospectQuery))
    return c.json(serializePage(page, serialize), 200)
  },
})

export const updateProspectRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "patch",
    path: "/prospects/{prospectId}",
    summary: "Corregir lo que llegó mal escrito",
    tags: ["Acceso"],
    request: {
      params: z.object({ prospectId: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().trim().min(1).max(120).optional(),
              lastname: z.string().trim().max(120).optional(),
              email: z.string().email().max(320).optional(),
              phone: z.string().trim().max(40).nullable().optional(),
              companyName: z.string().trim().max(250).optional(),
              message: z.string().max(4000).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Corregido",
        content: { "application/json": { schema: prospectSchema } },
      },
    },
  },
  handler: async (c) => {
    assertPlatform(c)
    const prospect = await updateProspect(c.req.valid("param").prospectId, c.req.valid("json"))
    return c.json(serialize(prospect), 200)
  },
})

export const discardProspectRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "delete",
    path: "/prospects/{prospectId}",
    summary: "Descartar un contacto",
    tags: ["Acceso"],
    request: { params: z.object({ prospectId: z.string() }) },
    responses: { 204: { description: "Descartado" } },
  },
  handler: async (c) => {
    assertPlatform(c)
    await discardProspect(c.req.valid("param").prospectId)
    return c.body(null, 204)
  },
})

/**
 * Aceptar un prospecto: crear su cuenta.
 *
 * **El enlace no vuelve en la respuesta.** Sólo llega al correo del titular, igual que en la
 * recuperación de contraseña: devolverlo aquí permitiría a quien acepta entrar en la cuenta ajena.
 */
export const acceptProspectRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/prospects/{prospectId}/acceptance",
    summary: "Convertir el prospecto en cuenta",
    tags: ["Acceso"],
    request: { params: z.object({ prospectId: z.string() }) },
    responses: {
      201: {
        description: "Cuenta creada y enlace encolado. El prospecto sale de la bandeja.",
        content: {
          "application/json": {
            schema: z.object({ userId: z.string(), prospect: prospectSchema }),
          },
        },
      },
      409: { description: "Ya se aceptó, o ya hay cuenta con ese correo" },
    },
  },
  handler: async (c) => {
    assertPlatform(c)
    const session = requireSession(c)
    const accepted = await acceptProspect(c.req.valid("param").prospectId, session.userId)
    return c.json({ userId: accepted.userId, prospect: serialize(accepted.prospect) }, 201)
  },
})
