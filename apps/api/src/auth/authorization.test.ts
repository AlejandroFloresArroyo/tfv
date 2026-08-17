/**
 * Aplicación de los permisos, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/access-control/spec.md`. Recorren la API real
 * con una ruta de prueba, porque lo que la spec describe es comportamiento observable y no el
 * resultado de una función.
 *
 * La ruta de prueba existe porque **todavía no hay ninguna ruta de dominio**: la primera llega con
 * la rebanada 10. Sin ella, la compuerta se quedaría sin probar hasta entonces — que es tanto como
 * decir que se prueba después de haber escrito los manejadores que dependen de ella.
 */

import { z } from "@hono/zod-openapi"
import { newId, PERMISSION_KEYS, unknownPermissions } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  loginAttempts,
  notificationDeliveries,
  roles,
  sessions,
  users,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../runtime/app.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import { assertKnownPermissions } from "./authorization.ts"

// ─── Ruta de prueba ──────────────────────────────────────────────────────────

/**
 * El efecto que la ruta produce, para poder comprobar que **no ocurre** cuando falta el permiso.
 *
 * La spec no dice sólo «responde 403»: dice que no debe quedar rastro ni emitirse notificación. Sin
 * un efecto observable, una prueba de `403` no distingue entre «no se ejecutó» y «se ejecutó y
 * luego se respondió mal».
 */
let effects: string[] = []

const guardedRoute = defineRoute({
  access: REQUIRES("warehouses.products.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/probe",
    summary: "Ruta de prueba de la compuerta de permisos",
    tags: ["Prueba"],
    request: { params: z.object({ companyId: z.string() }) },
    responses: {
      200: {
        description: "Se ejecutó",
        content: { "application/json": { schema: z.object({ reason: z.string().nullable() }) } },
      },
    },
  },
  handler: (c) => {
    effects.push("ejecutado")
    return c.json({ reason: c.get("grantReason") }, 200)
  },
})

const app = createApp([guardedRoute])

// ─── Andamiaje ───────────────────────────────────────────────────────────────

const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  effects = []
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companies} cascade`,
  )
}

beforeEach(reset)
afterAll(async () => {
  await reset()
  await closeConnection()
})

/** La aplicación completa, para las rutas de acceso que el andamiaje necesita. */
const fullApp = await (async () => {
  const { routes } = await import("../routes/index.ts")
  return createApp(routes)
})()

async function signIn(email: string): Promise<string> {
  await fullApp.request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, name: "Prueba" }),
  })

  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const response = await fullApp.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  })

  const cookie = response.headers.getSetCookie().find((raw) => raw.startsWith("tfv_session="))
  if (!cookie) throw new Error("no se abrió sesión")
  return cookie.split(";")[0] ?? ""
}

interface Scenario {
  readonly permissions?: string[] | undefined
  readonly isOwner?: boolean | undefined
  readonly isActive?: boolean | undefined
  readonly isPlatformAdmin?: boolean | undefined
  readonly withoutMembership?: boolean | undefined
  readonly withoutRole?: boolean | undefined
}

/** Monta una empresa, un rol y un miembro con las características que pida el escenario. */
async function scenario(email: string, options: Scenario = {}) {
  const cookie = await signIn(email)

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (!user) throw new Error("la cuenta debería existir")

  if (options.isPlatformAdmin) {
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id))
  }

  const companyId = newId()
  await db.insert(companies).values({ id: companyId, name: "Empresa de prueba" })

  let roleId: string | null = null
  if (!options.withoutRole) {
    roleId = newId()
    await db.insert(roles).values({
      id: roleId,
      companyId,
      name: "Rol de prueba",
      permissions: options.permissions ?? [],
    })
  }

  if (!options.withoutMembership) {
    await db.insert(companyMembers).values({
      id: newId(),
      companyId,
      userId: user.id,
      roleId,
      isOwner: options.isOwner ?? false,
      isActive: options.isActive ?? true,
    })
  }

  return { cookie, companyId, userId: user.id }
}

function probe(companyId: string, cookie: string) {
  return app.request(`/companies/${companyId}/probe`, { method: "POST", headers: { cookie } })
}

// ─── El catálogo es la autoridad ─────────────────────────────────────────────

describe("catálogo de permisos", () => {
  it("tiene las 255 claves que la implementación anterior reconoce", () => {
    // Fija el tamaño a propósito. El catálogo es el contrato con los roles que ya existen en
    // producción: perder una clave al migrarlos deja a alguien sin un permiso que tenía, y esta
    // prueba es lo que obliga a que quitarla sea una decisión y no un descuido.
    expect(PERMISSION_KEYS).toHaveLength(255)
  })

  it("no tiene claves repetidas", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length)
  })

  it("toda clave se lee servicio.recurso.acción", () => {
    for (const key of PERMISSION_KEYS) {
      expect(key.split(".")).toHaveLength(3)
    }
  })

  it("una clave ausente del catálogo se rechaza al guardar un rol", () => {
    // Escenario: «se intenta guardar un rol con una clave de permiso ausente del catálogo».
    expect(() => assertKnownPermissions(["warehouses.products.aprobar"])).toThrow()
    expect(unknownPermissions(["warehouses.products.aprobar"])).toEqual([
      "warehouses.products.aprobar",
    ])
  })

  it("un conjunto de claves buenas se acepta", () => {
    expect(() =>
      assertKnownPermissions(["warehouses.products.create", "companies.users.view"]),
    ).not.toThrow()
  })

  it("el catálogo publicado coincide con el que hace cumplir el permiso", async () => {
    const cookie = await signIn("catalogo@ejemplo.mx")
    const response = await fullApp.request("/permissions", { headers: { cookie } })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { total: number; keys: string[] }

    // Si divergieran, la interfaz ofrecería claves que el servidor no reconoce — que es
    // exactamente la situación de la que se viene.
    expect(body.total).toBe(PERMISSION_KEYS.length)
    expect(body.keys).toEqual([...PERMISSION_KEYS])
  })

  it("el catálogo no se sirve sin sesión", async () => {
    expect((await fullApp.request("/permissions")).status).toBe(401)
  })
})

// ─── La compuerta ────────────────────────────────────────────────────────────

describe("los permisos autorizan la acción", () => {
  it("con el permiso, la acción se ejecuta", async () => {
    // Escenario: «Una acción con permiso se ejecuta».
    const { cookie, companyId } = await scenario("concede@ejemplo.mx", {
      permissions: ["warehouses.products.create"],
    })

    const response = await probe(companyId, cookie)

    expect(response.status).toBe(200)
    expect(effects).toEqual(["ejecutado"])
    expect(await response.json()).toEqual({ reason: "role" })
  })

  it("sin el permiso, 403 y sin efecto alguno", async () => {
    // Escenario: «Sin permiso no hay efecto». Es lo que la implementación anterior no hacía: los
    // permisos existían y no se evaluaban (`DEFECTS.md` S-07).
    const { cookie, companyId } = await scenario("niega@ejemplo.mx", {
      permissions: ["warehouses.products.delete"],
    })

    const response = await probe(companyId, cookie)

    expect(response.status).toBe(403)
    expect(effects).toEqual([])
  })

  it("un rol sin permisos no puede escribir", async () => {
    // Escenario: «Un rol sin permisos no puede escribir».
    const { cookie, companyId } = await scenario("vacio@ejemplo.mx", { permissions: [] })

    expect((await probe(companyId, cookie)).status).toBe(403)
    expect(effects).toEqual([])
  })

  it("un miembro sin rol pierde la escritura y conserva la pertenencia", async () => {
    // Escenario del requisito «Eliminar un rol deja a sus miembros sin permisos».
    const { cookie, companyId } = await scenario("sinrol@ejemplo.mx", { withoutRole: true })

    expect((await probe(companyId, cookie)).status).toBe(403)

    const [membership] = await db
      .select({ id: companyMembers.id })
      .from(companyMembers)
      .where(eq(companyMembers.companyId, companyId))

    expect(membership).toBeDefined()
  })
})

describe("elusión del propietario", () => {
  it("un propietario con rol vacío sí puede", async () => {
    // Escenario: «El propietario actúa sin permisos explícitos».
    const { cookie, companyId } = await scenario("dueno@ejemplo.mx", {
      permissions: [],
      isOwner: true,
    })

    const response = await probe(companyId, cookie)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ reason: "owner" })
  })

  it("la elusión no alcanza a la pertenencia", async () => {
    // La spec acota la elusión **sólo** a la comprobación de permiso. Ser propietario de una
    // empresa no dice nada sobre otra, y una membresía desactivada no es pertenencia.
    const { cookie, companyId } = await scenario("dueno-inactivo@ejemplo.mx", {
      isOwner: true,
      isActive: false,
    })

    expect((await probe(companyId, cookie)).status).toBe(403)
    expect(effects).toEqual([])
  })
})

describe("administración de plataforma", () => {
  it("entra en una empresa a la que no pertenece", async () => {
    const { cookie } = await scenario("admin@ejemplo.mx", { isPlatformAdmin: true })

    // Una empresa distinta de la suya, y sin membresía en ella.
    const otherCompanyId = newId()
    await db.insert(companies).values({ id: otherCompanyId, name: "Empresa ajena" })

    const response = await probe(otherCompanyId, cookie)

    expect(response.status).toBe(200)
    // Queda marcado por qué se dejó pasar: la spec pide distinguir en la bitácora lo ejercido
    // como administración de plataforma de lo que hizo el propio cliente.
    expect(await response.json()).toEqual({ reason: "platform_admin" })
  })
})

describe("pertenencia", () => {
  it("sin membresía en la empresa, 403", async () => {
    // Es el defecto S-06: el parámetro de ruta concedía acceso a cualquier arrendatario porque
    // ningún manejador comprobaba pertenencia. Aquí el parámetro no concede nada.
    const { cookie } = await scenario("ajeno@ejemplo.mx", { withoutMembership: true })

    const otherCompanyId = newId()
    await db.insert(companies).values({ id: otherCompanyId, name: "Empresa ajena" })

    expect((await probe(otherCompanyId, cookie)).status).toBe(403)
    expect(effects).toEqual([])
  })

  it("una membresía desactivada no autoriza", async () => {
    const { cookie, companyId } = await scenario("inactivo@ejemplo.mx", {
      permissions: ["warehouses.products.create"],
      isActive: false,
    })

    expect((await probe(companyId, cookie)).status).toBe(403)
  })

  it("sin sesión, 401 y no 403", async () => {
    // El guardián corre antes: a quien no se ha identificado no se le dice qué permiso le falta.
    const otherCompanyId = newId()
    const response = await app.request(`/companies/${otherCompanyId}/probe`, { method: "POST" })

    expect(response.status).toBe(401)
    expect(effects).toEqual([])
  })
})

// ─── La declaración de la ruta ───────────────────────────────────────────────

describe("declaración", () => {
  it("una ruta con permiso y sin empresa en el camino no se puede registrar", () => {
    // Falla al cargar el módulo, no al atender la petición: una ruta mal declarada tiene que
    // romper el arranque, no esperar a que alguien la llame.
    expect(() =>
      defineRoute({
        access: REQUIRES("warehouses.products.create"),
        config: {
          method: "post",
          path: "/sin-empresa",
          summary: "No debería poder declararse",
          responses: { 200: { description: "nunca" } },
        },
        handler: (c) => c.json({}, 200),
      }),
    ).toThrow(/companyId/)
  })
})
