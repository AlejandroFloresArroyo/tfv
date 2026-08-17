/**
 * Roles de una empresa.
 *
 * Ver `openspec/specs/access-control/spec.md`, requisitos de roles.
 *
 * Un rol pertenece siempre a **una** empresa: no hay roles globales ni compartidos. Y su conjunto
 * de permisos se valida contra el catálogo del servidor al escribir, que es lo que convierte al
 * catálogo en la autoridad. Sin esa validación, una clave mal escrita se acepta en silencio y no se
 * descubre al guardarla: se descubre semanas después, cuando alguien no puede trabajar y su rol
 * «sí tiene» el permiso.
 */

import {
  buildPage,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type PermissionKey,
  type QuerySchema,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import { companies, companyMembers, roles } from "@tfv/db/schema"
import { and, count, eq, isNull } from "drizzle-orm"
import { assertKnownPermissions } from "../auth/authorization.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import type { Actor } from "./companies.ts"

export interface RoleRecord {
  readonly id: string
  readonly name: string
  readonly permissions: readonly string[]
  /** Cuántas personas lo tienen. Es lo que hace visible el alcance de eliminarlo. */
  readonly memberCount: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Qué se puede pedir de la colección de roles.
 *
 * El registro de búsqueda de la spec no traía «rol», y era una omisión y no una decisión: la lista
 * de recursos deliberadamente sin búsqueda está enumerada aparte y no lo incluye. Buscar un rol por
 * su nombre es lo primero que se hace en una empresa con veinte.
 */
export const roleQuery: QuerySchema = {
  filters: {},
  searchable: ["name"],
  sortable: ["name", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
}

export async function listRoles(
  actor: Actor,
  companyId: string,
  query: ParsedQuery,
): Promise<Page<RoleRecord>> {
  const mapping = {
    fields: { name: roles.name, createdAt: roles.createdAt },
    searchable: [roles.name],
    tiebreak: roles.id,
  }
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)

    const where = and(eq(roles.companyId, companyId), ...collectionConditions(query, mapping))

    const [total] = await tx.select({ value: count() }).from(roles).where(where)

    const rows = await tx
      .select()
      .from(roles)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    const counts = await memberCounts(tx, companyId)

    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      permissions: row.permissions,
      memberCount: counts.get(row.id) ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))

    return buildPage(items, total?.value ?? 0, page, limit)
  })
}

export interface CreateRoleInput {
  readonly name: string
  readonly permissions: readonly string[]
}

export async function createRole(
  actor: Actor,
  companyId: string,
  input: CreateRoleInput,
): Promise<RoleRecord> {
  assertKnownPermissions(input.permissions)

  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)

    const [role] = await tx
      .insert(roles)
      .values({
        id: newId(),
        companyId,
        name: input.name.trim(),
        permissions: [...input.permissions] as PermissionKey[],
      })
      .returning()

    if (!role) throw new Error("la inserción del rol no devolvió fila")

    return { ...role, memberCount: 0 }
  })
}

export interface UpdateRoleInput {
  readonly name?: string | undefined
  readonly permissions?: readonly string[] | undefined
}

export async function updateRole(
  actor: Actor,
  companyId: string,
  roleId: string,
  input: UpdateRoleInput,
): Promise<RoleRecord> {
  if (input.permissions) assertKnownPermissions(input.permissions)

  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    await loadRole(tx, companyId, roleId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.permissions !== undefined) patch.permissions = [...input.permissions]

    if (Object.keys(patch).length > 0) {
      await tx.update(roles).set(patch).where(eq(roles.id, roleId))
    }

    const role = await loadRole(tx, companyId, roleId)
    const counts = await memberCounts(tx, companyId)

    return { ...role, memberCount: counts.get(roleId) ?? 0 }
  })
}

/**
 * Elimina un rol.
 *
 * Sus miembros **conservan la pertenencia y pierden el rol**: la clave foránea lo pone a nulo, no
 * arrastra la membresía. Lo exige la spec, y la diferencia es grande — arrastrarla expulsaría de la
 * empresa a gente por un cambio de configuración de permisos.
 *
 * Quien queda sin rol conserva lectura y pierde toda escritura, salvo que sea propietaria.
 */
export async function deleteRole(actor: Actor, companyId: string, roleId: string): Promise<void> {
  await withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    await loadRole(tx, companyId, roleId)

    await tx.delete(roles).where(eq(roles.id, roleId))
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

async function assertCompany(tx: Transaction, companyId: string): Promise<void> {
  const [company] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
    .limit(1)

  if (!company) throw new NotFoundError("La empresa no existe")
}

async function loadRole(tx: Transaction, companyId: string, roleId: string) {
  const [role] = await tx
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.companyId, companyId)))
    .limit(1)

  if (!role) throw new NotFoundError("El rol no existe")
  return role
}

async function memberCounts(tx: Transaction, companyId: string): Promise<Map<string, number>> {
  const rows = await tx
    .select({ roleId: companyMembers.roleId })
    .from(companyMembers)
    .where(eq(companyMembers.companyId, companyId))

  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.roleId) continue
    counts.set(row.roleId, (counts.get(row.roleId) ?? 0) + 1)
  }
  return counts
}
