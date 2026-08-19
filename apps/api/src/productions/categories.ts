/**
 * Taxonomía de una producción.
 *
 * Ver `openspec/specs/category-trees/spec.md`, requisito «Alcance de la taxonomía de producción».
 * Rebanada 20, y la tercera de las tres taxonomías del sistema.
 *
 * ## Qué la distingue de las otras dos
 *
 * Una categoría de producción **apunta a un rol**, y ésa es toda la diferencia que importa. La
 * global agrupa entre empresas y la de almacén organiza una nave; ésta organiza **el trabajo de un
 * rodaje**, y el rodaje está repartido por departamentos —arte, cámara, vestuario— que en este
 * sistema ya existen como roles de la empresa. Clasificar una tarea en «Vestuario» es, en la
 * práctica, dirigirla al equipo de vestuario: sin el vínculo al rol habría que mantener a mano dos
 * listas que dicen lo mismo, y el día que se separen nadie sabría cuál manda.
 *
 * Clasifica artículos, tareas, videos, anclas y compras. Todas ellas son de las rebanadas 21 a 23,
 * así que hoy el recuento de lo clasificado sale de las tablas que ya existen y crecerá con ellas.
 *
 * ## El rol se comprueba contra la empresa, y no basta con la política
 *
 * `production_categories.role_id` apunta a `roles.id` sin más. Las claves foráneas **se comprueban
 * con los permisos del dueño de la tabla y se saltan las políticas de fila**, así que el motor
 * aceptaría el identificador de un rol de otra empresa: quien lo escribiera no podría leerlo de
 * vuelta, pero habría dejado escrita una referencia entre arrendatarios. Se corta aquí, que es la
 * capa que sabe de qué empresa es la producción.
 */

import { NotFoundError, newId, slugCandidate, slugify, UnprocessableError } from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import {
  productionCategories,
  productionItems,
  productionTasks,
  productionVideos,
  roles,
} from "@tfv/db/schema"
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { loadProduction } from "./productions.ts"

export interface ProductionCategoryRecord {
  readonly id: string
  readonly productionId: string
  readonly parentId: string | null
  readonly roleId: string | null
  /** El nombre del rol, para no obligar a la pantalla a resolver la lista entera. */
  readonly roleName: string | null
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

export async function listProductionCategories(
  actor: Actor,
  companyId: string,
  productionId: string,
  options: ListOptions = {},
): Promise<ProductionCategoryRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const rows = await tx
      .select()
      .from(productionCategories)
      .where(
        and(
          eq(productionCategories.productionId, productionId),
          options.parentId === undefined || options.parentId === null
            ? isNull(productionCategories.parentId)
            : eq(productionCategories.parentId, options.parentId),
        ),
      )
      .orderBy(asc(productionCategories.name))

    return decorate(tx, rows)
  })
}

export async function getProductionCategory(
  actor: Actor,
  companyId: string,
  productionId: string,
  categoryId: string,
): Promise<ProductionCategoryRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const row = await loadCategory(tx, productionId, categoryId)

    return (await decorate(tx, [row]))[0] as ProductionCategoryRecord
  })
}

/**
 * El camino desde la raíz hasta una categoría, para poder situarla sin recorrer el árbol.
 *
 * Igual que el de las categorías del almacén, y por la misma razón: sin él, situar una hoja cuesta
 * una petición por nivel bajando desde las raíces.
 */
export async function categoryPath(
  actor: Actor,
  companyId: string,
  productionId: string,
  categoryId: string,
): Promise<ProductionCategoryRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadCategory(tx, productionId, categoryId)

    // La consulta recursiva devuelve **sólo identificadores**, y las filas se leen aparte:
    // `tx.execute` entrega las columnas como las nombra la base, sin la traducción del constructor
    // de consultas, y mezclar las dos formas deja campos en `undefined` al serializar.
    const result = await tx.execute(sql`
      with recursive camino as (
        select id, parent_id, 0 as profundidad
        from production_categories where id = ${categoryId}
        union all
        select c.id, c.parent_id, m.profundidad + 1
        from production_categories c
        join camino m on c.id = m.parent_id
      )
      select id from camino order by profundidad desc
    `)

    const ids = (result as unknown as { id: string }[]).map((row) => row.id)
    if (ids.length === 0) return []

    const rows = await tx
      .select()
      .from(productionCategories)
      .where(inArray(productionCategories.id, ids))

    const byId = new Map(rows.map((row) => [row.id, row]))
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((row): row is (typeof rows)[number] => row !== undefined)

    return decorate(tx, ordered)
  })
}

/**
 * Lo que se lleva por delante eliminar una categoría, para poder advertirlo antes.
 *
 * `category-trees` lo exige: «La confirmación previa SHALL indicar cuántas categorías y cuántas
 * entidades resultarán afectadas». Las entidades de esta taxonomía son las cinco que clasifica; se
 * cuentan las tres que ya existen —artículos, videos y tareas— y las dos que faltan llegan con sus
 * rebanadas. Contar de menos es preferible a inventarse la cifra.
 */
export interface CategoryScope {
  /** Ella misma incluida. */
  readonly categories: number
  /** Lo clasificado, que quedará **sin categoría**. No se elimina. */
  readonly items: number
  readonly videos: number
  readonly tasks: number
}

export async function categoryScope(
  actor: Actor,
  companyId: string,
  productionId: string,
  categoryId: string,
): Promise<CategoryScope> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadCategory(tx, productionId, categoryId)

    const subtree = await categorySubtree(tx, categoryId)

    const [items] = await tx
      .select({ value: count() })
      .from(productionItems)
      .where(and(inArray(productionItems.categoryId, subtree), isNull(productionItems.deletedAt)))

    const [videos] = await tx
      .select({ value: count() })
      .from(productionVideos)
      .where(and(inArray(productionVideos.categoryId, subtree), isNull(productionVideos.deletedAt)))

    const [tasks] = await tx
      .select({ value: count() })
      .from(productionTasks)
      .where(and(inArray(productionTasks.categoryId, subtree), isNull(productionTasks.deletedAt)))

    return {
      categories: subtree.length,
      items: items?.value ?? 0,
      videos: videos?.value ?? 0,
      tasks: tasks?.value ?? 0,
    }
  })
}

export interface CreateCategoryInput {
  readonly name: string
  readonly description?: string | undefined
  readonly parentId?: string | null | undefined
  readonly roleId?: string | null | undefined
  readonly color?: string | undefined
  readonly icon?: string | undefined
}

export async function createProductionCategory(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: CreateCategoryInput,
): Promise<ProductionCategoryRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    if (input.parentId) await loadCategory(tx, productionId, input.parentId)
    if (input.roleId) await assertRoleOfCompany(tx, companyId, input.roleId)

    const [created] = await tx
      .insert(productionCategories)
      .values({
        id: newId(),
        productionId,
        parentId: input.parentId ?? null,
        roleId: input.roleId ?? null,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        slug: await freeSlug(tx, productionId, input.name),
        color: input.color ?? null,
        icon: input.icon ?? null,
      })
      .returning()

    if (!created) throw new Error("la inserción de la categoría no devolvió fila")
    return (await decorate(tx, [created]))[0] as ProductionCategoryRecord
  })
}

export interface UpdateCategoryInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
  /** `null` la promueve a raíz, que es distinto de omitirlo. */
  readonly parentId?: string | null | undefined
  /** `null` la desvincula del equipo; omitirlo la deja como está. */
  readonly roleId?: string | null | undefined
  readonly color?: string | null | undefined
  readonly icon?: string | null | undefined
}

export async function updateProductionCategory(
  actor: Actor,
  companyId: string,
  productionId: string,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<ProductionCategoryRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const current = await loadCategory(tx, productionId, categoryId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description.trim()
    if (input.color !== undefined) patch.color = input.color
    if (input.icon !== undefined) patch.icon = input.icon

    if (input.roleId !== undefined) {
      if (input.roleId !== null) await assertRoleOfCompany(tx, companyId, input.roleId)
      patch.roleId = input.roleId
    }

    if (input.parentId !== undefined) {
      if (input.parentId !== null) {
        await loadCategory(tx, productionId, input.parentId)
        await assertNoCycle(tx, categoryId, input.parentId)
      }
      patch.parentId = input.parentId
    }

    if (Object.keys(patch).length === 0) {
      return (await decorate(tx, [current]))[0] as ProductionCategoryRecord
    }

    const [updated] = await tx
      .update(productionCategories)
      .set(patch)
      .where(eq(productionCategories.id, categoryId))
      .returning()

    if (!updated) throw new NotFoundError("La categoría no existe")
    return (await decorate(tx, [updated]))[0] as ProductionCategoryRecord
  })
}

/**
 * Elimina una categoría y su subárbol.
 *
 * La cascada la hace la clave foránea autorreferente, y **lo clasificado sobrevive sin categoría**
 * porque su clave foránea es a nulo. Un artículo no desaparece porque se reorganice el rodaje.
 */
export async function deleteProductionCategory(
  actor: Actor,
  companyId: string,
  productionId: string,
  categoryId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadCategory(tx, productionId, categoryId)

    await tx.delete(productionCategories).where(eq(productionCategories.id, categoryId))
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/** Los identificadores de una categoría y todas sus descendientes. */
export async function categorySubtree(tx: Transaction, categoryId: string): Promise<string[]> {
  const result = await tx.execute(sql`
    with recursive descendientes as (
      select id from production_categories where id = ${categoryId}
      union all
      select c.id
      from production_categories c
      join descendientes d on c.parent_id = d.id
    )
    select id from descendientes
  `)

  return (result as unknown as { id: string }[]).map((row) => row.id)
}

/** Recuento de hijas y nombre del rol, en dos consultas para todo el lote. */
async function decorate(
  tx: Transaction,
  rows: readonly (typeof productionCategories.$inferSelect)[],
): Promise<ProductionCategoryRecord[]> {
  if (rows.length === 0) return []

  const children = await tx
    .select({ parentId: productionCategories.parentId, value: count() })
    .from(productionCategories)
    .where(
      inArray(
        productionCategories.parentId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(productionCategories.parentId)

  const counts = new Map(children.map((row) => [row.parentId, row.value]))

  const roleIds = [...new Set(rows.map((row) => row.roleId).filter((id) => id !== null))]
  const named =
    roleIds.length === 0
      ? []
      : await tx
          .select({ id: roles.id, name: roles.name })
          .from(roles)
          .where(inArray(roles.id, roleIds))

  const roleNames = new Map(named.map((row) => [row.id, row.name]))

  return rows.map((row) => ({
    id: row.id,
    productionId: row.productionId,
    parentId: row.parentId,
    roleId: row.roleId,
    roleName: row.roleId === null ? null : (roleNames.get(row.roleId) ?? null),
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

/** El identificador legible es único **dentro de su producción**, no de la plataforma. */
async function freeSlug(tx: Transaction, productionId: string, name: string): Promise<string> {
  const base = slugify(name, "categoria")

  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = slugCandidate(base, attempt)

    const [taken] = await tx
      .select({ id: productionCategories.id })
      .from(productionCategories)
      .where(
        and(
          eq(productionCategories.productionId, productionId),
          eq(productionCategories.slug, candidate),
        ),
      )
      .limit(1)

    if (!taken) return candidate
  }

  throw new UnprocessableError("Demasiadas categorías con ese nombre")
}

/**
 * El rol es de la empresa dueña de la producción.
 *
 * Sin esto la referencia entre arrendatarios entra: la comprobación de la clave foránea corre con
 * los permisos del dueño de la tabla y no aplica las políticas de fila, así que el motor daría por
 * bueno el identificador de un rol ajeno. El `404` es deliberado —igual que con la empresa fuera de
 * alcance—: decir «existe pero no es tuyo» ya es información sobre otra empresa.
 */
async function assertRoleOfCompany(
  tx: Transaction,
  companyId: string,
  roleId: string,
): Promise<void> {
  const [role] = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.companyId, companyId)))
    .limit(1)

  if (!role) throw new NotFoundError("El rol no existe")
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
      select id, parent_id from production_categories where id = ${newParentId}
      union all
      select c.id, c.parent_id
      from production_categories c
      join ancestros a on c.id = a.parent_id
    )
    select 1 from ancestros where id = ${categoryId} limit 1
  `)

  if (result.length > 0) {
    throw new UnprocessableError("Una categoría no puede colgar de una de sus descendientes")
  }
}

export async function loadCategory(tx: Transaction, productionId: string, categoryId: string) {
  const [row] = await tx
    .select()
    .from(productionCategories)
    .where(
      and(
        eq(productionCategories.id, categoryId),
        eq(productionCategories.productionId, productionId),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La categoría no existe")
  return row
}
