/**
 * Aplicación del régimen de acceso declarado por cada ruta.
 *
 * Ver `openspec/specs/access-control/spec.md`.
 *
 * Este middleware se monta **por ruta**, a partir del régimen que su declaración exige. No hay
 * forma de saltárselo: `defineRoute` no compila sin declarar el régimen, y `mountRoutes` envuelve
 * todos los manejadores sin excepción.
 *
 * Es la diferencia con la pila anterior, donde el gancho de autenticación se añadía a mano ruta por
 * ruta y olvidarlo la dejaba abierta — que es como sesenta y nueve de noventa y un módulos
 * acabaron sin autenticación (`DEFECTS.md` S-05).
 */

import { missingPermission, type PermissionKey, UnauthenticatedError } from "@tfv/contracts"
import type { Context, MiddlewareHandler } from "hono"
import type { AccessRegime } from "../runtime/route.ts"
import {
  type Authorization,
  allows,
  type GrantReason,
  reasonFor,
  resolveAuthorization,
} from "./authorization.ts"
import { resolveSession, type SessionContext } from "./sessions.ts"

declare module "hono" {
  interface ContextVariableMap {
    session: SessionContext
    /** Sólo en rutas con permiso declarado: lo que el solicitante puede hacer en esa empresa. */
    authorization: Authorization
    /** Por qué se dejó pasar. La bitácora marca lo ejercido como administración de plataforma. */
    grantReason: GrantReason
  }
}

/** Nombre de la cookie que transporta la credencial de acceso. */
export const ACCESS_COOKIE = "tfv_session"
/** Nombre de la cookie que transporta la credencial de renovación. */
export const REFRESH_COOKIE = "tfv_refresh"

/**
 * Extrae la credencial de acceso.
 *
 * Se admite en cookie —el camino del navegador, no accesible por script— y en el encabezado
 * estándar de autorización, para integraciones que no usan cookies.
 */
export function readAccessToken(c: Context): string | null {
  const header = c.req.header("authorization")
  if (header?.toLowerCase().startsWith("bearer ")) {
    const value = header.slice(7).trim()
    if (value.length > 0) return value
  }

  const cookie = c.req.header("cookie")
  if (!cookie) return null

  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name === ACCESS_COOKIE) {
      const value = rest.join("=").trim()
      if (value.length > 0) return decodeURIComponent(value)
    }
  }

  return null
}

export function readRefreshToken(c: Context): string | null {
  const cookie = c.req.header("cookie")
  if (!cookie) return null

  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name === REFRESH_COOKIE) {
      const value = rest.join("=").trim()
      if (value.length > 0) return decodeURIComponent(value)
    }
  }

  return null
}

/**
 * Construye el middleware que corresponde al régimen de una ruta.
 *
 * Una ruta pública no lleva ninguno: la comprobación se omite del todo, y el motivo por el que está
 * abierta quedó escrito en su declaración.
 */
export function guardFor(access: AccessRegime): MiddlewareHandler | null {
  switch (access.kind) {
    case "public":
      return null

    case "authenticated":
      return authenticate

    case "permission":
      return requirePermission(access.permission)
  }
}

/** Exige una sesión válida y deja el contexto del solicitante disponible. */
const authenticate: MiddlewareHandler = async (c, next) => {
  const token = readAccessToken(c)
  if (!token) throw new UnauthenticatedError()

  const session = await resolveSession(token)
  if (!session) throw new UnauthenticatedError()

  c.set("session", session)
  await next()
}

/**
 * Exige un permiso concreto dentro de la empresa de la petición.
 *
 * ## De dónde sale la empresa
 *
 * **Del camino de la ruta, y sólo de ahí.** Toda ruta con permiso declarado lleva `:companyId`, y
 * `defineRoute` no deja registrar una que no lo lleve. Aceptarla del cuerpo o de la consulta
 * permitiría pedir una operación sobre la empresa A declarando la B, que es exactamente el defecto
 * S-06 de la implementación anterior — donde el parámetro de ruta concedía acceso a cualquier
 * arrendatario porque nadie comprobaba pertenencia.
 *
 * Aquí el parámetro **no concede nada**: sólo dice contra qué empresa se resuelve la membresía. Si
 * no la hay, la respuesta es la misma que para un permiso que falta.
 *
 * ## Antes de cualquier efecto
 *
 * La comprobación ocurre en el middleware, antes de que el manejador corra. Lo exige la spec: sin
 * permiso no debe quedar rastro ni emitirse notificación alguna. Comprobar dentro del manejador
 * dejaría al criterio de cada uno hacerlo antes o después de escribir.
 */
function requirePermission(permission: PermissionKey): MiddlewareHandler {
  return async (c, next) => {
    const token = readAccessToken(c)
    if (!token) throw new UnauthenticatedError()

    const session = await resolveSession(token)
    if (!session) throw new UnauthenticatedError()

    c.set("session", session)

    const companyId = c.req.param("companyId")
    if (!companyId) {
      // No puede pasar: `defineRoute` lo impide al registrar. Si pasara, es fallo del servidor y
      // no del solicitante, y sobre todo **no se deja pasar**.
      throw new Error(
        `La ruta ${c.req.path} exige el permiso «${permission}» y no declara :companyId`,
      )
    }

    const authorization = await resolveAuthorization(session.userId, companyId)
    if (!allows(authorization, permission)) throw missingPermission(permission)

    c.set("authorization", authorization)
    c.set("grantReason", reasonFor(authorization, permission))

    await next()
  }
}

/** El contexto del solicitante en una ruta autenticada. */
export function requireSession(c: Context): SessionContext {
  const session = c.get("session")
  if (!session) throw new UnauthenticatedError()
  return session
}
