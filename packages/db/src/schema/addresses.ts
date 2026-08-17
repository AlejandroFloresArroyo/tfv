/**
 * Direcciones de usuario y de empresa.
 *
 * Ver `openspec/specs/addresses/spec.md`.
 *
 * Dos libretas con el mismo comportamiento y distinto dueño, así que comparten sus columnas y
 * difieren sólo en de quién cuelgan. La regla de dirección primaria —como máximo una por libreta—
 * se garantiza con un índice único parcial, no con código de aplicación.
 *
 * La dirección primaria de una empresa importa fuera de aquí: es el origen desde el que se calcula
 * el envío y el domicilio que aparece en la sesión de pago.
 *
 * Vía hasta la empresa: columna directa en las de empresa; ninguna en las de usuario.
 */

import { relations, sql } from "drizzle-orm"
import { boolean, index, numeric, pgTable, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { primaryId, reference, timestamps } from "./_shared.ts"
import { companies, users } from "./identity.ts"

/** Columnas comunes a las dos libretas. */
const addressColumns = {
  /** Nombre con el que el titular la reconoce: «Bodega norte», «Casa». */
  label: varchar("label", { length: 120 }).notNull().default(""),

  street: varchar("street", { length: 200 }).notNull().default(""),
  number: varchar("number", { length: 32 }).notNull().default(""),
  colony: varchar("colony", { length: 120 }).notNull().default(""),
  city: varchar("city", { length: 120 }).notNull().default(""),
  state: varchar("state", { length: 120 }).notNull().default(""),
  country: varchar("country", { length: 120 }).notNull().default("México"),
  countryCode: varchar("country_code", { length: 2 }).notNull().default("MX"),
  postalCode: varchar("postal_code", { length: 16 }).notNull().default(""),

  /** Necesarias para el cálculo de envío por distancia. Sin ellas no se aplica recargo. */
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),

  isPrimary: boolean("is_primary").notNull().default(false),
}

export const userAddresses = pgTable(
  "user_addresses",
  {
    id: primaryId(),
    userId: reference("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...addressColumns,
    ...timestamps,
  },
  (table) => [
    // Como máximo una primaria por libreta, garantizado por el motor.
    uniqueIndex("user_addresses_primary_unique").on(table.userId).where(sql`is_primary = true`),
    index("user_addresses_user_idx").on(table.userId),
  ],
)

export const companyAddresses = pgTable(
  "company_addresses",
  {
    id: primaryId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    ...addressColumns,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("company_addresses_primary_unique")
      .on(table.companyId)
      .where(sql`is_primary = true`),
    index("company_addresses_company_idx").on(table.companyId),
  ],
)

export const userAddressesRelations = relations(userAddresses, ({ one }) => ({
  user: one(users, { fields: [userAddresses.userId], references: [users.id] }),
}))

export const companyAddressesRelations = relations(companyAddresses, ({ one }) => ({
  company: one(companies, { fields: [companyAddresses.companyId], references: [companies.id] }),
}))
