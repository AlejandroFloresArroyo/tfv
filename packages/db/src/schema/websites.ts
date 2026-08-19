/**
 * Sitios públicos y constructor.
 *
 * Ver `openspec/specs/websites`, `site-builder` y `public-storefronts`.
 *
 * Cada sitio se sirve en su propio subdominio, derivado de su identificador legible. La resolución
 * atraviesa **tres compuertas**, y cada fallo tiene su propia página porque el motivo importa: no
 * es lo mismo un sitio que no existe que uno cuya empresa dejó de pagar.
 *
 * El detalle con más consecuencias del constructor: una personalización **programada por fechas**
 * sustituye al tema primario mientras dura y se retira sola. Es lo que permite montar la campaña de
 * diciembre sin que nadie tenga que acordarse de desactivarla en enero.
 *
 * Vía hasta la empresa: columna directa.
 */

import type { Section } from "@tfv/contracts/sections"
import { relations, sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { legacyId, primaryId, reference, softDelete, timestamps } from "./_shared.ts"
import { globalCategories } from "./categories.ts"
import { companies } from "./identity.ts"
import { uploads } from "./media.ts"
import { pixitStores } from "./pixit.ts"
import { warehouses } from "./warehouses.ts"

export const websites = pgTable(
  "websites",
  {
    id: primaryId(),
    legacyId: legacyId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),

    /**
     * El identificador legible **es** el subdominio. Único en toda la plataforma, no por empresa.
     */
    slug: varchar("slug", { length: 200 }).notNull(),
    isPublished: boolean("is_published").notNull().default(false),

    /** La vertical del sitio, que determina qué páginas se sirven. */
    categoryId: reference("category_id").references(() => globalCategories.id, {
      onDelete: "set null",
    }),

    /** La fuente del catálogo. Sólo una de las dos, según la vertical. */
    warehouseId: reference("warehouse_id").references(() => warehouses.id, {
      onDelete: "set null",
    }),
    pixitStoreId: reference("pixit_store_id").references(() => pixitStores.id, {
      onDelete: "set null",
    }),

    logoUploadId: reference("logo_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    iconUploadId: reference("icon_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("websites_slug_unique").on(table.slug).where(sql`deleted_at IS NULL`),
    uniqueIndex("websites_legacy_unique").on(table.legacyId).where(sql`deleted_at IS NULL`),
    index("websites_company_idx").on(table.companyId),
  ],
)

/**
 * La forma del contenido de una sección **no se declara aquí**: se importa de
 * `@tfv/contracts/sections`, donde vive junto a las reglas que la gobiernan.
 *
 * Escrita dos veces —una en el esquema y otra en los contratos— las dos coincidirían hasta el día
 * en que alguien añadiera un campo en una sola, y el desajuste se vería como un dato que se guarda
 * y no se pinta. El tipo de una columna `jsonb` sólo existe en TypeScript, así que traerlo de allí
 * no cuesta ninguna migración.
 */
export type { SectionButton, SectionItem } from "@tfv/contracts/sections"

/** Un bloque de la página. `kind` es del catálogo cerrado; uno desconocido se omite al renderizar. */
export type CustomizationSection = Section

/**
 * Un tema completo del sitio: color, banner y lista ordenada de secciones.
 *
 * Una es la primaria; las demás pueden programarse por fechas y la sustituyen mientras estén
 * vigentes.
 */
export const websiteCustomizations = pgTable(
  "website_customizations",
  {
    id: primaryId(),
    websiteId: reference("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 200 }).notNull(),
    color: varchar("color", { length: 16 }).notNull().default("#000000"),
    bannerUploadId: reference("banner_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),

    isPrimary: boolean("is_primary").notNull().default(false),
    /** Ventana de vigencia. Fuera de ella vuelve el tema primario, sin que nadie intervenga. */
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),

    sections: jsonb("sections").$type<CustomizationSection[]>().notNull().default([]),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    // Como máximo una primaria por sitio.
    uniqueIndex("website_customizations_primary_unique")
      .on(table.websiteId)
      .where(sql`is_primary = true AND deleted_at IS NULL`),
    // La resolución de la vigente busca por aquí.
    index("website_customizations_window_idx").on(table.websiteId, table.startsAt, table.endsAt),
  ],
)

export const websitesRelations = relations(websites, ({ one, many }) => ({
  company: one(companies, { fields: [websites.companyId], references: [companies.id] }),
  category: one(globalCategories, {
    fields: [websites.categoryId],
    references: [globalCategories.id],
  }),
  warehouse: one(warehouses, { fields: [websites.warehouseId], references: [warehouses.id] }),
  pixitStore: one(pixitStores, { fields: [websites.pixitStoreId], references: [pixitStores.id] }),
  customizations: many(websiteCustomizations),
}))

export const websiteCustomizationsRelations = relations(websiteCustomizations, ({ one }) => ({
  website: one(websites, { fields: [websiteCustomizations.websiteId], references: [websites.id] }),
}))
