/**
 * Pixit: catálogo, inventario por movimientos y punto de venta.
 *
 * Ver `openspec/specs/pixit-catalog`, `pixit-inventory-ledger`, `mosaic-generation`
 * y `pixit-point-of-sale`.
 *
 * Un mosaico es la foto de un cliente convertida en arte de ladrillos:
 *
 * ```
 * tamaño de tablero = cuántas LÁMINAS de ancho por alto
 * lámina            = cuántos LADRILLOS de ancho por alto
 * ```
 *
 * El inventario se lleva como **libro mayor**: entradas positivas, salidas negativas, y la
 * existencia es la suma. Nada se modifica y nada se borra. Es un modelo distinto al de los
 * almacenes —donde una fila es un objeto físico— y es el correcto aquí: los ladrillos son
 * fungibles y se manejan por miles.
 *
 * Vía hasta la empresa: tienda → empresa.
 */

import { relations, sql } from "drizzle-orm"
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import {
  legacyId,
  money,
  percent,
  primaryId,
  reference,
  softDelete,
  timestamps,
} from "./_shared.ts"
import { companyAddresses } from "./addresses.ts"
import { companies, users } from "./identity.ts"
import { uploads } from "./media.ts"

// ─── Catálogo ────────────────────────────────────────────────────────────────

/** Una línea de producto. Define el diseño, no el tamaño. */
export const pixitBoards = pgTable(
  "pixit_boards",
  {
    id: primaryId(),
    name: varchar("name", { length: 200 }).notNull(),
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index("pixit_boards_name_idx").on(table.name)],
)

/** Cuántas láminas de ancho por alto. **Aquí vive el precio.** */
export const pixitBoardSizes = pgTable(
  "pixit_board_sizes",
  {
    id: primaryId(),
    boardId: reference("board_id")
      .notNull()
      .references(() => pixitBoards.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 160 }).notNull(),
    abbreviation: varchar("abbreviation", { length: 32 }),
    description: text("description").notNull().default(""),
    price: money("price").notNull().default("0"),

    /** Láminas por eje. Al menos una. */
    sheetsX: integer("sheets_x").notNull(),
    sheetsY: integer("sheets_y").notNull(),

    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    check("pixit_board_sizes_positive", sql`sheets_x >= 1 AND sheets_y >= 1`),
    index("pixit_board_sizes_board_idx").on(table.boardId),
  ],
)

/** La placa base. Sus ejes son cuántos **ladrillos** caben. */
export const pixitSheets = pgTable(
  "pixit_sheets",
  {
    id: primaryId(),
    name: varchar("name", { length: 160 }).notNull(),
    price: money("price").notNull().default("0"),
    bricksX: integer("bricks_x").notNull(),
    bricksY: integer("bricks_y").notNull(),
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    check("pixit_sheets_positive", sql`bricks_x >= 1 AND bricks_y >= 1`),
    index("pixit_sheets_size_idx").on(table.bricksX, table.bricksY),
  ],
)

/** Un color de la paleta. Su valor cromático es lo que usa la cuantización. */
export const pixitColors = pgTable(
  "pixit_colors",
  {
    id: primaryId(),
    name: varchar("name", { length: 160 }).notNull(),
    /** Valor cromático en notación hexadecimal, con almohadilla. */
    hex: varchar("hex", { length: 7 }).notNull(),
    price: money("price").notNull().default("0"),
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    check("pixit_colors_hex_format", sql`hex ~ '^#[0-9A-Fa-f]{6}$'`),
    index("pixit_colors_name_idx").on(table.name),
  ],
)

/** Fondo para previsualizar el mosaico colgado en una pared. */
export const pixitRooms = pgTable(
  "pixit_rooms",
  {
    id: primaryId(),
    name: varchar("name", { length: 160 }).notNull(),
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    positionX: percent("position_x").notNull().default("50"),
    positionY: percent("position_y").notNull().default("50"),
    scale: percent("scale").notNull().default("1"),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index("pixit_rooms_name_idx").on(table.name)],
)

/** Términos y condiciones por idioma. Aparecen en el recibo. */
export const pixitTerms = pgTable(
  "pixit_terms",
  {
    id: primaryId(),
    languageCode: varchar("language_code", { length: 8 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    title: varchar("title", { length: 200 }).notNull().default(""),
    body: text("body").notNull().default(""),
    flagUrl: text("flag_url"),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("pixit_terms_language_unique")
      .on(table.languageCode)
      .where(sql`deleted_at IS NULL`),
  ],
)

// ─── Tiendas y mercancía ─────────────────────────────────────────────────────

export const pixitStores = pgTable(
  "pixit_stores",
  {
    id: primaryId(),
    legacyId: legacyId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    currency: varchar("currency", { length: 3 }).notNull().default("MXN"),
    addressId: reference("address_id").references(() => companyAddresses.id, {
      onDelete: "set null",
    }),
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),

    /** Piezas por bolsa. Configuración por tienda, no constante del código. */
    piecesPerBag: integer("pieces_per_bag").notNull().default(6),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(10),

    slug: varchar("slug", { length: 220 }),
    isPublished: boolean("is_published").notNull().default(false),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    check("pixit_stores_pieces_positive", sql`pieces_per_bag >= 1`),
    uniqueIndex("pixit_stores_slug_unique").on(table.slug).where(sql`deleted_at IS NULL`),
    index("pixit_stores_company_idx").on(table.companyId),
  ],
)

/** Mercancía suelta, no mosaicos. Lo único de Pixit con contador escalar de existencia. */
export const pixitProducts = pgTable(
  "pixit_products",
  {
    id: primaryId(),
    legacyId: legacyId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 250 }).notNull(),
    description: text("description").notNull().default(""),
    price: money("price").notNull().default("0"),
    stock: integer("stock").notNull().default(0),
    discountRate: percent("discount_rate").notNull().default("0"),
    hasDiscount: boolean("has_discount").notNull().default(false),

    slug: varchar("slug", { length: 280 }),
    isPublished: boolean("is_published").notNull().default(false),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("pixit_products_slug_unique").on(table.slug).where(sql`deleted_at IS NULL`),
    index("pixit_products_company_idx").on(table.companyId),
  ],
)

export const pixitProductImages = pgTable(
  "pixit_product_images",
  {
    id: primaryId(),
    productId: reference("product_id")
      .notNull()
      .references(() => pixitProducts.id, { onDelete: "cascade" }),
    uploadId: reference("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("pixit_product_images_unique").on(table.productId, table.uploadId)],
)

// ─── Sesiones y ventas ───────────────────────────────────────────────────────

export const cashSessionStatus = pgEnum("cash_session_status", ["active", "closed"])

export const pixitCashSessions = pgTable(
  "pixit_cash_sessions",
  {
    id: primaryId(),
    storeId: reference("store_id")
      .notNull()
      .references(() => pixitStores.id, { onDelete: "cascade" }),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),

    status: cashSessionStatus("status").notNull().default("active"),
    openingFloat: money("opening_float").notNull().default("0"),
    /** Conteo real al cerrar. Obligatorio para cerrar. */
    countedCash: money("counted_cash"),
    /** Diferencia contra el efectivo esperado. Visible en el historial de la tienda. */
    variance: money("variance"),

    openedAt: timestamp("opened_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),

    ...timestamps,
  },
  (table) => [
    // Una tienda no admite dos cajas abiertas a la vez.
    uniqueIndex("pixit_cash_sessions_active_unique")
      .on(table.storeId)
      .where(sql`status = 'active'`),
    index("pixit_cash_sessions_store_idx").on(table.storeId, table.openedAt),
  ],
)

export const salePaymentMethod = pgEnum("sale_payment_method", [
  "cash",
  "card",
  "transfer",
  "mixed",
])

export const pixitSales = pgTable(
  "pixit_sales",
  {
    id: primaryId(),
    storeId: reference("store_id")
      .notNull()
      .references(() => pixitStores.id, { onDelete: "cascade" }),
    sessionId: reference("session_id").references(() => pixitCashSessions.id, {
      onDelete: "set null",
    }),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),

    code: varchar("code", { length: 64 }).notNull(),
    method: salePaymentMethod("method").notNull().default("cash"),
    currency: varchar("currency", { length: 3 }).notNull().default("MXN"),

    subtotal: money("subtotal").notNull().default("0"),
    discount: money("discount").notNull().default("0"),
    tax: money("tax").notNull().default("0"),
    total: money("total").notNull().default("0"),
    /** Sólo en efectivo: lo recibido y el cambio devuelto. */
    received: money("received"),
    change: money("change"),

    /** Una venta anulada deja de contar en los totales de su sesión. */
    voidedAt: timestamp("voided_at", { withTimezone: true, mode: "date" }),
    voidedById: reference("voided_by_id").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("pixit_sales_code_unique").on(table.code),
    index("pixit_sales_session_idx").on(table.sessionId),
    index("pixit_sales_store_idx").on(table.storeId, table.createdAt),
  ],
)

// ─── Inventario por movimientos ──────────────────────────────────────────────

/** Qué maneja la tienda. El discriminador evita triplicar tablas idénticas. */
export const inventoryKind = pgEnum("pixit_inventory_kind", ["board_size", "sheet", "brick"])

/**
 * Que una tienda maneja cierto artículo del catálogo, y a qué precio.
 *
 * Una sola tabla con discriminador en lugar de tres idénticas: las tres tienen los mismos campos y
 * el mismo comportamiento, y triplicarlas obligaría a triplicar cada consulta de existencia.
 */
export const pixitInventoryDefinitions = pgTable(
  "pixit_inventory_definitions",
  {
    id: primaryId(),
    storeId: reference("store_id")
      .notNull()
      .references(() => pixitStores.id, { onDelete: "cascade" }),

    kind: inventoryKind("kind").notNull(),
    /** Al tamaño de tablero, a la lámina o al color, según el tipo. */
    catalogRefId: reference("catalog_ref_id").notNull(),

    price: money("price").notNull().default("0"),
    lowStockThreshold: integer("low_stock_threshold"),
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    slug: varchar("slug", { length: 220 }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("pixit_inventory_definitions_unique")
      .on(table.storeId, table.kind, table.catalogRefId)
      .where(sql`deleted_at IS NULL`),
    index("pixit_inventory_definitions_store_idx").on(table.storeId, table.kind),
  ],
)

/**
 * El libro. **Sólo se anexa.**
 *
 * Los movimientos hacen doble trabajo: llevan el saldo **y** describen la estructura de un mosaico
 * vendido. Un movimiento de tablero enlaza con los de sus láminas, y cada uno con los de sus
 * ladrillos; ese árbol es exactamente lo que recorre el instructivo de armado.
 *
 * Corregir un error es registrar un asiento compensatorio, igual que en contabilidad. Anular una
 * venta **borrando** sus movimientos —lo que hacía la pila anterior— destruye el libro
 * (`DEFECTS.md` F-10).
 */
export const pixitInventoryMovements = pgTable(
  "pixit_inventory_movements",
  {
    id: primaryId(),
    definitionId: reference("definition_id")
      .notNull()
      .references(() => pixitInventoryDefinitions.id, { onDelete: "restrict" }),

    /** Positivo entrada, negativo salida. En ladrillos son **bolsas**. */
    quantity: integer("quantity").notNull(),
    /** Sólo ladrillos: piezas sueltas. Mismo signo que las bolsas. */
    pieces: integer("pieces"),

    /** La venta que lo originó, cuando la hubo. */
    saleId: reference("sale_id").references(() => pixitSales.id, { onDelete: "restrict" }),

    /** Estructura del mosaico: lámina → tablero, ladrillo → lámina. */
    parentMovementId: reference("parent_movement_id"),
    /** Orden de montaje de la lámina dentro del tablero. */
    position: integer("position"),
    /** Imagen generada de la lámina. Es el producto que el cliente compró. */
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),

    /** El asiento que este compensa. Un movimiento se compensa como máximo una vez. */
    compensatesMovementId: reference("compensates_movement_id"),

    /** Existencia negativa, autorizada de forma explícita y señalada como incidencia. */
    authorizedNegative: boolean("authorized_negative").notNull().default(false),

    actorId: reference("actor_id").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.parentMovementId],
      foreignColumns: [table.id],
      name: "pixit_inventory_movements_parent_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.compensatesMovementId],
      foreignColumns: [table.id],
      name: "pixit_inventory_movements_compensates_fk",
    }).onDelete("restrict"),
    // Anular dos veces es imposible a nivel de base, no sólo improbable.
    uniqueIndex("pixit_inventory_movements_compensates_unique")
      .on(table.compensatesMovementId)
      .where(sql`compensates_movement_id IS NOT NULL`),
    // Bolsas y piezas con el mismo signo; las piezas sólo en ladrillos.
    check(
      "pixit_inventory_movements_signs",
      sql`pieces IS NULL OR sign(quantity) = sign(pieces) OR quantity = 0`,
    ),
    index("pixit_inventory_movements_definition_idx").on(table.definitionId),
    index("pixit_inventory_movements_sale_idx").on(table.saleId),
    index("pixit_inventory_movements_tree_idx").on(table.parentMovementId, table.position),
  ],
)

// ─── Relaciones ──────────────────────────────────────────────────────────────

export const pixitStoresRelations = relations(pixitStores, ({ one, many }) => ({
  company: one(companies, { fields: [pixitStores.companyId], references: [companies.id] }),
  definitions: many(pixitInventoryDefinitions),
  sessions: many(pixitCashSessions),
  sales: many(pixitSales),
}))

export const pixitSalesRelations = relations(pixitSales, ({ one, many }) => ({
  store: one(pixitStores, { fields: [pixitSales.storeId], references: [pixitStores.id] }),
  session: one(pixitCashSessions, {
    fields: [pixitSales.sessionId],
    references: [pixitCashSessions.id],
  }),
  movements: many(pixitInventoryMovements),
}))

export const pixitInventoryDefinitionsRelations = relations(
  pixitInventoryDefinitions,
  ({ one, many }) => ({
    store: one(pixitStores, {
      fields: [pixitInventoryDefinitions.storeId],
      references: [pixitStores.id],
    }),
    movements: many(pixitInventoryMovements),
  }),
)

export const pixitBoardsRelations = relations(pixitBoards, ({ many }) => ({
  sizes: many(pixitBoardSizes),
}))
