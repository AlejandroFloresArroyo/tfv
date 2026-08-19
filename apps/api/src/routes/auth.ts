/**
 * Rutas de acceso.
 *
 * Ver `openspec/specs/user-accounts/spec.md`.
 *
 * Casi todas son públicas, y con motivo: son precisamente las que alguien sin sesión necesita para
 * conseguir una. La credencial que presentan **es** el token del enlace o la contraseña.
 *
 * Las credenciales viajan en cookies no accesibles por script. La pila anterior las guardaba en una
 * cookie legible por JavaScript, así que cualquier script inyectado podía leer la sesión
 * (`DEFECTS.md` S-11).
 */

import { z } from "@hono/zod-openapi"
import { newId, UnauthenticatedError } from "@tfv/contracts"
import { db } from "@tfv/db"
import { notificationDeliveries } from "@tfv/db/schema"
import type { Context } from "hono"
import { deleteCookie, setCookie } from "hono/cookie"
import {
  acceptInvitation,
  changePassword,
  login,
  register,
  requestEmailChange,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyEmail,
} from "../auth/accounts.ts"
import { announceDevLink } from "../auth/dev-links.ts"
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  readAccessToken,
  readRefreshToken,
  requireSession,
} from "../auth/middleware.ts"
import { loadProfile } from "../auth/profile.ts"
import {
  listActiveSessions,
  resolveSession,
  revokeAllForUser,
  revokeByAccessToken,
  rotateSession,
  type SessionCredentials,
} from "../auth/sessions.ts"
import { env, isProduction } from "../env.ts"
import { clientIp } from "../runtime/request.ts"
import { AUTHENTICATED, defineRoute, PUBLIC } from "../runtime/route.ts"

// ─── Cookies ─────────────────────────────────────────────────────────────────

/**
 * Ruta de la credencial de renovación, tal y como la ve el navegador.
 *
 * Lleva el prefijo del proxy porque la cookie se guarda por el camino que el navegador pidió, no
 * por el que atendió el servicio. Sin él, servir la API bajo `/api` haría que la cookie declarara
 * `/auth` y no se enviara nunca a `/api/auth/refresh`. Ver `COOKIE_PATH_PREFIX` en `env.ts`.
 */
const REFRESH_COOKIE_PATH = `${env.COOKIE_PATH_PREFIX}/auth`

/**
 * La credencial de acceso sí va en la raíz, y el prefijo **no** se le aplica.
 *
 * Tiene que llegar también a las peticiones que la aplicación web atiende por su cuenta: sus
 * guardas se resuelven en el servidor antes de pintar, y para eso necesita leer la cookie de una
 * petición que no va dirigida a la API.
 */
const ACCESS_COOKIE_PATH = "/"

function writeCredentials(c: Context, credentials: SessionCredentials): void {
  const base = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "Lax",
    path: ACCESS_COOKIE_PATH,
  } as const

  setCookie(c, ACCESS_COOKIE, credentials.accessToken, {
    ...base,
    expires: credentials.accessExpiresAt,
  })
  // La credencial de renovación sólo se envía a su propia ruta: no viaja en cada petición.
  setCookie(c, REFRESH_COOKIE, credentials.refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    expires: credentials.refreshExpiresAt,
  })
}

function clearCredentials(c: Context): void {
  deleteCookie(c, ACCESS_COOKIE, { path: ACCESS_COOKIE_PATH })
  deleteCookie(c, REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH })
}

/**
 * Encola el envío del enlace.
 *
 * El token **nunca** vuelve en el cuerpo de la respuesta: sólo llega al correo del titular. Es lo
 * que impide que quien pide una recuperación para un correo ajeno obtenga el enlace.
 *
 * La entrega la realiza la rebanada 09; aquí sólo se deja encolada.
 */
async function enqueueLink(userId: string, kind: string, token: string): Promise<void> {
  await db.insert(notificationDeliveries).values({
    id: newId(),
    recipientId: userId,
    channel: "email",
    kind,
    payload: { token },
  })

  // En desarrollo, además, al registro: sin despachador de correo el enlace se queda encolado y no
  // hay manera de completar un registro sin abrir la base.
  announceDevLink(kind, token)
}

// ─── Esquemas ────────────────────────────────────────────────────────────────

const acknowledged = z.object({ message: z.string() })
const verificationResponse = acknowledged.extend({
  changed: z.boolean(),
  /** La sesión presentada pertenece a la misma cuenta que confirmó el token. */
  sameSession: z.boolean(),
})
const sessionResponse = z.object({
  userId: z.string(),
  accessExpiresAt: z.string(),
})

const passwordField = z.string().min(1, "La contraseña es obligatoria")

// ─── Registro y acceso ───────────────────────────────────────────────────────

export const registerRoute = defineRoute({
  access: PUBLIC("Es la vía por la que alguien sin cuenta obtiene una"),
  config: {
    method: "post",
    path: "/auth/register",
    summary: "Crear una cuenta",
    tags: ["Acceso"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              email: z.string().email(),
              password: passwordField,
              name: z.string().min(1),
              lastname: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Cuenta creada. Falta verificar el correo antes de poder entrar.",
        content: { "application/json": { schema: acknowledged } },
      },
      409: { description: "Ya existe una cuenta con ese correo" },
    },
  },
  handler: async (c) => {
    const body = c.req.valid("json")
    const pending = await register(body)
    await enqueueLink(pending.userId, "email_verification", pending.token)

    return c.json({ message: "Cuenta creada. Revisa tu correo para verificar la dirección." }, 201)
  },
})

export const loginRoute = defineRoute({
  access: PUBLIC("Es la vía por la que alguien sin sesión obtiene una"),
  config: {
    method: "post",
    path: "/auth/login",
    summary: "Iniciar sesión",
    tags: ["Acceso"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ email: z.string().email(), password: passwordField }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Sesión abierta",
        content: { "application/json": { schema: sessionResponse } },
      },
      401: { description: "Credenciales incorrectas" },
      403: { description: "Falta verificar el correo" },
      429: { description: "Demasiados intentos" },
    },
  },
  handler: async (c) => {
    const { email, password } = c.req.valid("json")
    const device = {
      userAgent: c.req.header("user-agent"),
      ipAddress: clientIp(c),
    }

    const outcome = await login(email, password, device)

    switch (outcome.kind) {
      case "rate_limited":
        c.header("retry-after", String(outcome.retryAfterSeconds))
        return c.json({ message: "Demasiados intentos. Inténtalo más tarde." }, 429)

      case "rejected":
        // Mismo mensaje exista o no la cuenta: distinguirlos permitiría enumerar correos.
        return c.json({ message: "Correo o contraseña incorrectos" }, 401)

      case "unverified":
        return c.json(
          { message: "Falta verificar tu correo. Te reenviamos el enlace si lo necesitas." },
          403,
        )

      case "ok":
        writeCredentials(c, outcome.credentials)
        return c.json(
          {
            userId: outcome.userId,
            accessExpiresAt: outcome.credentials.accessExpiresAt.toISOString(),
          },
          200,
        )
    }
  },
})

export const refreshRoute = defineRoute({
  access: PUBLIC("La credencial de renovación es la que autentica esta llamada"),
  config: {
    method: "post",
    path: "/auth/refresh",
    summary: "Renovar la sesión",
    tags: ["Acceso"],
    responses: {
      200: {
        description: "Sesión renovada con credenciales nuevas",
        content: { "application/json": { schema: sessionResponse } },
      },
      401: { description: "La credencial no es válida, caducó o ya se había usado" },
    },
  },
  handler: async (c) => {
    const token = readRefreshToken(c)
    if (!token) return c.json({ message: "No hay sesión que renovar" }, 401)

    const outcome = await rotateSession(token, {
      userAgent: c.req.header("user-agent"),
      ipAddress: clientIp(c),
    })

    if (outcome.kind === "reuse_detected") {
      // Alguien más tiene esta credencial. Se corta para todos y se obliga a autenticarse.
      c.get("logger")?.warn("reutilización de credencial de renovación", { path: c.req.path })
      clearCredentials(c)
      return c.json({ message: "La sesión se cerró por seguridad. Vuelve a iniciar sesión." }, 401)
    }

    if (outcome.kind === "invalid") {
      clearCredentials(c)
      return c.json({ message: "No hay sesión que renovar" }, 401)
    }

    writeCredentials(c, outcome.credentials)
    return c.json(
      {
        userId: outcome.userId,
        accessExpiresAt: outcome.credentials.accessExpiresAt.toISOString(),
      },
      200,
    )
  },
})

export const logoutRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/auth/logout",
    summary: "Cerrar la sesión actual",
    tags: ["Acceso"],
    responses: {
      200: {
        description: "Sesión cerrada",
        content: { "application/json": { schema: acknowledged } },
      },
    },
  },
  handler: async (c) => {
    const token = readAccessToken(c)
    if (token) await revokeByAccessToken(token, "logout")
    clearCredentials(c)
    return c.json({ message: "Sesión cerrada" }, 200)
  },
})

export const logoutAllRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/auth/logout-all",
    summary: "Cerrar todas las sesiones",
    tags: ["Acceso"],
    responses: {
      200: {
        description: "Todas las sesiones cerradas",
        content: { "application/json": { schema: acknowledged } },
      },
    },
  },
  handler: async (c) => {
    const session = requireSession(c)
    await revokeAllForUser(session.userId, "logout_all")
    clearCredentials(c)
    return c.json({ message: "Se cerraron todas tus sesiones" }, 200)
  },
})

export const sessionsRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/auth/sessions",
    summary: "Listar las sesiones activas",
    tags: ["Acceso"],
    responses: {
      200: {
        description: "Sesiones vigentes del usuario",
        content: {
          "application/json": {
            schema: z.object({
              items: z.array(
                z.object({
                  id: z.string(),
                  userAgent: z.string().nullable(),
                  ipAddress: z.string().nullable(),
                  lastUsedAt: z.string().nullable(),
                  createdAt: z.string(),
                }),
              ),
            }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const session = requireSession(c)
    const items = await listActiveSessions(session.userId)

    return c.json(
      {
        items: items.map((item) => ({
          id: item.id,
          userAgent: item.userAgent,
          ipAddress: item.ipAddress,
          lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
        })),
      },
      200,
    )
  },
})

// ─── Perfil del solicitante ──────────────────────────────────────────────────

const profileResponse = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  lastname: z.string(),
  username: z.string(),
  isPlatformAdmin: z.boolean(),
  emailVerified: z.boolean(),
  companies: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      isOwner: z.boolean(),
      services: z.array(z.object({ keycode: z.string(), name: z.string() })),
      /**
       * Lo que esta persona puede hacer en esta empresa.
       *
       * **No es control de acceso.** Sirve para que la interfaz no ofrezca puertas que no abren;
       * quien escriba la dirección a mano se topa igualmente con el guardián del servidor.
       */
      permissions: z.array(z.string()),
    }),
  ),
})

export const meRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/auth/me",
    summary: "Perfil del solicitante, con sus empresas y servicios",
    tags: ["Acceso"],
    responses: {
      200: {
        description: "Quién entró y dónde puede entrar",
        content: { "application/json": { schema: profileResponse } },
      },
      401: { description: "No hay sesión" },
    },
  },
  handler: async (c) => {
    const session = requireSession(c)
    const profile = await loadProfile(session.userId)

    // La cuenta se dio de baja entre resolver la sesión y llegar aquí. Ventana estrecha, pero
    // responder con un perfil vacío haría pasar por «sin empresas» lo que es «sin cuenta».
    if (!profile) throw new UnauthenticatedError()

    return c.json(profile, 200)
  },
})

// ─── Verificación de correo ──────────────────────────────────────────────────

export const verifyEmailRoute = defineRoute({
  access: PUBLIC("El token del enlace es la credencial de esta llamada"),
  config: {
    method: "post",
    path: "/auth/verify-email",
    summary: "Confirmar la dirección de correo",
    tags: ["Acceso"],
    request: {
      body: {
        content: { "application/json": { schema: z.object({ token: z.string().min(1) }) } },
      },
    },
    responses: {
      200: {
        description: "Correo verificado",
        content: { "application/json": { schema: verificationResponse } },
      },
      400: { description: "El enlace no es válido, caducó o ya se usó" },
      409: { description: "La dirección quedó ocupada antes de confirmar el cambio" },
    },
  },
  handler: async (c) => {
    const { token } = c.req.valid("json")
    const outcome = await verifyEmail(token)

    if (outcome.kind === "invalid") {
      return c.json({ message: "El enlace ya no es válido. Solicita uno nuevo." }, 400)
    }

    const accessToken = readAccessToken(c)
    const session = accessToken ? await resolveSession(accessToken) : null

    return c.json(
      {
        message: outcome.pendingEmail
          ? "Correo actualizado. Ya puedes usar la nueva dirección."
          : "Correo verificado. Ya puedes iniciar sesión.",
        changed: outcome.pendingEmail !== null,
        sameSession: session?.userId === outcome.userId,
      },
      200,
    )
  },
})

export const changeEmailRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/auth/change-email",
    summary: "Solicitar el cambio de correo",
    tags: ["Acceso"],
    request: {
      body: {
        content: {
          "application/json": { schema: z.object({ newEmail: z.string().trim().email() }) },
        },
      },
    },
    responses: {
      200: {
        description: "Enlace de confirmación encolado para la dirección nueva",
        content: { "application/json": { schema: acknowledged } },
      },
      409: { description: "La dirección ya pertenece a otra cuenta" },
      422: { description: "La dirección coincide con el correo actual" },
    },
  },
  handler: async (c) => {
    const session = requireSession(c)
    const { newEmail } = c.req.valid("json")
    await requestEmailChange(session.userId, newEmail)

    return c.json(
      { message: "Enviamos un enlace a la dirección nueva. Tu correo actual no cambia todavía." },
      200,
    )
  },
})

export const resendVerificationRoute = defineRoute({
  access: PUBLIC("La solicita alguien que aún no puede iniciar sesión"),
  config: {
    method: "post",
    path: "/auth/resend-verification",
    summary: "Reenviar el enlace de verificación",
    tags: ["Acceso"],
    request: {
      body: {
        content: { "application/json": { schema: z.object({ email: z.string().email() }) } },
      },
    },
    responses: {
      200: {
        description: "Respuesta idéntica exista o no la cuenta",
        content: { "application/json": { schema: acknowledged } },
      },
    },
  },
  handler: async (c) => {
    const { email } = c.req.valid("json")
    const pending = await resendVerification(email)
    if (pending) await enqueueLink(pending.userId, "email_verification", pending.token)

    return c.json({ message: "Si la cuenta necesita verificación, te enviamos el enlace." }, 200)
  },
})

// ─── Recuperación ────────────────────────────────────────────────────────────

export const forgotPasswordRoute = defineRoute({
  access: PUBLIC("La solicita alguien que ha perdido el acceso a su cuenta"),
  config: {
    method: "post",
    path: "/auth/forgot-password",
    summary: "Solicitar el restablecimiento de la contraseña",
    tags: ["Acceso"],
    request: {
      body: {
        content: { "application/json": { schema: z.object({ email: z.string().email() }) } },
      },
    },
    responses: {
      200: {
        description: "Respuesta idéntica exista o no la cuenta",
        content: { "application/json": { schema: acknowledged } },
      },
    },
  },
  handler: async (c) => {
    const { email } = c.req.valid("json")
    const pending = await requestPasswordReset(email)
    if (pending) await enqueueLink(pending.userId, "password_reset", pending.token)

    // Misma respuesta en los dos casos, y sin token en el cuerpo.
    return c.json({ message: "Si existe una cuenta con ese correo, te enviamos el enlace." }, 200)
  },
})

export const resetPasswordRoute = defineRoute({
  access: PUBLIC("El token del enlace es la credencial de esta llamada"),
  config: {
    method: "post",
    path: "/auth/reset-password",
    summary: "Fijar una contraseña nueva",
    tags: ["Acceso"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ token: z.string().min(1), password: passwordField }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Contraseña cambiada; las sesiones anteriores quedaron cerradas",
        content: { "application/json": { schema: acknowledged } },
      },
      400: { description: "El enlace no es válido, o la contraseña no cumple los requisitos" },
    },
  },
  handler: async (c) => {
    const { token, password } = c.req.valid("json")
    const outcome = await resetPassword(token, password)

    if (outcome.kind === "invalid") {
      return c.json({ message: "El enlace ya no es válido. Solicita uno nuevo." }, 400)
    }

    clearCredentials(c)
    return c.json({ message: "Contraseña actualizada. Inicia sesión de nuevo." }, 200)
  },
})

export const acceptInvitationRoute = defineRoute({
  access: PUBLIC("El token de la invitación es la credencial de esta llamada"),
  config: {
    method: "post",
    path: "/auth/accept-invitation",
    summary: "Establecer la contraseña de una cuenta invitada",
    tags: ["Acceso"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ token: z.string().min(1), password: passwordField }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Contraseña establecida",
        content: { "application/json": { schema: acknowledged } },
      },
      400: { description: "La invitación no es válida, caducó o ya se usó" },
    },
  },
  handler: async (c) => {
    const { token, password } = c.req.valid("json")
    const outcome = await acceptInvitation(token, password)

    if (outcome.kind === "invalid") {
      return c.json({ message: "La invitación ya no es válida. Pide una nueva." }, 400)
    }

    return c.json({ message: "Contraseña establecida. Ya puedes iniciar sesión." }, 200)
  },
})

export const changePasswordRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/auth/change-password",
    summary: "Cambiar la contraseña con sesión iniciada",
    tags: ["Acceso"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              currentPassword: passwordField,
              newPassword: passwordField,
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Contraseña cambiada; las demás sesiones quedaron cerradas",
        content: { "application/json": { schema: acknowledged } },
      },
      422: { description: "La contraseña actual no es correcta" },
    },
  },
  handler: async (c) => {
    const session = requireSession(c)
    const { currentPassword, newPassword } = c.req.valid("json")

    await changePassword(session.userId, currentPassword, newPassword)
    clearCredentials(c)

    return c.json({ message: "Contraseña actualizada. Inicia sesión de nuevo." }, 200)
  },
})

// La dirección del solicitante ya no se lee aquí: la comparten este registro y el limitador de
// frecuencia del armazón, y dos copias acabarían con criterios distintos de a qué salto hacer caso.
// Ver `apps/api/src/runtime/request.ts`.
