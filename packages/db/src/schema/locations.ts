/**
 * Directorio de locaciones.
 *
 * Ver `openspec/specs/locations-directory/spec.md`.
 *
 * Un catálogo de espacios donde rodar, agrupados en redes. La ficha es más rica que la de un
 * producto porque quien busca dónde rodar necesita saber cosas muy concretas: si hay
 * estacionamiento, si hay internet y con qué clave, qué actividades se permiten, y qué días y horas
 * está disponible.
 *
 * **Las reservas quedan fuera de alcance** (`openspec/project.md` D-09): existían a medias en la
 * pila anterior —su ruta de actualización nunca llegó a registrarse— y ninguna pantalla las
 * consumía. La contratación se gestiona por contacto directo.
 *
 * Vía hasta la empresa: red → empresa.
 */

import { relations, sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { legacyId, primaryId, reference, softDelete, timestamps } from "./_shared.ts"
import { globalCategories } from "./categories.ts"
import { companies, users } from "./identity.ts"
import { uploads } from "./media.ts"

export const locationNetworks = pgTable(
  "location_networks",
  {
    id: primaryId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index("location_networks_company_idx").on(table.companyId)],
)

/** Disponibilidad de un día de la semana. */
export interface DayAvailability {
  readonly available: boolean
  readonly start?: string
  readonly end?: string
}

/** Tarifa por unidad de tiempo, con su mínimo de contratación. */
export interface LocationRate {
  readonly available: boolean
  readonly price?: string
  readonly minimum?: number
}

/** Lo que el visitante necesita saber para llegar y trabajar en el sitio. */
export interface LocationAmenities {
  readonly arrivalInstructions?: string
  readonly parking?: { available: boolean; instructions?: string; typeIds?: string[] }
  /**
   * La clave se guarda aquí pero **nunca sale en las lecturas públicas**: el visitante ve que hay
   * conexión, no cómo entrar en ella.
   */
  readonly internet?: { available: boolean; networkName?: string; password?: string }
}

export const locations = pgTable(
  "locations",
  {
    id: primaryId(),
    legacyId: legacyId(),
    networkId: reference("network_id")
      .notNull()
      .references(() => locationNetworks.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 250 }).notNull(),
    description: text("description").notNull().default(""),
    address: text("address").notNull().default(""),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),

    capacity: integer("capacity").notNull().default(1),
    areaSize: numeric("area_size", { precision: 10, scale: 2 }),

    categoryId: reference("category_id").references(() => globalCategories.id, {
      onDelete: "set null",
    }),
    typeId: reference("type_id").references(() => globalCategories.id, { onDelete: "set null" }),

    amenities: jsonb("amenities").$type<LocationAmenities>().notNull().default({}),
    /** Lunes a domingo. */
    availability: jsonb("availability")
      .$type<Readonly<Record<string, DayAvailability>>>()
      .notNull()
      .default({}),
    /** Por hora, día, semana y mes. */
    rates: jsonb("rates").$type<Readonly<Record<string, LocationRate>>>().notNull().default({}),

    /** Anotaciones en texto libre, junto a las categorías referenciadas. */
    allowedNote: text("allowed_note"),
    deniedNote: text("denied_note"),
    interiorsNote: text("interiors_note"),
    exteriorsNote: text("exteriors_note"),

    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),

    slug: varchar("slug", { length: 280 }),
    isPublished: boolean("is_published").notNull().default(false),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("locations_slug_unique").on(table.slug).where(sql`deleted_at IS NULL`),
    uniqueIndex("locations_legacy_unique").on(table.legacyId).where(sql`deleted_at IS NULL`),
    index("locations_network_idx").on(table.networkId),
    index("locations_category_idx").on(table.categoryId),
  ],
)

/** Qué actividades, interiores y exteriores ofrece o prohíbe una locación. */
export const locationTags = pgTable(
  "location_tags",
  {
    id: primaryId(),
    locationId: reference("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    categoryId: reference("category_id")
      .notNull()
      .references(() => globalCategories.id, { onDelete: "cascade" }),
    /** `allowed`, `denied`, `interior`, `exterior`, `parking_type`. */
    facet: varchar("facet", { length: 32 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("location_tags_unique").on(table.locationId, table.categoryId, table.facet),
    index("location_tags_location_idx").on(table.locationId, table.facet),
  ],
)

export const locationImages = pgTable(
  "location_images",
  {
    id: primaryId(),
    locationId: reference("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    uploadId: reference("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("location_images_unique").on(table.locationId, table.uploadId)],
)

export const locationNetworksRelations = relations(locationNetworks, ({ one, many }) => ({
  company: one(companies, { fields: [locationNetworks.companyId], references: [companies.id] }),
  locations: many(locations),
}))

export const locationsRelations = relations(locations, ({ one, many }) => ({
  network: one(locationNetworks, {
    fields: [locations.networkId],
    references: [locationNetworks.id],
  }),
  tags: many(locationTags),
  images: many(locationImages),
}))
