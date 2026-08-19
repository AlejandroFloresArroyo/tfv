/**
 * Empresas y membresías.
 *
 * Ver `openspec/specs/companies/spec.md` y la rebanada 10.
 *
 * ## Todo pasa por las políticas
 *
 * Cada operación corre dentro de `withRequester`, así que el motor vuelve a comprobar el alcance
 * aunque la compuerta de permisos ya lo haya hecho. Son dos capas a propósito: la de aplicación
 * puede equivocarse en un `where`, y entonces la de datos devuelve cero filas en lugar de las de
 * otro arrendatario. Es la propiedad que `access-control` exige y la razón de que el aislamiento
 * sobreviva a un fallo del código.
 *
 * ## La excepción, y por qué es una sola
 *
 * **Crear una empresa** es la única operación que no puede resolverse contra las empresas del
 * solicitante: la política exige que la empresa ya esté entre las suyas, y al crearla no lo está.
 * Se resuelve con `withSystem`, que declara el alcance de forma explícita y **no elude las
 * políticas** — escribir en una empresa que no se nombró sigue fallando. La alternativa habría sido
 * `withElevated`, que las apaga enteras; se descartó porque apagar el aislamiento para crear una
 * fila es desproporcionado y no deja rastro de qué alcance se pretendía.
 */

import {
  buildPage,
  ConflictError,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type PermissionKey,
  type QuerySchema,
  UnprocessableError,
} from "@tfv/contracts"
import { db, type Transaction, withRequester, withSystem } from "@tfv/db"
import { companies, companyMembers, roles, users } from "@tfv/db/schema"
import { and, count, eq, isNull, ne } from "drizzle-orm"
import { recordActivity } from "../activity/activity.ts"
import { syncSeats } from "../billing/subscriptions.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { rootLogger } from "../runtime/logger.ts"

/** Quién realiza la operación. Lo mismo que el motor necesita para resolver la identidad. */
export interface Actor {
  readonly userId: string
  readonly sessionId: string
  /**
   * Lo está haciendo la administración de plataforma sobre una empresa ajena.
   *
   * No sirve para autorizar —eso lo resuelve el motor, y traerlo desde la aplicación invitaría a
   * confiar en un valor que la aplicación puede calcular mal—. Sirve para **marcarlo en la
   * bitácora**, que es lo que permite distinguir lo que hizo soporte de lo que hizo el cliente.
   */
  readonly asPlatformAdmin?: boolean | undefined
}

export interface CompanyRecord {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly email: string | null
  readonly commissionRate: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly deletedAt: Date | null
}

export interface MemberRecord {
  readonly id: string
  readonly userId: string
  readonly email: string
  readonly name: string
  readonly lastname: string
  readonly roleId: string | null
  readonly roleName: string | null
  readonly isOwner: boolean
  readonly isActive: boolean
  readonly createdAt: Date
}

// ─── Empresas ────────────────────────────────────────────────────────────────

export interface CreateCompanyInput {
  readonly name: string
  readonly description?: string | undefined
  readonly email?: string | undefined
}

/**
 * Crea una empresa y deja a quien la crea como propietaria.
 *
 * Las dos escrituras van en la misma transacción. Separadas, un fallo entre ellas dejaría una
 * empresa sin ningún propietario — y como la propiedad es lo único que concede acceso completo,
 * nadie podría entrar en ella ni para borrarla.
 */
export async function createCompany(
  actor: Actor,
  input: CreateCompanyInput,
): Promise<CompanyRecord> {
  const companyId = newId()

  return withSystem("crear_empresa", [companyId], async (tx) => {
    const [company] = await tx
      .insert(companies)
      .values({
        id: companyId,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        email: input.email?.trim() || null,
      })
      .returning()

    if (!company) throw new Error("la inserción de la empresa no devolvió fila")

    await tx.insert(companyMembers).values({
      id: newId(),
      companyId,
      userId: actor.userId,
      isOwner: true,
    })

    // Sin clave de permiso: crear una empresa no ocurre *dentro* de ninguna, así que no hay
    // audiencia que seleccionar. El asiento sí queda, y es el primero de su bitácora.
    await note(tx, actor, companyId, {
      action: "create",
      entityId: companyId,
      entityLabel: company.name,
      title: "Creó la empresa",
      permissions: [],
    })

    return toCompanyRecord(company)
  })
}

/**
 * Qué se puede pedir de la colección de empresas.
 *
 * Ver `openspec/specs/query-and-pagination/spec.md`. La declaración es cerrada: filtrar por un campo
 * que no esté aquí responde `400`, y no hay forma de expresar un operador desde la URL.
 */
export const companyQuery: QuerySchema = {
  filters: {},
  searchable: ["name"],
  sortable: ["name", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
}

const companyFields = {
  name: companies.name,
  createdAt: companies.createdAt,
}

/** Las empresas del solicitante. El filtro lo pone el motor, no un `where` de la aplicación. */
export async function listCompanies(
  actor: Actor,
  query: ParsedQuery,
): Promise<Page<CompanyRecord>> {
  const mapping = {
    fields: companyFields,
    searchable: [companies.name],
    tiebreak: companies.id,
  }
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    const where = and(isNull(companies.deletedAt), ...collectionConditions(query, mapping))

    const [total] = await tx.select({ value: count() }).from(companies).where(where)

    const rows = await tx
      .select()
      .from(companies)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    return buildPage(rows.map(toCompanyRecord), total?.value ?? 0, page, limit)
  })
}

export async function getCompany(actor: Actor, companyId: string): Promise<CompanyRecord> {
  return withRequester(actor, async (tx) => {
    const company = await loadCompany(tx, companyId)
    return toCompanyRecord(company)
  })
}

export interface UpdateCompanyInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
  readonly email?: string | null | undefined
  /**
   * Sólo la mueve la administración de plataforma.
   *
   * La comprobación no está aquí: quien llama decide si el solicitante puede tocarla. Aquí sólo se
   * escribe lo que llegue, y llega ya filtrado.
   */
  readonly commissionRate?: string | undefined
}

export async function updateCompany(
  actor: Actor,
  companyId: string,
  input: UpdateCompanyInput,
): Promise<CompanyRecord> {
  return withRequester(actor, async (tx) => {
    await loadCompany(tx, companyId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description.trim()
    if (input.email !== undefined) patch.email = input.email?.trim() || null
    if (input.commissionRate !== undefined) patch.commissionRate = input.commissionRate

    if (Object.keys(patch).length === 0) {
      return toCompanyRecord(await loadCompany(tx, companyId))
    }

    const [updated] = await tx
      .update(companies)
      .set(patch)
      .where(eq(companies.id, companyId))
      .returning()

    if (!updated) throw new NotFoundError("La empresa no existe")

    await note(tx, actor, companyId, {
      action: "update",
      entityId: companyId,
      entityLabel: updated.name,
      title: "Editó los datos de la empresa",
      permissions: ["companies.companies.edit"],
    })

    return toCompanyRecord(updated)
  })
}

/**
 * Da de baja una empresa.
 *
 * **Borrado lógico** (`project.md` D-02): la fila sobrevive y su historial contable con ella. Lo
 * que se pierde es el acceso, y lo hace cumplir el motor — `app.member_of()` excluye las empresas
 * dadas de baja, así que sus miembros dejan de alcanzar sus datos por cualquier vía, no sólo por
 * las consultas que se acordaron de filtrar. Ver la migración `0008`.
 *
 * No hay cascada escrita a mano, que es el punto de la rebanada: la implementación anterior tenía
 * unas veinte funciones de borrado, y tres de ellas **borraban de la tabla de empresas usando el
 * identificador de otra entidad** (`DEFECTS.md` C-08).
 */
export async function deleteCompany(actor: Actor, companyId: string): Promise<void> {
  await withRequester(actor, async (tx) => {
    const company = await loadCompany(tx, companyId)

    // El asiento se escribe **antes** de la baja: después, la empresa ya no está entre las del
    // solicitante —`app.member_of()` excluye las dadas de baja— y la política del asiento no
    // dejaría anexarlo. Es la misma transacción, así que el orden es lo único que hay que acertar.
    await note(tx, actor, companyId, {
      action: "delete",
      entityId: companyId,
      entityLabel: company.name,
      title: "Dio de baja la empresa",
      permissions: ["companies.companies.delete"],
    })

    await tx.update(companies).set({ deletedAt: new Date() }).where(eq(companies.id, companyId))
  })
}

// ─── Membresías ──────────────────────────────────────────────────────────────

/**
 * Qué se puede pedir de la colección de miembros.
 *
 * Los tres filtros son los que la pantalla ofrece: por rol, por estado y por propiedad. Son también
 * los tres que se necesitan para responder «quién quedó sin rol» y «quién sigue desactivado», que
 * es lo que se pregunta de una lista de miembros.
 */
export const memberQuery: QuerySchema = {
  filters: {
    roleId: { type: "id", set: true, label: "Rol" },
    isActive: { type: "boolean", label: "Estado" },
    isOwner: { type: "boolean", label: "Propiedad" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["name", "lastname", "email"],
  sortable: ["name", "email", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
}

export async function listMembers(
  actor: Actor,
  companyId: string,
  query: ParsedQuery,
): Promise<Page<MemberRecord>> {
  const mapping = {
    fields: {
      roleId: companyMembers.roleId,
      isActive: companyMembers.isActive,
      isOwner: companyMembers.isOwner,
      name: users.name,
      email: users.email,
      createdAt: companyMembers.createdAt,
    },
    searchable: [users.name, users.lastname, users.email],
    tiebreak: companyMembers.id,
  }
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadCompany(tx, companyId)

    const where = and(
      eq(companyMembers.companyId, companyId),
      ...collectionConditions(query, mapping),
    )

    // El recuento repite las uniones porque la búsqueda toca columnas de `users`: contar sin ellas
    // devolvería el total sin filtrar y la paginación anunciaría páginas que están vacías.
    const [total] = await tx
      .select({ value: count() })
      .from(companyMembers)
      .innerJoin(users, eq(users.id, companyMembers.userId))
      .where(where)

    const rows = await tx
      .select({
        id: companyMembers.id,
        userId: users.id,
        email: users.email,
        name: users.name,
        lastname: users.lastname,
        roleId: companyMembers.roleId,
        roleName: roles.name,
        isOwner: companyMembers.isOwner,
        isActive: companyMembers.isActive,
        createdAt: companyMembers.createdAt,
      })
      .from(companyMembers)
      .innerJoin(users, eq(users.id, companyMembers.userId))
      .leftJoin(roles, eq(roles.id, companyMembers.roleId))
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    return buildPage(rows, total?.value ?? 0, page, limit)
  })
}

export interface AddMemberInput {
  /** Correo de quien se incorpora. Debe tener cuenta: crear la cuenta es la vía de invitación. */
  readonly email: string
  readonly roleId?: string | null | undefined
}

/**
 * Incorpora a una persona que ya tiene cuenta.
 *
 * La invitación de quien **no** tiene cuenta —crear la cuenta sin contraseña y enviarle un enlace
 * de un solo uso— ya existe en `accounts.ts` desde la rebanada 04. Aquí sólo se ata a la empresa.
 *
 * La búsqueda del usuario por correo **no puede pasar por las políticas**: quien invita no tiene
 * por qué compartir empresa con la persona invitada, así que su fila no está en su alcance. Se
 * resuelve fuera de la transacción del solicitante y sólo se usa el identificador; nada del
 * perfil ajeno sale de aquí.
 */
export async function addMember(
  actor: Actor,
  companyId: string,
  input: AddMemberInput,
): Promise<MemberRecord> {
  const email = input.email.trim().toLowerCase()

  const [invited] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1)

  if (!invited) {
    throw new UnprocessableError("No existe ninguna cuenta con ese correo")
  }

  const added = await withRequester(actor, async (tx) => {
    await loadCompany(tx, companyId)
    await assertRoleBelongs(tx, companyId, input.roleId ?? null)

    const [existing] = await tx
      .select({ id: companyMembers.id })
      .from(companyMembers)
      .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, invited.id)))
      .limit(1)

    if (existing) throw new ConflictError("Esa persona ya pertenece a la empresa")

    await tx.insert(companyMembers).values({
      id: newId(),
      companyId,
      userId: invited.id,
      roleId: input.roleId ?? null,
      isOwner: false,
    })

    const member = await readMember(tx, companyId, invited.id)

    await note(tx, actor, companyId, {
      action: "create",
      entity: "company_members",
      entityId: member.id,
      entityLabel: member.email,
      title: `Incorporó a ${member.email}`,
      url: `/${companyId}/miembros`,
      permissions: ["companies.users.invite"],
    })

    return member
  })

  await followSeats(companyId)
  return added
}

/**
 * Los asientos siguen a los miembros activos.
 *
 * Ocurre **después de confirmar**, no dentro de la transacción: ampliar habla con el procesador de
 * pagos, y una llamada de red dentro de una transacción la alarga y puede tumbarla por algo que no
 * tiene que ver con los datos.
 *
 * Si la sincronización falla, la membresía **se queda**: quién pertenece a la empresa lo decide
 * esta operación, y el número de asientos es una consecuencia que se vuelve a calcular sola en el
 * siguiente cambio de plantilla o en la renovación. Al revés —deshacer la incorporación porque el
 * procesador no contestó— se perdería la decisión de una persona por un fallo ajeno.
 */
async function followSeats(companyId: string): Promise<void> {
  try {
    await syncSeats(companyId)
  } catch (error) {
    rootLogger.error("no se pudieron sincronizar los asientos", { companyId, error })
  }
}

export interface UpdateMemberInput {
  readonly roleId?: string | null | undefined
  readonly isActive?: boolean | undefined
  readonly isOwner?: boolean | undefined
}

/**
 * Cambia el rol, la actividad o la propiedad de una membresía.
 *
 * Dos invariantes, y las dos protegen lo mismo: **que la empresa nunca se quede sin propietaria**.
 * Sin propietaria no hay quien conceda permisos ni quien nombre a otra, así que la empresa queda
 * inservible y sólo la administración de plataforma puede rescatarla.
 *
 * Se comprueban **dentro de la transacción**: comprobar antes y escribir después deja una ventana
 * en la que dos peticiones simultáneas, cada una retirando a una propietaria distinta, pasan las
 * dos su comprobación y dejan cero.
 */
export async function updateMember(
  actor: Actor,
  companyId: string,
  memberId: string,
  input: UpdateMemberInput,
): Promise<MemberRecord> {
  const changed = await withRequester(actor, async (tx) => {
    await loadCompany(tx, companyId)

    const member = await loadMember(tx, companyId, memberId)

    const losesOwnership = member.isOwner && (input.isOwner === false || input.isActive === false)

    if (losesOwnership) await assertNotLastOwner(tx, companyId, memberId)

    if (input.roleId !== undefined) await assertRoleBelongs(tx, companyId, input.roleId)

    const patch: Record<string, unknown> = {}
    if (input.roleId !== undefined) patch.roleId = input.roleId
    if (input.isActive !== undefined) patch.isActive = input.isActive
    if (input.isOwner !== undefined) patch.isOwner = input.isOwner

    if (Object.keys(patch).length > 0) {
      await tx.update(companyMembers).set(patch).where(eq(companyMembers.id, memberId))
    }

    const updated = await readMember(tx, companyId, member.userId)

    if (Object.keys(patch).length > 0) {
      await note(tx, actor, companyId, {
        action: "update",
        entity: "company_members",
        entityId: memberId,
        entityLabel: updated.email,
        title: `Cambió la membresía de ${updated.email}`,
        url: `/${companyId}/miembros`,
        permissions: ["companies.users.change-role"],
      })
    }

    return updated
  })

  // Activar o desactivar una membresía cambia cuántos asientos están ocupados.
  if (input.isActive !== undefined) await followSeats(companyId)
  return changed
}

/** Retira a alguien de la empresa. No puede dejarla sin propietaria. */
export async function removeMember(
  actor: Actor,
  companyId: string,
  memberId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadCompany(tx, companyId)

    const member = await loadMember(tx, companyId, memberId)
    if (member.isOwner) await assertNotLastOwner(tx, companyId, memberId)

    const retirado = await readMember(tx, companyId, member.userId)

    await tx.delete(companyMembers).where(eq(companyMembers.id, memberId))

    await note(tx, actor, companyId, {
      action: "delete",
      entity: "company_members",
      entityId: memberId,
      entityLabel: retirado.email,
      title: `Retiró a ${retirado.email} de la empresa`,
      url: `/${companyId}/miembros`,
      permissions: ["companies.users.uninvite"],
    })
  })

  // Retirar libera el asiento, que es lo que la spec pide. No se reduce el contrato por su cuenta:
  // el asiento queda libre para el siguiente.
  await followSeats(companyId)
}

// ─── Bitácora ────────────────────────────────────────────────────────────────

/**
 * Anota lo que se acaba de hacer, **en la misma transacción**.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md`. Que reciba `tx` y no abra la suya es
 * todo el requisito: si la mutación se revierte no queda asiento, y si el asiento no se puede
 * escribir la mutación no se confirma.
 *
 * La clave de permiso que se declara aquí es **la misma que protege la ruta**, y ahí está el
 * vínculo que la spec pide: lo que autoriza la acción selecciona a quién se le cuenta.
 */
async function note(
  tx: Transaction,
  actor: Actor,
  companyId: string,
  input: {
    action: "create" | "update" | "delete"
    entity?: string
    entityId: string
    entityLabel: string
    title: string
    url?: string
    permissions: readonly PermissionKey[]
  },
): Promise<void> {
  await recordActivity(tx, {
    companyId,
    action: input.action,
    entity: input.entity ?? "companies",
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    title: input.title,
    url: input.url ?? `/${companyId}`,
    permissions: input.permissions,
    performedById: actor.userId,
    performedAsPlatformAdmin: actor.asPlatformAdmin ?? false,
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/**
 * Carga la empresa, o falla como si no existiera.
 *
 * Una empresa fuera del alcance del solicitante responde `404` y no `403`. La diferencia importa:
 * `403` confirma que existe, y eso permite descubrir qué empresas hay en la plataforma probando
 * identificadores.
 */
async function loadCompany(tx: Transaction, companyId: string) {
  const [company] = await tx
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
    .limit(1)

  if (!company) throw new NotFoundError("La empresa no existe")
  return company
}

async function loadMember(tx: Transaction, companyId: string, memberId: string) {
  const [member] = await tx
    .select()
    .from(companyMembers)
    .where(and(eq(companyMembers.id, memberId), eq(companyMembers.companyId, companyId)))
    .limit(1)

  if (!member) throw new NotFoundError("Esa persona no pertenece a la empresa")
  return member
}

async function readMember(
  tx: Transaction,
  companyId: string,
  userId: string,
): Promise<MemberRecord> {
  const [row] = await tx
    .select({
      id: companyMembers.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      lastname: users.lastname,
      roleId: companyMembers.roleId,
      roleName: roles.name,
      isOwner: companyMembers.isOwner,
      isActive: companyMembers.isActive,
      createdAt: companyMembers.createdAt,
    })
    .from(companyMembers)
    .innerJoin(users, eq(users.id, companyMembers.userId))
    .leftJoin(roles, eq(roles.id, companyMembers.roleId))
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, userId)))
    .limit(1)

  if (!row) throw new NotFoundError("Esa persona no pertenece a la empresa")
  return row
}

/** Un rol es de una empresa y de una sola. Asignar el de otra cruzaría los arrendatarios. */
async function assertRoleBelongs(
  tx: Transaction,
  companyId: string,
  roleId: string | null,
): Promise<void> {
  if (roleId === null) return

  const [role] = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.companyId, companyId)))
    .limit(1)

  if (!role) throw new UnprocessableError("Ese rol no pertenece a esta empresa")
}

async function assertNotLastOwner(
  tx: Transaction,
  companyId: string,
  memberId: string,
): Promise<void> {
  const [row] = await tx
    .select({ remaining: count() })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.isOwner, true),
        eq(companyMembers.isActive, true),
        ne(companyMembers.id, memberId),
      ),
    )

  if ((row?.remaining ?? 0) === 0) {
    throw new UnprocessableError(
      "La empresa se quedaría sin propietaria. Nombra a otra antes de retirar ésta.",
    )
  }
}

function toCompanyRecord(row: typeof companies.$inferSelect): CompanyRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    email: row.email,
    commissionRate: row.commissionRate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}
