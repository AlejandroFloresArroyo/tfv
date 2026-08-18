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

/**
 * Vacía también el catálogo.
 *
 * Lo necesitan las pruebas que miran el almacén **entero**: `clearQuotes` deja las unidades de las
 * pruebas anteriores en el estado en que quedaron, y una verificación de coherencia las encuentra
 * con toda la razón.
 */
async function clearWarehouse() {
  await db.execute(
    sql`truncate table ${warehouseStockReservations}, ${warehouseQuoteLines}, ${warehouseQuotes}, ${warehouseStockEvents}, ${warehouseStockUnits}, ${warehouseMeasurements}, ${warehouseProductPrices}, ${warehousePriceLists}, ${warehouseProducts} cascade`,
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
  basePrice: string
  rent?: { isFixed: boolean; weekly?: string }
  available: number
  id: string
  measurementId: string
  measurementName: string
  productId: string
  productName: string
  productCode: string
  productPriceId: string | null
  frequency: string
  quantity: number
  unitIds: string[]
  position: number
  positionProduct: number
}

interface Product {
  id: string
  isPublished: boolean
  isProvisional: boolean
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

describe("una línea se puede leer sin volver a preguntar", () => {
  it("trae el producto y la medida por su nombre", async () => {
    // Sin esto, dibujar una cotización de doce líneas cuesta doce peticiones más: el identificador
    // de una medida no le dice nada a quien lee el documento.
    await clearQuotes()
    const measurementId = await newStocked("Cámara Sony FX6", 2)
    const quote = await newQuote({ ...WINDOW })

    const [line] = (
      await json<{ items: Line[] }>(await setLines(quote.id, [{ measurementId, quantity: 2 }]))
    ).items

    expect(line?.productName).toBe("Cámara Sony FX6")
    expect(line?.measurementName).toBe("Cuerpo")
    expect(line?.productCode).not.toBe("")
    expect(line?.productId).not.toBe("")
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

// ─── Proyección del estado sobre el inventario ───────────────────────────────

/** Una cotización con equipo apartado, lista para moverse de estado. */
async function stockedQuote(
  quantity: number,
  overrides: Record<string, unknown> = {},
): Promise<{ quote: Quote; measurementId: string }> {
  const measurementId = await newStocked(`Equipo ${newId().slice(0, 8)}`, quantity)
  const quote = await newQuote({ ...WINDOW, lines: [{ measurementId, quantity }], ...overrides })
  return { quote, measurementId }
}

function statusesOf(units: Unit[]): Record<string, number> {
  const tally: Record<string, number> = {}
  for (const unit of units) tally[unit.status] = (tally[unit.status] ?? 0) + 1
  return tally
}

describe("el estado de la cotización proyecta al inventario", () => {
  it("cancelar libera todo el inventario", async () => {
    // Escenario: «Cancelar libera todo el inventario».
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(4)

    expect((await moveTo(quote.id, "canceled")).status).toBe(200)

    expect(statusesOf(await unitsOf(measurementId))).toEqual({ available: 4 })
  })

  it("pasar a renta saca el equipo", async () => {
    // Escenario: «Pasar a renta saca el equipo».
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(4)

    expect((await moveTo(quote.id, "in_rent")).status).toBe(200)

    expect(statusesOf(await unitsOf(measurementId))).toEqual({ rented: 4 })
  })

  it("una venta completada marca las unidades vendidas", async () => {
    // Escenario: «Una venta completada marca las unidades vendidas».
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(2, { type: "sale" })

    expect((await moveTo(quote.id, "completed")).status).toBe(200)

    expect(statusesOf(await unitsOf(measurementId))).toEqual({ sold: 2 })
  })

  it("completar una renta deja el equipo fuera, no disponible", async () => {
    // Escenario: «Completar una renta no devuelve el equipo». Es el caso contraintuitivo:
    // completar significa que el equipo salió, no que volvió.
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(6)

    await moveTo(quote.id, "completed")

    expect(statusesOf(await unitsOf(measurementId))).toEqual({ rented: 6 })

    // Y no cuentan como disponibles para otra cotización.
    const other = await newQuote({ ...WINDOW })
    expect((await setLines(other.id, [{ measurementId, quantity: 1 }])).status).toBe(422)
  })
})

// ─── Retorno ─────────────────────────────────────────────────────────────────

describe("las líneas se congelan al salir el equipo", () => {
  it("una renta en curso no admite cambios de línea", async () => {
    // No es burocracia: bajar la cantidad soltaría el vínculo de una unidad que está en un rodaje,
    // y como sólo vuelven a `available` las que estaban `in_quote`, la unidad se quedaría `rented`
    // sin dueño — comprometida para siempre y sin que la verificación de coherencia la viera.
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(3)
    await moveTo(quote.id, "in_progress")
    await moveTo(quote.id, "in_rent")

    const [line] = await linesOf(quote.id)
    const response = await setLines(quote.id, [{ id: line?.id, measurementId, quantity: 1 }])

    expect(response.status).toBe(409)
    // Y el equipo sigue fuera, entero.
    expect(statusesOf(await unitsOf(measurementId))).toEqual({ rented: 3 })
  })

  it("tampoco admite añadir equipo a una renta ya salida", async () => {
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(2)
    const other = await newStocked("Añadida", 2)
    await moveTo(quote.id, "in_progress")
    await moveTo(quote.id, "in_rent")

    const [line] = await linesOf(quote.id)
    const response = await setLines(quote.id, [
      { id: line?.id, measurementId, quantity: 2 },
      { measurementId: other, quantity: 1 },
    ])

    expect(response.status).toBe(409)
    expect(statusesOf(await unitsOf(other))).toEqual({ available: 2 })
  })

  it("mientras el equipo no ha salido sí se editan", async () => {
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(3)
    await moveTo(quote.id, "in_progress")
    const [line] = await linesOf(quote.id)

    const response = await setLines(quote.id, [{ id: line?.id, measurementId, quantity: 1 }])

    expect(response.status).toBe(200)
    expect(statusesOf(await unitsOf(measurementId))).toEqual({ available: 2, in_quote: 1 })
  })
})

describe("cancelar con el equipo fuera", () => {
  it("no se puede hasta registrar el retorno", async () => {
    // Cancelar proyecta el inventario a «disponible». Con el equipo en la calle eso pone en el
    // sistema que hay tres cámaras en el estante que no están.
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(3)
    await moveTo(quote.id, "in_progress")
    await moveTo(quote.id, "in_rent")

    const response = await request(
      "PATCH",
      `${base}/quotes/${quote.id}/status`,
      { status: "canceled" },
      cookie,
    )

    expect(response.status).toBe(422)
    expect(statusesOf(await unitsOf(measurementId))).toEqual({ rented: 3 })
  })

  it("se puede en cuanto vuelve todo", async () => {
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(2)
    await moveTo(quote.id, "in_progress")
    await moveTo(quote.id, "in_rent")

    const out = await unitsOf(measurementId)
    await request(
      "POST",
      `${base}/quotes/${quote.id}/returns`,
      { units: out.map((unit) => ({ unitId: unit.id, status: "available" })) },
      cookie,
    )

    const response = await request(
      "PATCH",
      `${base}/quotes/${quote.id}/status`,
      { status: "canceled" },
      cookie,
    )

    expect(response.status).toBe(200)
    expect(statusesOf(await unitsOf(measurementId))).toEqual({ available: 2 })
  })

  it("una cotización sin equipo fuera se cancela sin más", async () => {
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(2)

    const response = await request(
      "PATCH",
      `${base}/quotes/${quote.id}/status`,
      { status: "canceled" },
      cookie,
    )

    expect(response.status).toBe(200)
    expect(statusesOf(await unitsOf(measurementId))).toEqual({ available: 2 })
  })
})

describe("retorno del equipo rentado", () => {
  it("devuelve al inventario las que vuelven en condiciones", async () => {
    // Escenario: «El retorno devuelve el equipo al inventario».
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(6)
    await moveTo(quote.id, "completed")
    const rented = await unitsOf(measurementId)

    const response = await request(
      "POST",
      `${base}/quotes/${quote.id}/returns`,
      { units: rented.map((unit) => ({ unitId: unit.id, status: "available" })) },
      cookie,
    )
    expect(response.status).toBe(200)

    expect(statusesOf(await unitsOf(measurementId))).toEqual({ available: 6 })
  })

  it("no devuelve al inventario útil la que vuelve dañada", async () => {
    // Escenario: «Una unidad dañada no vuelve al inventario útil».
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(6)
    await moveTo(quote.id, "completed")
    const rented = await unitsOf(measurementId)

    await request(
      "POST",
      `${base}/quotes/${quote.id}/returns`,
      {
        units: rented.map((unit, index) => ({
          unitId: unit.id,
          status: index === 0 ? "damaged" : "available",
          ...(index === 0 ? { note: "Volvió con la montura rota" } : {}),
        })),
      },
      cookie,
    )

    expect(statusesOf(await unitsOf(measurementId))).toEqual({ available: 5, damaged: 1 })

    // Y la dañada no cuenta como disponible.
    const other = await newQuote({ ...WINDOW })
    expect((await setLines(other.id, [{ measurementId, quantity: 6 }])).status).toBe(422)
  })

  it("no acepta el retorno de una unidad que nunca salió de la nave", async () => {
    // Una cotización en progreso tiene su equipo apartado, no fuera. «Devolverlo» por esta vía
    // sería soltarlo sin pasar por la reconciliación, que es quien sabe qué líneas quedan.
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(2)
    await moveTo(quote.id, "in_progress")
    const held = await unitsOf(measurementId)

    const response = await request(
      "POST",
      `${base}/quotes/${quote.id}/returns`,
      { units: [{ unitId: held[0]?.id, status: "available" }] },
      cookie,
    )

    expect(response.status).toBe(422)
    expect(statusesOf(await unitsOf(measurementId))).toEqual({ in_quote: 2 })
  })

  it("no acepta el retorno de una unidad que no salió con esta cotización", async () => {
    await clearQuotes()
    const { quote } = await stockedQuote(2)
    await moveTo(quote.id, "completed")
    const foreign = await newStocked("Ajena", 1)
    const [unit] = await unitsOf(foreign)

    const response = await request(
      "POST",
      `${base}/quotes/${quote.id}/returns`,
      { units: [{ unitId: unit?.id, status: "available" }] },
      cookie,
    )

    expect(response.status).toBe(422)
  })
})

// ─── Eliminación ─────────────────────────────────────────────────────────────

describe("eliminación de una cotización", () => {
  it("libera lo reservado", async () => {
    await clearQuotes()
    const { quote, measurementId } = await stockedQuote(3)

    const response = await request("DELETE", `${base}/quotes/${quote.id}`, undefined, cookie)
    expect(response.status).toBe(204)

    expect(statusesOf(await unitsOf(measurementId))).toEqual({ available: 3 })
  })

  it("respeta lo vendido", async () => {
    // Escenario: «Se libera lo reservado y se respeta lo vendido».
    await clearQuotes()
    const sold = await newStocked("Vendida", 2)
    const held = await newStocked("Apartada", 3)
    const quote = await newQuote({ lines: [{ measurementId: sold, quantity: 2 }], type: "sale" })
    await moveTo(quote.id, "sold")

    const lines = await linesOf(quote.id)
    await request(
      "PUT",
      `${base}/quotes/${quote.id}/lines`,
      {
        lines: [
          ...lines.map((row) => ({ id: row.id, measurementId: row.measurementId, quantity: 0 })),
        ],
      },
      cookie,
    )

    expect(statusesOf(await unitsOf(sold))).toEqual({ sold: 2 })
    expect(statusesOf(await unitsOf(held))).toEqual({ available: 3 })
  })

  it("no se elimina con equipo sin devolver", async () => {
    // Escenario: «No se elimina con equipo fuera».
    await clearQuotes()
    const { quote } = await stockedQuote(2)
    await moveTo(quote.id, "in_rent")

    const response = await request("DELETE", `${base}/quotes/${quote.id}`, undefined, cookie)

    expect(response.status).toBe(422)
    expect((await json<{ message: string }>(response)).message).toMatch(/devolver|retorno/i)
  })
})

// ─── Coherencia ──────────────────────────────────────────────────────────────

describe("coherencia entre reservas e inventario", () => {
  it("no comunica nada cuando todo cuadra", async () => {
    await clearWarehouse()
    await stockedQuote(3)

    const report = await json<{ items: { unitId: string; reason: string }[] }>(
      await request("GET", `${base}/reservation-coherence`, undefined, cookie),
    )

    expect(report.items).toHaveLength(0)
  })

  it("detecta una unidad rentada sin vínculo vivo", async () => {
    // El agujero que tapa esta rebanada: el escaneo de huérfanas sólo miraba entre las `in_quote`,
    // así que una unidad que se quedó `rented` sin dueño era invisible — comprometida para siempre
    // y sin nadie a quien reclamarla.
    await clearWarehouse()
    const { quote, measurementId } = await stockedQuote(3)
    await moveTo(quote.id, "in_progress")
    await moveTo(quote.id, "in_rent")
    const [unit] = await unitsOf(measurementId)

    // Se rompe por debajo, que es como se rompería de verdad.
    await db
      .update(warehouseStockReservations)
      .set({ releasedAt: new Date() })
      .where(eq(warehouseStockReservations.stockUnitId, unit?.id ?? ""))

    const report = await json<{ items: { unitId: string; reason: string }[] }>(
      await request("GET", `${base}/reservation-coherence`, undefined, cookie),
    )

    expect(report.items).toHaveLength(1)
    expect(report.items[0]?.unitId).toBe(unit?.id)
    expect(report.items[0]?.reason).toBe("committed_without_link")
  })

  it("detecta una unidad en cotización sin vínculo vivo", async () => {
    // Escenario: «La verificación detecta una discrepancia».
    await clearWarehouse()
    const { measurementId } = await stockedQuote(3)
    const [unit] = await unitsOf(measurementId)

    // Se rompe por debajo, que es como se rompería de verdad.
    await db
      .update(warehouseStockReservations)
      .set({ releasedAt: new Date() })
      .where(eq(warehouseStockReservations.stockUnitId, unit?.id ?? ""))

    const report = await json<{ items: { unitId: string; reason: string }[] }>(
      await request("GET", `${base}/reservation-coherence`, undefined, cookie),
    )

    expect(report.items).toHaveLength(1)
    expect(report.items[0]?.unitId).toBe(unit?.id)
  })
})

describe("pagos cobrados contra la cotización", () => {
  it("el saldo baja con lo que entra, y el total pactado no se mueve", async () => {
    // El anticipo es lo pactado y mueve el documento; el pago es lo que entró y mueve el saldo.
    await clearQuotes()
    const { measurementId, priceId } = await pricedProduct("Foco", 4, { sale: "250.00" })
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId, quantity: 4, productPriceId: priceId }],
    })
    await request(
      "PUT",
      `${base}/quotes/${quote.id}/payment-terms`,
      { version: 1, advance: { amount: "300.00" } },
      cookie,
    )

    const before = await breakdownOf(quote.id)
    expect(before.total).toBe("700.00")
    expect(before.collected).toBe("0.00")
    // Pactar no es cobrar: mientras nadie pague, falta la cotización entera.
    expect(before.balance).toBe("1000.00")

    const created = await request(
      "POST",
      `${base}/quotes/${quote.id}/payments`,
      { amount: "300.00", method: "transfer", description: "Anticipo" },
      cookie,
    )
    expect(created.status).toBe(201)

    const after = await breakdownOf(quote.id)
    expect(after.total).toBe("700.00")
    expect(after.collected).toBe("300.00")
    expect(after.balance).toBe("700.00")
  })

  it("una cotización cerrada sigue admitiendo cobro", async () => {
    // Al revés que las líneas: una renta que terminó se sigue pagando, y un documento que no lo
    // admita obliga a llevar la cuenta fuera del sistema.
    await clearQuotes()
    const { measurementId, priceId } = await pricedProduct("Foco", 2, { sale: "250.00" })
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId, quantity: 2, productPriceId: priceId }],
    })
    await moveTo(quote.id, "sold")

    const created = await request(
      "POST",
      `${base}/quotes/${quote.id}/payments`,
      { amount: "200.00", method: "cash" },
      cookie,
    )
    expect(created.status).toBe(201)

    // Los importes siguen congelados, y el saldo **no**: se recalcula sobre lo congelado.
    const breakdown = await breakdownOf(quote.id)
    expect(breakdown.total).toBe("500.00")
    expect(breakdown.collected).toBe("200.00")
    expect(breakdown.balance).toBe("300.00")
  })

  it("los pagos llegan del más reciente al más antiguo, con quién los registró", async () => {
    await clearQuotes()
    const quote = await newQuote({ type: "sale" })

    for (const amount of ["100.00", "200.00"]) {
      await request(
        "POST",
        `${base}/quotes/${quote.id}/payments`,
        { amount, method: "cash" },
        cookie,
      )
    }

    const listed = await json<{ items: { amount: string; paidByName: string | null }[] }>(
      await request("GET", `${base}/quotes/${quote.id}/payments`, undefined, cookie),
    )

    expect(listed.items.map((row) => row.amount)).toEqual(["200.00", "100.00"])
    expect(listed.items[0]?.paidByName).not.toBeNull()
  })

  it("dar de baja un pago devuelve el saldo a donde estaba", async () => {
    await clearQuotes()
    const { measurementId, priceId } = await pricedProduct("Foco", 2, { sale: "250.00" })
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId, quantity: 2, productPriceId: priceId }],
    })

    const payment = await json<{ id: string }>(
      await request(
        "POST",
        `${base}/quotes/${quote.id}/payments`,
        { amount: "150.00", method: "card" },
        cookie,
      ),
    )
    expect((await breakdownOf(quote.id)).balance).toBe("350.00")

    const removed = await request(
      "DELETE",
      `${base}/quotes/${quote.id}/payments/${payment.id}`,
      undefined,
      cookie,
    )
    expect(removed.status).toBe(204)
    expect((await breakdownOf(quote.id)).balance).toBe("500.00")
  })

  it("no se da de baja un pago de otra cotización", async () => {
    await clearQuotes()
    const mine = await newQuote({ type: "sale" })
    const other = await newQuote({ type: "sale" })

    const payment = await json<{ id: string }>(
      await request(
        "POST",
        `${base}/quotes/${other.id}/payments`,
        { amount: "50.00", method: "cash" },
        cookie,
      ),
    )

    const response = await request(
      "DELETE",
      `${base}/quotes/${mine.id}/payments/${payment.id}`,
      undefined,
      cookie,
    )

    expect(response.status).toBe(404)
    expect((await breakdownOf(other.id)).collected).toBe("50.00")
  })
})

// ─── Importes ────────────────────────────────────────────────────────────────

interface Breakdown {
  linesTotal: string
  packagePrice?: string
  additionals: string
  subtotal: string
  discount: string
  base: string
  net: string
  fees: string
  gross: string
  total: string
  collected: string
  balance: string
  penalty: string
  deposit: string
  lines: {
    lineId: string
    unitCost?: string
    total: string
    appliedDays: string
    unpriced: boolean
  }[]
  groups: { productId: string; subtotal: string }[]
}

/** Un producto con tarifa de venta en una lista de precios, y unidades. */
async function pricedProduct(
  name: string,
  quantity: number,
  price: { sale?: string; rent?: Record<string, unknown>; penalty?: Record<string, unknown> },
): Promise<{ measurementId: string; productId: string; priceId: string }> {
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
  const priceRow = await json<{ id: string }>(
    await request(
      "PUT",
      `${base}/price-lists/${list.id}/prices/${product.id}`,
      {
        sale: price.sale ?? "0.00",
        rent: price.rent ?? { isFixed: false },
        penalty: price.penalty ?? { isFixed: false },
      },
      cookie,
    ),
  )

  return {
    measurementId: product.measurements[0]?.id as string,
    productId: product.id,
    priceId: priceRow.id,
  }
}

async function breakdownOf(quoteId: string): Promise<Breakdown> {
  const response = await request("GET", `${base}/quotes/${quoteId}/breakdown`, undefined, cookie)
  expect(response.status).toBe(200)
  return json<Breakdown>(response)
}

describe("el cálculo es autoridad del servidor", () => {
  it("calcula el importe de una venta a partir de las tarifas del catálogo", async () => {
    await clearWarehouse()
    const { measurementId, priceId } = await pricedProduct("Foco", 4, { sale: "250.00" })
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId, quantity: 4, productPriceId: priceId }],
    })

    const breakdown = await breakdownOf(quote.id)

    expect(breakdown.lines[0]?.unitCost).toBe("250.00")
    expect(breakdown.subtotal).toBe("1000.00")
    expect(breakdown.total).toBe("1000.00")
  })

  it("aplica la tarifa de renta por los días de la ventana", async () => {
    await clearWarehouse()
    // Diez días en frecuencia semanal son 1.43 semanas: 100.00 × 1.43 = 143.00 por unidad.
    const { measurementId, priceId } = await pricedProduct("Cámara", 2, {
      rent: { isFixed: false, weekly: "100.00" },
    })
    const quote = await newQuote({
      ...WINDOW,
      lines: [{ measurementId, quantity: 2, productPriceId: priceId, frequency: "weekly" }],
    })

    const breakdown = await breakdownOf(quote.id)

    expect(breakdown.lines[0]?.appliedDays).toBe("1.43")
    expect(breakdown.lines[0]?.total).toBe("286.00")
  })

  it("descarta los importes que llegan del cliente", async () => {
    await clearWarehouse()
    const { measurementId, priceId } = await pricedProduct("Foco", 2, { sale: "250.00" })
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId, quantity: 2, productPriceId: priceId }],
    })

    // Se envía un total inferior al que corresponde; el esquema ni siquiera lo admite.
    const response = await request(
      "PUT",
      `${base}/quotes/${quote.id}/payment-terms`,
      { version: 1, total: "1.00" },
      cookie,
    )
    expect([200, 400]).toContain(response.status)

    expect((await breakdownOf(quote.id)).total).toBe("500.00")
  })

  it("aplica impuestos y comisiones sobre el neto", async () => {
    await clearWarehouse()
    const { measurementId, priceId } = await pricedProduct("Foco", 4, { sale: "250.00" })
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId, quantity: 4, productPriceId: priceId }],
    })

    await request(
      "PUT",
      `${base}/quotes/${quote.id}/taxes`,
      { version: 1, iva: { enabled: true, rate: "16", type: "trasladado" } },
      cookie,
    )
    await request(
      "PUT",
      `${base}/quotes/${quote.id}/payment-terms`,
      { version: 1, transferFeeRate: "3", advance: { amount: "500.00" } },
      cookie,
    )

    const breakdown = await breakdownOf(quote.id)

    expect(breakdown.net).toBe("1160.00")
    expect(breakdown.fees).toBe("34.80")
    expect(breakdown.gross).toBe("1194.80")
    expect(breakdown.total).toBe("694.80")
  })

  it("conserva el paquete, los adicionales y el depósito, y los recalcula", async () => {
    // El bloque entero por la ruta: el paquete sustituye a las líneas, el concepto adicional suma
    // encima, y el depósito se informa sin tocar el total.
    await clearWarehouse()
    const { measurementId, priceId } = await pricedProduct("Foco", 4, { sale: "250.00" })
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId, quantity: 4, productPriceId: priceId }],
    })

    await request(
      "PUT",
      `${base}/quotes/${quote.id}/payment-terms`,
      {
        version: 1,
        fixedPrice: "800.00",
        additionals: [{ name: "Traslado", amount: "150.00" }],
        deposit: { amount: "5000.00", method: "transfer" },
      },
      cookie,
    )

    const breakdown = await breakdownOf(quote.id)

    expect(breakdown.linesTotal).toBe("1000.00")
    expect(breakdown.packagePrice).toBe("800.00")
    expect(breakdown.additionals).toBe("150.00")
    expect(breakdown.subtotal).toBe("950.00")
    expect(breakdown.total).toBe("950.00")
    expect(breakdown.deposit).toBe("5000.00")
  })

  it("agrupa las líneas por producto", async () => {
    await clearWarehouse()
    const first = await pricedProduct("Cámara", 2, { sale: "100.00" })
    const second = await pricedProduct("Grúa", 2, { sale: "300.00" })
    const quote = await newQuote({
      type: "sale",
      lines: [
        { measurementId: first.measurementId, quantity: 1, productPriceId: first.priceId },
        { measurementId: second.measurementId, quantity: 2, productPriceId: second.priceId },
      ],
    })

    const breakdown = await breakdownOf(quote.id)

    expect(breakdown.groups).toHaveLength(2)
    expect(breakdown.groups.map((group) => group.subtotal)).toEqual(["100.00", "600.00"])
  })
})

describe("los importes se congelan al cerrar", () => {
  it("una cotización cerrada no cambia aunque cambien las tarifas", async () => {
    // Escenario: «Una cotización cerrada no se mueve».
    await clearWarehouse()
    const { measurementId, priceId, productId } = await pricedProduct("Foco", 2, {
      sale: "250.00",
    })
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId, quantity: 2, productPriceId: priceId }],
    })
    expect((await breakdownOf(quote.id)).total).toBe("500.00")

    await moveTo(quote.id, "sold")

    const lists = await json<{ items: { id: string }[] }>(
      await request("GET", `${base}/price-lists`, undefined, cookie),
    )
    await request(
      "PUT",
      `${base}/price-lists/${lists.items[0]?.id}/prices/${productId}`,
      { sale: "500.00", rent: { isFixed: false }, penalty: { isFixed: false } },
      cookie,
    )

    expect((await breakdownOf(quote.id)).total).toBe("500.00")
  })

  it("una cotización abierta sí refleja el cambio de tarifa", async () => {
    // Escenario: «Una cotización abierta sí se recalcula».
    await clearWarehouse()
    const { measurementId, priceId, productId } = await pricedProduct("Foco", 2, {
      sale: "250.00",
    })
    const quote = await newQuote({
      type: "sale",
      lines: [{ measurementId, quantity: 2, productPriceId: priceId }],
    })

    const lists = await json<{ items: { id: string }[] }>(
      await request("GET", `${base}/price-lists`, undefined, cookie),
    )
    await request(
      "PUT",
      `${base}/price-lists/${lists.items[0]?.id}/prices/${productId}`,
      { sale: "500.00", rent: { isFixed: false }, penalty: { isFixed: false } },
      cookie,
    )

    expect((await breakdownOf(quote.id)).total).toBe("1000.00")
  })
})

// ─── Permisos del cambio de estado ───────────────────────────────────────────

let scopedAccounts = 0

/** Una cuenta de la misma empresa con un rol acotado a las claves que se le pasen. */
async function memberWith(permissions: string[]): Promise<string> {
  // Con `newId()` recortado no basta: son identificadores ordenados por tiempo y su prefijo es el
  // mismo dentro de la misma ventana, así que tres cuentas seguidas compartirían correo.
  scopedAccounts += 1
  const email = `acotada-${scopedAccounts}@ejemplo.mx`
  await request("POST", "/auth/register", { email, password: PASSWORD, name: "Acotada" })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  const roleId = newId()
  await db
    .insert(roles)
    .values({ id: roleId, companyId, name: `Rol acotado ${scopedAccounts}`, permissions })
  await db
    .insert(companyMembers)
    .values({ id: newId(), companyId, userId: user?.id ?? "", roleId, isOwner: false })

  const login = await request("POST", "/auth/login", { email, password: PASSWORD })
  return (
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""
  )
}

describe("sacar el equipo tiene su propia clave", () => {
  it("mover la cotización por la bandeja no autoriza a sacar el equipo", async () => {
    // La matriz anterior separa `edit_status`, `rented` y `finished`. Colapsarlas en una sola
    // ampliaría la autoridad de quien sólo tenía la primera.
    await clearQuotes()
    const { quote } = await stockedQuote(2)
    const scoped = await memberWith(["warehouses.quotes.view", "warehouses.quotes.edit_status"])

    const moved = await request(
      "PATCH",
      `${base}/quotes/${quote.id}/status`,
      { status: "pending" },
      scoped,
    )
    expect(moved.status).toBe(200)

    const out = await request(
      "PATCH",
      `${base}/quotes/${quote.id}/status`,
      { status: "in_progress" },
      scoped,
    )
    expect(out.status).toBe(200)

    const rented = await request(
      "PATCH",
      `${base}/quotes/${quote.id}/status`,
      { status: "in_rent" },
      scoped,
    )
    expect(rented.status).toBe(403)
  })

  it("con la clave de sacar el equipo, sí", async () => {
    await clearQuotes()
    const { quote } = await stockedQuote(2)
    const scoped = await memberWith([
      "warehouses.quotes.view",
      "warehouses.quotes.edit_status",
      "warehouses.quotes.rented",
    ])

    const rented = await request(
      "PATCH",
      `${base}/quotes/${quote.id}/status`,
      { status: "in_rent" },
      scoped,
    )

    expect(rented.status).toBe(200)
  })

  it("dar por terminada una cotización exige la suya", async () => {
    await clearQuotes()
    const { quote } = await stockedQuote(2, { type: "sale" })
    const scoped = await memberWith(["warehouses.quotes.view", "warehouses.quotes.edit_status"])

    const done = await request(
      "PATCH",
      `${base}/quotes/${quote.id}/status`,
      { status: "completed" },
      scoped,
    )

    expect(done.status).toBe(403)
  })
})

// ─── Precio negociado y renta sin tarifa ─────────────────────────────────────

describe("el precio negociado de una línea", () => {
  it("sustituye a la tarifa y vale por el periodo completo", async () => {
    // Escenario: «El precio negociado sustituye a la tarifa y a los días».
    await clearWarehouse()
    const measurementId = await newStocked("Grúa", 3)
    const quote = await newQuote({ ...WINDOW })

    expect(
      (await setLines(quote.id, [{ measurementId, quantity: 3, price: "3500.00" }])).status,
    ).toBe(200)

    const amounts = await breakdownOf(quote.id)
    expect(amounts.lines[0]?.total).toBe("3500.00")
    expect(amounts.subtotal).toBe("3500.00")
    expect(amounts.lines[0]?.unitCost).toBeUndefined()
  })

  it("retirarlo deja la línea como estaba", async () => {
    await clearWarehouse()
    const measurementId = await newStocked("Tramoya", 2)
    const quote = await newQuote({ ...WINDOW })
    await setLines(quote.id, [{ measurementId, quantity: 2, price: "900.00" }])
    const [line] = await linesOf(quote.id)

    expect((await breakdownOf(quote.id)).subtotal).toBe("900.00")

    await setLines(quote.id, [{ id: line?.id, measurementId, quantity: 2, price: null }])

    expect(await breakdownOf(quote.id)).toMatchObject({ subtotal: "0.00" })
  })
})

describe("una renta sin tarifa no se cobra al precio de venta", () => {
  it("la línea queda sin precio en vez de cobrar el catálogo por día", async () => {
    // La corrección de `quotation-pricing`: el precio base es el de **venta**, y multiplicado por
    // los diez días de la ventana cobraría el equipo diez veces.
    await clearWarehouse()
    const product = await json<Product>(
      await request(
        "POST",
        `${base}/products`,
        {
          name: "Cámara",
          price: "50000.00",
          measurements: [{ name: "Cuerpo", initialQuantity: 1 }],
        },
        cookie,
      ),
    )
    const measurementId = product.measurements[0]?.id as string
    const quote = await newQuote({ ...WINDOW })

    await setLines(quote.id, [{ measurementId, quantity: 1 }])

    const amounts = await breakdownOf(quote.id)
    expect(amounts.subtotal).toBe("0.00")
    expect(amounts.lines[0]?.unpriced).toBe(true)
  })

  it("una venta sí cobra el precio del producto", async () => {
    await clearWarehouse()
    const product = await json<Product>(
      await request(
        "POST",
        `${base}/products`,
        { name: "Cable", price: "250.00", measurements: [{ name: "Pieza", initialQuantity: 2 }] },
        cookie,
      ),
    )
    const measurementId = product.measurements[0]?.id as string
    const quote = await newQuote({ type: "sale" })

    await setLines(quote.id, [{ measurementId, quantity: 2 }])

    const amounts = await breakdownOf(quote.id)
    expect(amounts.subtotal).toBe("500.00")
    expect(amounts.lines[0]?.unpriced).toBe(false)
  })
})

describe("un producto provisional", () => {
  it("no se publica mientras lo sea", async () => {
    // La marca no es informativa: es lo que impide que un alta hecha a la carrera delante de un
    // cliente acabe en la tienda pública.
    await clearWarehouse()
    const product = await json<Product>(
      await request(
        "POST",
        `${base}/products`,
        { name: "Equipo sin catalogar", isProvisional: true, isPublished: true },
        cookie,
      ),
    )

    expect(product.isProvisional).toBe(true)
    expect(product.isPublished).toBe(false)
  })

  it("publicarlo después tampoco funciona mientras siga provisional", async () => {
    await clearWarehouse()
    const product = await json<Product>(
      await request(
        "POST",
        `${base}/products`,
        { name: "Equipo sin catalogar", isProvisional: true },
        cookie,
      ),
    )

    const response = await request(
      "PATCH",
      `${base}/products/${product.id}`,
      { isPublished: true },
      cookie,
    )

    expect(response.status).toBe(409)
  })

  it("se puede dar de alta con su medida y sus unidades de una vez", async () => {
    // Es lo que hace posible el alta desde el constructor: producto, medida y existencias en una
    // sola transacción. Encadenar tres peticiones desde el navegador dejaría productos huérfanos
    // el día que la segunda falle.
    await clearWarehouse()
    const product = await json<Product & { measurements: { id: string; name: string }[] }>(
      await request(
        "POST",
        `${base}/products`,
        {
          name: "Grúa prestada",
          isProvisional: true,
          availableForRent: true,
          measurements: [{ name: "Única", initialQuantity: 2 }],
        },
        cookie,
      ),
    )

    expect(product.isProvisional).toBe(true)
    expect(product.measurements).toHaveLength(1)

    // Y sus unidades quedan libres, listas para que una línea las aparte.
    const measurementId = product.measurements[0]?.id as string
    expect(statusesOf(await unitsOf(measurementId))).toEqual({ available: 2 })
  })

  it("la bandeja los encuentra por su marca", async () => {
    // Sin filtro, «ya lo completaré luego» es una intención; con él es una lista.
    await clearWarehouse()
    await request("POST", `${base}/products`, { name: "De catálogo" }, cookie)
    await request(
      "POST",
      `${base}/products`,
      { name: "A medio hacer", isProvisional: true },
      cookie,
    )

    const tray = await json<{ items: { name: string }[] }>(
      await request("GET", `${base}/products?isProvisional=true`, undefined, cookie),
    )

    expect(tray.items.map((row) => row.name)).toEqual(["A medio hacer"])
  })

  it("quitarle la marca exige la clave de catálogo", async () => {
    await clearWarehouse()
    const product = await json<Product>(
      await request(
        "POST",
        `${base}/products`,
        { name: "Equipo sin catalogar", isProvisional: true },
        cookie,
      ),
    )
    const scoped = await memberWith(["warehouses.products.view", "warehouses.products.edit_info"])

    const denied = await request(
      "PATCH",
      `${base}/products/${product.id}`,
      { isProvisional: false },
      scoped,
    )
    expect(denied.status).toBe(403)

    const allowed = await request(
      "PATCH",
      `${base}/products/${product.id}`,
      { isProvisional: false },
      cookie,
    )
    expect(allowed.status).toBe(200)
  })
})

// ─── La tarifa que viaja con cada línea ──────────────────────────────────────

describe("cada línea trae la tarifa con la que se calculó", () => {
  it("la tarifa de la línea es la de su entrada de lista, no la del precio escalar", async () => {
    // Sin esto el constructor previsualiza con el precio de venta del producto y enseña un total
    // distinto del que el servidor acaba de calcular, que es la mitad del defecto M-06.
    await clearWarehouse()
    const product = await json<Product>(
      await request(
        "POST",
        `${base}/products`,
        { name: "Cámara", price: "700.00", measurements: [{ name: "Cuerpo", initialQuantity: 2 }] },
        cookie,
      ),
    )
    const measurementId = product.measurements[0]?.id as string

    const list = await json<{ id: string }>(
      await request("POST", `${base}/price-lists`, { name: "Tarifas" }, cookie),
    )
    const price = await json<{ id: string }>(
      await request(
        "PUT",
        `${base}/price-lists/${list.id}/prices/${product.id}`,
        {
          sale: "700.00",
          rent: { isFixed: false, weekly: "70.00" },
          penalty: { isFixed: false },
        },
        cookie,
      ),
    )

    const quote = await newQuote({ ...WINDOW })
    await setLines(quote.id, [
      { measurementId, quantity: 1, frequency: "weekly", productPriceId: price.id },
    ])

    const [line] = await linesOf(quote.id)

    expect(line?.basePrice).toBe("700.00")
    expect(line?.rent).toEqual({ isFixed: false, weekly: "70.00" })
  })

  it("dice cuántas unidades quedan libres de esa medida, sin contar las suyas", async () => {
    // Es el tope que el editor puede ofrecer sin pedir nada más: lo libre más lo propio.
    await clearWarehouse()
    const measurementId = await newStocked("Trípode", 5)
    const quote = await newQuote({ ...WINDOW })
    await setLines(quote.id, [{ measurementId, quantity: 2 }])

    const [line] = await linesOf(quote.id)

    expect(line?.quantity).toBe(2)
    expect(line?.available).toBe(3)
  })
})

// ─── El equipo que tiene una cotización ──────────────────────────────────────

interface HeldUnit {
  id: string
  code: string
  status: string
  productName: string
  measurementName: string
}

async function heldBy(quoteId: string): Promise<HeldUnit[]> {
  const response = await request("GET", `${base}/quotes/${quoteId}/units`, undefined, cookie)
  expect(response.status).toBe(200)
  return (await json<{ items: HeldUnit[] }>(response)).items
}

describe("el equipo que tiene apartado una cotización", () => {
  it("nombra cada unidad, con su código y su estado", async () => {
    // Sin esto no hay manera de registrar un retorno: hay que decir qué unidad vuelve y cómo.
    await clearQuotes()
    const { quote } = await stockedQuote(3)

    const units = await heldBy(quote.id)

    expect(units).toHaveLength(3)
    expect(units[0]?.code).not.toBe("")
    expect(units[0]?.status).toBe("in_quote")
    expect(units[0]?.productName).not.toBe("")
  })

  it("una unidad rentada figura como tal", async () => {
    await clearQuotes()
    const { quote } = await stockedQuote(2)
    expect((await moveTo(quote.id, "in_rent")).status).toBe(200)

    expect((await heldBy(quote.id)).map((unit) => unit.status)).toEqual(["rented", "rented"])
  })

  it("lo devuelto deja de figurar", async () => {
    await clearQuotes()
    const { quote } = await stockedQuote(2)
    await moveTo(quote.id, "in_rent")
    const [first] = await heldBy(quote.id)

    const returned = await request(
      "POST",
      `${base}/quotes/${quote.id}/returns`,
      { units: [{ unitId: first?.id, status: "available" }] },
      cookie,
    )
    expect(returned.status).toBe(200)

    expect(await heldBy(quote.id)).toHaveLength(1)
  })
})

// ─── Tarifas y existencia para el constructor ────────────────────────────────

interface Candidate {
  measurementId: string
  measurementName: string
  productId: string
  productName: string
  productCode: string
  productPriceId: string | null
  basePrice: string
  rent?: { isFixed: boolean; daily?: string; weekly?: string; monthly?: string }
  penalty?: { isFixed: boolean; fixed?: string }
  available: number
}

async function ratesOf(query = "", auth = cookie): Promise<Response> {
  return request("GET", `${base}/rates${query}`, undefined, auth)
}

async function candidates(query = ""): Promise<Candidate[]> {
  const response = await ratesOf(query)
  expect(response.status).toBe(200)
  return (await json<{ items: Candidate[] }>(response)).items
}

describe("tarifas y existencia para el constructor", () => {
  it("lista cada medida con lo que queda disponible de ella", async () => {
    await clearWarehouse()
    const measurementId = await newStocked("Grúa", 6)

    const [candidate] = await candidates(`?measurementId=${measurementId}`)

    expect(candidate?.measurementId).toBe(measurementId)
    expect(candidate?.productName).toBe("Grúa")
    expect(candidate?.available).toBe(6)
  })

  it("lo apartado por otra cotización deja de contar como disponible", async () => {
    // Es la mitad del requisito de la 29b: la disponibilidad se ve mientras se edita, y tiene que
    // ser la de verdad. Contar el inventario entero invitaría a comprometer equipo dos veces.
    await clearWarehouse()
    const measurementId = await newStocked("Tramoya", 5)
    const quote = await newQuote({ ...WINDOW })
    expect((await setLines(quote.id, [{ measurementId, quantity: 2 }])).status).toBe(200)

    const [candidate] = await candidates(`?measurementId=${measurementId}`)

    expect(candidate?.available).toBe(3)
  })

  it("sin lista de precios, el precio de partida es el del producto", async () => {
    await clearWarehouse()
    const product = await json<Product>(
      await request(
        "POST",
        `${base}/products`,
        { name: "Tripié", price: "1500.00", measurements: [{ name: "Cuerpo" }] },
        cookie,
      ),
    )

    const [candidate] = await candidates(`?productId=${product.id}`)

    expect(candidate?.basePrice).toBe("1500.00")
    expect(candidate?.productPriceId).toBeNull()
    expect(candidate?.rent).toBeUndefined()
  })

  it("con lista de precios, devuelve la tarifa resuelta y de qué entrada salió", async () => {
    await clearWarehouse()
    const product = await json<Product>(
      await request(
        "POST",
        `${base}/products`,
        {
          name: "Dolly",
          price: "1500.00",
          measurements: [{ name: "Cuerpo", priceDifference: "100.00" }],
        },
        cookie,
      ),
    )

    const list = await json<{ id: string }>(
      await request("POST", `${base}/price-lists`, { name: "Temporada alta" }, cookie),
    )
    const price = await json<{ id: string }>(
      await request(
        "PUT",
        `${base}/price-lists/${list.id}/prices/${product.id}`,
        { sale: "1200.00", rent: { isFixed: false, daily: "300.00" }, penalty: { isFixed: false } },
        cookie,
      ),
    )

    const [candidate] = await candidates(`?productId=${product.id}&priceListId=${list.id}`)

    // La tarifa de la lista manda sobre el escalar, y el ajuste de la medida alcanza a las dos.
    expect(candidate?.basePrice).toBe("1300.00")
    expect(candidate?.rent).toEqual({ isFixed: false, daily: "400.00" })
    expect(candidate?.productPriceId).toBe(price.id)
  })

  it("una lista sin entrada para el producto lo deja con su precio escalar", async () => {
    await clearWarehouse()
    const product = await json<Product>(
      await request(
        "POST",
        `${base}/products`,
        { name: "Reflector", price: "800.00", measurements: [{ name: "Cuerpo" }] },
        cookie,
      ),
    )
    const list = await json<{ id: string }>(
      await request("POST", `${base}/price-lists`, { name: "Vacía" }, cookie),
    )

    const [candidate] = await candidates(`?productId=${product.id}&priceListId=${list.id}`)

    expect(candidate?.basePrice).toBe("800.00")
    expect(candidate?.productPriceId).toBeNull()
  })

  it("resuelve varias medidas de una vez, que es como las pide una cotización abierta", async () => {
    // La ficha necesita la tarifa de las medidas que ya tiene, y son las que sean. Sin conjunto
    // haría una petición por línea.
    await clearWarehouse()
    const first = await newStocked("Óptica 35", 1)
    const second = await newStocked("Óptica 50", 1)
    await newStocked("Óptica 85", 1)

    const found = await candidates(`?measurementId=${first},${second}`)

    expect(found.map((item) => item.measurementId).sort()).toEqual([first, second].sort())
  })

  it("busca por nombre de producto sin acentos", async () => {
    await clearWarehouse()
    await newStocked("Cámara Alexa", 1)
    await newStocked("Micrófono", 1)

    const found = await candidates("?search=camara")

    expect(found).toHaveLength(1)
    expect(found[0]?.productName).toBe("Cámara Alexa")
  })

  it("exige la clave de editar las líneas, no la de mirar la cotización", async () => {
    // Publica tarifas negociadas y existencia junto a ellas. Quien sólo puede mirar una cotización
    // no tiene por qué ver la lista de precios entera del almacén.
    await clearWarehouse()
    const scoped = await memberWith(["warehouses.quotes.view"])

    expect((await ratesOf("", scoped)).status).toBe(403)

    const editor = await memberWith(["warehouses.quotes.view", "warehouses.quotes.edit_products"])
    expect((await ratesOf("", editor)).status).toBe(200)
  })
})
