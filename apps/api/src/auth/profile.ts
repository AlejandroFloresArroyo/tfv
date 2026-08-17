/**
 * El perfil del solicitante: quién es y dónde puede entrar.
 *
 * Ver `openspec/specs/app-shell/spec.md`.
 *
 * Existe porque la cáscara de la aplicación no puede pintarse sin él. Las tres guardas anidadas que
 * la spec exige —cuenta, empresa y servicio— necesitan las mismas tres respuestas en cada carga:
 * quién entró, a qué empresas pertenece, y qué servicios tiene habilitados cada una.
 *
 * **Lo que sale de aquí no es control de acceso.** La navegación oculta lo que no corresponde, pero
 * quien escriba la dirección a mano se topa igualmente con el guardián del servidor. Ocultar y
 * proteger son dos cosas distintas, y la spec lo dice con esas palabras.
 *
 * Los permisos efectivos se resuelven con la misma función que usa el guardián
 * (`authorization.ts`), no con una copia. Dos implementaciones de «qué puede hacer esta persona»
 * divergen: la interfaz ofrecería lo que el servidor niega, o al revés, y el segundo caso es peor
 * porque no se nota hasta que alguien intenta usarlo.
 */

import { PERMISSION_KEYS, type PermissionKey } from "@tfv/contracts"
import { db } from "@tfv/db"
import { companies, companyMembers, companyServices, roles, services, users } from "@tfv/db/schema"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { type Authorization, effectivePermissions } from "./authorization.ts"

export interface ProfileService {
  readonly keycode: string
  readonly name: string
}

export interface ProfileCompany {
  readonly id: string
  readonly name: string
  readonly isOwner: boolean
  /** Servicios habilitados en esta empresa. Vacío significa que no hay nada que abrir. */
  readonly services: readonly ProfileService[]
  /**
   * Permisos efectivos. Quien elude —propietaria, administración de plataforma— recibe el catálogo
   * entero, porque eso es lo que efectivamente puede hacer.
   *
   * **No es control de acceso**, y la spec lo dice con esas palabras: ocultar una entrada de
   * navegación no protege nada. Es para no ofrecer lo que no se puede hacer.
   */
  readonly permissions: readonly PermissionKey[]
}

export interface Profile {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly lastname: string
  readonly username: string
  readonly isPlatformAdmin: boolean
  readonly emailVerified: boolean
  /** Empresas con membresía **activa**. Vacío para un comprador sin membresías. */
  readonly companies: readonly ProfileCompany[]
}

/**
 * Carga el perfil de un usuario ya autenticado.
 *
 * Devuelve `null` si la cuenta se dio de baja entre la resolución de la sesión y esta consulta. Es
 * una ventana estrecha, pero el llamador tiene que poder distinguirla de un perfil vacío.
 */
export async function loadProfile(userId: string): Promise<Profile | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      lastname: users.lastname,
      username: users.username,
      isPlatformAdmin: users.isPlatformAdmin,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1)

  if (!user) return null

  // El rol viene en la misma consulta que la membresía: pedirlo aparte costaría un viaje por
  // empresa, y quien pertenece a seis los paga en cada carga de pantalla.
  const memberships = await db
    .select({
      companyId: companies.id,
      name: companies.name,
      isOwner: companyMembers.isOwner,
      permissions: roles.permissions,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .leftJoin(roles, eq(roles.id, companyMembers.roleId))
    .where(
      and(
        eq(companyMembers.userId, userId),
        eq(companyMembers.isActive, true),
        isNull(companies.deletedAt),
      ),
    )
    .orderBy(asc(companies.name))

  const enabled = await enabledServices(memberships.map((membership) => membership.companyId))

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    lastname: user.lastname,
    username: user.username,
    isPlatformAdmin: user.isPlatformAdmin,
    emailVerified: user.emailVerifiedAt !== null,
    companies: memberships.map((membership) => {
      // La membresía ya está filtrada a las activas, así que aquí `isMember` es cierto por
      // construcción. Se arma la misma forma que usa el guardián para que las dos caras —lo que la
      // interfaz ofrece y lo que el servidor concede— no puedan divergir en su lógica.
      const authorization: Authorization = {
        isMember: true,
        isOwner: membership.isOwner,
        isPlatformAdmin: user.isPlatformAdmin,
        granted: new Set(membership.permissions ?? []),
      }

      return {
        id: membership.companyId,
        name: membership.name,
        isOwner: membership.isOwner,
        services: enabled.get(membership.companyId) ?? [],
        permissions: effectivePermissions(authorization, PERMISSION_KEYS),
      }
    }),
  }
}

/**
 * Servicios habilitados, agrupados por empresa.
 *
 * Una sola consulta para todas las empresas en lugar de una por empresa: quien pertenece a seis
 * pagaría seis viajes en cada carga de pantalla, y son siempre las mismas seis.
 */
async function enabledServices(
  companyIds: readonly string[],
): Promise<Map<string, ProfileService[]>> {
  const grouped = new Map<string, ProfileService[]>()
  if (companyIds.length === 0) return grouped

  const rows = await db
    .select({
      companyId: companyServices.companyId,
      keycode: services.keycode,
      name: services.name,
    })
    .from(companyServices)
    .innerJoin(services, eq(services.id, companyServices.serviceId))
    .where(and(inArray(companyServices.companyId, [...companyIds]), eq(services.isDisabled, false)))
    .orderBy(asc(services.name))

  for (const row of rows) {
    const list = grouped.get(row.companyId)
    const service = { keycode: row.keycode, name: row.name }
    if (list) list.push(service)
    else grouped.set(row.companyId, [service])
  }

  return grouped
}
