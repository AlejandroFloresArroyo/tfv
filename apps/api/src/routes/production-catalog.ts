/**
 * Rutas de los catálogos de una producción y de su inventario.
 *
 * Personajes, sets y biblioteca de videos —rebanada 20, bloque de catálogos— y los artículos
 * —rebanada 22, bloque de inventario—. Van juntos porque están entrelazados: un set **es** una
 * lista de artículos, y sin los artículos la mitad de los catálogos no tiene qué contener.
 *
 * ## Cuatro familias de permisos, todas ya en el catálogo cerrado
 *
 * `productions.characters.*`, `productions.sets.*`, `productions.videos.*` y
 * `productions.products.*`. **No se añade ninguna clave**: el catálogo está cerrado en las 255
 * migradas y las cuatro familias vienen de él. Que estén separadas responde a cómo se reparte un
 * rodaje: quien compone un decorado no es quien lleva el inventario, y quien sube la referencia de
 * cómo debía verse algo no es quien decide que una silla está rota.
 *
 * ## Tres claves de esas familias se quedan sin ruta, y es correcto
 *
 * `productions.products.select_status`, `productions.products.select_category` y
 * `productions.videos.select_category` gobiernan **selectores de un formulario**, no operaciones: en
 * la pila anterior decidían si un desplegable se podía desplegar. Aquí no hay ninguna operación que
 * consista sólo en elegir, así que colgarlas de una ruta sería inventarle un significado nuevo a una
 * clave que los roles de producción ya tienen concedida o denegada. Quedan para la pantalla, y
 * anotadas en `HALLAZGOS.md` H-173.
 *
 * ## Componer un set tiene su propia clave, y no es la de editar
 *
 * `productions.sets.products` existe justo para esto —está en el catálogo migrado— y la separación
 * es real: renombrar un decorado y decidir qué muebles lleva son decisiones de personas distintas.
 *
 * ## La localización por código no cuelga de una producción
 *
 * `/companies/{companyId}/production-items/by-code/{code}` es de la **empresa**. Quien lee una
 * etiqueta pegada a un objeto en una bodega no sabe de qué rodaje es —para eso la lee—, y el
 * escenario de la spec devuelve «el artículo con su estado **y su producción**», que sólo es un dato
 * útil si no había que saberlo de antemano.
 *
 * Y va en un camino propio en lugar de `.../productions/items/by-code/...` porque eso último casaría
 * con `.../productions/{productionId}/items/{itemId}` tomando `items` por la producción y el código
 * por el artículo: dos rutas distintas atendiendo la misma petición según el orden de registro, que
 * es H-127.
 */

import { z } from "@hono/zod-openapi"
import { toInstant } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import {
  characterQuery,
  createCharacter,
  createSet,
  createVideo,
  deleteCharacter,
  deleteSet,
  deleteVideo,
  getCharacter,
  getSet,
  getVideo,
  listCharacters,
  listSets,
  listVideos,
  setQuery,
  setSetItems,
  updateCharacter,
  updateSet,
  updateVideo,
  videoQuery,
} from "../productions/catalog.ts"
import { DELIVERY_DIRECTIONS, DELIVERY_STATUSES } from "../productions/deliveries.ts"
import {
  changeItemStatus,
  createItem,
  deleteItem,
  findItemByCode,
  getItem,
  ITEM_EVENT_REASONS,
  ITEM_STATUSES,
  itemQuery,
  itemUsage,
  listItemEvents,
  listItems,
  setItemImages,
  updateItem,
} from "../productions/items.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const imageFields = {
  imageUploadId: z.string().nullable(),
  imageUrl: z.string().nullable(),
  imageThumbnailUrl: z.string().nullable(),
}

/** `null` la retira; omitirla la deja como está. */
const imageInput = z.string().nullable().optional()

const nameField = z.string().trim().min(1, "El nombre es obligatorio").max(250)

const companyParams = z.object({ companyId: z.string() })
const productionParams = companyParams.extend({ productionId: z.string() })
const characterParams = productionParams.extend({ characterId: z.string() })
const setParams = productionParams.extend({ setId: z.string() })
const videoParams = productionParams.extend({ videoId: z.string() })
const itemParams = productionParams.extend({ itemId: z.string() })

const characterSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  name: z.string(),
  description: z.string(),
  ...imageFields,
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  continuityCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const setItemSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  code: z.string(),
  status: z.string(),
})

const setSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  name: z.string(),
  description: z.string(),
  ...imageFields,
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  itemCount: z.number().int(),
  items: z.array(setItemSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const videoSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  name: z.string(),
  videoUploadId: z.string().nullable(),
  videoUrl: z.string().nullable(),
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  propCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const itemImageSchema = z.object({
  uploadId: z.string(),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  position: z.number().int(),
})

const itemSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  shoppingId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  code: z.string(),
  status: z.enum(ITEM_STATUSES),
  isInventoriable: z.boolean(),
  allowedStatuses: z.array(z.enum(ITEM_STATUSES)),
  images: z.array(itemImageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const itemLocationSchema = itemSchema.extend({ productionName: z.string() })

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

function stamps<T extends { createdAt: Date; updatedAt: Date }>(row: T) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

/**
 * Las colecciones de sólo lectura se copian al serializarlas.
 *
 * Los registros del dominio las declaran `readonly` para que nadie las mute por accidente, y el
 * contrato publicado las espera mutables. Copiarlas aquí es la traducción entre las dos, y es el
 * mismo punto en el que la hace el catálogo del almacén.
 */
function serializeSet(row: Awaited<ReturnType<typeof getSet>>) {
  // `items` se saca del objeto antes de esparcirlo: dejarlo dentro y sobrescribirlo después
  // conserva el tipo de sólo lectura del original, que es lo que el contrato no acepta.
  const { items, ...rest } = row
  return { ...stamps(rest), ...(items === undefined ? {} : { items: [...items] }) }
}

function serializeItem<T extends Awaited<ReturnType<typeof getItem>>>(row: T) {
  const { allowedStatuses, images, ...rest } = row
  return { ...stamps(rest), allowedStatuses: [...allowedStatuses], images: [...images] }
}

function serializeUsage(usage: Awaited<ReturnType<typeof itemUsage>>) {
  return {
    deliveries: [...usage.deliveries],
    sets: [...usage.sets],
    recordings: [...usage.recordings],
  }
}

// ─── Personajes ──────────────────────────────────────────────────────────────

export const listCharactersRoute = defineRoute({
  access: REQUIRES("productions.characters.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/characters",
    summary: "Listar los personajes de una producción",
    tags: ["Producciones"],
    request: { params: productionParams, query: collectionQuery(characterQuery) },
    responses: {
      200: {
        description: "Personajes, por nombre",
        content: { "application/json": { schema: pageSchema(characterSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listCharacters(
      actorOf(c),
      params.companyId,
      params.productionId,
      queryOf(c, characterQuery),
    )
    return c.json(serializePage(page, stamps), 200)
  },
})

export const createCharacterRoute = defineRoute({
  access: REQUIRES("productions.characters.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/characters",
    summary: "Registrar un personaje",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              description: z.string().max(4000).optional(),
              imageUploadId: imageInput,
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Personaje registrado, disponible para asignarlo a continuidades y tareas",
        content: { "application/json": { schema: characterSchema } },
      },
      404: { description: "La producción, la imagen o el responsable no existen" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const character = await createCharacter(
      actorOf(c),
      params.companyId,
      params.productionId,
      c.req.valid("json"),
    )
    return c.json(stamps(character), 201)
  },
})

export const getCharacterRoute = defineRoute({
  access: REQUIRES("productions.characters.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/characters/{characterId}",
    summary: "Ver un personaje",
    tags: ["Producciones"],
    request: { params: characterParams },
    responses: {
      200: {
        description: "El personaje, con cuántas continuidades lo tienen asignado",
        content: { "application/json": { schema: characterSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const character = await getCharacter(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.characterId,
    )
    return c.json(stamps(character), 200)
  },
})

export const updateCharacterRoute = defineRoute({
  access: REQUIRES("productions.characters.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/characters/{characterId}",
    summary: "Editar un personaje",
    tags: ["Producciones"],
    request: {
      params: characterParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              description: z.string().max(4000).optional(),
              imageUploadId: imageInput,
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Personaje actualizado",
        content: { "application/json": { schema: characterSchema } },
      },
      404: { description: "No existe, o la imagen o el responsable no existen" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const character = await updateCharacter(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.characterId,
      c.req.valid("json"),
    )
    return c.json(stamps(character), 200)
  },
})

export const deleteCharacterRoute = defineRoute({
  access: REQUIRES("productions.characters.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/characters/{characterId}",
    summary: "Dar de baja un personaje",
    tags: ["Producciones"],
    request: { params: characterParams },
    responses: {
      204: {
        description: "Dado de baja. Sus continuidades siguen existiendo, sin personaje asignado",
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteCharacter(actorOf(c), params.companyId, params.productionId, params.characterId)
    return c.body(null, 204)
  },
})

// ─── Sets ────────────────────────────────────────────────────────────────────

export const listSetsRoute = defineRoute({
  access: REQUIRES("productions.sets.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/sets",
    summary: "Listar los sets de una producción",
    tags: ["Producciones"],
    request: { params: productionParams, query: collectionQuery(setQuery) },
    responses: {
      200: {
        description: "Sets, por nombre, con cuántos artículos compone cada uno",
        content: { "application/json": { schema: pageSchema(setSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listSets(
      actorOf(c),
      params.companyId,
      params.productionId,
      queryOf(c, setQuery),
    )
    return c.json(serializePage(page, serializeSet), 200)
  },
})

export const createSetRoute = defineRoute({
  access: REQUIRES("productions.sets.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/sets",
    summary: "Registrar un set",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              description: z.string().max(4000).optional(),
              imageUploadId: imageInput,
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Set registrado, sin artículos todavía",
        content: { "application/json": { schema: setSchema } },
      },
      404: { description: "La producción, la imagen o el responsable no existen" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const set = await createSet(
      actorOf(c),
      params.companyId,
      params.productionId,
      c.req.valid("json"),
    )
    return c.json(serializeSet(set), 201)
  },
})

export const getSetRoute = defineRoute({
  access: REQUIRES("productions.sets.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/sets/{setId}",
    summary: "Ver un set con su composición",
    tags: ["Producciones"],
    request: { params: setParams },
    responses: {
      200: {
        description: "El set, con la lista de artículos que lo componen",
        content: { "application/json": { schema: setSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const set = await getSet(actorOf(c), params.companyId, params.productionId, params.setId)
    return c.json(serializeSet(set), 200)
  },
})

export const updateSetRoute = defineRoute({
  access: REQUIRES("productions.sets.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/sets/{setId}",
    summary: "Editar un set",
    tags: ["Producciones"],
    request: {
      params: setParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              description: z.string().max(4000).optional(),
              imageUploadId: imageInput,
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Set actualizado",
        content: { "application/json": { schema: setSchema } },
      },
      404: { description: "No existe, o la imagen o el responsable no existen" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const set = await updateSet(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.setId,
      c.req.valid("json"),
    )
    return c.json(serializeSet(set), 200)
  },
})

export const setSetItemsRoute = defineRoute({
  access: REQUIRES("productions.sets.products"),
  config: {
    method: "put",
    path: "/companies/{companyId}/productions/{productionId}/sets/{setId}/items",
    summary: "Componer un set: establecer de una vez sus artículos",
    tags: ["Producciones"],
    request: {
      params: setParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              // El conjunto entero, no altas y bajas sueltas: componer un decorado es decir qué
              // lleva, y una secuencia de operaciones depende de en qué orden lleguen.
              itemIds: z.array(z.string()).max(500),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "El set con su composición nueva. Un artículo puede estar en varios sets",
        content: { "application/json": { schema: setSchema } },
      },
      404: { description: "El set no existe, o alguno de los artículos no es de esta producción" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const set = await setSetItems(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.setId,
      c.req.valid("json").itemIds,
    )
    return c.json(serializeSet(set), 200)
  },
})

export const deleteSetRoute = defineRoute({
  access: REQUIRES("productions.sets.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/sets/{setId}",
    summary: "Dar de baja un set",
    tags: ["Producciones"],
    request: { params: setParams },
    responses: {
      204: {
        description: "Dado de baja. Sus artículos siguen existiendo en el inventario",
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteSet(actorOf(c), params.companyId, params.productionId, params.setId)
    return c.body(null, 204)
  },
})

// ─── Biblioteca de videos ────────────────────────────────────────────────────

export const listVideosRoute = defineRoute({
  access: REQUIRES("productions.videos.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/videos",
    summary: "Listar la biblioteca de videos de una producción",
    tags: ["Producciones"],
    request: { params: productionParams, query: collectionQuery(videoQuery) },
    responses: {
      200: {
        description: "Videos, por nombre, cada uno con la dirección con la que se reproduce",
        content: { "application/json": { schema: pageSchema(videoSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listVideos(
      actorOf(c),
      params.companyId,
      params.productionId,
      queryOf(c, videoQuery),
    )
    return c.json(serializePage(page, stamps), 200)
  },
})

export const createVideoRoute = defineRoute({
  access: REQUIRES("productions.videos.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/videos",
    summary: "Registrar un video en la biblioteca",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              videoUploadId: z.string().nullable().optional(),
              categoryId: z.string().nullable().optional(),
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Video registrado",
        content: { "application/json": { schema: videoSchema } },
      },
      404: { description: "La producción, el archivo, la categoría o el responsable no existen" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const video = await createVideo(
      actorOf(c),
      params.companyId,
      params.productionId,
      c.req.valid("json"),
    )
    return c.json(stamps(video), 201)
  },
})

export const getVideoRoute = defineRoute({
  access: REQUIRES("productions.videos.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/videos/{videoId}",
    summary: "Ver un video y obtener su dirección de reproducción",
    tags: ["Producciones"],
    request: { params: videoParams },
    responses: {
      200: {
        description:
          "El video con «videoUrl», que es lo que un reproductor consume por partes. No hay " +
          "descarga, y no la hay a propósito: la spec pide reproducirlo sin descargarlo",
        content: { "application/json": { schema: videoSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const video = await getVideo(actorOf(c), params.companyId, params.productionId, params.videoId)
    return c.json(stamps(video), 200)
  },
})

export const updateVideoRoute = defineRoute({
  access: REQUIRES("productions.videos.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/videos/{videoId}",
    summary: "Editar un video",
    tags: ["Producciones"],
    request: {
      params: videoParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              videoUploadId: z.string().nullable().optional(),
              categoryId: z.string().nullable().optional(),
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description:
          "Video actualizado. Sustituir el archivo suelta el anterior si nadie más lo usa",
        content: { "application/json": { schema: videoSchema } },
      },
      404: { description: "No existe, o el archivo, la categoría o el responsable no existen" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const video = await updateVideo(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.videoId,
      c.req.valid("json"),
    )
    return c.json(stamps(video), 200)
  },
})

export const deleteVideoRoute = defineRoute({
  access: REQUIRES("productions.videos.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/videos/{videoId}",
    summary: "Dar de baja un video",
    tags: ["Producciones"],
    request: { params: videoParams },
    responses: {
      204: {
        description:
          "Dado de baja. Las piezas de utilería que lo señalaban desaparecen; sus continuidades no",
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteVideo(actorOf(c), params.companyId, params.productionId, params.videoId)
    return c.body(null, 204)
  },
})

// ─── Inventario ──────────────────────────────────────────────────────────────

export const listItemsRoute = defineRoute({
  access: REQUIRES("productions.products.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/items",
    summary: "Listar el inventario de una producción",
    tags: ["Producciones"],
    request: { params: productionParams, query: collectionQuery(itemQuery) },
    responses: {
      200: {
        description:
          "Artículos, por nombre. La búsqueda alcanza el nombre de la categoría, no sólo el del " +
          "artículo",
        content: { "application/json": { schema: pageSchema(itemSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listItems(
      actorOf(c),
      params.companyId,
      params.productionId,
      queryOf(c, itemQuery),
    )
    return c.json(serializePage(page, serializeItem), 200)
  },
})

export const createItemRoute = defineRoute({
  access: REQUIRES("productions.products.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/items",
    summary: "Dar de alta un artículo",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              description: z.string().max(4000).optional(),
              categoryId: z.string().nullable().optional(),
              shoppingId: z.string().nullable().optional(),
              isInventoriable: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description:
          "Artículo dado de alta, disponible y con un código identificativo único acuñado por el " +
          "sistema. El código no se recibe ni se puede elegir",
        content: { "application/json": { schema: itemSchema } },
      },
      404: { description: "La producción o la categoría no existen" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const item = await createItem(
      actorOf(c),
      params.companyId,
      params.productionId,
      c.req.valid("json"),
    )
    return c.json(serializeItem(item), 201)
  },
})

export const getItemRoute = defineRoute({
  access: REQUIRES("productions.products.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/items/{itemId}",
    summary: "Ver un artículo",
    tags: ["Producciones"],
    request: { params: itemParams },
    responses: {
      200: {
        description: "El artículo, con sus fotos y los estados a los que puede pasar",
        content: { "application/json": { schema: itemSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const item = await getItem(actorOf(c), params.companyId, params.productionId, params.itemId)
    return c.json(serializeItem(item), 200)
  },
})

export const updateItemRoute = defineRoute({
  access: REQUIRES("productions.products.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/items/{itemId}",
    summary: "Editar un artículo",
    tags: ["Producciones"],
    request: {
      params: itemParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              description: z.string().max(4000).optional(),
              categoryId: z.string().nullable().optional(),
              shoppingId: z.string().nullable().optional(),
              isInventoriable: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description:
          "Artículo actualizado. Ni el código ni el estado se tocan por aquí: el código está " +
          "impreso en la etiqueta y el estado tiene su propia operación",
        content: { "application/json": { schema: itemSchema } },
      },
      404: { description: "No existe, o la categoría no es de esta producción" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const item = await updateItem(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.itemId,
      c.req.valid("json"),
    )
    return c.json(serializeItem(item), 200)
  },
})

export const changeItemStatusRoute = defineRoute({
  access: REQUIRES("productions.products.status"),
  config: {
    method: "put",
    path: "/companies/{companyId}/productions/{productionId}/items/{itemId}/status",
    summary: "Cambiar el estado de un artículo",
    tags: ["Producciones"],
    request: {
      params: itemParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              // «Entregado» está en el enumerado porque un artículo puede estarlo, y la tabla de
              // transiciones lo rechaza como destino: se llega ahí cerrando una nota de entrega.
              status: z.enum(ITEM_STATUSES),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "El artículo en su estado nuevo",
        content: { "application/json": { schema: itemSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
      422: {
        description:
          "La transición no está permitida. El mensaje enumera los estados a los que sí se puede " +
          "pasar desde donde está",
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const item = await changeItemStatus(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.itemId,
      c.req.valid("json").status,
    )
    return c.json(serializeItem(item), 200)
  },
})

export const setItemImagesRoute = defineRoute({
  access: REQUIRES("productions.products.edit"),
  config: {
    method: "put",
    path: "/companies/{companyId}/productions/{productionId}/items/{itemId}/images",
    summary: "Sustituir la galería de un artículo",
    tags: ["Producciones"],
    request: {
      params: itemParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({ uploadIds: z.array(z.string()).max(50) }),
          },
        },
      },
    },
    responses: {
      200: {
        description:
          "El artículo con su galería nueva. Se envía la colección entera y el servidor diferencia: " +
          "lo que sigue estando no se toca, y sólo lo retirado se suelta",
        content: { "application/json": { schema: itemSchema } },
      },
      404: { description: "El artículo no existe, o alguna imagen no es de esta empresa" },
      422: { description: "Alguna imagen no llegó a subirse, o no es una imagen" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const item = await setItemImages(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.itemId,
      c.req.valid("json"),
    )
    return c.json(serializeItem(item), 200)
  },
})

export const itemUsageRoute = defineRoute({
  access: REQUIRES("productions.products.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/items/{itemId}/usage",
    summary: "Dónde se está usando un artículo",
    tags: ["Producciones"],
    request: { params: itemParams },
    responses: {
      200: {
        description:
          "Las notas en que figura, los sets que lo componen y las jornadas en que se usó, con la " +
          "continuidad concreta. Es lo que hay que consultar **antes** de eliminarlo o de cambiarle " +
          "el estado, para no romper trabajo en curso",
        content: {
          "application/json": {
            schema: z.object({
              deliveries: z.array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  status: z.enum(DELIVERY_STATUSES),
                  direction: z.enum(DELIVERY_DIRECTIONS),
                }),
              ),
              sets: z.array(z.object({ id: z.string(), name: z.string() })),
              recordings: z.array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  continuityId: z.string(),
                }),
              ),
            }),
          },
        },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const usage = await itemUsage(actorOf(c), params.companyId, params.productionId, params.itemId)
    return c.json(serializeUsage(usage), 200)
  },
})

export const itemEventsRoute = defineRoute({
  access: REQUIRES("productions.products.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/items/{itemId}/events",
    summary: "El historial de estado de un artículo",
    tags: ["Producciones"],
    request: { params: itemParams },
    responses: {
      200: {
        description:
          "La vida del artículo, **del último paso al primero**: quién lo movió, cuándo, desde " +
          "dónde, hacia dónde y por qué. El primero no tiene estado de origen porque antes de " +
          "existir no estaba en ninguno",
        content: {
          "application/json": {
            schema: z.object({
              items: z.array(
                z.object({
                  id: z.string(),
                  itemId: z.string(),
                  fromStatus: z.enum(ITEM_STATUSES).nullable(),
                  toStatus: z.enum(ITEM_STATUSES),
                  reason: z.enum(ITEM_EVENT_REASONS),
                  actorId: z.string().nullable(),
                  actorName: z.string().nullable(),
                  causeId: z.string().nullable(),
                  note: z.string().nullable(),
                  occurredAt: z.string(),
                }),
              ),
            }),
          },
        },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const events = await listItemEvents(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.itemId,
    )

    return c.json(
      {
        items: events.map((event) => ({
          ...event,
          occurredAt: toInstant(event.occurredAt),
        })),
      },
      200,
    )
  },
})

export const itemLabelRoute = defineRoute({
  access: REQUIRES("productions.products.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/items/{itemId}/label",
    summary: "La etiqueta imprimible de un artículo",
    tags: ["Producciones"],
    request: { params: itemParams },
    responses: {
      200: {
        description:
          "Lo que va en la etiqueta: «payload» es lo que se codifica en el símbolo y es exactamente " +
          "lo que la localización por código acepta de vuelta. Dibujar el símbolo es de la pantalla; " +
          "el servidor garantiza el viaje de ida y vuelta, que es lo que se rompe en la práctica " +
          "cuando cada lado inventa su propio formato",
        content: {
          "application/json": {
            schema: z.object({
              itemId: z.string(),
              code: z.string(),
              payload: z.string(),
              name: z.string(),
              status: z.enum(ITEM_STATUSES),
              productionId: z.string(),
            }),
          },
        },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const item = await getItem(actorOf(c), params.companyId, params.productionId, params.itemId)

    return c.json(
      {
        itemId: item.id,
        code: item.code,
        // El código **es** la carga útil. El alfabeto de Crockford existe para esto: se lee igual
        // escaneado que dictado por teléfono, así que no hace falta envolverlo en nada.
        payload: item.code,
        name: item.name,
        status: item.status,
        productionId: item.productionId,
      },
      200,
    )
  },
})

export const findItemByCodeRoute = defineRoute({
  access: REQUIRES("productions.products.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/production-items/by-code/{code}",
    summary: "Localizar un artículo por el código de su etiqueta",
    tags: ["Producciones"],
    request: { params: companyParams.extend({ code: z.string() }) },
    responses: {
      200: {
        description: "El artículo con su estado y su producción",
        content: { "application/json": { schema: itemLocationSchema } },
      },
      404: { description: "Ningún artículo de la empresa tiene ese código" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const item = await findItemByCode(actorOf(c), params.companyId, params.code)
    return c.json(serializeItem(item), 200)
  },
})

export const deleteItemRoute = defineRoute({
  access: REQUIRES("productions.products.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/items/{itemId}",
    summary: "Dar de baja un artículo",
    tags: ["Producciones"],
    request: { params: itemParams },
    responses: {
      204: {
        description:
          "Dado de baja, y retirado de los sets y de las continuidades que lo referenciaban. Ni " +
          "los sets ni las continuidades se eliminan",
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
      409: {
        description:
          "Figura en una nota de entrega sin cerrar. El mensaje **enumera cuáles**: decir sólo que " +
          "está en una entrega obliga a buscarla entre veinte",
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteItem(actorOf(c), params.companyId, params.productionId, params.itemId)
    return c.body(null, 204)
  },
})
