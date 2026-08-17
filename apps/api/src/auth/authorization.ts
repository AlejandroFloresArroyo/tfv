/**
 * Resolución de lo que un solicitante puede hacer dentro de una empresa.
 *
 * Ver `openspec/specs/access-control/spec.md` y la rebanada 05.
 *
 * Éste es el cambio más profundo del programa: los permisos **existían** en la implementación
 * anterior y no autorizaban nada. Su único consumidor decidía a quién notificar, así que el editor
 * de matriz de permisos era, en la práctica, un selector de audiencia con aspecto de control de
 * acceso (`DEFECTS.md` S-07).
 *
 * ## Las tres vías por las que se concede
 *
 * | Vía | Qué concede | Qué **no** elude |
 * |---|---|---|
 * | Rol | las claves que su conjunto declara | nada |
 * | Propietario de la empresa | todas las claves | pertenencia ni habilitación del servicio |
 * | Administrador de plataforma | todas las claves, en cualquier empresa | habilitación del servicio |
 *
 * La acotación importa y la spec la escribe con esas palabras: la elusión del propietario se aplica
 * **sólo** a la comprobación de permiso. Un propietario de una empresa sin el servicio de
 * producciones contratado sigue sin poder abrirlo.
 */

import { type PermissionKey, unknownPermissions, ValidationError } from "@tfv/contracts"
import { db } from "@tfv/db"
import { companyMembers, roles, users } from "@tfv/db/schema"
import { and, eq } from "drizzle-orm"

/** Lo que un usuario puede hacer en una empresa concreta. */
export interface Authorization {
  /** Tiene membresía activa. Sin esto no hay nada más que mirar. */
  readonly isMember: boolean
  readonly isOwner: boolean
  readonly isPlatformAdmin: boolean
  /**
   * Las claves que el rol concede. **No incluye las que se obtienen por elusión**: quien elude no
   * tiene permisos, se salta la comprobación, y son cosas distintas cuando hay que explicar por qué
   * alguien pudo hacer algo.
   */
  readonly granted: ReadonlySet<string>
}

/**
 * Resuelve la autorización de un usuario en una empresa.
 *
 * Una sola consulta. Se ejecuta en cada operación con permiso declarado, así que pagar dos viajes
 * —uno para la membresía y otro para el rol— se notaría.
 */
export async function resolveAuthorization(
  userId: string,
  companyId: string,
): Promise<Authorization> {
  const [row] = await db
    .select({
      isOwner: companyMembers.isOwner,
      isActive: companyMembers.isActive,
      isPlatformAdmin: users.isPlatformAdmin,
      permissions: roles.permissions,
    })
    .from(users)
    .leftJoin(
      companyMembers,
      and(eq(companyMembers.userId, users.id), eq(companyMembers.companyId, companyId)),
    )
    .leftJoin(roles, eq(roles.id, companyMembers.roleId))
    .where(eq(users.id, userId))
    .limit(1)

  if (!row) {
    return { isMember: false, isOwner: false, isPlatformAdmin: false, granted: new Set() }
  }

  // Una membresía desactivada conserva el registro y pierde el acceso: no es pertenencia.
  const isMember = row.isActive === true

  return {
    isMember,
    isOwner: isMember && row.isOwner === true,
    isPlatformAdmin: row.isPlatformAdmin,
    // Eliminar un rol deja al miembro sin rol y sin ningún permiso de escritura, conservando la
    // pertenencia. Por eso el `leftJoin` y por eso un conjunto vacío es un resultado válido.
    granted: new Set(isMember ? (row.permissions ?? []) : []),
  }
}

/**
 * ¿Autoriza esta clave?
 *
 * El orden no es casual: **la pertenencia se comprueba antes que cualquier elusión**. Un
 * administrador de plataforma opera «como propietario de una empresa», que es un papel dentro de
 * ella, no por encima de ella — y esa distinción es la que impide que una comprobación de permiso
 * se convierta sin querer en una llave maestra sobre datos de otro arrendatario.
 */
export function allows(authorization: Authorization, permission: PermissionKey): boolean {
  if (authorization.isPlatformAdmin) return true
  if (!authorization.isMember) return false
  if (authorization.isOwner) return true

  return authorization.granted.has(permission)
}

/**
 * Por qué se concedió, para la bitácora.
 *
 * Lo pide la spec: las acciones ejercidas como administración de plataforma se marcan. Sin esto,
 * una operación hecha por soporte sobre los datos de un cliente es indistinguible de una que hizo
 * el cliente.
 */
export type GrantReason = "platform_admin" | "owner" | "role" | null

export function reasonFor(authorization: Authorization, permission: PermissionKey): GrantReason {
  if (authorization.isPlatformAdmin) return "platform_admin"
  if (!authorization.isMember) return null
  if (authorization.isOwner) return "owner"

  return authorization.granted.has(permission) ? "role" : null
}

/**
 * Los permisos efectivos, para que la interfaz sepa qué ofrecer.
 *
 * **No es control de acceso** y la spec lo dice: ocultar una entrada de navegación no protege
 * nada. Sirve para no enseñar puertas que no abren; quien escriba la dirección a mano se topa con
 * el guardián igual.
 *
 * Quien elude recibe la lista entera, porque eso es lo que efectivamente puede hacer.
 */
export function effectivePermissions(
  authorization: Authorization,
  catalog: readonly PermissionKey[],
): readonly PermissionKey[] {
  if (authorization.isPlatformAdmin) return catalog
  if (!authorization.isMember) return []
  if (authorization.isOwner) return catalog

  return catalog.filter((key) => authorization.granted.has(key))
}

/**
 * Valida el conjunto de claves de un rol contra el catálogo.
 *
 * Es lo que convierte al catálogo en la autoridad. Una clave mal escrita que se acepte en silencio
 * no se descubre al guardarla: se descubre semanas después, cuando alguien no puede trabajar y
 * nadie entiende por qué su rol «sí tiene» el permiso.
 */
export function assertKnownPermissions(keys: readonly string[]): void {
  const unknown = unknownPermissions(keys)
  if (unknown.length === 0) return

  throw new ValidationError(
    unknown.map((key) => ({
      key: "permissions",
      message: `La clave de permiso «${key}» no existe en el catálogo`,
    })),
  )
}
