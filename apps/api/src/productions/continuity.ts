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
  productionCharacters,
  productionContinuities,
  productionItems,
  productionProps,
  productionRecordings,
  productionScenes,
  productionVideos,
  users,
} from "@tfv/db/schema"
import { and, count, eq, inArray, isNotNull, isNull } from "drizzle-orm"
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
 * Una pieza de utilería, **tal y como se pide crearla**.
 *
 * Éste es el candado de la exclusión, y está aquí y no en un manejador a propósito: el tipo no
 * puede expresar «las dos» ni «ninguna». No hay un objeto con dos campos opcionales que alguien
 * tenga que acordarse de comprobar — hay dos formas, y cada una trae exactamente una referencia.
 *
 * Debajo todavía queda una capa más: la restricción de comprobación
 * `production_props_item_xor_video`, que lo sostiene aunque el código se equivoque. Y encima hay
 * otra: el transporte tiene un camino por tipo, así que ni siquiera se puede pedir. Tres capas
 * para una regla que en la spec ocupa una línea, porque la línea dice **por qué** importa: un
 * artículo es algo que existe y hay que llevar al set; un video es documentación de cómo debía
 * verse. Confundirlos manda a alguien a buscar por la nave un objeto que nunca existió.
 */
export type PropRef =
  | { readonly kind: "item"; readonly itemId: string }
  | { readonly kind: "video"; readonly videoId: string }

export type PropKind = PropRef["kind"]

/** Una pieza de utilería ya registrada, con su referencia resuelta. */
export interface PropRecord {
  readonly id: string
  readonly continuityId: string
  readonly kind: PropKind
  readonly itemId: string | null
  readonly videoId: string | null
  /** El nombre de lo referenciado. Es lo que se lee en el set, no el identificador. */
  readonly name: string
  /** La etiqueta del artículo. Nula en los videos, que no llevan ninguna. */
  readonly code: string | null
  readonly createdAt: Date
}

/** Cómo aparece un personaje en una jornada. Puede quedarse sin personaje. */
export interface ContinuityRecord {
  readonly id: string
  readonly recordingId: string
  readonly characterId: string | null
  readonly characterName: string | null
  readonly responsibleId: string | null
  readonly responsibleName: string | null
  readonly props: readonly PropRecord[]
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** La jornada con todo lo que cuelga de ella. Es lo que devuelve abrir una jornada. */
export interface RecordingDetail extends RecordingRecord {
  readonly continuities: readonly ContinuityRecord[]
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

/**
 * La jornada entera, de una sola vez.
 *
 * «La consulta de una jornada SHALL devolver su escena con su capítulo, y sus continuidades con su
 * personaje y su utilería resuelta.» Es una consulta y no cinco porque quien abre una jornada las
 * quiere todas: sin esto la pantalla de continuidad pediría una por personaje.
 */
export async function getRecording(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
): Promise<RecordingDetail> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const row = await loadRecording(tx, productionId, recordingId)

    return detailOf(tx, row)
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

/**
 * Da de baja la jornada.
 *
 * «Eliminar una jornada de rodaje SHALL eliminar sus continuidades y la utilería de éstas, y SHALL
 * desvincularla de su escena.»
 *
 * Baja **lógica**, y una sola fila. El modelo le da columna de baja a la jornada —y no a la
 * continuidad—, así que ésta es la forma que el modelo pide, la misma que la del plan de trabajo.
 * Las continuidades desaparecen con ella porque **toda** lectura de este módulo parte de la
 * jornada y la filtra; los artículos y los videos referenciados no se tocan, que es lo que la spec
 * protege. Y «desvincularla de su escena» se cumple sin escribir nada: quien mira desde la escena
 * también filtra las bajas.
 *
 * La asimetría entre esta baja y la de la continuidad —física— está anotada en `HALLAZGOS.md`
 * H-187, con el aviso para quien escriba «dónde se ha usado un artículo».
 */
export async function deleteRecording(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadRecording(tx, productionId, recordingId)

    await tx
      .update(productionRecordings)
      .set({ deletedAt: new Date() })
      .where(eq(productionRecordings.id, recordingId))
  })
}

// ─── Asignar el reparto ──────────────────────────────────────────────────────

/**
 * Asigna varios personajes de una vez, creando una continuidad por cada uno.
 *
 * Dos cosas que la spec pide juntas y que se hacen en la misma transacción:
 *
 * 1. **No se duplica un personaje ya asignado.** Se resta lo que ya está antes de insertar. El
 *    motor no ayuda aquí —`production_continuities` no tiene único parcial sobre
 *    `(recording_id, character_id)`, y no puede tenerlo a secas porque la columna admite nulo a
 *    propósito—, así que el candado es esta resta y sólo esta resta (`HALLAZGOS.md` H-184).
 * 2. **La jornada pasa a en curso**, «porque asignar el reparto es el acto con el que empieza el
 *    trabajo». Sin condición sobre el estado de partida: la spec lo declara de la acción, no de
 *    una transición concreta.
 *
 * Asignar cero personajes es una petición legítima que no cambia nada, y aun así abre la jornada:
 * es la misma acción.
 */
export async function assignCharacters(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
  characterIds: readonly string[],
): Promise<RecordingDetail> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadRecording(tx, productionId, recordingId)

    const wanted = [...new Set(characterIds)]
    await requireCharacters(tx, productionId, wanted)

    const existing = await tx
      .select({ characterId: productionContinuities.characterId })
      .from(productionContinuities)
      .where(eq(productionContinuities.recordingId, recordingId))

    const already = new Set(existing.map((row) => row.characterId).filter((id) => id !== null))
    const missing = wanted.filter((id) => !already.has(id))

    if (missing.length > 0) {
      await tx
        .insert(productionContinuities)
        .values(missing.map((characterId) => ({ id: newId(), recordingId, characterId })))
    }

    const [updated] = await tx
      .update(productionRecordings)
      .set({ status: "ongoing" })
      .where(eq(productionRecordings.id, recordingId))
      .returning()

    if (!updated) throw new NotFoundError("La jornada de rodaje no existe")
    return detailOf(tx, updated)
  })
}

// ─── Continuidades ───────────────────────────────────────────────────────────

export interface CreateContinuityInput {
  readonly characterId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

/**
 * Abre una continuidad suelta.
 *
 * Sirve para lo que la spec llama «elementos que no corresponden a ningún personaje en concreto»:
 * sin personaje, que es un caso legítimo y no un dato que falte. Por eso **no** pone la jornada en
 * curso: eso lo hace asignar el reparto, que es otro acto.
 */
export async function createContinuity(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
  input: CreateContinuityInput,
): Promise<ContinuityRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadRecording(tx, productionId, recordingId)

    const characterId = input.characterId ?? null
    if (characterId !== null) await requireCharacters(tx, productionId, [characterId])

    const [created] = await tx
      .insert(productionContinuities)
      .values({
        id: newId(),
        recordingId,
        characterId,
        responsibleId: input.responsibleId ?? null,
      })
      .returning()

    if (!created) throw new Error("la inserción de la continuidad no devolvió fila")
    return (await decorateContinuities(tx, [created]))[0] as ContinuityRecord
  })
}

/**
 * Pone o retira el personaje de una continuidad.
 *
 * Retirarlo **no la elimina y no toca su utilería**: la continuidad sigue existiendo, ahora sin
 * dueño. Es exactamente el escenario «Se retira el personaje de una continuidad», y el motivo por
 * el que esta operación tiene clave propia en el catálogo (`productions.continuities.character`).
 */
export async function setContinuityCharacter(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
  continuityId: string,
  characterId: string | null,
): Promise<ContinuityRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadRecording(tx, productionId, recordingId)
    await loadContinuity(tx, recordingId, continuityId)

    if (characterId !== null) await requireCharacters(tx, productionId, [characterId])

    const [updated] = await tx
      .update(productionContinuities)
      .set({ characterId })
      .where(eq(productionContinuities.id, continuityId))
      .returning()

    if (!updated) throw new NotFoundError("La continuidad no existe")
    return (await decorateContinuities(tx, [updated]))[0] as ContinuityRecord
  })
}

/**
 * Elimina una continuidad.
 *
 * «Eliminar una continuidad SHALL eliminar sus piezas de utilería y desvincularla de su jornada,
 * sin eliminar los artículos ni los videos referenciados.»
 *
 * Es una sola fila, y ninguna más. La utilería se va por la clave foránea —`production_props`
 * cascadea desde la continuidad— y los artículos y los videos ni se enteran, porque la referencia
 * va de la pieza al artículo y no al revés. Recorrer la cascada a mano es lo que produjo el C-08.
 *
 * El borrado es **físico** y no lógico porque el modelo no le da columna de baja a la continuidad,
 * al contrario que a la jornada. La asimetría está anotada en `HALLAZGOS.md` H-187.
 */
export async function deleteContinuity(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
  continuityId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadRecording(tx, productionId, recordingId)
    await loadContinuity(tx, recordingId, continuityId)

    await tx.delete(productionContinuities).where(eq(productionContinuities.id, continuityId))
  })
}

// ─── Utilería ────────────────────────────────────────────────────────────────

/**
 * Cuelga un artículo del inventario de la producción.
 *
 * Repetir el mismo artículo devuelve **el que ya estaba** en lugar de fallar: la utilería de una
 * continuidad es un conjunto, no una cuenta. El motor ya lo impide con el único parcial
 * `production_props_item_unique`; aquí se traduce en la respuesta que el llamante espera.
 */
export async function addContinuityItem(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
  continuityId: string,
  itemId: string,
): Promise<PropRecord> {
  return addProp(actor, companyId, productionId, recordingId, continuityId, {
    kind: "item",
    itemId,
  })
}

/** Cuelga un video de referencia. Simétrica de la anterior, y con su propia clave de permiso. */
export async function addContinuityVideo(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
  continuityId: string,
  videoId: string,
): Promise<PropRecord> {
  return addProp(actor, companyId, productionId, recordingId, continuityId, {
    kind: "video",
    videoId,
  })
}

async function addProp(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
  continuityId: string,
  ref: PropRef,
): Promise<PropRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadRecording(tx, productionId, recordingId)
    await loadContinuity(tx, recordingId, continuityId)
    await requireReferences(tx, productionId, [ref])

    await tx.insert(productionProps).values(propValues(continuityId, ref)).onConflictDoNothing()

    const props = await propsOf(tx, [continuityId])
    const mine = (props.get(continuityId) ?? []).find((prop) =>
      ref.kind === "item" ? prop.itemId === ref.itemId : prop.videoId === ref.videoId,
    )

    if (!mine) throw new Error("la pieza de utilería no quedó registrada")
    return mine
  })
}

/**
 * Establece de una vez el conjunto completo de artículos.
 *
 * «La operación SHALL ser atómica y no SHALL afectar a las piezas que referencian videos.» Las dos
 * cosas salen de cómo está escrita, no de una comprobación:
 *
 * - **Atómica** porque `withRequester` abre una transacción y todo ocurre dentro. O están las tres
 *   escrituras o no está ninguna.
 * - **Sin tocar los videos** porque el conjunto de partida se lee filtrando por `item_id is not
 *   null`. Las piezas de video no entran en la diferencia, así que no hay forma de que salgan de
 *   ella.
 */
export async function setContinuityItems(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
  continuityId: string,
  itemIds: readonly string[],
): Promise<ContinuityRecord> {
  return reconcileProps(actor, companyId, productionId, recordingId, continuityId, "item", itemIds)
}

/** Establece de una vez el conjunto completo de videos. Simétrica, y sin tocar los artículos. */
export async function setContinuityVideos(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
  continuityId: string,
  videoIds: readonly string[],
): Promise<ContinuityRecord> {
  return reconcileProps(
    actor,
    companyId,
    productionId,
    recordingId,
    continuityId,
    "video",
    videoIds,
  )
}

async function reconcileProps(
  actor: Actor,
  companyId: string,
  productionId: string,
  recordingId: string,
  continuityId: string,
  kind: PropKind,
  ids: readonly string[],
): Promise<ContinuityRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadRecording(tx, productionId, recordingId)
    const continuity = await loadContinuity(tx, recordingId, continuityId)

    const wanted = [...new Set(ids)]
    const refs = wanted.map(
      (id): PropRef =>
        kind === "item" ? { kind: "item", itemId: id } : { kind: "video", videoId: id },
    )
    await requireReferences(tx, productionId, refs)

    // El conjunto de partida es **sólo el de este tipo**. Lo del otro tipo no entra en la
    // diferencia, así que la reconciliación no puede quitarlo.
    const column = kind === "item" ? productionProps.itemId : productionProps.videoId
    const current = await tx
      .select({ id: productionProps.id, referenceId: column })
      .from(productionProps)
      .where(and(eq(productionProps.continuityId, continuityId), isNotNull(column)))

    const keep = new Set(wanted)
    const surplus = current.filter((row) => row.referenceId === null || !keep.has(row.referenceId))
    const present = new Set(current.map((row) => row.referenceId))
    const missing = refs.filter((ref) =>
      ref.kind === "item" ? !present.has(ref.itemId) : !present.has(ref.videoId),
    )

    if (surplus.length > 0) {
      await tx.delete(productionProps).where(
        inArray(
          productionProps.id,
          surplus.map((row) => row.id),
        ),
      )
    }

    if (missing.length > 0) {
      await tx.insert(productionProps).values(missing.map((ref) => propValues(continuityId, ref)))
    }

    return (await decorateContinuities(tx, [continuity]))[0] as ContinuityRecord
  })
}

/**
 * La única forma de construir la fila de una pieza.
 *
 * Toda inserción pasa por aquí, y aquí la referencia llega ya decidida por el tipo: una rama pone
 * el artículo y anula el video, la otra al revés. No hay tercera rama que escribir mal.
 */
function propValues(continuityId: string, ref: PropRef) {
  return ref.kind === "item"
    ? { id: newId(), continuityId, itemId: ref.itemId, videoId: null }
    : { id: newId(), continuityId, itemId: null, videoId: ref.videoId }
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/** La jornada con sus continuidades, dentro de la transacción que ya está abierta. */
async function detailOf(
  tx: Transaction,
  row: typeof productionRecordings.$inferSelect,
): Promise<RecordingDetail> {
  const [recording] = await decorateRecordings(tx, [row])
  if (!recording) throw new NotFoundError("La jornada de rodaje no existe")

  const rows = await tx
    .select()
    .from(productionContinuities)
    .where(eq(productionContinuities.recordingId, row.id))
    .orderBy(productionContinuities.createdAt, productionContinuities.id)

  return { ...recording, continuities: await decorateContinuities(tx, rows) }
}

async function decorateContinuities(
  tx: Transaction,
  rows: readonly (typeof productionContinuities.$inferSelect)[],
): Promise<ContinuityRecord[]> {
  if (rows.length === 0) return []

  const characterIds = [
    ...new Set(rows.map((row) => row.characterId).filter((id): id is string => id !== null)),
  ]
  const characters =
    characterIds.length === 0
      ? []
      : await tx
          .select({ id: productionCharacters.id, name: productionCharacters.name })
          .from(productionCharacters)
          .where(inArray(productionCharacters.id, characterIds))

  const names = new Map(characters.map((row) => [row.id, row.name]))
  const responsibles = await responsibleNames(
    tx,
    rows.map((row) => row.responsibleId),
  )
  const props = await propsOf(
    tx,
    rows.map((row) => row.id),
  )

  return rows.map((row) => ({
    id: row.id,
    recordingId: row.recordingId,
    characterId: row.characterId,
    characterName: row.characterId === null ? null : (names.get(row.characterId) ?? null),
    responsibleId: row.responsibleId,
    responsibleName:
      row.responsibleId === null ? null : (responsibles.get(row.responsibleId) ?? null),
    props: props.get(row.id) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

/**
 * La utilería de un lote de continuidades, **resuelta** y en una sola consulta.
 *
 * «Resuelta» es lo que pide la spec: quien abre una jornada tiene que leer «Chaqueta de mezclilla»,
 * no un identificador. Los dos enlaces son externos porque exactamente uno está puesto en cada
 * fila, que es de lo que trata toda esta parte.
 */
async function propsOf(
  tx: Transaction,
  continuityIds: readonly string[],
): Promise<Map<string, PropRecord[]>> {
  const byContinuity = new Map<string, PropRecord[]>()
  if (continuityIds.length === 0) return byContinuity

  const rows = await tx
    .select({
      id: productionProps.id,
      continuityId: productionProps.continuityId,
      itemId: productionProps.itemId,
      videoId: productionProps.videoId,
      createdAt: productionProps.createdAt,
      itemName: productionItems.name,
      itemCode: productionItems.code,
      videoName: productionVideos.name,
    })
    .from(productionProps)
    .leftJoin(productionItems, eq(productionItems.id, productionProps.itemId))
    .leftJoin(productionVideos, eq(productionVideos.id, productionProps.videoId))
    .where(inArray(productionProps.continuityId, [...continuityIds]))
    .orderBy(productionProps.createdAt, productionProps.id)

  for (const row of rows) {
    const isItem = row.itemId !== null
    const prop: PropRecord = {
      id: row.id,
      continuityId: row.continuityId,
      kind: isItem ? "item" : "video",
      itemId: row.itemId,
      videoId: row.videoId,
      name: (isItem ? row.itemName : row.videoName) ?? "",
      code: isItem ? row.itemCode : null,
      createdAt: row.createdAt,
    }

    const list = byContinuity.get(row.continuityId)
    if (list) list.push(prop)
    else byContinuity.set(row.continuityId, [prop])
  }

  return byContinuity
}

/**
 * Los artículos y los videos, **resueltos contra la producción**.
 *
 * Un artículo del inventario de otra producción no es utilería de ésta, y el modelo no lo impide:
 * `production_props` apunta a `production_items` y a `production_videos` sin más
 * (`HALLAZGOS.md` H-188).
 */
async function requireReferences(
  tx: Transaction,
  productionId: string,
  refs: readonly PropRef[],
): Promise<void> {
  const itemIds = [...new Set(refs.filter((ref) => ref.kind === "item").map((ref) => ref.itemId))]
  const videoIds = [
    ...new Set(refs.filter((ref) => ref.kind === "video").map((ref) => ref.videoId)),
  ]

  if (itemIds.length > 0) {
    const rows = await tx
      .select({ id: productionItems.id })
      .from(productionItems)
      .where(
        and(
          inArray(productionItems.id, itemIds),
          eq(productionItems.productionId, productionId),
          isNull(productionItems.deletedAt),
        ),
      )

    if (rows.length !== itemIds.length) {
      throw new NotFoundError("Alguno de los artículos no existe en esta producción")
    }
  }

  if (videoIds.length > 0) {
    const rows = await tx
      .select({ id: productionVideos.id })
      .from(productionVideos)
      .where(
        and(
          inArray(productionVideos.id, videoIds),
          eq(productionVideos.productionId, productionId),
          isNull(productionVideos.deletedAt),
        ),
      )

    if (rows.length !== videoIds.length) {
      throw new NotFoundError("Alguno de los videos no existe en esta producción")
    }
  }
}

/**
 * Los personajes, **resueltos contra la producción**.
 *
 * Falla en cuanto uno no sea de esta producción, y no se queda con los que sí: asignar el reparto
 * es una sola acción, y media asignación es peor que ninguna. Ver `HALLAZGOS.md` H-188.
 */
async function requireCharacters(
  tx: Transaction,
  productionId: string,
  characterIds: readonly string[],
): Promise<void> {
  if (characterIds.length === 0) return

  const rows = await tx
    .select({ id: productionCharacters.id })
    .from(productionCharacters)
    .where(
      and(
        inArray(productionCharacters.id, [...characterIds]),
        eq(productionCharacters.productionId, productionId),
        isNull(productionCharacters.deletedAt),
      ),
    )

  if (rows.length !== new Set(characterIds).size) {
    throw new NotFoundError("Alguno de los personajes no existe en esta producción")
  }
}

export async function loadContinuity(tx: Transaction, recordingId: string, continuityId: string) {
  const [row] = await tx
    .select()
    .from(productionContinuities)
    .where(
      and(
        eq(productionContinuities.id, continuityId),
        eq(productionContinuities.recordingId, recordingId),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La continuidad no existe")
  return row
}

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
