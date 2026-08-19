/**
 * La tienda pública, de extremo a extremo y **sin sesión**.
 *
 * Transcritas de los escenarios de `openspec/specs/websites/spec.md` —las tres compuertas, la
 * vertical, «sólo se publica lo que la fuente publica»— y de `public-storefronts/spec.md` —la
 * ficha, y «la tienda no expone datos de gestión»—.
 *
 * Ninguna petición de este archivo lleva cookie. Es la propiedad que se comprueba: todo lo que se
 * ve aquí lo ve cualquiera.
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

/** Sin cookie, siempre. Es lo que este archivo comprueba. */
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

let planId = ""

/** Deja a la empresa con una suscripción del estado pedido. Ver la compuerta dos. */
async function subscribe(companyId: string, status: "active" | "unpaid" | "canceled") {
  await db.insert(companySubscriptions).values({
    id: newId(),
    companyId,
    planId,
    status,
    interval: "month",
  })
}

interface StorefrontBody {
  status: string
  reason?: string
  site?: {
    slug: string
    name: string
    description: string
    vertical: string
    logoUrl: string | null
    iconUrl: string | null
    categories: { id: string; name: string; parentId: string | null }[]
  }
}

interface ProductCard {
  id: string
  slug: string | null
  name: string
  price: string | null
  coverUrl: string | null
  [key: string]: unknown
}

let cookie = ""
let companyId = ""
let warehouseId = ""
let publishedId = ""
let publishedSlug = ""
let unpublishedId = ""
let unpublishedSlug = ""
let provisionalId = ""
let variantId = ""
let hiddenVariantId = ""
let categoryRootId = ""
let categoryLeafId = ""
let otherWarehouseProductId = ""

beforeAll(async () => {
  await reset()

  const [plan] = await db
    .insert(subscriptionPlans)
    .values({ id: newId(), tier: 1, title: "Plan de prueba" })
    .returning()
  planId = plan?.id ?? ""

  cookie = await signIn("tienda@ejemplo.mx")
  companyId = (
    await json<{ id: string }>(await request("POST", "/companies", { name: "Renta Norte" }, cookie))
  ).id
  await enable(companyId, "warehouses")
  await enable(companyId, "websites")
  await subscribe(companyId, "active")

  warehouseId = (
    await json<{ id: string }>(
      await request("POST", `/companies/${companyId}/warehouses`, { name: "Nave uno" }, cookie),
    )
  ).id

  const base = `/companies/${companyId}/warehouses/${warehouseId}`

  const root = await json<{ id: string }>(
    await request("POST", `${base}/categories`, { name: "Iluminación" }, cookie),
  )
  categoryRootId = root.id
  const leaf = await json<{ id: string }>(
    await request(
      "POST",
      `${base}/categories`,
      { name: "Paneles LED", parentId: categoryRootId },
      cookie,
    ),
  )
  categoryLeafId = leaf.id

  const published = await json<{ id: string; slug: string }>(
    await request(
      "POST",
      `${base}/products`,
      {
        name: "Panel LED bicolor",
        description: "Con maleta y dos baterías",
        price: "1250.00",
        cost: "800.00",
        availableForSale: true,
        isPublished: true,
        categoryId: categoryLeafId,
        measurements: [{ name: "Cuerpo" }],
      },
      cookie,
    ),
  )
  publishedId = published.id
  publishedSlug = published.slug

  const unpublished = await json<{ id: string; slug: string }>(
    await request(
      "POST",
      `${base}/products`,
      { name: "Tripié pesado", price: "400.00", availableForSale: true, isPublished: false },
      cookie,
    ),
  )
  unpublishedId = unpublished.id
  unpublishedSlug = unpublished.slug

  const provisional = await json<{ id: string }>(
    await request(
      "POST",
      `${base}/products`,
      { name: "Cámara sin dar de alta", isProvisional: true, measurements: [{ name: "Cuerpo" }] },
      cookie,
    ),
  )
  provisionalId = provisional.id

  const variant = await json<{ id: string }>(
    await request(
      "POST",
      `${base}/products/${publishedId}/children`,
      { relation: "variant", name: "Panel LED bicolor · kit doble", price: "2300.00" },
      cookie,
    ),
  )
  variantId = variant.id
  await request(
    "PATCH",
    `${base}/products/${variantId}`,
    { isPublished: true, availableForSale: true },
    cookie,
  )

  const hidden = await json<{ id: string }>(
    await request(
      "POST",
      `${base}/products/${publishedId}/children`,
      { relation: "variant", name: "Panel LED bicolor · prototipo", price: "9900.00" },
      cookie,
    ),
  )
  hiddenVariantId = hidden.id

  // Un segundo almacén de la **misma** empresa, con un producto publicado. La tienda de uno no
  // puede enseñar el catálogo del otro: la fuente es un almacén, no la empresa.
  const otherWarehouseId = (
    await json<{ id: string }>(
      await request("POST", `/companies/${companyId}/warehouses`, { name: "Nave dos" }, cookie),
    )
  ).id
  otherWarehouseProductId = (
    await json<{ id: string }>(
      await request(
        "POST",
        `/companies/${companyId}/warehouses/${otherWarehouseId}/products`,
        { name: "Grúa de la otra nave", price: "5000.00", isPublished: true },
        cookie,
      ),
    )
  ).id

  const vertical = newId()
  await db
    .insert(globalCategories)
    .values({ id: vertical, name: "Tienda de almacén", keyname: "warehouse-store" })

  await request(
    "POST",
    `/companies/${companyId}/websites`,
    {
      name: "Renta Norte",
      description: "Equipo de cine en Monterrey",
      warehouseId,
      categoryId: vertical,
      isPublished: true,
    },
    cookie,
  )

  // Un sitio existente y **sin publicar**, para la primera compuerta.
  await request(
    "POST",
    `/companies/${companyId}/websites`,
    { name: "Borrador", warehouseId, categoryId: vertical },
    cookie,
  )

  // Un sitio publicado con una categoría que no es ninguna vertical conocida.
  const rara = newId()
  await db.insert(globalCategories).values({ id: rara, name: "Otra cosa", keyname: "otra-cosa" })
  await request(
    "POST",
    `/companies/${companyId}/websites`,
    { name: "Sin decidir", categoryId: rara, isPublished: true },
    cookie,
  )
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

describe("compuerta uno · el sitio existe y está publicado", () => {
  it("un subdominio sin sitio responde 404", async () => {
    expect((await visit("/public/sites/nadie-vive-aqui")).status).toBe(404)
  })

  /**
   * «Se comporta como inexistente **y no revela que el sitio exista**». Las dos respuestas tienen
   * que ser indistinguibles: el mismo código y el mismo cuerpo.
   */
  it("un sitio despublicado no se distingue de uno inexistente", async () => {
    const despublicado = await visit("/public/sites/borrador")
    const inexistente = await visit("/public/sites/nadie-vive-aqui")

    expect(despublicado.status).toBe(404)
    expect(await despublicado.text()).toBe(await inexistente.text())
  })

  it("un sitio publicado se sirve con su identidad", async () => {
    const body = await json<StorefrontBody>(await visit("/public/sites/renta-norte"))

    expect(body.status).toBe("ready")
    expect(body.site?.name).toBe("Renta Norte")
    expect(body.site?.vertical).toBe("warehouse")
  })
})

describe("compuerta dos · la suscripción de la empresa está vigente", () => {
  it("una suscripción no vigente tumba la tienda con su propio motivo, y sin catálogo", async () => {
    await db
      .update(companySubscriptions)
      .set({ status: "unpaid" })
      .where(eq(companySubscriptions.companyId, companyId))

    const body = await json<StorefrontBody>(await visit("/public/sites/renta-norte"))
    expect(body.status).toBe("unavailable")
    expect(body.reason).toBe("subscription")
    expect(body.site).toBeUndefined()

    // Y el catálogo tampoco se sirve por su cuenta: la compuerta no es de una sola página.
    expect((await visit("/public/sites/renta-norte/products")).status).toBe(404)

    await db
      .update(companySubscriptions)
      .set({ status: "active" })
      .where(eq(companySubscriptions.companyId, companyId))
  })
})

describe("compuerta tres · la empresa tiene el servicio habilitado", () => {
  it("sin el servicio de sitios la tienda no se sirve, y el motivo es otro", async () => {
    const [service] = await db.select().from(services).where(eq(services.keycode, "websites"))
    await db.delete(companyServices).where(eq(companyServices.serviceId, service?.id ?? ""))

    const body = await json<StorefrontBody>(await visit("/public/sites/renta-norte"))
    expect(body.status).toBe("unavailable")
    expect(body.reason).toBe("service")

    expect((await visit("/public/sites/renta-norte/products")).status).toBe(404)

    await db
      .insert(companyServices)
      .values({ id: newId(), companyId, serviceId: service?.id ?? "" })
  })
})

describe("la vertical decide qué páginas se sirven", () => {
  it("una categoría desconocida no rompe: se sirve en construcción", async () => {
    const body = await json<StorefrontBody>(await visit("/public/sites/sin-decidir"))

    expect(body.status).toBe("ready")
    expect(body.site?.vertical).toBe("under-construction")
  })

  it("un sitio en construcción no tiene catálogo que servir", async () => {
    expect((await visit("/public/sites/sin-decidir/products")).status).toBe(404)
  })
})

describe("el catálogo público es la intersección de lo publicado", () => {
  it("enseña lo publicado y calla lo demás", async () => {
    const page = await json<{ items: ProductCard[]; totalItems: number }>(
      await visit("/public/sites/renta-norte/products"),
    )

    const ids = page.items.map((item) => item.id)
    expect(ids).toContain(publishedId)
    expect(ids).not.toContain(unpublishedId)
    expect(ids).not.toContain(provisionalId)
    // Sólo los productos raíz: una variante no es un elemento suelto del catálogo.
    expect(ids).not.toContain(variantId)
    // Y el catálogo del otro almacén de la misma empresa tampoco es de esta tienda.
    expect(ids).not.toContain(otherWarehouseProductId)
  })

  it("despublicar un producto lo retira de la tienda sin tocar el sitio", async () => {
    const base = `/companies/${companyId}/warehouses/${warehouseId}`
    await request("PATCH", `${base}/products/${publishedId}`, { isPublished: false }, cookie)

    const retirado = await json<{ items: ProductCard[] }>(
      await visit("/public/sites/renta-norte/products"),
    )
    expect(retirado.items.map((item) => item.id)).not.toContain(publishedId)

    await request("PATCH", `${base}/products/${publishedId}`, { isPublished: true }, cookie)
  })

  it("se busca por texto", async () => {
    const page = await json<{ items: ProductCard[] }>(
      await visit("/public/sites/renta-norte/products?search=bicolor"),
    )
    expect(page.items.map((item) => item.id)).toEqual([publishedId])

    const nada = await json<{ items: ProductCard[] }>(
      await visit("/public/sites/renta-norte/products?search=nolohay"),
    )
    expect(nada.items).toEqual([])
  })

  /** «Filtrar por una categoría SHALL incluir sus descendientes». */
  it("filtrar por la categoría raíz trae lo de todo el subárbol", async () => {
    const page = await json<{ items: ProductCard[] }>(
      await visit(`/public/sites/renta-norte/products?categoryId=${categoryRootId}`),
    )
    expect(page.items.map((item) => item.id)).toEqual([publishedId])
  })

  it("la ficha del listado no lleva nada de la trastienda", async () => {
    const page = await json<{ items: ProductCard[] }>(
      await visit("/public/sites/renta-norte/products"),
    )
    const card = page.items.find((item) => item.id === publishedId)

    expect(card?.price).toBe("1250.00")
    for (const oculto of ["cost", "storageId", "responsibleId", "internalCode", "isProvisional"]) {
      expect(card, oculto).not.toHaveProperty(oculto)
    }
  })
})

describe("la ficha de producto", () => {
  it("se alcanza por su identificador y por su identificador legible", async () => {
    const porId = await json<{ id: string; name: string }>(
      await visit(`/public/sites/renta-norte/products/${publishedId}`),
    )
    const porSlug = await json<{ id: string; name: string }>(
      await visit(`/public/sites/renta-norte/products/${publishedSlug}`),
    )

    expect(porId.id).toBe(publishedId)
    expect(porSlug.id).toBe(publishedId)
  })

  /**
   * Lo que pidió el encargo con todas sus letras: **escribiendo la dirección a mano**. Un producto
   * que no está publicado no existe para quien no tiene sesión, por ninguna de las dos vías.
   */
  it("un producto despublicado no se alcanza ni escribiendo su dirección", async () => {
    expect((await visit(`/public/sites/renta-norte/products/${unpublishedId}`)).status).toBe(404)
    expect((await visit(`/public/sites/renta-norte/products/${unpublishedSlug}`)).status).toBe(404)
  })

  it("un producto provisional tampoco, porque no se publica nunca", async () => {
    expect((await visit(`/public/sites/renta-norte/products/${provisionalId}`)).status).toBe(404)
  })

  it("un producto publicado de otro almacén de la misma empresa no es de esta tienda", async () => {
    expect(
      (await visit(`/public/sites/renta-norte/products/${otherWarehouseProductId}`)).status,
    ).toBe(404)
  })

  it("trae su precio de venta y sus variantes publicadas", async () => {
    const ficha = await json<{
      price: string | null
      variants: { id: string }[]
      images: unknown[]
      measurements: { name: string }[]
    }>(await visit(`/public/sites/renta-norte/products/${publishedId}`))

    expect(ficha.price).toBe("1250.00")
    expect(ficha.variants.map((variant) => variant.id)).toEqual([variantId])
    expect(ficha.variants.map((variant) => variant.id)).not.toContain(hiddenVariantId)
    expect(ficha.measurements.map((measurement) => measurement.name)).toEqual(["Cuerpo"])
  })

  it("no enseña el costo ni dónde está guardado", async () => {
    const ficha = (await json(
      await visit(`/public/sites/renta-norte/products/${publishedId}`),
    )) as Record<string, unknown>

    for (const oculto of ["cost", "storageId", "responsibleId", "internalCode", "warehouseId"]) {
      expect(ficha, oculto).not.toHaveProperty(oculto)
    }
  })
})
