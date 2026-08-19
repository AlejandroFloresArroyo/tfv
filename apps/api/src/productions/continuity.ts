/**
 * Continuidad de rodaje.
 *
 * Ver `openspec/specs/continuity-tracking/spec.md`. Rebanada 22, la parte de continuidad.
 *
 * La cadena que sostiene este módulo es la de la spec:
 *
 * ```
 * Jornada de rodaje  →  una por escena que se graba
 *    Continuidad     →  una por personaje presente en esa jornada
 *       Utilería     →  cada objeto o video de referencia de ese personaje
 * ```
 *
 * Es el registro de **cómo aparece cada personaje en cada jornada**, y lo que permite que una
 * escena grabada en marzo enlace visualmente con otra grabada en julio.
 *
 * ## Cerrar una jornada no exige tener la continuidad completa
 *
 * La spec le pone candado a la nota de entrega —«cerrar una nota exige verificarlo todo»— y
 * deliberadamente **no** se lo pone a la jornada. No es un olvido: el día de rodaje se acaba
 * cuando se acaba. Si a las nueve de la noche falta por registrar la utilería de dos personajes,
 * la jornada se cierra igual y lo que falte se completa al día siguiente; una aplicación que se
 * negara obligaría a inventar datos para poder seguir, que es peor que tener el registro
 * incompleto y saberlo.
 *
 * Queda escrito aquí porque éste es justo el sitio donde alguien añadiría una validación «obvia»
 * —«no se cierra una jornada sin continuidad»— que rompería el oficio.
 *
 * ## Los tres estados no tienen tabla de transiciones, y no se inventa
 *
 * La spec enumera borrador, en curso y completada, y declara **un solo movimiento**: asignar el
 * reparto pone la jornada en curso. De `close` y `open` —que sí tienen clave propia en el
 * catálogo— no dice ni de dónde salen ni a dónde van. Se adopta lo mínimo que las hace útiles
 * —cerrar deja completada, abrir deja en curso— sin tabla de transiciones, por el mismo motivo
 * que en los planes de trabajo (`HALLAZGOS.md` H-111 y H-186): escribir aquí una matriz plausible
 * sería fijar por nuestra cuenta una regla que nadie ha decidido, y la pagaría un jefe de
 * producción al que la aplicación le dijera que no puede reabrir una jornada.
 *
 * ## Lo que el modelo no ata, lo ata este módulo
 *
 * Una jornada apunta a su escena y a su producción por dos caminos independientes: nada en el
 * modelo comprueba que el capítulo de esa escena cuelgue de esa producción. Lo mismo pasa con el
 * personaje de una continuidad y con el artículo o el video de una pieza de utilería. Sin
 * comprobarlo aquí, una jornada podría rodar la escena de otra empresa (`HALLAZGOS.md` H-188).
 * Por eso toda referencia que llega en un cuerpo se resuelve **contra la producción**, y no por su
 * identificador a secas.
 */

import {
  buildPage,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import {
  productionChapters,
  productionContinuities,
  productionRecordings,
  productionScenes,
  users,
} from "@tfv/db/schema"
import { and, count, eq, inArray, isNull } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { RECORDING_STATUSES, type RecordingStatus } from "./panel.ts"
import { loadProduction } from "./productions.ts"

export { RECORDING_STATUSES, type RecordingStatus }

/** Grabación o regrabación. Vienen del modelo, no de aquí. */
export const RECORDING_KINDS = ["record", "re_record"] as const

export type RecordingKind = (typeof RECORDING_KINDS)[number]

export interface RecordingRecord {
  readonly id: string
  readonly productionId: string
  readonly sceneId: string | null
  readonly name: string
  readonly kind: RecordingKind
  readonly status: RecordingStatus
  readonly responsibleId: string | null
  readonly responsibleName: string | null
  /** Cuántos personajes tiene registrados. Siempre presente, y `0` cuando no hay ninguno. */
  readonly continuityCount: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Qué se puede pedir de la colección de jornadas.
 *
 * Los filtros son los que una bandeja de rodaje necesita: por estado —qué queda en curso—, por
 * tipo —qué se está regrabando—, por escena y por responsable. La búsqueda va sobre el nombre, que
 * es lo único que una jornada tiene escrito a mano.
 */
export const recordingQuery: QuerySchema = {
  filters: {
    status: { type: "enum", values: RECORDING_STATUSES, set: true, label: "Estado" },
    kind: { type: "enum", values: RECORDING_KINDS, set: true, label: "Tipo" },
    sceneId: { type: "id", label: "Escena" },
    responsibleId: { type: "id", label: "Responsable" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["name"],
  sortable: ["name", "createdAt"],
  defaultSort: [
    { field: "createdAt", direction: "desc" },
    { field: "name", direction: "asc" },
  ],
}

const recordingMapping = {
  fields: {
    status: productionRecordings.status,
    kind: productionRecordings.kind,
    sceneId: productionRecordings.sceneId,
    responsibleId: productionRecordings.responsibleId,
    name: productionRecordings.name,
    createdAt: productionRecordings.createdAt,
  },
  searchable: [productionRecordings.name],
  tiebreak: productionRecordings.id,
}

// ─── Jornadas: lectura ───────────────────────────────────────────────────────

export async function listRecordings(
  actor: Actor,
  companyId: string,
  productionId: string,
  query: ParsedQuery,
): Promise<Page<RecordingRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const where = and(
      eq(productionRecordings.productionId, productionId),
      isNull(productionRecordings.deletedAt),
      ...collectionConditions(query, recordingMapping),
    )

    const [total] = await tx.select({ value: count() }).from(productionRecordings).where(where)

    const rows = await tx
      .select()
      .from(productionRecordings)
      .where(where)
      .orderBy(...collectionOrder(query, recordingMapping))
      .limit(limit)
      .offset(offset)

    return buildPage(await decorateRecordings(tx, rows), total?.value ?? 0, page, limit)
  })
}

export async function getRecording(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
): Promise<RecordingRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const row = await loadRecording(tx, productionId, recordingId)

    return (await decorateRecordings(tx, [row]))[0] as RecordingRecord
  })
}

// ─── Jornadas: escritura ─────────────────────────────────────────────────────

export interface CreateRecordingInput {
  readonly name: string
  readonly sceneId?: string | null | undefined
  readonly kind?: RecordingKind | undefined
  readonly responsibleId?: string | null | undefined
}

export async function createRecording(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: CreateRecordingInput,
): Promise<RecordingRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const sceneId = input.sceneId ?? null
    if (sceneId !== null) await requireScene(tx, productionId, sceneId)

    const [created] = await tx
      .insert(productionRecordings)
      .values({
        id: newId(),
        productionId,
        sceneId,
        name: input.name.trim(),
        kind: input.kind ?? "record",
        responsibleId: input.responsibleId ?? null,
        // El estado no se recibe: «una jornada nace en borrador» es un invariante de la spec, y
        // admitirlo en el alta lo convertiría en un valor por omisión que cualquiera sobrescribe.
      })
      .returning()

    if (!created) throw new Error("la inserción de la jornada no devolvió fila")
    return (await decorateRecordings(tx, [created]))[0] as RecordingRecord
  })
}

export interface UpdateRecordingInput {
  readonly name?: string | undefined
  readonly sceneId?: string | null | undefined
  readonly kind?: RecordingKind | undefined
  readonly responsibleId?: string | null | undefined
}

export async function updateRecording(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
  input: UpdateRecordingInput,
): Promise<RecordingRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const current = await loadRecording(tx, productionId, recordingId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.kind !== undefined) patch.kind = input.kind
    if (input.responsibleId !== undefined) patch.responsibleId = input.responsibleId
    if (input.sceneId !== undefined) {
      if (input.sceneId !== null) await requireScene(tx, productionId, input.sceneId)
      patch.sceneId = input.sceneId
    }

    if (Object.keys(patch).length === 0) {
      return (await decorateRecordings(tx, [current]))[0] as RecordingRecord
    }

    const [updated] = await tx
      .update(productionRecordings)
      .set(patch)
      .where(eq(productionRecordings.id, recordingId))
      .returning()

    if (!updated) throw new NotFoundError("La jornada de rodaje no existe")
    return (await decorateRecordings(tx, [updated]))[0] as RecordingRecord
  })
}

/**
 * Cierra la jornada.
 *
 * **Sin comprobar la continuidad**, y a propósito: ver la cabecera del módulo. Lo único que hace
 * es dejar el estado en completada.
 */
export async function closeRecording(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
): Promise<RecordingRecord> {
  return setRecordingStatus(actor, companyId, productionId, recordingId, "completed")
}

/** Vuelve a abrir la jornada: en curso, que es donde se registra continuidad. */
export async function openRecording(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
): Promise<RecordingRecord> {
  return setRecordingStatus(actor, companyId, productionId, recordingId, "ongoing")
}

async function setRecordingStatus(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
  status: RecordingStatus,
): Promise<RecordingRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadRecording(tx, productionId, recordingId)

    const [updated] = await tx
      .update(productionRecordings)
      .set({ status })
      .where(eq(productionRecordings.id, recordingId))
      .returning()

    if (!updated) throw new NotFoundError("La jornada de rodaje no existe")
    return (await decorateRecordings(tx, [updated]))[0] as RecordingRecord
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

async function decorateRecordings(
  tx: Transaction,
  rows: readonly (typeof productionRecordings.$inferSelect)[],
): Promise<RecordingRecord[]> {
  if (rows.length === 0) return []

  const counts = await continuityCounts(
    tx,
    rows.map((row) => row.id),
  )
  const names = await responsibleNames(
    tx,
    rows.map((row) => row.responsibleId),
  )

  return rows.map((row) => ({
    id: row.id,
    productionId: row.productionId,
    sceneId: row.sceneId,
    name: row.name,
    kind: row.kind,
    status: row.status,
    responsibleId: row.responsibleId,
    responsibleName: row.responsibleId === null ? null : (names.get(row.responsibleId) ?? null),
    continuityCount: counts.get(row.id) ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

/** Continuidades por jornada, en una sola consulta para todo el lote. */
async function continuityCounts(
  tx: Transaction,
  recordingIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (recordingIds.length === 0) return counts

  const rows = await tx
    .select({ recordingId: productionContinuities.recordingId, value: count() })
    .from(productionContinuities)
    .where(inArray(productionContinuities.recordingId, recordingIds))
    .groupBy(productionContinuities.recordingId)

  for (const row of rows) counts.set(row.recordingId, row.value)
  return counts
}

/** Nombre completo de cada responsable nombrado, en una sola consulta. */
async function responsibleNames(
  tx: Transaction,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))]
  if (unique.length === 0) return new Map()

  const rows = await tx
    .select({ id: users.id, name: users.name, lastname: users.lastname })
    .from(users)
    .where(inArray(users.id, unique))

  return new Map(rows.map((row) => [row.id, [row.name, row.lastname].join(" ").trim()]))
}

/**
 * La escena, **resuelta contra la producción**.
 *
 * El salto por el capítulo no es adorno: es lo único que ata la escena a la producción de la
 * jornada. Ver `HALLAZGOS.md` H-188.
 */
async function requireScene(tx: Transaction, productionId: string, sceneId: string) {
  const [row] = await tx
    .select({ id: productionScenes.id })
    .from(productionScenes)
    .innerJoin(productionChapters, eq(productionChapters.id, productionScenes.chapterId))
    .where(
      and(
        eq(productionScenes.id, sceneId),
        eq(productionChapters.productionId, productionId),
        isNull(productionScenes.deletedAt),
        isNull(productionChapters.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La escena no existe en esta producción")
  return row
}

export async function loadRecording(tx: Transaction, productionId: string, recordingId: string) {
  const [row] = await tx
    .select()
    .from(productionRecordings)
    .where(
      and(
        eq(productionRecordings.id, recordingId),
        eq(productionRecordings.productionId, productionId),
        isNull(productionRecordings.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La jornada de rodaje no existe")
  return row
}
