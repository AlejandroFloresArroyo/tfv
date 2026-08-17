/**
 * Taxonomía global.
 *
 * Ver `openspec/specs/category-trees/spec.md`.
 *
 * Es la común a toda la plataforma —sectores de empresa, tipos de locación, amenidades, verticales
 * de sitio— y **sólo la administra la plataforma**. Las otras dos taxonomías, la de almacén y la de
 * producción, cuelgan de entidades que todavía no existen: llegan con las rebanadas 12 y 20.
 *
 * ## Qué hace el motor y qué hace esto
 *
 * | Regla | Dónde |
 * |---|---|
 * | Eliminar una categoría elimina su subárbol | Clave foránea en cascada |
 * | Lo clasificado sobrevive y queda sin categoría | Clave foránea a nulo |
 * | El identificador legible es único | Índice único |
 * | No hay ciclos | **Aquí** |
 *
 * El ciclo es el único que el motor no puede impedir por sí solo: una jerarquía por
 * autorreferencia admite que una fila apunte a su propia descendiente sin violar ninguna
 * restricción, y la consulta que lo detecta es recursiva.
 */

import { NotFoundError, newId, slugCandidate, slugify, UnprocessableError } from "@tfv/contracts"
import { type Transaction, withElevated, withRequester } from "@tfv/db"
import { globalCategories, services } from "@tfv/db/schema"
import { and, asc, eq, isNull, sql } from "drizzle-orm"
import type { Actor } from "./companies.ts"

export interface CategoryRecord {
  readonly id: string
  readonly name: string
  /** Nulo sólo en las categorías anteriores a esta rebanada; las nuevas siempre lo llevan. */
  readonly slug: string | null
  readonly parentId: string | null
  readonly serviceId: string | null
  readonly keyname: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** Lo que se lleva por delante eliminar una categoría, para poder advertirlo antes. */
export interface DeletionScope {
  /** Ella misma incluida. */
  readonly categories: number
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export interface ListOptions {
  /**
   * De quién se piden las hijas.
   *
   * Ausente significa **las raíces**, que es lo que la spec pide por omisión: «El listado por
   * defecto muestra las raíces». Devolver el árbol entero obligaría a la interfaz a filtrarlo, y
   * con una taxonomía grande a traérselo entero para enseñar seis.
   */
  readonly parentId?: string | null | undefined
  /** Sólo las de un servicio, para que cada uno ofrezca las suyas y no las ajenas. */
  readonly serviceKeycode?: string | undefined
}

/**
 * Lista categorías.
 *
 * **Pública en lectura**: la taxonomía global aparece en las tiendas y en el directorio de
 * locaciones, que se sirven a quien no ha entrado. Por eso se lee con la vía elevada y no con la
 * del solicitante — no hay solicitante.
 */
export async function listCategories(options: ListOptions = {}): Promise<CategoryRecord[]> {
  return withElevated("lectura pública de la taxonomía global", async (tx) => {
    const serviceId = options.serviceKeycode
      ? await findServiceId(tx, options.serviceKeycode)
      : undefined

    const rows = await tx
      .select()
      .from(globalCategories)
      .where(
        and(
          options.parentId === undefined || options.parentId === null
            ? isNull(globalCategories.parentId)
            : eq(globalCategories.parentId, options.parentId),
          ...(serviceId ? [eq(globalCategories.serviceId, serviceId)] : []),
        ),
      )
      .orderBy(asc(globalCategories.name))

    return rows.map(toRecord)
  })
}

/** Resuelve una categoría por su identificador legible, que es como la nombra una dirección web. */
export async function findBySlug(slug: string): Promise<CategoryRecord | null> {
  return withElevated("lectura pública de la taxonomía global", async (tx) => {
    const [row] = await tx
      .select()
      .from(globalCategories)
      .where(eq(globalCategories.slug, slug))
      .limit(1)

    return row ? toRecord(row) : null
  })
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export interface CategoryInput {
  readonly name: string
  readonly parentId?: string | null | undefined
  readonly serviceKeycode?: string | null | undefined
  readonly keyname?: string | null | undefined
}

export async function createCategory(actor: Actor, input: CategoryInput): Promise<CategoryRecord> {
  return withRequester(actor, async (tx) => {
    if (input.parentId) await loadCategory(tx, input.parentId)

    const serviceId = input.serviceKeycode ? await findServiceId(tx, input.serviceKeycode) : null

    const [created] = await tx
      .insert(globalCategories)
      .values({
        id: newId(),
        name: input.name.trim(),
        slug: await freeSlug(tx, input.name),
        parentId: input.parentId ?? null,
        serviceId,
        keyname: input.keyname ?? null,
      })
      .returning()

    if (!created) throw new Error("la inserción de la categoría no devolvió fila")
    return toRecord(created)
  })
}

export interface ReparentInput {
  readonly name?: string | undefined
  /**
   * El padre nuevo. `null` la promueve a raíz, que es distinto de omitirlo —eso la deja donde
   * está—. Por eso el tipo distingue los tres casos.
   */
  readonly parentId?: string | null | undefined
  readonly serviceKeycode?: string | null | undefined
}

export async function updateCategory(
  actor: Actor,
  categoryId: string,
  input: ReparentInput,
): Promise<CategoryRecord> {
  return withRequester(actor, async (tx) => {
    await loadCategory(tx, categoryId)

    if (input.parentId !== undefined && input.parentId !== null) {
      await loadCategory(tx, input.parentId)
      await assertNoCycle(tx, categoryId, input.parentId)
    }

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.parentId !== undefined) patch.parentId = input.parentId
    if (input.serviceKeycode !== undefined) {
      patch.serviceId = input.serviceKeycode ? await findServiceId(tx, input.serviceKeycode) : null
    }

    if (Object.keys(patch).length === 0) return toRecord(await loadCategory(tx, categoryId))

    const [updated] = await tx
      .update(globalCategories)
      .set(patch)
      .where(eq(globalCategories.id, categoryId))
      .returning()

    if (!updated) throw new NotFoundError("La categoría no existe")
    return toRecord(updated)
  })
}

/**
 * Cuántas categorías se lleva por delante eliminar ésta.
 *
 * La spec pide advertirlo **antes**: «La confirmación previa SHALL indicar cuántas categorías y
 * cuántas entidades resultarán afectadas». Las entidades clasificadas se cuentan cuando existan las
 * tablas que las clasifican — hoy la taxonomía global no clasifica nada todavía.
 */
export async function deletionScope(actor: Actor, categoryId: string): Promise<DeletionScope> {
  return withRequester(actor, async (tx) => {
    await loadCategory(tx, categoryId)
    return { categories: await countSubtree(tx, categoryId) }
  })
}

/**
 * Elimina una categoría y su subárbol.
 *
 * La cascada la hace **el motor**, con la clave foránea autorreferente. Recorrer el subárbol a mano
 * es donde la implementación anterior se equivocaba: veinte funciones de borrado escritas a mano, y
 * tres de ellas borrando de la tabla equivocada (`DEFECTS.md` C-08).
 */
export async function deleteCategory(actor: Actor, categoryId: string): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadCategory(tx, categoryId)
    await tx.delete(globalCategories).where(eq(globalCategories.id, categoryId))
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/**
 * Rechaza convertir a una categoría en su propia ancestra.
 *
 * Se recorre hacia arriba desde el padre propuesto: si por el camino aparece la categoría que se
 * está moviendo, el movimiento cerraría un ciclo. Es una consulta recursiva porque la profundidad
 * no tiene límite — la spec dice «a cualquier profundidad» y el esquema no lo acota.
 *
 * Sin esto, el subárbol quedaría desconectado del resto del árbol y **no volvería a aparecer en
 * ningún listado**: ni entre las raíces, porque tiene padre, ni bajo ninguna raíz alcanzable.
 */
async function assertNoCycle(
  tx: Transaction,
  categoryId: string,
  newParentId: string,
): Promise<void> {
  if (categoryId === newParentId) {
    throw new UnprocessableError("Una categoría no puede ser su propio padre")
  }

  const result = await tx.execute(sql`
    with recursive ancestros as (
      select id, parent_id from global_categories where id = ${newParentId}
      union all
      select c.id, c.parent_id
      from global_categories c
      join ancestros a on c.id = a.parent_id
    )
    select 1 from ancestros where id = ${categoryId} limit 1
  `)

  if (result.length > 0) {
    throw new UnprocessableError("Una categoría no puede colgar de una de sus descendientes")
  }
}

async function countSubtree(tx: Transaction, categoryId: string): Promise<number> {
  const result = await tx.execute(sql`
    with recursive descendientes as (
      select id from global_categories where id = ${categoryId}
      union all
      select c.id
      from global_categories c
      join descendientes d on c.parent_id = d.id
    )
    select count(*)::int as total from descendientes
  `)

  const [row] = result as unknown as { total: number }[]
  return row?.total ?? 0
}

/**
 * Un identificador legible libre, derivado del nombre.
 *
 * Es único en toda la taxonomía global, así que dos categorías con el mismo nombre no pueden
 * compartirlo. Se añade un sufijo en lugar de rechazar el alta: «Iluminación» es un nombre
 * razonable en dos ramas distintas, y obligar a renombrarla convertiría una restricción técnica en
 * una decisión de negocio.
 */
async function freeSlug(tx: Transaction, name: string): Promise<string> {
  const base = slugify(name, "categoria")

  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = slugCandidate(base, attempt)

    const [taken] = await tx
      .select({ id: globalCategories.id })
      .from(globalCategories)
      .where(eq(globalCategories.slug, candidate))
      .limit(1)

    if (!taken) return candidate
  }

  // Cien colisiones del mismo nombre no es un caso de negocio: es un error o un abuso.
  throw new UnprocessableError("Demasiadas categorías con ese nombre")
}

async function findServiceId(tx: Transaction, keycode: string): Promise<string> {
  const [service] = await tx
    .select({ id: services.id })
    .from(services)
    .where(eq(services.keycode, keycode))
    .limit(1)

  if (!service) throw new UnprocessableError(`No existe el servicio «${keycode}»`)
  return service.id
}

async function loadCategory(tx: Transaction, categoryId: string) {
  const [row] = await tx
    .select()
    .from(globalCategories)
    .where(eq(globalCategories.id, categoryId))
    .limit(1)

  if (!row) throw new NotFoundError("La categoría no existe")
  return row
}

function toRecord(row: typeof globalCategories.$inferSelect): CategoryRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parentId,
    serviceId: row.serviceId,
    keyname: row.keyname,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
