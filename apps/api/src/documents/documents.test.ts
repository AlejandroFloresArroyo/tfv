/**
 * Documentos generados, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/pdf-documents/spec.md`: los datos vigentes, el
 * enlace público de sólo lectura y el contenido de la cotización.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId, type QuoteDocument } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  companyServices,
  counterparties,
  loginAttempts,
  notificationDeliveries,
  roles,
  services,
  sessions,
  users,
  warehouseCategories,
  warehouseMeasurements,
  warehousePriceLists,
  warehouseProductPrices,
  warehouseProducts,
  warehouseQuoteLines,
  warehouseQuotes,
  warehouseStockEvents,
  warehouseStockReservations,
  warehouseStockUnits,
  warehouseStorages,
  warehouses,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${counterparties}, ${warehouseStockReservations}, ${warehouseQuoteLines}, ${warehouseQuotes}, ${warehouseStockEvents}, ${warehouseStockUnits}, ${warehouseMeasurements}, ${warehouseProductPrices}, ${warehousePriceLists}, ${warehouseProducts}, ${warehouseCategories}, ${warehouseStorages}, ${warehouses}, ${services}, ${companies} cascade`,
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

let cookie = ""
let companyId = ""
let warehouseId = ""
let clientId = ""
let base = ""

beforeAll(async () => {
  await reset()

  const email = "documentos@ejemplo.mx"
  await request("POST", "/auth/register", { email, password: PASSWORD, name: "Documentos" })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const login = await request("POST", "/auth/login", { email, password: PASSWORD })
  cookie =
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""

  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name: "Renta del Norte" }, cookie),
  )
  companyId = company.id

  const serviceId = newId()
  await db.insert(services).values({ id: serviceId, keycode: "warehouses", name: "Almacenes" })
  await db.insert(companyServices).values({ id: newId(), companyId, serviceId })

  const warehouse = await json<{ id: string }>(
    await request("POST", `/companies/${companyId}/warehouses`, { name: "Nave central" }, cookie),
  )
  warehouseId = warehouse.id
  base = `/companies/${companyId}/warehouses/${warehouseId}`

  const client = await json<{ id: string }>(
    await request(
      "POST",
      `/companies/${companyId}/clients`,
      {
        alias: "Producciones Sol",
        snapshot: {
          companyName: "Producciones Sol",
          taxId: "PSO260101AAA",
          email: "hola@sol.mx",
          address: "Av. Reforma 1",
        },
      },
      cookie,
    ),
  )
  clientId = client.id
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

async function clearWarehouse() {
  await db.execute(
    sql`truncate table ${warehouseStockReservations}, ${warehouseQuoteLines}, ${warehouseQuotes}, ${warehouseStockEvents}, ${warehouseStockUnits}, ${warehouseMeasurements}, ${warehouseProductPrices}, ${warehousePriceLists}, ${warehouseProducts} cascade`,
  )
}

interface Product {
  id: string
  measurements: { id: string; name: string }[]
}

/** Un producto con su tarifa de venta en una lista de precios, y sus unidades. */
async function pricedProduct(
  name: string,
  quantity: number,
  sale: string,
): Promise<{ measurementId: string; productId: string; priceId: string; listId: string }> {
  const product = await json<Product>(
    await request(
      "POST",
      `${base}/products`,
      { name, measurements: [{ name: "Cuerpo", initialQuantity: quantity }] },
      cookie,
    ),
  )

  const list = await json<{ id: string }>(
    await request("POST", `${base}/price-lists`, { name: `Tarifas ${name}` }, cookie),
  )
  const price = await json<{ id: string }>(
    await request(
      "PUT",
      `${base}/price-lists/${list.id}/prices/${product.id}`,
      { sale, rent: { isFixed: false, weekly: sale }, penalty: { isFixed: false } },
      cookie,
    ),
  )

  return {
    measurementId: product.measurements[0]?.id as string,
    productId: product.id,
    priceId: price.id,
    listId: list.id,
  }
}

interface Quote {
  id: string
  code: string
  folio: string
}

async function newQuote(body: Record<string, unknown>): Promise<Quote> {
  const response = await request("POST", `${base}/quotes`, { clientId, ...body }, cookie)
  expect(response.status).toBe(201)
  return json<Quote>(response)
}

interface DocumentPayload {
  document: QuoteDocument
  reference: string
}

async function documentOf(quoteId: string): Promise<DocumentPayload> {
  const response = await request("GET", `${base}/quotes/${quoteId}/document`, undefined, cookie)
  expect(response.status).toBe(200)
  return json<DocumentPayload>(response)
}

async function publicDocument(reference: string): Promise<Response> {
  // Sin credencial a propósito: es el caso del cliente que no tiene cuenta.
  return request("GET", `/public/documents/${reference}`)
}

// ─── Datos vigentes ──────────────────────────────────────────────────────────

describe("el documento refleja los datos vigentes", () => {
  it("una cotización abierta refleja la línea que se acaba de añadir", async () => {
    // Escenario: «Una cotización abierta refleja los cambios».
    await clearWarehouse()
    const foco = await pricedProduct("Foco", 4, "250.00")
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId: foco.measurementId, quantity: 1, productPriceId: foco.priceId }],
    })

    expect((await documentOf(quote.id)).document.breakdown.total).toBe("250.00")

    const tripie = await pricedProduct("Tripié", 2, "100.00")
    await request(
      "PUT",
      `${base}/quotes/${quote.id}/lines`,
      {
        lines: [
          { measurementId: foco.measurementId, quantity: 1, productPriceId: foco.priceId },
          { measurementId: tripie.measurementId, quantity: 1, productPriceId: tripie.priceId },
        ],
      },
      cookie,
    )

    const { document } = await documentOf(quote.id)

    expect(document.groups).toHaveLength(2)
    expect(document.breakdown.total).toBe("350.00")
    expect(document.linesTotal).toBe("350.00")
  })

  it("una cotización cerrada conserva los importes con los que se cerró", async () => {
    // Escenario: «Una cotización cerrada conserva sus importes».
    await clearWarehouse()
    const foco = await pricedProduct("Foco", 4, "250.00")
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId: foco.measurementId, quantity: 2, productPriceId: foco.priceId }],
    })

    await request("PATCH", `${base}/quotes/${quote.id}/status`, { status: "sold" }, cookie)

    // El catálogo sube después de cerrar: el documento no se entera, y ése es el punto.
    await request(
      "PUT",
      `${base}/price-lists/${foco.listId}/prices/${foco.productId}`,
      { sale: "999.00", rent: { isFixed: false }, penalty: { isFixed: false } },
      cookie,
    )

    const { document } = await documentOf(quote.id)

    expect(document.breakdown.total).toBe("500.00")
    expect(document.groups[0]?.subtotal).toBe("500.00")
  })
})

// ─── Contenido de la cotización ──────────────────────────────────────────────

describe("contenido del documento de cotización", () => {
  it("lleva la identidad, las dos partes y sus contactos", async () => {
    await clearWarehouse()
    const foco = await pricedProduct("Foco", 2, "250.00")
    const quote = await newQuote({
      type: "sale",
      name: "Rodaje de invierno",
      lines: [{ measurementId: foco.measurementId, quantity: 1, productPriceId: foco.priceId }],
    })

    await request(
      "PATCH",
      `${base}/quotes/${quote.id}/contacts`,
      {
        clientContacts: [{ name: "Ana", position: "Productora" }],
        sellerContacts: [{ name: "Carla", phone: "8112345678" }],
      },
      cookie,
    )

    const { document } = await documentOf(quote.id)

    expect(document.identity.folio).toBe(quote.folio)
    expect(document.identity.code).toBe(quote.code)
    expect(document.identity.name).toBe("Rodaje de invierno")
    expect(Date.parse(document.identity.generatedAt)).not.toBeNaN()
    expect(document.issuer.name).toBe("Renta del Norte")
    expect(document.issuer.contacts[0]?.name).toBe("Carla")
    expect(document.client?.name).toBe("Producciones Sol")
    expect(document.client?.taxId).toBe("PSO260101AAA")
    expect(document.client?.contacts[0]?.name).toBe("Ana")
  })

  it("las líneas cuadran con el total, con descuento e impuestos de por medio", async () => {
    // Escenario: «Las líneas cuadran con el total».
    await clearWarehouse()
    const foco = await pricedProduct("Foco", 4, "250.00")
    const tripie = await pricedProduct("Tripié", 3, "120.00")

    const quote = await newQuote({
      type: "sale",
      lines: [
        { measurementId: foco.measurementId, quantity: 2, productPriceId: foco.priceId },
        { measurementId: tripie.measurementId, quantity: 3, productPriceId: tripie.priceId },
      ],
    })

    await request(
      "PUT",
      `${base}/quotes/${quote.id}/payment-terms`,
      { version: 1, discount: { type: "percent", value: "10" } },
      cookie,
    )
    await request(
      "PUT",
      `${base}/quotes/${quote.id}/taxes`,
      { version: 1, iva: { enabled: true, type: "trasladado", rate: "16" } },
      cookie,
    )

    const { document } = await documentOf(quote.id)

    expect(document.reconciles).toBe(true)
    expect(document.linesTotal).toBe(document.breakdown.linesTotal)
    expect(document.linesTotal).toBe("860.00")
    expect(document.breakdown.discount).toBe("86.00")
    expect(document.breakdown.taxTotal).toBe("123.84")
    expect(document.breakdown.total).toBe("897.84")

    const subtotals = document.groups.map((group) => group.subtotal)
    expect(subtotals).toEqual(["500.00", "360.00"])
  })

  it("una renta indica su ventana y la frecuencia con la que se calculó", async () => {
    // Escenario: «Una cotización de renta indica su periodo».
    await clearWarehouse()
    const camara = await pricedProduct("Cámara", 2, "700.00")

    const quote = await newQuote({
      type: "rent",
      startsOn: "2026-09-01T00:00:00.000Z",
      endsOn: "2026-09-15T00:00:00.000Z",
      lines: [
        {
          measurementId: camara.measurementId,
          quantity: 1,
          productPriceId: camara.priceId,
          frequency: "weekly",
        },
      ],
    })

    const { document } = await documentOf(quote.id)

    expect(document.period).not.toBeNull()
    expect(document.period?.days).toBe(14)
    expect(document.period?.frequencies).toEqual(["weekly"])
    expect(document.groups[0]?.lines[0]?.appliedDays).toBe("2.00")
  })
})

// ─── Enlace público ──────────────────────────────────────────────────────────

describe("enlace público de sólo lectura", () => {
  it("un cliente sin cuenta abre el documento", async () => {
    // Escenario: «Un cliente abre la cotización sin cuenta».
    await clearWarehouse()
    const foco = await pricedProduct("Foco", 2, "250.00")
    const quote = await newQuote({
      type: "sale",
      name: "Para el cliente",
      lines: [{ measurementId: foco.measurementId, quantity: 1, productPriceId: foco.priceId }],
    })

    const { reference } = await documentOf(quote.id)
    const response = await publicDocument(reference)

    expect(response.status).toBe(200)

    const body = await json<{ document: QuoteDocument }>(response)
    expect(body.document.identity.folio).toBe(quote.folio)
    expect(body.document.breakdown.total).toBe("250.00")
  })

  it("la respuesta pública no trae nada más que el documento", async () => {
    await clearWarehouse()
    const foco = await pricedProduct("Foco", 2, "250.00")
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId: foco.measurementId, quantity: 1, productPriceId: foco.priceId }],
    })

    const { reference } = await documentOf(quote.id)
    const body = await json<Record<string, unknown>>(await publicDocument(reference))

    // Ni identificadores de empresa, ni de almacén, ni la cotización en crudo: sólo el documento.
    expect(Object.keys(body)).toEqual(["document"])
    expect(JSON.stringify(body)).not.toContain(companyId)
    expect(JSON.stringify(body)).not.toContain(warehouseId)
  })

  it("alterar la referencia responde 404", async () => {
    // Escenario: «Alterar el enlace no revela otros documentos».
    await clearWarehouse()
    const foco = await pricedProduct("Foco", 2, "250.00")
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId: foco.measurementId, quantity: 1, productPriceId: foco.priceId }],
    })

    const { reference } = await documentOf(quote.id)
    const first = reference[0] === "A" ? "B" : "A"
    const tampered = `${first}${reference.slice(1)}`

    expect((await publicDocument(tampered)).status).toBe(404)
    expect((await publicDocument("no-es-una-referencia")).status).toBe(404)
  })

  it("la referencia de un documento no sirve para otro", async () => {
    await clearWarehouse()
    const foco = await pricedProduct("Foco", 4, "250.00")
    const mine = await newQuote({
      type: "sale",
      name: "Mía",
      lines: [{ measurementId: foco.measurementId, quantity: 1, productPriceId: foco.priceId }],
    })
    const other = await newQuote({
      type: "sale",
      name: "Ajena",
      lines: [{ measurementId: foco.measurementId, quantity: 1, productPriceId: foco.priceId }],
    })

    const { reference } = await documentOf(mine.id)
    const body = await json<{ document: QuoteDocument }>(await publicDocument(reference))

    expect(body.document.identity.name).toBe("Mía")
    expect(body.document.identity.name).not.toBe("Ajena")
    expect(other.id).not.toBe(mine.id)
  })

  it("la referencia es estable: el mismo enlace sigue sirviendo", async () => {
    await clearWarehouse()
    const foco = await pricedProduct("Foco", 2, "250.00")
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId: foco.measurementId, quantity: 1, productPriceId: foco.priceId }],
    })

    const first = await documentOf(quote.id)
    const second = await documentOf(quote.id)

    expect(first.reference).toBe(second.reference)
  })

  it("un documento dado de baja deja de servirse", async () => {
    await clearWarehouse()
    const foco = await pricedProduct("Foco", 2, "250.00")
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId: foco.measurementId, quantity: 1, productPriceId: foco.priceId }],
    })

    const { reference } = await documentOf(quote.id)
    expect((await publicDocument(reference)).status).toBe(200)

    await request("DELETE", `${base}/quotes/${quote.id}`, undefined, cookie)

    expect((await publicDocument(reference)).status).toBe(404)
  })

  it("el enlace es de lectura: no admite escrituras", async () => {
    await clearWarehouse()
    const foco = await pricedProduct("Foco", 2, "250.00")
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId: foco.measurementId, quantity: 1, productPriceId: foco.priceId }],
    })

    const { reference } = await documentOf(quote.id)

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await request(method, `/public/documents/${reference}`, { name: "otro" })
      expect(response.status, method).toBe(404)
    }
  })

  it("el documento del panel sigue exigiendo sesión", async () => {
    await clearWarehouse()
    const foco = await pricedProduct("Foco", 2, "250.00")
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId: foco.measurementId, quantity: 1, productPriceId: foco.priceId }],
    })

    const response = await request("GET", `${base}/quotes/${quote.id}/document`)

    expect(response.status).toBe(401)
  })
})
