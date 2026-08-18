/**
 * Cotizaciones, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/quotations/spec.md` y, para lo que toca al
 * inventario, de `stock-reservation`. Rebanadas 13 y 14.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
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

interface Quote {
  id: string
  code: string
  folio: string
  name: string
  type: "rent" | "sale"
  status: string
  clientId: string | null
  responsibleId: string | null
  startsOn: string | null
  endsOn: string | null
  clientContacts: { name: string; phone?: string; position?: string }[]
  sellerContacts: { name: string; phone?: string; position?: string }[]
}

let cookie = ""
let userId = ""
let companyId = ""
let warehouseId = ""
let clientId = ""
let base = ""

beforeAll(async () => {
  await reset()

  const email = "cotizaciones@ejemplo.mx"
  await request("POST", "/auth/register", { email, password: PASSWORD, name: "Cotizaciones" })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const login = await request("POST", "/auth/login", { email, password: PASSWORD })
  cookie =
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""

  const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  userId = me?.id ?? ""

  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name: "Renta del Norte" }, cookie),
  )
  companyId = company.id

  const serviceId = newId()
  await db.insert(services).values({ id: serviceId, keycode: "warehouses", name: "Almacenes" })
  await db.insert(companyServices).values({ id: newId(), companyId, serviceId })

  const warehouse = await json<{ id: string }>(
    await request("POST", `/companies/${companyId}/warehouses`, { name: "Nave" }, cookie),
  )
  warehouseId = warehouse.id
  base = `/companies/${companyId}/warehouses/${warehouseId}`

  const client = await json<{ id: string }>(
    await request(
      "POST",
      `/companies/${companyId}/clients`,
      { alias: "Producciones Sol", snapshot: { companyName: "Producciones Sol" } },
      cookie,
    ),
  )
  clientId = client.id
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

async function clearQuotes() {
  await db.execute(
    sql`truncate table ${warehouseStockReservations}, ${warehouseQuoteLines}, ${warehouseQuotes} cascade`,
  )
}

/** Una cotización con lo mínimo. Devuelve la respuesta sin interpretarla. */
function createQuote(body: Record<string, unknown> = {}) {
  return request("POST", `${base}/quotes`, { clientId, type: "rent", ...body }, cookie)
}

async function newQuote(body: Record<string, unknown> = {}): Promise<Quote> {
  const response = await createQuote(body)
  expect(response.status).toBe(201)
  return json<Quote>(response)
}

const WINDOW = { startsOn: "2026-09-01T00:00:00.000Z", endsOn: "2026-09-11T00:00:00.000Z" }

// ─── Identidad ───────────────────────────────────────────────────────────────

describe("identidad de una cotización", () => {
  it("se crea con lo mínimo y queda con folio y código únicos", async () => {
    // Escenario: «Se crea una cotización con lo mínimo».
    await clearQuotes()

    const first = await newQuote({ name: "Rodaje de invierno" })
    const second = await newQuote()

    expect(first.code).not.toBe("")
    expect(first.folio).not.toBe("")
    expect(first.code).not.toBe(second.code)
    expect(first.folio).not.toBe(second.folio)
    expect(first.clientId).toBe(clientId)
    expect(first.type).toBe("rent")
  })

  it("nombra responsable a quien la creó si no se indica otro", async () => {
    await clearQuotes()

    const quote = await newQuote()

    expect(quote.responsibleId).toBe(userId)
  })

  it("nace pendiente cuando se crea sin líneas", async () => {
    // Escenario: «Sin líneas nace pendiente».
    await clearQuotes()

    const quote = await newQuote()

    expect(quote.status).toBe("pending")
  })

  it("registra contactos de las dos partes, diferenciados por su lado", async () => {
    // Escenario: «Se registran contactos de las dos partes».
    await clearQuotes()
    const quote = await newQuote()

    const response = await request(
      "PATCH",
      `${base}/quotes/${quote.id}/contacts`,
      {
        clientContacts: [
          { name: "Ana", phone: "8112345678", position: "Productora" },
          { name: "Beto" },
        ],
        sellerContacts: [{ name: "Carla", position: "Ventas" }],
      },
      cookie,
    )
    expect(response.status).toBe(200)

    const updated = await json<Quote>(response)
    expect(updated.clientContacts).toHaveLength(2)
    expect(updated.sellerContacts).toHaveLength(1)
    expect(updated.clientContacts[0]?.name).toBe("Ana")
    expect(updated.sellerContacts[0]?.name).toBe("Carla")
  })
})

// ─── Ventana de renta ────────────────────────────────────────────────────────

describe("ventana de renta", () => {
  it("no deja avanzar una renta sin fechas", async () => {
    // Escenario: «Una renta sin fechas no se puede cerrar».
    await clearQuotes()
    const quote = await newQuote()

    const response = await request(
      "PATCH",
      `${base}/quotes/${quote.id}/status`,
      { status: "in_progress" },
      cookie,
    )

    expect(response.status).toBe(422)
    expect((await json<{ message: string }>(response)).message).toMatch(/fechas/i)
  })

  it("no exige fechas a una venta", async () => {
    // Escenario: «Una venta no exige fechas».
    await clearQuotes()
    const quote = await newQuote({ type: "sale" })

    const response = await request(
      "PATCH",
      `${base}/quotes/${quote.id}/status`,
      { status: "in_progress" },
      cookie,
    )

    expect(response.status).toBe(200)
    expect((await json<Quote>(response)).status).toBe("in_progress")
  })
})

// ─── Transiciones ────────────────────────────────────────────────────────────

async function moveTo(id: string, status: string) {
  return request("PATCH", `${base}/quotes/${id}/status`, { status }, cookie)
}

describe("transiciones de estado", () => {
  it("acepta una transición prevista", async () => {
    // Escenario: «Una transición prevista se acepta».
    await clearQuotes()
    const quote = await newQuote({ ...WINDOW })

    const response = await moveTo(quote.id, "in_progress")

    expect(response.status).toBe(200)
    expect((await json<Quote>(response)).status).toBe("in_progress")
  })

  it("no reabre una cotización cerrada", async () => {
    // Escenario: «No se reabre una cotización cerrada».
    await clearQuotes()
    const quote = await newQuote({ ...WINDOW })
    await moveTo(quote.id, "in_progress")
    await moveTo(quote.id, "completed")

    const response = await moveTo(quote.id, "in_progress")

    expect(response.status).toBe(409)
  })

  it("no admite un estado que no corresponde al tipo", async () => {
    await clearQuotes()
    const sale = await newQuote({ type: "sale" })
    await moveTo(sale.id, "in_progress")

    // «En renta» no tiene sentido en una venta.
    expect((await moveTo(sale.id, "in_rent")).status).toBe(409)
  })
})

// ─── Listado ─────────────────────────────────────────────────────────────────

describe("listado de cotizaciones", () => {
  it("pone lo más urgente primero", async () => {
    // Escenario: «Lo más urgente aparece primero».
    await clearQuotes()
    const closed = await newQuote({ ...WINDOW, name: "Cerrada" })
    await moveTo(closed.id, "in_progress")
    await moveTo(closed.id, "completed")
    await newQuote({ ...WINDOW, name: "Abierta" })

    const page = await json<{ items: Quote[] }>(
      await request("GET", `${base}/quotes`, undefined, cookie),
    )

    expect(page.items.map((row) => row.name)).toEqual(["Abierta", "Cerrada"])
  })

  it("encuentra una cotización por su folio", async () => {
    // Escenario: «Se busca por folio».
    await clearQuotes()
    const quote = await newQuote({ name: "Rodaje de primavera" })
    await newQuote({ name: "Otra" })

    const page = await json<{ items: Quote[] }>(
      await request("GET", `${base}/quotes?search=${quote.folio}`, undefined, cookie),
    )

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.id).toBe(quote.id)
  })

  it("filtra por estado y por tipo", async () => {
    await clearQuotes()
    await newQuote({ name: "Renta" })
    await newQuote({ name: "Venta", type: "sale" })

    const page = await json<{ items: Quote[] }>(
      await request("GET", `${base}/quotes?type=sale`, undefined, cookie),
    )

    expect(page.items.map((row) => row.name)).toEqual(["Venta"])
  })
})
