/**
 * Operación de producciones: compras, inventario, entregas y planes de trabajo.
 *
 * Ver `openspec/specs/production-procurement`, `production-inventory`, `production-workflows`
 * y `production-budget`.
 *
 * Aquí vive la integración más acoplada del sistema: una **orden de compra** de una producción se
 * abre en un pedido por cada almacén implicado, y esos almacenes pertenecen a **otras empresas**.
 * La orden vive en este lado; los pedidos, en el del almacén.
 *
 * El presupuesto no es una entidad: es la resta entre las anclas —lo previsto— y las compras —lo
 * ejecutado—. No hay nada que guardar ni que mantener sincronizado.
 *
 * Vía hasta la empresa: producción → empresa.
 */

import { relations, sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { legacyId, money, primaryId, reference, softDelete, timestamps } from "./_shared.ts"
import { companyAddresses } from "./addresses.ts"
import { counterparties } from "./counterparties.ts"
import { users } from "./identity.ts"
import { uploads } from "./media.ts"
import {
  productionCategories,
  productionCharacters,
  productionContinuities,
  productionScenes,
  productions,
  productionVideos,
} from "./productions.ts"
import { warehouseMeasurements } from "./warehouses.ts"

// ─── Compras a almacenes ─────────────────────────────────────────────────────

export const purchaseOrderStatus = pgEnum("purchase_order_status", ["open", "settled", "canceled"])

/**
 * Orden de compra de una producción.
 *
 * **No es ejecutable por sí sola.** Al crearla, el sistema resuelve a qué almacén pertenece cada
 * línea y abre un pedido por almacén, dando de alta la relación comercial en ambos sentidos.
 */
export const productionPurchaseOrders = pgTable(
  "production_purchase_orders",
  {
    id: primaryId(),
    productionId: reference("production_id")
      .notNull()
      .references(() => productions.id, { onDelete: "cascade" }),

    /** Inmutable. La pila anterior lo regeneraba en cada listado (`DEFECTS.md` L-05). */
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 250 }).notNull().default(""),

    type: varchar("type", { length: 8 }).notNull().default("sale"),
    status: purchaseOrderStatus("status").notNull().default("open"),

    categoryId: reference("category_id").references(() => productionCategories.id, {
      onDelete: "set null",
    }),
    deliveryAddressId: reference("delivery_address_id").references(() => companyAddresses.id, {
      onDelete: "set null",
    }),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),

    canceledAt: timestamp("canceled_at", { withTimezone: true, mode: "date" }),
    canceledById: reference("canceled_by_id").references(() => users.id, { onDelete: "set null" }),
    cancelReason: text("cancel_reason"),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("production_purchase_orders_code_unique").on(table.code),
    index("production_purchase_orders_production_idx").on(table.productionId, table.createdAt),
  ],
)

export const productionPurchaseOrderLines = pgTable(
  "production_purchase_order_lines",
  {
    id: primaryId(),
    purchaseOrderId: reference("purchase_order_id")
      .notNull()
      .references(() => productionPurchaseOrders.id, { onDelete: "cascade" }),
    measurementId: reference("measurement_id")
      .notNull()
      .references(() => warehouseMeasurements.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    ...timestamps,
  },
  (table) => [index("production_purchase_order_lines_order_idx").on(table.purchaseOrderId)],
)

// ─── Presupuesto ─────────────────────────────────────────────────────────────

/** Partida presupuestada: lo previsto. */
export const productionAnchors = pgTable(
  "production_anchors",
  {
    id: primaryId(),
    productionId: reference("production_id")
      .notNull()
      .references(() => productions.id, { onDelete: "cascade" }),
    categoryId: reference("category_id").references(() => productionCategories.id, {
      onDelete: "set null",
    }),

    name: varchar("name", { length: 250 }).notNull(),
    description: text("description").notNull().default(""),
    amount: money("amount").notNull(),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [index("production_anchors_production_idx").on(table.productionId)],
)

export const shoppingKind = pgEnum("shopping_kind", [
  "shopping",
  "expense",
  "payment",
  "rent",
  "transfer",
])

export const shoppingMethod = pgEnum("shopping_method", ["cash", "card", "transfer"])

/**
 * Gasto realizado: lo ejecutado.
 *
 * Llega por dos vías: registrado a mano, o generado al liquidar una compra a un almacén — que es
 * lo que hace que el presupuesto se mueva sin que nadie lo anote.
 */
export const productionShoppings = pgTable(
  "production_shoppings",
  {
    id: primaryId(),
    productionId: reference("production_id")
      .notNull()
      .references(() => productions.id, { onDelete: "cascade" }),
    categoryId: reference("category_id").references(() => productionCategories.id, {
      onDelete: "set null",
    }),
    providerId: reference("provider_id").references(() => counterparties.id, {
      onDelete: "set null",
    }),
    /**
     * El pedido de almacén cuya liquidación generó esta compra.
     *
     * Sin clave foránea: el pedido pertenece a otra empresa y a un módulo que importa a éste. Es
     * una referencia de trazabilidad entre arrendatarios, no una relación de propiedad.
     */
    warehouseOrderId: reference("warehouse_order_id"),

    name: varchar("name", { length: 250 }).notNull(),
    observations: text("observations").notNull().default(""),
    amount: money("amount").notNull().default("0"),
    kind: shoppingKind("kind").notNull().default("shopping"),
    method: shoppingMethod("method").notNull().default("cash"),
    /** Identificación parcial de la tarjeta. Nunca el número completo. */
    cardLast4: varchar("card_last4", { length: 4 }),
    isDeductible: boolean("is_deductible").notNull().default(false),

    occurredOn: timestamp("occurred_on", { withTimezone: true, mode: "date" }),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("production_shoppings_production_idx").on(table.productionId, table.occurredOn),
  ],
)

// ─── Inventario ──────────────────────────────────────────────────────────────

export const productionItemStatus = pgEnum("production_item_status", [
  "available",
  "stored",
  "delivered",
  "returned",
  "damaged",
  "incomplete",
  "lost",
  "robbed",
])

/** Un objeto físico del inventario de la producción, con su etiqueta. */
export const productionItems = pgTable(
  "production_items",
  {
    id: primaryId(),
    legacyId: legacyId(),
    productionId: reference("production_id")
      .notNull()
      .references(() => productions.id, { onDelete: "cascade" }),
    categoryId: reference("category_id").references(() => productionCategories.id, {
      onDelete: "set null",
    }),
    /** Un artículo pertenece como máximo a **una** compra. */
    shoppingId: reference("shopping_id").references(() => productionShoppings.id, {
      onDelete: "set null",
    }),

    name: varchar("name", { length: 250 }).notNull(),
    description: text("description").notNull().default(""),
    code: varchar("code", { length: 64 }).notNull(),
    status: productionItemStatus("status").notNull().default("available"),
    isInventoriable: boolean("is_inventoriable").notNull().default(true),

    slug: varchar("slug", { length: 280 }),
    isPublished: boolean("is_published").notNull().default(false),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("production_items_code_unique").on(table.code),
    index("production_items_production_idx").on(table.productionId, table.status),
    index("production_items_shopping_idx").on(table.shoppingId),
  ],
)

export const productionItemEventReason = pgEnum("production_item_event_reason", [
  "manual",
  "delivery",
  "return",
  "created",
])

/**
 * Historial de estado por artículo.
 *
 * Calcado de `warehouse_stock_events`, y no por parecido superficial: es **el mismo problema**. Un
 * objeto físico cambia de estado en manos de gente distinta, y lo que se pregunta cuando una
 * chamarra vuelve rota no es quién la marcó rota —eso lo diría una columna de atribución— sino
 * dónde estuvo y en qué estado salió de cada sitio. Eso sólo lo contesta el recorrido entero.
 *
 * El almacén ya lo resolvió así. Dos modelos distintos para «el objeto cambió de estado» es la
 * asimetría que después cuesta el doble: dos consultas de historial, dos pantallas, dos formas de
 * explicárselo a quien llega. Cierra `HALLAZGOS.md` H-171.
 *
 * `from_status` es nulo **sólo en el alta**: antes de existir el artículo no estaba en ningún
 * estado, y escribir ahí `available` diría que hubo un cambio que no ocurrió.
 */
export const productionItemEvents = pgTable(
  "production_item_events",
  {
    id: primaryId(),
    itemId: reference("item_id")
      .notNull()
      .references(() => productionItems.id, { onDelete: "cascade" }),

    fromStatus: productionItemStatus("from_status"),
    toStatus: productionItemStatus("to_status").notNull(),
    reason: productionItemEventReason("reason").notNull(),

    actorId: reference("actor_id").references(() => users.id, { onDelete: "set null" }),
    /**
     * La nota de entrega que lo causó, cuando la hubo.
     *
     * Sin clave foránea, como `created_by_quote_id` en el almacén y por el mismo motivo: es
     * metainformación de auditoría, no una relación estructural. Si la nota se da de baja, que el
     * artículo saliera por ella sigue siendo cierto.
     */
    causeId: reference("cause_id"),
    note: text("note"),

    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("production_item_events_item_idx").on(table.itemId, table.occurredAt)],
)

/** Un decorado, entendido como el conjunto de artículos que lo componen. */
export const productionSets = pgTable(
  "production_sets",
  {
    id: primaryId(),
    productionId: reference("production_id")
      .notNull()
      .references(() => productions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 250 }).notNull(),
    description: text("description").notNull().default(""),
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index("production_sets_production_idx").on(table.productionId)],
)

/** Un artículo puede formar parte de varios sets. */
export const productionSetItems = pgTable(
  "production_set_items",
  {
    id: primaryId(),
    setId: reference("set_id")
      .notNull()
      .references(() => productionSets.id, { onDelete: "cascade" }),
    itemId: reference("item_id")
      .notNull()
      .references(() => productionItems.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [uniqueIndex("production_set_items_unique").on(table.setId, table.itemId)],
)

/**
 * Utilería de una continuidad.
 *
 * Es **o** un artículo del inventario **o** un video de referencia, nunca ambos ni ninguno: un
 * artículo es algo que existe y hay que llevar al set; un video es documentación de cómo debía
 * verse. La restricción de comprobación lo garantiza.
 */
export const productionProps = pgTable(
  "production_props",
  {
    id: primaryId(),
    continuityId: reference("continuity_id")
      .notNull()
      .references(() => productionContinuities.id, { onDelete: "cascade" }),
    itemId: reference("item_id").references(() => productionItems.id, { onDelete: "cascade" }),
    videoId: reference("video_id").references(() => productionVideos.id, { onDelete: "cascade" }),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    // Artículo o video, nunca ambos ni ninguno. Lo garantiza el motor, no la aplicación.
    check(
      "production_props_item_xor_video",
      sql`(item_id IS NOT NULL AND video_id IS NULL) OR (item_id IS NULL AND video_id IS NOT NULL)`,
    ),
    index("production_props_continuity_idx").on(table.continuityId),
    uniqueIndex("production_props_item_unique")
      .on(table.continuityId, table.itemId)
      .where(sql`item_id IS NOT NULL`),
    uniqueIndex("production_props_video_unique")
      .on(table.continuityId, table.videoId)
      .where(sql`video_id IS NOT NULL`),
  ],
)

// ─── Notas de entrega ────────────────────────────────────────────────────────

export const deliveryStatusKind = pgEnum("production_delivery_status", [
  "pending",
  "in_progress",
  "completed",
  "canceled",
])

/**
 * Hacia dónde va la nota.
 *
 * Una nota de **salida** entrega artículos: al cerrarla quedan `delivered`. Una nota de
 * **devolución** los recoge: al cerrarla cada línea dice en qué estado vuelve.
 *
 * Es una columna y no dos tablas porque **es el mismo documento y el mismo motor de cierre**: se
 * compone una lista, se verifica pieza por pieza, se firma y se cierra. Lo único que cambia es a
 * qué estado deja el artículo. Duplicar la entidad duplicaría el cierre atómico, la verificación y
 * el documento, que es donde las dos copias se separan.
 */
export const deliveryDirection = pgEnum("production_delivery_direction", ["outbound", "inbound"])

/**
 * En qué estado vuelve un artículo por una nota de devolución.
 *
 * Los cinco destinos que una vuelta puede producir, de los ocho del artículo. `available` y
 * `stored` no están: una devolución dice de qué manera volvió la cosa, no dónde se guarda después
 * —eso es otro gesto, con su propio cambio de estado—. `delivered` tampoco, por razones obvias.
 *
 * Sin esto la vuelta marcaba todo igual, y una nota de doce artículos de los que uno viene roto
 * obligaba a cerrarla y corregir ese uno a mano, que es exactamente el paso que se olvida.
 */
export const returnCondition = pgEnum("production_return_condition", [
  "returned",
  "damaged",
  "incomplete",
  "lost",
  "robbed",
])

export const productionDeliveries = pgTable(
  "production_deliveries",
  {
    id: primaryId(),
    productionId: reference("production_id")
      .notNull()
      .references(() => productions.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 250 }).notNull(),
    description: text("description").notNull().default(""),
    status: deliveryStatusKind("status").notNull().default("pending"),
    /** Salida o devolución. Por omisión salida: es lo que era toda nota antes de la 0030. */
    direction: deliveryDirection("direction").notNull().default("outbound"),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),

    /** Firmas de ambas partes. Inmutables una vez registradas. */
    signedById: reference("signed_by_id").references(() => users.id, { onDelete: "set null" }),
    signatureUploadId: reference("signature_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    receiverName: varchar("receiver_name", { length: 200 }),
    receiverSignatureUploadId: reference("receiver_signature_upload_id").references(
      () => uploads.id,
      { onDelete: "set null" },
    ),
    signedAt: timestamp("signed_at", { withTimezone: true, mode: "date" }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [index("production_deliveries_production_idx").on(table.productionId, table.status)],
)

/** Una línea por artículo, con su propia verificación atribuida. */
export const productionDeliveryLines = pgTable(
  "production_delivery_lines",
  {
    id: primaryId(),
    deliveryId: reference("delivery_id")
      .notNull()
      .references(() => productionDeliveries.id, { onDelete: "cascade" }),
    itemId: reference("item_id")
      .notNull()
      .references(() => productionItems.id, { onDelete: "restrict" }),

    isVerified: boolean("is_verified").notNull().default(false),
    verifiedById: reference("verified_by_id").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),

    /**
     * En qué estado vuelve esta pieza. **Sólo en una nota de devolución.**
     *
     * Nulo en una nota de salida, y nulo en una de devolución que todavía no verificó la línea: la
     * condición se declara al verificar, que es el momento en que alguien tiene el objeto en la
     * mano. Un valor por omisión aquí sería afirmar que volvió entera antes de que nadie la mirara.
     */
    returnCondition: returnCondition("return_condition"),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("production_delivery_lines_unique").on(table.deliveryId, table.itemId),
    index("production_delivery_lines_delivery_idx").on(table.deliveryId, table.isVerified),
  ],
)

// ─── Planes de trabajo ───────────────────────────────────────────────────────

export const workflowStatus = pgEnum("workflow_status", [
  "pending",
  "in_progress",
  "rescheduled",
  "completed",
  "cancelled",
])

export const taskStatus = pgEnum("task_status", [
  "pending",
  "in_progress",
  "completed",
  "incomplete",
])

export const activityStatus = pgEnum("workflow_activity_status", ["incomplete", "completed"])

export const productionWorkflows = pgTable(
  "production_workflows",
  {
    id: primaryId(),
    productionId: reference("production_id")
      .notNull()
      .references(() => productions.id, { onDelete: "cascade" }),
    /** Eliminar la escena deja el plan sin escena y en su estado inicial. */
    sceneId: reference("scene_id").references(() => productionScenes.id, { onDelete: "set null" }),

    code: varchar("code", { length: 64 }).notNull(),
    observations: text("observations").notNull().default(""),
    status: workflowStatus("status").notNull().default("pending"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: "date" }),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("production_workflows_code_unique").on(table.code),
    index("production_workflows_calendar_idx").on(table.productionId, table.scheduledFor),
  ],
)

export const productionTasks = pgTable(
  "production_tasks",
  {
    id: primaryId(),
    workflowId: reference("workflow_id")
      .notNull()
      .references(() => productionWorkflows.id, { onDelete: "cascade" }),
    categoryId: reference("category_id").references(() => productionCategories.id, {
      onDelete: "set null",
    }),
    characterId: reference("character_id").references(() => productionCharacters.id, {
      onDelete: "set null",
    }),

    title: varchar("title", { length: 250 }).notNull(),
    description: text("description").notNull().default(""),
    status: taskStatus("status").notNull().default("pending"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: "date" }),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),

    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),
    /** Quién la creó. No se puede modificar. */
    createdById: reference("created_by_id").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("production_tasks_workflow_idx").on(table.workflowId, table.status),
    index("production_tasks_filter_idx").on(table.categoryId, table.characterId),
  ],
)

export const productionTaskActivities = pgTable(
  "production_task_activities",
  {
    id: primaryId(),
    taskId: reference("task_id")
      .notNull()
      .references(() => productionTasks.id, { onDelete: "cascade" }),

    title: varchar("title", { length: 250 }).notNull(),
    description: text("description").notNull().default(""),
    status: activityStatus("status").notNull().default("incomplete"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: "date" }),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),

    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),
    createdById: reference("created_by_id").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [index("production_task_activities_task_idx").on(table.taskId, table.status)],
)

/** Comentarios en planes y en tareas. Una sola tabla, discriminada por a qué cuelga. */
export const productionComments = pgTable(
  "production_comments",
  {
    id: primaryId(),
    workflowId: reference("workflow_id").references(() => productionWorkflows.id, {
      onDelete: "cascade",
    }),
    taskId: reference("task_id").references(() => productionTasks.id, { onDelete: "cascade" }),

    body: text("body").notNull(),
    authorId: reference("author_id").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("production_comments_workflow_idx").on(table.workflowId, table.createdAt),
    index("production_comments_task_idx").on(table.taskId, table.createdAt),
  ],
)

/** Archivos adjuntos de tareas y actividades. */
export const productionAttachments = pgTable(
  "production_attachments",
  {
    id: primaryId(),
    taskId: reference("task_id").references(() => productionTasks.id, { onDelete: "cascade" }),
    activityId: reference("activity_id").references(() => productionTaskActivities.id, {
      onDelete: "cascade",
    }),
    anchorId: reference("anchor_id").references(() => productionAnchors.id, {
      onDelete: "cascade",
    }),
    shoppingId: reference("shopping_id").references(() => productionShoppings.id, {
      onDelete: "cascade",
    }),
    uploadId: reference("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("production_attachments_task_idx").on(table.taskId),
    index("production_attachments_shopping_idx").on(table.shoppingId),
  ],
)

/** Imágenes de un artículo del inventario. */
export const productionItemImages = pgTable(
  "production_item_images",
  {
    id: primaryId(),
    itemId: reference("item_id")
      .notNull()
      .references(() => productionItems.id, { onDelete: "cascade" }),
    uploadId: reference("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("production_item_images_unique").on(table.itemId, table.uploadId)],
)

// ─── Relaciones ──────────────────────────────────────────────────────────────

export const productionPurchaseOrdersRelations = relations(
  productionPurchaseOrders,
  ({ one, many }) => ({
    production: one(productions, {
      fields: [productionPurchaseOrders.productionId],
      references: [productions.id],
    }),
    lines: many(productionPurchaseOrderLines),
  }),
)

export const productionItemsRelations = relations(productionItems, ({ one, many }) => ({
  production: one(productions, {
    fields: [productionItems.productionId],
    references: [productions.id],
  }),
  shopping: one(productionShoppings, {
    fields: [productionItems.shoppingId],
    references: [productionShoppings.id],
  }),
  images: many(productionItemImages),
  deliveryLines: many(productionDeliveryLines),
  events: many(productionItemEvents),
}))

export const productionItemEventsRelations = relations(productionItemEvents, ({ one }) => ({
  item: one(productionItems, {
    fields: [productionItemEvents.itemId],
    references: [productionItems.id],
  }),
}))

export const productionWorkflowsRelations = relations(productionWorkflows, ({ one, many }) => ({
  production: one(productions, {
    fields: [productionWorkflows.productionId],
    references: [productions.id],
  }),
  scene: one(productionScenes, {
    fields: [productionWorkflows.sceneId],
    references: [productionScenes.id],
  }),
  tasks: many(productionTasks),
}))

export const productionTasksRelations = relations(productionTasks, ({ one, many }) => ({
  workflow: one(productionWorkflows, {
    fields: [productionTasks.workflowId],
    references: [productionWorkflows.id],
  }),
  activities: many(productionTaskActivities),
}))
