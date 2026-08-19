/**
 * Rutas de tarifas de envío y de seguimiento de la entrega.
 *
 * Rebanada 17. Ver `openspec/specs/shipping-rates/spec.md` y `order-fulfillment/spec.md`.
 *
 * ## Los permisos son los más cercanos, no los propios (H-96, H-97)
 *
 * El catálogo está **cerrado en las 255 claves migradas** y no trae ninguna de envíos: ni de
 * tarifas, ni de despacho. El cuadro de tarifas va con `companies.companies.view` y
 * `companies.companies.edit` —es configuración de la empresa, del mismo rango que su comisión, y
 * vive en la misma pantalla de ajustes—; el seguimiento del envío, con `warehouses.orders.view` y
 * `warehouses.orders.edit`, que es quien despacha el pedido que lo originó.
 *
 * Añadir claves propias amplía la superficie de autorización y es decisión de producto, no de
 * implementación. Queda anotado aquí, que es donde lo va a leer quien las añada.
 *
 * ## La estimación es de panel, no de tienda
 *
 * `POST …/shipping/estimate` exige sesión y empresa. La estimación que verá un comprador anónimo en
 * una tienda pública necesita resolver la tienda por su subdominio y decidir qué se le enseña sin
 * sesión, y eso es la rebanada 19. El cálculo ya está listo para las dos: `estimateShipping` recibe
 * la transacción y no la abre.
 */

import { z } from "@hono/zod-openapi"
import {
  LENGTH_UNITS,
  SHIPMENT_STATUSES,
  SHIPPING_MODES,
  toInstant,
  WEIGHT_UNITS,
} from "@tfv/contracts"
import { withRequester } from "@tfv/db"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import { estimateShipping } from "../shipping/estimate.ts"
import { getRates, updateRates } from "../shipping/rates.ts"
import {
  changeShipmentStatus,
  getShipment,
  type ShipmentRecord,
  updateShipment,
} from "../shipping/shipments.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const moneyField = z.string().regex(/^\d+(\.\d{1,2})?$/)
/** Una magnitud no negativa, con los decimales que haga falta. No es dinero. */
const magnitudeField = z.string().regex(/^\d+(\.\d+)?$/)

const thresholdSchema = z.object({
  over: z.number().int().nonnegative(),
  amount: moneyField,
})

const ratesSchema = z.object({
  currency: z.string().length(3),
  volumetricDivisor: z.number().int().positive(),
  localBase: moneyField,
  localPerKilogram: moneyField,
  nationalBase: moneyField,
  nationalPerKilogram: moneyField,
  internationalBase: moneyField,
  internationalPerKilogram: moneyField,
  distanceSurcharges: z.array(thresholdSchema),
  itemSurcharges: z.array(thresholdSchema),
  exchangeCurrency: z.string().length(3).nullable(),
  exchangeRate: z.string().nullable(),
  configured: z.boolean(),
})

const ratesInputSchema = z.object({
  currency: z.string().length(3).optional(),
  volumetricDivisor: z.number().int().positive().optional(),
  localBase: moneyField.optional(),
  localPerKilogram: moneyField.optional(),
  nationalBase: moneyField.optional(),
  nationalPerKilogram: moneyField.optional(),
  internationalBase: moneyField.optional(),
  internationalPerKilogram: moneyField.optional(),
  distanceSurcharges: z.array(thresholdSchema).optional(),
  itemSurcharges: z.array(thresholdSchema).optional(),
  exchangeCurrency: z.string().length(3).nullable().optional(),
  exchangeRate: magnitudeField.nullable().optional(),
})

const itemSchema = z.object({
  id: z.string(),
  quantity: z.number().int().positive(),
  length: magnitudeField.optional(),
  width: magnitudeField.optional(),
  height: magnitudeField.optional(),
  lengthUnit: z.enum(LENGTH_UNITS),
  weight: magnitudeField.optional(),
  weightUnit: z.enum(WEIGHT_UNITS),
})

const surchargeSchema = z.object({
  kind: z.enum(["distance", "item_count"]),
  threshold: z.number().int(),
  amount: z.string(),
})

const quoteSchema = z.object({
  version: z.literal(1),
  mode: z.enum(SHIPPING_MODES),
  realWeightKg: z.string(),
  volumetricWeightKg: z.string(),
  billableWeightKg: z.string(),
  itemCount: z.number().int(),
  distanceKm: z.number().optional(),
  base: z.string(),
  variable: z.string(),
  surcharges: z.array(surchargeSchema),
  surchargeTotal: z.string(),
  currency: z.string(),
  total: z.string(),
  sourceCurrency: z.string().optional(),
  sourceTotal: z.string().optional(),
  exchangeRate: z.string().optional(),
  requiresDeliveryAddress: z.boolean(),
})

const shipmentSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  orderReference: z.string(),
  mode: z.string(),
  cost: z.string(),
  status: z.enum(SHIPMENT_STATUSES),
  carrier: z.string(),
  trackingNumber: z.string().nullable(),
  estimatedDeliveryAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Lo que se puede hacer desde donde está: la pantalla ofrece esto y nada más. */
  allowedTransitions: z.array(z.enum(SHIPMENT_STATUSES)),
})

const companyParams = z.object({ companyId: z.string() })
const shipmentParams = z.object({ companyId: z.string(), shipmentId: z.string() })

// ─── Utilidades ──────────────────────────────────────────────────────────────

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

/**
 * Copia las listas antes de responder.
 *
 * El dominio las declara `readonly` —nadie de dentro las muta— y el contrato de salida las espera
 * mutables. Copiarlas aquí es más barato que aflojar el tipo del dominio para acomodar al
 * serializador.
 */
function serializeRates(row: Awaited<ReturnType<typeof getRates>>) {
  return {
    ...row,
    distanceSurcharges: [...row.distanceSurcharges],
    itemSurcharges: [...row.itemSurcharges],
  }
}

function serializeQuote(quote: Awaited<ReturnType<typeof estimateShipping>>) {
  return { ...quote, surcharges: [...quote.surcharges] }
}

function serializeShipment(row: ShipmentRecord) {
  return {
    ...row,
    estimatedDeliveryAt: row.estimatedDeliveryAt ? toInstant(row.estimatedDeliveryAt) : null,
    deliveredAt: row.deliveredAt ? toInstant(row.deliveredAt) : null,
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  }
}

// ─── Cuadro de tarifas ───────────────────────────────────────────────────────

export const getShippingRatesRoute = defineRoute({
  access: REQUIRES("companies.companies.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/shipping/rates",
    summary: "Ver el cuadro de tarifas de envío de una empresa",
    tags: ["Envíos"],
    request: { params: companyParams },
    responses: {
      200: {
        description:
          "El cuadro. Con `configured` en falso cuando la empresa hereda el de la plataforma",
        content: { "application/json": { schema: ratesSchema } },
      },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    return c.json(serializeRates(await getRates(actorOf(c), companyId)), 200)
  },
})

export const updateShippingRatesRoute = defineRoute({
  access: REQUIRES("companies.companies.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/shipping/rates",
    summary: "Cambiar el cuadro de tarifas de envío",
    description:
      "Surte efecto en el cálculo siguiente, sin desplegar código. Crea el cuadro propio de la " +
      "empresa la primera vez que se guarda.",
    tags: ["Envíos"],
    request: {
      params: companyParams,
      body: { content: { "application/json": { schema: ratesInputSchema } }, required: true },
    },
    responses: {
      200: {
        description: "El cuadro guardado",
        content: { "application/json": { schema: ratesSchema } },
      },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    return c.json(
      serializeRates(await updateRates(actorOf(c), companyId, c.req.valid("json"))),
      200,
    )
  },
})

// ─── Estimación ──────────────────────────────────────────────────────────────

export const estimateShippingRoute = defineRoute({
  access: REQUIRES("companies.companies.view"),
  config: {
    method: "post",
    path: "/companies/{companyId}/shipping/estimate",
    summary: "Calcular el costo de un envío",
    description:
      "El mismo cálculo con el que se cobra. La interfaz lo consulta en lugar de repetirlo: dos " +
      "implementaciones acabarían enseñando una cifra distinta de la que se carga.",
    tags: ["Envíos"],
    request: {
      params: companyParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              mode: z.enum(SHIPPING_MODES),
              items: z.array(itemSchema),
              toAddressId: z.string().optional(),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "El desglose completo del cálculo",
        content: { "application/json": { schema: quoteSchema } },
      },
      422: { description: "Un artículo no declara su peso o alguna de sus dimensiones" },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    const body = c.req.valid("json")

    const quote = await withRequester(actorOf(c), (tx) =>
      estimateShipping(tx, {
        companyId,
        mode: body.mode,
        items: body.items,
        ...(body.toAddressId === undefined ? {} : { toAddressId: body.toAddressId }),
      }),
    )

    return c.json(serializeQuote(quote), 200)
  },
})

// ─── Seguimiento de la entrega ───────────────────────────────────────────────

export const getShipmentRoute = defineRoute({
  access: REQUIRES("warehouses.orders.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/shipments/{shipmentId}",
    summary: "Ver un envío y su seguimiento",
    tags: ["Envíos"],
    request: { params: shipmentParams },
    responses: {
      200: {
        description: "El envío, con las transiciones que admite desde donde está",
        content: { "application/json": { schema: shipmentSchema } },
      },
      404: { description: "No existe, o es de otra empresa" },
    },
  },
  handler: async (c) => {
    const { companyId, shipmentId } = c.req.valid("param")
    const shipment = await getShipment(actorOf(c), companyId, shipmentId)
    return c.json(serializeShipment(shipment), 200)
  },
})

export const updateShipmentRoute = defineRoute({
  access: REQUIRES("warehouses.orders.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/shipments/{shipmentId}",
    summary: "Registrar paquetería, guía y fecha estimada",
    tags: ["Envíos"],
    request: {
      params: shipmentParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              carrier: z.string().min(1).max(60).optional(),
              trackingNumber: z.string().max(120).nullable().optional(),
              estimatedDeliveryAt: z.iso.datetime().nullable().optional(),
              notes: z.string().nullable().optional(),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "El envío actualizado",
        content: { "application/json": { schema: shipmentSchema } },
      },
      404: { description: "No existe, o es de otra empresa" },
    },
  },
  handler: async (c) => {
    const { companyId, shipmentId } = c.req.valid("param")
    const body = c.req.valid("json")

    const shipment = await updateShipment(actorOf(c), companyId, shipmentId, {
      ...(body.carrier === undefined ? {} : { carrier: body.carrier }),
      ...(body.trackingNumber === undefined ? {} : { trackingNumber: body.trackingNumber }),
      ...(body.estimatedDeliveryAt === undefined
        ? {}
        : {
            estimatedDeliveryAt:
              body.estimatedDeliveryAt === null ? null : new Date(body.estimatedDeliveryAt),
          }),
      ...(body.notes === undefined ? {} : { notes: body.notes }),
    })

    return c.json(serializeShipment(shipment), 200)
  },
})

export const changeShipmentStatusRoute = defineRoute({
  access: REQUIRES("warehouses.orders.edit"),
  config: {
    method: "post",
    path: "/companies/{companyId}/shipments/{shipmentId}/status",
    summary: "Mover el envío por su ciclo de vida",
    description:
      "Rechaza con 409 lo que la máquina de estados no prevé. Entregar fecha la entrega; no se " +
      "acepta la fecha del cuerpo, que es el registro de cuándo ocurrió.",
    tags: ["Envíos"],
    request: {
      params: shipmentParams,
      body: {
        content: {
          "application/json": { schema: z.object({ status: z.enum(SHIPMENT_STATUSES) }) },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "El envío en su estado nuevo",
        content: { "application/json": { schema: shipmentSchema } },
      },
      404: { description: "No existe, o es de otra empresa" },
      409: { description: "La transición no está prevista desde el estado actual" },
    },
  },
  handler: async (c) => {
    const { companyId, shipmentId } = c.req.valid("param")
    const { status } = c.req.valid("json")

    const shipment = await changeShipmentStatus(actorOf(c), companyId, shipmentId, status)
    return c.json(serializeShipment(shipment), 200)
  },
})
