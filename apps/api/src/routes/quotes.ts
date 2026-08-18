/**
 * Rutas de cotizaciones.
 *
 * Rebanadas 13 y 14.
 *
 * ## Un permiso por bloque, no uno por cotización
 *
 * Los cuatro bloques del documento —identidad, contactos, condiciones de pago e impuestos— tienen
 * cada uno su clave, y el cambio de estado tres: la general, la de sacar el equipo y la de darlo
 * por terminado. No es una partición arbitraria: quien atiende al cliente no negocia el descuento,
 * y quien lleva la administración no decide qué día sale el equipo.
 */

import { z } from "@hono/zod-openapi"
import { missingPermission, type PermissionKey, toInstant } from "@tfv/contracts"
import { allows } from "../auth/authorization.ts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import { listRates, rateQuery } from "../warehouses/quote-rates.ts"
import {
  changeQuoteStatus,
  createQuote,
  deleteQuote,
  getQuote,
  listLines,
  listQuotes,
  QUOTE_STATUSES,
  quoteBreakdown,
  quoteQuery,
  RENT_FREQUENCIES,
  ROUND_DIRECTIONS,
  reservationCoherence,
  returnUnits,
  setContacts,
  setLines,
  setPaymentTerms,
  setResponsible,
  setTaxes,
  TRADE_TYPES,
  updateQuote,
} from "../warehouses/quotes.ts"
import { STOCK_STATUSES } from "../warehouses/stock.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const moneyField = z.string().regex(/^-?\d+(\.\d{1,2})?$/)
const rateField = z.string().regex(/^-?\d+(\.\d{1,4})?$/)

const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).optional(),
  position: z.string().trim().max(120).optional(),
})

const additionalSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  amount: moneyField,
})

const discountSchema = z.object({
  type: z.enum(["percent", "amount"]),
  value: rateField,
  perProduct: z.boolean().optional(),
})

const payerSchema = z.object({
  amount: moneyField,
  method: z.enum(["card", "cash", "transfer"]).optional(),
  date: z.string().optional(),
})

const paymentTermsSchema = z.object({
  version: z.literal(1),
  additionals: z.array(additionalSchema).max(50).readonly().optional(),
  transferFeeRate: rateField.optional(),
  additionalFeeRate: rateField.optional(),
  spreadFeesAcrossLines: z.boolean().optional(),
  advance: payerSchema.optional(),
  deposit: payerSchema.optional(),
  fixedPrice: moneyField.optional(),
  penalty: z
    .object({ fixed: moneyField.optional(), concept: z.string().max(200).optional() })
    .optional(),
  discount: discountSchema.optional(),
})

const taxEntrySchema = z.object({
  enabled: z.boolean(),
  rate: rateField,
  concept: z.string().max(200).optional(),
})

const taxesSchema = z.object({
  version: z.literal(1),
  iva: taxEntrySchema.extend({ type: z.enum(["trasladado", "acreditable", "exento"]) }).optional(),
  isr: taxEntrySchema.extend({ type: z.enum(["retenido", "directo"]) }).optional(),
  ivaRetention: taxEntrySchema.optional(),
  isrRetention: taxEntrySchema.optional(),
  ieps: taxEntrySchema.optional(),
  isn: taxEntrySchema.optional(),
  hospitality: taxEntrySchema.optional(),
  frontier: taxEntrySchema.optional(),
  additional: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        enabled: z.boolean(),
        type: z.enum(["percent", "amount"]),
        value: rateField,
        effect: z.enum(["increase", "decrease"]),
      }),
    )
    .max(20)
    .readonly()
    .optional(),
})

const quoteSchema = z.object({
  id: z.string(),
  warehouseId: z.string(),
  orderId: z.string().nullable(),
  clientId: z.string().nullable(),
  responsibleId: z.string().nullable(),
  code: z.string(),
  folio: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(TRADE_TYPES),
  status: z.enum(QUOTE_STATUSES),
  priority: z.string(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  roundDays: z.boolean(),
  roundDirection: z.enum(ROUND_DIRECTIONS),
  clientContacts: z.array(contactSchema).readonly(),
  sellerContacts: z.array(contactSchema).readonly(),
  paymentTerms: paymentTermsSchema.nullable(),
  taxes: taxesSchema.nullable(),
  alert: z.string().nullable(),
  message: z.string().nullable(),
  terms: z.string().nullable(),
  observations: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const lineSchema = z.object({
  id: z.string(),
  quoteId: z.string(),
  measurementId: z.string(),
  measurementName: z.string(),
  productId: z.string(),
  productName: z.string(),
  productCode: z.string(),
  productPriceId: z.string().nullable(),
  frequency: z.enum(RENT_FREQUENCIES),
  quantity: z.number().int(),
  unitIds: z.array(z.string()).readonly(),
  position: z.number().int(),
  positionProduct: z.number().int(),
})

const lineInput = z.object({
  id: z.string().optional(),
  measurementId: z.string(),
  quantity: z.number().int().min(0).max(9999),
  frequency: z.enum(RENT_FREQUENCIES).optional(),
  productPriceId: z.string().nullable().optional(),
  position: z.number().int().min(0).optional(),
  positionProduct: z.number().int().min(0).optional(),
})

const lineBreakdownSchema = z.object({
  lineId: z.string(),
  productId: z.string(),
  measurementId: z.string(),
  quantity: z.number().int(),
  frequency: z.enum(RENT_FREQUENCIES),
  appliedDays: z.string(),
  unitCost: z.string(),
  unitDiscount: z.string(),
  unitTotal: z.string(),
  cost: z.string(),
  discount: z.string(),
  total: z.string(),
  penalty: z.string(),
  fee: z.string(),
  unitFee: z.string(),
  totalWithFee: z.string(),
})

/** Todos los importes son cadenas decimales: `1234.56` no sobrevive a un viaje como número JSON. */
const breakdownSchema = z.object({
  version: z.literal(1),
  days: z.number().int(),
  lines: z.array(lineBreakdownSchema).readonly(),
  groups: z
    .array(
      z.object({
        productId: z.string(),
        lineIds: z.array(z.string()).readonly(),
        subtotal: z.string(),
      }),
    )
    .readonly(),
  linesTotal: z.string(),
  additionals: z.string(),
  subtotal: z.string(),
  discount: z.string(),
  base: z.string(),
  taxes: z
    .array(
      z.object({
        key: z.string(),
        concept: z.string().optional(),
        effect: z.enum(["increase", "decrease"]),
        rate: z.string().optional(),
        amount: z.string(),
      }),
    )
    .readonly(),
  taxTotal: z.string(),
  net: z.string(),
  fees: z.string(),
  feesSpread: z.boolean(),
  gross: z.string(),
  advance: z.string(),
  total: z.string(),
  penalty: z.string(),
})

const companyParams = z.object({ companyId: z.string() })
const warehouseParams = companyParams.extend({ warehouseId: z.string() })
const quoteParams = warehouseParams.extend({ quoteId: z.string() })

const instant = z.string().datetime()

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

function serializeQuote(row: Awaited<ReturnType<typeof createQuote>>) {
  return {
    ...row,
    startsOn: row.startsOn ? toInstant(row.startsOn) : null,
    endsOn: row.endsOn ? toInstant(row.endsOn) : null,
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  }
}

// ─── Documento ───────────────────────────────────────────────────────────────

export const listQuotesRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes",
    summary: "Listar las cotizaciones de un almacén",
    tags: ["Cotizaciones"],
    request: { params: warehouseParams, query: collectionQuery(quoteQuery) },
    responses: {
      200: {
        description: "Cotizaciones, lo más urgente primero",
        content: { "application/json": { schema: pageSchema(quoteSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listQuotes(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      queryOf(c, quoteQuery),
    )
    return c.json(serializePage(page, serializeQuote), 200)
  },
})

export const getQuoteRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}",
    summary: "Consultar una cotización",
    tags: ["Cotizaciones"],
    request: { params: quoteParams },
    responses: {
      200: {
        description: "La cotización",
        content: { "application/json": { schema: quoteSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const quote = await getQuote(actorOf(c), params.companyId, params.warehouseId, params.quoteId)
    return c.json(serializeQuote(quote), 200)
  },
})

export const createQuoteRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes",
    summary: "Crear una cotización",
    tags: ["Cotizaciones"],
    request: {
      params: warehouseParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              type: z.enum(TRADE_TYPES),
              clientId: z.string().optional(),
              responsibleId: z.string().optional(),
              name: z.string().trim().max(250).optional(),
              description: z.string().max(4000).optional(),
              startsOn: instant.optional(),
              endsOn: instant.optional(),
              roundDays: z.boolean().optional(),
              roundDirection: z.enum(ROUND_DIRECTIONS).optional(),
              lines: z.array(lineInput).max(500).readonly().optional(),
              allowMinting: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Creada, con su folio. Con líneas nace en progreso; sin ellas, pendiente",
        content: { "application/json": { schema: quoteSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const { startsOn, endsOn, ...rest } = c.req.valid("json")
    const quote = await createQuote(actorOf(c), params.companyId, params.warehouseId, {
      ...rest,
      ...(startsOn === undefined ? {} : { startsOn: new Date(startsOn) }),
      ...(endsOn === undefined ? {} : { endsOn: new Date(endsOn) }),
    })
    return c.json(serializeQuote(quote), 201)
  },
})

export const updateQuoteRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.edit_info"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}",
    summary: "Editar la identidad de una cotización",
    tags: ["Cotizaciones"],
    request: {
      params: quoteParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              clientId: z.string().nullable().optional(),
              name: z.string().trim().max(250).optional(),
              description: z.string().max(4000).optional(),
              startsOn: instant.nullable().optional(),
              endsOn: instant.nullable().optional(),
              roundDays: z.boolean().optional(),
              roundDirection: z.enum(ROUND_DIRECTIONS).optional(),
              alert: z.string().max(2000).nullable().optional(),
              message: z.string().max(4000).nullable().optional(),
              terms: z.string().max(8000).nullable().optional(),
              observations: z.string().max(8000).nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Actualizada", content: { "application/json": { schema: quoteSchema } } },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const { startsOn, endsOn, ...rest } = c.req.valid("json")
    const quote = await updateQuote(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.quoteId,
      {
        ...rest,
        ...(startsOn === undefined
          ? {}
          : { startsOn: startsOn === null ? null : new Date(startsOn) }),
        ...(endsOn === undefined ? {} : { endsOn: endsOn === null ? null : new Date(endsOn) }),
      },
    )
    return c.json(serializeQuote(quote), 200)
  },
})

export const setQuoteContactsRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.edit_contacts"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/contacts",
    summary: "Establecer los contactos de las dos partes",
    tags: ["Cotizaciones"],
    request: {
      params: quoteParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              clientContacts: z.array(contactSchema).max(20).optional(),
              sellerContacts: z.array(contactSchema).max(20).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Actualizada", content: { "application/json": { schema: quoteSchema } } },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const quote = await setContacts(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.quoteId,
      c.req.valid("json"),
    )
    return c.json(serializeQuote(quote), 200)
  },
})

export const setQuotePaymentRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.edit_payment"),
  config: {
    method: "put",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/payment-terms",
    summary: "Establecer las condiciones de pago",
    tags: ["Cotizaciones"],
    request: {
      params: quoteParams,
      body: { content: { "application/json": { schema: paymentTermsSchema.nullable() } } },
    },
    responses: {
      200: { description: "Actualizada", content: { "application/json": { schema: quoteSchema } } },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const quote = await setPaymentTerms(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.quoteId,
      c.req.valid("json"),
    )
    return c.json(serializeQuote(quote), 200)
  },
})

export const setQuoteTaxesRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.edit_tax"),
  config: {
    method: "put",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/taxes",
    summary: "Establecer el bloque de impuestos",
    tags: ["Cotizaciones"],
    request: {
      params: quoteParams,
      body: { content: { "application/json": { schema: taxesSchema.nullable() } } },
    },
    responses: {
      200: { description: "Actualizada", content: { "application/json": { schema: quoteSchema } } },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const quote = await setTaxes(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.quoteId,
      c.req.valid("json"),
    )
    return c.json(serializeQuote(quote), 200)
  },
})

export const setQuoteResponsibleRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.responsible"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/responsible",
    summary: "Cambiar el responsable de una cotización",
    tags: ["Cotizaciones"],
    request: {
      params: quoteParams,
      body: {
        content: { "application/json": { schema: z.object({ responsibleId: z.string() }) } },
      },
    },
    responses: {
      200: { description: "Actualizada", content: { "application/json": { schema: quoteSchema } } },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const quote = await setResponsible(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.quoteId,
      c.req.valid("json").responsibleId,
    )
    return c.json(serializeQuote(quote), 200)
  },
})

export const deleteQuoteRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}",
    summary: "Dar de baja una cotización",
    tags: ["Cotizaciones"],
    request: { params: quoteParams },
    responses: { 204: { description: "Dada de baja" } },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteQuote(actorOf(c), params.companyId, params.warehouseId, params.quoteId)
    return c.body(null, 204)
  },
})

// ─── Estado ──────────────────────────────────────────────────────────────────

/**
 * Qué clave **adicional** exige cada destino.
 *
 * Sacar el equipo y dar el servicio por terminado son decisiones distintas de mover la cotización
 * por la bandeja, y la matriz de permisos anterior ya las separaba. Colapsarlas en `edit_status`
 * ampliaría en silencio la autoridad de quien sólo tenía ésa, y dejaría además una clave del
 * catálogo que nadie puede ejercer.
 */
const STATUS_PERMISSION: Partial<Record<(typeof QUOTE_STATUSES)[number], PermissionKey>> = {
  in_rent: "warehouses.quotes.rented",
  completed: "warehouses.quotes.finished",
  sold: "warehouses.quotes.finished",
}

/**
 * El cambio de estado tiene **tres** claves, no una.
 *
 * La declarada es la general; la del destino se comprueba en el manejador, contra la autorización
 * que el guardián ya resolvió. Declarar la general en la ruta es lo que mantiene cierto que ninguna
 * escritura llega sin permiso: la del destino sólo puede estrechar, nunca abrir.
 */
export const changeQuoteStatusRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.edit_status"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/status",
    summary: "Cambiar el estado de una cotización",
    tags: ["Cotizaciones"],
    request: {
      params: quoteParams,
      body: {
        content: {
          "application/json": { schema: z.object({ status: z.enum(QUOTE_STATUSES) }) },
        },
      },
    },
    responses: {
      200: {
        description: "Cambiada, con su inventario proyectado",
        content: { "application/json": { schema: quoteSchema } },
      },
      403: { description: "Falta la clave que exige ese destino" },
      409: { description: "La transición no está prevista, o la cotización está cerrada" },
      422: { description: "Falta un dato del documento para avanzar" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const required = STATUS_PERMISSION[c.req.valid("json").status]
    if (required && !allows(c.get("authorization"), required)) throw missingPermission(required)

    const quote = await changeQuoteStatus(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.quoteId,
      c.req.valid("json").status,
    )
    return c.json(serializeQuote(quote), 200)
  },
})

// ─── Líneas ──────────────────────────────────────────────────────────────────

export const listQuoteLinesRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/lines",
    summary: "Listar las líneas de una cotización",
    tags: ["Cotizaciones"],
    request: { params: quoteParams },
    responses: {
      200: {
        description: "Las líneas, con las unidades que tiene apartadas cada una",
        content: { "application/json": { schema: z.object({ items: z.array(lineSchema) }) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const items = await listLines(actorOf(c), params.companyId, params.warehouseId, params.quoteId)
    return c.json({ items }, 200)
  },
})

/**
 * El conjunto entero, no una línea suelta.
 *
 * Es `PUT` porque sustituye: lo que no venga se elimina y libera su equipo. Enviar el conjunto
 * completo es lo que permite que la reconciliación sea atómica —crear, actualizar, eliminar y
 * reservar en una transacción—, y lo que hace que el resultado no dependa del orden en que la
 * interfaz mande sus cambios.
 */
export const setQuoteLinesRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.edit_products"),
  config: {
    method: "put",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/lines",
    summary: "Establecer el conjunto de líneas de una cotización",
    tags: ["Cotizaciones"],
    request: {
      params: quoteParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              lines: z.array(lineInput).max(500).readonly(),
              /** `DEFECTS.md` M-04: acuñar inventario inexistente se autoriza aquí, o no ocurre. */
              allowMinting: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "El conjunto resultante, con su equipo apartado",
        content: { "application/json": { schema: z.object({ items: z.array(lineSchema) }) } },
      },
      422: { description: "No hay existencia suficiente. No se reservó nada" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const body = c.req.valid("json")
    const items = await setLines(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.quoteId,
      body.lines,
      body.allowMinting ?? false,
    )
    return c.json({ items }, 200)
  },
})

// ─── Retorno y coherencia ────────────────────────────────────────────────────

/**
 * Devolver el equipo es el acto que cierra una renta, así que va bajo la misma clave que darla por
 * terminada. No se inventa una clave nueva: el catálogo de 255 es un contrato con la matriz de
 * permisos que ya existe, y añadirle una entrada obliga a revisarla entera.
 */
export const returnQuoteUnitsRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.finished"),
  config: {
    method: "post",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/returns",
    summary: "Registrar el retorno del equipo rentado",
    tags: ["Cotizaciones"],
    request: {
      params: quoteParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              units: z
                .array(
                  z.object({
                    unitId: z.string(),
                    status: z.enum(STOCK_STATUSES),
                    note: z.string().max(2000).optional(),
                  }),
                )
                .min(1)
                .max(500)
                .readonly(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Registrado. Lo que volvió en condiciones queda disponible",
        content: { "application/json": { schema: quoteSchema } },
      },
      422: { description: "Alguna unidad no salió con esta cotización" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const quote = await returnUnits(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.quoteId,
      c.req.valid("json").units,
    )
    return c.json(serializeQuote(quote), 200)
  },
})

export const reservationCoherenceRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/reservation-coherence",
    summary: "Verificar que las reservas y el inventario dicen lo mismo",
    tags: ["Cotizaciones"],
    request: { params: warehouseParams },
    responses: {
      200: {
        description: "Las discrepancias encontradas, vacío si todo cuadra",
        content: {
          "application/json": {
            schema: z.object({
              items: z.array(
                z.object({
                  unitId: z.string(),
                  code: z.string(),
                  status: z.enum(STOCK_STATUSES),
                  reason: z.enum(["committed_without_link", "link_without_projection"]),
                  quoteId: z.string().nullable(),
                }),
              ),
            }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const items = await reservationCoherence(actorOf(c), params.companyId, params.warehouseId)
    return c.json({ items }, 200)
  },
})

// ─── Importes ────────────────────────────────────────────────────────────────

/**
 * El desglose, con cada paso intermedio.
 *
 * Sale aparte de la cotización y no dentro porque su coste no es el mismo: leer el documento es una
 * fila, y calcular sus importes resuelve las tarifas de todas sus líneas. La bandeja de trabajo
 * lista cotizaciones sin pagar eso.
 */
export const quoteBreakdownRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/breakdown",
    summary: "Consultar los importes de una cotización",
    tags: ["Cotizaciones"],
    request: { params: quoteParams },
    responses: {
      200: {
        description:
          "El desglose. Congelado si la cotización está cerrada, al vuelo si está abierta",
        content: { "application/json": { schema: breakdownSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const breakdown = await quoteBreakdown(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      params.quoteId,
    )
    return c.json(breakdown, 200)
  },
})

// ─── Tarifas y existencia ────────────────────────────────────────────────────

const rateScheduleSchema = z.object({
  isFixed: z.boolean(),
  fixed: z.string().optional(),
  daily: z.string().optional(),
  weekly: z.string().optional(),
  monthly: z.string().optional(),
})

const candidateSchema = z.object({
  measurementId: z.string(),
  measurementName: z.string(),
  productId: z.string(),
  productName: z.string(),
  productCode: z.string(),
  productPriceId: z.string().nullable(),
  basePrice: z.string(),
  rent: rateScheduleSchema.optional(),
  penalty: rateScheduleSchema.optional(),
  available: z.number().int(),
})

/**
 * Lo que el constructor de cotizaciones pone delante de quien edita.
 *
 * Exige **la clave de editar las líneas**, no la de mirar la cotización. No es celo: la respuesta
 * publica las tarifas negociadas del almacén junto a su existencia, y quien puede leer una
 * cotización concreta no tiene por qué ver la lista de precios entera.
 *
 * `priceListId` no es un filtro —no reduce el conjunto, elige contra qué lista se resuelve la
 * tarifa—, así que se lee aparte del lenguaje de colección.
 */
export const listRatesRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.edit_products"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/rates",
    summary: "Las medidas del almacén con su tarifa resuelta y su existencia libre",
    tags: ["Cotizaciones"],
    request: {
      params: warehouseParams,
      query: collectionQuery(rateQuery).extend({
        priceListId: z
          .string()
          .optional()
          .openapi({ description: "Lista de precios contra la que resolver la tarifa" }),
      }),
    },
    responses: {
      200: {
        description: "Medidas con su tarifa y sus unidades disponibles",
        content: { "application/json": { schema: pageSchema(candidateSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const priceListId = c.req.query("priceListId")

    const page = await listRates(
      actorOf(c),
      params.companyId,
      params.warehouseId,
      queryOf(c, rateQuery, ["priceListId"]),
      priceListId,
    )
    return c.json(
      serializePage(page, (item) => item),
      200,
    )
  },
})
