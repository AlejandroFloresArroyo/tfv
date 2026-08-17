/**
 * Credenciales opacas.
 *
 * Ver `openspec/specs/user-accounts/spec.md`.
 *
 * Las credenciales de sesión y los enlaces de un solo uso son **cadenas aleatorias sin
 * estructura**, no tokens autocontenidos. La diferencia importa: un token firmado que lleva dentro
 * su propia validez no se puede revocar, y el contrato exige poder cerrar una sesión, cerrarlas
 * todas, e invalidar una cadena entera al detectar reutilización.
 *
 * De la credencial se almacena **sólo su huella**. Una filtración de la base no entrega sesiones
 * abiertas ni enlaces de recuperación utilizables.
 *
 * La pila anterior generaba los tokens de recuperación con una función de dispersión **no
 * criptográfica** y sin caducidad (`DEFECTS.md` S-08).
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/** Suficiente entropía para que adivinar sea inviable, y corta para caber en una URL. */
const TOKEN_BYTES = 32

export interface IssuedToken {
  /** Lo que viaja al titular. No se almacena nunca. */
  readonly plaintext: string
  /** Lo que se guarda. No permite reconstruir el original. */
  readonly hash: string
}

export function issueToken(): IssuedToken {
  const plaintext = randomBytes(TOKEN_BYTES).toString("base64url")
  return { plaintext, hash: hashToken(plaintext) }
}

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("base64url")
}

/**
 * Compara dos huellas en tiempo constante.
 *
 * Para buscar en la base se usa la huella directamente —el índice único la encuentra sin filtrar
 * tiempo—; esta función es para las comparaciones que ocurren en memoria.
 */
export function tokensMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
}

// ─── Vigencias ───────────────────────────────────────────────────────────────

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Cuánto dura cada cosa.
 *
 * La sesión de acceso es corta porque no se puede revocar entre renovaciones; la de renovación es
 * larga porque sí, y rota en cada uso.
 */
export const LIFETIMES = {
  /** Credencial de acceso. */
  access: 15 * MINUTE,
  /** Credencial de renovación. Rota en cada uso. */
  refresh: 30 * DAY,
  /** Enlace de verificación de correo. */
  emailVerification: 3 * DAY,
  /** Enlace de recuperación de contraseña. Corto: se pide y se usa en el momento. */
  passwordReset: 1 * HOUR,
  /** Enlace de invitación. Largo: el destinatario puede tardar en verlo. */
  invitation: 14 * DAY,
} as const

export function expiryFrom(lifetimeMs: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + lifetimeMs)
}

export function hasExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime()
}
