/**
 * Pedidos de almacén, por HTTP.
 *
 * Transcritas de `openspec/specs/warehouse-orders/spec.md`. Lo que más importa aquí es que
 * **aceptar sea atómico**: la pila anterior creaba la cotización, reservaba y enlazaba en pasos
 * sueltos, y un fallo a mitad dejaba pedidos aceptados sin cotización o cotizaciones con reservas
 * que nadie reclamaba.
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
  warehouseOrderLines,
  warehouseOrders,
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
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${counterparties}, ${warehouseOrderLines}, ${warehouseOrders}, ${warehouseStockReservations}, ${warehouseQuoteLines}, ${warehouseQuotes}, ${warehouseStockEvents}, ${warehouseStockUnits}, ${warehouseMeasurements}, ${warehouseProductPrices}, ${warehousePriceLists}, ${warehouseProducts}, ${warehouseCategories}, ${warehouseStorages}, ${warehouses}, ${services}, ${companies} cascade`,
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
let base = ""

interface Order {
  id: string
  code: string
  status: string
  quoteId: string | null
  cancelReason: string | null
  unread: number
}

beforeAll(async () => {
  await reset()

  const email = "pedidos@ejemplo.mx"
  await request("POST", "/auth/register", { email, password: PASSWORD, name: "Pedidos" })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const login = await request("POST", "/auth/login", { email, password: PASSWORD })
  cookie =
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""

  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name: "Renta del Bajío" }, cookie),
  )

  const serviceId = newId()
  await db.insert(services).values({ id: serviceId, keycode: "warehouses", name: "Almacenes" })
  await db.insert(companyServices).values({ id: newId(), companyId: company.id, serviceId })

  const warehouse = await json<{ id: string }>(
    await request("POST", `/companies/${company.id}/warehouses`, { name: "Nave" }, cookie),
  )
  base = `/companies/${company.id}/warehouses/${warehouse.id}`
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

/** Una medida con `quantity` unidades libres. */
async function stocked(name: string, quantity: number): Promise<string> {
  const product = await json<{ measurements: { id: string }[] }>(
    await request(
      "POST",
      `${base}/products`,
      {
        name: `${name} ${Date.now()}`,
        availableForRent: true,
        measurements: [{ name: "Única", initialQuantity: quantity }],
      },
      cookie,
    ),
  )
  return product.measurements[0]?.id as string
}

async function newOrder(lines: { measurementId: string; quantity: number }[]): Promise<Order> {
  const response = await request(
    "POST",
    `${base}/orders`,
    { origin: "production", type: "rent", name: "Pedido de prueba", lines },
    cookie,
  )
  expect(response.status).toBe(201)
  return json<Order>(response)
}

function accept(orderId: string, body: unknown = {}) {
  return request("POST", `${base}/orders/${orderId}/acceptance`, body, cookie)
}

describe("aceptar un pedido genera su cotización", () => {
  it("deja el pedido aceptado, la cotización en progreso y el equipo apartado", async () => {
    // Escenario: «Aceptar produce la cotización con el inventario apartado».
    const first = await stocked("Cámara", 3)
    const second = await stocked("Trípode", 2)
    const order = await newOrder([
      { measurementId: first, quantity: 2 },
      { measurementId: second, quantity: 2 },
    ])

    const response = await accept(order.id)
    expect(response.status).toBe(201)

    const result = await json<{ order: Order; quoteId: string; excluded: unknown[] }>(response)
    expect(result.order.status).toBe("accepted")
    expect(result.excluded).toHaveLength(0)

    const quote = await json<{ status: string; folio: string; orderId: string | null }>(
      await request("GET", `${base}/quotes/${result.quoteId}`, undefined, cookie),
    )
    expect(quote.status).toBe("in_progress")
    // El folio sale del código del pedido: es lo que hace reconocible de dónde vino el documento.
    expect(quote.folio).toBe(order.code)
    expect(quote.orderId).toBe(order.id)

    const lines = await json<{ items: { quantity: number }[] }>(
      await request("GET", `${base}/quotes/${result.quoteId}/lines`, undefined, cookie),
    )
    expect(lines.items.map((line) => line.quantity)).toEqual([2, 2])
  })

  it("no se acepta dos veces", async () => {
    // Escenario: «Un pedido ya aceptado no se acepta dos veces».
    const measurementId = await stocked("Foco", 2)
    const order = await newOrder([{ measurementId, quantity: 1 }])
    await accept(order.id)

    const second = await accept(order.id)
    expect(second.status).toBe(409)

    const quotes = await db
      .select({ id: warehouseQuotes.id })
      .from(warehouseQuotes)
      .where(eq(warehouseQuotes.orderId, order.id))
    expect(quotes).toHaveLength(1)
  })

  it("un fallo al reservar deja el pedido como estaba", async () => {
    // Escenario: «Un fallo al reservar no acepta el pedido». Se pide más de lo que hay y se exige
    // que entre todo: la reserva falla y **nada** queda a medias.
    const measurementId = await stocked("Grúa", 1)
    const order = await newOrder([{ measurementId, quantity: 5 }])

    const response = await accept(order.id, { includeAll: true })
    expect(response.status).toBe(422)

    const [after] = await db
      .select({ status: warehouseOrders.status, quoteId: warehouseOrders.quoteId })
      .from(warehouseOrders)
      .where(eq(warehouseOrders.id, order.id))
    expect(after?.status).toBe("pending")
    expect(after?.quoteId).toBeNull()

    const quotes = await db
      .select({ id: warehouseQuotes.id })
      .from(warehouseQuotes)
      .where(eq(warehouseQuotes.orderId, order.id))
    expect(quotes).toHaveLength(0)
  })
})

describe("aceptar con existencia insuficiente", () => {
  it("entra lo que cabe y se informa de lo que no", async () => {
    // Escenario: «Se informa de lo que no cabe». Aceptar a medias y decirlo es más útil que
    // rechazar entero: el operador ve qué falta y decide.
    const enough = await stocked("Monitor", 3)
    const scarce = await stocked("Dolly", 1)
    const order = await newOrder([
      { measurementId: enough, quantity: 2 },
      { measurementId: scarce, quantity: 4 },
    ])

    const result = await json<{
      quoteId: string
      excluded: { requested: number; available: number }[]
    }>(await accept(order.id))

    expect(result.excluded).toHaveLength(1)
    expect(result.excluded[0]?.requested).toBe(4)
    expect(result.excluded[0]?.available).toBe(1)

    const lines = await json<{ items: unknown[] }>(
      await request("GET", `${base}/quotes/${result.quoteId}/lines`, undefined, cookie),
    )
    expect(lines.items).toHaveLength(1)
  })

  it("incluir todo sin autorizar la creación falla", async () => {
    // Escenario: «Incluir todo exige autorizar la creación». La regla de `stock-reservation` no se
    // relaja aquí.
    const measurementId = await stocked("Steadicam", 1)
    const order = await newOrder([{ measurementId, quantity: 3 }])

    expect((await accept(order.id, { includeAll: true })).status).toBe(422)
    expect((await accept(order.id, { includeAll: true, allowMinting: true })).status).toBe(201)
  })
})

describe("rechazar un pedido", () => {
  it("exige motivo", async () => {
    // Escenario: «El rechazo exige motivo».
    const measurementId = await stocked("Cable", 2)
    const order = await newOrder([{ measurementId, quantity: 1 }])

    const response = await request(
      "POST",
      `${base}/orders/${order.id}/rejection`,
      { reason: "   " },
      cookie,
    )
    expect([400, 422]).toContain(response.status)
  })

  it("queda atribuido y suelta lo apartado", async () => {
    // Escenario: «El rechazo queda atribuido». Y si ya se había aceptado, el equipo vuelve: un
    // pedido cancelado que siga sujetando inventario lo bloquea para siempre.
    const measurementId = await stocked("Ronin", 2)
    const order = await newOrder([{ measurementId, quantity: 2 }])
    await accept(order.id)

    const rejected = await json<Order>(
      await request(
        "POST",
        `${base}/orders/${order.id}/rejection`,
        { reason: "El cliente canceló el rodaje" },
        cookie,
      ),
    )

    expect(rejected.status).toBe("canceled")
    expect(rejected.cancelReason).toBe("El cliente canceló el rodaje")

    const units = await json<{ items: { available: number }[] }>(
      await request("GET", `${base}/rates?measurementId=${measurementId}`, undefined, cookie),
    )
    expect(units.items[0]?.available).toBe(2)
  })

  it("un pedido cancelado no se acepta", async () => {
    // Escenario: «No se reabre un pedido cancelado».
    const measurementId = await stocked("Zoom", 1)
    const order = await newOrder([{ measurementId, quantity: 1 }])
    await request("POST", `${base}/orders/${order.id}/rejection`, { reason: "No hay" }, cookie)

    expect((await accept(order.id)).status).toBe(409)
  })
})

describe("la bandeja de pedidos", () => {
  it("pone delante lo que requiere atención", async () => {
    // Escenario: «Lo pendiente encabeza la bandeja». La prioridad es una columna calculada, no algo
    // que escriba la aplicación: así no puede quedar desincronizada del estado.
    const measurementId = await stocked("Softbox", 4)
    const pending = await newOrder([{ measurementId, quantity: 1 }])
    const accepted = await newOrder([{ measurementId, quantity: 1 }])
    await accept(accepted.id)

    const page = await json<{ items: Order[] }>(
      await request("GET", `${base}/orders?limit=100`, undefined, cookie),
    )
    const order = page.items.map((row) => row.id)
    expect(order.indexOf(pending.id)).toBeLessThan(order.indexOf(accepted.id))
  })

  it("se filtra por estado", async () => {
    // Escenario: «Se filtran los pendientes».
    const measurementId = await stocked("Bandera", 4)
    const pending = await newOrder([{ measurementId, quantity: 1 }])
    const accepted = await newOrder([{ measurementId, quantity: 1 }])
    await accept(accepted.id)

    const page = await json<{ items: Order[] }>(
      await request("GET", `${base}/orders?status=pending&limit=100`, undefined, cookie),
    )
    const ids = page.items.map((row) => row.id)
    expect(ids).toContain(pending.id)
    expect(ids).not.toContain(accepted.id)
  })
})

describe("eliminar un pedido", () => {
  it("no se elimina con equipo sin devolver", async () => {
    // Escenario: «No se elimina con equipo fuera». El pedido es lo que enlaza la solicitud con la
    // cotización que sujeta el equipo; borrarlo corta el rastro justo donde hace falta.
    const measurementId = await stocked("Fresnel", 2)
    const order = await newOrder([{ measurementId, quantity: 2 }])
    const { quoteId } = await json<{ quoteId: string }>(await accept(order.id))

    // La cotización nace sin ventana —el pedido no lleva fechas—, y una renta no sale sin ellas.
    await request(
      "PATCH",
      `${base}/quotes/${quoteId}`,
      { startsOn: "2026-09-01T00:00:00.000Z", endsOn: "2026-09-11T00:00:00.000Z" },
      cookie,
    )
    const moved = await request(
      "PATCH",
      `${base}/quotes/${quoteId}/status`,
      { status: "in_rent" },
      cookie,
    )
    expect(moved.status).toBe(200)

    const response = await request("DELETE", `${base}/orders/${order.id}`, undefined, cookie)
    expect(response.status).toBe(422)
  })

  it("desvincula la cotización y suelta lo apartado", async () => {
    const measurementId = await stocked("Kino", 2)
    const order = await newOrder([{ measurementId, quantity: 2 }])
    const { quoteId } = await json<{ quoteId: string }>(await accept(order.id))

    expect((await request("DELETE", `${base}/orders/${order.id}`, undefined, cookie)).status).toBe(
      204,
    )

    // La cotización **no** se borra: es un documento con importes. Se desvincula.
    const [quote] = await db
      .select({ orderId: warehouseQuotes.orderId })
      .from(warehouseQuotes)
      .where(eq(warehouseQuotes.id, quoteId))
    expect(quote?.orderId).toBeNull()

    const rates = await json<{ items: { available: number }[] }>(
      await request("GET", `${base}/rates?measurementId=${measurementId}`, undefined, cookie),
    )
    expect(rates.items[0]?.available).toBe(2)
  })
})

describe("las líneas del pedido dicen lo que hay", () => {
  it("cada línea trae la existencia libre de su medida", async () => {
    // Es lo que permite decidir antes de aceptar, en lugar de enterarse al fallar la reserva.
    const measurementId = await stocked("Chimera", 2)
    const order = await newOrder([{ measurementId, quantity: 5 }])

    const lines = await json<{ items: { quantity: number; available: number }[] }>(
      await request("GET", `${base}/orders/${order.id}/lines`, undefined, cookie),
    )

    expect(lines.items[0]?.quantity).toBe(5)
    expect(lines.items[0]?.available).toBe(2)
  })
})
