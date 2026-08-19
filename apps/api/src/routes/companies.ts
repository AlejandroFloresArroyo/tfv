/**
 * Rutas de empresas, membresías y roles.
 *
 * Rebanada 10. Son las **primeras rutas de dominio** de la pila nueva, y las primeras que la
 * compuerta de permisos protege de verdad.
 *
 * ## Dos cosas que conviene notar en la tabla de abajo
 *
 * **Crear una empresa no lleva permiso, y no es un olvido.** Un permiso se resuelve dentro de una
 * empresa, y aquí todavía no hay ninguna contra la que resolverlo. El catálogo lo refleja: tiene
 * `companies.companies.edit` y `.delete`, y **no** tiene `.create`. Basta con tener cuenta.
 *
 * **La propiedad tampoco lleva permiso**, por el mismo motivo del revés: el catálogo no tiene
 * ninguna clave para transferirla. Se exige ser propietaria, que es una regla y no un permiso, y se
 * comprueba en el manejador. Queda anotado como hallazgo de la rebanada: si el negocio quiere poder
 * delegarla, hace falta una clave nueva y el catálogo deja de coincidir con el anterior.
 */

import { z } from "@hono/zod-openapi"
import { ForbiddenError, toInstant } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import {
  type Actor,
  addMember,
  companyQuery,
  createCompany,
  deleteCompany,
  getCompany,
  listCompanies,
  listMembers,
  memberQuery,
  removeMember,
  updateCompany,
  updateMember,
} from "../companies/companies.ts"
import { createRole, deleteRole, listRoles, roleQuery, updateRole } from "../companies/roles.ts"
import { AUTHENTICATED, defineRoute, REQUIRES } from "../runtime/route.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const companySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  email: z.string().nullable(),
  commissionRate: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const memberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  lastname: z.string(),
  roleId: z.string().nullable(),
  roleName: z.string().nullable(),
  isOwner: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
})

const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  permissions: z.array(z.string()),
  memberCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const companyParams = z.object({ companyId: z.string() })
const nameField = z.string().trim().min(1, "El nombre es obligatorio").max(200)

/** El solicitante, en la forma que el motor necesita para resolver su identidad. */
function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)

  return {
    userId: session.userId,
    sessionId: session.sessionId,
    // Por qué se dejó pasar. La bitácora marca lo ejercido como administración de plataforma, que
    // es lo que permite distinguir después lo que hizo soporte de lo que hizo el cliente.
    asPlatformAdmin: c.get("grantReason") === "platform_admin",
  }
}

// ─── Empresas ────────────────────────────────────────────────────────────────

/**
 * Primera ruta con clave de idempotencia, de forma deliberada.
 *
 * Dar de alta una empresa es la escritura donde repetir hace más daño de las que hoy no cuelgan de
 * un dominio en obras: no hay unicidad que lo impida —dos empresas pueden llamarse igual— así que un
 * doble envío deja **dos empresas** con el mismo nombre, las dos con quien las creó de propietario,
 * y deshacerlo es una baja lógica que alguien tiene que decidir hacer.
 *
 * Es también el caso de alcance nulo: esta ruta no cuelga de ninguna empresa, así que la clave se
 * acota sólo al actor. Ver `apps/api/src/runtime/idempotency.ts`.
 */
export const createCompanyRoute = defineRoute({
  access: AUTHENTICATED,
  idempotent: true,
  config: {
    method: "post",
    path: "/companies",
    summary: "Crear una empresa",
    tags: ["Empresas"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              description: z.string().max(2000).optional(),
              email: z.string().email().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Empresa creada, con quien la creó como propietaria",
        content: { "application/json": { schema: companySchema } },
      },
    },
  },
  handler: async (c) => {
    const company = await createCompany(actorOf(c), c.req.valid("json"))
    return c.json(serializeCompany(company), 201)
  },
})

export const listCompaniesRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/companies",
    summary: "Listar las empresas del solicitante",
    tags: ["Empresas"],
    request: { query: collectionQuery(companyQuery) },
    responses: {
      200: {
        description: "Empresas con membresía activa",
        content: { "application/json": { schema: pageSchema(companySchema) } },
      },
    },
  },
  handler: async (c) => {
    const page = await listCompanies(actorOf(c), queryOf(c, companyQuery))
    return c.json(serializePage(page, serializeCompany), 200)
  },
})

export const getCompanyRoute = defineRoute({
  access: REQUIRES("companies.companies.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}",
    summary: "Ver una empresa",
    tags: ["Empresas"],
    request: { params: companyParams },
    responses: {
      200: {
        description: "La empresa",
        content: { "application/json": { schema: companySchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const company = await getCompany(actorOf(c), c.req.valid("param").companyId)
    return c.json(serializeCompany(company), 200)
  },
})

export const updateCompanyRoute = defineRoute({
  access: REQUIRES("companies.companies.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}",
    summary: "Editar una empresa",
    tags: ["Empresas"],
    request: {
      params: companyParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              description: z.string().max(2000).optional(),
              email: z.string().email().nullable().optional(),
              /** Sólo la mueve la administración de plataforma; se descarta para el resto. */
              commissionRate: z
                .string()
                .regex(/^\d+(\.\d{1,4})?$/)
                .optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Empresa actualizada",
        content: { "application/json": { schema: companySchema } },
      },
      403: { description: "Falta el permiso, o se intentó mover la comisión sin ser plataforma" },
    },
  },
  handler: async (c) => {
    const body = c.req.valid("json")
    const session = requireSession(c)

    // La comisión es de la plataforma, no de la empresa: si la moviera quien la paga, dejaría de
    // ser una comisión. Se rechaza en lugar de ignorarse en silencio — ignorar un campo hace creer
    // que se guardó.
    if (body.commissionRate !== undefined && !session.isPlatformAdmin) {
      throw new ForbiddenError("Sólo la administración de plataforma cambia la comisión")
    }

    const company = await updateCompany(actorOf(c), c.req.valid("param").companyId, body)
    return c.json(serializeCompany(company), 200)
  },
})

export const deleteCompanyRoute = defineRoute({
  access: REQUIRES("companies.companies.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}",
    summary: "Dar de baja una empresa",
    tags: ["Empresas"],
    request: { params: companyParams },
    responses: {
      204: { description: "Dada de baja. La fila y su historial sobreviven; el acceso no" },
    },
  },
  handler: async (c) => {
    await deleteCompany(actorOf(c), c.req.valid("param").companyId)
    return c.body(null, 204)
  },
})

// ─── Membresías ──────────────────────────────────────────────────────────────

const memberParams = companyParams.extend({ memberId: z.string() })

export const listMembersRoute = defineRoute({
  access: REQUIRES("companies.users.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/members",
    summary: "Listar los miembros de una empresa",
    tags: ["Empresas"],
    request: { params: companyParams, query: collectionQuery(memberQuery) },
    responses: {
      200: {
        description: "Miembros, activos e inactivos",
        content: { "application/json": { schema: pageSchema(memberSchema) } },
      },
    },
  },
  handler: async (c) => {
    const page = await listMembers(
      actorOf(c),
      c.req.valid("param").companyId,
      queryOf(c, memberQuery),
    )
    return c.json(serializePage(page, serializeMember), 200)
  },
})

export const addMemberRoute = defineRoute({
  access: REQUIRES("companies.users.invite"),
  config: {
    method: "post",
    path: "/companies/{companyId}/members",
    summary: "Incorporar a alguien que ya tiene cuenta",
    tags: ["Empresas"],
    request: {
      params: companyParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              email: z.string().email(),
              roleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Incorporada",
        content: { "application/json": { schema: memberSchema } },
      },
      409: { description: "Ya pertenece a la empresa" },
      422: { description: "No existe ninguna cuenta con ese correo" },
    },
  },
  handler: async (c) => {
    const member = await addMember(actorOf(c), c.req.valid("param").companyId, c.req.valid("json"))
    return c.json(serializeMember(member), 201)
  },
})

export const updateMemberRoute = defineRoute({
  access: REQUIRES("companies.users.change-role"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/members/{memberId}",
    summary: "Cambiar el rol, la actividad o la propiedad de un miembro",
    tags: ["Empresas"],
    request: {
      params: memberParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              roleId: z.string().nullable().optional(),
              isActive: z.boolean().optional(),
              isOwner: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Membresía actualizada",
        content: { "application/json": { schema: memberSchema } },
      },
      403: { description: "Sólo una propietaria mueve la propiedad" },
      422: { description: "La empresa se quedaría sin propietaria, o el rol es de otra empresa" },
    },
  },
  handler: async (c) => {
    const body = c.req.valid("json")

    // La propiedad no tiene clave en el catálogo, así que no se puede exigir como permiso. Se exige
    // ser propietaria — o administración de plataforma, que opera como tal en cualquier empresa.
    if (body.isOwner !== undefined) {
      const authorization = c.get("authorization")
      if (!authorization.isOwner && !authorization.isPlatformAdmin) {
        throw new ForbiddenError("Sólo una propietaria puede conceder o retirar la propiedad")
      }
    }

    const params = c.req.valid("param")
    const member = await updateMember(actorOf(c), params.companyId, params.memberId, body)
    return c.json(serializeMember(member), 200)
  },
})

export const removeMemberRoute = defineRoute({
  access: REQUIRES("companies.users.uninvite"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/members/{memberId}",
    summary: "Retirar a alguien de la empresa",
    tags: ["Empresas"],
    request: { params: memberParams },
    responses: {
      204: { description: "Retirada" },
      422: { description: "La empresa se quedaría sin propietaria" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await removeMember(actorOf(c), params.companyId, params.memberId)
    return c.body(null, 204)
  },
})

// ─── Roles ───────────────────────────────────────────────────────────────────

const roleParams = companyParams.extend({ roleId: z.string() })
const permissionsField = z.array(z.string()).max(512)

export const listRolesRoute = defineRoute({
  access: REQUIRES("companies.roles.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/roles",
    summary: "Listar los roles de una empresa",
    tags: ["Empresas"],
    request: { params: companyParams, query: collectionQuery(roleQuery) },
    responses: {
      200: {
        description: "Roles, con cuántas personas tienen cada uno",
        content: { "application/json": { schema: pageSchema(roleSchema) } },
      },
    },
  },
  handler: async (c) => {
    const page = await listRoles(actorOf(c), c.req.valid("param").companyId, queryOf(c, roleQuery))
    return c.json(serializePage(page, serializeRole), 200)
  },
})

/** Y el caso con alcance de empresa: dos roles con el mismo nombre y los mismos permisos. */
export const createRoleRoute = defineRoute({
  access: REQUIRES("companies.roles.create"),
  idempotent: true,
  config: {
    method: "post",
    path: "/companies/{companyId}/roles",
    summary: "Crear un rol",
    tags: ["Empresas"],
    request: {
      params: companyParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({ name: nameField, permissions: permissionsField.default([]) }),
          },
        },
      },
    },
    responses: {
      201: { description: "Rol creado", content: { "application/json": { schema: roleSchema } } },
      400: { description: "Alguna clave de permiso no existe en el catálogo" },
    },
  },
  handler: async (c) => {
    const role = await createRole(actorOf(c), c.req.valid("param").companyId, c.req.valid("json"))
    return c.json(serializeRole(role), 201)
  },
})

export const updateRoleRoute = defineRoute({
  access: REQUIRES("companies.roles.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/roles/{roleId}",
    summary: "Editar un rol",
    tags: ["Empresas"],
    request: {
      params: roleParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              permissions: permissionsField.optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Rol actualizado",
        content: { "application/json": { schema: roleSchema } },
      },
      400: { description: "Alguna clave de permiso no existe en el catálogo" },
      403: { description: "Cambiar el conjunto de permisos tiene su propia clave" },
    },
  },
  handler: async (c) => {
    const body = c.req.valid("json")

    // Renombrar un rol y repartir permisos son cosas distintas, y el catálogo las separa:
    // `companies.roles.edit` no alcanza para tocar el conjunto de claves.
    if (body.permissions !== undefined) {
      const authorization = c.get("authorization")
      const canChange =
        authorization.isOwner ||
        authorization.isPlatformAdmin ||
        authorization.granted.has("companies.roles.change_permissions")

      if (!canChange) {
        throw new ForbiddenError("Falta el permiso companies.roles.change_permissions")
      }
    }

    const params = c.req.valid("param")
    const role = await updateRole(actorOf(c), params.companyId, params.roleId, body)
    return c.json(serializeRole(role), 200)
  },
})

export const deleteRoleRoute = defineRoute({
  access: REQUIRES("companies.roles.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/roles/{roleId}",
    summary: "Eliminar un rol",
    tags: ["Empresas"],
    request: { params: roleParams },
    responses: {
      204: { description: "Eliminado. Sus miembros conservan la pertenencia y pierden el rol" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteRole(actorOf(c), params.companyId, params.roleId)
    return c.body(null, 204)
  },
})

// ─── Serialización ───────────────────────────────────────────────────────────

function serializeCompany(company: Awaited<ReturnType<typeof getCompany>>) {
  return {
    id: company.id,
    name: company.name,
    description: company.description,
    email: company.email,
    commissionRate: company.commissionRate,
    createdAt: toInstant(company.createdAt),
    updatedAt: toInstant(company.updatedAt),
  }
}

function serializeMember(member: Awaited<ReturnType<typeof addMember>>) {
  return {
    id: member.id,
    userId: member.userId,
    email: member.email,
    name: member.name,
    lastname: member.lastname,
    roleId: member.roleId,
    roleName: member.roleName,
    isOwner: member.isOwner,
    isActive: member.isActive,
    createdAt: toInstant(member.createdAt),
  }
}

function serializeRole(role: Awaited<ReturnType<typeof createRole>>) {
  return {
    id: role.id,
    name: role.name,
    permissions: [...role.permissions],
    memberCount: role.memberCount,
    createdAt: toInstant(role.createdAt),
    updatedAt: toInstant(role.updatedAt),
  }
}
