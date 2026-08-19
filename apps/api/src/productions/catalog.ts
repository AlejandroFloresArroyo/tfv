/**
 * Catálogos de una producción: personajes, sets y biblioteca de videos.
 *
 * Ver `openspec/specs/production-management/spec.md`, requisitos «Personajes de la producción»,
 * «Sets de la producción» y «Biblioteca de videos». Rebanada 20, bloque de catálogos.
 *
 * Los tres son listas de referencia que el rodaje consulta: **quién** aparece, **con qué** se viste
 * un decorado, y **cómo debía verse** algo. No son entidades operativas —no cambian de estado ni
 * llevan documento— y por eso comparten forma: nombre, descripción, imagen, responsable.
 *
 * ## Lo que de verdad hay que acertar aquí son las tres bajas
 *
 * Las tres tienen escrito su comportamiento en la spec, y las tres significan cosas distintas:
 *
 * | Se da de baja | Qué le pasa a lo que lo referenciaba |
 * |---|---|
 * | **Personaje** | Sus continuidades **siguen existiendo, sin personaje** |
 * | **Set** | Sus artículos **siguen existiendo** en el inventario |
 * | **Video** | Las piezas de utilería que lo señalaban **desaparecen**, y sus continuidades no |
 *
 * ## Y las tres se escriben a mano, habiendo cascadas declaradas
 *
 * `production_continuities.character_id` propaga a nulo, `production_set_items.set_id` propaga en
 * cascada y `production_props.video_id` también. **Ninguna de las tres se dispara**, porque la baja
 * de las tres entidades es **lógica**: se escribe `deleted_at` y no se borra ninguna fila, así que
 * el motor no tiene qué propagar. Sin escribirlo aquí, una continuidad seguiría diciendo que le
 * toca un personaje que ya nadie puede abrir, y una utilería apuntaría a un video retirado.
 *
 * Las cascadas declaradas siguen siendo la red del día que algo se borre de verdad; lo de aquí es
 * lo que ocurre hoy, en cada baja.
 *
 * ## El video se reproduce, no se descarga
 *
 * «SHALL permitir reproducirlos desde la aplicación», «puede reproducirlo sin descargarlo». Lo que
 * el servidor tiene que dar para eso es **la dirección del archivo**, que es lo que un reproductor
 * consume por partes; el archivo vive en el almacenamiento con lectura pública y se sirve por
 * rangos. No hay endpoint de descarga, y no lo hay a propósito.
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
  companyMembers,
  productionCategories,
  productionCharacters,
  productionContinuities,
  productionItems,
  productionProps,
  productionSetItems,
  productionSets,
  productionVideos,
  uploads,
  users,
} from "@tfv/db/schema"
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import {
  assertUsableImages,
  diffSingle,
  type ImageRef,
  imageRefs,
  releaseUploads,
  sweepObjects,
} from "../media/collections.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { loadProduction } from "./productions.ts"

// ─── Personajes ──────────────────────────────────────────────────────────────

export interface CharacterRecord {
  readonly id: string
  readonly productionId: string
  readonly name: string
  readonly description: string
  readonly imageUploadId: string | null
  readonly imageUrl: string | null
  readonly imageThumbnailUrl: string | null
  readonly responsibleId: string | null
  readonly responsibleName: string | null
  /** Cuántas continuidades lo tienen asignado. Es lo que se pierde al darlo de baja. */
  readonly continuityCount: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export const characterQuery: QuerySchema = {
  filters: {
    responsibleId: { type: "id", label: "Responsable" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["name", "description"],
  sortable: ["name", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
}

const characterMapping = {
  fields: {
    responsibleId: productionCharacters.responsibleId,
    name: productionCharacters.name,
    createdAt: productionCharacters.createdAt,
  },
  searchable: [productionCharacters.name, productionCharacters.description],
  tiebreak: productionCharacters.id,
}

/**
 * Cuántas continuidades vivas apuntan a cada personaje, en **una** consulta.
 *
 * Es el dato que hace útil la advertencia de la baja: «se quedarán sin personaje 12 continuidades»
 * es una advertencia; «se perderán las asignaciones» es una fórmula.
 */
const continuityCount = sql<number>`(
  select count(*) from ${productionContinuities} k
  where k.character_id = ${productionCharacters.id}
)`

export async function listCharacters(
  actor: Actor,
  companyId: string,
  productionId: string,
  query: ParsedQuery,
): Promise<Page<CharacterRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const where = and(
      eq(productionCharacters.productionId, productionId),
      isNull(productionCharacters.deletedAt),
      ...collectionConditions(query, characterMapping),
    )

    const [total] = await tx.select({ value: count() }).from(productionCharacters).where(where)

    const rows = await tx
      .select({
        character: productionCharacters,
        continuityCount,
        responsibleName: displayName,
      })
      .from(productionCharacters)
      .leftJoin(users, eq(users.id, productionCharacters.responsibleId))
      .where(where)
      .orderBy(...collectionOrder(query, characterMapping))
      .limit(limit)
      .offset(offset)

    const images = await imageRefs(
      tx,
      rows.map((row) => row.character.imageUploadId),
    )

    return buildPage(
      rows.map((row) =>
        toCharacter(row.character, images, row.continuityCount, row.responsibleName),
      ),
      total?.value ?? 0,
      page,
      limit,
    )
  })
}

export async function getCharacter(
  actor: Actor,
  companyId: string,
  productionId: string,
  characterId: string,
): Promise<CharacterRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    return characterDetail(tx, productionId, characterId)
  })
}

export interface CharacterInput {
  readonly name: string
  readonly description?: string | undefined
  readonly imageUploadId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

export async function createCharacter(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: CharacterInput,
): Promise<CharacterRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const image = input.imageUploadId ?? null
    if (image !== null) await assertUsableImages(tx, companyId, [image])
    if (input.responsibleId != null) await assertMember(tx, companyId, input.responsibleId)

    const id = newId()
    await tx.insert(productionCharacters).values({
      id,
      productionId,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      imageUploadId: image,
      responsibleId: input.responsibleId ?? null,
    })

    return characterDetail(tx, productionId, id)
  })
}

export interface UpdateCharacterInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
  /** `null` la retira; omitirla la deja como está. */
  readonly imageUploadId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

export async function updateCharacter(
  actor: Actor,
  companyId: string,
  productionId: string,
  characterId: string,
  input: UpdateCharacterInput,
): Promise<CharacterRecord> {
  const { record, released } = await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const current = await loadCharacter(tx, productionId, characterId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description.trim()

    if (input.responsibleId !== undefined) {
      if (input.responsibleId !== null) await assertMember(tx, companyId, input.responsibleId)
      patch.responsibleId = input.responsibleId
    }

    // La imagen se resuelve con el mismo diferencial que una colección de una sola foto: asignar la
    // que ya estaba no retira nada, y quitarla sin poner otra sí.
    const image =
      input.imageUploadId === undefined
        ? undefined
        : diffSingle(current.imageUploadId, input.imageUploadId)

    if (image !== undefined) {
      await assertUsableImages(tx, companyId, image.added)
      patch.imageUploadId = input.imageUploadId
    }

    if (Object.keys(patch).length > 0) {
      await tx
        .update(productionCharacters)
        .set(patch)
        .where(eq(productionCharacters.id, characterId))
    }

    return {
      record: await characterDetail(tx, productionId, characterId),
      released: image === undefined ? undefined : await releaseUploads(tx, image.removed),
    }
  })

  if (released !== undefined) await sweepObjects(released)
  return record
}

/**
 * Da de baja un personaje y **deja sin personaje** sus continuidades.
 *
 * «Eliminar un personaje SHALL dejar sin personaje las continuidades que lo referenciaban, sin
 * eliminarlas.» Se escribe aquí porque la baja es lógica y la propagación a nulo declarada en
 * `production_continuities.character_id` no llega a dispararse — ver la cabecera del módulo.
 *
 * Lo que se conserva es el trabajo: una continuidad es cómo iba vestido y peinado alguien en una
 * jornada concreta, y eso sigue siendo cierto aunque el personaje se retire de la lista.
 */
export async function deleteCharacter(
  actor: Actor,
  companyId: string,
  productionId: string,
  characterId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadCharacter(tx, productionId, characterId)

    await tx
      .update(productionContinuities)
      .set({ characterId: null })
      .where(eq(productionContinuities.characterId, characterId))

    await tx
      .update(productionCharacters)
      .set({ deletedAt: new Date() })
      .where(eq(productionCharacters.id, characterId))
  })
}

// ─── Sets ────────────────────────────────────────────────────────────────────

export interface SetItemRecord {
  readonly itemId: string
  readonly name: string
  readonly code: string
  readonly status: string
}

export interface SetRecord {
  readonly id: string
  readonly productionId: string
  readonly name: string
  readonly description: string
  readonly imageUploadId: string | null
  readonly imageUrl: string | null
  readonly imageThumbnailUrl: string | null
  readonly responsibleId: string | null
  readonly responsibleName: string | null
  readonly itemCount: number
  /** La composición. Sólo en la ficha: un listado de sets no la necesita y son muchas filas. */
  readonly items?: readonly SetItemRecord[]
  readonly createdAt: Date
  readonly updatedAt: Date
}

export const setQuery: QuerySchema = {
  filters: {
    responsibleId: { type: "id", label: "Responsable" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["name", "description"],
  sortable: ["name", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
}

const setMapping = {
  fields: {
    responsibleId: productionSets.responsibleId,
    name: productionSets.name,
    createdAt: productionSets.createdAt,
  },
  searchable: [productionSets.name, productionSets.description],
  tiebreak: productionSets.id,
}

/**
 * Cuántos artículos **vivos** compone cada set.
 *
 * Se exige que el artículo no esté dado de baja: la baja del artículo retira sus filas de
 * `production_set_items`, así que hoy no debería haber ninguna colgando — pero contar sin la
 * condición haría que el recuento dependiera de que esa retirada nunca falle, y un recuento que
 * miente no se nota hasta que alguien busca el artículo que dice tener.
 */
const setItemCount = sql<number>`(
  select count(*) from ${productionSetItems} si
  join ${productionItems} i on i.id = si.item_id and i.deleted_at is null
  where si.set_id = ${productionSets.id}
)`

const displayName = sql<
  string | null
>`nullif(trim(concat_ws(' ', ${users.name}, ${users.lastname})), '')`

export async function listSets(
  actor: Actor,
  companyId: string,
  productionId: string,
  query: ParsedQuery,
): Promise<Page<SetRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const where = and(
      eq(productionSets.productionId, productionId),
      isNull(productionSets.deletedAt),
      ...collectionConditions(query, setMapping),
    )

    const [total] = await tx.select({ value: count() }).from(productionSets).where(where)

    const rows = await tx
      .select({ set: productionSets, itemCount: setItemCount, responsibleName: displayName })
      .from(productionSets)
      .leftJoin(users, eq(users.id, productionSets.responsibleId))
      .where(where)
      .orderBy(...collectionOrder(query, setMapping))
      .limit(limit)
      .offset(offset)

    const images = await imageRefs(
      tx,
      rows.map((row) => row.set.imageUploadId),
    )

    return buildPage(
      rows.map((row) => toSet(row.set, images, row.itemCount, row.responsibleName)),
      total?.value ?? 0,
      page,
      limit,
    )
  })
}

export async function getSet(
  actor: Actor,
  companyId: string,
  productionId: string,
  setId: string,
): Promise<SetRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    return setDetail(tx, productionId, setId)
  })
}

export interface SetInput {
  readonly name: string
  readonly description?: string | undefined
  readonly imageUploadId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

export async function createSet(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: SetInput,
): Promise<SetRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const image = input.imageUploadId ?? null
    if (image !== null) await assertUsableImages(tx, companyId, [image])
    if (input.responsibleId != null) await assertMember(tx, companyId, input.responsibleId)

    const id = newId()
    await tx.insert(productionSets).values({
      id,
      productionId,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      imageUploadId: image,
      responsibleId: input.responsibleId ?? null,
    })

    return setDetail(tx, productionId, id)
  })
}

export interface UpdateSetInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
  readonly imageUploadId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

export async function updateSet(
  actor: Actor,
  companyId: string,
  productionId: string,
  setId: string,
  input: UpdateSetInput,
): Promise<SetRecord> {
  const { record, released } = await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const current = await loadSet(tx, productionId, setId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description.trim()

    if (input.responsibleId !== undefined) {
      if (input.responsibleId !== null) await assertMember(tx, companyId, input.responsibleId)
      patch.responsibleId = input.responsibleId
    }

    const image =
      input.imageUploadId === undefined
        ? undefined
        : diffSingle(current.imageUploadId, input.imageUploadId)

    if (image !== undefined) {
      await assertUsableImages(tx, companyId, image.added)
      patch.imageUploadId = input.imageUploadId
    }

    if (Object.keys(patch).length > 0) {
      await tx.update(productionSets).set(patch).where(eq(productionSets.id, setId))
    }

    return {
      record: await setDetail(tx, productionId, setId),
      released: image === undefined ? undefined : await releaseUploads(tx, image.removed),
    }
  })

  if (released !== undefined) await sweepObjects(released)
  return record
}

/**
 * Establece de una vez la composición de un set.
 *
 * Se envía **el conjunto entero** y el servidor diferencia, igual que una galería de fotos y por lo
 * mismo: componer un decorado es decir «lleva esto», no ir apuntando altas y bajas sueltas cuyo
 * resultado depende del orden en que lleguen.
 *
 * **Un artículo puede estar en varios sets**, que es el requisito escrito: el único que lo impediría
 * sería un índice único por artículo, y `production_set_items_unique` es `(set_id, item_id)` — el
 * par, no el artículo. Lo que no se admite es repetirlo dentro del mismo set, y de eso se encarga
 * quitar las repeticiones antes de escribir.
 */
export async function setSetItems(
  actor: Actor,
  companyId: string,
  productionId: string,
  setId: string,
  itemIds: readonly string[],
): Promise<SetRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadSet(tx, productionId, setId)

    const wanted = [...new Set(itemIds)]
    await assertItems(tx, productionId, wanted)

    const existing = await tx
      .select({ itemId: productionSetItems.itemId })
      .from(productionSetItems)
      .where(eq(productionSetItems.setId, setId))

    const before = new Set(existing.map((row) => row.itemId))
    const after = new Set(wanted)

    const removed = [...before].filter((id) => !after.has(id))
    const added = wanted.filter((id) => !before.has(id))

    if (removed.length > 0) {
      await tx
        .delete(productionSetItems)
        .where(
          and(eq(productionSetItems.setId, setId), inArray(productionSetItems.itemId, removed)),
        )
    }

    if (added.length > 0) {
      await tx
        .insert(productionSetItems)
        .values(added.map((itemId) => ({ id: newId(), setId, itemId })))
    }

    return setDetail(tx, productionId, setId)
  })
}

/**
 * Da de baja un set. **Sus artículos no se tocan.**
 *
 * «Eliminar un set SHALL no eliminar los artículos que lo componían», y el escenario lo dice
 * entero: «los artículos siguen existiendo en el inventario de la producción».
 *
 * Las filas de composición **se conservan**, y es deliberado: `production_set_items` no tiene
 * borrado lógico propio, así que retirarlas aquí haría que restaurar el set lo devolviera vacío —
 * un decorado que vuelve sin nada dentro no es el decorado que se dio de baja. Todo lo que lee la
 * composición filtra por el set vivo, así que un set dado de baja no aparece en ninguna parte,
 * incluida la consulta de dónde se usa un artículo. Es el mismo criterio con el que la galería de
 * un producto sobrevive a su borrado lógico.
 */
export async function deleteSet(
  actor: Actor,
  companyId: string,
  productionId: string,
  setId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadSet(tx, productionId, setId)

    await tx.update(productionSets).set({ deletedAt: new Date() }).where(eq(productionSets.id, setId))
  })
}

// ─── Biblioteca de videos ────────────────────────────────────────────────────

export interface VideoRecord {
  readonly id: string
  readonly productionId: string
  readonly categoryId: string | null
  readonly categoryName: string | null
  readonly name: string
  readonly videoUploadId: string | null
  /** La dirección con la que se reproduce. Nula mientras no tenga archivo. */
  readonly videoUrl: string | null
  readonly responsibleId: string | null
  readonly responsibleName: string | null
  /** Cuántas piezas de utilería lo señalan. Es lo que desaparece al darlo de baja. */
  readonly propCount: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export const videoQuery: QuerySchema = {
  filters: {
    categoryId: { type: "id", label: "Categoría" },
    responsibleId: { type: "id", label: "Responsable" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["name"],
  sortable: ["name", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
}

const videoMapping = {
  fields: {
    categoryId: productionVideos.categoryId,
    responsibleId: productionVideos.responsibleId,
    name: productionVideos.name,
    createdAt: productionVideos.createdAt,
  },
  searchable: [productionVideos.name],
  tiebreak: productionVideos.id,
}

const videoCategoryName = sql<string>`(
  select c.name from ${productionCategories} c where c.id = ${productionVideos.categoryId}
)`

const propCount = sql<number>`(
  select count(*) from ${productionProps} p where p.video_id = ${productionVideos.id}
)`

export async function listVideos(
  actor: Actor,
  companyId: string,
  productionId: string,
  query: ParsedQuery,
): Promise<Page<VideoRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const where = and(
      eq(productionVideos.productionId, productionId),
      isNull(productionVideos.deletedAt),
      ...collectionConditions(query, videoMapping),
    )

    const [total] = await tx.select({ value: count() }).from(productionVideos).where(where)

    const rows = await tx
      .select({
        video: productionVideos,
        categoryName: videoCategoryName,
        propCount,
        responsibleName: displayName,
        videoUrl: uploads.url,
      })
      .from(productionVideos)
      .leftJoin(users, eq(users.id, productionVideos.responsibleId))
      .leftJoin(uploads, eq(uploads.id, productionVideos.videoUploadId))
      .where(where)
      .orderBy(...collectionOrder(query, videoMapping))
      .limit(limit)
      .offset(offset)

    return buildPage(rows.map(toVideo), total?.value ?? 0, page, limit)
  })
}

export async function getVideo(
  actor: Actor,
  companyId: string,
  productionId: string,
  videoId: string,
): Promise<VideoRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    return videoDetail(tx, productionId, videoId)
  })
}

export interface VideoInput {
  readonly name: string
  readonly videoUploadId?: string | null | undefined
  readonly categoryId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

export async function createVideo(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: VideoInput,
): Promise<VideoRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    if (input.videoUploadId != null) await assertUsableVideo(tx, companyId, input.videoUploadId)
    if (input.categoryId != null) await assertCategory(tx, productionId, input.categoryId)
    if (input.responsibleId != null) await assertMember(tx, companyId, input.responsibleId)

    const id = newId()
    await tx.insert(productionVideos).values({
      id,
      productionId,
      name: input.name.trim(),
      videoUploadId: input.videoUploadId ?? null,
      categoryId: input.categoryId ?? null,
      responsibleId: input.responsibleId ?? null,
    })

    return videoDetail(tx, productionId, id)
  })
}

export interface UpdateVideoInput {
  readonly name?: string | undefined
  readonly videoUploadId?: string | null | undefined
  readonly categoryId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

export async function updateVideo(
  actor: Actor,
  companyId: string,
  productionId: string,
  videoId: string,
  input: UpdateVideoInput,
): Promise<VideoRecord> {
  const { record, released } = await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const current = await loadVideo(tx, productionId, videoId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()

    if (input.categoryId !== undefined) {
      if (input.categoryId !== null) await assertCategory(tx, productionId, input.categoryId)
      patch.categoryId = input.categoryId
    }

    if (input.responsibleId !== undefined) {
      if (input.responsibleId !== null) await assertMember(tx, companyId, input.responsibleId)
      patch.responsibleId = input.responsibleId
    }

    // El archivo se sustituye con el mismo diferencial que una imagen: el anterior se suelta sólo si
    // dejó de estar referenciado, y sustituirlo por sí mismo no retira nada.
    const file =
      input.videoUploadId === undefined
        ? undefined
        : diffSingle(current.videoUploadId, input.videoUploadId)

    if (file !== undefined) {
      for (const uploadId of file.added) await assertUsableVideo(tx, companyId, uploadId)
      patch.videoUploadId = input.videoUploadId
    }

    if (Object.keys(patch).length > 0) {
      await tx.update(productionVideos).set(patch).where(eq(productionVideos.id, videoId))
    }

    return {
      record: await videoDetail(tx, productionId, videoId),
      released: file === undefined ? undefined : await releaseUploads(tx, file.removed),
    }
  })

  if (released !== undefined) await sweepObjects(released)
  return record
}

/**
 * Da de baja un video y **retira la utilería que lo señalaba**.
 *
 * «Eliminar un video SHALL eliminar las referencias de utilería que lo señalaban, sin afectar a las
 * continuidades que las contenían.»
 *
 * La pieza de utilería **se elimina** en lugar de quedarse sin video, y no hay otra opción: la
 * restricción `production_props_item_xor_video` exige artículo **o** video, nunca ninguno de los
 * dos. Una utilería sin nada a lo que apuntar no puede existir, y es coherente con lo que significa
 * —«así debía verse esto»—: sin el video no queda referencia ninguna, sólo una fila vacía.
 *
 * La continuidad que la contenía sigue existiendo, con el resto de su utilería.
 */
export async function deleteVideo(
  actor: Actor,
  companyId: string,
  productionId: string,
  videoId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadVideo(tx, productionId, videoId)

    await tx.delete(productionProps).where(eq(productionProps.videoId, videoId))

    await tx
      .update(productionVideos)
      .set({ deletedAt: new Date() })
      .where(eq(productionVideos.id, videoId))
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/**
 * El responsable es de esta empresa.
 *
 * Las claves foráneas se comprueban con los permisos del dueño de la tabla y **se saltan las
 * políticas de fila**, así que el motor aceptaría el identificador de alguien de otra empresa: quien
 * lo escribiera no podría leerlo de vuelta, pero habría dejado escrita una referencia entre
 * arrendatarios. Es la misma cautela que `categories.ts` toma con el rol.
 *
 * Se resuelve por la membresía y no por la tabla de personas: pertenecer a la empresa es lo que hace
 * a alguien asignable, y la tabla de personas es de plataforma.
 */
async function assertMember(tx: Transaction, companyId: string, userId: string): Promise<void> {
  const [row] = await tx
    .select({ id: companyMembers.id })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.userId, userId),
        eq(companyMembers.companyId, companyId),
        // Una membresía desactivada conserva el registro y pierde el acceso: asignarle trabajo
        // sería dirigirlo a alguien que no puede entrar a verlo.
        eq(companyMembers.isActive, true),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("Esa persona no pertenece a la empresa")
}

async function assertCategory(
  tx: Transaction,
  productionId: string,
  categoryId: string,
): Promise<void> {
  const [row] = await tx
    .select({ id: productionCategories.id })
    .from(productionCategories)
    .where(
      and(
        eq(productionCategories.id, categoryId),
        eq(productionCategories.productionId, productionId),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La categoría no existe en esta producción")
}

/**
 * Los artículos existen y son de esta producción.
 *
 * Uno de otra producción responde **que no existe**, no que no se puede: distinguir las dos cosas
 * sería confirmar que existe, y eso ya es información sobre otro rodaje —que puede ser de otra
 * empresa—.
 */
async function assertItems(
  tx: Transaction,
  productionId: string,
  itemIds: readonly string[],
): Promise<void> {
  if (itemIds.length === 0) return

  const rows = await tx
    .select({ id: productionItems.id })
    .from(productionItems)
    .where(
      and(
        inArray(productionItems.id, [...itemIds]),
        eq(productionItems.productionId, productionId),
        isNull(productionItems.deletedAt),
      ),
    )

  if (rows.length !== itemIds.length) {
    throw new NotFoundError("Alguno de los artículos no existe en esta producción")
  }
}

/**
 * Que el archivo exista, sea de esta empresa y sea un video subido.
 *
 * Es `assertUsableImages` con la clase cambiada, y por eso no se reutiliza: aquélla exige
 * `kind = "image"` y rechazaría todo video. Las tres comprobaciones que sí se comparten —existe,
 * está bajo el prefijo de la empresa, llegó a subirse— se repiten aquí con el mismo criterio y las
 * mismas respuestas.
 */
async function assertUsableVideo(
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

  if (!row) throw new NotFoundError("El video no existe")
  // La misma respuesta para uno de otra empresa: distinguirla sería confirmar que existe.
  if (!row.isPlaceholder && !row.storagePath.startsWith(`${companyId}/`)) {
    throw new NotFoundError("El video no existe")
  }
  if (row.status !== "uploaded") throw new NotFoundError("El video no llegó a subirse")
  if (row.kind !== "video") throw new NotFoundError("El archivo no es un video")
}

export async function loadCharacter(
  tx: Transaction,
  productionId: string,
  characterId: string,
) {
  const [row] = await tx
    .select()
    .from(productionCharacters)
    .where(
      and(
        eq(productionCharacters.id, characterId),
        eq(productionCharacters.productionId, productionId),
        isNull(productionCharacters.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El personaje no existe")
  return row
}

export async function loadSet(tx: Transaction, productionId: string, setId: string) {
  const [row] = await tx
    .select()
    .from(productionSets)
    .where(
      and(
        eq(productionSets.id, setId),
        eq(productionSets.productionId, productionId),
        isNull(productionSets.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El set no existe")
  return row
}

export async function loadVideo(tx: Transaction, productionId: string, videoId: string) {
  const [row] = await tx
    .select()
    .from(productionVideos)
    .where(
      and(
        eq(productionVideos.id, videoId),
        eq(productionVideos.productionId, productionId),
        isNull(productionVideos.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El video no existe")
  return row
}

async function characterDetail(
  tx: Transaction,
  productionId: string,
  characterId: string,
): Promise<CharacterRecord> {
  const [row] = await tx
    .select({
      character: productionCharacters,
      continuityCount,
      responsibleName: displayName,
    })
    .from(productionCharacters)
    .leftJoin(users, eq(users.id, productionCharacters.responsibleId))
    .where(
      and(
        eq(productionCharacters.id, characterId),
        eq(productionCharacters.productionId, productionId),
        isNull(productionCharacters.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El personaje no existe")

  const images = await imageRefs(tx, [row.character.imageUploadId])
  return toCharacter(row.character, images, row.continuityCount, row.responsibleName)
}

async function setDetail(
  tx: Transaction,
  productionId: string,
  setId: string,
): Promise<SetRecord> {
  const [row] = await tx
    .select({ set: productionSets, itemCount: setItemCount, responsibleName: displayName })
    .from(productionSets)
    .leftJoin(users, eq(users.id, productionSets.responsibleId))
    .where(
      and(
        eq(productionSets.id, setId),
        eq(productionSets.productionId, productionId),
        isNull(productionSets.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El set no existe")

  const items = await tx
    .select({
      itemId: productionItems.id,
      name: productionItems.name,
      code: productionItems.code,
      status: productionItems.status,
    })
    .from(productionSetItems)
    .innerJoin(productionItems, eq(productionItems.id, productionSetItems.itemId))
    .where(and(eq(productionSetItems.setId, setId), isNull(productionItems.deletedAt)))
    .orderBy(asc(productionItems.name))

  const images = await imageRefs(tx, [row.set.imageUploadId])
  return { ...toSet(row.set, images, row.itemCount, row.responsibleName), items }
}

async function videoDetail(
  tx: Transaction,
  productionId: string,
  videoId: string,
): Promise<VideoRecord> {
  const [row] = await tx
    .select({
      video: productionVideos,
      categoryName: videoCategoryName,
      propCount,
      responsibleName: displayName,
      videoUrl: uploads.url,
    })
    .from(productionVideos)
    .leftJoin(users, eq(users.id, productionVideos.responsibleId))
    .leftJoin(uploads, eq(uploads.id, productionVideos.videoUploadId))
    .where(
      and(
        eq(productionVideos.id, videoId),
        eq(productionVideos.productionId, productionId),
        isNull(productionVideos.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El video no existe")
  return toVideo(row)
}

function toCharacter(
  row: typeof productionCharacters.$inferSelect,
  images: ReadonlyMap<string, ImageRef>,
  continuities: number,
  responsibleName: string | null,
): CharacterRecord {
  const image = row.imageUploadId === null ? undefined : images.get(row.imageUploadId)

  return {
    id: row.id,
    productionId: row.productionId,
    name: row.name,
    description: row.description,
    imageUploadId: row.imageUploadId,
    imageUrl: image?.url ?? null,
    imageThumbnailUrl: image?.thumbnailUrl ?? null,
    responsibleId: row.responsibleId,
    responsibleName,
    continuityCount: Number(continuities),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toSet(
  row: typeof productionSets.$inferSelect,
  images: ReadonlyMap<string, ImageRef>,
  items: number,
  responsibleName: string | null,
): SetRecord {
  const image = row.imageUploadId === null ? undefined : images.get(row.imageUploadId)

  return {
    id: row.id,
    productionId: row.productionId,
    name: row.name,
    description: row.description,
    imageUploadId: row.imageUploadId,
    imageUrl: image?.url ?? null,
    imageThumbnailUrl: image?.thumbnailUrl ?? null,
    responsibleId: row.responsibleId,
    responsibleName,
    itemCount: Number(items),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toVideo(row: {
  video: typeof productionVideos.$inferSelect
  categoryName: string | null
  propCount: number
  responsibleName: string | null
  videoUrl: string | null
}): VideoRecord {
  return {
    id: row.video.id,
    productionId: row.video.productionId,
    categoryId: row.video.categoryId,
    categoryName: row.categoryName,
    name: row.video.name,
    videoUploadId: row.video.videoUploadId,
    videoUrl: row.videoUrl,
    responsibleId: row.video.responsibleId,
    responsibleName: row.responsibleName,
    propCount: Number(row.propCount),
    createdAt: row.video.createdAt,
    updatedAt: row.video.updatedAt,
  }
}
