/**
 * Rutas del catálogo de almacén.
 *
 * Rebanada 12.
 *
 * ## Los permisos del producto no son uno, son once
 *
 * El catálogo tiene claves separadas para editar información, precio, ubicación, medidas y
 * clasificación. No es burocracia heredada: en una casa de renta, quien coloca equipo en la nave no
 * es quien pone los precios, y quien fotografía y describe no es quien decide en qué categoría va.
 * Con una sola clave de edición, dárselo a quien mueve cajas sería darle también la lista de
 * precios.
 *
 * Aquí se usan las que la operación toca de verdad: `edit_info` para los datos, `edit_location`
 * para mover, `select_category` para clasificar. Cuando una operación toca varias, se exige la más
 * específica y se comprueban las demás en el manejador.
 */

import { z } from "@hono/zod-openapi"
import { ForbiddenError, toInstant } from "@tfv/contracts"
import {
  createProductInput,
  measurementInput,
  measurementPatchInput,
  updateProductInput,
} from "@tfv/contracts/catalog"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import {
  addMeasurement,
  createProduct,
  deleteMeasurement,
  deleteProduct,
  getProduct,
  LENGTH_UNITS,
  listProducts,
  MASS_UNITS,
  MEASUREMENT_KINDS,
  productDeletionScope,
  productQuery,
  updateMeasurement,
  updateProduct,
} from "../warehouses/catalog.ts"
import {
  createWarehouseCategory,
  deleteWarehouseCategory,
  listWarehouseCategories,
  updateWarehouseCategory,
} from "../warehouses/categories.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const categorySchema = z.object({
  id: z.string(),
  warehouseId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  slug: z.string().nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  childCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const productSchema = z.object({
  id: z.string(),
  warehouseId: z.string(),
  parentId: z.string().nullable(),
  relationToParent: z.enum(["variant", "accessory"]).nullable(),
  name: z.string(),
  description: z.string(),
  internalCode: z.string().nullable(),
  code: z.string(),
  cost: z.string(),
  price: z.string(),
  usesPriceLists: z.boolean(),
  availableForSale: z.boolean(),
  availableForRent: z.boolean(),
  storageId: z.string().nullable(),
  categoryId: z.string().nullable(),
  globalCategoryId: z.string().nullable(),
  responsibleId: z.string().nullable(),
  slug: z.string().nullable(),
  isPublished: z.boolean(),
  /** Alta provisional desde una cotización, pendiente de completarse. */
  isProvisional: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const dimensionsSchema = z.object({
  height: z.number().optional(),
  width: z.number().optional(),
  length: z.number().optional(),
  weight: z.number().optional(),
})

/**
 * La ficha de sastrería.
 *
 * Cuarenta y cinco medidas corporales, **todas opcionales**, porque el mismo sistema que renta
 * cámaras renta vestuario. Van como diccionario abierto y no como cuarenta y cinco campos
 * declarados: se leen enteras, nunca se consulta una suelta, y la lista de qué se mide cambia según
 * la prenda y según la sastrería.
 */
const clothingSchema = z.object({
  garment: z.string().max(120).optional(),
  size: z.string().max(60).optional(),
  custom: z.string().max(500).optional(),
  measurements: z.record(z.string(), z.number()).optional(),
})

const measurementSchema = z.object({
  id: z.string(),
  productId: z.string(),
  name: z.string(),
  kind: z.enum(MEASUREMENT_KINDS),
  priceDifference: z.string(),
  dimensions: dimensionsSchema,
  lengthUnit: z.enum(LENGTH_UNITS),
  massUnit: z.enum(MASS_UNITS),
  clothing: clothingSchema.nullable(),
  units: z.record(z.string(), z.number().int()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const productDetailSchema = productSchema.extend({
  measurements: z.array(measurementSchema),
  variants: z.array(productSchema),
  accessories: z.array(productSchema),
})

const companyParams = z.object({ companyId: z.string() })
const warehouseParams = companyParams.extend({ warehouseId: z.string() })
const categoryParams = warehouseParams.extend({ categoryId: z.string() })
const productParams = warehouseParams.extend({ productId: z.string() })
const measurementParams = productParams.extend({ measurementId: z.string() })

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

function serializeCategory(row: Awaited<ReturnType<typeof createWarehouseCategory>>) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

function serializeProduct(row: Awaited<ReturnType<typeof listProducts>>["items"][number]) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

function serializeMeasurement(row: Awaited<ReturnType<typeof addMeasurement>>) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

function serializeDetail(row: Awaited<ReturnType<typeof getProduct>>) {
  return {
    ...serializeProduct(row),
    measurements: row.measurements.map(serializeMeasurement),
    variants: row.variants.map(serializeProduct),
    accessories: row.accessories.map(serializeProduct),
  }
}

// ─── Categorías del almacén ──────────────────────────────────────────────────

export const listWarehouseCategoriesRoute = defineRoute({
  access: REQUIRES("warehouses.categories.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/categories",
    summary: "Listar categorías; sin «parentId», las raíces",
    tags: ["Catálogo"],
    request: { params: warehouseParams, query: z.object({ parentId: z.string().optional() }) },
    responses: {
      200: {
        description: "Las categorías de ese nivel",
        content: { "application/json": { schema: z.object({ items: z.array(categorySchema) }) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const { parentId } = c.req.valid("query")

    const items = await listWarehouseCategories(actorOf(c), params.companyId, params.warehouseId, {
      ...(parentId === undefined ? {} : { parentId }),
    })
    return c.json({ items: items.map(serializeCategory) }, 200)
  },
})

export const createWarehouseCategoryRoute = defineRoute({
  access: REQUIRES("warehouses.categories.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses/{warehouseId}/categories",
    summary: "Crear una categoría del almacén",
    tags: ["Catálogo"],
    request: {
      params: warehouseParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().trim().min(1).max(160),
              description: z.string().max(2000).optional(),
              parentId: z.string().nullable().optional(),
              color: z.string().max(16).optional(),
              icon: z.string().max(64).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: "Creada", content: { "application/json": { schema: categorySchema } } },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const category = await createWarehouseCategory(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      c.req.valid("json"),
    )
    return c.json(serializeCategory(category), 201)
  },
})

export const updateWarehouseCategoryRoute = defineRoute({
  access: REQUIRES("warehouses.categories.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/warehouses/{warehouseId}/categories/{categoryId}",
    summary: "Editar o re-colgar una categoría",
    tags: ["Catálogo"],
    request: {
      params: categoryParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().trim().min(1).max(160).optional(),
              description: z.string().max(2000).optional(),
              parentId: z.string().nullable().optional(),
              color: z.string().max(16).nullable().optional(),
              icon: z.string().max(64).nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Actualizada",
        content: { "application/json": { schema: categorySchema } },
      },
      422: { description: "El padre nuevo es ella misma o una de sus descendientes" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const category = await updateWarehouseCategory(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.categoryId,
      c.req.valid("json"),
    )
    return c.json(serializeCategory(category), 200)
  },
})

export const deleteWarehouseCategoryRoute = defineRoute({
  access: REQUIRES("warehouses.categories.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/warehouses/{warehouseId}/categories/{categoryId}",
    summary: "Eliminar una categoría y su subárbol",
    tags: ["Catálogo"],
    request: { params: categoryParams },
    responses: {
      204: { description: "Eliminada. Lo clasificado sobrevive sin categoría" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteWarehouseCategory(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.categoryId,
    )
    return c.body(null, 204)
  },
})

// ─── Productos ───────────────────────────────────────────────────────────────

export const listProductsRoute = defineRoute({
  access: REQUIRES("warehouses.products.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/products",
    summary: "Listar el catálogo; sólo los productos raíz",
    tags: ["Catálogo"],
    request: { params: warehouseParams, query: collectionQuery(productQuery) },
    responses: {
      200: {
        description: "Productos sin padre. Las variantes se consultan desde el suyo",
        content: { "application/json": { schema: pageSchema(productSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listProducts(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      queryOf(c, productQuery),
    )
    return c.json(serializePage(page, serializeProduct), 200)
  },
})

export const getProductRoute = defineRoute({
  access: REQUIRES("warehouses.products.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/products/{productId}",
    summary: "Ver un producto con su estructura",
    tags: ["Catálogo"],
    request: { params: productParams },
    responses: {
      200: {
        description: "Medidas con su disponibilidad, variantes y accesorios",
        content: { "application/json": { schema: productDetailSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const product = await getProduct(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.productId,
    )
    return c.json(serializeDetail(product), 200)
  },
})

export const createProductRoute = defineRoute({
  access: REQUIRES("warehouses.products.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses/{warehouseId}/products",
    summary: "Crear un producto con toda su estructura, en una transacción",
    tags: ["Catálogo"],
    request: {
      params: warehouseParams,
      body: {
        content: {
          "application/json": {
            schema: createProductInput,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Creado con su estructura. Un fallo a mitad no deja nada",
        content: { "application/json": { schema: productDetailSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const product = await createProduct(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      c.req.valid("json"),
    )
    return c.json(serializeDetail(product), 201)
  },
})

export const updateProductRoute = defineRoute({
  access: REQUIRES("warehouses.products.edit_info"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/warehouses/{warehouseId}/products/{productId}",
    summary: "Editar un producto; reclasificarlo se propaga a sus hijos",
    tags: ["Catálogo"],
    request: {
      params: productParams,
      body: {
        content: {
          "application/json": {
            schema: updateProductInput,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Actualizado, con su estructura",
        content: { "application/json": { schema: productDetailSchema } },
      },
      403: { description: "Falta la clave concreta de lo que se intentó tocar" },
      409: { description: "El identificador legible ya está ocupado" },
    },
  },
  handler: async (c) => {
    const body = c.req.valid("json")
    const authorization = c.get("authorization")

    /**
     * Mover y clasificar tienen sus propias claves.
     *
     * `edit_info` protege la ruta porque es lo que casi toda edición toca; las otras dos se
     * comprueban aquí. Repartirlas en tres rutas obligaría a tres peticiones para guardar un
     * formulario y a tres momentos en los que el estado puede quedar a medias.
     */
    const requires = (permission: Parameters<typeof REQUIRES>[0], field: unknown) => {
      if (field === undefined) return
      if (authorization.isPlatformAdmin || authorization.isOwner) return
      if (!authorization.granted.has(permission)) {
        throw new ForbiddenError(`Falta el permiso «${permission}»`)
      }
    }

    requires("warehouses.products.edit_location", body.storageId)
    requires("warehouses.products.select_category", body.categoryId)
    requires("warehouses.products.select_category", body.globalCategoryId)
    requires("warehouses.products.edit_payment", body.cost ?? body.price)
    requires("warehouses.products.website", body.isPublished)
    // Convertir un alta provisional en producto de catálogo es dar de alta catálogo, aunque la
    // fila ya exista: es el momento en que alguien mira el producto y responde por él.
    requires("warehouses.products.create", body.isProvisional)

    const params = c.req.valid("param")
    const product = await updateProduct(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.productId,
      body,
    )
    return c.json(serializeDetail(product), 200)
  },
})

export const productScopeRoute = defineRoute({
  access: REQUIRES("warehouses.products.delete"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/products/{productId}/scope",
    summary: "Qué se lleva por delante dar de baja el producto",
    tags: ["Catálogo"],
    request: { params: productParams },
    responses: {
      200: {
        description: "Productos del subárbol, medidas y unidades",
        content: {
          "application/json": {
            schema: z.object({
              products: z.number().int(),
              measurements: z.number().int(),
              units: z.number().int(),
            }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scope = await productDeletionScope(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.productId,
    )
    return c.json(scope, 200)
  },
})

export const deleteProductRoute = defineRoute({
  access: REQUIRES("warehouses.products.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/warehouses/{warehouseId}/products/{productId}",
    summary: "Dar de baja un producto y su estructura",
    tags: ["Catálogo"],
    request: { params: productParams },
    responses: {
      204: { description: "Dado de baja. Los documentos emitidos conservan su nombre" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteProduct(actorOf(c), params.companyId, params.warehouseId, params.productId)
    return c.body(null, 204)
  },
})

// ─── Medidas ─────────────────────────────────────────────────────────────────

export const addMeasurementRoute = defineRoute({
  access: REQUIRES("warehouses.products.measurement_create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses/{warehouseId}/products/{productId}/measurements",
    summary: "Añadir una medida, con su cantidad inicial",
    tags: ["Catálogo"],
    request: {
      params: productParams,
      body: { content: { "application/json": { schema: measurementInput } } },
    },
    responses: {
      201: {
        description: "Creada. La cantidad inicial materializa unidades disponibles",
        content: { "application/json": { schema: measurementSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const measurement = await addMeasurement(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.productId,
      c.req.valid("json"),
    )
    return c.json(serializeMeasurement(measurement), 201)
  },
})

export const updateMeasurementRoute = defineRoute({
  /**
   * La clave del alta, y no una propia.
   *
   * El catálogo de permisos está cerrado en las 255 migradas y ampliarlo es decisión de producto,
   * así que se adopta el criterio de que quien puede añadir una medida puede corregir la que
   * añadió. Exigir la de borrado pediría el permiso de la operación destructiva para hacer la que
   * no lo es. Queda anotado en `HALLAZGOS.md`.
   */
  access: REQUIRES("warehouses.products.measurement_create"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/warehouses/{warehouseId}/products/{productId}/measurements/{measurementId}",
    summary: "Corregir una medida, sin tocar sus unidades",
    tags: ["Catálogo"],
    request: {
      params: measurementParams,
      body: { content: { "application/json": { schema: measurementPatchInput } } },
    },
    responses: {
      200: {
        description: "Corregida. Sus unidades siguen siendo las mismas",
        content: { "application/json": { schema: measurementSchema } },
      },
      404: { description: "La medida no es de ese producto" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const measurement = await updateMeasurement(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.productId,
      params.measurementId,
      c.req.valid("json"),
    )
    return c.json(serializeMeasurement(measurement), 200)
  },
})

export const deleteMeasurementRoute = defineRoute({
  access: REQUIRES("warehouses.products.measurement_delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/warehouses/{warehouseId}/products/{productId}/measurements/{measurementId}",
    summary: "Eliminar una medida y sus unidades",
    tags: ["Catálogo"],
    request: { params: measurementParams },
    responses: {
      204: { description: "Eliminada, con sus unidades" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteMeasurement(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.productId,
      params.measurementId,
    )
    return c.body(null, 204)
  },
})
