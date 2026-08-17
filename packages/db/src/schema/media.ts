/**
 * Archivos.
 *
 * Ver `openspec/specs/media-storage/spec.md`.
 *
 * Un archivo de imagen no es un objeto sino cinco: el original y cuatro derivados. Un video son
 * cinco también: el video y cuatro fotogramas de portada. Las direcciones de los derivados viven
 * en `variants` porque siempre se leen juntas y nunca se consultan por separado.
 *
 * **Simplificación deliberada respecto de la pila anterior**, que separaba el archivo de su
 * metainformación en dos colecciones con una referencia entre ellas. Se leían siempre juntas y
 * nunca se consultaba la segunda por su cuenta, así que aquí son una sola tabla.
 */

import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps } from "./_shared.ts"

export const uploadKind = pgEnum("upload_kind", ["image", "video", "document", "file", "signature"])

export const uploadStatus = pgEnum("upload_status", ["pending", "uploaded", "error"])

/** Direcciones públicas de los derivados. Nulas mientras el archivo no se haya subido. */
export interface UploadVariants {
  readonly thumbnail: string | null
  readonly small: string | null
  readonly medium: string | null
  readonly large: string | null
}

export const uploads = pgTable(
  "uploads",
  {
    id: primaryId(),

    kind: uploadKind("kind").notNull(),
    status: uploadStatus("status").notNull().default("pending"),

    /** Dirección pública de lectura del original. */
    url: text("url").notNull(),
    variants: jsonb("variants").$type<UploadVariants>(),

    /** Nombre con el que lo subió quien lo subió, para mostrarlo tal cual. */
    fileName: varchar("file_name", { length: 255 }).notNull(),
    extension: varchar("extension", { length: 16 }).notNull(),
    contentType: varchar("content_type", { length: 128 }).notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    /** Prefijo de la ubicación en el almacenamiento. La clave del objeto deriva del identificador. */
    storagePath: text("storage_path").notNull(),

    /**
     * Marcador de posición compartido.
     *
     * Se usa cuando una entidad exige un archivo y no se subió ninguno, y **nunca se elimina**,
     * aunque deje de estar referenciado.
     */
    isPlaceholder: boolean("is_placeholder").notNull().default(false),

    ...timestamps,
  },
  (table) => [
    // El recolector de subidas abandonadas busca por aquí (`DEFECTS.md` O-05).
    index("uploads_pending_idx").on(table.createdAt).where(sql`status = 'pending'`),
    // Un solo marcador de posición por tipo.
    uniqueIndex("uploads_placeholder_unique").on(table.kind).where(sql`is_placeholder = true`),
  ],
)
