/**
 * Rutas de la administración de plataforma.
 *
 * Ver `openspec/specs/access-control/spec.md` y `openspec/specs/app-shell/spec.md`.
 *
 * Todas cuelgan de `/platform`, **ninguna lleva `:companyId`**, y las dos cosas van juntas: lo que
 * se atiende aquí no pertenece a ninguna empresa, así que no hay permiso de empresa contra el que
 * resolverlas. Lo que decide es la marca de administración de plataforma, comprobada en el manejador
 * antes de cualquier efecto. Es el mismo trato que ya tienen la taxonomía global y la bandeja de
 * prospectos, y el mismo apunte pendiente: si el negocio quiere delegar esto a un rol, hace falta
 * una clave nueva y el catálogo deja de coincidir con las 255 migradas.
 *
 * **Todas son de lectura.** Escribir datos de una empresa desde plataforma es otra decisión —hoy
 * ni siquiera hay clave de permiso que la respalde—, y mientras no se tome, el padrón mira y no
 * toca.
 */

import { z } from "@hono/zod-openapi"
import { toInstant, toNullableInstant } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import {
  assertPlatformAdmin,
  listPlatformActivity,
  listPlatformCompanies,
  listPlatformCompanyMembers,
  listPlatformUsers,
  type PlatformActivityRecord,
  type PlatformCompanyRecord,
  type PlatformUserRecord,
  platformActivityQuery,
  platformCompanyQuery,
  platformUserQuery,
} from "../platform/platform.ts"
import { AUTHENTICATED, defineRoute } from "../runtime/route.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

/**
 * La puerta, en una sola línea por ruta.
 *
 * Devuelve el solicitante ya comprobado para que ningún manejador pueda quedarse con la mitad del
 * gesto —comprobar y no usar la sesión, o usarla sin comprobar—.
 */
function platformRequester(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]) {
  const session = requireSession(c)
  assertPlatformAdmin(session.isPlatformAdmin)
  return { userId: session.userId, sessionId: session.sessionId }
}

// ─── Empresas ────────────────────────────────────────────────────────────────

const platformCompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  email: z.string().nullable(),
  commissionRate: z.string(),
  memberCount: z.number().int(),
  createdAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
})

function serializeCompany(company: PlatformCompanyRecord) {
  return {
    ...company,
    createdAt: toInstant(company.createdAt),
    deletedAt: toNullableInstant(company.deletedAt),
  }
}

export const platformCompaniesRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/platform/companies",
    summary: "Padrón de empresas, de sólo lectura",
    tags: ["Plataforma"],
    request: { query: collectionQuery(platformCompanyQuery) },
    responses: {
      200: {
        description: "Todas las empresas, incluidas las dadas de baja",
        content: { "application/json": { schema: pageSchema(platformCompanySchema) } },
      },
      403: { description: "No es administración de plataforma" },
    },
  },
  handler: async (c) => {
    const actor = platformRequester(c)
    const page = await listPlatformCompanies(actor, queryOf(c, platformCompanyQuery))
    return c.json(serializePage(page, serializeCompany), 200)
  },
})

export const platformCompanyMembersRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/platform/companies/{companyId}/members",
    summary: "Quién lleva una empresa, sin entrar en ella",
    tags: ["Plataforma"],
    request: { params: z.object({ companyId: z.string() }) },
    responses: {
      200: {
        description: "Sus membresías, activas y desactivadas",
        content: {
          "application/json": {
            schema: z.object({
              items: z.array(
                z.object({
                  id: z.string(),
                  userId: z.string(),
                  email: z.string(),
                  name: z.string(),
                  lastname: z.string(),
                  isOwner: z.boolean(),
                  isActive: z.boolean(),
                }),
              ),
            }),
          },
        },
      },
      403: { description: "No es administración de plataforma" },
    },
  },
  handler: async (c) => {
    const actor = platformRequester(c)
    const items = await listPlatformCompanyMembers(actor, c.req.valid("param").companyId)
    return c.json({ items }, 200)
  },
})

// ─── Cuentas ─────────────────────────────────────────────────────────────────

const platformUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
  name: z.string(),
  lastname: z.string(),
  isActive: z.boolean(),
  isPlatformAdmin: z.boolean(),
  emailVerified: z.boolean(),
  companyCount: z.number().int(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
})

function serializeUser(user: PlatformUserRecord) {
  return {
    ...user,
    lastLoginAt: toNullableInstant(user.lastLoginAt),
    createdAt: toInstant(user.createdAt),
    deletedAt: toNullableInstant(user.deletedAt),
  }
}

export const platformUsersRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/platform/users",
    summary: "Padrón de cuentas, de sólo lectura",
    tags: ["Plataforma"],
    request: { query: collectionQuery(platformUserQuery) },
    responses: {
      200: {
        description: "Todas las cuentas. Sin contraseñas ni datos de sesión.",
        content: { "application/json": { schema: pageSchema(platformUserSchema) } },
      },
      403: { description: "No es administración de plataforma" },
    },
  },
  handler: async (c) => {
    const actor = platformRequester(c)
    const page = await listPlatformUsers(actor, queryOf(c, platformUserQuery))
    return c.json(serializePage(page, serializeUser), 200)
  },
})

// ─── Bitácora ────────────────────────────────────────────────────────────────

const platformActivitySchema = z.object({
  id: z.string(),
  action: z.enum(["create", "update", "delete"]),
  entity: z.string(),
  entityId: z.string().nullable(),
  entityLabel: z.string(),
  title: z.string(),
  description: z.string(),
  performedBy: z.string(),
  createdAt: z.string().datetime(),
})

function serializeActivity(entry: PlatformActivityRecord) {
  return { ...entry, createdAt: toInstant(entry.createdAt) }
}

export const platformActivityRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/platform/activity",
    summary: "Lo que ha hecho la administración de plataforma",
    tags: ["Plataforma"],
    request: { query: collectionQuery(platformActivityQuery) },
    responses: {
      200: {
        description: "Asientos de sólo anexado, el más reciente primero",
        content: { "application/json": { schema: pageSchema(platformActivitySchema) } },
      },
      403: { description: "No es administración de plataforma" },
    },
  },
  handler: async (c) => {
    const actor = platformRequester(c)
    const page = await listPlatformActivity(actor, queryOf(c, platformActivityQuery))
    return c.json(serializePage(page, serializeActivity), 200)
  },
})
