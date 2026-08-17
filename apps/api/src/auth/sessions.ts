/**
 * Ciclo de vida de la sesión.
 *
 * Ver `openspec/specs/user-accounts/spec.md`.
 *
 * Cada sesión son dos credenciales:
 *
 * - **acceso**, corta, que se presenta en cada petición;
 * - **renovación**, larga, que sólo sirve para obtener un par nuevo y **rota en cada uso**.
 *
 * La rotación es lo que permite detectar un robo. Si alguien copia la credencial de renovación y la
 * usa, el titular legítimo intentará usar la suya —ya consumida— y esa segunda presentación
 * **invalida la cadena entera**. Sin rotación, el ladrón conservaría acceso indefinido sin que nadie
 * lo notara.
 *
 * `chainId` agrupa el inicio de sesión con todas sus renovaciones sucesivas, que es lo que permite
 * cortar de golpe.
 */

import { newId } from "@tfv/contracts"
import { db, type Transaction } from "@tfv/db"
import { companyMembers, sessions, users } from "@tfv/db/schema"
import { and, eq, isNull, lte } from "drizzle-orm"
import { expiryFrom, hashToken, issueToken, LIFETIMES } from "./tokens.ts"

export interface SessionCredentials {
  readonly accessToken: string
  readonly refreshToken: string
  readonly accessExpiresAt: Date
  readonly refreshExpiresAt: Date
}

export interface SessionContext {
  readonly sessionId: string
  readonly userId: string
  readonly isPlatformAdmin: boolean
  /** Empresas con membresía **activa**. Vacío para un comprador sin membresías. */
  readonly companyIds: readonly string[]
}

export interface DeviceInfo {
  readonly userAgent?: string | undefined
  readonly ipAddress?: string | undefined
}

type Executor = typeof db | Transaction

// ─── Emisión ─────────────────────────────────────────────────────────────────

/** Abre una sesión nueva: cadena nueva, par de credenciales nuevo. */
export async function openSession(
  userId: string,
  device: DeviceInfo = {},
  executor: Executor = db,
): Promise<SessionCredentials> {
  return issuePair(userId, newId(), device, executor)
}

async function issuePair(
  userId: string,
  chainId: string,
  device: DeviceInfo,
  executor: Executor,
): Promise<SessionCredentials> {
  const access = issueToken()
  const refresh = issueToken()
  const accessExpiresAt = expiryFrom(LIFETIMES.access)
  const refreshExpiresAt = expiryFrom(LIFETIMES.refresh)

  await executor.insert(sessions).values({
    id: newId(),
    userId,
    chainId,
    accessTokenHash: access.hash,
    accessExpiresAt,
    refreshTokenHash: refresh.hash,
    expiresAt: refreshExpiresAt,
    userAgent: device.userAgent ?? null,
    ipAddress: device.ipAddress ?? null,
    lastUsedAt: new Date(),
  })

  return {
    accessToken: access.plaintext,
    refreshToken: refresh.plaintext,
    accessExpiresAt,
    refreshExpiresAt,
  }
}

// ─── Resolución ──────────────────────────────────────────────────────────────

/**
 * Resuelve el contexto del solicitante a partir de su credencial de acceso.
 *
 * Devuelve `null` cuando la credencial no existe, ha caducado, se revocó, o la cuenta dejó de estar
 * activa. Quien llama no necesita saber cuál de las cuatro: todas responden `401`.
 *
 * Carga también las membresías activas, porque el aislamiento por arrendatario las necesita en cada
 * petición y traerlas aquí evita una segunda consulta.
 */
export async function resolveSession(
  accessToken: string,
  executor: Executor = db,
): Promise<SessionContext | null> {
  const hash = hashToken(accessToken)
  const now = new Date()

  const [row] = await executor
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      accessExpiresAt: sessions.accessExpiresAt,
      revokedAt: sessions.revokedAt,
      isActive: users.isActive,
      isPlatformAdmin: users.isPlatformAdmin,
      deletedAt: users.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.accessTokenHash, hash))
    .limit(1)

  if (!row) return null
  if (row.revokedAt !== null) return null
  if (row.accessExpiresAt.getTime() <= now.getTime()) return null
  if (!row.isActive || row.deletedAt !== null) return null

  const memberships = await executor
    .select({ companyId: companyMembers.companyId })
    .from(companyMembers)
    .where(and(eq(companyMembers.userId, row.userId), eq(companyMembers.isActive, true)))

  await executor.update(sessions).set({ lastUsedAt: now }).where(eq(sessions.id, row.sessionId))

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    isPlatformAdmin: row.isPlatformAdmin,
    companyIds: memberships.map((membership) => membership.companyId),
  }
}

// ─── Rotación ────────────────────────────────────────────────────────────────

export type RefreshOutcome =
  | {
      readonly kind: "rotated"
      readonly userId: string
      readonly credentials: SessionCredentials
    }
  | { readonly kind: "invalid" }
  /** La credencial ya se había consumido: indicio de robo. La cadena queda cortada. */
  | { readonly kind: "reuse_detected" }

/**
 * Canjea una credencial de renovación por un par nuevo.
 *
 * Presentar una ya consumida **invalida toda la cadena**, incluida la sesión que en ese momento
 * estuviera funcionando: ante la duda de quién es el legítimo, se corta para los dos y se obliga a
 * volver a autenticarse.
 */
export async function rotateSession(
  refreshToken: string,
  device: DeviceInfo = {},
): Promise<RefreshOutcome> {
  const hash = hashToken(refreshToken)

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, hash))
      .limit(1)
      .for("update")

    if (!session) return { kind: "invalid" }

    if (session.consumedAt !== null) {
      await revokeChain(session.chainId, "reuse_detected", tx)
      return { kind: "reuse_detected" }
    }

    if (session.revokedAt !== null) return { kind: "invalid" }
    if (session.expiresAt.getTime() <= Date.now()) return { kind: "invalid" }

    const [user] = await tx
      .select({ isActive: users.isActive, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1)

    if (!user?.isActive || user.deletedAt !== null) return { kind: "invalid" }

    await tx.update(sessions).set({ consumedAt: new Date() }).where(eq(sessions.id, session.id))

    const credentials = await issuePair(session.userId, session.chainId, device, tx)
    return { kind: "rotated", userId: session.userId, credentials }
  })
}

// ─── Revocación ──────────────────────────────────────────────────────────────

export type RevocationReason =
  | "logout"
  | "logout_all"
  | "password_changed"
  | "account_deactivated"
  | "reuse_detected"
  | "expired"

/** Cierra la sesión que presenta esta credencial de acceso. */
export async function revokeByAccessToken(
  accessToken: string,
  reason: RevocationReason = "logout",
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(sessions)
    .set({ revokedAt: new Date(), revocationReason: reason })
    .where(and(eq(sessions.accessTokenHash, hashToken(accessToken)), isNull(sessions.revokedAt)))
}

/** Corta una cadena completa: el inicio de sesión y todas sus renovaciones. */
export async function revokeChain(
  chainId: string,
  reason: RevocationReason,
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(sessions)
    .set({ revokedAt: new Date(), revocationReason: reason })
    .where(and(eq(sessions.chainId, chainId), isNull(sessions.revokedAt)))
}

/**
 * Cierra todas las sesiones de un usuario.
 *
 * Lo usan el cierre de sesión global, el cambio de contraseña y la desactivación de la cuenta.
 */
export async function revokeAllForUser(
  userId: string,
  reason: RevocationReason,
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(sessions)
    .set({ revokedAt: new Date(), revocationReason: reason })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
}

/** Sesiones vigentes de un usuario, para que reconozca sus dispositivos. */
export async function listActiveSessions(userId: string, executor: Executor = db) {
  return executor
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      ipAddress: sessions.ipAddress,
      lastUsedAt: sessions.lastUsedAt,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(
      and(eq(sessions.userId, userId), isNull(sessions.revokedAt), isNull(sessions.consumedAt)),
    )
}

/**
 * Marca como caducadas las sesiones cuya credencial de renovación venció.
 *
 * Sin esta poda la tabla crece sin límite: cada renovación deja atrás una fila consumida.
 */
export async function pruneExpiredSessions(executor: Executor = db): Promise<void> {
  await executor
    .update(sessions)
    .set({ revokedAt: new Date(), revocationReason: "expired" })
    .where(and(isNull(sessions.revokedAt), lte(sessions.expiresAt, new Date())))
}
