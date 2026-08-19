/**
 * Rutas del constructor de sitios.
 *
 * Ver `openspec/specs/site-builder/spec.md`. Rebanada 19.
 *
 * Aparte de `websites.ts` porque son otro recurso con otras cuatro claves de permiso
 * —`websites.customizes.*`—: quien puede editar el sitio no es necesariamente quien decide su
 * aspecto, y el catálogo ya distinguía las dos cosas.
 *
 * ## Las dos rutas de página, juntas
 *
 * La pública y la de vista previa están **en el mismo archivo, una debajo de otra**, aunque una se
 * sirva sin credencial y la otra exija permiso. Es lo contrario de lo que hacen `websites.ts` y
 * `storefront.ts`, que se separan justamente para no compartir esquema — y aquí la razón es la
 * contraria y más fuerte: **tienen que compartirlo**. La spec exige que la vista previa enseñe lo
 * que se sirve; con dos esquemas, el día que uno creciera la vista previa dejaría de ser una vista
 * previa sin que nada fallara. Con uno, no compila.
 *
 * Lo que no comparten es de dónde sacan los datos, y eso está resuelto un piso más abajo: las dos
 * llaman a la misma función de composición (`websites/site-page.ts`).
 */

import { z } from "@hono/zod-openapi"
import { toInstant, toNullableInstant } from "@tfv/contracts"
import { SECTION_KINDS } from "@tfv/contracts/sections"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import { defineRoute, PUBLIC, REQUIRES } from "../runtime/route.ts"
import {
  type CustomizationRecord,
  createCustomization,
  deleteCustomization,
  getCustomization,
  listCustomizations,
  updateCustomization,
} from "../websites/customizations.ts"
import { previewSitePage, publicSitePage } from "../websites/site-page.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const buttonSchema = z.object({
  code: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  icon: z.string().max(60).optional(),
  /** El destino: una dirección, el tipo de la sección a la que se baja, o la clave de la acción. */
  value: z.string().max(500).optional(),
  action: z.enum(["link", "scroll", "app"]),
  variant: z.enum(["filled", "outline", "light"]),
})

const itemSchema = z.object({
  code: z.string().min(1).max(60),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(60).optional(),
  avatar: z.string().max(2000).optional(),
  image: z.string().max(2000).optional(),
})

/**
 * Una sección tal y como viaja.
 *
 * `kind` es una cadena y **no el enumerado del catálogo**, aunque el catálogo esté cerrado. La spec
 * dice qué hacer con un tipo no reconocido —omitirlo al renderizar— y eso presupone que puede haber
 * uno guardado: datos trasvasados de la pila anterior, o un tipo retirado. Con el enumerado aquí,
 * un sitio así no podría guardar ni la corrección de una errata. El catálogo sigue siendo la
 * autoridad de lo que se pinta; lo aplica `renderableSections`, no este esquema.
 */
const sectionSchema = z.object({
  kind: z.string().min(1).max(60),
  show: z.boolean(),
  /**
   * Se acepta y **se ignora**: el orden es el del arreglo y lo numera el servidor. Está en el
   * esquema para que la respuesta se pueda devolver tal cual al mismo endpoint sin limpiarla.
   */
  position: z.number().int().min(0).default(0),
  title: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
  icon: z.string().max(60).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  styles: z.record(z.string(), z.string()).optional(),
  items: z.array(itemSchema).max(50).optional(),
  buttons: z.array(buttonSchema).max(10).optional(),
})

const customizationSchema = z.object({
  id: z.string(),
  websiteId: z.string(),
  name: z.string(),
  color: z.string(),
  bannerUploadId: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  isPrimary: z.boolean(),
  isActive: z.boolean(),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  sections: z.array(sectionSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

/** Lo que se pinta. **El mismo esquema para la tienda pública y para la vista previa.** */
const pageSchema = z.object({
  customizationId: z.string().nullable(),
  name: z.string().nullable(),
  color: z.string(),
  bannerUrl: z.string().nullable(),
  sections: z.array(sectionSchema.extend({ kind: z.enum(SECTION_KINDS), position: z.number() })),
})

const websiteParams = z.object({ companyId: z.string(), websiteId: z.string() })
const customizationParams = websiteParams.extend({ customizationId: z.string() })

const nameField = z.string().trim().min(1, "El nombre es obligatorio").max(200)
/** Color en notación hexadecimal. Lo que se guarda es lo que pinta la tienda. */
const colorField = z.string().regex(/^#[0-9a-fA-F]{6}$/, "El color debe ser hexadecimal")
const instantField = z.string().datetime().nullable().optional()

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

function serialize(record: CustomizationRecord) {
  return {
    ...record,
    sections: [...record.sections],
    startsAt: toNullableInstant(record.startsAt),
    endsAt: toNullableInstant(record.endsAt),
    createdAt: toInstant(record.createdAt),
    updatedAt: toInstant(record.updatedAt),
  }
}

/** `null` explícito borra la fecha; ausente la deja como está. */
function dateOf(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  return value === null ? null : new Date(value)
}

// ─── Personalizaciones ───────────────────────────────────────────────────────

export const listCustomizationsRoute = defineRoute({
  access: REQUIRES("websites.customizes.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/websites/{websiteId}/customizations",
    summary: "Listar las personalizaciones de un sitio",
    tags: ["Constructor de sitios"],
    request: { params: websiteParams },
    responses: {
      200: {
        description: "Las personalizaciones, de la más antigua a la más nueva",
        content: {
          "application/json": {
            schema: z.object({ items: z.array(customizationSchema) }),
          },
        },
      },
      404: { description: "El sitio no existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const items = await listCustomizations(actorOf(c), params.companyId, params.websiteId)
    return c.json({ items: items.map(serialize) }, 200)
  },
})

/**
 * La página tal y como quedaría.
 *
 * Antes que `/{customizationId}` no haría falta —el enrutador distingue por el literal—, pero está
 * en el sitio que le corresponde por lo que es: una lectura del sitio, no de una personalización.
 */
export const previewSitePageRoute = defineRoute({
  access: REQUIRES("websites.customizes.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/websites/{websiteId}/page",
    summary: "Vista previa de la página de un sitio",
    tags: ["Constructor de sitios"],
    request: {
      params: websiteParams,
      query: z.object({ customizationId: z.string().optional() }),
    },
    responses: {
      200: {
        description: "Lo mismo que sirve la tienda pública, sin exigir que el sitio esté publicado",
        content: { "application/json": { schema: pageSchema } },
      },
      404: { description: "El sitio o la personalización no existen para el solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await previewSitePage(
      actorOf(c),
      params.companyId,
      params.websiteId,
      c.req.valid("query").customizationId,
    )
    return c.json(page, 200)
  },
})

export const getCustomizationRoute = defineRoute({
  access: REQUIRES("websites.customizes.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/websites/{websiteId}/customizations/{customizationId}",
    summary: "Ver una personalización",
    tags: ["Constructor de sitios"],
    request: { params: customizationParams },
    responses: {
      200: {
        description: "La personalización, con sus secciones",
        content: { "application/json": { schema: customizationSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const record = await getCustomization(
      actorOf(c),
      params.companyId,
      params.websiteId,
      params.customizationId,
    )
    return c.json(serialize(record), 200)
  },
})

export const createCustomizationRoute = defineRoute({
  access: REQUIRES("websites.customizes.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/websites/{websiteId}/customizations",
    summary: "Crear una personalización",
    tags: ["Constructor de sitios"],
    request: {
      params: websiteParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              color: colorField.optional(),
              bannerUploadId: z.string().nullable().optional(),
              isPrimary: z.boolean().optional(),
              startsAt: instantField,
              endsAt: instantField,
              /** Omitirlas la hace nacer con el contenido inicial de la vertical del sitio. */
              sections: z.array(sectionSchema).max(30).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Creada. La primera de un sitio nace primaria y con secciones de ejemplo",
        content: { "application/json": { schema: customizationSchema } },
      },
      422: { description: "La ventana de fechas o un destino de desplazamiento no se sostienen" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const body = c.req.valid("json")

    const record = await createCustomization(actorOf(c), params.companyId, params.websiteId, {
      name: body.name,
      color: body.color,
      bannerUploadId: body.bannerUploadId,
      isPrimary: body.isPrimary,
      startsAt: dateOf(body.startsAt),
      endsAt: dateOf(body.endsAt),
      sections: body.sections,
    })

    return c.json(serialize(record), 201)
  },
})

/**
 * Modificar una personalización.
 *
 * **Reordenar es esto**: `sections` llega entera, en el orden que se quiere, y el servidor la
 * numera. No hay ruta de reordenación, y no la hay porque el modelo guarda las secciones como un
 * `jsonb` sin identidad por elemento — una ruta que moviera «la sección X» necesitaría antes
 * inventarle una identidad a X, y la posición no sirve: es justo lo que está cambiando.
 */
export const updateCustomizationRoute = defineRoute({
  access: REQUIRES("websites.customizes.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/websites/{websiteId}/customizations/{customizationId}",
    summary: "Modificar una personalización, su contenido o el orden de sus secciones",
    tags: ["Constructor de sitios"],
    request: {
      params: customizationParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              color: colorField.optional(),
              bannerUploadId: z.string().nullable().optional(),
              isPrimary: z.boolean().optional(),
              startsAt: instantField,
              endsAt: instantField,
              sections: z.array(sectionSchema).max(30).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "La personalización ya modificada",
        content: { "application/json": { schema: customizationSchema } },
      },
      422: {
        description:
          "La ventana de fechas no se sostiene, un botón se desplaza a una sección que no está, " +
          "o se intenta dejar el sitio sin primaria",
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const body = c.req.valid("json")

    const record = await updateCustomization(
      actorOf(c),
      params.companyId,
      params.websiteId,
      params.customizationId,
      {
        name: body.name,
        color: body.color,
        bannerUploadId: body.bannerUploadId,
        isPrimary: body.isPrimary,
        startsAt: dateOf(body.startsAt),
        endsAt: dateOf(body.endsAt),
        sections: body.sections,
      },
    )

    return c.json(serialize(record), 200)
  },
})

export const deleteCustomizationRoute = defineRoute({
  access: REQUIRES("websites.customizes.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/websites/{websiteId}/customizations/{customizationId}",
    summary: "Dar de baja una personalización",
    tags: ["Constructor de sitios"],
    request: { params: customizationParams },
    responses: {
      204: { description: "Dada de baja. Si era la primaria, otra queda marcada; el sitio sigue" },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteCustomization(
      actorOf(c),
      params.companyId,
      params.websiteId,
      params.customizationId,
    )
    return c.body(null, 204)
  },
})

// ─── La página pública ───────────────────────────────────────────────────────

export const storefrontPageRoute = defineRoute({
  access: PUBLIC(
    "Las secciones de la portada de una tienda las lee quien no tiene cuenta, igual que su " +
      "catálogo. Sólo salen las de la personalización vigente de un sitio publicado cuya empresa " +
      "atraviesa las tres compuertas.",
  ),
  config: {
    method: "get",
    path: "/public/sites/{slug}/page",
    summary: "Las secciones que sirve la portada de una tienda",
    tags: ["Tiendas públicas"],
    request: { params: z.object({ slug: z.string() }) },
    responses: {
      200: {
        description: "La personalización vigente, ya filtrada y ordenada",
        content: { "application/json": { schema: pageSchema } },
      },
      404: { description: "La tienda no se sirve" },
    },
  },
  handler: async (c) => {
    return c.json(await publicSitePage(c.req.valid("param").slug), 200)
  },
})
