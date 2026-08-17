/**
 * Rutas de direcciones, contrapartes y taxonomía global.
 *
 * Rebanada 10, segunda mitad. Tres dominios que comparten poco entre sí y una cosa importante:
 * **son los datos maestros de los que cuelga todo el comercio**. Una cotización necesita una
 * contraparte y una dirección; un producto, una categoría.
 *
 * ## Tres regímenes de acceso distintos, y por qué
 *
 * | Superficie | Régimen | Motivo |
 * |---|---|---|
 * | Direcciones de usuario | autenticado | Son suyas. No hay empresa contra la que resolver permiso |
 * | Direcciones de empresa y contrapartes | permiso | Datos de la empresa |
 * | Taxonomía global, en lectura | **pública** | Aparece en tiendas y en el directorio de locaciones, que se sirven a quien no ha entrado |
 * | Taxonomía global, en escritura | permiso | Sólo administración de plataforma |
 */

import { z } from "@hono/zod-openapi"
import { ForbiddenError, toInstant } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import {
  type AddressBook,
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from "../companies/addresses.ts"
import {
  createCategory,
  deleteCategory,
  deletionScope,
  listCategories,
  updateCategory,
} from "../companies/categories.ts"
import type { Actor } from "../companies/companies.ts"
import {
  createCounterparty,
  deleteCounterparty,
  listCounterparties,
  updateCounterparty,
} from "../companies/counterparties.ts"
import { AUTHENTICATED, defineRoute, PUBLIC, REQUIRES } from "../runtime/route.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const addressSchema = z.object({
  id: z.string(),
  label: z.string(),
  street: z.string(),
  number: z.string(),
  colony: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  countryCode: z.string(),
  postalCode: z.string(),
  latitude: z.string().nullable(),
  longitude: z.string().nullable(),
  isPrimary: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const addressBody = z.object({
  label: z.string().max(120).optional(),
  street: z.string().max(200).optional(),
  number: z.string().max(32).optional(),
  colony: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  countryCode: z.string().length(2).optional(),
  postalCode: z.string().max(16).optional(),
  latitude: z.string().nullable().optional(),
  longitude: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
})

const counterpartySchema = z.object({
  id: z.string(),
  role: z.enum(["client", "provider"]),
  alias: z.string(),
  userId: z.string().nullable(),
  counterpartyCompanyId: z.string().nullable(),
  snapshot: z.record(z.string(), z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const snapshotBody = z
  .object({
    name: z.string().optional(),
    lastname: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    companyName: z.string().optional(),
    taxId: z.string().optional(),
    address: z.string().optional(),
  })
  .optional()

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  parentId: z.string().nullable(),
  serviceId: z.string().nullable(),
  keyname: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const companyParams = z.object({ companyId: z.string() })

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

function serializeAddress(address: Awaited<ReturnType<typeof createAddress>>) {
  return {
    ...address,
    createdAt: toInstant(address.createdAt),
    updatedAt: toInstant(address.updatedAt),
  }
}

function serializeCounterparty(row: Awaited<ReturnType<typeof createCounterparty>>) {
  return {
    ...row,
    snapshot: row.snapshot as Record<string, string>,
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  }
}

function serializeCategory(row: Awaited<ReturnType<typeof createCategory>>) {
  return {
    ...row,
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  }
}

// ─── Direcciones del usuario ─────────────────────────────────────────────────

const userBook = (c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): AddressBook => ({
  kind: "user",
  userId: requireSession(c).userId,
})

export const listUserAddressesRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/me/addresses",
    summary: "Mi libreta de direcciones",
    tags: ["Direcciones"],
    responses: {
      200: {
        description: "Direcciones propias, la primaria primero",
        content: { "application/json": { schema: z.object({ items: z.array(addressSchema) }) } },
      },
    },
  },
  handler: async (c) => {
    const items = await listAddresses(actorOf(c), userBook(c))
    return c.json({ items: items.map(serializeAddress) }, 200)
  },
})

export const createUserAddressRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "post",
    path: "/me/addresses",
    summary: "Añadir una dirección propia",
    tags: ["Direcciones"],
    request: { body: { content: { "application/json": { schema: addressBody } } } },
    responses: {
      201: {
        description: "Creada. La primera de una libreta vacía nace primaria",
        content: { "application/json": { schema: addressSchema } },
      },
    },
  },
  handler: async (c) => {
    const address = await createAddress(actorOf(c), userBook(c), c.req.valid("json"))
    return c.json(serializeAddress(address), 201)
  },
})

export const updateUserAddressRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "patch",
    path: "/me/addresses/{addressId}",
    summary: "Editar una dirección propia",
    tags: ["Direcciones"],
    request: {
      params: z.object({ addressId: z.string() }),
      body: { content: { "application/json": { schema: addressBody } } },
    },
    responses: {
      200: {
        description: "Actualizada",
        content: { "application/json": { schema: addressSchema } },
      },
      404: { description: "No existe, o es de otra libreta" },
    },
  },
  handler: async (c) => {
    const address = await updateAddress(
      actorOf(c),
      userBook(c),
      c.req.valid("param").addressId,
      c.req.valid("json"),
    )
    return c.json(serializeAddress(address), 200)
  },
})

export const deleteUserAddressRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "delete",
    path: "/me/addresses/{addressId}",
    summary: "Eliminar una dirección propia",
    tags: ["Direcciones"],
    request: { params: z.object({ addressId: z.string() }) },
    responses: { 204: { description: "Eliminada. Si era la primaria, se promueve otra" } },
  },
  handler: async (c) => {
    await deleteAddress(actorOf(c), userBook(c), c.req.valid("param").addressId)
    return c.body(null, 204)
  },
})

// ─── Direcciones de la empresa ───────────────────────────────────────────────

const addressParams = companyParams.extend({ addressId: z.string() })

export const listCompanyAddressesRoute = defineRoute({
  access: REQUIRES("companies.addresses.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/addresses",
    summary: "Libreta de direcciones de la empresa",
    tags: ["Direcciones"],
    request: { params: companyParams },
    responses: {
      200: {
        description: "Direcciones de la empresa, la primaria primero",
        content: { "application/json": { schema: z.object({ items: z.array(addressSchema) }) } },
      },
    },
  },
  handler: async (c) => {
    const companyId = c.req.valid("param").companyId
    const items = await listAddresses(actorOf(c), { kind: "company", companyId })
    return c.json({ items: items.map(serializeAddress) }, 200)
  },
})

export const createCompanyAddressRoute = defineRoute({
  access: REQUIRES("companies.addresses.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/addresses",
    summary: "Añadir una dirección de empresa",
    tags: ["Direcciones"],
    request: {
      params: companyParams,
      body: { content: { "application/json": { schema: addressBody } } },
    },
    responses: {
      201: { description: "Creada", content: { "application/json": { schema: addressSchema } } },
    },
  },
  handler: async (c) => {
    const companyId = c.req.valid("param").companyId
    const address = await createAddress(
      actorOf(c),
      { kind: "company", companyId },
      c.req.valid("json"),
    )
    return c.json(serializeAddress(address), 201)
  },
})

export const updateCompanyAddressRoute = defineRoute({
  access: REQUIRES("companies.addresses.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/addresses/{addressId}",
    summary: "Editar una dirección de empresa",
    tags: ["Direcciones"],
    request: {
      params: addressParams,
      body: { content: { "application/json": { schema: addressBody } } },
    },
    responses: {
      200: {
        description: "Actualizada",
        content: { "application/json": { schema: addressSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const address = await updateAddress(
      actorOf(c),
      { kind: "company", companyId: params.companyId },
      params.addressId,
      c.req.valid("json"),
    )
    return c.json(serializeAddress(address), 200)
  },
})

export const deleteCompanyAddressRoute = defineRoute({
  access: REQUIRES("companies.addresses.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/addresses/{addressId}",
    summary: "Eliminar una dirección de empresa",
    tags: ["Direcciones"],
    request: { params: addressParams },
    responses: { 204: { description: "Eliminada. Si era la primaria, se promueve otra" } },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteAddress(
      actorOf(c),
      { kind: "company", companyId: params.companyId },
      params.addressId,
    )
    return c.body(null, 204)
  },
})

// ─── Contrapartes ────────────────────────────────────────────────────────────

/**
 * Clientes y proveedores comparten estructura y **no comparten permiso**: el catálogo tiene
 * `companies.clients.*` y `companies.providers.*` por separado, así que quien lleva las compras no
 * ve por ello la cartera de clientes.
 *
 * Por eso son dos familias de rutas y no una con el papel en la consulta: el permiso se declara en
 * el tipo, y un parámetro no puede decidirlo.
 */
const counterpartyParams = companyParams.extend({ counterpartyId: z.string() })

const counterpartyBody = z.object({
  alias: z.string().trim().min(1).max(160),
  email: z.string().email().optional(),
  snapshot: snapshotBody,
})

function counterpartyRoutes(role: "client" | "provider") {
  const space = role === "client" ? "clients" : "providers"
  const segment = role === "client" ? "clients" : "providers"
  const label = role === "client" ? "clientes" : "proveedores"

  const list = defineRoute({
    access: REQUIRES(`companies.${space}.view` as "companies.clients.view"),
    config: {
      method: "get",
      path: `/companies/{companyId}/${segment}`,
      summary: `Listar ${label}`,
      tags: ["Contrapartes"],
      request: { params: companyParams },
      responses: {
        200: {
          description: `Los ${label} de la empresa`,
          content: {
            "application/json": { schema: z.object({ items: z.array(counterpartySchema) }) },
          },
        },
      },
    },
    handler: async (c) => {
      const items = await listCounterparties(actorOf(c), c.req.valid("param").companyId, role)
      return c.json({ items: items.map(serializeCounterparty) }, 200)
    },
  })

  const create = defineRoute({
    access: REQUIRES(`companies.${space}.create` as "companies.clients.create"),
    config: {
      method: "post",
      path: `/companies/{companyId}/${segment}`,
      summary: `Dar de alta un ${role === "client" ? "cliente" : "proveedor"}`,
      tags: ["Contrapartes"],
      request: {
        params: companyParams,
        body: { content: { "application/json": { schema: counterpartyBody } } },
      },
      responses: {
        201: {
          description: "Dado de alta",
          content: { "application/json": { schema: counterpartySchema } },
        },
        409: { description: "Ya está dado de alta" },
      },
    },
    handler: async (c) => {
      const row = await createCounterparty(actorOf(c), c.req.valid("param").companyId, {
        role,
        ...c.req.valid("json"),
      })
      return c.json(serializeCounterparty(row), 201)
    },
  })

  const update = defineRoute({
    access: REQUIRES(`companies.${space}.edit` as "companies.clients.edit"),
    config: {
      method: "patch",
      path: `/companies/{companyId}/${segment}/{counterpartyId}`,
      summary: `Editar un ${role === "client" ? "cliente" : "proveedor"}`,
      tags: ["Contrapartes"],
      request: {
        params: counterpartyParams,
        body: {
          content: {
            "application/json": {
              schema: z.object({ alias: z.string().max(160).optional(), snapshot: snapshotBody }),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Actualizado",
          content: { "application/json": { schema: counterpartySchema } },
        },
      },
    },
    handler: async (c) => {
      const params = c.req.valid("param")
      const row = await updateCounterparty(
        actorOf(c),
        params.companyId,
        params.counterpartyId,
        c.req.valid("json"),
      )
      return c.json(serializeCounterparty(row), 200)
    },
  })

  const remove = defineRoute({
    access: REQUIRES(`companies.${space}.delete` as "companies.clients.delete"),
    config: {
      method: "delete",
      path: `/companies/{companyId}/${segment}/{counterpartyId}`,
      summary: `Dar de baja un ${role === "client" ? "cliente" : "proveedor"}`,
      tags: ["Contrapartes"],
      request: { params: counterpartyParams },
      responses: {
        204: { description: "Dado de baja. Los documentos emitidos conservan su nombre" },
      },
    },
    handler: async (c) => {
      const params = c.req.valid("param")
      await deleteCounterparty(actorOf(c), params.companyId, params.counterpartyId)
      return c.body(null, 204)
    },
  })

  return [list, create, update, remove] as const
}

export const [listClientsRoute, createClientRoute, updateClientRoute, deleteClientRoute] =
  counterpartyRoutes("client")

export const [listProvidersRoute, createProviderRoute, updateProviderRoute, deleteProviderRoute] =
  counterpartyRoutes("provider")

// ─── Taxonomía global ────────────────────────────────────────────────────────

export const listCategoriesRoute = defineRoute({
  access: PUBLIC("La taxonomía aparece en las tiendas y en el directorio, que no exigen sesión"),
  config: {
    method: "get",
    path: "/categories",
    summary: "Listar categorías globales",
    tags: ["Taxonomías"],
    request: {
      query: z.object({
        /** Sin él se devuelven las raíces, que es el listado por defecto que pide la spec. */
        parent: z.string().optional(),
        service: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Categorías del nivel pedido",
        content: { "application/json": { schema: z.object({ items: z.array(categorySchema) }) } },
      },
    },
  },
  handler: async (c) => {
    const query = c.req.valid("query")
    const items = await listCategories({
      ...(query.parent ? { parentId: query.parent } : {}),
      ...(query.service ? { serviceKeycode: query.service } : {}),
    })
    return c.json({ items: items.map(serializeCategory) }, 200)
  },
})

export const createCategoryRoute = defineRoute({
  access: REQUIRES("companies.companies.edit"),
  config: {
    method: "post",
    path: "/companies/{companyId}/categories",
    summary: "Crear una categoría global",
    tags: ["Taxonomías"],
    request: {
      params: companyParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().trim().min(1).max(160),
              parentId: z.string().nullable().optional(),
              service: z.string().nullable().optional(),
              keyname: z.string().max(64).nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: "Creada", content: { "application/json": { schema: categorySchema } } },
      403: { description: "La taxonomía global sólo la administra la plataforma" },
    },
  },
  handler: async (c) => {
    assertPlatform(c)
    const body = c.req.valid("json")
    const category = await createCategory(actorOf(c), {
      name: body.name,
      ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
      ...(body.service !== undefined ? { serviceKeycode: body.service } : {}),
      ...(body.keyname !== undefined ? { keyname: body.keyname } : {}),
    })
    return c.json(serializeCategory(category), 201)
  },
})

const categoryParams = companyParams.extend({ categoryId: z.string() })

export const updateCategoryRoute = defineRoute({
  access: REQUIRES("companies.companies.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/categories/{categoryId}",
    summary: "Editar o re-parentar una categoría global",
    tags: ["Taxonomías"],
    request: {
      params: categoryParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().trim().min(1).max(160).optional(),
              parentId: z.string().nullable().optional(),
              service: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Actualizada",
        content: { "application/json": { schema: categorySchema } },
      },
      422: { description: "El movimiento cerraría un ciclo" },
    },
  },
  handler: async (c) => {
    assertPlatform(c)
    const body = c.req.valid("json")
    const category = await updateCategory(actorOf(c), c.req.valid("param").categoryId, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
      ...(body.service !== undefined ? { serviceKeycode: body.service } : {}),
    })
    return c.json(serializeCategory(category), 200)
  },
})

export const categoryScopeRoute = defineRoute({
  access: REQUIRES("companies.companies.edit"),
  config: {
    method: "get",
    path: "/companies/{companyId}/categories/{categoryId}/scope",
    summary: "Qué se lleva por delante eliminar esta categoría",
    tags: ["Taxonomías"],
    request: { params: categoryParams },
    responses: {
      200: {
        description: "El alcance, para poder advertirlo antes de confirmar",
        content: { "application/json": { schema: z.object({ categories: z.number().int() }) } },
      },
    },
  },
  handler: async (c) => {
    assertPlatform(c)
    const scope = await deletionScope(actorOf(c), c.req.valid("param").categoryId)
    return c.json(scope, 200)
  },
})

export const deleteCategoryRoute = defineRoute({
  access: REQUIRES("companies.companies.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/categories/{categoryId}",
    summary: "Eliminar una categoría global y su subárbol",
    tags: ["Taxonomías"],
    request: { params: categoryParams },
    responses: {
      204: { description: "Eliminada con sus descendientes. Lo clasificado queda sin categoría" },
    },
  },
  handler: async (c) => {
    assertPlatform(c)
    await deleteCategory(actorOf(c), c.req.valid("param").categoryId)
    return c.body(null, 204)
  },
})

/**
 * La taxonomía global sólo la administra la plataforma.
 *
 * No hay clave de permiso para ella: es común a todas las empresas, así que un permiso *de empresa*
 * no puede autorizarla. Las rutas cuelgan de `:companyId` porque la compuerta lo exige —un permiso
 * necesita una empresa contra la que resolverse—, pero lo que de verdad decide es esta comprobación.
 *
 * Es el mismo caso que la transferencia de propiedad, y se apunta al mismo sitio: si el negocio
 * quiere poder delegarlo, hace falta una clave nueva en el catálogo.
 */
function assertPlatform(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): void {
  const authorization = c.get("authorization")
  if (!authorization?.isPlatformAdmin) {
    throw new ForbiddenError("La taxonomía global sólo la administra la plataforma")
  }
}
