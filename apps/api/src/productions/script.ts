/**
 * El desglose del guion: guiones, capítulos y escenas.
 *
 * Ver `openspec/specs/script-breakdown/spec.md`. Rebanada 20, sección «Desglose».
 *
 * Es el esqueleto sobre el que se organiza el rodaje entero: las jornadas graban escenas, los
 * planes de trabajo se asocian a escenas y la continuidad se lleva por escena. Lo que aquí se
 * escribe lo referencia todo lo demás del servicio.
 *
 * ## Los índices no se renumeran nunca, y hay que decirlo aquí
 *
 * Cuando se elimina el capítulo 7 de doce, los capítulos 8 a 12 **se quedan como están**. Nadie se
 * convierte en el 7. Lo mismo con las escenas dentro de un capítulo.
 *
 * No es una omisión ni una simplificación: en un guion real los números son la referencia de todo
 * el papeleo del equipo —el desglose de arte, la orden del día, las hojas de continuidad, lo que la
 * gente dice en el set— y renumerar al borrar dejaría a media producción hablando de una escena que
 * ya es otra. Por eso en la industria existen los «12A»: se intercala, no se recoloca.
 *
 * La propia spec lo confirma sin decirlo: pide una **consulta del siguiente índice libre**. Si los
 * índices se recompactaran al borrar, esa consulta sobraría, porque el siguiente sería siempre el
 * número de elementos más uno. Existe precisamente porque hay huecos y no se rellenan solos.
 *
 * Queda escrito aquí porque éste es exactamente el sitio donde alguien, con la mejor intención,
 * «arreglaría» algo que no está roto.
 *
 * ## La etiqueta compuesta no se escribe aquí
 *
 * Sale de `sceneLabel()` en `@tfv/contracts`, que es donde viven los campos calculados para que
 * servidor y navegador usen la misma. Componerla aquí con una plantilla sería tener dos.
 *
 * ## Lo que este módulo **no** hace
 *
 * **No extrae.** `syncStatus`, `syncError`, `syncedAt` y `scenesWithoutBody` son de `script-ai-sync`
 * —rebanada 21—, y la única de las cuatro que este módulo escribe es la vuelta a `not_extracted` al
 * sustituir el archivo, que es un requisito de `script-breakdown`. La clave `productions.pdfs.sync`
 * existe en el catálogo y **ninguna ruta de aquí la exige**: es la de la rebanada 21.
 */

import {
  buildPage,
  ConflictError,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
  UnprocessableError,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import {
  productionChapters,
  productionRecordings,
  productionScenes,
  productionScripts,
  productionWorkflows,
  uploads,
  users,
} from "@tfv/db/schema"
import { and, count, eq, inArray, isNull, ne } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { releaseUploads, sweepObjects } from "../media/collections.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { loadProduction } from "./productions.ts"

/** Los cinco estados de la extracción, en el orden en que el modelo los enumera. */
export const SYNC_STATUSES = ["not_extracted", "queued", "running", "completed", "failed"] as const

export type SyncStatus = (typeof SYNC_STATUSES)[number]

// ─── Registros ───────────────────────────────────────────────────────────────

export interface ScriptRecord {
  readonly id: string
  readonly productionId: string
  readonly name: string
  readonly index: number
  readonly documentUploadId: string | null
  /** La dirección de lectura, para que la pantalla no tenga que ir a buscarla. */
  readonly documentUrl: string | null
  readonly documentFileName: string | null
  readonly responsibleId: string | null
  readonly responsibleName: string | null
  readonly syncStatus: SyncStatus
  readonly syncError: string | null
  readonly syncedAt: Date | null
  readonly scenesWithoutBody: number
  /** Cuántos capítulos proceden de este guion. Es lo que se desvincula al darlo de baja. */
  readonly chapterCount: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface ChapterRecord {
  readonly id: string
  readonly productionId: string
  readonly scriptId: string | null
  readonly name: string
  readonly synopsis: string
  readonly index: number
  readonly responsibleId: string | null
  readonly responsibleName: string | null
  /** `computed-fields`, «Escenas de un capítulo». Siempre presente, y `0` cuando no hay ninguna. */
  readonly sceneCount: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

// ─── Lenguaje de consulta ────────────────────────────────────────────────────

export const scriptQuery: QuerySchema = {
  filters: {
    syncStatus: { type: "enum", values: SYNC_STATUSES, set: true, label: "Extracción" },
    responsibleId: { type: "id", label: "Responsable" },
  },
  searchable: ["name"],
  sortable: ["index", "name", "createdAt"],
  defaultSort: [
    { field: "index", direction: "asc" },
    { field: "createdAt", direction: "asc" },
  ],
}

/**
 * Qué se puede pedir de la colección de capítulos.
 *
 * La búsqueda va sobre **nombre y sinopsis**. El requisito «Búsqueda en el desglose» dice «por
 * nombre y descripción» y el requisito del capítulo dice «su nombre, su sinopsis»: es el mismo
 * campo con dos nombres dentro de la misma spec, y el modelo lo llama `synopsis`.
 */
export const chapterQuery: QuerySchema = {
  filters: {
    scriptId: { type: "id", label: "Guion" },
    responsibleId: { type: "id", label: "Responsable" },
  },
  searchable: ["name", "synopsis"],
  sortable: ["index", "name", "createdAt"],
  defaultSort: [{ field: "index", direction: "asc" }],
}

const scriptMapping = {
  fields: {
    syncStatus: productionScripts.syncStatus,
    responsibleId: productionScripts.responsibleId,
    index: productionScripts.index,
    name: productionScripts.name,
    createdAt: productionScripts.createdAt,
  },
  searchable: [productionScripts.name],
  tiebreak: productionScripts.id,
}

const chapterMapping = {
  fields: {
    scriptId: productionChapters.scriptId,
    responsibleId: productionChapters.responsibleId,
    index: productionChapters.index,
    name: productionChapters.name,
    createdAt: productionChapters.createdAt,
  },
  searchable: [productionChapters.name, productionChapters.synopsis],
  tiebreak: productionChapters.id,
}

// ─── Guiones ─────────────────────────────────────────────────────────────────

export async function listScripts(
  actor: Actor,
  companyId: string,
  productionId: string,
  query: ParsedQuery,
): Promise<Page<ScriptRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const where = and(
      eq(productionScripts.productionId, productionId),
      isNull(productionScripts.deletedAt),
      ...collectionConditions(query, scriptMapping),
    )

    const [total] = await tx.select({ value: count() }).from(productionScripts).where(where)

    const rows = await tx
      .select()
      .from(productionScripts)
      .where(where)
      .orderBy(...collectionOrder(query, scriptMapping))
      .limit(limit)
      .offset(offset)

    return buildPage(await decorateScripts(tx, rows), total?.value ?? 0, page, limit)
  })
}

export async function getScript(
  actor: Actor,
  companyId: string,
  productionId: string,
  scriptId: string,
): Promise<ScriptRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const row = await loadScript(tx, productionId, scriptId)
    return (await decorateScripts(tx, [row]))[0] as ScriptRecord
  })
}

export interface CreateScriptInput {
  readonly name: string
  readonly index?: number | undefined
  readonly documentUploadId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

export async function createScript(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: CreateScriptInput,
): Promise<ScriptRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const document = input.documentUploadId ?? null
    if (document !== null) await assertUsableDocument(tx, companyId, document)

    const [created] = await tx
      .insert(productionScripts)
      .values({
        id: newId(),
        productionId,
        name: input.name.trim(),
        index: input.index ?? 0,
        documentUploadId: document,
        responsibleId: input.responsibleId ?? null,
        // El estado de extracción no se recibe: «queda registrado y **marcado como no extraído**»
        // es un invariante del alta, y admitirlo por el cuerpo lo convertiría en un valor por
        // omisión que cualquiera puede sobrescribir para decir que ya se extrajo.
      })
      .returning()

    if (!created) throw new Error("la inserción del guion no devolvió fila")
    return (await decorateScripts(tx, [created]))[0] as ScriptRecord
  })
}

export interface UpdateScriptInput {
  readonly name?: string | undefined
  readonly index?: number | undefined
  readonly documentUploadId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

/**
 * Edita un guion, y **sustituir el archivo invalida la extracción**.
 *
 * El requisito es literal: «GIVEN un guion ya extraído, WHEN se sustituye su archivo, THEN vuelve a
 * marcarse como no extraído». Lo que se invalida no es sólo el estado: `syncedAt`, `syncError` y el
 * recuento de escenas sin cuerpo describen la extracción **del archivo anterior**, y dejarlos
 * puestos sería informar sobre un documento que ya no está ahí.
 *
 * Sustituir es cambiar por **otro**. Guardar el guion con el archivo que ya tenía no sustituye
 * nada, y tirar una extracción porque alguien corrigió el nombre sería el defecto en la otra
 * dirección. Retirarlo sí invalida: sin archivo no queda nada de lo que se pudiera haber extraído.
 */
export async function updateScript(
  actor: Actor,
  companyId: string,
  productionId: string,
  scriptId: string,
  input: UpdateScriptInput,
): Promise<ScriptRecord> {
  const { record, released } = await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const current = await loadScript(tx, productionId, scriptId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.index !== undefined) patch.index = input.index
    if (input.responsibleId !== undefined) patch.responsibleId = input.responsibleId

    const incoming = input.documentUploadId
    const replaces = incoming !== undefined && (incoming ?? null) !== current.documentUploadId

    if (replaces) {
      if (incoming !== null && incoming !== undefined) {
        await assertUsableDocument(tx, companyId, incoming)
      }
      patch.documentUploadId = incoming ?? null
      patch.syncStatus = "not_extracted"
      patch.syncError = null
      patch.syncedAt = null
      patch.scenesWithoutBody = 0
    }

    if (Object.keys(patch).length === 0) {
      return {
        record: (await decorateScripts(tx, [current]))[0] as ScriptRecord,
        released: undefined,
      }
    }

    const [updated] = await tx
      .update(productionScripts)
      .set(patch)
      .where(eq(productionScripts.id, scriptId))
      .returning()

    if (!updated) throw new NotFoundError("El guion no existe")

    return {
      record: (await decorateScripts(tx, [updated]))[0] as ScriptRecord,
      // Después de escribir la columna: la comprobación de referencias mira el estado de esta
      // transacción, y hecha antes diría que el archivo anterior sigue en uso.
      released:
        replaces && current.documentUploadId !== null
          ? await releaseUploads(tx, [current.documentUploadId])
          : undefined,
    }
  })

  if (released !== undefined) await sweepObjects(released)
  return record
}

/** Lo que se lleva por delante dar de baja un guion: sus capítulos se desvinculan, no se van. */
export interface ScriptScope {
  readonly chapters: number
}

export async function scriptScope(
  actor: Actor,
  companyId: string,
  productionId: string,
  scriptId: string,
): Promise<ScriptScope> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadScript(tx, productionId, scriptId)
    return { chapters: await chapterCountOf(tx, scriptId) }
  })
}

/**
 * Da de baja un guion y **desvincula** sus capítulos.
 *
 * «Eliminar un guion SHALL dejar sin guion los capítulos que lo referenciaban, sin eliminarlos ni
 * alterar sus escenas.» Un capítulo extraído de un guion sigue siendo un capítulo de la producción:
 * de dónde salió su texto es procedencia, no propiedad. La clave foránea ya declara `set null`, y
 * eso cubre el borrado **físico**; aquí la baja es lógica, así que la desvinculación la escribe
 * este manejador o no la escribe nadie.
 */
export async function deleteScript(
  actor: Actor,
  companyId: string,
  productionId: string,
  scriptId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadScript(tx, productionId, scriptId)

    await tx
      .update(productionChapters)
      .set({ scriptId: null })
      .where(and(eq(productionChapters.scriptId, scriptId), isNull(productionChapters.deletedAt)))

    await tx
      .update(productionScripts)
      .set({ deletedAt: new Date() })
      .where(eq(productionScripts.id, scriptId))
  })
}

// ─── Capítulos ───────────────────────────────────────────────────────────────

export async function listChapters(
  actor: Actor,
  companyId: string,
  productionId: string,
  query: ParsedQuery,
): Promise<Page<ChapterRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const where = and(
      eq(productionChapters.productionId, productionId),
      isNull(productionChapters.deletedAt),
      ...collectionConditions(query, chapterMapping),
    )

    const [total] = await tx.select({ value: count() }).from(productionChapters).where(where)

    const rows = await tx
      .select()
      .from(productionChapters)
      .where(where)
      .orderBy(...collectionOrder(query, chapterMapping))
      .limit(limit)
      .offset(offset)

    return buildPage(await decorateChapters(tx, rows), total?.value ?? 0, page, limit)
  })
}

export async function getChapter(
  actor: Actor,
  companyId: string,
  productionId: string,
  chapterId: string,
): Promise<ChapterRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const row = await loadChapter(tx, productionId, chapterId)
    return (await decorateChapters(tx, [row]))[0] as ChapterRecord
  })
}

export interface CreateChapterInput {
  readonly name: string
  readonly index: number
  readonly synopsis?: string | undefined
  readonly scriptId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

export async function createChapter(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: CreateChapterInput,
): Promise<ChapterRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const scriptId = input.scriptId ?? null
    // Un capítulo sólo puede proceder de un guion **de su propia producción**. La clave foránea no
    // lo dice —apunta a la tabla, no a la producción—, así que sin esto un desglose podría declarar
    // que sale de un guion de otra serie.
    if (scriptId !== null) await loadScript(tx, productionId, scriptId)

    await assertChapterIndexFree(tx, productionId, input.index, null)

    const [created] = await tx
      .insert(productionChapters)
      .values({
        id: newId(),
        productionId,
        scriptId,
        name: input.name.trim(),
        synopsis: input.synopsis?.trim() ?? "",
        index: input.index,
        responsibleId: input.responsibleId ?? null,
      })
      .returning()
      .catch(rethrowChapterIndexTaken)

    if (!created) throw new Error("la inserción del capítulo no devolvió fila")
    return (await decorateChapters(tx, [created]))[0] as ChapterRecord
  })
}

export interface UpdateChapterInput {
  readonly name?: string | undefined
  readonly index?: number | undefined
  readonly synopsis?: string | undefined
  readonly scriptId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

export async function updateChapter(
  actor: Actor,
  companyId: string,
  productionId: string,
  chapterId: string,
  input: UpdateChapterInput,
): Promise<ChapterRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const current = await loadChapter(tx, productionId, chapterId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.synopsis !== undefined) patch.synopsis = input.synopsis.trim()
    if (input.responsibleId !== undefined) patch.responsibleId = input.responsibleId

    if (input.scriptId !== undefined) {
      if (input.scriptId !== null) await loadScript(tx, productionId, input.scriptId)
      patch.scriptId = input.scriptId
    }

    if (input.index !== undefined && input.index !== current.index) {
      await assertChapterIndexFree(tx, productionId, input.index, chapterId)
      patch.index = input.index
    }

    if (Object.keys(patch).length === 0) {
      return (await decorateChapters(tx, [current]))[0] as ChapterRecord
    }

    const [updated] = await tx
      .update(productionChapters)
      .set(patch)
      .where(eq(productionChapters.id, chapterId))
      .returning()
      .catch(rethrowChapterIndexTaken)

    if (!updated) throw new NotFoundError("El capítulo no existe")
    return (await decorateChapters(tx, [updated]))[0] as ChapterRecord
  })
}

/** Lo que se lleva por delante dar de baja un capítulo. La spec exige enumerarlo antes. */
export interface ChapterScope {
  readonly scenes: number
  /** Jornadas de rodaje que se quedarán sin escena. Sobreviven, en su estado inicial. */
  readonly recordings: number
  /** Planes de trabajo que se quedarán sin escena. Sobreviven, en su estado inicial. */
  readonly workflows: number
}

export async function chapterScope(
  actor: Actor,
  companyId: string,
  productionId: string,
  chapterId: string,
): Promise<ChapterScope> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadChapter(tx, productionId, chapterId)

    const sceneIds = await liveSceneIds(tx, chapterId)
    return {
      scenes: sceneIds.length,
      ...(await detachableCounts(tx, sceneIds)),
    }
  })
}

/**
 * Da de baja un capítulo y **se lleva sus escenas**.
 *
 * «Eliminar un capítulo SHALL eliminar todas sus escenas.» La clave foránea declara la cascada
 * física, que aquí no actúa: la baja es lógica y la fila del capítulo no se retira. Así que la
 * cascada la escribe este manejador, y con ella **todo lo que la baja de una escena arrastra** —las
 * jornadas y los planes se quedan sin escena y vuelven a su estado inicial—. Que el borrado sea de
 * una escena o de un capítulo entero no cambia lo que le pasa a la programación: si aquí no se
 * llamara a `detachFromScenes`, borrar el capítulo dejaría jornadas apuntando a escenas muertas.
 *
 * Los índices de los capítulos que quedan **no se tocan**. Ver la cabecera del módulo.
 */
export async function deleteChapter(
  actor: Actor,
  companyId: string,
  productionId: string,
  chapterId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadChapter(tx, productionId, chapterId)

    const sceneIds = await liveSceneIds(tx, chapterId)
    await detachFromScenes(tx, sceneIds)

    const now = new Date()
    if (sceneIds.length > 0) {
      await tx
        .update(productionScenes)
        .set({ deletedAt: now })
        .where(inArray(productionScenes.id, sceneIds))
    }

    await tx
      .update(productionChapters)
      .set({ deletedAt: now })
      .where(eq(productionChapters.id, chapterId))
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/**
 * El índice pedido está libre en la producción.
 *
 * Dos capas, y las dos hacen falta. La consulta previa da el mensaje bueno en el caso normal —dos
 * personas desglosando el mismo guion a la vez, separadas por segundos—; el índice único parcial
 * resuelve la carrera de dos peticiones **simultáneas**, que atraviesan la consulta las dos. Lo que
 * no se puede es dejar sólo la segunda: el error del motor no distingue qué restricción falló para
 * quien lee la respuesta.
 *
 * `exceptId` es el propio capítulo al editarlo: guardarlo con el índice que ya tenía no choca
 * consigo mismo.
 */
async function assertChapterIndexFree(
  tx: Transaction,
  productionId: string,
  index: number,
  exceptId: string | null,
): Promise<void> {
  const [taken] = await tx
    .select({ id: productionChapters.id })
    .from(productionChapters)
    .where(
      and(
        eq(productionChapters.productionId, productionId),
        eq(productionChapters.index, index),
        isNull(productionChapters.deletedAt),
        ...(exceptId === null ? [] : [ne(productionChapters.id, exceptId)]),
      ),
    )
    .limit(1)

  if (taken) throw new ConflictError(`El capítulo número ${index} ya existe en esta producción`)
}

function rethrowChapterIndexTaken(failure: unknown): never {
  const cause = (failure as { cause?: { code?: string; constraint_name?: string } }).cause
  if (cause?.code === "23505" && cause.constraint_name === "production_chapters_index_unique") {
    throw new ConflictError("Ese número de capítulo ya existe en esta producción")
  }
  throw failure
}

/** Los identificadores de las escenas vivas de un capítulo. */
async function liveSceneIds(tx: Transaction, chapterId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: productionScenes.id })
    .from(productionScenes)
    .where(and(eq(productionScenes.chapterId, chapterId), isNull(productionScenes.deletedAt)))

  return rows.map((row) => row.id)
}

/** Cuántas jornadas y cuántos planes se quedarían sin escena. */
async function detachableCounts(
  tx: Transaction,
  sceneIds: readonly string[],
): Promise<{ recordings: number; workflows: number }> {
  if (sceneIds.length === 0) return { recordings: 0, workflows: 0 }

  const [recordings] = await tx
    .select({ value: count() })
    .from(productionRecordings)
    .where(
      and(inArray(productionRecordings.sceneId, sceneIds), isNull(productionRecordings.deletedAt)),
    )

  const [workflows] = await tx
    .select({ value: count() })
    .from(productionWorkflows)
    .where(
      and(inArray(productionWorkflows.sceneId, sceneIds), isNull(productionWorkflows.deletedAt)),
    )

  return { recordings: recordings?.value ?? 0, workflows: workflows?.value ?? 0 }
}

/**
 * Suelta las jornadas y los planes que apuntaban a estas escenas, y **los devuelve a su estado
 * inicial**.
 *
 * «Eliminar una escena SHALL dejar sin escena las jornadas de rodaje y los planes de trabajo que la
 * referenciaban, y SHALL devolverlos a su estado inicial, sin eliminarlos.» Es la tarea con más
 * filo del desglose: lo que se borra es la escena, y lo que **sobrevive** es el trabajo de
 * programación que colgaba de ella —una jornada con su equipo convocado, un plan con sus tareas—.
 * Llevárselos por delante destruiría días de organización por corregir una numeración.
 *
 * La clave foránea declara `set null`, que cubre la mitad: el vínculo. La otra mitad —volver a
 * `draft` y a `pending`— no la puede hacer una clave foránea, y sin ella una jornada se quedaría en
 * curso sin escena que grabar, que es un estado que no significa nada.
 *
 * Sólo se tocan las vivas. Una jornada ya dada de baja no «sobrevive» a nada, y devolverla a su
 * estado inicial sería reescribir el pasado de algo que ya nadie mira.
 *
 * **Las dos tablas son de otro encargo.** Se escriben por sus columnas y no por su servicio: es lo
 * que permite que el desglose y las jornadas se construyan a la vez sin pisarse.
 */
async function detachFromScenes(tx: Transaction, sceneIds: readonly string[]): Promise<void> {
  if (sceneIds.length === 0) return

  await tx
    .update(productionRecordings)
    .set({ sceneId: null, status: "draft" })
    .where(
      and(inArray(productionRecordings.sceneId, sceneIds), isNull(productionRecordings.deletedAt)),
    )

  await tx
    .update(productionWorkflows)
    .set({ sceneId: null, status: "pending" })
    .where(
      and(inArray(productionWorkflows.sceneId, sceneIds), isNull(productionWorkflows.deletedAt)),
    )
}

/** Recuento de escenas y nombre del responsable, en dos consultas para todo el lote. */
async function decorateChapters(
  tx: Transaction,
  rows: readonly (typeof productionChapters.$inferSelect)[],
): Promise<ChapterRecord[]> {
  if (rows.length === 0) return []

  const names = await responsibleNames(
    tx,
    rows.map((row) => row.responsibleId),
  )
  const counts = await sceneCounts(
    tx,
    rows.map((row) => row.id),
  )

  return rows.map((row) => ({
    id: row.id,
    productionId: row.productionId,
    scriptId: row.scriptId,
    name: row.name,
    synopsis: row.synopsis,
    index: row.index,
    responsibleId: row.responsibleId,
    responsibleName: row.responsibleId === null ? null : (names.get(row.responsibleId) ?? null),
    sceneCount: counts.get(row.id) ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

/** Escenas por capítulo, en **una** consulta para todo el lote. */
async function sceneCounts(
  tx: Transaction,
  chapterIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (chapterIds.length === 0) return counts

  const rows = await tx
    .select({ chapterId: productionScenes.chapterId, value: count() })
    .from(productionScenes)
    .where(and(inArray(productionScenes.chapterId, chapterIds), isNull(productionScenes.deletedAt)))
    .groupBy(productionScenes.chapterId)

  for (const row of rows) counts.set(row.chapterId, row.value)
  return counts
}

export async function loadChapter(tx: Transaction, productionId: string, chapterId: string) {
  const [row] = await tx
    .select()
    .from(productionChapters)
    .where(
      and(
        eq(productionChapters.id, chapterId),
        eq(productionChapters.productionId, productionId),
        isNull(productionChapters.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El capítulo no existe")
  return row
}

/**
 * Que el archivo exista, sea de esta empresa, esté subido y sea un documento.
 *
 * Es la hermana de `assertUsableImages` para la otra clase de archivo, y no vive junto a ella
 * porque `media/collections.ts` es un módulo compartido y esta ronda lo tocan otros encargos. Las
 * dos reglas que importan son las mismas y por el mismo motivo: el archivo no lleva empresa —lo
 * explica `0015_confirmacion_de_archivos.sql`—, así que lo que lo acota a un arrendatario es el
 * prefijo de la clave de su objeto, y uno de otra empresa responde **que no existe**, no que no se
 * puede: distinguir las dos cosas sería confirmar que existe.
 */
async function assertUsableDocument(
  tx: Transaction,
  companyId: string,
  uploadId: string,
): Promise<void> {
  const [row] = await tx
    .select({
      kind: uploads.kind,
      status: uploads.status,
      storagePath: uploads.storagePath,
      isPlaceholder: uploads.isPlaceholder,
    })
    .from(uploads)
    .where(eq(uploads.id, uploadId))
    .limit(1)

  if (!row) throw new NotFoundError("El archivo del guion no existe")
  if (!row.isPlaceholder && !row.storagePath.startsWith(`${companyId}/`)) {
    throw new NotFoundError("El archivo del guion no existe")
  }
  if (row.status !== "uploaded") throw new UnprocessableError("El archivo no llegó a subirse")
  if (row.kind !== "document") throw new UnprocessableError("El archivo no es un documento")
}

async function chapterCountOf(tx: Transaction, scriptId: string): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(productionChapters)
    .where(and(eq(productionChapters.scriptId, scriptId), isNull(productionChapters.deletedAt)))

  return row?.value ?? 0
}

/** Nombres de responsables y direcciones de archivo, en dos consultas para todo el lote. */
async function decorateScripts(
  tx: Transaction,
  rows: readonly (typeof productionScripts.$inferSelect)[],
): Promise<ScriptRecord[]> {
  if (rows.length === 0) return []

  const names = await responsibleNames(
    tx,
    rows.map((row) => row.responsibleId),
  )

  const documentIds = [
    ...new Set(rows.map((row) => row.documentUploadId).filter((id) => id !== null)),
  ]
  const documents =
    documentIds.length === 0
      ? []
      : await tx
          .select({ id: uploads.id, url: uploads.url, fileName: uploads.fileName })
          .from(uploads)
          .where(inArray(uploads.id, documentIds))

  const byId = new Map(documents.map((row) => [row.id, row]))

  const counts = new Map<string, number>()
  const scriptIds = rows.map((row) => row.id)
  if (scriptIds.length > 0) {
    const tally = await tx
      .select({ scriptId: productionChapters.scriptId, value: count() })
      .from(productionChapters)
      .where(
        and(inArray(productionChapters.scriptId, scriptIds), isNull(productionChapters.deletedAt)),
      )
      .groupBy(productionChapters.scriptId)

    for (const row of tally) if (row.scriptId !== null) counts.set(row.scriptId, row.value)
  }

  return rows.map((row) => {
    const document = row.documentUploadId === null ? undefined : byId.get(row.documentUploadId)

    return {
      id: row.id,
      productionId: row.productionId,
      name: row.name,
      index: row.index,
      documentUploadId: row.documentUploadId,
      documentUrl: document?.url ?? null,
      documentFileName: document?.fileName ?? null,
      responsibleId: row.responsibleId,
      responsibleName: row.responsibleId === null ? null : (names.get(row.responsibleId) ?? null),
      syncStatus: row.syncStatus,
      syncError: row.syncError,
      syncedAt: row.syncedAt,
      scenesWithoutBody: row.scenesWithoutBody,
      chapterCount: counts.get(row.id) ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  })
}

async function responsibleNames(
  tx: Transaction,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))]
  if (wanted.length === 0) return new Map()

  const rows = await tx
    .select({ id: users.id, name: users.name, lastname: users.lastname })
    .from(users)
    .where(inArray(users.id, wanted))

  return new Map(rows.map((row) => [row.id, [row.name, row.lastname].join(" ").trim()]))
}

export async function loadScript(tx: Transaction, productionId: string, scriptId: string) {
  const [row] = await tx
    .select()
    .from(productionScripts)
    .where(
      and(
        eq(productionScripts.id, scriptId),
        eq(productionScripts.productionId, productionId),
        isNull(productionScripts.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El guion no existe")
  return row
}
