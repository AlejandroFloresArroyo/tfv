/**
 * Rutas de sitios, la mitad con sesión.
 *
 * Rebanada 19. Las públicas —las que atiende quien no tiene cuenta— viven en `storefront.ts`, y la
 * separación es deliberada: son dos superficies con dos regímenes distintos, y tenerlas en el mismo
 * archivo invita a que un manejador acabe compartiendo con el otro un esquema que enseña de más.
 *
 * Publicar y despublicar no son verbos aparte: son `isPublished` en la modificación. Un endpoint
 * `POST /publish` obligaría a duplicar la comprobación de permiso y a inventar qué significa
 * publicar dos veces; la marca no tiene ese problema y ya es idempotente.
 */

import { z } from "@hono/zod-openapi"
import { toInstant } from "@tfv/contracts"
import { WEBSITE_VERTICALS } from "@tfv/contracts/storefront"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import {
  createWebsite,
  deleteWebsite,
  getWebsite,
  listWebsites,
  slugAvailability,
  updateWebsite,
  websiteQuery,
} from "../websites/sites.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const websiteSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
  description: z.string(),
  slug: z.string(),
  isPublished: z.boolean(),
  categoryId: z.string().nullable(),
  vertical: z.enum(WEBSITE_VERTICALS),
  warehouseId: z.string().nullable(),
  pixitStoreId: z.string().nullable(),
  logoUploadId: z.string().nullable(),
  logoUrl: z.string().nullable(),
  iconUploadId: z.string().nullable(),
  iconUrl: z.string().nullable(),
  subdomain: z.string(),
  address: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const companyParams = z.object({ companyId: z.string() })
const websiteParams = companyParams.extend({ websiteId: z.string() })

const nameField = z.string().trim().min(1, "El nombre es obligatorio").max(200)
/** `null` retira la referencia; omitirla la deja como está. */
const referenceInput = z.string().nullable().optional()

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

function serialize(row: Awaited<ReturnType<typeof getWebsite>>) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

// ─── Rutas ───────────────────────────────────────────────────────────────────

export const listWebsitesRoute = defineRoute({
  access: REQUIRES("websites.websites.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/websites",
    summary: "Listar los sitios de una empresa",
    tags: ["Sitios"],
    request: { params: companyParams, query: collectionQuery(websiteQuery) },
    responses: {
      200: {
        description: "Sitios, con su subdominio y su dirección completa",
        content: { "application/json": { schema: pageSchema(websiteSchema) } },
      },
    },
  },
  handler: async (c) => {
    const page = await listWebsites(
      actorOf(c),
      c.req.valid("param").companyId,
      queryOf(c, websiteQuery),
    )
    return c.json(serializePage(page, serialize), 200)
  },
})

/**
 * Si un identificador legible está libre.
 *
 * Antes que `/{websiteId}` en el registro no haría falta —el enrutador distingue por el literal—,
 * pero el orden importa para quien lee: esta ruta es de la colección, no de un sitio.
 */
export const websiteSlugAvailableRoute = defineRoute({
  access: REQUIRES("websites.websites.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/websites/slug-available",
    summary: "Comprobar si un identificador legible está libre",
    tags: ["Sitios"],
    request: {
      params: companyParams,
      query: z.object({ slug: z.string().min(1) }),
    },
    responses: {
      200: {
        description: "El identificador ya normalizado, y si está libre",
        content: {
          "application/json": {
            schema: z.object({ slug: z.string(), available: z.boolean() }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const result = await slugAvailability(
      actorOf(c),
      c.req.valid("param").companyId,
      c.req.valid("query").slug,
    )
    return c.json(result, 200)
  },
})

export const getWebsiteRoute = defineRoute({
  access: REQUIRES("websites.websites.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/websites/{websiteId}",
    summary: "Ver un sitio",
    tags: ["Sitios"],
    request: { params: websiteParams },
    responses: {
      200: {
        description: "El sitio",
        content: { "application/json": { schema: websiteSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const site = await getWebsite(actorOf(c), params.companyId, params.websiteId)
    return c.json(serialize(site), 200)
  },
})

export const createWebsiteRoute = defineRoute({
  access: REQUIRES("websites.websites.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/websites",
    summary: "Crear un sitio",
    tags: ["Sitios"],
    request: {
      params: companyParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              description: z.string().max(4000).optional(),
              categoryId: referenceInput,
              warehouseId: referenceInput,
              pixitStoreId: referenceInput,
              logoUploadId: referenceInput,
              iconUploadId: referenceInput,
              isPublished: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Sitio creado, con su identificador legible derivado del nombre",
        content: { "application/json": { schema: websiteSchema } },
      },
      404: { description: "La fuente de catálogo no es de esta empresa" },
      422: { description: "La empresa no tiene contratado el servicio de sitios" },
    },
  },
  handler: async (c) => {
    const site = await createWebsite(
      actorOf(c),
      c.req.valid("param").companyId,
      c.req.valid("json"),
    )
    return c.json(serialize(site), 201)
  },
})

export const updateWebsiteRoute = defineRoute({
  access: REQUIRES("websites.websites.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/websites/{websiteId}",
    summary: "Modificar un sitio, publicarlo o despublicarlo",
    tags: ["Sitios"],
    request: {
      params: websiteParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              description: z.string().max(4000).optional(),
              slug: z.string().trim().min(1).max(200).optional(),
              categoryId: referenceInput,
              warehouseId: referenceInput,
              pixitStoreId: referenceInput,
              logoUploadId: referenceInput,
              iconUploadId: referenceInput,
              isPublished: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "El sitio ya modificado",
        content: { "application/json": { schema: websiteSchema } },
      },
      409: { description: "Ese identificador legible ya lo usa otro sitio" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const site = await updateWebsite(
      actorOf(c),
      params.companyId,
      params.websiteId,
      c.req.valid("json"),
    )
    return c.json(serialize(site), 200)
  },
})

export const deleteWebsiteRoute = defineRoute({
  access: REQUIRES("websites.websites.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/websites/{websiteId}",
    summary: "Dar de baja un sitio",
    tags: ["Sitios"],
    request: { params: websiteParams },
    responses: {
      204: { description: "Dado de baja. La fuente queda intacta y el identificador, libre" },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteWebsite(actorOf(c), params.companyId, params.websiteId)
    return c.body(null, 204)
  },
})
