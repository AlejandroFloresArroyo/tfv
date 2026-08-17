/**
 * Pedidos, cotizaciones y reserva de existencias.
 *
 * Ver `openspec/specs/warehouse-orders`, `quotations`, `quotation-pricing`, `stock-reservation`
 * y `order-chat`.
 *
 * La transición central del servicio: **aceptar un pedido genera su cotización** con las líneas
 * del pedido y el inventario ya apartado. Y el estado de la cotización proyecta sobre el estado de
 * cada unidad reservada, con un caso contraintuitivo que merece recordarse — una cotización de
 * renta **completada** deja las unidades rentadas, no disponibles: completar significa que el
 * equipo salió, no que volvió.
 *
 * Vía hasta la empresa: almacén → empresa.
 */

import { relations, sql } from "drizzle-orm"
import {
  boolean,
  foreignKey,
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
import { money, primaryId, reference, softDelete, timestamps } from "./_shared.ts"
import { buyerOrders, checkouts } from "./commerce.ts"
import { counterparties } from "./counterparties.ts"
import { users } from "./identity.ts"
import { uploads } from "./media.ts"
import { productionPurchaseOrders } from "./productions-ops.ts"
import {
  warehouseMeasurements,
  warehouseProductPrices,
  warehouseStockUnits,
  warehouses,
} from "./warehouses.ts"

export const tradeType = pgEnum("trade_type", ["rent", "sale"])

// ─── Pedidos ─────────────────────────────────────────────────────────────────

export const orderStatus = pgEnum("warehouse_order_status", [
  "pending",
  "accepted",
  "delivered",
  "finished",
  "canceled",
])

/** De dónde vino el pedido. Condiciona si nace pendiente o ya resuelto. */
export const orderOrigin = pgEnum("warehouse_order_origin", ["production", "storefront"])

export const warehouseOrders = pgTable(
  "warehouse_orders",
  {
    id: primaryId(),
    warehouseId: reference("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),

    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 250 }).notNull().default(""),
    observations: text("observations").notNull().default(""),

    origin: orderOrigin("origin").notNull(),
    type: tradeType("type").notNull().default("sale"),
    status: orderStatus("status").notNull().default("pending"),

    /**
     * Prioridad de presentación, derivada del estado.
     *
     * Columna calculada, no escrita por la aplicación: así no puede quedar desincronizada del
     * estado, que es lo que ocurría cuando la calculaba un gancho del modelo.
     */
    priority: numeric("priority", { precision: 4, scale: 2 }).generatedAlwaysAs(
      sql`(case status
            when 'pending' then 0.80
            when 'accepted' then 0.70
            when 'delivered' then 0.60
            when 'finished' then 0.50
            else 0.40
          end) + (case when quote_id is not null then 0.05 else 0 end)`,
    ),

    /**
     * La cotización que se generó al aceptarlo.
     *
     * Sin clave foránea declarada: la cotización se define más abajo en este mismo archivo y
     * apunta de vuelta al pedido, así que declararla en ambos sentidos crea un ciclo. La integridad
     * la sostiene `warehouse_quotes.order_id`, que sí la tiene, y ambas se escriben en la misma
     * transacción al aceptar.
     */
    quoteId: reference("quote_id"),
    /** La orden de compra de producción que lo originó. Cruza la frontera del arrendatario. */
    purchaseOrderId: reference("purchase_order_id").references(() => productionPurchaseOrders.id, {
      onDelete: "set null",
    }),
    /** El pedido de comprador que lo originó, cuando vino de una tienda pública. */
    buyerOrderId: reference("buyer_order_id").references(() => buyerOrders.id, {
      onDelete: "set null",
    }),

    clientId: reference("client_id").references(() => counterparties.id, { onDelete: "set null" }),
    providerId: reference("provider_id").references(() => counterparties.id, {
      onDelete: "set null",
    }),

    canceledAt: timestamp("canceled_at", { withTimezone: true, mode: "date" }),
    canceledById: reference("canceled_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Obligatorio al rechazar: lo lee quien hizo la solicitud desde otra empresa. */
    cancelReason: text("cancel_reason"),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("warehouse_orders_code_unique").on(table.code),
    // La bandeja de trabajo: lo que requiere atención, primero.
    index("warehouse_orders_queue_idx")
      .on(table.warehouseId, table.priority, table.createdAt)
      .where(sql`deleted_at IS NULL`),
    index("warehouse_orders_purchase_idx").on(table.purchaseOrderId),
  ],
)

export const warehouseOrderLines = pgTable(
  "warehouse_order_lines",
  {
    id: primaryId(),
    orderId: reference("order_id")
      .notNull()
      .references(() => warehouseOrders.id, { onDelete: "cascade" }),
    measurementId: reference("measurement_id")
      .notNull()
      .references(() => warehouseMeasurements.id, { onDelete: "restrict" }),

    quantity: integer("quantity").notNull().default(1),
    /** Orden de presentación, puramente visual. */
    position: integer("position").notNull().default(0),

    ...timestamps,
  },
  (table) => [index("warehouse_order_lines_order_idx").on(table.orderId, table.position)],
)

// ─── Conversación del pedido ─────────────────────────────────────────────────

/** Los dos lados del mostrador, más los avisos que publica el propio sistema. */
export const chatSide = pgEnum("chat_side", ["client", "provider", "system"])

/**
 * Mensajes de la conversación de un pedido.
 *
 * Los acuses de lectura son **por lado, no por persona**: si tres personas del almacén están en la
 * conversación y una lee, queda leído para el lado del proveedor. Es lo correcto aquí, porque el
 * cliente quiere saber si *el almacén* lo vio.
 */
export const warehouseOrderMessages = pgTable(
  "warehouse_order_messages",
  {
    id: primaryId(),
    orderId: reference("order_id")
      .notNull()
      .references(() => warehouseOrders.id, { onDelete: "cascade" }),

    side: chatSide("side").notNull(),
    authorId: reference("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),

    /** Respuesta a otro mensaje. */
    replyToId: reference("reply_to_id"),

    readByClientAt: timestamp("read_by_client_at", { withTimezone: true, mode: "date" }),
    readByProviderAt: timestamp("read_by_provider_at", { withTimezone: true, mode: "date" }),
    editedAt: timestamp("edited_at", { withTimezone: true, mode: "date" }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    foreignKey({
      columns: [table.replyToId],
      foreignColumns: [table.id],
      name: "warehouse_order_messages_reply_fk",
    }).onDelete("set null"),
    index("warehouse_order_messages_order_idx").on(table.orderId, table.createdAt),
  ],
)

// ─── Cotizaciones ────────────────────────────────────────────────────────────

export const quoteStatus = pgEnum("quote_status", [
  "pre_quote",
  "pending",
  "in_progress",
  "in_rent",
  "completed",
  "sold",
  "canceled",
])

export const rentFrequency = pgEnum("rent_frequency", ["daily", "weekly", "monthly"])

export const roundDirection = pgEnum("round_direction", ["up", "down"])

/** Contacto de una de las partes. */
export interface QuoteContact {
  readonly name: string
  readonly phone?: string
  readonly position?: string
}

/** Condiciones de pago. Se leen enteras y no se consultan por campo suelto. */
export interface QuotePaymentTerms {
  readonly version: 1
  readonly additionals?: { name: string; description?: string; amount: string }[]
  readonly transferFeeRate?: string
  readonly additionalFeeRate?: string
  readonly spreadFeesAcrossLines?: boolean
  readonly advance?: { amount: string; method: "card" | "cash" | "transfer"; date?: string }
  readonly deposit?: { amount: string; method: "card" | "cash" | "transfer"; date?: string }
  readonly fixedPrice?: string
  readonly penalty?: { fixed?: string; concept?: string }
  readonly discount?: { type: "percent" | "amount"; value: string; perProduct?: boolean }
}

/** Bloque fiscal mexicano. Ver la tabla de tratamiento en `quotation-pricing`. */
export interface QuoteTaxes {
  readonly version: 1
  readonly iva?: { rate: string; type: "trasladado" | "acreditable" | "exento"; concept?: string }
  readonly isr?: { rate: string; type: "retenido" | "directo"; concept?: string }
  readonly ivaRetention?: string
  readonly isrRetention?: string
  readonly ieps?: string
  readonly isn?: string
  readonly hospitality?: string
  readonly frontier?: string
  readonly additional?: { name: string; type: "percent" | "amount"; value: string }[]
}

/** Desglose calculado, congelado al cerrar la cotización. */
export interface QuoteComputed {
  readonly version: 1
  readonly subtotal: string
  readonly discount: string
  readonly base: string
  readonly taxes: Readonly<Record<string, string>>
  readonly net: string
  readonly fees: string
  readonly gross: string
  readonly advance: string
  readonly total: string
  readonly penalty: string
}

export const warehouseQuotes = pgTable(
  "warehouse_quotes",
  {
    id: primaryId(),
    warehouseId: reference("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    orderId: reference("order_id").references(() => warehouseOrders.id, { onDelete: "set null" }),
    clientId: reference("client_id").references(() => counterparties.id, { onDelete: "set null" }),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),

    code: varchar("code", { length: 64 }).notNull(),
    folio: varchar("folio", { length: 64 }),
    name: varchar("name", { length: 250 }).notNull().default(""),
    description: text("description").notNull().default(""),

    type: tradeType("type").notNull().default("sale"),
    status: quoteStatus("status").notNull().default("pending"),

    priority: numeric("priority", { precision: 4, scale: 2 }).generatedAlwaysAs(
      sql`(case status
            when 'pre_quote' then 0.90
            when 'pending' then 0.80
            when 'in_progress' then 0.70
            when 'in_rent' then 0.60
            when 'completed' then 0.50
            when 'sold' then 0.40
            else 0.30
          end) + (case when order_id is not null then 0.05 else 0 end)`,
    ),

    /** Ventana de renta. Obligatoria para avanzar una cotización de renta. */
    startsOn: timestamp("starts_on", { withTimezone: true, mode: "date" }),
    endsOn: timestamp("ends_on", { withTimezone: true, mode: "date" }),
    roundDays: boolean("round_days").notNull().default(false),
    roundDirection: roundDirection("round_direction").notNull().default("up"),

    clientContacts: jsonb("client_contacts").$type<QuoteContact[]>().notNull().default([]),
    sellerContacts: jsonb("seller_contacts").$type<QuoteContact[]>().notNull().default([]),

    paymentTerms: jsonb("payment_terms").$type<QuotePaymentTerms>(),
    taxes: jsonb("taxes").$type<QuoteTaxes>(),

    /**
     * Desglose congelado.
     *
     * Nulo mientras la cotización está abierta —entonces se calcula al vuelo— y se persiste al
     * alcanzar un estado cerrado. Es lo que permite explicar un importe de hace ocho meses aunque
     * las tarifas hayan cambiado tres veces.
     */
    computed: jsonb("computed").$type<QuoteComputed>(),
    computedAt: timestamp("computed_at", { withTimezone: true, mode: "date" }),

    alert: text("alert"),
    message: text("message"),
    terms: text("terms"),
    observations: text("observations"),

    clientSignatureId: reference("client_signature_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    responsibleSignatureId: reference("responsible_signature_id").references(() => uploads.id, {
      onDelete: "set null",
    }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("warehouse_quotes_code_unique").on(table.code),
    uniqueIndex("warehouse_quotes_folio_unique").on(table.folio).where(sql`deleted_at IS NULL`),
    index("warehouse_quotes_queue_idx")
      .on(table.warehouseId, table.priority, table.createdAt)
      .where(sql`deleted_at IS NULL`),
    index("warehouse_quotes_client_idx").on(table.clientId),
  ],
)

export const warehouseQuoteLines = pgTable(
  "warehouse_quote_lines",
  {
    id: primaryId(),
    quoteId: reference("quote_id")
      .notNull()
      .references(() => warehouseQuotes.id, { onDelete: "cascade" }),
    measurementId: reference("measurement_id")
      .notNull()
      .references(() => warehouseMeasurements.id, { onDelete: "restrict" }),
    /** La tarifa aplicable. Sin ella se recurre al precio del producto. */
    productPriceId: reference("product_price_id").references(() => warehouseProductPrices.id, {
      onDelete: "set null",
    }),

    frequency: rentFrequency("frequency").notNull().default("weekly"),

    /** Orden de presentación. Puramente visual, persistido por línea. */
    position: integer("position").notNull().default(0),
    positionProduct: integer("position_product").notNull().default(0),

    ...timestamps,
  },
  (table) => [index("warehouse_quote_lines_quote_idx").on(table.quoteId, table.positionProduct)],
)

// ─── Reserva de existencias ──────────────────────────────────────────────────

/**
 * El vínculo que aparta una unidad concreta.
 *
 * Es una tabla y no una columna en la unidad por dos razones: el índice único parcial que impide
 * la doble reserva, y poder conservar el histórico de reservas liberadas.
 *
 * **`stock_unit_id` único mientras la reserva esté viva** es la garantía estructural de que una
 * unidad no se compromete dos veces. No depende de que la aplicación lo compruebe.
 */
export const warehouseStockReservations = pgTable(
  "warehouse_stock_reservations",
  {
    id: primaryId(),
    stockUnitId: reference("stock_unit_id")
      .notNull()
      .references(() => warehouseStockUnits.id, { onDelete: "cascade" }),

    /** Reserva por cotización. Excluyente con la de compra pública. */
    quoteLineId: reference("quote_line_id").references(() => warehouseQuoteLines.id, {
      onDelete: "cascade",
    }),
    quoteId: reference("quote_id").references(() => warehouseQuotes.id, { onDelete: "cascade" }),

    /** Reserva por compra en tienda pública, con caducidad. */
    checkoutId: reference("checkout_id").references(() => checkouts.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),

    releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("warehouse_stock_reservations_unit_unique")
      .on(table.stockUnitId)
      .where(sql`released_at IS NULL`),
    index("warehouse_stock_reservations_line_idx").on(table.quoteLineId),
    // El recolector de reservas de compra caducadas.
    index("warehouse_stock_reservations_expiry_idx")
      .on(table.expiresAt)
      .where(sql`released_at IS NULL AND expires_at IS NOT NULL`),
  ],
)

// ─── Pago de la cotización ───────────────────────────────────────────────────

export const quotePaymentMethod = pgEnum("quote_payment_method", ["card", "cash", "transfer"])

export const warehouseQuotePayments = pgTable(
  "warehouse_quote_payments",
  {
    id: primaryId(),
    quoteId: reference("quote_id")
      .notNull()
      .references(() => warehouseQuotes.id, { onDelete: "cascade" }),

    amount: money("amount").notNull(),
    method: quotePaymentMethod("method").notNull().default("cash"),
    description: text("description"),
    paidById: reference("paid_by_id").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
  },
  (table) => [index("warehouse_quote_payments_quote_idx").on(table.quoteId)],
)

/** Comprobantes adjuntos a un pago. */
export const warehouseQuotePaymentVouchers = pgTable(
  "warehouse_quote_payment_vouchers",
  {
    id: primaryId(),
    paymentId: reference("payment_id")
      .notNull()
      .references(() => warehouseQuotePayments.id, { onDelete: "cascade" }),
    uploadId: reference("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [uniqueIndex("quote_payment_vouchers_unique").on(table.paymentId, table.uploadId)],
)

// ─── Relaciones ──────────────────────────────────────────────────────────────

export const warehouseOrdersRelations = relations(warehouseOrders, ({ one, many }) => ({
  warehouse: one(warehouses, {
    fields: [warehouseOrders.warehouseId],
    references: [warehouses.id],
  }),
  quote: one(warehouseQuotes, {
    fields: [warehouseOrders.quoteId],
    references: [warehouseQuotes.id],
    relationName: "order_quote",
  }),
  lines: many(warehouseOrderLines),
  messages: many(warehouseOrderMessages),
}))

export const warehouseQuotesRelations = relations(warehouseQuotes, ({ one, many }) => ({
  warehouse: one(warehouses, {
    fields: [warehouseQuotes.warehouseId],
    references: [warehouses.id],
  }),
  order: one(warehouseOrders, {
    fields: [warehouseQuotes.orderId],
    references: [warehouseOrders.id],
    relationName: "quote_order",
  }),
  lines: many(warehouseQuoteLines),
  reservations: many(warehouseStockReservations),
  payments: many(warehouseQuotePayments),
}))

export const warehouseQuoteLinesRelations = relations(warehouseQuoteLines, ({ one, many }) => ({
  quote: one(warehouseQuotes, {
    fields: [warehouseQuoteLines.quoteId],
    references: [warehouseQuotes.id],
  }),
  measurement: one(warehouseMeasurements, {
    fields: [warehouseQuoteLines.measurementId],
    references: [warehouseMeasurements.id],
  }),
  reservations: many(warehouseStockReservations),
}))

export const warehouseStockReservationsRelations = relations(
  warehouseStockReservations,
  ({ one }) => ({
    stockUnit: one(warehouseStockUnits, {
      fields: [warehouseStockReservations.stockUnitId],
      references: [warehouseStockUnits.id],
    }),
    quoteLine: one(warehouseQuoteLines, {
      fields: [warehouseStockReservations.quoteLineId],
      references: [warehouseQuoteLines.id],
    }),
  }),
)
