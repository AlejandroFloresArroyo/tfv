/**
 * Ubicaciones físicas de un almacén.
 *
 * Ver `openspec/specs/warehouses-and-storage/spec.md`. Rebanada 12.
 *
 * Un árbol que responde a una pregunta muy concreta: *¿dónde está guardado esto?* Diez tipos de
 * nodo, del piso al contenedor, y cada uno con un **código legible autogenerado** —`RCK3`, `BOX12`—
 * porque son códigos que la gente escribe en etiquetas y dice en voz alta al buscar algo en la nave.
 *
 * ## Tres reglas que no son obvias
 *
 * **El código se regenera al cambiar de tipo y nunca al renombrar.** Está impreso en etiquetas
 * pegadas a estantes; cambiarlo porque alguien corrigió una falta de ortografía deja la nave llena
 * de etiquetas mintiendo.
 *
 * **El correlativo cuenta por tipo y por almacén.** Dos almacenes tienen cada uno su `BOX1`, y son
 * cajas distintas. Contar globalmente daría códigos altos y sin sentido para quien sólo ve su nave.
 *
 * **Eliminar una ubicación no elimina lo que guardaba.** Se lleva el subárbol, y los productos que
 * colgaban de cualquiera de sus nodos quedan **sin ubicación**. Una caja que se rompe no destruye
 * lo que había dentro.
 */

import { NotFoundError, newId, UnprocessableError } from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import { warehouseProducts, warehouseStorages } from "@tfv/db/schema"
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { loadWarehouse } from "./warehouses.ts"

/** Los diez tipos, del más general al más específico. */
export const STORAGE_KINDS = [
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
] as const

export type StorageKind = (typeof STORAGE_KINDS)[number]

/**
 * La clave de tres letras de cada tipo.
 *
 * Se declara aquí y no se deriva del nombre: `shelf` daría `SHE` y `bin` daría `BIN`, pero
 * `aisle` daría `AIS` por casualidad y `pallet` daría `PAL` en lugar de `PLT`. Derivarlas
 * funcionaría hasta el primer tipo nuevo, y entonces el código impreso en las etiquetas viejas
 * dejaría de coincidir con el que genera el código nuevo.
 */
const KIND_KEY: Record<StorageKind, string> = {
  floor: "FLR",
  area: "ARE",
  aisle: "AIS",
  section: "SEC",
  bay: "BAY",
  rack: "RCK",
  shelf: "SHF",
  pallet: "PLT",
  box: "BOX",
  bin: "BIN",
}

export interface StorageRecord {
  readonly id: string
  readonly warehouseId: string
  readonly parentId: string | null
  readonly kind: StorageKind
  readonly code: string
  readonly name: string
  readonly color: string | null
  readonly icon: string | null
  /** Cuántas ubicaciones cuelgan directamente de ella. Es lo que dice si es hoja. */
  readonly childCount: number
  /**
   * Productos asignados **directamente** a ella.
   *
   * Las variantes y los accesorios heredan la ubicación de su padre y no se cuentan aparte: una
   * ubicación con un producto de tres variantes tiene un producto, no cuatro.
   */
  readonly productCount: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export interface ListOptions {
  /**
   * De quién se piden las hijas.
   *
   * Ausente son **las raíces**, que es lo que la spec pide: «El listado del almacén muestra las
   * raíces». Devolver el árbol entero obligaría a la interfaz a filtrarlo, y una nave grande tiene
   * cientos de nodos para enseñar seis.
   */
  readonly parentId?: string | null | undefined
}

export async function listStorages(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  options: ListOptions = {},
): Promise<StorageRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const rows = await tx
      .select()
      .from(warehouseStorages)
      .where(
        and(
          eq(warehouseStorages.warehouseId, warehouseId),
          options.parentId === undefined || options.parentId === null
            ? isNull(warehouseStorages.parentId)
            : eq(warehouseStorages.parentId, options.parentId),
        ),
      )
      .orderBy(asc(warehouseStorages.code))

    return withCounts(tx, rows)
  })
}

/** El camino desde la raíz hasta una ubicación, para poder situarla sin recorrer el árbol. */
export async function storagePath(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  storageId: string,
): Promise<StorageRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadStorage(tx, warehouseId, storageId)

    /**
     * La consulta recursiva devuelve **sólo identificadores**, y las filas se leen aparte.
     *
     * `tx.execute` entrega las columnas como las nombra la base —`parent_id`, `created_at`—, sin
     * la traducción que hace el constructor de consultas. Mezclar las dos formas deja campos en
     * `undefined` que sólo se notan al serializar, y con nombres que existen en un sitio y no en
     * el otro. Aquí lo recursivo aporta el orden y el resto lo hace la consulta tipada.
     */
    const result = await tx.execute(sql`
      with recursive camino as (
        select id, parent_id, 0 as profundidad
        from warehouse_storages where id = ${storageId}
        union all
        select s.id, s.parent_id, c.profundidad + 1
        from warehouse_storages s
        join camino c on s.id = c.parent_id
      )
      select id from camino order by profundidad desc
    `)

    const ids = (result as unknown as { id: string }[]).map((row) => row.id)
    if (ids.length === 0) return []

    const rows = await tx.select().from(warehouseStorages).where(inArray(warehouseStorages.id, ids))
    const byId = new Map(rows.map((row) => [row.id, row]))

    const ordered = ids
      .map((id) => byId.get(id))
      .filter((row): row is (typeof rows)[number] => row !== undefined)

    return withCounts(tx, ordered)
  })
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export interface CreateStorageInput {
  readonly name: string
  readonly kind?: StorageKind | undefined
  readonly parentId?: string | null | undefined
  readonly color?: string | undefined
  readonly icon?: string | undefined
}

export async function createStorage(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  input: CreateStorageInput,
): Promise<StorageRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const kind = input.kind ?? "box"
    if (input.parentId) await loadStorage(tx, warehouseId, input.parentId)

    const [created] = await tx
      .insert(warehouseStorages)
      .values({
        id: newId(),
        warehouseId,
        parentId: input.parentId ?? null,
        kind,
        code: await nextCode(tx, warehouseId, kind),
        name: input.name.trim(),
        color: input.color ?? null,
        icon: input.icon ?? null,
      })
      .returning()

    if (!created) throw new Error("la inserción de la ubicación no devolvió fila")
    return (await withCounts(tx, [created]))[0] as StorageRecord
  })
}

export interface UpdateStorageInput {
  readonly name?: string | undefined
  readonly kind?: StorageKind | undefined
  /** `null` la promueve a raíz, que es distinto de omitirlo —eso la deja donde está—. */
  readonly parentId?: string | null | undefined
  readonly color?: string | null | undefined
  readonly icon?: string | null | undefined
}

export async function updateStorage(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  storageId: string,
  input: UpdateStorageInput,
): Promise<StorageRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const current = await loadStorage(tx, warehouseId, storageId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.color !== undefined) patch.color = input.color
    if (input.icon !== undefined) patch.icon = input.icon

    if (input.parentId !== undefined) {
      if (input.parentId !== null) {
        await loadStorage(tx, warehouseId, input.parentId)
        await assertNoCycle(tx, storageId, input.parentId)
      }
      patch.parentId = input.parentId
    }

    // El código sólo se toca si cambia el tipo. Es la regla entera, y va aquí para que no haya
    // ninguna otra ruta por la que un código pueda cambiar.
    if (input.kind !== undefined && input.kind !== current.kind) {
      patch.kind = input.kind
      patch.code = await nextCode(tx, warehouseId, input.kind)
    }

    if (Object.keys(patch).length === 0) {
      return (await withCounts(tx, [current]))[0] as StorageRecord
    }

    const [updated] = await tx
      .update(warehouseStorages)
      .set(patch)
      .where(eq(warehouseStorages.id, storageId))
      .returning()

    if (!updated) throw new NotFoundError("La ubicación no existe")
    return (await withCounts(tx, [updated]))[0] as StorageRecord
  })
}

/** Lo que se lleva por delante eliminar una ubicación, para poder advertirlo antes. */
export interface StorageDeletionScope {
  /** Ella misma incluida. */
  readonly storages: number
  /** Productos que quedarán sin ubicación. No se eliminan. */
  readonly products: number
}

export async function storageDeletionScope(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  storageId: string,
): Promise<StorageDeletionScope> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadStorage(tx, warehouseId, storageId)

    const subtree = await subtreeIds(tx, storageId)

    const [products] = await tx
      .select({ value: count() })
      .from(warehouseProducts)
      .where(
        and(
          inArray(warehouseProducts.storageId, subtree),
          isNull(warehouseProducts.deletedAt),
          isNull(warehouseProducts.parentId),
        ),
      )

    return { storages: subtree.length, products: products?.value ?? 0 }
  })
}

/**
 * Elimina una ubicación y su subárbol.
 *
 * Las dos consecuencias las hace **el motor**: la cascada, con la clave foránea autorreferente; y
 * los productos sin ubicación, con la clave foránea a nulo. No hay recorrido escrito a mano, que es
 * donde la implementación anterior se equivocaba.
 */
export async function deleteStorage(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  storageId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadStorage(tx, warehouseId, storageId)

    await tx.delete(warehouseStorages).where(eq(warehouseStorages.id, storageId))
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/**
 * El siguiente código libre para un tipo dentro de un almacén.
 *
 * Cuenta las existentes de ese tipo y suma uno. **No es un contador persistente**, así que eliminar
 * una ubicación libera su número y el siguiente alta lo reutiliza. Es lo que la spec describe
 * —«contando las ubicaciones del mismo tipo que ya existan»— y lo que hace que los números se
 * mantengan pequeños y decibles en una nave donde las cajas van y vienen.
 *
 * Como consecuencia, el número **no identifica**: lo hace el identificador de la fila. Si dos altas
 * simultáneas del mismo tipo llegan a la vez, las dos cuentan lo mismo y la segunda choca contra el
 * índice único de `(almacén, código)` — falla, que es el modo correcto de fallar.
 */
async function nextCode(tx: Transaction, warehouseId: string, kind: StorageKind): Promise<string> {
  const [row] = await tx
    .select({ value: count() })
    .from(warehouseStorages)
    .where(and(eq(warehouseStorages.warehouseId, warehouseId), eq(warehouseStorages.kind, kind)))

  return `${KIND_KEY[kind]}${(row?.value ?? 0) + 1}`
}

/**
 * Rechaza convertir a una ubicación en su propia ancestra.
 *
 * Es lo único de este árbol que el motor no puede impedir por sí solo: la consulta que lo detecta
 * es recursiva, y una restricción no puede serlo. Sin esto, un ciclo deja un subárbol inalcanzable
 * desde la raíz y cualquier recorrido posterior no termina.
 */
async function assertNoCycle(
  tx: Transaction,
  storageId: string,
  newParentId: string,
): Promise<void> {
  if (storageId === newParentId) {
    throw new UnprocessableError("Una ubicación no puede ser su propio padre")
  }

  const result = await tx.execute(sql`
    with recursive ancestros as (
      select id, parent_id from warehouse_storages where id = ${newParentId}
      union all
      select s.id, s.parent_id
      from warehouse_storages s
      join ancestros a on s.id = a.parent_id
    )
    select 1 from ancestros where id = ${storageId} limit 1
  `)

  if (result.length > 0) {
    throw new UnprocessableError("Una ubicación no puede colgar de una de sus descendientes")
  }
}

async function subtreeIds(tx: Transaction, storageId: string): Promise<string[]> {
  const result = await tx.execute(sql`
    with recursive descendientes as (
      select id from warehouse_storages where id = ${storageId}
      union all
      select s.id
      from warehouse_storages s
      join descendientes d on s.parent_id = d.id
    )
    select id from descendientes
  `)

  return (result as unknown as { id: string }[]).map((row) => row.id)
}

/**
 * Añade a cada fila cuántas hijas y cuántos productos tiene.
 *
 * En dos consultas para todas las filas, no dos por fila: un almacén con doscientas ubicaciones
 * haría cuatrocientas consultas, y el listado tardaría más en contar que en leer.
 */
async function withCounts(
  tx: Transaction,
  rows: readonly (typeof warehouseStorages.$inferSelect)[],
): Promise<StorageRecord[]> {
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)

  const children = await tx
    .select({ parentId: warehouseStorages.parentId, value: count() })
    .from(warehouseStorages)
    .where(inArray(warehouseStorages.parentId, ids))
    .groupBy(warehouseStorages.parentId)

  const products = await tx
    .select({ storageId: warehouseProducts.storageId, value: count() })
    .from(warehouseProducts)
    .where(
      and(
        inArray(warehouseProducts.storageId, ids),
        isNull(warehouseProducts.deletedAt),
        // Las variantes heredan la ubicación de su padre; contarlas duplicaría el recuento.
        isNull(warehouseProducts.parentId),
      ),
    )
    .groupBy(warehouseProducts.storageId)

  const childCounts = new Map(children.map((row) => [row.parentId, row.value]))
  const productCounts = new Map(products.map((row) => [row.storageId, row.value]))

  return rows.map((row) => ({
    id: row.id,
    warehouseId: row.warehouseId,
    parentId: row.parentId,
    kind: row.kind,
    code: row.code,
    name: row.name,
    color: row.color,
    icon: row.icon,
    childCount: childCounts.get(row.id) ?? 0,
    productCount: productCounts.get(row.id) ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

async function loadStorage(tx: Transaction, warehouseId: string, storageId: string) {
  const [row] = await tx
    .select()
    .from(warehouseStorages)
    .where(and(eq(warehouseStorages.id, storageId), eq(warehouseStorages.warehouseId, warehouseId)))
    .limit(1)

  if (!row) throw new NotFoundError("La ubicación no existe")
  return row
}
