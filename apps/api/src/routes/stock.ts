/**
 * Rutas de precios y de unidades de existencia.
 *
 * Rebanada 12.
 *
 * ## La localización por código cuelga del almacén, no de la medida
 *
 * Es la consulta del escáner: quien lee una etiqueta en la nave **no sabe** de qué producto ni de
 * qué medida es —para eso la lee—. Colgarla de la medida obligaría a saber la respuesta antes de
 * preguntar.
 */

import { z } from "@hono/zod-openapi"
import { toInstant } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import {
  createPriceList,
  deletePriceList,
  FREQUENCIES,
  getPriceList,
  listPriceLists,
  listPrices,
  priceListDeletionScope,
  priceListQuery,
  removePrice,
  resolveRentPrice,
  resolveSalePrice,
  setPrice,
  setProducts,
  updatePriceList,
} from "../warehouses/prices.ts"
import {
  changeStatus,
  createUnits,
  deleteUnits,
  findByCode,
  listUnits,
  STOCK_REASONS,
  STOCK_STATUSES,
  stockQuery,
  unitHistory,
} from "../warehouses/stock.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const moneyField = z.string().regex(/^-?\d+(\.\d{1,2})?$/)

const rateSchema = z.object({
  isFixed: z.boolean(),
  fixed: moneyField.optional(),
  daily: moneyField.optional(),
  weekly: moneyField.optional(),
  monthly: moneyField.optional(),
})

const priceListSchema = z.object({
  id: z.string(),
  warehouseId: z.string(),
  name: z.string(),
  description: z.string(),
  productCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const productPriceSchema = z.object({
  id: z.string(),
  priceListId: z.string(),
  productId: z.string(),
  /** Con la tarifa, para no pedir el catálogo entero sólo para nombrar las filas (H-34). */
  productName: z.string(),
  productCode: z.string(),
  sale: z.string(),
  rent: rateSchema,
  penalty: rateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

const unitSchema = z.object({
  id: z.string(),
  measurementId: z.string(),
  code: z.string(),
  status: z.enum(STOCK_STATUSES),
  createdByReservation: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const unitLocationSchema = unitSchema.extend({
  measurementName: z.string(),
  productId: z.string(),
  productName: z.string(),
  productCode: z.string(),
  storageId: z.string().nullable(),
  storageCode: z.string().nullable(),
  storageName: z.string().nullable(),
})

const eventSchema = z.object({
  id: z.string(),
  fromStatus: z.enum(STOCK_STATUSES).nullable(),
  toStatus: z.enum(STOCK_STATUSES),
  reason: z.enum(STOCK_REASONS),
  actorId: z.string().nullable(),
  /** Con el evento, para no pedir el padrón de la empresa sólo para nombrarlo (H-33). */
  actorName: z.string().nullable(),
  causeId: z.string().nullable(),
  note: z.string().nullable(),
  occurredAt: z.string(),
})

const resolvedPriceSchema = z.object({
  amount: z.string(),
  origin: z.enum(["price_list", "product", "none"]),
  missing: z.boolean(),
})

const companyParams = z.object({ companyId: z.string() })
const warehouseParams = companyParams.extend({ warehouseId: z.string() })
const listParams = warehouseParams.extend({ priceListId: z.string() })
const listProductParams = listParams.extend({ productId: z.string() })
const measurementParams = warehouseParams.extend({ measurementId: z.string() })
const unitParams = warehouseParams.extend({ unitId: z.string() })

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

function serializePriceList(row: Awaited<ReturnType<typeof createPriceList>>) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

function serializePrice(row: Awaited<ReturnType<typeof setPrice>>) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

function serializeUnit(row: Awaited<ReturnType<typeof createUnits>>[number]) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

// ─── Listas de precios ───────────────────────────────────────────────────────

export const listPriceListsRoute = defineRoute({
  access: REQUIRES("warehouses.prices.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/price-lists",
    summary: "Listar las listas de precios de un almacén",
    tags: ["Precios"],
    request: { params: warehouseParams, query: collectionQuery(priceListQuery) },
    responses: {
      200: {
        description: "Listas, con cuántos productos tienen tarifa en cada una",
        content: { "application/json": { schema: pageSchema(priceListSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listPriceLists(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      queryOf(c, priceListQuery),
    )
    return c.json(serializePage(page, serializePriceList), 200)
  },
})

export const getPriceListRoute = defineRoute({
  access: REQUIRES("warehouses.prices.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}",
    summary: "Ver una lista de precios",
    tags: ["Precios"],
    request: { params: listParams },
    responses: {
      200: {
        description: "La lista, con cuántos productos tienen tarifa en ella",
        content: { "application/json": { schema: priceListSchema } },
      },
      404: { description: "No existe en este almacén, o está dada de baja" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const list = await getPriceList(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.priceListId,
    )
    return c.json(serializePriceList(list), 200)
  },
})

export const createPriceListRoute = defineRoute({
  access: REQUIRES("warehouses.prices.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses/{warehouseId}/price-lists",
    summary: "Crear una lista de precios",
    tags: ["Precios"],
    request: {
      params: warehouseParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().trim().min(1).max(200),
              description: z.string().max(2000).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: "Creada", content: { "application/json": { schema: priceListSchema } } },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const list = await createPriceList(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      c.req.valid("json"),
    )
    return c.json(serializePriceList(list), 201)
  },
})

export const updatePriceListRoute = defineRoute({
  access: REQUIRES("warehouses.prices.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}",
    summary: "Editar una lista de precios",
    tags: ["Precios"],
    request: {
      params: listParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().trim().min(1).max(200).optional(),
              description: z.string().max(2000).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Actualizada",
        content: { "application/json": { schema: priceListSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const list = await updatePriceList(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.priceListId,
      c.req.valid("json"),
    )
    return c.json(serializePriceList(list), 200)
  },
})

export const priceListScopeRoute = defineRoute({
  access: REQUIRES("warehouses.prices.delete"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}/scope",
    summary: "Qué se lleva por delante dar de baja la lista",
    tags: ["Precios"],
    request: { params: listParams },
    responses: {
      200: {
        description: "Productos que se quedan sin precio, y cotizaciones que cobran por ella",
        content: {
          "application/json": {
            schema: z.object({
              products: z.number().int(),
              quotes: z.number().int(),
              /** Las que además impiden la baja, para decirlo antes de que nadie confirme. */
              openQuotes: z.number().int(),
            }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scope = await priceListDeletionScope(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.priceListId,
    )
    return c.json(scope, 200)
  },
})

export const deletePriceListRoute = defineRoute({
  access: REQUIRES("warehouses.prices.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}",
    summary: "Dar de baja una lista de precios",
    tags: ["Precios"],
    request: { params: listParams },
    responses: {
      204: { description: "Dada de baja. Los productos sobreviven; sus tarifas en ella, no" },
      409: { description: "La usan cotizaciones en curso" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deletePriceList(actorOf(c), params.companyId, params.warehouseId, params.priceListId)
    return c.body(null, 204)
  },
})

// ─── Tarifas ─────────────────────────────────────────────────────────────────

export const listPricesRoute = defineRoute({
  access: REQUIRES("warehouses.prices.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}/prices",
    summary: "Las tarifas de una lista",
    tags: ["Precios"],
    request: { params: listParams },
    responses: {
      200: {
        description: "Tarifas de venta, renta y penalización por producto",
        content: {
          "application/json": { schema: z.object({ items: z.array(productPriceSchema) }) },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const items = await listPrices(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.priceListId,
    )
    return c.json({ items: items.map(serializePrice) }, 200)
  },
})

export const setPriceRoute = defineRoute({
  access: REQUIRES("warehouses.prices.edit"),
  config: {
    method: "put",
    path: "/companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}/prices/{productId}",
    summary: "Fijar la tarifa de un producto en una lista",
    tags: ["Precios"],
    request: {
      params: listProductParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              sale: moneyField.optional(),
              rent: rateSchema.optional(),
              penalty: rateSchema.optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Tarifa fijada",
        content: { "application/json": { schema: productPriceSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const price = await setPrice(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.priceListId,
      params.productId,
      c.req.valid("json"),
    )
    return c.json(serializePrice(price), 200)
  },
})

export const setPriceListProductsRoute = defineRoute({
  access: REQUIRES("warehouses.prices.edit"),
  config: {
    method: "put",
    path: "/companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}/products",
    summary: "Establecer el conjunto de productos de una lista",
    tags: ["Precios"],
    request: {
      params: listParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({ productIds: z.array(z.string()).max(2000) }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Añade los que faltan y **retira los que sobran** (corrige L-04)",
        content: {
          "application/json": {
            schema: z.object({
              added: z.number().int(),
              removed: z.number().int(),
              kept: z.number().int(),
            }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const result = await setProducts(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.priceListId,
      c.req.valid("json").productIds,
    )
    return c.json(result, 200)
  },
})

export const removePriceRoute = defineRoute({
  access: REQUIRES("warehouses.prices.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}/prices/{productId}",
    summary: "Retirar un producto de una lista",
    tags: ["Precios"],
    request: { params: listProductParams },
    responses: { 204: { description: "Retirado. El producto no se toca" } },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await removePrice(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.priceListId,
      params.productId,
    )
    return c.body(null, 204)
  },
})

export const resolvePriceRoute = defineRoute({
  access: REQUIRES("warehouses.products.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/products/{productId}/price",
    summary: "Resolver el precio de un producto con la precedencia declarada",
    tags: ["Precios"],
    request: {
      params: warehouseParams.extend({ productId: z.string() }),
      query: z.object({
        mode: z.enum(["sale", "rent"]).optional(),
        priceListId: z.string().optional(),
        frequency: z.enum(FREQUENCIES).optional(),
        priceDifference: moneyField.optional(),
      }),
    },
    responses: {
      200: {
        description: "El importe, de dónde salió, y si falta precio en lugar de valer cero",
        content: { "application/json": { schema: resolvedPriceSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const query = c.req.valid("query")

    const options = {
      ...(query.priceListId === undefined ? {} : { priceListId: query.priceListId }),
      ...(query.frequency === undefined ? {} : { frequency: query.frequency }),
      ...(query.priceDifference === undefined ? {} : { priceDifference: query.priceDifference }),
    }

    const resolve = query.mode === "rent" ? resolveRentPrice : resolveSalePrice
    const price = await resolve(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.productId,
      options,
    )
    return c.json(price, 200)
  },
})

// ─── Unidades ────────────────────────────────────────────────────────────────

export const listUnitsRoute = defineRoute({
  access: REQUIRES("warehouses.products.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/measurements/{measurementId}/units",
    summary: "Listar las unidades de una medida",
    tags: ["Existencias"],
    request: { params: measurementParams, query: collectionQuery(stockQuery) },
    responses: {
      200: {
        description: "Unidades, filtrables por estado",
        content: { "application/json": { schema: pageSchema(unitSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listUnits(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.measurementId,
      queryOf(c, stockQuery),
    )
    return c.json(serializePage(page, serializeUnit), 200)
  },
})

export const createUnitsRoute = defineRoute({
  access: REQUIRES("warehouses.products.stock_create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses/{warehouseId}/measurements/{measurementId}/units",
    summary: "Dar de alta unidades; una o varias, es la misma operación",
    tags: ["Existencias"],
    request: {
      params: measurementParams,
      body: {
        content: {
          "application/json": { schema: z.object({ quantity: z.number().int().min(1).max(500) }) },
        },
      },
    },
    responses: {
      201: {
        description: "Creadas, disponibles y cada una con su código",
        content: { "application/json": { schema: z.object({ items: z.array(unitSchema) }) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const items = await createUnits(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.measurementId,
      c.req.valid("json").quantity,
    )
    return c.json({ items: items.map(serializeUnit) }, 201)
  },
})

export const changeUnitStatusRoute = defineRoute({
  access: REQUIRES("warehouses.products.stock_edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/warehouses/{warehouseId}/measurements/{measurementId}/units",
    summary: "Cambiar el estado de unas unidades, o de todas las de la medida",
    tags: ["Existencias"],
    request: {
      params: measurementParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              unitIds: z.array(z.string()).max(500).optional(),
              status: z.enum(STOCK_STATUSES),
              note: z.string().max(500).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Atómico: si una no admite el cambio, no cambia ninguna",
        content: { "application/json": { schema: z.object({ items: z.array(unitSchema) }) } },
      },
      422: { description: "Alguna está comprometida, o salió definitivamente del inventario" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const items = await changeStatus(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.measurementId,
      c.req.valid("json"),
    )
    return c.json({ items: items.map(serializeUnit) }, 200)
  },
})

export const deleteUnitsRoute = defineRoute({
  access: REQUIRES("warehouses.products.stock_delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/warehouses/{warehouseId}/measurements/{measurementId}/units",
    summary: "Dar de baja unidades",
    tags: ["Existencias"],
    request: {
      params: measurementParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({ unitIds: z.array(z.string()).min(1).max(500) }),
          },
        },
      },
    },
    responses: {
      204: { description: "Dadas de baja. Los documentos que las mencionan las conservan" },
      422: { description: "Alguna está comprometida en un documento vigente" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteUnits(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.measurementId,
      c.req.valid("json").unitIds,
    )
    return c.body(null, 204)
  },
})

export const findUnitByCodeRoute = defineRoute({
  access: REQUIRES("warehouses.products.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/units/by-code/{code}",
    summary: "Localizar una unidad por el código de su etiqueta",
    tags: ["Existencias"],
    request: { params: warehouseParams.extend({ code: z.string() }) },
    responses: {
      200: {
        description: "La unidad con su producto, su medida, su ubicación y su estado",
        content: { "application/json": { schema: unitLocationSchema } },
      },
      404: { description: "Ninguna unidad de este almacén tiene ese código" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const unit = await findByCode(actorOf(c), params.companyId, params.warehouseId, params.code)
    return c.json(serializeUnit(unit), 200)
  },
})

export const unitHistoryRoute = defineRoute({
  access: REQUIRES("warehouses.products.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/units/{unitId}/history",
    summary: "El historial de estado de una unidad",
    tags: ["Existencias"],
    request: { params: unitParams },
    responses: {
      200: {
        description: "De lo más reciente a lo más antiguo, con su motivo y su responsable",
        content: { "application/json": { schema: z.object({ items: z.array(eventSchema) }) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const items = await unitHistory(actorOf(c), params.companyId, params.warehouseId, params.unitId)
    return c.json(
      { items: items.map((row) => ({ ...row, occurredAt: toInstant(row.occurredAt) })) },
      200,
    )
  },
})
