/**
 * Sitios de una empresa, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/websites/spec.md`: un sitio pertenece a una
 * empresa, su identificador legible es único en toda la plataforma, su dirección se deriva, y
 * eliminarlo conserva la fuente y libera el identificador.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  companyServices,
  globalCategories,
  loginAttempts,
  notificationDeliveries,
  roles,
  services,
  sessions,
  users,
  warehouseCategories,
  warehouseProducts,
  warehouseStorages,
  warehouses,
  websiteCustomizations,
  websites,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${websiteCustomizations}, ${websites}, ${warehouseProducts}, ${warehouseCategories}, ${warehouseStorages}, ${warehouses}, ${globalCategories}, ${services}, ${companies} cascade`,
  )
}

function request(method: string, path: string, body?: unknown, cookie?: string) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function signIn(email: string): Promise<string> {
  await request("POST", "/auth/register", { email, password: PASSWORD, name: "Quien sea" })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const login = await request("POST", "/auth/login", { email, password: PASSWORD })
  return (
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""
  )
}

async function enable(companyId: string, keycode: string) {
  const [service] = await db.select().from(services).where(eq(services.keycode, keycode))
  const serviceId = service?.id ?? newId()
  if (!service) await db.insert(services).values({ id: serviceId, keycode, name: keycode })
  await db.insert(companyServices).values({ id: newId(), companyId, serviceId })
}

interface SiteBody {
  id: string
  slug: string
  name: string
  isPublished: boolean
  warehouseId: string | null
  subdomain: string
  address: string
  vertical: string
}

let cookie = ""
let companyId = ""
let warehouseId = ""
let otherCookie = ""
let otherCompanyId = ""
let otherWarehouseId = ""
let warehouseVerticalId = ""

beforeAll(async () => {
  await reset()

  cookie = await signIn("sitios@ejemplo.mx")
  companyId = (
    await json<{ id: string }>(
      await request("POST", "/companies", { name: "Renta del Sur" }, cookie),
    )
  ).id
  await enable(companyId, "warehouses")
  await enable(companyId, "websites")

  warehouseId = (
    await json<{ id: string }>(
      await request("POST", `/companies/${companyId}/warehouses`, { name: "Nave uno" }, cookie),
    )
  ).id

  otherCookie = await signIn("ajena@ejemplo.mx")
  otherCompanyId = (
    await json<{ id: string }>(
      await request("POST", "/companies", { name: "Casa Ajena" }, otherCookie),
    )
  ).id
  await enable(otherCompanyId, "warehouses")
  await enable(otherCompanyId, "websites")
  otherWarehouseId = (
    await json<{ id: string }>(
      await request(
        "POST",
        `/companies/${otherCompanyId}/warehouses`,
        { name: "Nave ajena" },
        otherCookie,
      ),
    )
  ).id

  // La vertical se declara con la categoría del sitio, y la categoría la reconoce el código por su
  // clave estable. Ver `packages/contracts/src/storefront.ts`.
  warehouseVerticalId = newId()
  await db.insert(globalCategories).values({
    id: warehouseVerticalId,
    name: "Tienda de almacén",
    keyname: "warehouse-store",
  })
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

describe("un sitio pertenece a una empresa", () => {
  it("se crea vinculado a un almacén y queda registrado con esa fuente", async () => {
    const response = await request(
      "POST",
      `/companies/${companyId}/websites`,
      { name: "Renta del Sur", warehouseId, categoryId: warehouseVerticalId },
      cookie,
    )

    expect(response.status).toBe(201)
    const site = await json<SiteBody>(response)
    expect(site.warehouseId).toBe(warehouseId)
    expect(site.slug).toBe("renta-del-sur")
    expect(site.isPublished).toBe(false)
    expect(site.vertical).toBe("warehouse")
  })

  it("no puede referenciar el almacén de otra empresa", async () => {
    const response = await request(
      "POST",
      `/companies/${companyId}/websites`,
      { name: "Sitio tramposo", warehouseId: otherWarehouseId },
      cookie,
    )

    expect(response.status).toBe(404)
  })

  it("una empresa sin el servicio de sitios no puede crear ninguno", async () => {
    const sinServicio = await signIn("sin-servicio@ejemplo.mx")
    const sinServicioId = (
      await json<{ id: string }>(
        await request("POST", "/companies", { name: "Sin Servicio" }, sinServicio),
      )
    ).id

    const response = await request(
      "POST",
      `/companies/${sinServicioId}/websites`,
      { name: "No debería" },
      sinServicio,
    )

    expect(response.status).toBe(422)
  })
})

describe("el identificador legible es único en toda la plataforma", () => {
  it("se puede comprobar si está libre antes de guardar", async () => {
    const libre = await json<{ available: boolean }>(
      await request(
        "GET",
        `/companies/${companyId}/websites/slug-available?slug=nadie-lo-usa`,
        undefined,
        cookie,
      ),
    )
    expect(libre.available).toBe(true)

    const ocupado = await json<{ available: boolean }>(
      await request(
        "GET",
        `/companies/${companyId}/websites/slug-available?slug=renta-del-sur`,
        undefined,
        cookie,
      ),
    )
    expect(ocupado.available).toBe(false)
  })

  /**
   * El identificador no se acota por empresa: **es el subdominio**, y ahí no hay empresa que lo
   * acote. Por eso lo comprueba una empresa distinta de la que lo ocupó.
   */
  it("uno ya usado se rechaza con 409, aunque sea de otra empresa", async () => {
    const response = await request(
      "PATCH",
      `/companies/${otherCompanyId}/websites/${await siteOf(otherCompanyId, otherCookie, "Casa Ajena")}`,
      { slug: "renta-del-sur" },
      otherCookie,
    )

    expect(response.status).toBe(409)
  })
})

describe("la dirección pública se deriva del identificador", () => {
  it("el sitio expone su subdominio y su dirección completa", async () => {
    const sites = await json<{ items: SiteBody[] }>(
      await request("GET", `/companies/${companyId}/websites`, undefined, cookie),
    )
    const site = sites.items.find((row) => row.slug === "renta-del-sur")

    expect(site?.subdomain).toBe("renta-del-sur")
    expect(site?.address).toContain("renta-del-sur.")
  })
})

describe("eliminación", () => {
  it("la fuente sobrevive al sitio y el identificador queda libre", async () => {
    const created = await json<SiteBody>(
      await request(
        "POST",
        `/companies/${companyId}/websites`,
        { name: "Efímero", warehouseId },
        cookie,
      ),
    )

    const deleted = await request(
      "DELETE",
      `/companies/${companyId}/websites/${created.id}`,
      undefined,
      cookie,
    )
    expect(deleted.status).toBe(204)

    // El almacén sigue intacto.
    const warehouse = await request(
      "GET",
      `/companies/${companyId}/warehouses/${warehouseId}`,
      undefined,
      cookie,
    )
    expect(warehouse.status).toBe(200)

    // Y su identificador vuelve a estar libre.
    const again = await request(
      "POST",
      `/companies/${companyId}/websites`,
      { name: "Efímero", warehouseId },
      cookie,
    )
    expect(again.status).toBe(201)
    expect((await json<SiteBody>(again)).slug).toBe("efimero")
  })
})

/** Crea un sitio para la empresa dada si aún no tiene ninguno, y devuelve su identificador. */
async function siteOf(company: string, session: string, name: string): Promise<string> {
  const sites = await json<{ items: SiteBody[] }>(
    await request("GET", `/companies/${company}/websites`, undefined, session),
  )
  const first = sites.items[0]
  if (first) return first.id

  const created = await json<SiteBody>(
    await request("POST", `/companies/${company}/websites`, { name }, session),
  )
  return created.id
}
