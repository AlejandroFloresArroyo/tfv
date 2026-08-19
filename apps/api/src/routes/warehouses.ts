/**
 * Rutas de almacenes y ubicaciones.
 *
 * Rebanada 12, y las primeras del servicio de almacenes.
 *
 * ## Dos permisos distintos para la misma pantalla
 *
 * Las ubicaciones tienen su propia familia de claves —`warehouses.storages.*`— separada de la del
 * almacén. No es burocracia: quien coloca mercancía en la nave necesita crear y mover cajas, y no
 * necesita poder dar de baja el almacén entero. Con una sola clave, dárselo a quien mueve cajas
 * sería darle también eso.
 *
 * ## El listado de ubicaciones no pagina
 *
 * Es un árbol, y su listado por defecto son **las raíces**. En la gramática de colecciones,
 * «ausente» no es «nulo», así que un `parentId` opcional no se puede expresar como filtro sin
 * cambiar lo que significa no pasarlo. Se queda con su propio contrato hasta que haya una pantalla
 * que pida paginar un nivel — que es cuando se sabrá qué debe significar.
 */

import { z } from "@hono/zod-openapi"
import { toInstant } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import {
  createStorage,
  deleteStorage,
  listStorages,
  STORAGE_KINDS,
  storageDeletionScope,
  storagePath,
  updateStorage,
} from "../warehouses/storages.ts"
import {
  createWarehouse,
  deleteWarehouse,
  deletionScope,
  getWarehouse,
  listWarehouses,
  updateWarehouse,
  warehouseQuery,
} from "../warehouses/warehouses.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

/**
 * La imagen única de una entidad, tal y como viaja.
 *
 * Tres campos y no uno: el identificador es lo que se envía al guardar, y las dos direcciones son
 * lo que la pantalla pinta sin tener que ir a buscarlas. La de celda puede faltar —un navegador que
 * no supo producir el derivado sube el original solo—, y entonces se pinta el original.
 */
const imageFields = {
  imageUploadId: z.string().nullable(),
  imageUrl: z.string().nullable(),
  imageThumbnailUrl: z.string().nullable(),
}

/** `null` la retira; omitirla la deja como está. */
const imageInput = z.string().nullable().optional()

const warehouseSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
  description: z.string(),
  slug: z.string().nullable(),
  isPublished: z.boolean(),
  priority: z.string(),
  ...imageFields,
  createdAt: z.string(),
  updatedAt: z.string(),
})

const storageSchema = z.object({
  id: z.string(),
  warehouseId: z.string(),
  parentId: z.string().nullable(),
  kind: z.enum(STORAGE_KINDS),
  code: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  ...imageFields,
  childCount: z.number().int(),
  productCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const companyParams = z.object({ companyId: z.string() })
const warehouseParams = companyParams.extend({ warehouseId: z.string() })
const storageParams = warehouseParams.extend({ storageId: z.string() })

const nameField = z.string().trim().min(1, "El nombre es obligatorio").max(200)
/** Decimal con hasta cuatro posiciones, como la columna. */
const priorityField = z.string().regex(/^-?\d+(\.\d{1,4})?$/)

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

function serializeWarehouse(row: Awaited<ReturnType<typeof getWarehouse>>) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

function serializeStorage(row: Awaited<ReturnType<typeof createStorage>>) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

// ─── Almacenes ───────────────────────────────────────────────────────────────

export const listWarehousesRoute = defineRoute({
  access: REQUIRES("warehouses.warehouses.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses",
    summary: "Listar los almacenes de una empresa",
    tags: ["Almacenes"],
    request: { params: companyParams, query: collectionQuery(warehouseQuery) },
    responses: {
      200: {
        description: "Almacenes, por prioridad y luego por fecha",
        content: { "application/json": { schema: pageSchema(warehouseSchema) } },
      },
    },
  },
  handler: async (c) => {
    const page = await listWarehouses(
      actorOf(c),
      c.req.valid("param").companyId,
      queryOf(c, warehouseQuery),
    )
    return c.json(serializePage(page, serializeWarehouse), 200)
  },
})

export const createWarehouseRoute = defineRoute({
  access: REQUIRES("warehouses.warehouses.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses",
    summary: "Crear un almacén",
    tags: ["Almacenes"],
    request: {
      params: companyParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              description: z.string().max(4000).optional(),
              priority: priorityField.optional(),
              isPublished: z.boolean().optional(),
              imageUploadId: imageInput,
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Almacén creado, con su identificador legible derivado del nombre",
        content: { "application/json": { schema: warehouseSchema } },
      },
      422: { description: "La empresa no tiene contratado el servicio de almacenes" },
    },
  },
  handler: async (c) => {
    const warehouse = await createWarehouse(
      actorOf(c),
      c.req.valid("param").companyId,
      c.req.valid("json"),
    )
    return c.json(serializeWarehouse(warehouse), 201)
  },
})

export const getWarehouseRoute = defineRoute({
  access: REQUIRES("warehouses.warehouses.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}",
    summary: "Ver un almacén",
    tags: ["Almacenes"],
    request: { params: warehouseParams },
    responses: {
      200: {
        description: "El almacén",
        content: { "application/json": { schema: warehouseSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const warehouse = await getWarehouse(actorOf(c), params.companyId, params.warehouseId)
    return c.json(serializeWarehouse(warehouse), 200)
  },
})

export const updateWarehouseRoute = defineRoute({
  access: REQUIRES("warehouses.warehouses.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/warehouses/{warehouseId}",
    summary: "Editar un almacén",
    tags: ["Almacenes"],
    request: {
      params: warehouseParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              description: z.string().max(4000).optional(),
              priority: priorityField.optional(),
              isPublished: z.boolean().optional(),
              slug: z.string().trim().min(1).max(220).optional(),
              imageUploadId: imageInput,
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Almacén actualizado",
        content: { "application/json": { schema: warehouseSchema } },
      },
      409: { description: "El identificador legible ya está ocupado" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const warehouse = await updateWarehouse(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      c.req.valid("json"),
    )
    return c.json(serializeWarehouse(warehouse), 200)
  },
})

export const warehouseScopeRoute = defineRoute({
  access: REQUIRES("warehouses.warehouses.delete"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/scope",
    summary: "Qué se lleva por delante dar de baja el almacén",
    tags: ["Almacenes"],
    request: { params: warehouseParams },
    responses: {
      200: {
        description: "Recuento real, para enumerarlo en la confirmación",
        content: {
          "application/json": {
            schema: z.object({
              storages: z.number().int(),
              categories: z.number().int(),
              products: z.number().int(),
              priceLists: z.number().int(),
              quotes: z.number().int(),
              orders: z.number().int(),
              /** Las que además impiden la baja, para decirlo antes de que nadie confirme. */
              openQuotes: z.number().int(),
              openOrders: z.number().int(),
            }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scope = await deletionScope(actorOf(c), params.companyId, params.warehouseId)
    return c.json(scope, 200)
  },
})

export const deleteWarehouseRoute = defineRoute({
  access: REQUIRES("warehouses.warehouses.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/warehouses/{warehouseId}",
    summary: "Dar de baja un almacén",
    tags: ["Almacenes"],
    request: { params: warehouseParams },
    responses: {
      204: { description: "Dado de baja. El borrado es lógico y conserva el historial" },
      409: { description: "Tiene cotizaciones o pedidos en curso" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteWarehouse(actorOf(c), params.companyId, params.warehouseId)
    return c.body(null, 204)
  },
})

// ─── Ubicaciones ─────────────────────────────────────────────────────────────

export const listStoragesRoute = defineRoute({
  access: REQUIRES("warehouses.storages.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/storages",
    summary: "Listar ubicaciones; sin «parentId», las raíces",
    tags: ["Almacenes"],
    request: {
      params: warehouseParams,
      query: z.object({ parentId: z.string().optional() }),
    },
    responses: {
      200: {
        description: "Las ubicaciones de ese nivel, con su recuento de hijas y de productos",
        content: { "application/json": { schema: z.object({ items: z.array(storageSchema) }) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const { parentId } = c.req.valid("query")

    const items = await listStorages(actorOf(c), params.companyId, params.warehouseId, {
      ...(parentId === undefined ? {} : { parentId }),
    })
    return c.json({ items: items.map(serializeStorage) }, 200)
  },
})

export const storagePathRoute = defineRoute({
  access: REQUIRES("warehouses.storages.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/storages/{storageId}/path",
    summary: "El camino desde la raíz hasta una ubicación",
    tags: ["Almacenes"],
    request: { params: storageParams },
    responses: {
      200: {
        description: "De la raíz a la ubicación, ambas incluidas",
        content: { "application/json": { schema: z.object({ items: z.array(storageSchema) }) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const items = await storagePath(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.storageId,
    )
    return c.json({ items: items.map(serializeStorage) }, 200)
  },
})

export const createStorageRoute = defineRoute({
  access: REQUIRES("warehouses.storages.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses/{warehouseId}/storages",
    summary: "Crear una ubicación",
    tags: ["Almacenes"],
    request: {
      params: warehouseParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              kind: z.enum(STORAGE_KINDS).optional(),
              parentId: z.string().nullable().optional(),
              color: z.string().max(16).optional(),
              icon: z.string().max(64).optional(),
              imageUploadId: imageInput,
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Creada, con su código autogenerado por tipo y almacén",
        content: { "application/json": { schema: storageSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const storage = await createStorage(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      c.req.valid("json"),
    )
    return c.json(serializeStorage(storage), 201)
  },
})

export const updateStorageRoute = defineRoute({
  access: REQUIRES("warehouses.storages.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/warehouses/{warehouseId}/storages/{storageId}",
    summary: "Editar una ubicación; cambiar el tipo regenera el código",
    tags: ["Almacenes"],
    request: {
      params: storageParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              kind: z.enum(STORAGE_KINDS).optional(),
              parentId: z.string().nullable().optional(),
              color: z.string().max(16).nullable().optional(),
              icon: z.string().max(64).nullable().optional(),
              imageUploadId: imageInput,
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Actualizada",
        content: { "application/json": { schema: storageSchema } },
      },
      422: { description: "El padre nuevo es ella misma o una de sus descendientes" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const storage = await updateStorage(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.storageId,
      c.req.valid("json"),
    )
    return c.json(serializeStorage(storage), 200)
  },
})

export const storageScopeRoute = defineRoute({
  access: REQUIRES("warehouses.storages.delete"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/storages/{storageId}/scope",
    summary: "Qué se lleva por delante eliminar la ubicación",
    tags: ["Almacenes"],
    request: { params: storageParams },
    responses: {
      200: {
        description: "Ubicaciones del subárbol, y productos que quedarán sin ubicación",
        content: {
          "application/json": {
            schema: z.object({ storages: z.number().int(), products: z.number().int() }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scope = await storageDeletionScope(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.storageId,
    )
    return c.json(scope, 200)
  },
})

export const deleteStorageRoute = defineRoute({
  access: REQUIRES("warehouses.storages.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/warehouses/{warehouseId}/storages/{storageId}",
    summary: "Eliminar una ubicación y su subárbol",
    tags: ["Almacenes"],
    request: { params: storageParams },
    responses: {
      204: { description: "Eliminada. Sus productos quedan sin ubicación, no se eliminan" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteStorage(actorOf(c), params.companyId, params.warehouseId, params.storageId)
    return c.body(null, 204)
  },
})
