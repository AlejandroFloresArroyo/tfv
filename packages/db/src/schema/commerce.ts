/**
 * Compra en tienda pública y materialización del pedido.
 *
 * Ver `openspec/specs/storefront-checkout`, `order-fulfillment`, `payment-webhooks`
 * y `shipping-rates`.
 *
 * Cuando se confirma un pago, una sola señal externa genera **ocho entidades relacionadas**. Las
 * dos barreras que garantizan que eso ocurra exactamente una vez viven aquí:
 *
 * - `payment_events.external_event_id` único — el mismo evento no se procesa dos veces.
 * - `checkouts.fulfilled_at` — la misma compra no se materializa desde dos eventos distintos.
 *
 * Hacen falta las dos: el procesador puede emitir eventos con identificadores distintos que
 * apunten a la misma sesión de pago.
 *
 * Vía hasta la empresa: columna directa en la compra y sus derivados.
 */

import type { ShippingQuote, ShippingThreshold } from "@tfv/contracts"
import { relations, sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { money, percent, primaryId, reference, softDelete, timestamps } from "./_shared.ts"
import { companyAddresses, userAddresses } from "./addresses.ts"
import { merchantProfiles } from "./billing.ts"
import { companies, users } from "./identity.ts"
import { websites } from "./websites.ts"

// ─── Eventos del procesador ──────────────────────────────────────────────────

/**
 * Todo evento recibido, con el resultado de su verificación y de su procesamiento.
 *
 * `external_event_id` único es la barrera de deduplicación. **No es una comprobación de la
 * aplicación**: es una restricción de la base, y por tanto resistente a la concurrencia.
 *
 * Conservar la carga útil íntegra es lo que permite reprocesar un evento fallido y, en la práctica,
 * reconstruir qué pasó cuando un cobro no cuadra.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: primaryId(),
    externalEventId: varchar("external_event_id", { length: 160 }).notNull(),
    type: varchar("type", { length: 120 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),

    signatureVerified: boolean("signature_verified").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("payment_events_external_unique").on(table.externalEventId),
    index("payment_events_pending_idx").on(table.receivedAt).where(sql`processed_at IS NULL`),
  ],
)

// ─── Compra ──────────────────────────────────────────────────────────────────

export const checkoutStatus = pgEnum("checkout_status", [
  "pending",
  "completed",
  "canceled",
  "expired",
])

export const shippingMode = pgEnum("shipping_mode", [
  "local",
  "national",
  "international",
  "pickup",
])

/** Un artículo tal y como estaba al comprarlo. */
export interface CheckoutLine {
  readonly kind: "warehouse_measurement" | "pixit_product" | "pixit_mosaic"
  readonly refId: string
  readonly name: string
  readonly unitPrice: string
  readonly quantity: number
  readonly total: string
  /** Sólo mosaicos: la obra generada, sin la que el pedido no tiene sentido. */
  readonly mosaic?: {
    readonly boardId: string
    readonly boardSizeId: string
    readonly sheetId: string
    readonly sheets: readonly {
      readonly position: number
      readonly imageUploadId: string
      readonly colors: readonly { colorId: string; pieces: number; bags: number }[]
    }[]
  }
}

/**
 * Desglose del envío, con el tipo de cambio aplicado cuando lo hubo.
 *
 * **Es el tipo del motor, no una copia suya.** Antes era una interfaz declarada aquí a mano, y una
 * segunda declaración de la misma estructura acaba divergiendo de la que la produce: `surcharges`
 * era una cadena cuando el cálculo enumera un recargo por umbral alcanzado. Lo que se guarda es
 * exactamente lo que `computeShipping` devuelve. Mismo motivo que `QuotationBreakdown` en
 * `warehouse-commerce.ts`.
 */
export type { ShippingQuote as ShippingBreakdown } from "@tfv/contracts"

/**
 * Instantánea de la compra, persistida **antes** del pago.
 *
 * Es la fuente para materializar el pedido, de modo que un cambio posterior en el catálogo no
 * altere lo que el comprador compró.
 */
export const checkouts = pgTable(
  "checkouts",
  {
    id: primaryId(),
    websiteId: reference("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "restrict" }),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    buyerId: reference("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    merchantProfileId: reference("merchant_profile_id").references(() => merchantProfiles.id, {
      onDelete: "set null",
    }),

    type: varchar("type", { length: 8 }).notNull().default("sale"),
    status: checkoutStatus("status").notNull().default("pending"),

    lines: jsonb("lines").$type<CheckoutLine[]>().notNull(),

    subtotal: money("subtotal").notNull(),
    platformFee: money("platform_fee").notNull().default("0"),
    platformFeeRate: percent("platform_fee_rate").notNull().default("0"),
    shippingCost: money("shipping_cost").notNull().default("0"),
    /** Lo que paga el comprador: subtotal más envío. */
    total: money("total").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("MXN"),

    shippingMode: shippingMode("shipping_mode").notNull(),
    shippingBreakdown: jsonb("shipping_breakdown").$type<ShippingQuote>(),
    shipFromAddressId: reference("ship_from_address_id").references(() => companyAddresses.id, {
      onDelete: "set null",
    }),
    shipToAddressId: reference("ship_to_address_id").references(() => userAddresses.id, {
      onDelete: "set null",
    }),

    externalSessionId: varchar("external_session_id", { length: 160 }),
    checkoutUrl: text("checkout_url"),
    /** La sesión caduca; al hacerlo se liberan las unidades apartadas. */
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),

    /**
     * Barrera de materialización.
     *
     * Se marca **al final** de la transacción, nunca al principio. La pila anterior la ponía antes
     * de hacer el trabajo, así que un fallo posterior dejaba una compra marcada como resuelta y sin
     * pedido, que el reintento ya no reparaba (`DEFECTS.md` M-03).
     */
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true, mode: "date" }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("checkouts_session_unique")
      .on(table.externalSessionId)
      .where(sql`external_session_id IS NOT NULL`),
    // El recolector de compras caducadas.
    index("checkouts_expiry_idx").on(table.expiresAt).where(sql`status = 'pending'`),
    index("checkouts_buyer_idx").on(table.buyerId, table.createdAt),
  ],
)

// ─── Pago ────────────────────────────────────────────────────────────────────

export const paymentStatus = pgEnum("payment_status", [
  "created",
  "processing",
  "succeeded",
  "failed",
  "refunded",
  "disputed",
])

export const payments = pgTable(
  "payments",
  {
    id: primaryId(),
    checkoutId: reference("checkout_id").references(() => checkouts.id, { onDelete: "set null" }),
    buyerId: reference("buyer_id").references(() => users.id, { onDelete: "set null" }),

    /** Bruto, comisión y neto por separado: es lo que permite conciliar. */
    grossAmount: money("gross_amount").notNull(),
    platformFee: money("platform_fee").notNull().default("0"),
    platformFeeRate: percent("platform_fee_rate").notNull().default("0"),
    netAmount: money("net_amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("MXN"),

    method: varchar("method", { length: 40 }),
    status: paymentStatus("status").notNull().default("created"),

    externalPaymentIntentId: varchar("external_payment_intent_id", { length: 160 }),
    externalChargeId: varchar("external_charge_id", { length: 160 }),
    receiptUrl: text("receipt_url"),

    refundedAmount: money("refunded_amount").notNull().default("0"),
    refundedAt: timestamp("refunded_at", { withTimezone: true, mode: "date" }),
    disputedAt: timestamp("disputed_at", { withTimezone: true, mode: "date" }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("payments_intent_unique")
      .on(table.externalPaymentIntentId)
      .where(sql`external_payment_intent_id IS NOT NULL`),
    index("payments_checkout_idx").on(table.checkoutId),
  ],
)

// ─── Envío ───────────────────────────────────────────────────────────────────

/**
 * Cuadro de tarifas de envío de una empresa.
 *
 * Ver `openspec/specs/shipping-rates/spec.md`, requisito «Las tarifas son datos configurables».
 * Rebanada 17.
 *
 * Existe para que cambiar una tarifa **no sea un despliegue**. Antes las tarifas y el tipo de
 * cambio eran constantes del código, y además duplicadas en el navegador (`DEFECTS.md` M-11): un
 * ajuste de precio pedía dos despliegues coordinados y, entre uno y otro, la estimación que veía el
 * comprador no era lo que se le cobraba.
 *
 * **Una fila por empresa.** Sin fila, el cálculo usa el cuadro de la spec
 * (`DEFAULT_SHIPPING_RATES`), de modo que una empresa recién dada de alta puede cobrar envíos antes
 * de que nadie entre a configurarlos.
 *
 * La recolección no tiene columnas: la spec la fija en cero, así que no es una tarifa que se pueda
 * cambiar sin dejar de ser recolección.
 *
 * Los umbrales van en JSON y no en columnas porque son una **lista**: hoy la spec define dos tramos
 * de distancia y dos de cantidad, y en columnas fijas un tercer tramo sería una migración. La forma
 * es la que consume el motor, `ShippingThreshold[]`, sin traducción por medio.
 *
 * Vía hasta la empresa: columna directa.
 */
export const shippingRates = pgTable(
  "shipping_rates",
  {
    id: primaryId(),
    companyId: reference("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),

    /** Moneda en la que están escritas estas tarifas. */
    currency: varchar("currency", { length: 3 }).notNull().default("MXN"),
    /** El que declara la paquetería. Cinco mil hoy. */
    volumetricDivisor: integer("volumetric_divisor").notNull().default(5000),

    localBase: money("local_base").notNull().default("99.00"),
    localPerKilogram: money("local_per_kilogram").notNull().default("20.00"),
    nationalBase: money("national_base").notNull().default("199.00"),
    nationalPerKilogram: money("national_per_kilogram").notNull().default("30.00"),
    internationalBase: money("international_base").notNull().default("499.00"),
    internationalPerKilogram: money("international_per_kilogram").notNull().default("60.00"),

    /** Tramos de distancia, en kilómetros. Excluyentes entre sí. Sólo en envíos nacionales. */
    distanceSurcharges: jsonb("distance_surcharges")
      .$type<readonly ShippingThreshold[]>()
      .notNull()
      .default(sql`'[{"over":500,"amount":"40.00"},{"over":1000,"amount":"80.00"}]'::jsonb`),
    /** Tramos por número de artículos. Excluyentes entre sí. */
    itemSurcharges: jsonb("item_surcharges")
      .$type<readonly ShippingThreshold[]>()
      .notNull()
      .default(sql`'[{"over":3,"amount":"20.00"},{"over":10,"amount":"50.00"}]'::jsonb`),

    /**
     * Moneda y tipo a los que convertir el costo, cuando el cobro no va en la de las tarifas.
     *
     * Nulos mientras nadie los fije, que es lo que hace que no haya conversión por omisión. El tipo
     * que se aplicó **se guarda con cada envío** (`checkouts.shipping_breakdown`), no se deduce de
     * aquí: esta fila cambia, y un cobro de hace tres meses tiene que seguir siendo explicable.
     */
    exchangeCurrency: varchar("exchange_currency", { length: 3 }),
    exchangeRate: numeric("exchange_rate", { precision: 16, scale: 6 }),

    ...timestamps,
  },
  (table) => [uniqueIndex("shipping_rates_company_unique").on(table.companyId)],
)

export const shipmentStatus = pgEnum("shipment_status", [
  "pending",
  "shipped",
  "in_transit",
  "delivered",
  "returned",
  "canceled",
])

export const shipments = pgTable(
  "shipments",
  {
    id: primaryId(),
    mode: shippingMode("mode").notNull(),
    cost: money("cost").notNull().default("0"),
    status: shipmentStatus("status").notNull().default("pending"),

    carrier: varchar("carrier", { length: 60 }).notNull().default("manual"),
    trackingNumber: varchar("tracking_number", { length: 120 }),
    estimatedDeliveryAt: timestamp("estimated_delivery_at", { withTimezone: true, mode: "date" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),

    fromAddressId: reference("from_address_id").references(() => companyAddresses.id, {
      onDelete: "set null",
    }),
    toAddressId: reference("to_address_id").references(() => userAddresses.id, {
      onDelete: "set null",
    }),

    notes: text("notes"),
    ...timestamps,
  },
  (table) => [index("shipments_status_idx").on(table.status, table.estimatedDeliveryAt)],
)

// ─── Pedido de comprador ─────────────────────────────────────────────────────

export const buyerOrderStatus = pgEnum("buyer_order_status", [
  "paid",
  "processing",
  "completed",
  "canceled",
  "refunded",
])

/**
 * El comprobante del comprador.
 *
 * Su total es **lo que efectivamente pagó**, con subtotal, envío y comisión registrados por
 * separado. La pila anterior lo fijaba igual al subtotal, de modo que el comprobante no cuadraba
 * con el cargo (`DEFECTS.md` M-01).
 */
export const buyerOrders = pgTable(
  "buyer_orders",
  {
    id: primaryId(),
    checkoutId: reference("checkout_id").references(() => checkouts.id, { onDelete: "set null" }),
    buyerId: reference("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),

    paymentId: reference("payment_id").references(() => payments.id, { onDelete: "set null" }),
    shipmentId: reference("shipment_id").references(() => shipments.id, { onDelete: "set null" }),

    /** Referencia legible que el comprador puede citar. */
    reference: varchar("reference", { length: 64 }).notNull(),
    type: varchar("type", { length: 8 }).notNull().default("sale"),
    status: buyerOrderStatus("status").notNull().default("paid"),

    subtotal: money("subtotal").notNull(),
    shippingCost: money("shipping_cost").notNull().default("0"),
    platformFee: money("platform_fee").notNull().default("0"),
    total: money("total").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("MXN"),

    note: text("note"),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("buyer_orders_reference_unique").on(table.reference),
    index("buyer_orders_buyer_idx").on(table.buyerId, table.createdAt),
    index("buyer_orders_company_idx").on(table.companyId, table.createdAt),
  ],
)

export const buyerOrderLines = pgTable(
  "buyer_order_lines",
  {
    id: primaryId(),
    orderId: reference("order_id")
      .notNull()
      .references(() => buyerOrders.id, { onDelete: "cascade" }),

    /** Copia de lo comprado, no referencia viva: el catálogo puede cambiar después. */
    line: jsonb("line").$type<CheckoutLine>().notNull(),
    position: integer("position").notNull().default(0),

    ...timestamps,
  },
  (table) => [index("buyer_order_lines_order_idx").on(table.orderId, table.position)],
)

// ─── Relaciones ──────────────────────────────────────────────────────────────

export const checkoutsRelations = relations(checkouts, ({ one, many }) => ({
  website: one(websites, { fields: [checkouts.websiteId], references: [websites.id] }),
  buyer: one(users, { fields: [checkouts.buyerId], references: [users.id] }),
  orders: many(buyerOrders),
}))

export const buyerOrdersRelations = relations(buyerOrders, ({ one, many }) => ({
  checkout: one(checkouts, { fields: [buyerOrders.checkoutId], references: [checkouts.id] }),
  buyer: one(users, { fields: [buyerOrders.buyerId], references: [users.id] }),
  company: one(companies, { fields: [buyerOrders.companyId], references: [companies.id] }),
  payment: one(payments, { fields: [buyerOrders.paymentId], references: [payments.id] }),
  shipment: one(shipments, { fields: [buyerOrders.shipmentId], references: [shipments.id] }),
  lines: many(buyerOrderLines),
}))
