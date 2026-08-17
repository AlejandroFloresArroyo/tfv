/**
 * Sesiones y credenciales de un solo uso.
 *
 * Ver `openspec/specs/user-accounts/spec.md`.
 *
 * Las sesiones se persisten en lugar de vivir sólo dentro de un token firmado, porque el contrato
 * exige **revocar**: cerrar una sesión, cerrarlas todas, e invalidar la cadena entera cuando se
 * detecta la reutilización de una credencial de renovación. Nada de eso se puede hacer con un token
 * autocontenido.
 *
 * La implementación anterior firmaba credenciales sin caducidad ni forma de revocar
 * (`DEFECTS.md` S-03).
 *
 * Vía hasta la empresa: ninguna. Son del usuario, no de un arrendatario.
 */

import { relations, sql } from "drizzle-orm"
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { primaryId, reference, timestamps } from "./_shared.ts"
import { users } from "./identity.ts"

export const sessionRevocation = pgEnum("session_revocation", [
  "logout",
  "logout_all",
  "password_changed",
  "account_deactivated",
  "reuse_detected",
  "expired",
])

/**
 * Una sesión activa.
 *
 * `chainId` agrupa todas las renovaciones sucesivas de un mismo inicio de sesión. Reutilizar una
 * credencial ya consumida invalida **la cadena completa**, no sólo esa credencial: es el indicio
 * de que alguien más la tiene.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: primaryId(),
    userId: reference("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Agrupa el inicio de sesión con todas sus renovaciones. */
    chainId: reference("chain_id").notNull(),

    /**
     * Credencial de acceso: la que se presenta en cada petición.
     *
     * Se busca en la base en cada llamada. Es un coste real, y es lo que compra la revocación
     * inmediata que exige la spec —«su siguiente petición se rechaza»—, imposible con un token
     * autocontenido. Además no es trabajo extra: esa misma consulta carga el contexto del
     * solicitante que el aislamiento por arrendatario necesita.
     */
    accessTokenHash: varchar("access_token_hash", { length: 128 }).notNull(),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true, mode: "date" }).notNull(),

    /** Credencial de renovación. Sólo la huella: la credencial en claro nunca se almacena. */
    refreshTokenHash: varchar("refresh_token_hash", { length: 128 }).notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    /** Se marca al renovarla; presentarla de nuevo invalida la cadena. */
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    revocationReason: sessionRevocation("revocation_reason"),

    /** Para que el titular reconozca sus sesiones al listarlas. */
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 45 }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("sessions_access_hash_unique").on(table.accessTokenHash),
    uniqueIndex("sessions_refresh_hash_unique").on(table.refreshTokenHash),
    index("sessions_user_idx").on(table.userId, table.revokedAt),
    index("sessions_chain_idx").on(table.chainId),
    // El barrido de sesiones caducadas busca por aquí.
    index("sessions_expiry_idx").on(table.expiresAt).where(sql`revoked_at IS NULL`),
  ],
)

export const credentialPurpose = pgEnum("credential_purpose", [
  "email_verification",
  "password_reset",
  "invitation",
])

/**
 * Credencial de un solo uso con caducidad.
 *
 * Cubre los tres flujos que entregan acceso por correo: verificar la dirección, restablecer la
 * contraseña y aceptar una invitación.
 *
 * La invitación existe aquí porque **el sistema ya no genera contraseñas**: quien invita crea la
 * cuenta y el titular establece la suya con un enlace. La pila anterior mandaba la contraseña
 * temporal en claro dentro de la notificación (`DEFECTS.md` S-09).
 */
export const oneTimeCredentials = pgTable(
  "one_time_credentials",
  {
    id: primaryId(),
    userId: reference("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    purpose: credentialPurpose("purpose").notNull(),
    /** Huella criptográfica. El valor en claro sólo viaja al correo del titular. */
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    /** Un solo uso: al consumirse deja de servir. */
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),

    /** Para el cambio de correo: la dirección nueva, aún sin confirmar. */
    pendingEmail: varchar("pending_email", { length: 320 }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("one_time_credentials_hash_unique").on(table.tokenHash),
    index("one_time_credentials_user_idx").on(table.userId, table.purpose),
  ],
)

/**
 * Intentos de acceso, para limitar la fuerza bruta.
 *
 * Se registran por cuenta y por origen, y un acceso correcto reinicia el contador.
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: primaryId(),
    /** Sin referencia al usuario: también se registran los intentos contra correos inexistentes. */
    email: varchar("email", { length: 320 }).notNull(),
    /**
     * Dirección de origen, **nula cuando no se conoce**.
     *
     * Era obligatoria, y esa obligación es la que causó el defecto: al no admitir ausencia, el
     * código guardaba la cadena `"unknown"`, que se compara igual que una dirección real. El
     * limitador agrupaba por ella y ocho fallos sin origen bloqueaban el acceso de todo el mundo.
     *
     * Una columna que no admite «no se sabe» obliga a inventar un valor que signifique eso, y ese
     * valor acaba comportándose como un dato. Ver `apps/api/src/auth/accounts.ts`.
     */
    ipAddress: varchar("ip_address", { length: 45 }),
    succeeded: timestamp("succeeded_at", { withTimezone: true, mode: "date" }),
    attemptedAt: timestamp("attempted_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("login_attempts_email_idx").on(table.email, table.attemptedAt),
    index("login_attempts_ip_idx").on(table.ipAddress, table.attemptedAt),
  ],
)

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

export const oneTimeCredentialsRelations = relations(oneTimeCredentials, ({ one }) => ({
  user: one(users, { fields: [oneTimeCredentials.userId], references: [users.id] }),
}))
