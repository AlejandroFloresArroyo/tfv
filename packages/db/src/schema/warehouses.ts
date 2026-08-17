/**
 * Almacenes: establecimiento, ubicaciones, catálogo y existencias.
 *
 * Ver `openspec/specs/warehouses-and-storage`, `warehouse-catalog` y `stock-units`.
 *
 * Tres niveles que conviene no confundir:
 *
 * | Nivel | Qué es | Ejemplo |
 * |---|---|---|
 * | Producto | El artículo del catálogo | «Cámara Sony FX6» |
 * | Medida | La variante mensurable a la que se lleva existencia | «Cuerpo», «Kit con óptica» |
 * | Unidad | Un objeto físico concreto | La cámara con número de serie tal |
 *
 * **Una unidad es una fila.** No un contador: cuando rentas equipo necesitas saber *cuál* de las
 * tres cámaras salió, quién la tiene y en qué estado volvió.
 *
 * Vía hasta la empresa: almacén → empresa. Todo lo demás cuelga del almacén.
 */

import { relations, sql } from "drizzle-orm"
import {
  boolean,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { legacyId, money, primaryId, reference, softDelete, timestamps } from "./_shared.ts"
import { categoryColumns, globalCategories } from "./categories.ts"
import { companies, users } from "./identity.ts"
import { uploads } from "./media.ts"

// ─── Almacén ─────────────────────────────────────────────────────────────────

export const warehouses = pgTable(
  "warehouses",
  {
    id: primaryId(),
    legacyId: legacyId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),

    slug: varchar("slug", { length: 220 }),
    isPublished: boolean("is_published").notNull().default(false),
    priority: numeric("priority", { precision: 7, scale: 4 }).notNull().default("0"),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("warehouses_slug_unique").on(table.slug).where(sql`deleted_at IS NULL`),
    uniqueIndex("warehouses_legacy_unique").on(table.legacyId).where(sql`deleted_at IS NULL`),
    // El listado ordena por prioridad, fecha y nombre.
    index("warehouses_company_idx").on(table.companyId, table.priority, table.createdAt),
  ],
)

// ─── Ubicaciones físicas ─────────────────────────────────────────────────────

/** Del más general al más específico. El código autogenerado usa las tres primeras letras. */
export const storageKind = pgEnum("storage_kind", [
  "floor",
  "area",
  "aisle",
  "section",
  "bay",
  "rack",
  "shelf",
  "pallet",
  "box",
  "bin",
])

/**
 * Árbol de ubicaciones de un almacén.
 *
 * El código —`RCK3`, `BOX12`— es legible porque la gente lo escribe en etiquetas y lo dice en voz
 * alta al buscar algo en la nave. Se regenera **sólo** al cambiar el tipo, nunca al renombrar.
 */
export const warehouseStorages = pgTable(
  "warehouse_storages",
  {
    id: primaryId(),
    warehouseId: reference("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    parentId: reference("parent_id"),

    kind: storageKind("kind").notNull().default("box"),
    /** Autogenerado: clave de tres letras del tipo más un correlativo por almacén. */
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    color: varchar("color", { length: 16 }),
    icon: varchar("icon", { length: 64 }),
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),

    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "warehouse_storages_parent_fk",
    }).onDelete("cascade"),
    uniqueIndex("warehouse_storages_code_unique").on(table.warehouseId, table.code),
    index("warehouse_storages_tree_idx").on(table.warehouseId, table.parentId),
  ],
)

// ─── Categorías del almacén ──────────────────────────────────────────────────

export const warehouseCategories = pgTable(
  "warehouse_categories",
  {
    id: primaryId(),
    warehouseId: reference("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    parentId: reference("parent_id"),
    ...categoryColumns,
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "warehouse_categories_parent_fk",
    }).onDelete("cascade"),
    // El identificador legible es único dentro de su almacén, no de la plataforma.
    uniqueIndex("warehouse_categories_slug_unique").on(table.warehouseId, table.slug),
    index("warehouse_categories_tree_idx").on(table.warehouseId, table.parentId),
  ],
)

// ─── Catálogo ────────────────────────────────────────────────────────────────

/** Cómo se relaciona un producto hijo con su padre. */
export const productRelation = pgEnum("product_relation", ["variant", "accessory"])

export const warehouseProducts = pgTable(
  "warehouse_products",
  {
    id: primaryId(),
    legacyId: legacyId(),
    warehouseId: reference("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),

    /** Variantes y accesorios son productos hijos que heredan la clasificación del padre. */
    parentId: reference("parent_id"),
    relationToParent: productRelation("relation_to_parent"),

    name: varchar("name", { length: 250 }).notNull(),
    description: text("description").notNull().default(""),
    /** Código interno de la empresa, no necesariamente único. */
    internalCode: varchar("internal_code", { length: 80 }),
    /** Código identificativo único e inmutable, apto para etiqueta. */
    code: varchar("code", { length: 64 }).notNull(),

    cost: money("cost").notNull().default("0"),
    /** Precio de referencia, usado cuando no hay tarifa en lista. */
    price: money("price").notNull().default("0"),
    usesPriceLists: boolean("uses_price_lists").notNull().default(false),

    availableForSale: boolean("available_for_sale").notNull().default(false),
    availableForRent: boolean("available_for_rent").notNull().default(false),

    storageId: reference("storage_id").references(() => warehouseStorages.id, {
      onDelete: "set null",
    }),
    categoryId: reference("category_id").references(() => warehouseCategories.id, {
      onDelete: "set null",
    }),
    /** Clasificación global, para agregaciones entre empresas. */
    globalCategoryId: reference("global_category_id").references(() => globalCategories.id, {
      onDelete: "set null",
    }),

    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),

    slug: varchar("slug", { length: 280 }),
    isPublished: boolean("is_published").notNull().default(false),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "warehouse_products_parent_fk",
    }).onDelete("cascade"),
    uniqueIndex("warehouse_products_code_unique").on(table.code),
    uniqueIndex("warehouse_products_slug_unique").on(table.slug).where(sql`deleted_at IS NULL`),
    uniqueIndex("warehouse_products_legacy_unique")
      .on(table.legacyId)
      .where(sql`deleted_at IS NULL`),
    // El listado del catálogo muestra sólo los productos raíz.
    index("warehouse_products_root_idx")
      .on(table.warehouseId, table.createdAt)
      .where(sql`parent_id IS NULL AND deleted_at IS NULL`),
    index("warehouse_products_storage_idx").on(table.storageId),
    index("warehouse_products_category_idx").on(table.categoryId),
  ],
)

// ─── Medidas ─────────────────────────────────────────────────────────────────

export const measurementKind = pgEnum("measurement_kind", [
  "box",
  "envelope",
  "clothing",
  "accessory",
  "other",
])

export const lengthUnit = pgEnum("length_unit", ["cm", "m", "in", "ft"])
export const massUnit = pgEnum("mass_unit", ["g", "kg", "lb", "oz"])

/**
 * Ficha de sastrería.
 *
 * Cuarenta y cinco medidas corporales, todas opcionales, porque el mismo sistema que renta cámaras
 * renta vestuario y el vestuario se mide por el cuerpo de quien lo va a llevar. Va como documento
 * porque se lee entera y nunca se consulta por un campo suelto.
 */
export interface ClothingSheet {
  readonly garment?: string | undefined
  readonly size?: string | undefined
  readonly custom?: string | undefined
  readonly measurements?: Readonly<Record<string, number>> | undefined
}

/**
 * Dimensiones y peso, en las unidades que declara la medida.
 *
 * Los campos llevan `| undefined` explícito: con `exactOptionalPropertyTypes`, «ausente» y
 * «presente con valor indefinido» son tipos distintos, y lo que llega de un esquema de ruta es lo
 * segundo. Sin ello, cada llamada tendría que limpiar el objeto antes de escribirlo. Es el mismo
 * caso que la copia de datos de una contraparte.
 */
export interface Dimensions {
  readonly height?: number | undefined
  readonly width?: number | undefined
  readonly length?: number | undefined
  readonly weight?: number | undefined
}

export const warehouseMeasurements = pgTable(
  "warehouse_measurements",
  {
    id: primaryId(),
    productId: reference("product_id")
      .notNull()
      .references(() => warehouseProducts.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 200 }).notNull(),
    kind: measurementKind("kind").notNull().default("box"),

    /** Ajuste sobre el precio resuelto del producto para esta medida. */
    priceDifference: money("price_difference").notNull().default("0"),

    dimensions: jsonb("dimensions").$type<Dimensions>().notNull().default({}),
    lengthUnit: lengthUnit("length_unit").notNull().default("cm"),
    massUnit: massUnit("mass_unit").notNull().default("g"),

    clothing: jsonb("clothing").$type<ClothingSheet>(),

    ...timestamps,
    ...softDelete,
  },
  (table) => [index("warehouse_measurements_product_idx").on(table.productId)],
)

// ─── Unidades de existencia ──────────────────────────────────────────────────

/**
 * Los once estados de una unidad.
 *
 * Los tres primeros son **compromisos reversibles**; el resto son terminales o de incidencia.
 */
export const stockStatus = pgEnum("stock_status", [
  "available",
  "in_quote",
  "in_order",
  "rented",
  "sold",
  "lost",
  "damaged",
  "robbed",
  "incomplete",
  "modified",
  "expense",
])

export const warehouseStockUnits = pgTable(
  "warehouse_stock_units",
  {
    id: primaryId(),
    measurementId: reference("measurement_id")
      .notNull()
      .references(() => warehouseMeasurements.id, { onDelete: "cascade" }),

    /** Código único e inmutable. Se imprime en la etiqueta. */
    code: varchar("code", { length: 64 }).notNull(),
    status: stockStatus("status").notNull().default("available"),

    /**
     * Trazabilidad de la acuñación por reserva.
     *
     * Cuando una unidad se crea porque una cotización pidió más de las que había, queda marcada
     * con la cotización que la motivó. Así el descuadre entre inventario registrado y físico es
     * auditable (`DEFECTS.md` M-04).
     */
    createdByReservation: boolean("created_by_reservation").notNull().default(false),
    /**
     * Sin clave foránea: la cotización pertenece a un módulo que importa a éste, y declararla
     * cerraría un ciclo entre ambos. Es metainformación de auditoría —qué cotización motivó el
     * alta— no una relación estructural: si la cotización desaparece, la marca sigue siendo cierta.
     */
    createdByQuoteId: reference("created_by_quote_id"),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("warehouse_stock_units_code_unique").on(table.code),
    // La consulta de disponibilidad: cuántas unidades hay en cada estado por medida.
    index("warehouse_stock_units_availability_idx")
      .on(table.measurementId, table.status)
      .where(sql`deleted_at IS NULL`),
  ],
)

export const stockEventReason = pgEnum("stock_event_reason", [
  "manual",
  "quote_reservation",
  "quote_release",
  "quote_status",
  "order",
  "storefront_sale",
  "rental_return",
  "created",
])

/**
 * Historial de estado por unidad.
 *
 * Permite reconstruir la vida de una unidad: quién la movió, cuándo y por qué. No existía en la
 * pila anterior, donde sólo se conocía el estado final.
 */
export const warehouseStockEvents = pgTable(
  "warehouse_stock_events",
  {
    id: primaryId(),
    stockUnitId: reference("stock_unit_id")
      .notNull()
      .references(() => warehouseStockUnits.id, { onDelete: "cascade" }),

    fromStatus: stockStatus("from_status"),
    toStatus: stockStatus("to_status").notNull(),
    reason: stockEventReason("reason").notNull(),

    actorId: reference("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** La cotización o el pedido que causó el cambio, cuando lo hubo. */
    causeId: reference("cause_id"),
    note: text("note"),

    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("warehouse_stock_events_unit_idx").on(table.stockUnitId, table.occurredAt)],
)

// ─── Precios ─────────────────────────────────────────────────────────────────

export const warehousePriceLists = pgTable(
  "warehouse_price_lists",
  {
    id: primaryId(),
    warehouseId: reference("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index("warehouse_price_lists_warehouse_idx").on(table.warehouseId)],
)

/**
 * Tarifa de renta o de penalización: fija, o distinta por periodicidad.
 *
 * Con `| undefined` explícito por lo mismo que las dimensiones y la copia de una contraparte: lo
 * que llega de un esquema de ruta es «presente con valor indefinido», no «ausente».
 */
export interface RateSchedule {
  readonly isFixed: boolean
  readonly fixed?: string | undefined
  readonly daily?: string | undefined
  readonly weekly?: string | undefined
  readonly monthly?: string | undefined
}

/** El precio de un producto dentro de una lista. */
export const warehouseProductPrices = pgTable(
  "warehouse_product_prices",
  {
    id: primaryId(),
    priceListId: reference("price_list_id")
      .notNull()
      .references(() => warehousePriceLists.id, { onDelete: "cascade" }),
    productId: reference("product_id")
      .notNull()
      .references(() => warehouseProducts.id, { onDelete: "cascade" }),

    sale: money("sale").notNull().default("0"),
    rent: jsonb("rent").$type<RateSchedule>().notNull().default({ isFixed: false }),
    penalty: jsonb("penalty").$type<RateSchedule>().notNull().default({ isFixed: false }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("warehouse_product_prices_unique").on(table.priceListId, table.productId),
    index("warehouse_product_prices_product_idx").on(table.productId),
  ],
)

// ─── Relaciones ──────────────────────────────────────────────────────────────

export const warehousesRelations = relations(warehouses, ({ one, many }) => ({
  company: one(companies, { fields: [warehouses.companyId], references: [companies.id] }),
  storages: many(warehouseStorages),
  categories: many(warehouseCategories),
  products: many(warehouseProducts),
  priceLists: many(warehousePriceLists),
}))

export const warehouseProductsRelations = relations(warehouseProducts, ({ one, many }) => ({
  warehouse: one(warehouses, {
    fields: [warehouseProducts.warehouseId],
    references: [warehouses.id],
  }),
  parent: one(warehouseProducts, {
    fields: [warehouseProducts.parentId],
    references: [warehouseProducts.id],
    relationName: "warehouse_product_tree",
  }),
  children: many(warehouseProducts, { relationName: "warehouse_product_tree" }),
  storage: one(warehouseStorages, {
    fields: [warehouseProducts.storageId],
    references: [warehouseStorages.id],
  }),
  category: one(warehouseCategories, {
    fields: [warehouseProducts.categoryId],
    references: [warehouseCategories.id],
  }),
  measurements: many(warehouseMeasurements),
  prices: many(warehouseProductPrices),
}))

export const warehouseMeasurementsRelations = relations(warehouseMeasurements, ({ one, many }) => ({
  product: one(warehouseProducts, {
    fields: [warehouseMeasurements.productId],
    references: [warehouseProducts.id],
  }),
  units: many(warehouseStockUnits),
}))

export const warehouseStockUnitsRelations = relations(warehouseStockUnits, ({ one, many }) => ({
  measurement: one(warehouseMeasurements, {
    fields: [warehouseStockUnits.measurementId],
    references: [warehouseMeasurements.id],
  }),
  events: many(warehouseStockEvents),
}))
