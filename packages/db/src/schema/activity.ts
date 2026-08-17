/**
 * Bitácora de actividad y entrega de notificaciones.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md`.
 *
 * El asiento y la notificación son la misma carga útil vista desde dos ángulos. Se escriben en la
 * **misma transacción que la mutación** que los origina —si la mutación se revierte, el asiento no
 * existe— mientras que la entrega se encola aparte, para que un fallo del proveedor no tumbe una
 * operación de negocio.
 *
 * La bitácora es de sólo anexado. Igual que el libro de Pixit, se protege revocando el permiso de
 * modificación y borrado sobre la tabla, no por convención de código.
 *
 * Vía hasta la empresa: columna directa.
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
import { primaryId, reference, timestamps } from "./_shared.ts"
import { companies, users } from "./identity.ts"
import { services } from "./services.ts"

export const activityAction = pgEnum("activity_action", ["create", "update", "delete"])

export const activityOrigin = pgEnum("activity_origin", [
  "web",
  "mobile",
  "api",
  "integration",
  "automation",
  "system",
  "other",
])

export const companyActivities = pgTable(
  "company_activities",
  {
    id: primaryId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    serviceId: reference("service_id").references(() => services.id, { onDelete: "set null" }),

    action: activityAction("action").notNull(),
    /** La tabla afectada, para poder filtrar por tipo de entidad. */
    entity: varchar("entity", { length: 80 }).notNull(),
    entityId: reference("entity_id"),
    /** Etiqueta legible que identifica la entidad sin tener que abrirla. */
    entityLabel: varchar("entity_label", { length: 200 }).notNull().default(""),

    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    /** Referencia navegable a la entidad afectada. */
    url: text("url").notNull().default("/"),

    origin: activityOrigin("origin").notNull().default("web"),
    /** El permiso que selecciona la audiencia. Es el mismo que autoriza la acción. */
    permission: varchar("permission", { length: 120 }),

    performedById: reference("performed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Verdadero cuando quien actuó lo hizo como administrador de plataforma sobre empresa ajena. */
    performedAsPlatformAdmin: boolean("performed_as_platform_admin").notNull().default(false),

    ...timestamps,
  },
  (table) => [
    index("company_activities_company_idx").on(table.companyId, table.createdAt),
    index("company_activities_actor_idx").on(table.performedById, table.createdAt),
    index("company_activities_service_idx").on(table.companyId, table.serviceId, table.createdAt),
    index("company_activities_entity_idx").on(table.entity, table.entityId),
  ],
)

// ─── Entrega ─────────────────────────────────────────────────────────────────

export const deliveryChannel = pgEnum("delivery_channel", ["inbox", "push", "email"])

export const deliveryStatus = pgEnum("delivery_status", [
  "queued",
  "sent",
  "failed",
  "skipped_by_preference",
])

/**
 * Cola de entrega.
 *
 * Asíncrona respecto de la mutación: se encola dentro de la transacción y se envía después. Un
 * fallo del proveedor deja la fila en `failed` para reintentar, y no hace fallar la operación de
 * negocio.
 */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: primaryId(),
    activityId: reference("activity_id").references(() => companyActivities.id, {
      onDelete: "cascade",
    }),

    recipientId: reference("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: deliveryChannel("channel").notNull(),
    /** Tipo de notificación, del catálogo de la spec: bienvenida, factura cobrada, actividad… */
    kind: varchar("kind", { length: 80 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),

    status: deliveryStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),

    ...timestamps,
  },
  (table) => [
    index("notification_deliveries_pending_idx").on(table.createdAt).where(sql`status = 'queued'`),
    index("notification_deliveries_recipient_idx").on(table.recipientId, table.createdAt),
  ],
)

/** Elección de canal por categoría. Lo crítico de cuenta se entrega igual. */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: primaryId(),
    userId: reference("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Categoría de notificación, no tipo concreto. */
    category: varchar("category", { length: 80 }).notNull(),
    channel: deliveryChannel("channel").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("notification_preferences_unique").on(table.userId, table.category, table.channel),
  ],
)

/** Dispositivos registrados para notificación push. Un usuario puede tener varios. */
export const pushDevices = pgTable(
  "push_devices",
  {
    id: primaryId(),
    userId: reference("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    userAgent: text("user_agent"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    // El mismo dispositivo registrado dos veces no duplica.
    uniqueIndex("push_devices_token_unique").on(table.token),
    index("push_devices_user_idx").on(table.userId),
  ],
)

export const companyActivitiesRelations = relations(companyActivities, ({ one, many }) => ({
  company: one(companies, { fields: [companyActivities.companyId], references: [companies.id] }),
  service: one(services, { fields: [companyActivities.serviceId], references: [services.id] }),
  performedBy: one(users, {
    fields: [companyActivities.performedById],
    references: [users.id],
  }),
  deliveries: many(notificationDeliveries),
}))

export const notificationDeliveriesRelations = relations(notificationDeliveries, ({ one }) => ({
  activity: one(companyActivities, {
    fields: [notificationDeliveries.activityId],
    references: [companyActivities.id],
  }),
  recipient: one(users, {
    fields: [notificationDeliveries.recipientId],
    references: [users.id],
  }),
}))
