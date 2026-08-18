/**
 * Alta, acceso y recuperación de cuentas.
 *
 * Ver `openspec/specs/user-accounts/spec.md`.
 *
 * Tres cambios de fondo respecto de la pila anterior:
 *
 * - **La verificación de correo es efectiva.** Antes el registro marcaba la cuenta como verificada
 *   en el acto, así que el mecanismo no existía (`DEFECTS.md` S-15).
 * - **El sistema nunca genera contraseñas.** Quien invita crea la cuenta; el titular establece la
 *   suya con un enlace de un solo uso. Antes viajaba en claro en la notificación (S-09).
 * - **La recuperación no revela si la cuenta existe.** Misma respuesta en los dos casos, y el
 *   enlace sólo viaja al correo — nunca en el cuerpo de la respuesta (S-16).
 */

import { ConflictError, newId, UnprocessableError, ValidationError } from "@tfv/contracts"
import { db, type Transaction } from "@tfv/db"
import { loginAttempts, notificationDeliveries, oneTimeCredentials, users } from "@tfv/db/schema"
import { and, count, desc, eq, gt, gte, isNull, sql } from "drizzle-orm"
import { announceDevLink } from "./dev-links.ts"
import { hashPassword, needsRehash, validatePassword, verifyPassword } from "./password.ts"
import {
  type DeviceInfo,
  openSession,
  revokeAllForUser,
  type SessionCredentials,
} from "./sessions.ts"
import { expiryFrom, hashToken, issueToken, LIFETIMES } from "./tokens.ts"

type Executor = typeof db | Transaction

/** Ventana y tope de intentos fallidos antes de frenar. */
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 8

// ─── Registro ────────────────────────────────────────────────────────────────

export interface RegisterInput {
  readonly email: string
  readonly password: string
  readonly name: string
  readonly lastname?: string | undefined
}

export interface PendingVerification {
  readonly userId: string
  /** Viaja **sólo** al correo del titular. Nunca al cuerpo de una respuesta. */
  readonly token: string
}

export interface PendingEmailChange extends PendingVerification {
  /** Destino de la verificación; el perfil conserva el correo anterior hasta consumir el enlace. */
  readonly pendingEmail: string
}

export async function register(input: RegisterInput): Promise<PendingVerification> {
  const email = normalizeEmail(input.email)
  const issues = validatePassword(input.password)
  if (issues.length > 0) {
    throw new ValidationError(issues.map((issue) => ({ key: "password", message: issue.message })))
  }

  return db.transaction(async (tx) => {
    if (await emailTaken(email, tx)) {
      throw new ConflictError("Ya existe una cuenta con este correo")
    }

    const userId = newId()
    await tx.insert(users).values({
      id: userId,
      email,
      username: await deriveUsername(input.name, input.lastname, tx),
      name: input.name,
      lastname: input.lastname ?? "",
      passwordHash: await hashPassword(input.password),
      // Sin verificar: el registro no da por buena la dirección.
      emailVerifiedAt: null,
    })

    const token = await issueCredential(
      userId,
      "email_verification",
      LIFETIMES.emailVerification,
      tx,
    )
    return { userId, token }
  })
}

// ─── Acceso ──────────────────────────────────────────────────────────────────

export type LoginOutcome =
  | { readonly kind: "ok"; readonly userId: string; readonly credentials: SessionCredentials }
  /** Credenciales incorrectas, cuenta inexistente o desactivada. No se distingue cuál. */
  | { readonly kind: "rejected" }
  /** Se distingue a propósito: el titular necesita saber que puede resolverlo. */
  | { readonly kind: "unverified"; readonly userId: string }
  | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number }

export async function login(
  email: string,
  password: string,
  device: DeviceInfo = {},
): Promise<LoginOutcome> {
  const normalized = normalizeEmail(email)
  const ip = device.ipAddress ?? null

  if (await isRateLimited(normalized, ip)) {
    return { kind: "rate_limited", retryAfterSeconds: Math.ceil(ATTEMPT_WINDOW_MS / 1000) }
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, normalized), isNull(users.deletedAt)))
    .limit(1)

  /**
   * Se deriva una contraseña aunque la cuenta no exista.
   *
   * Sin esto, un correo desconocido responde en microsegundos y uno registrado tarda lo que cuesta
   * la derivación: la diferencia basta para enumerar cuentas cronometrando la respuesta.
   */
  const storedHash = user?.passwordHash ?? DUMMY_HASH
  const matches = await verifyPassword(password, storedHash)

  if (!user || !matches) {
    await recordAttempt(normalized, ip, false)
    return { kind: "rejected" }
  }

  if (!user.isActive) {
    await recordAttempt(normalized, ip, false)
    return { kind: "rejected" }
  }

  if (user.emailVerifiedAt === null) {
    return { kind: "unverified", userId: user.id }
  }

  await recordAttempt(normalized, ip, true)

  // Único momento en que se tiene la contraseña en claro: si la derivación quedó obsoleta, se
  // renueva sin pedirle nada al titular.
  if (user.passwordHash && needsRehash(user.passwordHash)) {
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(users.id, user.id))
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))

  return { kind: "ok", userId: user.id, credentials: await openSession(user.id, device) }
}

/**
 * Derivación de referencia contra la que comparar cuando la cuenta no existe.
 *
 * Se calcula una vez al cargar el módulo, con los mismos parámetros que las reales, para que el
 * trabajo sea equivalente.
 */
const DUMMY_HASH = await hashPassword(randomFiller())

function randomFiller(): string {
  return newId() + newId()
}

// ─── Verificación de correo ──────────────────────────────────────────────────

export type ConsumeOutcome =
  | { readonly kind: "ok"; readonly userId: string; readonly pendingEmail: string | null }
  | { readonly kind: "invalid" }

/** Confirma la dirección. El enlace es de un solo uso. */
export async function verifyEmail(token: string): Promise<ConsumeOutcome> {
  try {
    return await db.transaction(async (tx) => {
      const credential = await consumeCredential(token, "email_verification", tx)
      if (!credential) return { kind: "invalid" }

      // La dirección podía estar libre al solicitar el cambio y ser ocupada antes del clic. Esta
      // comprobación vive en la misma transacción que el consumo: si falla, el enlace no se quema.
      if (credential.pendingEmail) {
        const [owner] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, credential.pendingEmail), isNull(users.deletedAt)))
          .limit(1)

        if (owner && owner.id !== credential.userId) {
          throw new ConflictError("Ese correo ya pertenece a otra cuenta")
        }
      }

      await tx
        .update(users)
        .set({
          emailVerifiedAt: new Date(),
          ...(credential.pendingEmail ? { email: credential.pendingEmail } : {}),
        })
        .where(eq(users.id, credential.userId))

      return { kind: "ok", userId: credential.userId, pendingEmail: credential.pendingEmail }
    })
  } catch (failure) {
    // La consulta previa mejora el mensaje normal; la restricción resuelve la carrera entre dos
    // confirmaciones concurrentes. Ambas situaciones se presentan como el mismo conflicto.
    const cause = (failure as { cause?: { code?: string; constraint_name?: string } }).cause
    if (cause?.code === "23505" && cause.constraint_name === "users_email_unique") {
      throw new ConflictError("Ese correo ya pertenece a otra cuenta")
    }
    throw failure
  }
}

/** Solicita un cambio sin sustituir la dirección actual hasta que la nueva quede verificada. */
export async function requestEmailChange(
  userId: string,
  email: string,
): Promise<PendingEmailChange> {
  const pendingEmail = normalizeEmail(email)

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1)

    if (!user) throw new UnprocessableError("La cuenta ya no está disponible")
    if (user.email === pendingEmail) {
      throw new UnprocessableError("Ese ya es tu correo actual")
    }
    if (await emailTaken(pendingEmail, tx)) {
      throw new ConflictError("Ya existe una cuenta con este correo")
    }

    const token = await issueCredential(
      userId,
      "email_verification",
      LIFETIMES.emailVerification,
      tx,
      pendingEmail,
    )

    // La credencial y su única vía de entrega forman una sola mutación. Si el outbox falla, la
    // transacción conserva el enlace anterior y no deja un token nuevo imposible de recuperar.
    await tx.insert(notificationDeliveries).values({
      id: newId(),
      recipientId: userId,
      channel: "email",
      kind: "email_change_verification",
      // El perfil aún contiene el correo anterior: el despachador necesita el destino explícito.
      payload: { token, email: pendingEmail },
    })

    announceDevLink("email_change_verification", token, pendingEmail)
    return { userId, token, pendingEmail }
  })
}

/** Emite un enlace de verificación nuevo, si la cuenta existe y no está verificada. */
export async function resendVerification(email: string): Promise<PendingVerification | null> {
  const normalized = normalizeEmail(email)

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, verifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(and(eq(users.email, normalized), isNull(users.deletedAt)))
      .limit(1)

    if (!user || user.verifiedAt !== null) return null

    const token = await issueCredential(
      user.id,
      "email_verification",
      LIFETIMES.emailVerification,
      tx,
    )
    return { userId: user.id, token }
  })
}

// ─── Recuperación de contraseña ──────────────────────────────────────────────

/**
 * Solicita el restablecimiento.
 *
 * Devuelve `null` cuando la cuenta no existe. **Quien llama debe responder lo mismo en ambos
 * casos**: la única diferencia observable desde fuera es que en uno llega un correo.
 */
export async function requestPasswordReset(email: string): Promise<PendingVerification | null> {
  const normalized = normalizeEmail(email)

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, normalized), isNull(users.deletedAt)))
      .limit(1)

    if (!user) return null

    const token = await issueCredential(user.id, "password_reset", LIFETIMES.passwordReset, tx)
    return { userId: user.id, token }
  })
}

/** Fija la contraseña nueva y cierra las sesiones anteriores. */
export async function resetPassword(token: string, password: string): Promise<ConsumeOutcome> {
  const issues = validatePassword(password)
  if (issues.length > 0) {
    throw new ValidationError(issues.map((issue) => ({ key: "password", message: issue.message })))
  }

  const hash = await hashPassword(password)

  return db.transaction(async (tx) => {
    const credential = await consumeCredential(token, "password_reset", tx)
    if (!credential) return { kind: "invalid" }

    await tx.update(users).set({ passwordHash: hash }).where(eq(users.id, credential.userId))

    // Quien tuviera la contraseña anterior pierde el acceso.
    await revokeAllForUser(credential.userId, "password_changed", tx)

    return { kind: "ok", userId: credential.userId, pendingEmail: null }
  })
}

/** Cambio con sesión iniciada. Exige la actual y cierra las demás sesiones. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const issues = validatePassword(newPassword)
  if (issues.length > 0) {
    throw new ValidationError(
      issues.map((issue) => ({ key: "newPassword", message: issue.message })),
    )
  }

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user?.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new UnprocessableError("La contraseña actual no es correcta")
  }

  const hash = await hashPassword(newPassword)

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: hash }).where(eq(users.id, userId))
    await revokeAllForUser(userId, "password_changed", tx)
  })
}

// ─── Invitación ──────────────────────────────────────────────────────────────

export interface InviteInput {
  readonly email: string
  readonly name: string
  readonly lastname?: string | undefined
}

export type InviteOutcome =
  | { readonly kind: "created"; readonly userId: string; readonly token: string }
  /** Ya tenía cuenta: no se duplica, se reutiliza. */
  | { readonly kind: "existing"; readonly userId: string }

/**
 * Crea la cuenta de una persona invitada, **sin contraseña**.
 *
 * La cuenta nace verificada —la invitación llega a un correo que quien invita afirma conocer— y el
 * titular establece su contraseña con el enlace.
 */
export async function invite(input: InviteInput, executor: Executor = db): Promise<InviteOutcome> {
  const email = normalizeEmail(input.email)

  const [existing] = await executor
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1)

  if (existing) return { kind: "existing", userId: existing.id }

  const userId = newId()
  await executor.insert(users).values({
    id: userId,
    email,
    username: await deriveUsername(input.name, input.lastname, executor),
    name: input.name,
    lastname: input.lastname ?? "",
    passwordHash: null,
    emailVerifiedAt: new Date(),
  })

  const token = await issueCredential(userId, "invitation", LIFETIMES.invitation, executor)
  return { kind: "created", userId, token }
}

/** El invitado establece su contraseña y queda listo para entrar. */
export async function acceptInvitation(token: string, password: string): Promise<ConsumeOutcome> {
  const issues = validatePassword(password)
  if (issues.length > 0) {
    throw new ValidationError(issues.map((issue) => ({ key: "password", message: issue.message })))
  }

  const hash = await hashPassword(password)

  return db.transaction(async (tx) => {
    const credential = await consumeCredential(token, "invitation", tx)
    if (!credential) return { kind: "invalid" }

    await tx
      .update(users)
      .set({ passwordHash: hash, emailVerifiedAt: new Date() })
      .where(eq(users.id, credential.userId))

    return { kind: "ok", userId: credential.userId, pendingEmail: null }
  })
}

// ─── Piezas internas ─────────────────────────────────────────────────────────

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function emailTaken(email: string, executor: Executor): Promise<boolean> {
  const [row] = await executor
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1)
  return row !== undefined
}

/**
 * Deriva un nombre de usuario del nombre y el apellido, con sufijo si ya está ocupado.
 *
 * Se reintenta con sufijos crecientes en lugar de con azar: es determinista y produce nombres
 * legibles —`ana_lopez_2`— en vez de una cadena sin sentido.
 */
async function deriveUsername(
  name: string,
  lastname: string | undefined,
  executor: Executor,
): Promise<string> {
  const base =
    [name, lastname]
      .filter(Boolean)
      .join("_")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48) || "usuario"

  for (let suffix = 0; suffix < 100; suffix++) {
    const candidate = suffix === 0 ? base : `${base}_${suffix + 1}`
    const [taken] = await executor
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, candidate), isNull(users.deletedAt)))
      .limit(1)

    if (!taken) return candidate
  }

  return `${base}_${newId().slice(0, 8)}`
}

type CredentialPurpose = "email_verification" | "password_reset" | "invitation"

async function issueCredential(
  userId: string,
  purpose: CredentialPurpose,
  lifetimeMs: number,
  executor: Executor,
  pendingEmail?: string,
): Promise<string> {
  // Dos solicitudes simultáneas del mismo propósito se serializan por usuario. En las rutas que
  // emiten enlaces, `executor` es una transacción; la segunda espera, invalida la primera y deja
  // exactamente una credencial viva.
  await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:${purpose}`}))`)

  // Un enlace nuevo invalida los anteriores del mismo propósito: si alguien pide tres
  // recuperaciones, sólo la última sirve.
  await executor
    .update(oneTimeCredentials)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(oneTimeCredentials.userId, userId),
        eq(oneTimeCredentials.purpose, purpose),
        isNull(oneTimeCredentials.consumedAt),
      ),
    )

  const token = issueToken()
  await executor.insert(oneTimeCredentials).values({
    id: newId(),
    userId,
    purpose,
    tokenHash: token.hash,
    expiresAt: expiryFrom(lifetimeMs),
    pendingEmail: pendingEmail ?? null,
  })

  return token.plaintext
}

interface ConsumedCredential {
  readonly userId: string
  readonly pendingEmail: string | null
}

async function consumeCredential(
  token: string,
  purpose: CredentialPurpose,
  executor: Executor,
): Promise<ConsumedCredential | null> {
  const [credential] = await executor
    .update(oneTimeCredentials)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(oneTimeCredentials.tokenHash, hashToken(token)),
        eq(oneTimeCredentials.purpose, purpose),
        isNull(oneTimeCredentials.consumedAt),
        gt(oneTimeCredentials.expiresAt, new Date()),
      ),
    )
    .returning({
      userId: oneTimeCredentials.userId,
      pendingEmail: oneTimeCredentials.pendingEmail,
    })

  if (!credential) return null

  return { userId: credential.userId, pendingEmail: credential.pendingEmail }
}

/**
 * ¿Hay que frenar este intento?
 *
 * Se cuenta por cuenta **y** por origen: quien prueba mil contraseñas contra un correo se frena por
 * el primero, y quien prueba una contraseña contra mil correos, por el segundo.
 *
 * ## Por qué el origen desconocido no cuenta
 *
 * Cuando no se conoce la dirección, el conteo mira **sólo la cuenta**. Es la corrección de un
 * defecto real: antes se guardaba la cadena `"unknown"` en la columna, así que todas las peticiones
 * sin dirección compartían la misma casilla. Ocho fallos con correos inventados llenaban esa
 * casilla y, a partir de ahí, la condición `ipAddress = 'unknown'` la cumplía cualquiera:
 * **el sistema entero dejaba de admitir inicios de sesión durante quince minutos.**
 *
 * Comprobado contra el servicio antes de tocarlo: ocho `401` con correos que no existen, y el
 * noveno intento —con credenciales correctas de otra cuenta— respondía `429`.
 *
 * Un valor desconocido no identifica a nadie, así que no puede agrupar a nadie. Frenar de menos es
 * el error correcto aquí: frenar de más es negar el servicio a todo el mundo.
 */
async function isRateLimited(email: string, ip: string | null): Promise<boolean> {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS)

  const [row] = await db
    .select({ failures: count() })
    .from(loginAttempts)
    .where(
      and(
        gte(loginAttempts.attemptedAt, since),
        isNull(loginAttempts.succeeded),
        ip === null
          ? eq(loginAttempts.email, email)
          : sql`(${loginAttempts.email} = ${email} OR ${loginAttempts.ipAddress} = ${ip})`,
      ),
    )

  return (row?.failures ?? 0) >= MAX_ATTEMPTS
}

async function recordAttempt(email: string, ip: string | null, succeeded: boolean): Promise<void> {
  await db.insert(loginAttempts).values({
    id: newId(),
    email,
    // Nulo, no `"unknown"`: una cadena centinela se compara igual que una dirección real y acaba
    // agrupando a quien no tiene nada en común.
    ipAddress: ip,
    succeeded: succeeded ? new Date() : null,
  })

  // Un acceso correcto reinicia el contador: los fallos previos dejan de pesar.
  if (succeeded) {
    await db
      .delete(loginAttempts)
      .where(and(eq(loginAttempts.email, email), isNull(loginAttempts.succeeded)))
  }
}

/** Últimos intentos de una cuenta, para que su titular pueda revisarlos. */
export async function recentAttempts(email: string, limit = 20) {
  return db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.email, normalizeEmail(email)))
    .orderBy(desc(loginAttempts.attemptedAt))
    .limit(limit)
}
