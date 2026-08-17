/**
 * Catálogo de servicios y su habilitación por empresa.
 *
 * Ver `openspec/specs/subscriptions-and-entitlements/spec.md`.
 *
 * Un servicio es uno de los cinco dominios de la plataforma, identificado por su **clave**. La
 * habilitación es una de las tres compuertas de acceso, y es independiente de las otras dos:
 * tener suscripción vigente no implica tener un servicio contratado, y tenerlo no implica permiso.
 */

import { relations } from "drizzle-orm"
import { boolean, index, pgTable, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { primaryId, reference, timestamps } from "./_shared.ts"
import { companies } from "./identity.ts"
import { uploads } from "./media.ts"

export const services = pgTable(
  "services",
  {
    id: primaryId(),

    /** Identificador estable por el que el código comprueba la habilitación. */
    keycode: varchar("keycode", { length: 64 }).notNull(),

    name: varchar("name", { length: 120 }).notNull(),
    description: text("description").notNull().default(""),
    color: varchar("color", { length: 16 }),
    icon: varchar("icon", { length: 64 }),
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),

    /** Fuera de servicio: no se puede habilitar en ninguna empresa nueva. */
    isDisabled: boolean("is_disabled").notNull().default(false),
    /** Sólo visible para administradores de plataforma. */
    isAdminOnly: boolean("is_admin_only").notNull().default(false),
    /** Se muestra en la portada de marketing. */
    isOnLanding: boolean("is_on_landing").notNull().default(false),

    ...timestamps,
  },
  (table) => [uniqueIndex("services_keycode_unique").on(table.keycode)],
)

/**
 * Que una empresa tenga contratado un servicio.
 *
 * Vía hasta la empresa: columna directa.
 *
 * Retirar la habilitación **no elimina los datos** creados bajo el servicio: los deja inaccesibles
 * hasta que vuelva a habilitarse.
 */
export const companyServices = pgTable(
  "company_services",
  {
    id: primaryId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    serviceId: reference("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("company_services_unique").on(table.companyId, table.serviceId),
    index("company_services_company_idx").on(table.companyId),
  ],
)

export const servicesRelations = relations(services, ({ many, one }) => ({
  companies: many(companyServices),
  image: one(uploads, { fields: [services.imageUploadId], references: [uploads.id] }),
}))

export const companyServicesRelations = relations(companyServices, ({ one }) => ({
  company: one(companies, { fields: [companyServices.companyId], references: [companies.id] }),
  service: one(services, { fields: [companyServices.serviceId], references: [services.id] }),
}))
