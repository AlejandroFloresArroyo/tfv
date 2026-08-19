/**
 * Administración de plataforma.
 *
 * Ver `openspec/specs/access-control/spec.md` —«El administrador de plataforma cruza empresas»— y
 * `openspec/specs/app-shell/spec.md`, «Guarda de administración de plataforma».
 *
 * ## Este módulo no amplía la elusión: la usa
 *
 * La marca de administración de plataforma **ya existe** y ya la resuelven dos capas: la sesión la
 * trae desde `users.is_platform_admin` (rebanada 04) y el motor la vuelve a resolver por su cuenta
 * con `app.is_platform_admin()` (rebanada 06). Aquí no se calcula nada nuevo ni se concede nada
 * nuevo: se comprueba la primera y se deja que la segunda haga su trabajo.
 *
 * Por eso todas las lecturas de aquí corren bajo `withRequester` con la identidad de quien pregunta,
 * y **no** por la vía elevada. La diferencia importa: si mañana alguien borrara `assertPlatform` de
 * un manejador, un usuario corriente vería sus propias empresas —que ya puede ver— y no las de
 * todos. Con la vía elevada vería las de todos.
 *
 * ## Y todo lo que hace deja asiento
 *
 * Un poder que no deja rastro no lo puede auditar nadie. `recordPlatformAction` es el sitio por
 * donde eso ocurre, y recibe la transacción de quien muta por el mismo motivo que
 * `recordActivity`: si la mutación se revierte no hay asiento, y si el asiento no se puede escribir
 * la mutación no se confirma. Un asiento «casi siempre» no es una bitácora.
 */

import {
  buildPage,
  ForbiddenError,
  newId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import { companies, companyMembers, platformActivities, users } from "@tfv/db/schema"
import { and, count, eq, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"

/**
 * La puerta del área.
 *
 * Es la misma comprobación que ya gobierna la taxonomía global y la bandeja de prospectos, y por el
 * mismo motivo: **no hay permiso *de empresa* que pueda autorizar algo que no pertenece a ninguna**.
 * El catálogo está cerrado en 255 claves y ninguna cubre esto; inventar una lo desalinearía del
 * catálogo migrado, que es la decisión que sigue pendiente de producto.
 *
 * Responde `403` y no `404`. La distinción de la spec es entre arrendatarios —donde `404` evita
 * revelar que una empresa existe—; aquí no hay nada que ocultar: que la plataforma tenga
 * administración lo sabe cualquiera, y lo que se está negando es el papel, no la existencia.
 */
export function assertPlatformAdmin(isPlatformAdmin: boolean): void {
  if (!isPlatformAdmin) {
    throw new ForbiddenError("Esta área es de la administración de plataforma")
  }
}

// ─── La bitácora de plataforma ───────────────────────────────────────────────

export type PlatformAction = "create" | "update" | "delete"

export interface PlatformActionInput {
  readonly action: PlatformAction
  /** La tabla afectada, para poder filtrar por tipo de entidad sin adivinar por el título. */
  readonly entity: string
  readonly entityId?: string | undefined
  /** Sobre quién o sobre qué se ejerció, legible sin abrir nada. */
  readonly entityLabel?: string | undefined
  readonly title: string
  readonly description?: string | undefined
  readonly performedById: string
}

/**
 * Escribe el asiento de una acción de plataforma.
 *
 * Pide la transacción de la mutación y no la abre por su cuenta, igual que `recordActivity`. Una
 * función que abriera la suya dejaría la puerta a que la operación se confirmara sin asiento.
 *
 * **No reparte avisos**, y ésa es la diferencia con la bitácora de empresa. Allí la audiencia son
 * los miembros que tienen el permiso que autorizó la acción; aquí no hay empresa de la que sacar
 * audiencia, y avisar «a los administradores de plataforma» sería avisar al que acaba de actuar.
 */
export async function recordPlatformAction(
  tx: Transaction,
  input: PlatformActionInput,
): Promise<string> {
  const id = newId()

  await tx.insert(platformActivities).values({
    id,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    entityLabel: (input.entityLabel ?? "").slice(0, 200),
    title: input.title.slice(0, 200),
    description: input.description ?? "",
    performedById: input.performedById,
  })

  return id
}

export interface PlatformActivityRecord {
  readonly id: string
  readonly action: PlatformAction
  readonly entity: string
  readonly entityId: string | null
  readonly entityLabel: string
  readonly title: string
  readonly description: string
  readonly performedBy: string
  readonly createdAt: Date
}

export const platformActivityQuery: QuerySchema = {
  filters: {
    action: { type: "enum", values: ["create", "update", "delete"], set: true, label: "Acción" },
    entity: { type: "string", label: "Entidad" },
    createdAt: { type: "date", range: true, label: "Cuándo" },
  },
  searchable: ["title", "entityLabel"],
  sortable: ["createdAt"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
}

export async function listPlatformActivity(
  actor: Actor,
  query: ParsedQuery,
): Promise<Page<PlatformActivityRecord>> {
  const mapping = {
    fields: {
      action: platformActivities.action,
      entity: platformActivities.entity,
      createdAt: platformActivities.createdAt,
    },
    searchable: [platformActivities.title, platformActivities.entityLabel],
    tiebreak: platformActivities.id,
  }
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    const where = and(...collectionConditions(query, mapping))

    const [total] = await tx.select({ value: count() }).from(platformActivities).where(where)

    const rows = await tx
      .select({
        id: platformActivities.id,
        action: platformActivities.action,
        entity: platformActivities.entity,
        entityId: platformActivities.entityId,
        entityLabel: platformActivities.entityLabel,
        title: platformActivities.title,
        description: platformActivities.description,
        // El nombre de quien actuó se resuelve aquí y no en la pantalla: el asiento sobrevive a la
        // baja de la cuenta, y entonces ya no hay perfil que ir a buscar.
        actorName: users.name,
        actorLastname: users.lastname,
        actorEmail: users.email,
        createdAt: platformActivities.createdAt,
      })
      .from(platformActivities)
      .leftJoin(users, eq(users.id, platformActivities.performedById))
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    const items = rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      entityLabel: row.entityLabel,
      title: row.title,
      description: row.description,
      performedBy:
        [row.actorName, row.actorLastname].filter(Boolean).join(" ") || (row.actorEmail ?? ""),
      createdAt: row.createdAt,
    }))

    return buildPage(items, total?.value ?? 0, page, limit)
  })
}

// ─── El padrón de empresas ───────────────────────────────────────────────────

export interface PlatformCompanyRecord {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly email: string | null
  readonly commissionRate: string
  readonly memberCount: number
  readonly createdAt: Date
  readonly deletedAt: Date | null
}

export const platformCompanyQuery: QuerySchema = {
  filters: { createdAt: { type: "date", range: true, label: "Alta" } },
  searchable: ["name", "email"],
  sortable: ["name", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
}

/**
 * El padrón: todas las empresas, **incluidas las dadas de baja**.
 *
 * Las bajas son lógicas y siguen aquí a propósito. Un padrón que las esconde no puede responder a
 * «¿qué pasó con aquella empresa?», que es media razón de tener padrón; la pantalla las marca en
 * lugar de callarlas.
 */
export async function listPlatformCompanies(
  actor: Actor,
  query: ParsedQuery,
): Promise<Page<PlatformCompanyRecord>> {
  const mapping = {
    fields: { name: companies.name, createdAt: companies.createdAt },
    searchable: [companies.name, companies.email],
    tiebreak: companies.id,
  }
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    const where = and(...collectionConditions(query, mapping))

    const [total] = await tx.select({ value: count() }).from(companies).where(where)

    const rows = await tx
      .select({
        id: companies.id,
        name: companies.name,
        description: companies.description,
        email: companies.email,
        commissionRate: companies.commissionRate,
        /**
         * El recuento va en la misma consulta: una lista de veinticinco empresas con una consulta
         * por fila son veintiséis viajes para pintar una columna.
         *
         * La referencia a la empresa se escribe **cualificada a mano** y no interpolando la
         * columna. En la lista de selección, Drizzle emite las columnas sin su tabla —`"id"`—, y
         * dentro de esta subconsulta `"id"` resuelve contra `company_members`, que también tiene
         * una: la correlación se rompe en silencio y el recuento sale cero para todo el mundo.
         */
        memberCount: sql<number>`cast((
          select count(*) from company_members m
          where m.company_id = "companies"."id" and m.is_active
        ) as integer)`,
        createdAt: companies.createdAt,
        deletedAt: companies.deletedAt,
      })
      .from(companies)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    return buildPage(rows, total?.value ?? 0, page, limit)
  })
}

/** Los miembros de una empresa cualquiera, para poder mirar quién la lleva sin entrar en ella. */
export async function listPlatformCompanyMembers(
  actor: Actor,
  companyId: string,
): Promise<readonly PlatformMemberRecord[]> {
  return withRequester(actor, async (tx) => {
    return tx
      .select({
        id: companyMembers.id,
        userId: users.id,
        email: users.email,
        name: users.name,
        lastname: users.lastname,
        isOwner: companyMembers.isOwner,
        isActive: companyMembers.isActive,
      })
      .from(companyMembers)
      .innerJoin(users, eq(users.id, companyMembers.userId))
      .where(eq(companyMembers.companyId, companyId))
      .orderBy(companyMembers.isOwner, users.name, companyMembers.id)
      .limit(96)
  })
}

export interface PlatformMemberRecord {
  readonly id: string
  readonly userId: string
  readonly email: string
  readonly name: string
  readonly lastname: string
  readonly isOwner: boolean
  readonly isActive: boolean
}

// ─── El padrón de usuarios ───────────────────────────────────────────────────

export interface PlatformUserRecord {
  readonly id: string
  readonly email: string
  readonly username: string
  readonly name: string
  readonly lastname: string
  readonly isActive: boolean
  readonly isPlatformAdmin: boolean
  readonly emailVerified: boolean
  readonly companyCount: number
  readonly lastLoginAt: Date | null
  readonly createdAt: Date
  readonly deletedAt: Date | null
}

export const platformUserQuery: QuerySchema = {
  filters: {
    isActive: { type: "boolean", label: "Estado" },
    isPlatformAdmin: { type: "boolean", label: "Plataforma" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["name", "lastname", "email", "username"],
  sortable: ["name", "email", "createdAt"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
}

/**
 * El padrón de cuentas.
 *
 * **No devuelve la derivación de la contraseña ni ningún dato de sesión.** No es una precaución
 * cosmética: esta respuesta es la única del sistema que reúne a todas las personas de todos los
 * arrendatarios en un solo cuerpo, así que lo que se cuele aquí se cuela entero de una vez. Las
 * columnas se enumeran una a una en lugar de seleccionar la fila.
 */
export async function listPlatformUsers(
  actor: Actor,
  query: ParsedQuery,
): Promise<Page<PlatformUserRecord>> {
  const mapping = {
    fields: {
      isActive: users.isActive,
      isPlatformAdmin: users.isPlatformAdmin,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    },
    searchable: [users.name, users.lastname, users.email, users.username],
    tiebreak: users.id,
  }
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    const where = and(...collectionConditions(query, mapping))

    const [total] = await tx.select({ value: count() }).from(users).where(where)

    const rows = await tx
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        name: users.name,
        lastname: users.lastname,
        isActive: users.isActive,
        isPlatformAdmin: users.isPlatformAdmin,
        emailVerifiedAt: users.emailVerifiedAt,
        // Cualificada a mano por lo mismo que en el padrón de empresas: `company_members` tiene su
        // propia columna `id` y la correlación sin tabla se rompería sin decirlo.
        companyCount: sql<number>`cast((
          select count(*) from company_members m
          where m.user_id = "users"."id" and m.is_active
        ) as integer)`,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    const items = rows.map(({ emailVerifiedAt, ...row }) => ({
      ...row,
      emailVerified: emailVerifiedAt !== null,
    }))

    return buildPage(items, total?.value ?? 0, page, limit)
  })
}
