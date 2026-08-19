/**
 * Identidad y arrendatarios.
 *
 * Ver `openspec/specs/user-accounts`, `companies` y `access-control`.
 *
 * Es la raíz de todo: el acceso a cualquier dato del sistema se decide por la membresía de un
 * usuario en una empresa. Dos decisiones marcan este esquema:
 *
 * - **Padrón único** (`project.md` D-01): quien compra en una tienda pública y quien trabaja en el
 *   panel son la misma fila. El correo es único a nivel global.
 * - **Los propietarios eluden los permisos**, pero no la pertenencia. Por eso `isOwner` vive en la
 *   membresía y no en el rol.
 */

import { relations, sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { legacyId, percent, primaryId, reference, softDelete, timestamps } from "./_shared.ts"
import { uploads } from "./media.ts"

/** Predicado de los índices únicos parciales: sólo las filas vigentes compiten por el valor. */
const notDeleted = sql`deleted_at IS NULL`

// ─── Usuarios ────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: primaryId(),

    email: varchar("email", { length: 320 }).notNull(),
    /** Derivado del nombre, único, con sufijo cuando el derivado ya está ocupado. */
    username: varchar("username", { length: 64 }).notNull(),

    name: varchar("name", { length: 120 }).notNull().default(""),
    lastname: varchar("lastname", { length: 120 }).notNull().default(""),
    dialCode: varchar("dial_code", { length: 8 }).notNull().default("+52"),
    phone: varchar("phone", { length: 32 }).notNull().default(""),

    /** Derivada con función de derivación de clave y factor de trabajo ajustable. */
    passwordHash: text("password_hash"),

    avatarUploadId: reference("avatar_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),

    /**
     * Verificación de correo **efectiva**: sin verificar no se inicia sesión.
     * La implementación anterior la marcaba en el propio registro (`DEFECTS.md` S-15).
     */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
    /** Una cuenta desactivada conserva sus datos y sus membresías, y no puede entrar. */
    isActive: boolean("is_active").notNull().default(true),
    /** Administrador de plataforma: opera como propietario en cualquier empresa. */
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),

    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true, mode: "date" }),

    /**
     * Cuándo abrió la bandeja por última vez.
     *
     * De aquí sale el aviso de novedades —«han llegado tres desde que la cerraste»—, que no es lo
     * mismo que el contador de no leídas: una notificación leída hace un mes sigue sin ser una
     * novedad, y una sin leer de ayer tampoco lo es si ya la vio pasar. Ver
     * `activity-and-notifications`, requisito «Contador de no leídas y aviso de novedades».
     */
    inboxOpenedAt: timestamp("inbox_opened_at", { withTimezone: true, mode: "date" }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    // Parciales: dar de baja una cuenta libera su correo y su nombre de usuario.
    uniqueIndex("users_email_unique").on(table.email).where(notDeleted),
    uniqueIndex("users_username_unique").on(table.username).where(notDeleted),
    index("users_active_idx").on(table.isActive),
  ],
)

// ─── Empresas ────────────────────────────────────────────────────────────────

export const companies = pgTable(
  "companies",
  {
    id: primaryId(),
    legacyId: legacyId(),

    name: varchar("name", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    email: varchar("email", { length: 320 }),

    logoUploadId: reference("logo_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),

    /**
     * Comisión que la plataforma retiene sobre las ventas de esta empresa.
     * Sólo un administrador de plataforma puede modificarla.
     */
    commissionRate: percent("commission_rate").notNull().default("12.5"),
    /** Orden de presentación en los listados. */
    priority: percent("priority").notNull().default("0"),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex("companies_legacy_id_unique").on(table.legacyId).where(notDeleted),
    index("companies_priority_idx").on(table.priority, table.createdAt),
  ],
)

// ─── Roles ───────────────────────────────────────────────────────────────────

/**
 * Un rol pertenece siempre a **una** empresa. No hay roles globales ni compartidos.
 *
 * `permissions` es el conjunto de claves concedidas, validado contra el catálogo del servidor al
 * escribir: guardar una clave que no figure en él responde `400`.
 *
 * Vía hasta la empresa: columna directa.
 */
export const roles = pgTable(
  "roles",
  {
    id: primaryId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 120 }).notNull(),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),

    ...timestamps,
  },
  (table) => [index("roles_company_idx").on(table.companyId, table.name)],
)

// ─── Membresías ──────────────────────────────────────────────────────────────

/**
 * La fila que concede acceso al panel de una empresa.
 *
 * Es también la unidad de licencia: cada membresía activa consume un asiento de la suscripción.
 *
 * Vía hasta la empresa: columna directa.
 */
export const companyMembers = pgTable(
  "company_members",
  {
    id: primaryId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: reference("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: reference("role_id").references(() => roles.id, { onDelete: "set null" }),

    /** Elude la comprobación de permisos, no la pertenencia ni la habilitación del servicio. */
    isOwner: boolean("is_owner").notNull().default(false),
    /** Una membresía desactivada conserva el registro y pierde el acceso. */
    isActive: boolean("is_active").notNull().default(true),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("company_members_unique").on(table.companyId, table.userId),
    index("company_members_user_idx").on(table.userId, table.isActive),
    index("company_members_company_idx").on(table.companyId, table.isOwner, table.isActive),
  ],
)

// ─── Prospectos ──────────────────────────────────────────────────────────────

/**
 * Quien deja sus datos en el formulario público **sin crear cuenta**.
 *
 * Ver `openspec/specs/user-accounts/spec.md`, «Captura pública de prospectos». No es un usuario: no
 * tiene contraseña, ni sesión, ni pertenece a nada. Es una intención de contacto, y por eso vive en
 * su propia tabla en lugar de como una cuenta a medias — una cuenta a medias es una cuenta que
 * alguien acaba pudiendo usar.
 *
 * **Aceptar no lo borra**: se marca con quién lo aceptó y qué cuenta salió de él. La implementación
 * anterior no llegaba a retirarlo de la bandeja (`DEFECTS.md` L-02); aquí la bandeja de pendientes
 * son los que no tienen `accepted_at`, así que sale por construcción y el rastro se conserva.
 * Descartarlo sí es una baja lógica.
 */
export const prospects = pgTable(
  "prospects",
  {
    id: primaryId(),

    name: varchar("name", { length: 120 }).notNull(),
    lastname: varchar("lastname", { length: 120 }).notNull().default(""),
    email: varchar("email", { length: 320 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    companyName: varchar("company_name", { length: 250 }).notNull().default(""),
    message: text("message").notNull().default(""),

    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    acceptedById: reference("accepted_by_id").references(() => users.id, { onDelete: "set null" }),
    /** La cuenta que salió de este contacto. */
    userId: reference("user_id").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    // La bandeja: lo pendiente, lo más reciente primero.
    index("prospects_pending_idx")
      .on(table.createdAt)
      .where(sql`accepted_at IS NULL AND deleted_at IS NULL`),
    index("prospects_email_idx").on(table.email),
  ],
)

// ─── Relaciones ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many, one }) => ({
  memberships: many(companyMembers),
  avatar: one(uploads, { fields: [users.avatarUploadId], references: [uploads.id] }),
}))

export const companiesRelations = relations(companies, ({ many, one }) => ({
  members: many(companyMembers),
  roles: many(roles),
  logo: one(uploads, { fields: [companies.logoUploadId], references: [uploads.id] }),
}))

export const rolesRelations = relations(roles, ({ one, many }) => ({
  company: one(companies, { fields: [roles.companyId], references: [companies.id] }),
  members: many(companyMembers),
}))

export const companyMembersRelations = relations(companyMembers, ({ one }) => ({
  company: one(companies, { fields: [companyMembers.companyId], references: [companies.id] }),
  user: one(users, { fields: [companyMembers.userId], references: [users.id] }),
  role: one(roles, { fields: [companyMembers.roleId], references: [roles.id] }),
}))
