/**
 * Taxonomía de un almacén.
 *
 * Ver `openspec/specs/warehouse-catalog/spec.md`, requisito de clasificación doble.
 *
 * Un producto se clasifica **dos veces**: en una categoría de su propio almacén y en una de la
 * taxonomía global. No es redundancia. La del almacén es como cada casa de renta organiza su nave
 * —«Ópticas», «Grip», «Vestuario de época»— y es la que navega el catálogo interno y su tienda; la
 * global es común a la plataforma y sirve para agregar entre empresas, que sólo funciona si todas
 * usan el mismo árbol.
 *
 * ## Por qué no comparte código con la taxonomía global
 *
 * Se parecen y no son lo mismo: el alcance de una es un almacén y el de la otra la plataforma
 * entera, el identificador legible es único dentro de su almacén y no del mundo, y quien las
 * escribe es distinto —aquí un permiso de empresa, allá administración de plataforma—. Compartir
 * código exigiría una abstracción sobre el alcance que hoy sólo tendría dos usos, y el segundo no
 * encaja del todo. Lo que sí se comparte es lo que de verdad es común: las columnas y la
 * derivación del identificador.
 */

import { NotFoundError, newId, slugCandidate, slugify, UnprocessableError } from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import { warehouseCategories, warehouseProducts } from "@tfv/db/schema"
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { loadWarehouse } from "./warehouses.ts"

export interface WarehouseCategoryRecord {
  readonly id: string
  readonly warehouseId: string
  readonly parentId: string | null
  readonly name: string
  readonly description: string
  readonly slug: string | null
  readonly color: string | null
  readonly icon: string | null
  readonly childCount: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface ListOptions {
  /** Ausente son las raíces, como en toda taxonomía de este sistema. */
  readonly parentId?: string | null | undefined
}

export async function listWarehouseCategories(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  options: ListOptions = {},
): Promise<WarehouseCategoryRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const rows = await tx
      .select()
      .from(warehouseCategories)
      .where(
        and(
          eq(warehouseCategories.warehouseId, warehouseId),
          options.parentId === undefined || options.parentId === null
            ? isNull(warehouseCategories.parentId)
            : eq(warehouseCategories.parentId, options.parentId),
        ),
      )
      .orderBy(asc(warehouseCategories.name))

    return withChildCounts(tx, rows)
  })
}

export interface CreateCategoryInput {
  readonly name: string
  readonly description?: string | undefined
  readonly parentId?: string | null | undefined
  readonly color?: string | undefined
  readonly icon?: string | undefined
}

export async function createWarehouseCategory(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  input: CreateCategoryInput,
): Promise<WarehouseCategoryRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    if (input.parentId) await loadCategory(tx, warehouseId, input.parentId)

    const [created] = await tx
      .insert(warehouseCategories)
      .values({
        id: newId(),
        warehouseId,
        parentId: input.parentId ?? null,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        slug: await freeSlug(tx, warehouseId, input.name),
        color: input.color ?? null,
        icon: input.icon ?? null,
      })
      .returning()

    if (!created) throw new Error("la inserción de la categoría no devolvió fila")
    return (await withChildCounts(tx, [created]))[0] as WarehouseCategoryRecord
  })
}

export interface UpdateCategoryInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
  /** `null` la promueve a raíz, que es distinto de omitirlo. */
  readonly parentId?: string | null | undefined
  readonly color?: string | null | undefined
  readonly icon?: string | null | undefined
}

export async function updateWarehouseCategory(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<WarehouseCategoryRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const current = await loadCategory(tx, warehouseId, categoryId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description.trim()
    if (input.color !== undefined) patch.color = input.color
    if (input.icon !== undefined) patch.icon = input.icon

    if (input.parentId !== undefined) {
      if (input.parentId !== null) {
        await loadCategory(tx, warehouseId, input.parentId)
        await assertNoCycle(tx, categoryId, input.parentId)
      }
      patch.parentId = input.parentId
    }

    if (Object.keys(patch).length === 0) {
      return (await withChildCounts(tx, [current]))[0] as WarehouseCategoryRecord
    }

    const [updated] = await tx
      .update(warehouseCategories)
      .set(patch)
      .where(eq(warehouseCategories.id, categoryId))
      .returning()

    if (!updated) throw new NotFoundError("La categoría no existe")
    return (await withChildCounts(tx, [updated]))[0] as WarehouseCategoryRecord
  })
}

/**
 * Elimina una categoría y su subárbol.
 *
 * La cascada la hace la clave foránea autorreferente, y **lo clasificado sobrevive sin categoría**
 * porque su clave foránea es a nulo. Un producto no desaparece porque se reorganice la nave.
 */
export async function deleteWarehouseCategory(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  categoryId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadCategory(tx, warehouseId, categoryId)

    await tx.delete(warehouseCategories).where(eq(warehouseCategories.id, categoryId))
  })
}

/** Los identificadores de una categoría y todas sus descendientes, para filtrar el catálogo. */
export async function categorySubtree(tx: Transaction, categoryId: string): Promise<string[]> {
  const result = await tx.execute(sql`
    with recursive descendientes as (
      select id from warehouse_categories where id = ${categoryId}
      union all
      select c.id
      from warehouse_categories c
      join descendientes d on c.parent_id = d.id
    )
    select id from descendientes
  `)

  return (result as unknown as { id: string }[]).map((row) => row.id)
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

async function withChildCounts(
  tx: Transaction,
  rows: readonly (typeof warehouseCategories.$inferSelect)[],
): Promise<WarehouseCategoryRecord[]> {
  if (rows.length === 0) return []

  const children = await tx
    .select({ parentId: warehouseCategories.parentId, value: count() })
    .from(warehouseCategories)
    .where(
      inArray(
        warehouseCategories.parentId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(warehouseCategories.parentId)

  const counts = new Map(children.map((row) => [row.parentId, row.value]))

  return rows.map((row) => ({
    id: row.id,
    warehouseId: row.warehouseId,
    parentId: row.parentId,
    name: row.name,
    description: row.description,
    slug: row.slug,
    color: row.color,
    icon: row.icon,
    childCount: counts.get(row.id) ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

/** El identificador legible es único **dentro de su almacén**, no de la plataforma. */
async function freeSlug(tx: Transaction, warehouseId: string, name: string): Promise<string> {
  const base = slugify(name, "categoria")

  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = slugCandidate(base, attempt)

    const [taken] = await tx
      .select({ id: warehouseCategories.id })
      .from(warehouseCategories)
      .where(
        and(
          eq(warehouseCategories.warehouseId, warehouseId),
          eq(warehouseCategories.slug, candidate),
        ),
      )
      .limit(1)

    if (!taken) return candidate
  }

  throw new UnprocessableError("Demasiadas categorías con ese nombre")
}

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
      select id, parent_id from warehouse_categories where id = ${newParentId}
      union all
      select c.id, c.parent_id
      from warehouse_categories c
      join ancestros a on c.id = a.parent_id
    )
    select 1 from ancestros where id = ${categoryId} limit 1
  `)

  if (result.length > 0) {
    throw new UnprocessableError("Una categoría no puede colgar de una de sus descendientes")
  }
}

export async function loadCategory(tx: Transaction, warehouseId: string, categoryId: string) {
  const [row] = await tx
    .select()
    .from(warehouseCategories)
    .where(
      and(eq(warehouseCategories.id, categoryId), eq(warehouseCategories.warehouseId, warehouseId)),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La categoría no existe")
  return row
}

/** Cuántos productos raíz cuelgan directamente de una categoría. */
export async function productCountOf(tx: Transaction, categoryId: string): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(warehouseProducts)
    .where(
      and(
        eq(warehouseProducts.categoryId, categoryId),
        isNull(warehouseProducts.deletedAt),
        isNull(warehouseProducts.parentId),
      ),
    )

  return row?.value ?? 0
}
