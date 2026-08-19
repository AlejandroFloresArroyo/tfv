/**
 * Las rutas de la compra en tienda pública.
 *
 * Ver `openspec/specs/storefront-checkout/spec.md` y `order-fulfillment/spec.md`. Rebanada 18.
 *
 * ## Dos regímenes, y ninguno es de permiso
 *
 * | Superficie | Régimen | Motivo |
 * |---|---|---|
 * | Valorar el carrito | público | Es el escaparate con precios: quien mira todavía no tiene cuenta |
 * | Pagar, cancelar, mis compras, mis pedidos | autenticado | Son **de la persona**, no de una empresa |
 *
 * **Ninguna exige permiso, y es correcto.** Un permiso sólo significa algo dentro de una empresa —el
 * guardián lo resuelve contra una membresía—, y quien compra en una tienda pública no es miembro de
 * nada: es el otro lado del mostrador. Es la misma decisión que toman la bandeja y las preferencias,
 * que también son de la persona.
 *
 * Por eso tampoco hace falta ninguna clave nueva del catálogo cerrado: lo que el comercio ve de
 * estas compras —su libro de ingresos y el pedido de trabajo en la nave— llega por rutas que ya
 * existen y ya declaran la suya.
 *
 * ## Por qué crear la sesión devuelve la compra entera
 *
 * Porque el desglose que el comprador tiene que ver antes de irse al procesador **es** el que se le
 * va a cobrar: sale de la instantánea que se acaba de escribir. Una ruta de previsualización aparte
 * habría sido un segundo cálculo del mismo importe, y dos cálculos del mismo importe divergen — que
 * es el defecto M-11 en los envíos y el M-06 en las cotizaciones.
 */

import { z } from "@hono/zod-openapi"
import {
  CART_ITEM_KINDS,
  CHECKOUT_STATUSES,
  CHECKOUT_TRADE_TYPES,
  formatMoney,
  money,
  SHIPPING_MODES,
  sum,
} from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import { priceCart } from "../checkout/cart.ts"
import {
  type CheckoutRecord,
  cancelCheckout,
  createCheckout,
  listMyCheckouts,
  readCheckout,
} from "../checkout/checkout.ts"
import { type BuyerOrderRecord, listMyOrders, readMyOrder } from "../checkout/orders.ts"
import type { Actor } from "../companies/companies.ts"
import { AUTHENTICATED, defineRoute, PUBLIC } from "../runtime/route.ts"

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

// ─── Esquemas ────────────────────────────────────────────────────────────────

const moneyField = z.string().regex(/^-?\d+(\.\d{1,2})?$/)

/**
 * Lo que el navegador manda de cada artículo: qué y cuánto. **Nunca el precio.**
 *
 * «No SHALL aceptar precios enviados por el navegador»: aquí eso no es una comprobación, es que el
 * campo no existe. Un cuerpo que traiga precio lo pierde en la validación sin decir nada, que es
 * exactamente lo que debe pasarle.
 */
const itemSchema = z.object({
  kind: z.enum(CART_ITEM_KINDS),
  refId: z.string(),
  quantity: z.number().int().positive(),
})

const cartLineSchema = z.object({
  kind: z.literal("warehouse_measurement"),
  refId: z.string(),
  productId: z.string(),
  productName: z.string(),
  measurementName: z.string(),
  name: z.string(),
  unitPrice: moneyField,
  quantity: z.number().int(),
  total: moneyField,
  available: z.number().int(),
  coverUrl: z.string().nullable(),
})

const cartSchema = z.object({
  storeSlug: z.string(),
  storeName: z.string(),
  lines: z.array(cartLineSchema),
  subtotal: moneyField,
})

const snapshotLineSchema = z.object({
  kind: z.string(),
  refId: z.string(),
  name: z.string(),
  unitPrice: moneyField,
  quantity: z.number().int(),
  total: moneyField,
})

const checkoutSchema = z.object({
  id: z.string(),
  status: z.enum(CHECKOUT_STATUSES),
  type: z.string(),
  storeSlug: z.string(),
  storeName: z.string(),
  lines: z.array(snapshotLineSchema),
  subtotal: moneyField,
  shippingCost: moneyField,
  total: moneyField,
  currency: z.string(),
  shippingMode: z.string(),
  checkoutUrl: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
})

const orderSchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: z.string(),
  type: z.string(),
  storeSlug: z.string(),
  storeName: z.string(),
  subtotal: moneyField,
  shippingCost: moneyField,
  total: moneyField,
  currency: z.string(),
  createdAt: z.string(),
  lines: z.array(snapshotLineSchema),
  payment: z
    .object({
      status: z.string(),
      method: z.string().nullable(),
      grossAmount: moneyField,
      receiptUrl: z.string().nullable(),
      refundedAmount: moneyField,
    })
    .nullable(),
  shipment: z
    .object({
      id: z.string(),
      mode: z.string(),
      status: z.string(),
      cost: moneyField,
      carrier: z.string(),
      trackingNumber: z.string().nullable(),
      estimatedDeliveryAt: z.string().nullable(),
      deliveredAt: z.string().nullable(),
    })
    .nullable(),
})

/**
 * Las líneas, campo a campo.
 *
 * La instantánea guarda además el mosaico configurado cuando lo hay, y eso es de la otra vertical:
 * copiar el registro entero publicaría su estructura interna el día que exista. Es la misma decisión
 * que toma la ficha pública al no reutilizar el registro del catálogo.
 */
function lineOf(line: {
  kind: string
  refId: string
  name: string
  unitPrice: string
  quantity: number
  total: string
}) {
  return {
    kind: line.kind,
    refId: line.refId,
    name: line.name,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    total: line.total,
  }
}

function checkoutOf(record: CheckoutRecord) {
  return { ...record, lines: record.lines.map(lineOf) }
}

function orderOf(record: BuyerOrderRecord) {
  return {
    ...record,
    lines: record.lines.map(lineOf),
    payment: record.payment ? { ...record.payment } : null,
    shipment: record.shipment ? { ...record.shipment } : null,
  }
}

// ─── Carrito ─────────────────────────────────────────────────────────────────

export const priceCartRoute = defineRoute({
  access: PUBLIC(
    "El carrito de una tienda pública lo llena quien todavía no tiene cuenta. Devuelve precios " +
      "del catálogo publicado y disponibilidad, que es lo mismo que ya enseña la ficha, y no " +
      "aparta nada ni escribe nada.",
  ),
  config: {
    method: "post",
    path: "/public/sites/{slug}/cart",
    summary: "Valorar un carrito contra el catálogo publicado",
    tags: ["Tiendas públicas"],
    request: {
      params: z.object({ slug: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              type: z.enum(CHECKOUT_TRADE_TYPES).default("sale"),
              items: z.array(itemSchema).min(1),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "El carrito con sus precios y su disponibilidad",
        content: { "application/json": { schema: cartSchema } },
      },
      404: { description: "La tienda no existe, o alguno de los artículos ya no se vende" },
      422: { description: "La tienda no vende en línea, o el artículo no admite la modalidad" },
    },
  },
  handler: async (c) => {
    const body = c.req.valid("json")
    const cart = await priceCart(c.req.valid("param").slug, body.type, body.items)

    return c.json(
      {
        storeSlug: cart.store.slug,
        storeName: cart.store.name,
        lines: cart.lines.map((line) => ({ ...line })),
        subtotal: formatMoney(sum(cart.lines.map((line) => money(line.total)))),
      },
      200,
    )
  },
})

// ─── Compra ──────────────────────────────────────────────────────────────────

export const createCheckoutRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/public/sites/{slug}/checkout",
    summary: "Apartar el inventario y abrir la sesión de pago",
    tags: ["Tiendas públicas"],
    request: {
      params: z.object({ slug: z.string() }),
      headers: z.object({
        /** Ver `api-conventions`: toda mutación de dinero admite una. */
        "idempotency-key": z.string().min(8).max(120).optional(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              type: z.enum(CHECKOUT_TRADE_TYPES).default("sale"),
              mode: z.enum(SHIPPING_MODES),
              items: z.array(itemSchema).min(1),
              /** Obligatorio salvo en recolección en tienda. */
              toAddressId: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "La compra, con su desglose y la dirección a la que ir a pagar",
        content: { "application/json": { schema: checkoutSchema } },
      },
      404: { description: "La tienda, el artículo o el domicilio no existen" },
      409: { description: "Esa clave de idempotencia ya se usó para otra compra" },
      422: { description: "No hay existencia suficiente, o la tienda no puede cobrar" },
    },
  },
  handler: async (c) => {
    const body = c.req.valid("json")
    const key = c.req.header("idempotency-key")

    const checkout = await createCheckout(actorOf(c), c.req.valid("param").slug, {
      type: body.type,
      mode: body.mode,
      items: body.items,
      ...(body.toAddressId === undefined ? {} : { toAddressId: body.toAddressId }),
      ...(key === undefined ? {} : { idempotencyKey: key }),
    })

    return c.json(checkoutOf(checkout), 201)
  },
})

export const myCheckoutsRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/me/checkouts",
    summary: "Mis compras en curso",
    tags: ["Tiendas públicas"],
    responses: {
      200: {
        description: "Las compras del comprador",
        content: { "application/json": { schema: z.array(checkoutSchema) } },
      },
    },
  },
  handler: async (c) => c.json((await listMyCheckouts(actorOf(c))).map(checkoutOf), 200),
})

export const myCheckoutRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/me/checkouts/{checkoutId}",
    summary: "Una compra mía",
    tags: ["Tiendas públicas"],
    request: { params: z.object({ checkoutId: z.string() }) },
    responses: {
      200: {
        description: "La compra, con su desglose",
        content: { "application/json": { schema: checkoutSchema } },
      },
      404: { description: "No existe, o no es de quien la pide" },
    },
  },
  handler: async (c) =>
    c.json(checkoutOf(await readCheckout(actorOf(c), c.req.valid("param").checkoutId)), 200),
})

export const cancelCheckoutRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/me/checkouts/{checkoutId}/cancellation",
    summary: "Desistir de la compra y liberar el inventario",
    tags: ["Tiendas públicas"],
    request: { params: z.object({ checkoutId: z.string() }) },
    responses: {
      200: {
        description: "La compra cancelada",
        content: { "application/json": { schema: checkoutSchema } },
      },
      404: { description: "No existe, o no es de quien la cancela" },
      409: { description: "Ya está pagada, cancelada o caducada" },
    },
  },
  handler: async (c) =>
    c.json(checkoutOf(await cancelCheckout(actorOf(c), c.req.valid("param").checkoutId)), 200),
})

// ─── Pedidos del comprador ───────────────────────────────────────────────────

export const myOrdersRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/me/orders",
    summary: "Mis pedidos, de todas las tiendas",
    tags: ["Tiendas públicas"],
    responses: {
      200: {
        description: "Pedidos con sus artículos, su pago y su envío",
        content: { "application/json": { schema: z.array(orderSchema) } },
      },
    },
  },
  handler: async (c) => c.json((await listMyOrders(actorOf(c))).map(orderOf), 200),
})

export const myOrderRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/me/orders/{orderId}",
    summary: "Un pedido mío",
    tags: ["Tiendas públicas"],
    request: { params: z.object({ orderId: z.string() }) },
    responses: {
      200: {
        description: "El pedido, con sus artículos, su pago y el seguimiento de su envío",
        content: { "application/json": { schema: orderSchema } },
      },
      404: { description: "No existe, o no es de quien lo pide" },
    },
  },
  handler: async (c) =>
    c.json(orderOf(await readMyOrder(actorOf(c), c.req.valid("param").orderId)), 200),
})
