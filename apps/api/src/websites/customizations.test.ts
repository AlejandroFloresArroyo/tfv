/**
 * El constructor de sitios, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/site-builder/spec.md`: una personalización
 * pertenece a un sitio, sólo una es primaria, la programada sustituye a la primaria mientras dura,
 * eliminar la primaria promueve otra, el tipo desconocido se omite, ocultar conserva el contenido,
 * el orden es explícito y el destino de un botón de desplazamiento tiene que existir.
 *
 * Y la que da sentido a todas las demás: **la vista previa y lo publicado no divergen**. Se
 * comprueba comparando las dos respuestas, no leyendo el código de las dos.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  companyServices,
  companySubscriptions,
  globalCategories,
  loginAttempts,
  notificationDeliveries,
  roles,
  services,
  sessions,
  subscriptionPlans,
  users,
  warehouseCategories,
  warehouseMeasurements,
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
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${companySubscriptions}, ${subscriptionPlans}, ${websiteCustomizations}, ${websites}, ${warehouseMeasurements}, ${warehouseProducts}, ${warehouseCategories}, ${warehouseStorages}, ${warehouses}, ${globalCategories}, ${services}, ${companies} cascade`,
  )
}

function request(method: string, path: string, body?: unknown, cookie?: string) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

/** Sin cookie: es lo que ve quien abre la tienda. */
function visit(path: string) {
  return app.request(path, { method: "GET" })
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

interface SectionBody {
  kind: string
  show: boolean
  position: number
  title?: string
  description?: string
  items?: { code: string; title?: string; description?: string }[]
  buttons?: { code: string; label: string; action: string; value?: string; variant: string }[]
}

interface CustomizationBody {
  id: string
  websiteId: string
  name: string
  color: string
  isPrimary: boolean
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  sections: SectionBody[]
}

interface PageBody {
  customizationId: string | null
  name: string | null
  color: string
  bannerUrl: string | null
  sections: SectionBody[]
}

let cookie = ""
let companyId = ""
let siteId = ""
let siteSlug = ""
let base = ""
let strangerCookie = ""
let strangerCompanyId = ""

function section(kind: string, extra: Partial<SectionBody> = {}): SectionBody {
  return { kind, show: true, position: 0, ...extra }
}

beforeAll(async () => {
  await reset()

  const [plan] = await db
    .insert(subscriptionPlans)
    .values({ id: newId(), tier: 1, title: "Plan de prueba" })
    .returning()

  cookie = await signIn("constructor@ejemplo.mx")
  companyId = (
    await json<{ id: string }>(
      await request("POST", "/companies", { name: "Renta del Golfo" }, cookie),
    )
  ).id
  await enable(companyId, "warehouses")
  await enable(companyId, "websites")
  await db.insert(companySubscriptions).values({
    id: newId(),
    companyId,
    planId: plan?.id ?? "",
    status: "active",
    interval: "month",
  })

  const warehouseId = (
    await json<{ id: string }>(
      await request("POST", `/companies/${companyId}/warehouses`, { name: "Nave uno" }, cookie),
    )
  ).id

  const verticalId = newId()
  await db.insert(globalCategories).values({
    id: verticalId,
    name: "Tienda de almacén",
    keyname: "warehouse-store",
  })

  const site = await json<{ id: string; slug: string }>(
    await request(
      "POST",
      `/companies/${companyId}/websites`,
      { name: "Golfo Rental", warehouseId, categoryId: verticalId, isPublished: true },
      cookie,
    ),
  )
  siteId = site.id
  siteSlug = site.slug
  base = `/companies/${companyId}/websites/${siteId}/customizations`

  strangerCookie = await signIn("ajena@ejemplo.mx")
  strangerCompanyId = (
    await json<{ id: string }>(
      await request("POST", "/companies", { name: "Otra" }, strangerCookie),
    )
  ).id
  await enable(strangerCompanyId, "websites")
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

/** Deja el sitio con una única personalización primaria, recién creada. */
async function onlyOne(): Promise<CustomizationBody> {
  const existing = await json<{ items: CustomizationBody[] }>(
    await request("GET", base, undefined, cookie),
  )
  for (const entry of existing.items) {
    await request("DELETE", `${base}/${entry.id}`, undefined, cookie)
  }

  return json<CustomizationBody>(await request("POST", base, { name: "Tema base" }, cookie))
}

describe("una personalización pertenece a un sitio", () => {
  it("se crea con su nombre y su color, y trae secciones de ejemplo de su vertical", async () => {
    const response = await request("POST", base, { name: "Tema base", color: "#123456" }, cookie)

    expect(response.status).toBe(201)
    const created = await json<CustomizationBody>(response)
    expect(created.name).toBe("Tema base")
    expect(created.color).toBe("#123456")
    expect(created.websiteId).toBe(siteId)
    // «Un sitio nuevo nace con secciones» — un conjunto adecuado a la vertical de almacén.
    expect(created.sections.length).toBeGreaterThan(0)
    expect(created.sections.some((entry) => entry.kind === "products")).toBe(true)
    expect(created.sections.map((entry) => entry.position)).toEqual(
      created.sections.map((_, index) => index),
    )

    await request("DELETE", `${base}/${created.id}`, undefined, cookie)
  })

  it("el sitio de otra empresa no existe para quien pregunta", async () => {
    const response = await request(
      "GET",
      `/companies/${strangerCompanyId}/websites/${siteId}/customizations`,
      undefined,
      strangerCookie,
    )

    expect(response.status).toBe(404)
  })
})

describe("sólo una primaria por sitio", () => {
  it("la primera personalización de un sitio queda marcada como primaria", async () => {
    const first = await onlyOne()
    expect(first.isPrimary).toBe(true)
    await request("DELETE", `${base}/${first.id}`, undefined, cookie)
  })

  it("marcar una desmarca la anterior", async () => {
    const a = await onlyOne()
    const b = await json<CustomizationBody>(await request("POST", base, { name: "B" }, cookie))
    expect(b.isPrimary).toBe(false)

    const marked = await json<CustomizationBody>(
      await request("PATCH", `${base}/${b.id}`, { isPrimary: true }, cookie),
    )
    expect(marked.isPrimary).toBe(true)

    const again = await json<CustomizationBody>(
      await request("GET", `${base}/${a.id}`, undefined, cookie),
    )
    expect(again.isPrimary).toBe(false)
  })

  it("desmarcar la única primaria a mano no se admite: el sitio se quedaría sin tema", async () => {
    const primary = await onlyOne()
    const response = await request("PATCH", `${base}/${primary.id}`, { isPrimary: false }, cookie)

    expect(response.status).toBe(422)
  })
})

describe("personalizaciones programadas", () => {
  it("la campaña vigente sustituye al tema primario, y se retira sola", async () => {
    const primary = await onlyOne()
    await request("PATCH", `${base}/${primary.id}`, { color: "#111111" }, cookie)

    const start = new Date(Date.now() - 60_000).toISOString()
    const end = new Date(Date.now() + 60_000).toISOString()
    const campaign = await json<CustomizationBody>(
      await request(
        "POST",
        base,
        { name: "Diciembre", color: "#ff0000", startsAt: start, endsAt: end },
        cookie,
      ),
    )

    const during = await json<PageBody>(await visit(`/public/sites/${siteSlug}/page`))
    expect(during.customizationId).toBe(campaign.id)
    expect(during.color).toBe("#ff0000")

    // Se retira sola: nadie desactiva nada, sólo pasa la fecha de fin.
    await db
      .update(websiteCustomizations)
      .set({ endsAt: new Date(Date.now() - 30_000) })
      .where(eq(websiteCustomizations.id, campaign.id))

    const after = await json<PageBody>(await visit(`/public/sites/${siteSlug}/page`))
    expect(after.customizationId).toBe(primary.id)
    expect(after.color).toBe("#111111")
  })

  it("la vigente se señala en el listado, para que el constructor sepa cuál se está sirviendo", async () => {
    const primary = await onlyOne()
    const list = await json<{ items: CustomizationBody[] }>(
      await request("GET", base, undefined, cookie),
    )

    expect(list.items.find((entry) => entry.id === primary.id)?.isActive).toBe(true)
  })

  it("una ventana que termina antes de empezar se rechaza", async () => {
    await onlyOne()
    const response = await request(
      "POST",
      base,
      {
        name: "Imposible",
        startsAt: "2026-12-31T00:00:00.000Z",
        endsAt: "2026-12-01T00:00:00.000Z",
      },
      cookie,
    )

    expect(response.status).toBe(422)
  })
})

describe("eliminar la primaria promueve otra", () => {
  it("con tres personalizaciones, eliminar la primaria deja otra marcada", async () => {
    const primary = await onlyOne()
    const second = await json<CustomizationBody>(
      await request("POST", base, { name: "Segunda" }, cookie),
    )
    const third = await json<CustomizationBody>(
      await request("POST", base, { name: "Tercera" }, cookie),
    )

    expect((await request("DELETE", `${base}/${primary.id}`, undefined, cookie)).status).toBe(204)

    const list = await json<{ items: CustomizationBody[] }>(
      await request("GET", base, undefined, cookie),
    )
    const primaries = list.items.filter((entry) => entry.isPrimary)
    expect(primaries).toHaveLength(1)
    expect([second.id, third.id]).toContain(primaries[0]?.id)
  })

  it("eliminar la última no deja nada que promover, y no falla", async () => {
    const only = await onlyOne()
    expect((await request("DELETE", `${base}/${only.id}`, undefined, cookie)).status).toBe(204)

    const list = await json<{ items: CustomizationBody[] }>(
      await request("GET", base, undefined, cookie),
    )
    expect(list.items).toHaveLength(0)
  })

  it("eliminar una personalización no da de baja el sitio", async () => {
    // El defecto C-09 de la implementación anterior: `website/customize/delete.ts` borraba de la
    // colección de sitios en vez de la de personalizaciones.
    const only = await onlyOne()
    await request("DELETE", `${base}/${only.id}`, undefined, cookie)

    const site = await request(
      "GET",
      `/companies/${companyId}/websites/${siteId}`,
      undefined,
      cookie,
    )
    expect(site.status).toBe(200)
  })
})

describe("contenido de una sección", () => {
  it("se edita el título y los elementos, y el sitio los refleja", async () => {
    const custom = await onlyOne()
    const sections = [
      section("faq", {
        title: "Preguntas",
        items: [{ code: "a", title: "¿Entregan?", description: "Sí" }],
      }),
    ]

    await request("PATCH", `${base}/${custom.id}`, { sections }, cookie)

    const page = await json<PageBody>(await visit(`/public/sites/${siteSlug}/page`))
    expect(page.sections).toHaveLength(1)
    expect(page.sections[0]?.title).toBe("Preguntas")
    expect(page.sections[0]?.items?.[0]?.title).toBe("¿Entregan?")
  })

  it("ocultar conserva el contenido, y volver a mostrar lo devuelve entero", async () => {
    const custom = await onlyOne()
    const faq = section("faq", {
      title: "Preguntas",
      items: [{ code: "a", title: "¿Entregan?", description: "Sí" }],
    })

    await request("PATCH", `${base}/${custom.id}`, { sections: [faq] }, cookie)
    const hidden = await json<CustomizationBody>(
      await request(
        "PATCH",
        `${base}/${custom.id}`,
        { sections: [{ ...faq, show: false }] },
        cookie,
      ),
    )

    expect(hidden.sections[0]?.items?.[0]?.title).toBe("¿Entregan?")
    // Oculta no se renderiza en el sitio público.
    const page = await json<PageBody>(await visit(`/public/sites/${siteSlug}/page`))
    expect(page.sections).toHaveLength(0)

    const shown = await json<CustomizationBody>(
      await request("PATCH", `${base}/${custom.id}`, { sections: [faq] }, cookie),
    )
    expect(shown.sections[0]?.items?.[0]?.description).toBe("Sí")
  })

  it("un tipo desconocido se guarda, se omite al renderizar y no rompe la página", async () => {
    const custom = await onlyOne()
    await request(
      "PATCH",
      `${base}/${custom.id}`,
      {
        sections: [
          section("hero", { title: "Hola" }),
          section("carrusel-de-la-suerte", { title: "De la pila anterior" }),
          section("faq", { title: "Preguntas" }),
        ],
      },
      cookie,
    )

    const page = await json<PageBody>(await visit(`/public/sites/${siteSlug}/page`))
    expect(page.sections.map((entry) => entry.kind)).toEqual(["hero", "faq"])
  })
})

describe("orden de las secciones", () => {
  it("reordenar cambia lo que sirve el sitio", async () => {
    const custom = await onlyOne()
    await request(
      "PATCH",
      `${base}/${custom.id}`,
      { sections: [section("products"), section("testimonials")] },
      cookie,
    )

    const before = await json<PageBody>(await visit(`/public/sites/${siteSlug}/page`))
    expect(before.sections.map((entry) => entry.kind)).toEqual(["products", "testimonials"])

    // La sección de testimonios por encima de la de productos.
    await request(
      "PATCH",
      `${base}/${custom.id}`,
      { sections: [section("testimonials"), section("products")] },
      cookie,
    )

    const after = await json<PageBody>(await visit(`/public/sites/${siteSlug}/page`))
    expect(after.sections.map((entry) => entry.kind)).toEqual(["testimonials", "products"])
  })

  it("las posiciones se numeran por el orden recibido, no por el que traiga el cuerpo", async () => {
    const custom = await onlyOne()
    const saved = await json<CustomizationBody>(
      await request(
        "PATCH",
        `${base}/${custom.id}`,
        {
          sections: [
            section("faq", { position: 99 }),
            section("hero", { position: 99 }),
            section("about", { position: 3 }),
          ],
        },
        cookie,
      ),
    )

    expect(saved.sections.map((entry) => [entry.kind, entry.position])).toEqual([
      ["faq", 0],
      ["hero", 1],
      ["about", 2],
    ])
  })
})

describe("tipos de acción de los botones", () => {
  it("un botón de desplazamiento hacia una sección presente se acepta", async () => {
    const custom = await onlyOne()
    const response = await request(
      "PATCH",
      `${base}/${custom.id}`,
      {
        sections: [
          section("hero", {
            buttons: [
              { code: "a", label: "Preguntas", action: "scroll", value: "faq", variant: "filled" },
            ],
          }),
          section("faq"),
        ],
      },
      cookie,
    )

    expect(response.status).toBe(200)
  })

  it("un destino que no está en la personalización se rechaza, y se dice cuál", async () => {
    const custom = await onlyOne()
    const response = await request(
      "PATCH",
      `${base}/${custom.id}`,
      {
        sections: [
          section("hero", {
            buttons: [
              { code: "a", label: "Preguntas", action: "scroll", value: "faq", variant: "filled" },
            ],
          }),
        ],
      },
      cookie,
    )

    expect(response.status).toBe(422)
    expect(await response.text()).toContain("faq")
  })
})

describe("la vista previa y lo publicado no divergen", () => {
  it("la portada pública y la vista previa del constructor devuelven lo mismo", async () => {
    const custom = await onlyOne()
    await request(
      "PATCH",
      `${base}/${custom.id}`,
      {
        color: "#00aa88",
        sections: [
          section("hero", { title: "Equipo listo" }),
          section("carrusel-de-la-suerte", { title: "Se omite en las dos" }),
          section("faq", { title: "Preguntas", show: false }),
          section("products", { title: "Lo más pedido" }),
        ],
      },
      cookie,
    )

    const publicPage = await json<PageBody>(await visit(`/public/sites/${siteSlug}/page`))
    const preview = await json<PageBody>(
      await request("GET", `/companies/${companyId}/websites/${siteId}/page`, undefined, cookie),
    )

    expect(preview).toEqual(publicPage)
    expect(publicPage.sections.map((entry) => entry.kind)).toEqual(["hero", "products"])
  })

  it("la vista previa alcanza un sitio despublicado; la pública, no", async () => {
    await onlyOne()
    await request(
      "PATCH",
      `/companies/${companyId}/websites/${siteId}`,
      { isPublished: false },
      cookie,
    )

    expect((await visit(`/public/sites/${siteSlug}/page`)).status).toBe(404)
    expect(
      (await request("GET", `/companies/${companyId}/websites/${siteId}/page`, undefined, cookie))
        .status,
    ).toBe(200)

    await request(
      "PATCH",
      `/companies/${companyId}/websites/${siteId}`,
      { isPublished: true },
      cookie,
    )
  })

  it("la vista previa puede pedir una personalización concreta, aunque no sea la vigente", async () => {
    const primary = await onlyOne()
    const other = await json<CustomizationBody>(
      await request("POST", base, { name: "Borrador", color: "#abcdef" }, cookie),
    )

    const page = await json<PageBody>(
      await request(
        "GET",
        `/companies/${companyId}/websites/${siteId}/page?customizationId=${other.id}`,
        undefined,
        cookie,
      ),
    )

    expect(page.customizationId).toBe(other.id)
    expect(page.color).toBe("#abcdef")

    const live = await json<PageBody>(
      await request("GET", `/companies/${companyId}/websites/${siteId}/page`, undefined, cookie),
    )
    expect(live.customizationId).toBe(primary.id)
  })

  it("un sitio sin personalizaciones sirve una página sin secciones, y no un error", async () => {
    const existing = await json<{ items: CustomizationBody[] }>(
      await request("GET", base, undefined, cookie),
    )
    for (const entry of existing.items) {
      await request("DELETE", `${base}/${entry.id}`, undefined, cookie)
    }

    const page = await json<PageBody>(await visit(`/public/sites/${siteSlug}/page`))
    expect(page.customizationId).toBeNull()
    expect(page.sections).toEqual([])
  })
})
