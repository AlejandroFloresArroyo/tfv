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

import {
  missingPermission,
  NotFoundError,
  type PermissionKey,
  UnauthenticatedError,
} from "@tfv/contracts"
import type { Context, MiddlewareHandler } from "hono"
import {
  assertServiceEnabled,
  assertSubscriptionOperating,
  serviceOf,
  subscriptionGateOn,
} from "../billing/entitlements.ts"
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

    /**
     * No pertenecer a la empresa es `404`, no `403`.
     *
     * Lo exige `access-control` con esas palabras: «un solicitante autenticado que pida datos de
     * una empresa a la que no pertenece SHALL recibir `404`, de modo que no pueda inferir la
     * existencia de esa empresa ni de sus recursos». Un `403` responde «existe, pero no es tuya»,
     * y con eso se descubre qué empresas hay probando identificadores.
     *
     * Es distinto de no tener la clave: **quien sí es miembro y no puede hacer algo recibe `403`**,
     * porque ahí no se revela nada que no supiera. Las dos respuestas dicen cosas distintas y por
     * eso son dos comprobaciones y no una.
     *
     * La administración de plataforma no pasa por aquí: elude la membresía por diseño, y `allows`
     * la resuelve antes que nada.
     *
     * Estuvo respondiendo `403` durante meses, con cuatro suites dándolo por bueno — una de ellas
     * llamada «una empresa ajena responde 404, no 403» y afirmando `403` dos líneas más abajo. Ver
     * `HALLAZGOS.md` H-147.
     */
    if (!authorization.isMember && !authorization.isPlatformAdmin) {
      throw new NotFoundError("No existe")
    }

    if (!allows(authorization, permission)) throw missingPermission(permission)

    /**
     * Las otras dos compuertas.
     *
     * El servicio se **deriva de la clave de permiso** —su primer nivel es `services.keycode`— en
     * lugar de declararse ruta por ruta. Es lo que cumple «la comprobación SHALL realizarse en el
     * servidor en cada operación del servicio»: no hay forma de escribir una operación de servicio
     * que se salte la compuerta, ni de olvidarse de declararla. Ver `billing/entitlements.ts`.
     *
     * Y va **después** del permiso a propósito: si faltan las dos cosas, la respuesta habla del
     * permiso, que es la que no revela qué tiene contratado la empresa a quien no pertenece a ella.
     *
     * La elusión del propietario no llega hasta aquí. Lo dice `access-control` con esas palabras:
     * se aplica sólo a la comprobación de permiso, y un propietario de una empresa sin el servicio
     * contratado sigue sin poder abrirlo.
     */
    const service = serviceOf(permission)
    if (service) await assertServiceEnabled(companyId, service)

    if (subscriptionGateOn()) await assertSubscriptionOperating(companyId)

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
