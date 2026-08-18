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

// ─── Líneas y reserva ────────────────────────────────────────────────────────

interface Line {
  id: string
  measurementId: string
  productPriceId: string | null
  frequency: string
  quantity: number
  unitIds: string[]
  position: number
  positionProduct: number
}

interface Product {
  id: string
  measurements: { id: string; name: string }[]
}

interface Unit {
  id: string
  code: string
  status: string
  createdByReservation: boolean
}

/** Un producto con una medida y `quantity` unidades disponibles. */
async function newStocked(name: string, quantity: number): Promise<string> {
  const product = await json<Product>(
    await request(
      "POST",
      `${base}/products`,
      { name, measurements: [{ name: "Cuerpo", initialQuantity: quantity }] },
      cookie,
    ),
  )
  return product.measurements[0]?.id as string
}

async function unitsOf(measurementId: string): Promise<Unit[]> {
  const page = await json<{ items: Unit[] }>(
    await request("GET", `${base}/measurements/${measurementId}/units`, undefined, cookie),
  )
  return page.items
}

function setLines(quoteId: string, lines: unknown[], allowMinting = false) {
  return request("PUT", `${base}/quotes/${quoteId}/lines`, { lines, allowMinting }, cookie)
}

async function linesOf(quoteId: string): Promise<Line[]> {
  const response = await request("GET", `${base}/quotes/${quoteId}/lines`, undefined, cookie)
  expect(response.status).toBe(200)
  return (await json<{ items: Line[] }>(response)).items
}

describe("una reserva aparta unidades concretas", () => {
  it("vincula tres unidades identificables a la línea", async () => {
    // Escenario: «La reserva registra qué unidades».
    await clearQuotes()
    const measurementId = await newStocked("Cámara", 5)
    const quote = await newQuote({ ...WINDOW })

    const response = await setLines(quote.id, [{ measurementId, quantity: 3 }])
    expect(response.status).toBe(200)

    const [line] = (await json<{ items: Line[] }>(response)).items
    expect(line?.quantity).toBe(3)
    expect(new Set(line?.unitIds).size).toBe(3)

    const units = await unitsOf(measurementId)
    expect(units.filter((row) => row.status === "in_quote")).toHaveLength(3)
    expect(units.filter((row) => row.status === "available")).toHaveLength(2)
  })

  it("no deja que dos cotizaciones se lleven la misma unidad", async () => {
    // Escenario: «Una unidad no se reserva dos veces».
    await clearQuotes()
    const measurementId = await newStocked("Grúa", 2)
    const first = await newQuote({ ...WINDOW })
    const second = await newQuote({ ...WINDOW })

    const taken = (
      await json<{ items: Line[] }>(await setLines(first.id, [{ measurementId, quantity: 1 }]))
    ).items[0]?.unitIds
    const other = (
      await json<{ items: Line[] }>(await setLines(second.id, [{ measurementId, quantity: 1 }]))
    ).items[0]?.unitIds

    expect(taken).toHaveLength(1)
    expect(other).toHaveLength(1)
    expect(other?.[0]).not.toBe(taken?.[0])
  })

  it("sólo toma las que están disponibles", async () => {
    // Escenario: «Sólo se toman las disponibles».
    await clearQuotes()
    const measurementId = await newStocked("Tripié", 4)
    const units = await unitsOf(measurementId)

    await request(
      "PATCH",
      `${base}/measurements/${measurementId}/units`,
      { unitIds: [units[0]?.id], status: "sold" },
      cookie,
    )
    await request(
      "PATCH",
      `${base}/measurements/${measurementId}/units`,
      { unitIds: [units[1]?.id], status: "damaged" },
      cookie,
    )

    const quote = await newQuote({ ...WINDOW })
    const response = await setLines(quote.id, [{ measurementId, quantity: 2 }])
    expect(response.status).toBe(200)

    const reserved = (await json<{ items: Line[] }>(response)).items[0]?.unitIds ?? []
    expect(reserved.sort()).toEqual([units[2]?.id, units[3]?.id].sort())
  })
})

describe("reconciliación por diferencia", () => {
  it("al subir la cantidad aparta sólo la diferencia", async () => {
    // Escenario: «Subir de dos a cinco aparta tres más».
    await clearQuotes()
    const measurementId = await newStocked("Cámara", 8)
    const quote = await newQuote({ ...WINDOW })

    const before = (
      await json<{ items: Line[] }>(await setLines(quote.id, [{ measurementId, quantity: 2 }]))
    ).items[0]
    const after = (
      await json<{ items: Line[] }>(
        await setLines(quote.id, [{ id: before?.id, measurementId, quantity: 5 }]),
      )
    ).items[0]

    expect(after?.quantity).toBe(5)
    for (const unitId of before?.unitIds ?? []) {
      expect(after?.unitIds).toContain(unitId)
    }
  })

  it("al bajar la cantidad libera la diferencia", async () => {
    // Escenario: «Bajar de cinco a dos libera tres».
    await clearQuotes()
    const measurementId = await newStocked("Cámara", 5)
    const quote = await newQuote({ ...WINDOW })

    const before = (
      await json<{ items: Line[] }>(await setLines(quote.id, [{ measurementId, quantity: 5 }]))
    ).items[0]
    const after = (
      await json<{ items: Line[] }>(
        await setLines(quote.id, [{ id: before?.id, measurementId, quantity: 2 }]),
      )
    ).items[0]

    expect(after?.quantity).toBe(2)
    const units = await unitsOf(measurementId)
    expect(units.filter((row) => row.status === "available")).toHaveLength(3)
  })

  it("libera todas al quitar la línea", async () => {
    // Escenario: «Quitar una línea devuelve su inventario».
    await clearQuotes()
    const first = await newStocked("Cámara", 3)
    const second = await newStocked("Grúa", 2)
    const quote = await newQuote({ ...WINDOW })

    const lines = (
      await json<{ items: Line[] }>(
        await setLines(quote.id, [
          { measurementId: first, quantity: 3 },
          { measurementId: second, quantity: 2 },
        ]),
      )
    ).items
    const keep = lines.find((row) => row.measurementId === second)

    await setLines(quote.id, [{ id: keep?.id, measurementId: second, quantity: 2 }])

    expect((await unitsOf(first)).every((row) => row.status === "available")).toBe(true)
    expect((await unitsOf(second)).every((row) => row.status === "in_quote")).toBe(true)
  })

  it("reconcilia el conjunto completo de una vez", async () => {
    // Escenario: «Se establece el conjunto de líneas».
    await clearQuotes()
    const a = await newStocked("A", 4)
    const b = await newStocked("B", 2)
    const d = await newStocked("D", 3)
    const quote = await newQuote({ ...WINDOW })

    const before = (
      await json<{ items: Line[] }>(
        await setLines(quote.id, [
          { measurementId: a, quantity: 1 },
          { measurementId: b, quantity: 2 },
        ]),
      )
    ).items
    const keep = before.find((row) => row.measurementId === a)

    const after = (
      await json<{ items: Line[] }>(
        await setLines(quote.id, [
          { id: keep?.id, measurementId: a, quantity: 3 },
          { measurementId: d, quantity: 3 },
        ]),
      )
    ).items

    expect(after).toHaveLength(2)
    expect(after.find((row) => row.measurementId === a)?.quantity).toBe(3)
    expect(after.find((row) => row.measurementId === d)?.quantity).toBe(3)
    expect((await unitsOf(b)).every((row) => row.status === "available")).toBe(true)
  })
})

describe("cambiar la medida de una línea", () => {
  it("suelta el equipo de la medida anterior y aparta el de la nueva", async () => {
    // No es un escenario de la spec: la reconciliación por diferencia mira la cantidad, y con la
    // misma cantidad no habría hecho nada — dejando la línea diciendo una medida y sujetando
    // unidades de otra.
    await clearQuotes()
    const before = await newStocked("Cámara", 2)
    const after = await newStocked("Grúa", 2)
    const quote = await newQuote({ ...WINDOW })

    const line = (
      await json<{ items: Line[] }>(
        await setLines(quote.id, [{ measurementId: before, quantity: 2 }]),
      )
    ).items[0]

    const response = await setLines(quote.id, [{ id: line?.id, measurementId: after, quantity: 2 }])
    expect(response.status).toBe(200)

    expect((await unitsOf(before)).every((row) => row.status === "available")).toBe(true)
    expect((await unitsOf(after)).every((row) => row.status === "in_quote")).toBe(true)
  })
})

describe("existencia insuficiente", () => {
  it("rechaza sin reservar nada, y dice cuántas hay", async () => {
    // Escenario: «No se reserva de forma parcial».
    await clearQuotes()
    const measurementId = await newStocked("Cámara", 2)
    const quote = await newQuote({ ...WINDOW })

    const response = await setLines(quote.id, [{ measurementId, quantity: 5 }])

    expect(response.status).toBe(422)
    const { message } = await json<{ message: string }>(response)
    expect(message).toMatch(/2/)
    expect(message).toMatch(/5/)
    expect((await unitsOf(measurementId)).every((row) => row.status === "available")).toBe(true)
  })

  it("no crea inventario sin autorización explícita", async () => {
    // Escenario: «Sin autorización no se crea inventario».
    await clearQuotes()
    const measurementId = await newStocked("Cámara", 2)
    const quote = await newQuote({ ...WINDOW })

    const response = await setLines(quote.id, [{ measurementId, quantity: 5 }])

    expect(response.status).toBe(422)
    expect(await unitsOf(measurementId)).toHaveLength(2)
  })

  it("con autorización acuña las que faltan y las deja marcadas", async () => {
    // Escenario: «Con autorización se crea y se registra».
    await clearQuotes()
    const measurementId = await newStocked("Cámara", 2)
    const quote = await newQuote({ ...WINDOW })

    const response = await setLines(quote.id, [{ measurementId, quantity: 5 }], true)
    expect(response.status).toBe(200)

    const units = await unitsOf(measurementId)
    expect(units).toHaveLength(5)
    expect(units.filter((row) => row.createdByReservation)).toHaveLength(3)
    expect(units.every((row) => row.status === "in_quote")).toBe(true)
  })

  it("deja distinguir en el inventario las acuñadas por reserva", async () => {
    // Escenario: «Las unidades creadas son auditables».
    await clearQuotes()
    const measurementId = await newStocked("Cámara", 1)
    const quote = await newQuote({ ...WINDOW })
    await setLines(quote.id, [{ measurementId, quantity: 3 }], true)

    const page = await json<{ items: Unit[] }>(
      await request(
        "GET",
        `${base}/measurements/${measurementId}/units?createdByReservation=true`,
        undefined,
        cookie,
      ),
    )

    expect(page.items).toHaveLength(2)
  })
})

describe("la reserva no admite carreras", () => {
  it("con una sola unidad disponible, exactamente una reserva lo consigue", async () => {
    // Escenario: «Dos reservas simultáneas no se solapan».
    await clearQuotes()
    const measurementId = await newStocked("Cámara", 1)
    const first = await newQuote({ ...WINDOW })
    const second = await newQuote({ ...WINDOW })

    const [one, other] = await Promise.all([
      setLines(first.id, [{ measurementId, quantity: 1 }]),
      setLines(second.id, [{ measurementId, quantity: 1 }]),
    ])

    const codes = [one?.status, other?.status].sort()
    expect(codes).toEqual([200, 422])
    expect((await unitsOf(measurementId)).filter((row) => row.status === "in_quote")).toHaveLength(
      1,
    )
  })

  it("un fallo a mitad no deja ninguna unidad vinculada", async () => {
    // Escenario: «Un fallo a mitad no deja unidades a medias».
    await clearQuotes()
    const enough = await newStocked("Cámara", 5)
    const scarce = await newStocked("Grúa", 1)
    const quote = await newQuote({ ...WINDOW })

    const response = await setLines(quote.id, [
      { measurementId: enough, quantity: 5 },
      { measurementId: scarce, quantity: 3 },
    ])

    expect(response.status).toBe(422)
    expect((await unitsOf(enough)).every((row) => row.status === "available")).toBe(true)
    expect((await unitsOf(scarce)).every((row) => row.status === "available")).toBe(true)
    expect(await linesOf(quote.id)).toHaveLength(0)
  })

  it("una reconciliación que falla deja las líneas como estaban", async () => {
    // Escenario: «Un fallo deja las líneas como estaban».
    await clearQuotes()
    const enough = await newStocked("Cámara", 5)
    const scarce = await newStocked("Grúa", 1)
    const quote = await newQuote({ ...WINDOW })

    const before = (
      await json<{ items: Line[] }>(
        await setLines(quote.id, [{ measurementId: enough, quantity: 2 }]),
      )
    ).items

    const response = await setLines(quote.id, [
      { id: before[0]?.id, measurementId: enough, quantity: 4 },
      { measurementId: scarce, quantity: 9 },
    ])
    expect(response.status).toBe(422)

    const after = await linesOf(quote.id)
    expect(after).toHaveLength(1)
    expect(after[0]?.quantity).toBe(2)
    expect(after[0]?.unitIds.sort()).toEqual([...(before[0]?.unitIds ?? [])].sort())
  })
})

describe("la cotización nace donde corresponde", () => {
  it("nace en progreso cuando se crea con líneas", async () => {
    // Escenario: «Con líneas nace en progreso».
    await clearQuotes()
    const measurementId = await newStocked("Cámara", 3)

    const quote = await newQuote({ ...WINDOW, lines: [{ measurementId, quantity: 2 }] })

    expect(quote.status).toBe("in_progress")
  })
})
