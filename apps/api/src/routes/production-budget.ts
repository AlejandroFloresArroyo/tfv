/**
 * Rutas del presupuesto de una producción: anclas, compras y la lectura derivada.
 *
 * Rebanada 22, el bloque de presupuesto. Están aparte de `productions.ts` por lo mismo que las del
 * tiempo: el archivo de rutas es un inventario que se lee de arriba abajo, y veinte rutas más en el
 * de al lado lo dejan de ser.
 *
 * ## Las claves son las que hay, y no se inventa ninguna
 *
 * El catálogo cerrado da al presupuesto once claves: `budgets.view`, las cuatro de `anchors` y las
 * seis de `shoppings`. Cada operación declara la suya, y las dos **finas** de las compras se exigen
 * encima de la gruesa, sólo cuando el cuerpo trae el campo que las exige:
 *
 * ```
 * shoppings.select_category  →  clasificar la compra
 * shoppings.products         →  establecer los artículos que incorporó
 * ```
 *
 * Es el mismo reparto que ya usaban las tareas de un plan. Lo que compra: quien corrige el importe
 * de una compra no puede reclasificarla ni tocar el inventario que trajo.
 *
 * **Lo que el catálogo no tiene** queda anotado en `HALLAZGOS.md` y no se resuelve inventando una
 * clave: las anclas llevan categoría y no tienen `anchors.select_category`, y ninguna de las dos
 * colecciones tiene clave de responsable. Ver H-230.
 *
 * ## La lectura del presupuesto lleva dos juegos de filtros
 *
 * Uno por colección, con prefijo, porque son dos gramáticas distintas —una compra se filtra por
 * método de pago y un ancla no— y mezclarlas en un solo espacio de nombres haría que `categoryId`
 * significara dos cosas a la vez.
 */

import { z } from "@hono/zod-openapi"
import {
  ForbiddenError,
  type PermissionKey,
  SHOPPING_KINDS,
  SHOPPING_METHODS,
  toInstant,
  toNullableInstant,
} from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import {
  type AnchorRecord,
  anchorQuery,
  attachToBudget,
  type BudgetAttachment,
  type BudgetRecord,
  createAnchor,
  createShopping,
  deleteAnchor,
  deleteShopping,
  detachFromBudget,
  getAnchor,
  getShopping,
  listAnchors,
  listShoppings,
  readBudget,
  type ShoppingRecord,
  setShoppingItems,
  shoppingQuery,
  updateAnchor,
  updateShopping,
} from "../productions/budget.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const instant = z.string().datetime()

/** Cadena decimal con dos decimales como mucho. El dinero nunca viaja como número. */
const amount = z.string().regex(/^-?\d+(\.\d{1,2})?$/, "El importe no es válido")

const productionParams = z.object({ companyId: z.string(), productionId: z.string() })
const anchorParams = productionParams.extend({ anchorId: z.string() })
const shoppingParams = productionParams.extend({ shoppingId: z.string() })
const anchorAttachmentParams = anchorParams.extend({ attachmentId: z.string() })
const shoppingAttachmentParams = shoppingParams.extend({ attachmentId: z.string() })

const attachmentSchema = z.object({
  id: z.string(),
  uploadId: z.string(),
  name: z.string(),
  url: z.string(),
  kind: z.string(),
  createdAt: z.string(),
})

const anchorSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  name: z.string(),
  description: z.string(),
  amount: z.string(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  attachments: z.array(attachmentSchema).readonly(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const shoppingItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
})

const shoppingSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  name: z.string(),
  observations: z.string(),
  amount: z.string(),
  kind: z.enum(SHOPPING_KINDS),
  method: z.enum(SHOPPING_METHODS),
  /** Identificación **parcial**. Cuatro dígitos como mucho, nunca el número completo. */
  cardLast4: z.string().nullable(),
  isDeductible: z.boolean(),
  occurredOn: z.string().nullable(),
  providerId: z.string().nullable(),
  providerName: z.string().nullable(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  /** El pedido de almacén que la originó. Lo escribe la 23; aquí sólo se respeta y se devuelve. */
  warehouseOrderId: z.string().nullable(),
  items: z.array(shoppingItemSchema).readonly(),
  attachments: z.array(attachmentSchema).readonly(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const amountsSchema = z.object({
  totalPresupuestado: z.string(),
  totalGastado: z.string(),
  diferencia: z.string(),
  /** Se gastó más de lo previsto. Va como dato para que la pantalla no tenga que leer el signo. */
  isUnfavorable: z.boolean(),
})

const categorySchema = z.object({
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  budgeted: z.string(),
  spent: z.string(),
  difference: z.string(),
  isUnfavorable: z.boolean(),
})

export const budgetSchema = z.object({
  anchors: z.array(anchorSchema).readonly(),
  shoppings: z.array(shoppingSchema).readonly(),
  /** Los importes de lo que se está mirando. Sin filtros coinciden con los generales. */
  filtered: amountsSchema,
  /** Los de la producción entera, siempre, para no perder de vista el conjunto. */
  overall: amountsSchema,
  categories: z.array(categorySchema).readonly(),
})

// ─── Serialización ───────────────────────────────────────────────────────────

function serializeAttachment(attachment: BudgetAttachment) {
  return { ...attachment, createdAt: toInstant(attachment.createdAt) }
}

function serializeAnchor(anchor: AnchorRecord) {
  return {
    ...anchor,
    attachments: anchor.attachments.map(serializeAttachment),
    createdAt: toInstant(anchor.createdAt),
    updatedAt: toInstant(anchor.updatedAt),
  }
}

function serializeShopping(shopping: ShoppingRecord) {
  return {
    ...shopping,
    occurredOn: toNullableInstant(shopping.occurredOn),
    attachments: shopping.attachments.map(serializeAttachment),
    createdAt: toInstant(shopping.createdAt),
    updatedAt: toInstant(shopping.updatedAt),
  }
}

function serializeBudget(budget: BudgetRecord) {
  return {
    ...budget,
    anchors: budget.anchors.map(serializeAnchor),
    shoppings: budget.shoppings.map(serializeShopping),
  }
}

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

/**
 * Exige una clave **fina** encima de la que la ruta ya declaró.
 *
 * Se comprueba sólo si el cuerpo trae el campo que la exige: mandar el formulario entero no puede
 * costar más permisos de los que hacen falta para lo que de verdad se cambió.
 */
function require(
  c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0],
  permission: PermissionKey,
): void {
  const authorization = c.get("authorization")
  if (authorization.isPlatformAdmin || authorization.isOwner) return
  if (authorization.granted.has(permission)) return

  throw new ForbiddenError(`Falta el permiso «${permission}»`)
}

// ─── Anclas ──────────────────────────────────────────────────────────────────

export const listAnchorsRoute = defineRoute({
  access: REQUIRES("productions.anchors.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/anchors",
    summary: "Listar las partidas presupuestadas de una producción",
    tags: ["Producciones"],
    request: { params: productionParams, query: collectionQuery(anchorQuery) },
    responses: {
      200: {
        description: "Las anclas de la producción",
        content: { "application/json": { schema: pageSchema(anchorSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listAnchors(
      actorOf(c),
      params.companyId,
      params.productionId,
      queryOf(c, anchorQuery),
    )
    return c.json(serializePage(page, serializeAnchor), 200)
  },
})

export const getAnchorRoute = defineRoute({
  access: REQUIRES("productions.anchors.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/anchors/{anchorId}",
    summary: "Consultar una partida presupuestada",
    tags: ["Producciones"],
    request: { params: anchorParams },
    responses: {
      200: {
        description: "El ancla con sus comprobantes",
        content: { "application/json": { schema: anchorSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const anchor = await getAnchor(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.anchorId,
    )
    return c.json(serializeAnchor(anchor), 200)
  },
})

export const createAnchorRoute = defineRoute({
  access: REQUIRES("productions.anchors.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/anchors",
    summary: "Registrar una partida presupuestada",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().min(1).max(250),
              description: z.string().max(4000).optional(),
              amount: amount,
              categoryId: z.string().nullable().optional(),
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Registrada en la producción",
        content: { "application/json": { schema: anchorSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const anchor = await createAnchor(
      actorOf(c),
      params.companyId,
      params.productionId,
      c.req.valid("json"),
    )
    return c.json(serializeAnchor(anchor), 201)
  },
})

export const updateAnchorRoute = defineRoute({
  access: REQUIRES("productions.anchors.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/anchors/{anchorId}",
    summary: "Editar una partida presupuestada",
    tags: ["Producciones"],
    request: {
      params: anchorParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().min(1).max(250).optional(),
              description: z.string().max(4000).optional(),
              amount: amount.optional(),
              categoryId: z.string().nullable().optional(),
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Actualizada",
        content: { "application/json": { schema: anchorSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const anchor = await updateAnchor(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.anchorId,
      c.req.valid("json"),
    )
    return c.json(serializeAnchor(anchor), 200)
  },
})

export const deleteAnchorRoute = defineRoute({
  access: REQUIRES("productions.anchors.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/anchors/{anchorId}",
    summary: "Dar de baja una partida presupuestada",
    tags: ["Producciones"],
    request: { params: anchorParams },
    responses: { 204: { description: "Dada de baja" } },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteAnchor(actorOf(c), params.companyId, params.productionId, params.anchorId)
    return c.body(null, 204)
  },
})

export const attachToAnchorRoute = defineRoute({
  access: REQUIRES("productions.anchors.edit"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/anchors/{anchorId}/attachments",
    summary: "Colgar un comprobante de una partida",
    tags: ["Producciones"],
    request: {
      params: anchorParams,
      body: {
        content: { "application/json": { schema: z.object({ uploadId: z.string() }) } },
      },
    },
    responses: {
      201: {
        description: "El comprobante colgado",
        content: { "application/json": { schema: attachmentSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const attachment = await attachToBudget(
      actorOf(c),
      params.companyId,
      params.productionId,
      { anchorId: params.anchorId, shoppingId: null },
      c.req.valid("json").uploadId,
    )
    return c.json(serializeAttachment(attachment), 201)
  },
})

export const detachFromAnchorRoute = defineRoute({
  access: REQUIRES("productions.anchors.edit"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/anchors/{anchorId}/attachments/{attachmentId}",
    summary: "Retirar un comprobante de una partida",
    tags: ["Producciones"],
    request: { params: anchorAttachmentParams },
    responses: { 204: { description: "Retirado" } },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await detachFromBudget(
      actorOf(c),
      params.companyId,
      params.productionId,
      { anchorId: params.anchorId, shoppingId: null },
      params.attachmentId,
    )
    return c.body(null, 204)
  },
})

// ─── Compras ─────────────────────────────────────────────────────────────────

export const listShoppingsRoute = defineRoute({
  access: REQUIRES("productions.shoppings.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/shoppings",
    summary: "Listar los gastos de una producción",
    tags: ["Producciones"],
    request: { params: productionParams, query: collectionQuery(shoppingQuery) },
    responses: {
      200: {
        description: "Las compras de la producción",
        content: { "application/json": { schema: pageSchema(shoppingSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listShoppings(
      actorOf(c),
      params.companyId,
      params.productionId,
      queryOf(c, shoppingQuery),
    )
    return c.json(serializePage(page, serializeShopping), 200)
  },
})

export const getShoppingRoute = defineRoute({
  access: REQUIRES("productions.shoppings.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/shoppings/{shoppingId}",
    summary: "Consultar un gasto con sus artículos y sus facturas",
    tags: ["Producciones"],
    request: { params: shoppingParams },
    responses: {
      200: {
        description: "La compra abierta",
        content: { "application/json": { schema: shoppingSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const shopping = await getShopping(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.shoppingId,
    )
    return c.json(serializeShopping(shopping), 200)
  },
})

const shoppingBody = z.object({
  name: z.string().min(1).max(250),
  observations: z.string().max(4000).optional(),
  amount: amount,
  kind: z.enum(SHOPPING_KINDS).optional(),
  method: z.enum(SHOPPING_METHODS).optional(),
  /**
   * De la tarjeta, **hasta cuatro dígitos**.
   *
   * El límite está en el esquema de entrada además de en el tipo del dominio: así el número
   * completo se rechaza en la puerta, con un `400` que dice qué campo, en vez de llegar al servicio.
   */
  cardLast4: z
    .string()
    .regex(/^\d{1,4}$/)
    .nullable()
    .optional(),
  isDeductible: z.boolean().optional(),
  occurredOn: instant.nullable().optional(),
  providerId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  responsibleId: z.string().nullable().optional(),
})

export const createShoppingRoute = defineRoute({
  access: REQUIRES("productions.shoppings.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/shoppings",
    summary: "Registrar un gasto; clasificarlo exige su propia clave",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      body: { content: { "application/json": { schema: shoppingBody } } },
    },
    responses: {
      201: {
        description: "Registrado en la producción",
        content: { "application/json": { schema: shoppingSchema } },
      },
      403: { description: "Clasificar la compra exige su propia clave" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const body = c.req.valid("json")

    if (body.categoryId != null) require(c, "productions.shoppings.select_category")

    const shopping = await createShopping(actorOf(c), params.companyId, params.productionId, body)
    return c.json(serializeShopping(shopping), 201)
  },
})

export const updateShoppingRoute = defineRoute({
  access: REQUIRES("productions.shoppings.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/shoppings/{shoppingId}",
    summary: "Editar un gasto; la categoría lleva su propia clave",
    tags: ["Producciones"],
    request: {
      params: shoppingParams,
      body: { content: { "application/json": { schema: shoppingBody.partial() } } },
    },
    responses: {
      200: {
        description: "Actualizado",
        content: { "application/json": { schema: shoppingSchema } },
      },
      403: { description: "Clasificar la compra exige su propia clave" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const body = c.req.valid("json")

    if (body.categoryId !== undefined) require(c, "productions.shoppings.select_category")

    const shopping = await updateShopping(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.shoppingId,
      body,
    )
    return c.json(serializeShopping(shopping), 200)
  },
})

/**
 * El conjunto de artículos que incorporó la compra, **de una vez**.
 *
 * `PUT` y no `POST`: la spec dice «establecer ese conjunto de una vez», y eso es sustituir el
 * conjunto entero, no añadir uno más. La diferencia importa porque quitar un artículo de la lista
 * es exactamente lo que lo devuelve al inventario sin compra asignada.
 */
export const setShoppingItemsRoute = defineRoute({
  access: REQUIRES("productions.shoppings.products"),
  config: {
    method: "put",
    path: "/companies/{companyId}/productions/{productionId}/shoppings/{shoppingId}/items",
    summary: "Establecer los artículos que incorporó una compra",
    tags: ["Producciones"],
    request: {
      params: shoppingParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({ itemIds: z.array(z.string()).max(500) }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "La compra con su lista establecida",
        content: { "application/json": { schema: shoppingSchema } },
      },
      422: { description: "Algún artículo no es de esta producción" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const shopping = await setShoppingItems(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.shoppingId,
      c.req.valid("json").itemIds,
    )
    return c.json(serializeShopping(shopping), 200)
  },
})

export const deleteShoppingRoute = defineRoute({
  access: REQUIRES("productions.shoppings.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/shoppings/{shoppingId}",
    summary: "Dar de baja un gasto; sus artículos vuelven al inventario sin compra",
    tags: ["Producciones"],
    request: { params: shoppingParams },
    responses: { 204: { description: "Dado de baja" } },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteShopping(actorOf(c), params.companyId, params.productionId, params.shoppingId)
    return c.body(null, 204)
  },
})

export const attachToShoppingRoute = defineRoute({
  access: REQUIRES("productions.shoppings.edit"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/shoppings/{shoppingId}/attachments",
    summary: "Colgar una factura de un gasto",
    tags: ["Producciones"],
    request: {
      params: shoppingParams,
      body: {
        content: { "application/json": { schema: z.object({ uploadId: z.string() }) } },
      },
    },
    responses: {
      201: {
        description: "La factura colgada",
        content: { "application/json": { schema: attachmentSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const attachment = await attachToBudget(
      actorOf(c),
      params.companyId,
      params.productionId,
      { anchorId: null, shoppingId: params.shoppingId },
      c.req.valid("json").uploadId,
    )
    return c.json(serializeAttachment(attachment), 201)
  },
})

export const detachFromShoppingRoute = defineRoute({
  access: REQUIRES("productions.shoppings.edit"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/shoppings/{shoppingId}/attachments/{attachmentId}",
    summary: "Retirar una factura de un gasto",
    tags: ["Producciones"],
    request: { params: shoppingAttachmentParams },
    responses: { 204: { description: "Retirada" } },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await detachFromBudget(
      actorOf(c),
      params.companyId,
      params.productionId,
      { anchorId: null, shoppingId: params.shoppingId },
      params.attachmentId,
    )
    return c.body(null, 204)
  },
})

// ─── La lectura ──────────────────────────────────────────────────────────────

/**
 * Los parámetros de las dos colecciones, cada uno con su prefijo.
 *
 * Se derivan de las mismas declaraciones que gobiernan el análisis, así que el contrato publicado
 * no puede quedar diciendo que se filtra por un campo que el recurso ya no admite.
 */
function prefixedShape(schema: typeof anchorQuery, prefix: string): Record<string, z.ZodType> {
  return Object.fromEntries(
    Object.entries(collectionQuery(schema).shape).map(([key, value]) => [
      `${prefix}${key}`,
      value as z.ZodType,
    ]),
  )
}

const budgetQueryParams = z.object({
  ...prefixedShape(anchorQuery, "anchor_"),
  ...prefixedShape(shoppingQuery, "shopping_"),
})

/**
 * El presupuesto: lo previsto contra lo ejecutado.
 *
 * Los filtros van **con prefijo por colección** —`anchor_` y `shopping_`— porque son dos gramáticas
 * distintas sobre el mismo camino. Sin prefijo, `categoryId` filtraría las dos a la vez, que suena
 * razonable hasta que alguien filtra por método de pago y las anclas responden `400`.
 */
export const productionBudgetRoute = defineRoute({
  access: REQUIRES("productions.budgets.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/budget",
    summary: "Consultar el presupuesto de una producción, derivado en el momento",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      query: budgetQueryParams,
    },
    responses: {
      200: {
        description: "Las dos colecciones, sus totales filtrados, los generales y el desglose",
        content: { "application/json": { schema: budgetSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const budget = await readBudget(
      actorOf(c),
      params.companyId,
      params.productionId,
      queryOf(c, anchorQuery, [], "anchor_"),
      queryOf(c, shoppingQuery, [], "shopping_"),
    )
    return c.json(serializeBudget(budget), 200)
  },
})
