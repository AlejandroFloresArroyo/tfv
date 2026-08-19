/**
 * Suscripciones de la plataforma y alta de comercio.
 *
 * Ver `openspec/specs/subscriptions-and-entitlements` y `merchant-onboarding`.
 *
 * Conviene no confundir los dos flujos de dinero del sistema:
 *
 * - **Suscripción**: lo que la plataforma le cobra a sus empresas clientes. Licencia por asiento.
 * - **Alta de comercio**: lo que permite que una empresa cobre a *sus* clientes, con la plataforma
 *   reteniendo comisión y transfiriendo el resto.
 *
 * Vía hasta la empresa: columna directa en todas.
 */

import { relations, sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { money, percent, primaryId, reference, softDelete, timestamps } from "./_shared.ts"
import { companyAddresses } from "./addresses.ts"
import { companies, users } from "./identity.ts"

// ─── Catálogo de planes ──────────────────────────────────────────────────────

/**
 * Prestación de un plan.
 *
 * **Material descriptivo**: sirve para comparar planes en la interfaz y nada en el sistema la hace
 * cumplir. La spec lo declara explícitamente para que nadie asuma lo contrario y construya encima.
 */
export interface PlanFeature {
  readonly key: string
  readonly name: string
  readonly description?: string
  readonly type: "boolean" | "number" | "string"
  readonly value?: string | number | boolean
  readonly limited?: boolean
}

export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: primaryId(),

    /** El nivel cero es el plan gratuito, con sus restricciones propias. */
    tier: integer("tier").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description").notNull().default(""),

    isIndividual: boolean("is_individual").notNull().default(false),
    isRecommended: boolean("is_recommended").notNull().default(false),

    /** Los precios viven en el procesador de pagos; aquí sólo la referencia a su producto. */
    externalProductId: varchar("external_product_id", { length: 120 }),

    features: jsonb("features").$type<PlanFeature[]>().notNull().default([]),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("subscription_plans_external_unique")
      .on(table.externalProductId)
      .where(sql`external_product_id IS NOT NULL AND deleted_at IS NULL`),
    index("subscription_plans_tier_idx").on(table.tier),
  ],
)

// ─── Suscripción de una empresa ──────────────────────────────────────────────

export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "canceled",
])

export const billingInterval = pgEnum("billing_interval", ["day", "week", "month", "year"])

export const companySubscriptions = pgTable(
  "company_subscriptions",
  {
    id: primaryId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    planId: reference("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: "restrict" }),
    /** Quién la contrató. */
    subscribedById: reference("subscribed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    status: subscriptionStatus("status").notNull(),
    /** La cancelación surte efecto al terminar el periodo, no de inmediato. */
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),

    /** Asientos contratados. Al menos igual al número de membresías activas. */
    seats: integer("seats").notNull().default(1),

    interval: billingInterval("interval").notNull(),
    intervalCount: integer("interval_count").notNull().default(1),
    periodStart: timestamp("period_start", { withTimezone: true, mode: "date" }),
    periodEnd: timestamp("period_end", { withTimezone: true, mode: "date" }),

    /**
     * Fin del periodo de gracia tras un fallo de cobro.
     *
     * Mientras esté vigente la empresa sigue operando. La pila anterior **eliminaba la
     * suscripción** ante el primer fallo, lo que tumbaba la empresa y sus tiendas públicas por un
     * rechazo transitorio de tarjeta (`DEFECTS.md` M-08).
     */
    gracePeriodEndsAt: timestamp("grace_period_ends_at", { withTimezone: true, mode: "date" }),

    /**
     * El descuento aplicado, y por qué.
     *
     * **Vive en la suscripción, no se recalcula en cada ciclo.** La implementación anterior
     * sincronizaba los asientos en cada renovación reescribiendo las líneas de la suscripción, y en
     * el camino borraba descuentos y códigos promocionales (`DEFECTS.md` M-07): quien contrataba
     * con un quince por ciento lo perdía al mes siguiente, sin que nadie lo tocara ni se enterara.
     *
     * Guardado aquí, la sincronización de asientos no tiene por qué mirarlo, que es exactamente la
     * propiedad que hacía falta.
     */
    discountPercent: percent("discount_percent"),
    /** El código que lo concedió, cuando lo escribió una persona. */
    promotionCode: varchar("promotion_code", { length: 60 }),
    /** Su referencia en el procesador, para reconocerlo al reconciliar. */
    externalDiscountId: varchar("external_discount_id", { length: 120 }),

    externalSubscriptionId: varchar("external_subscription_id", { length: 120 }),
    externalCustomerId: varchar("external_customer_id", { length: 120 }),
    externalPriceId: varchar("external_price_id", { length: 120 }),

    ...timestamps,
  },
  (table) => [
    // Una empresa tiene como máximo una suscripción vigente.
    uniqueIndex("company_subscriptions_company_unique")
      .on(table.companyId)
      .where(sql`status <> 'canceled'`),
    uniqueIndex("company_subscriptions_external_unique").on(table.externalSubscriptionId),
    index("company_subscriptions_status_idx").on(table.status, table.periodEnd),
    /**
     * El barrido de la gracia.
     *
     * Busca suscripciones cuyo periodo de gracia venció sin cobro, y son siempre unas pocas entre
     * todas las vigentes. Sin este índice el barrido recorre la tabla entera cada vez.
     */
    index("company_subscriptions_grace_idx")
      .on(table.gracePeriodEndsAt)
      .where(sql`grace_period_ends_at is not null`),
  ],
)

/** Cada cobro de un periodo. Consultable por los miembros con permiso. */
export const subscriptionPayments = pgTable(
  "subscription_payments",
  {
    id: primaryId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    subscriptionId: reference("subscription_id").references(() => companySubscriptions.id, {
      onDelete: "set null",
    }),

    amount: money("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("MXN"),
    seats: integer("seats").notNull().default(1),

    periodStart: timestamp("period_start", { withTimezone: true, mode: "date" }),
    periodEnd: timestamp("period_end", { withTimezone: true, mode: "date" }),

    succeeded: boolean("succeeded").notNull(),

    externalInvoiceId: varchar("external_invoice_id", { length: 120 }),
    externalPaymentIntentId: varchar("external_payment_intent_id", { length: 120 }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("subscription_payments_invoice_unique")
      .on(table.externalInvoiceId)
      .where(sql`external_invoice_id IS NOT NULL`),
    index("subscription_payments_company_idx").on(table.companyId, table.createdAt),
  ],
)

// ─── Alta de comercio ────────────────────────────────────────────────────────

export const merchantStatus = pgEnum("merchant_status", [
  "pending",
  "limited",
  "active",
  "inactive",
])

export const merchantVerification = pgEnum("merchant_verification", [
  "pending",
  "verified",
  "disabled",
])

/** Datos fiscales del negocio. Se leen siempre juntos y no se consultan por campo suelto. */
export interface MerchantBusiness {
  readonly type: "individual" | "company" | "government_entity" | "non_profit"
  readonly legalName: string
  readonly taxId: string
  readonly taxRegime?: string | undefined
  readonly invoiceUse?: string | undefined
  readonly email?: string | undefined
  readonly dialCode?: string | undefined
  readonly phone?: string | undefined
}

/** Cuenta bancaria. La clave interbancaria se valida antes de registrarla. */
export interface MerchantBank {
  readonly bankName?: string | undefined
  readonly holderType: "individual" | "company"
  readonly holder: string
  readonly clabe: string
  readonly currency: "MXN" | "USD"
  readonly country: string
}

/** Representante legal, con su relación con el negocio. */
export interface MerchantRepresentative {
  readonly name: string
  readonly lastname: string
  readonly email?: string | undefined
  readonly dialCode?: string | undefined
  readonly phone?: string | undefined
  readonly taxId?: string | undefined
  readonly birthdate: { day: number; month: number; year: number }
  readonly address: {
    line1: string
    city: string
    state: string
    postalCode: string
    country: string
  }
  readonly relationship: {
    title?: string | undefined
    isDirector?: boolean | undefined
    isExecutive?: boolean | undefined
    isRepresentative?: boolean | undefined
    isOwner?: boolean | undefined
    percentOwnership?: number | undefined
  }
}

/**
 * Perfil de facturación de una empresa.
 *
 * Sólo el **primario** en estado activo o limitado permite cobrar en la tienda pública. Un perfil
 * activo que no sea el primario no habilita nada.
 */
export const merchantProfiles = pgTable(
  "merchant_profiles",
  {
    id: primaryId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    alias: varchar("alias", { length: 160 }).notNull(),
    addressId: reference("address_id").references(() => companyAddresses.id, {
      onDelete: "set null",
    }),

    business: jsonb("business").$type<MerchantBusiness>().notNull(),
    bank: jsonb("bank").$type<MerchantBank>().notNull(),
    representative: jsonb("representative").$type<MerchantRepresentative>().notNull(),

    status: merchantStatus("status").notNull().default("pending"),
    verificationStatus: merchantVerification("verification_status").notNull().default("pending"),
    canAcceptCharges: boolean("can_accept_charges").notNull().default(false),
    canReceivePayouts: boolean("can_receive_payouts").notNull().default(false),

    isPrimary: boolean("is_primary").notNull().default(false),

    externalAccountId: varchar("external_account_id", { length: 120 }),

    /** Instante y origen desde los que se aceptaron los términos del procesador. */
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true, mode: "date" }),
    termsAcceptedIp: varchar("terms_accepted_ip", { length: 45 }),

    notes: text("notes"),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("merchant_profiles_primary_unique")
      .on(table.companyId)
      .where(sql`is_primary = true AND deleted_at IS NULL`),
    /**
     * Excluye lo dado de baja, como su vecino de arriba.
     *
     * Sin `deleted_at IS NULL`, un perfil eliminado se queda con su identificador ocupado para
     * siempre; con el suplente local, que lo acuña determinista por empresa, la segunda alta de la
     * misma empresa chocaba siempre y respondía `500` sin salida. Ver la migración `0027`.
     */
    uniqueIndex("merchant_profiles_external_unique")
      .on(table.externalAccountId)
      .where(sql`external_account_id IS NOT NULL AND deleted_at IS NULL`),
    index("merchant_profiles_company_idx").on(table.companyId, table.status),
  ],
)

// ─── Libro de ingresos del comercio ──────────────────────────────────────────

export const merchantPaymentMethod = pgEnum("merchant_payment_method", [
  "card",
  "oxxo",
  "spei",
  "bank_transfer",
])

export const merchantPaymentStatus = pgEnum("merchant_payment_status", [
  "created",
  "requires_action",
  "processing",
  "paid",
  "failed",
  "refunded",
  "disputed",
  "canceled",
])

/**
 * Lo que una empresa cobra de sus propios compradores.
 *
 * Registra el bruto, la comisión retenida y el neto por separado, que es lo que permite conciliar
 * lo que llegó a su cuenta con lo que el comprador pagó.
 */
export const merchantPayments = pgTable(
  "merchant_payments",
  {
    id: primaryId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    merchantProfileId: reference("merchant_profile_id").references(() => merchantProfiles.id, {
      onDelete: "set null",
    }),

    buyerId: reference("buyer_id").references(() => users.id, { onDelete: "set null" }),

    /** Importe bruto que pagó el comprador por los artículos. */
    grossAmount: money("gross_amount").notNull(),
    /** Comisión retenida por la plataforma. */
    platformFee: money("platform_fee").notNull().default("0"),
    platformFeeRate: percent("platform_fee_rate").notNull().default("0"),
    /** Lo que se transfiere al comercio. */
    netAmount: money("net_amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("MXN"),

    method: merchantPaymentMethod("method"),
    status: merchantPaymentStatus("status").notNull().default("created"),

    externalPaymentIntentId: varchar("external_payment_intent_id", { length: 120 }),
    receiptUrl: text("receipt_url"),

    ...timestamps,
  },
  (table) => [
    index("merchant_payments_company_idx").on(table.companyId, table.createdAt),
    uniqueIndex("merchant_payments_intent_unique")
      .on(table.externalPaymentIntentId)
      .where(sql`external_payment_intent_id IS NOT NULL`),
  ],
)

// ─── Relaciones ──────────────────────────────────────────────────────────────

export const companySubscriptionsRelations = relations(companySubscriptions, ({ one, many }) => ({
  company: one(companies, { fields: [companySubscriptions.companyId], references: [companies.id] }),
  plan: one(subscriptionPlans, {
    fields: [companySubscriptions.planId],
    references: [subscriptionPlans.id],
  }),
  payments: many(subscriptionPayments),
}))

export const merchantProfilesRelations = relations(merchantProfiles, ({ one, many }) => ({
  company: one(companies, { fields: [merchantProfiles.companyId], references: [companies.id] }),
  address: one(companyAddresses, {
    fields: [merchantProfiles.addressId],
    references: [companyAddresses.id],
  }),
  payments: many(merchantPayments),
}))
