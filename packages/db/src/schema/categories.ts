/**
 * Taxonomía global y la forma común de los tres árboles.
 *
 * Ver `openspec/specs/category-trees/spec.md`.
 *
 * Hay tres taxonomías jerárquicas con el mismo comportamiento y distinto alcance: la global, la de
 * cada almacén y la de cada producción. Comparten sus columnas —que viven aquí— y son **tablas
 * distintas** porque cuelgan de padres distintos y los productos referencian una en concreto.
 *
 * Una sola tabla con tres columnas de alcance anulables ahorraría dos tablas a cambio de perder
 * las claves foráneas tipadas y necesitar restricciones de comprobación para que no se mezclen.
 * No compensa.
 *
 * El árbol se recorre por `parentId`. Filtrar por una categoría incluye **todas sus
 * descendientes**, lo que se resuelve con una consulta recursiva en la capa de datos.
 */

import { relations } from "drizzle-orm"
import { foreignKey, index, pgTable, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { primaryId, reference, timestamps } from "./_shared.ts"
import { uploads } from "./media.ts"
import { services } from "./services.ts"

/** Columnas comunes a las tres taxonomías. */
export const categoryColumns = {
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description").notNull().default(""),
  /** Identificador legible, único dentro de su alcance. */
  slug: varchar("slug", { length: 180 }),
  color: varchar("color", { length: 16 }),
  icon: varchar("icon", { length: 64 }),
  imageUploadId: reference("image_upload_id").references(() => uploads.id, {
    onDelete: "set null",
  }),
}

/**
 * Taxonomía global de la plataforma.
 *
 * La gestionan sólo administradores de plataforma. Clasifica sectores de empresa, tipos de
 * locación, amenidades y verticales de sitio, así que cada rama se asocia al servicio al que
 * pertenece para que cada uno ofrezca sólo las suyas.
 *
 * Vía hasta la empresa: ninguna. Es común a toda la plataforma.
 */
export const globalCategories = pgTable(
  "global_categories",
  {
    id: primaryId(),
    parentId: reference("parent_id"),
    /** A qué servicio pertenece esta rama, para no ofrecer categorías ajenas. */
    serviceId: reference("service_id").references(() => services.id, { onDelete: "set null" }),
    /** Clave estable para referenciar una categoría desde el código, como la vertical de un sitio. */
    keyname: varchar("keyname", { length: 64 }),
    ...categoryColumns,
    ...timestamps,
  },
  (table) => [
    /**
     * Autorreferencia del árbol.
     *
     * En cascada: eliminar una categoría elimina todas sus descendientes, que es exactamente lo
     * que exige la spec. Lo garantiza el motor, así que no hace falta recorrer el subárbol a mano
     * —que es donde la pila anterior se equivocaba—.
     */
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "global_categories_parent_fk",
    }).onDelete("cascade"),
    uniqueIndex("global_categories_slug_unique").on(table.slug),
    uniqueIndex("global_categories_keyname_unique").on(table.keyname),
    index("global_categories_parent_idx").on(table.parentId, table.name),
    index("global_categories_service_idx").on(table.serviceId),
  ],
)

export const globalCategoriesRelations = relations(globalCategories, ({ one, many }) => ({
  parent: one(globalCategories, {
    fields: [globalCategories.parentId],
    references: [globalCategories.id],
    relationName: "global_category_tree",
  }),
  children: many(globalCategories, { relationName: "global_category_tree" }),
  service: one(services, { fields: [globalCategories.serviceId], references: [services.id] }),
  image: one(uploads, { fields: [globalCategories.imageUploadId], references: [uploads.id] }),
}))
