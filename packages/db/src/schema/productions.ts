/**
 * Producciones: proyecto, guion, reparto y continuidad de rodaje.
 *
 * Ver `openspec/specs/production-management`, `script-breakdown`, `script-ai-sync` y
 * `continuity-tracking`.
 *
 * La cadena del rodaje:
 *
 * ```
 * Producción → Capítulo → Escena
 *                            ↓
 *                     Jornada de rodaje → Continuidad (una por personaje) → Utilería
 * ```
 *
 * Un detalle con consecuencias: eliminar una escena **no** destruye el trabajo de programación
 * asociado. Las jornadas y los planes sobreviven sin escena y vuelven a su estado inicial, así que
 * sus referencias usan `set null`, no cascada.
 *
 * Vía hasta la empresa: producción → empresa.
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
import { legacyId, primaryId, reference, softDelete, timestamps } from "./_shared.ts"
import { categoryColumns } from "./categories.ts"
import { companies, roles, users } from "./identity.ts"
import { uploads } from "./media.ts"

// ─── Producción ──────────────────────────────────────────────────────────────

export const productions = pgTable(
  "productions",
  {
    id: primaryId(),
    legacyId: legacyId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 250 }).notNull(),
    description: text("description").notNull().default(""),
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),

    startsOn: timestamp("starts_on", { withTimezone: true, mode: "date" }),
    endsOn: timestamp("ends_on", { withTimezone: true, mode: "date" }),

    slug: varchar("slug", { length: 280 }),
    isPublished: boolean("is_published").notNull().default(false),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("productions_slug_unique").on(table.slug).where(sql`deleted_at IS NULL`),
    uniqueIndex("productions_legacy_unique").on(table.legacyId).where(sql`deleted_at IS NULL`),
    index("productions_company_idx").on(table.companyId, table.createdAt),

    /**
     * Las dos fechas van en orden, y lo dice el motor.
     *
     * `production-management` lo pide como escenario de frontera. Comprobarlo sólo en el manejador
     * lo deja valiendo mientras nadie escriba por otra vía —la siembra, un trasvase de la pila
     * anterior, una corrección a mano—, y una producción que termina antes de empezar no se nota
     * hasta que alguien cuenta jornadas y le salen negativas.
     *
     * Nulas se admiten: una producción puede registrarse antes de tener fechas.
     */
    check(
      "productions_dates_ordered",
      sql`starts_on is null or ends_on is null or ends_on >= starts_on`,
    ),

    /**
     * Publicada exige identificador legible.
     *
     * La spec las une en una sola frase —«SHALL poder marcarse como publicada **y** SHALL tener un
     * identificador legible único, para aparecer en los directorios públicos»—, y sin el segundo el
     * primero no sirve de nada: una producción publicada sin `slug` no tiene dirección por la que
     * llegar a ella, así que está publicada en un sitio al que nadie puede ir.
     */
    check("productions_published_needs_slug", sql`is_published is false or slug is not null`),
  ],
)

/** Taxonomía propia de una producción. Puede apuntar a un rol, para dirigir el trabajo. */
export const productionCategories = pgTable(
  "production_categories",
  {
    id: primaryId(),
    productionId: reference("production_id")
      .notNull()
      .references(() => productions.id, { onDelete: "cascade" }),
    parentId: reference("parent_id"),
    /** El equipo al que corresponde el trabajo clasificado aquí. */
    roleId: reference("role_id").references(() => roles.id, { onDelete: "set null" }),
    ...categoryColumns,
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "production_categories_parent_fk",
    }).onDelete("cascade"),
    uniqueIndex("production_categories_slug_unique").on(table.productionId, table.slug),
    index("production_categories_tree_idx").on(table.productionId, table.parentId),
  ],
)

// ─── Guion ───────────────────────────────────────────────────────────────────

export const scriptSyncStatus = pgEnum("script_sync_status", [
  "not_extracted",
  "queued",
  "running",
  "completed",
  "failed",
])

export const productionScripts = pgTable(
  "production_scripts",
  {
    id: primaryId(),
    productionId: reference("production_id")
      .notNull()
      .references(() => productions.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 250 }).notNull(),
    index: integer("index").notNull().default(0),
    documentUploadId: reference("document_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),

    /**
     * Estado de la extracción asistida.
     *
     * Sustituir el archivo lo devuelve a «sin extraer». Los fallos quedan visibles con su motivo:
     * la pila anterior lanzaba la extracción sin esperarla y **descartaba los errores**, así que el
     * usuario pulsaba sincronizar y no sabía si había funcionado (`DEFECTS.md` O-07).
     */
    syncStatus: scriptSyncStatus("sync_status").notNull().default("not_extracted"),
    syncError: text("sync_error"),
    syncedAt: timestamp("synced_at", { withTimezone: true, mode: "date" }),
    /** Cuántas escenas quedaron sin cuerpo localizable en la última extracción. */
    scenesWithoutBody: integer("scenes_without_body").notNull().default(0),

    ...timestamps,
    ...softDelete,
  },
  (table) => [index("production_scripts_production_idx").on(table.productionId, table.index)],
)

export const productionChapters = pgTable(
  "production_chapters",
  {
    id: primaryId(),
    productionId: reference("production_id")
      .notNull()
      .references(() => productions.id, { onDelete: "cascade" }),
    /** Eliminar el guion desvincula sus capítulos, no los elimina. */
    scriptId: reference("script_id").references(() => productionScripts.id, {
      onDelete: "set null",
    }),

    name: varchar("name", { length: 250 }).notNull(),
    synopsis: text("synopsis").notNull().default(""),
    /** El número que la gente dice en el set. Único dentro de la producción. */
    index: integer("index").notNull(),

    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("production_chapters_index_unique")
      .on(table.productionId, table.index)
      .where(sql`deleted_at IS NULL`),
    index("production_chapters_production_idx").on(table.productionId, table.index),
  ],
)

export const productionScenes = pgTable(
  "production_scenes",
  {
    id: primaryId(),
    chapterId: reference("chapter_id")
      .notNull()
      .references(() => productionChapters.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 250 }).notNull(),
    synopsis: text("synopsis").notNull().default(""),
    /** Único dentro de su capítulo, no de la producción. */
    index: integer("index").notNull(),

    /**
     * Marca de edición manual de la sinopsis.
     *
     * La extracción no sobrescribe lo que una persona escribió a mano: compara este instante con el
     * de la última extracción para decidir.
     */
    synopsisEditedAt: timestamp("synopsis_edited_at", { withTimezone: true, mode: "date" }),
    /** Señalada cuando una nueva extracción ya no la incluye. No se borra: decide el usuario. */
    missingFromLastSync: boolean("missing_from_last_sync").notNull().default(false),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("production_scenes_index_unique")
      .on(table.chapterId, table.index)
      .where(sql`deleted_at IS NULL`),
    index("production_scenes_chapter_idx").on(table.chapterId, table.index),
  ],
)

// ─── Reparto y arte ──────────────────────────────────────────────────────────

export const productionCharacters = pgTable(
  "production_characters",
  {
    id: primaryId(),
    productionId: reference("production_id")
      .notNull()
      .references(() => productions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index("production_characters_production_idx").on(table.productionId)],
)

export const productionVideos = pgTable(
  "production_videos",
  {
    id: primaryId(),
    productionId: reference("production_id")
      .notNull()
      .references(() => productions.id, { onDelete: "cascade" }),
    categoryId: reference("category_id").references(() => productionCategories.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 250 }).notNull(),
    videoUploadId: reference("video_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index("production_videos_production_idx").on(table.productionId)],
)

// ─── Jornadas y continuidad ──────────────────────────────────────────────────

export const recordingKind = pgEnum("recording_kind", ["record", "re_record"])
export const recordingStatus = pgEnum("recording_status", ["draft", "ongoing", "completed"])

export const productionRecordings = pgTable(
  "production_recordings",
  {
    id: primaryId(),
    productionId: reference("production_id")
      .notNull()
      .references(() => productions.id, { onDelete: "cascade" }),
    /** Eliminar la escena deja la jornada sin escena y en su estado inicial. */
    sceneId: reference("scene_id").references(() => productionScenes.id, { onDelete: "set null" }),

    name: varchar("name", { length: 250 }).notNull(),
    kind: recordingKind("kind").notNull().default("record"),
    status: recordingStatus("status").notNull().default("draft"),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("production_recordings_production_idx").on(table.productionId),
    index("production_recordings_scene_idx").on(table.sceneId),
  ],
)

/** Cómo aparece un personaje en una jornada. Puede quedarse sin personaje asignado. */
export const productionContinuities = pgTable(
  "production_continuities",
  {
    id: primaryId(),
    recordingId: reference("recording_id")
      .notNull()
      .references(() => productionRecordings.id, { onDelete: "cascade" }),
    characterId: reference("character_id").references(() => productionCharacters.id, {
      onDelete: "set null",
    }),
    responsibleId: reference("responsible_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [index("production_continuities_recording_idx").on(table.recordingId)],
)

export const productionRecordingNotes = pgTable(
  "production_recording_notes",
  {
    id: primaryId(),
    recordingId: reference("recording_id")
      .notNull()
      .references(() => productionRecordings.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    authorId: reference("author_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index("production_recording_notes_recording_idx").on(table.recordingId)],
)

export const productionsRelations = relations(productions, ({ one, many }) => ({
  company: one(companies, { fields: [productions.companyId], references: [companies.id] }),
  chapters: many(productionChapters),
  characters: many(productionCharacters),
  scripts: many(productionScripts),
  recordings: many(productionRecordings),
}))

export const productionChaptersRelations = relations(productionChapters, ({ one, many }) => ({
  production: one(productions, {
    fields: [productionChapters.productionId],
    references: [productions.id],
  }),
  scenes: many(productionScenes),
}))

export const productionScenesRelations = relations(productionScenes, ({ one, many }) => ({
  chapter: one(productionChapters, {
    fields: [productionScenes.chapterId],
    references: [productionChapters.id],
  }),
  recordings: many(productionRecordings),
}))
