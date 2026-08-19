/**
 * Las rutas de la tienda pública. **Las tres se sirven sin credencial.**
 *
 * Ver `openspec/specs/public-storefronts/spec.md` y `websites/spec.md`. Rebanada 19.
 *
 * Están en su propio archivo, separadas de la gestión de sitios, porque comparten una propiedad que
 * ninguna otra ruta de este servicio tiene: lo que devuelven lo puede leer cualquiera. Tenerlas
 * junto a las que exigen permiso invitaría a compartir un esquema entre las dos mitades, y el día
 * que ese esquema creciera enseñaría el costo de los productos en la calle.
 *
 * ## Qué las protege, si no hay sesión
 *
 * El camino **no lleva empresa**: lleva el identificador legible del sitio, y el sitio decide a qué
 * empresa se resuelve. No hay identificador que sustituir para asomarse a otra —cambiarlo lleva a
 * otra tienda pública, que es lo que se pretende— y lo que se enseña de cada una es sólo lo que su
 * dueño publicó. Es la misma forma que el documento por enlace público, donde el alcance sale del
 * sobre firmado en vez del subdominio.
 *
 * ## Y por qué la portada devuelve 200 diciendo que no está disponible
 *
 * Las tres compuertas de la resolución fallan por motivos distintos y **cada una tiene su página**.
 * «No existe» es un `404`. «Existe y su empresa dejó de pagar» no es ningún código del contrato de
 * errores, y meterlo a la fuerza en un `403` obligaría a la interfaz a distinguirlo del resto de
 * los `403` leyendo el mensaje. Va como parte de la respuesta, con su motivo, y **sin un solo dato
 * del sitio**.
 */

import { z } from "@hono/zod-openapi"
import { WEBSITE_VERTICALS } from "@tfv/contracts/storefront"
import { defineRoute, PUBLIC } from "../runtime/route.ts"
import {
  resolveStorefront,
  storefrontProduct,
  storefrontProducts,
  storefrontQuery,
} from "../websites/storefront.ts"
import { collectionQuery, pageSchema, queryOf } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const categorySchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  slug: z.string().nullable(),
})

const siteSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  vertical: z.enum(WEBSITE_VERTICALS),
  logoUrl: z.string().nullable(),
  iconUrl: z.string().nullable(),
  categories: z.array(categorySchema),
})

/**
 * La resolución, como unión discriminada.
 *
 * `site` **sólo existe en la rama servida**. Es lo que impide que una interfaz que se olvide de
 * mirar `status` acabe pintando la tienda de una empresa suspendida: no habría nada que pintar.
 */
const resolutionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), site: siteSchema }),
  z.object({
    status: z.literal("unavailable"),
    reason: z.enum(["subscription", "service"]),
  }),
])

const productSchema = z.object({
  id: z.string(),
  slug: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  price: z.string().nullable(),
  availableForSale: z.boolean(),
  availableForRent: z.boolean(),
  categoryId: z.string().nullable(),
  coverUrl: z.string().nullable(),
})

const productDetailSchema = productSchema.extend({
  images: z.array(
    z.object({
      url: z.string(),
      thumbnailUrl: z.string().nullable(),
      position: z.number().int(),
      isCover: z.boolean(),
    }),
  ),
  measurements: z.array(z.object({ id: z.string(), name: z.string() })),
  variants: z.array(productSchema),
  accessories: z.array(productSchema),
})

const siteParams = z.object({ slug: z.string() })

// ─── Rutas ───────────────────────────────────────────────────────────────────

export const storefrontSiteRoute = defineRoute({
  access: PUBLIC(
    "La tienda de una empresa la abre quien no tiene cuenta, que es para lo que existe. El camino " +
      "no lleva empresa: la resuelve el subdominio, y sólo si el sitio está publicado.",
  ),
  config: {
    method: "get",
    path: "/public/sites/{slug}",
    summary: "Resolver la tienda que sirve un subdominio",
    tags: ["Tiendas públicas"],
    request: { params: siteParams },
    responses: {
      200: {
        description: "La tienda, o el motivo por el que hoy no se sirve",
        content: { "application/json": { schema: resolutionSchema } },
      },
      404: { description: "No hay tienda en ese subdominio, o su sitio no está publicado" },
    },
  },
  handler: async (c) => {
    return c.json(await resolveStorefront(c.req.valid("param").slug), 200)
  },
})

export const storefrontProductsRoute = defineRoute({
  access: PUBLIC(
    "El catálogo de una tienda es lo que se enseña a quien todavía no es cliente. Sólo sale de él " +
      "lo publicado por su almacén, y nunca costos, ubicaciones ni existencias.",
  ),
  config: {
    method: "get",
    path: "/public/sites/{slug}/products",
    summary: "Catálogo publicado de una tienda",
    tags: ["Tiendas públicas"],
    request: { params: siteParams, query: collectionQuery(storefrontQuery) },
    responses: {
      200: {
        description: "Productos publicados, paginados",
        content: { "application/json": { schema: pageSchema(productSchema) } },
      },
      404: { description: "La tienda no se sirve, o su vertical no tiene catálogo" },
    },
  },
  handler: async (c) => {
    const page = await storefrontProducts(c.req.valid("param").slug, queryOf(c, storefrontQuery))
    return c.json(page, 200)
  },
})

export const storefrontProductRoute = defineRoute({
  access: PUBLIC(
    "La ficha de un producto en venta, con sus fotos y su precio. Alcanzable por identificador o " +
      "por identificador legible, y sólo si está publicado: uno despublicado responde 404.",
  ),
  config: {
    method: "get",
    path: "/public/sites/{slug}/products/{handle}",
    summary: "Ficha pública de un producto",
    tags: ["Tiendas públicas"],
    request: { params: siteParams.extend({ handle: z.string() }) },
    responses: {
      200: {
        description: "El producto, con sus fotos, sus medidas y sus variantes publicadas",
        content: { "application/json": { schema: productDetailSchema } },
      },
      404: { description: "No existe, no está publicado, o no es de esta tienda" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    return c.json(await storefrontProduct(params.slug, params.handle), 200)
  },
})
