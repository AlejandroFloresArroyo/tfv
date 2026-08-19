/**
 * Tarifas de envío y seguimiento de la entrega, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/shipping-rates/spec.md` y de los requisitos de
 * envío de `order-fulfillment`.
 *
 * Las dos que más importan:
 *
 * - **La estimación coincide con lo cobrado.** No se comprueba comparando dos números escritos a
 *   mano, sino ejecutando las dos vías reales: la que consulta la interfaz —la ruta— y la que usará
 *   la materialización del pedido —`estimateShipping` dentro de su transacción—. Es el defecto M-11,
 *   y la única forma de que no vuelva es que sea la misma función.
 * - **Cambiar una tarifa surte efecto sin desplegar.** La tarifa se guarda por la ruta y el
 *   siguiente cálculo la usa.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId, type ShippingItem } from "@tfv/contracts"
import { closeConnection, db, withSystem } from "@tfv/db"
import {
  buyerOrders,
  checkouts,
  companies,
  companyAddresses,
  companyMembers,
  companyServices,
  loginAttempts,
  notificationDeliveries,
  roles,
  services,
  sessions,
  shipments,
  shippingRates,
  userAddresses,
  users,
  websites,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"
import { estimateShipping } from "./estimate.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${checkouts}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${shippingRates}, ${buyerOrders}, ${shipments}, ${companyAddresses}, ${userAddresses}, ${websites}, ${services}, ${companies} cascade`,
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

interface Rates {
  currency: string
  localBase: string
  localPerKilogram: string
  nationalBase: string
  distanceSurcharges: { over: number; amount: string }[]
  itemSurcharges: { over: number; amount: string }[]
  exchangeCurrency: string | null
  exchangeRate: string | null
  configured: boolean
}

interface Quote {
  mode: string
  realWeightKg: string
  volumetricWeightKg: string
  billableWeightKg: string
  itemCount: number
  distanceKm?: number
  base: string
  variable: string
  surcharges: { kind: string; threshold: number; amount: string }[]
  surchargeTotal: string
  currency: string
  total: string
  sourceCurrency?: string
  sourceTotal?: string
  exchangeRate?: string
  requiresDeliveryAddress: boolean
}

interface Shipment {
  id: string
  status: string
  deliveredAt: string | null
  carrier: string
  trackingNumber: string | null
  allowedTransitions: string[]
}

/** CDMX y Chihuahua: 1242.70 km, el tramo de más de mil. */
const CDMX = { latitude: "19.4326000", longitude: "-99.1332000" }
const CHIHUAHUA = { latitude: "28.6353000", longitude: "-106.0889000" }

let cookie = ""
let otherCookie = ""
let companyId = ""
let otherCompanyId = ""
let buyerId = ""
let toAddressId = ""
let base = ""

async function login(email: string, name: string): Promise<string> {
  await request("POST", "/auth/register", { email, password: PASSWORD, name })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const response = await request("POST", "/auth/login", { email, password: PASSWORD })
  return (
    response.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""
  )
}

beforeAll(async () => {
  await reset()

  cookie = await login("envios@ejemplo.mx", "Envíos")
  otherCookie = await login("otra@ejemplo.mx", "Otra")

  companyId = (
    await json<{ id: string }>(
      await request("POST", "/companies", { name: "Casa de Envíos" }, cookie),
    )
  ).id
  otherCompanyId = (
    await json<{ id: string }>(
      await request("POST", "/companies", { name: "Competencia" }, otherCookie),
    )
  ).id

  const serviceId = newId()
  await db.insert(services).values({ id: serviceId, keycode: "warehouses", name: "Almacenes" })
  await db.insert(companyServices).values({ id: newId(), companyId, serviceId })

  // El domicilio primario de la empresa es el origen del envío. Ver `addresses`.
  await db.insert(companyAddresses).values({
    id: newId(),
    companyId,
    label: "Bodega",
    isPrimary: true,
    ...CDMX,
  })

  const [buyer] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "envios@ejemplo.mx"))
  buyerId = buyer?.id as string

  toAddressId = newId()
  await db.insert(userAddresses).values({
    id: toAddressId,
    userId: buyerId,
    label: "Casa",
    ...CHIHUAHUA,
  })

  base = `/companies/${companyId}/shipping`
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

/** Un artículo compacto: su volumétrico queda muy por debajo del peso real. */
function item(id: string, weight: string, quantity = 1): ShippingItem {
  return {
    id,
    quantity,
    length: "10",
    width: "10",
    height: "10",
    lengthUnit: "cm",
    weight,
    weightUnit: "kg",
  }
}

async function estimate(body: unknown, as = cookie): Promise<Response> {
  return request("POST", `${base}/estimate`, body, as)
}

// ─── El cuadro de tarifas ────────────────────────────────────────────────────

describe("el cuadro de tarifas", () => {
  it("una empresa que no lo ha configurado hereda el de la plataforma", async () => {
    const rates = await json<Rates>(await request("GET", `${base}/rates`, undefined, cookie))

    expect(rates.configured).toBe(false)
    expect(rates.localBase).toBe("99.00")
    expect(rates.nationalBase).toBe("199.00")
    expect(rates.currency).toBe("MXN")
    expect(rates.distanceSurcharges).toEqual([
      { over: 500, amount: "40.00" },
      { over: 1000, amount: "80.00" },
    ])
  })

  it("no se ve el cuadro de otra empresa", async () => {
    // Sin membresía no hay permiso que resolver: la respuesta es la misma que la de un permiso que
    // falta, y no confirma que la empresa exista.
    const response = await request(
      "GET",
      `/companies/${otherCompanyId}/shipping/rates`,
      undefined,
      cookie,
    )

    expect(response.status).toBe(403)
  })
})

// ─── Las tarifas son datos ───────────────────────────────────────────────────

describe("cambiar una tarifa surte efecto sin desplegar", () => {
  it("el cálculo siguiente usa la tarifa nueva", async () => {
    const before = await json<Quote>(await estimate({ mode: "local", items: [item("a", "1")] }))
    expect(before.total).toBe("119.00")

    const saved = await request(
      "PATCH",
      `${base}/rates`,
      { localBase: "49.00", localPerKilogram: "10.00" },
      cookie,
    )
    expect(saved.status).toBe(200)
    expect((await json<Rates>(saved)).configured).toBe(true)

    const after = await json<Quote>(await estimate({ mode: "local", items: [item("a", "1")] }))
    expect(after.total).toBe("59.00")

    // Se deja como estaba para no condicionar los escenarios siguientes.
    await request(
      "PATCH",
      `${base}/rates`,
      { localBase: "99.00", localPerKilogram: "20.00" },
      cookie,
    )
  })

  it("los umbrales también son datos", async () => {
    await request(
      "PATCH",
      `${base}/rates`,
      { itemSurcharges: [{ over: 1, amount: "5.00" }] },
      cookie,
    )

    const quote = await json<Quote>(
      await estimate({ mode: "local", items: [item("a", "1"), item("b", "1")] }),
    )
    expect(quote.surcharges).toEqual([{ kind: "item_count", threshold: 1, amount: "5.00" }])

    await request(
      "PATCH",
      `${base}/rates`,
      {
        itemSurcharges: [
          { over: 3, amount: "20.00" },
          { over: 10, amount: "50.00" },
        ],
      },
      cookie,
    )
  })

  it("cambiar la tarifa exige el permiso de edición, no el de lectura", async () => {
    const response = await request(
      "PATCH",
      `/companies/${otherCompanyId}/shipping/rates`,
      { localBase: "1.00" },
      cookie,
    )

    expect(response.status).toBe(403)
  })
})

// ─── La estimación ───────────────────────────────────────────────────────────

describe("la estimación", () => {
  it("compone un envío nacional lejano con sus dos recargos", async () => {
    const quote = await json<Quote>(
      await estimate({
        mode: "national",
        items: [item("a", "2.5"), item("b", "2.5"), item("c", "2.5"), item("d", "2.5")],
        toAddressId,
      }),
    )

    expect(quote.billableWeightKg).toBe("10")
    expect(quote.itemCount).toBe(4)
    expect(quote.distanceKm).toBeCloseTo(1242.7, 0)
    expect(quote.base).toBe("199.00")
    expect(quote.variable).toBe("300.00")
    expect(quote.surcharges).toEqual([
      { kind: "distance", threshold: 1000, amount: "80.00" },
      { kind: "item_count", threshold: 3, amount: "20.00" },
    ])
    expect(quote.total).toBe("599.00")
  })

  it("sin domicilio de destino no aplica recargo por distancia", async () => {
    const quote = await json<Quote>(await estimate({ mode: "national", items: [item("a", "1")] }))

    expect(quote.distanceKm).toBeUndefined()
    expect(quote.surcharges).toEqual([])
    expect(quote.total).toBe("229.00")
  })

  it("la recolección cuesta cero y no pide domicilio", async () => {
    const quote = await json<Quote>(await estimate({ mode: "pickup", items: [item("a", "30")] }))

    expect(quote.total).toBe("0.00")
    expect(quote.requiresDeliveryAddress).toBe(false)
  })

  it("un artículo sin peso detiene el cálculo e identifica cuál", async () => {
    const response = await estimate({
      mode: "local",
      items: [item("a", "1"), { ...item("sin-peso", "1"), weight: undefined }],
    })

    expect(response.status).toBe(422)
    const body = await json<{ message: string }>(response)
    expect(body.message).toContain("sin-peso")
  })

  it("la estimación coincide con lo que cobrará la materialización", async () => {
    // Las dos vías reales: la ruta que consulta la interfaz, y la función que la rebanada 18
    // llamará dentro de su transacción. Si algún día dejaran de ser la misma, esto se rompe.
    //
    // La compra tiene que existir: la lectura del domicilio del comprador se concede a su dueño
    // **o a través de la compra que apunta a él**, así que sin ella la materialización no alcanza
    // el domicilio. Es lo que destapó H-98.
    const items = [item("a", "2.5"), item("b", "2.5"), item("c", "2.5"), item("d", "2.5")]

    const websiteId = newId()
    await db
      .insert(websites)
      .values({ id: websiteId, companyId, name: "Tienda", slug: `tienda-${newId()}` })

    await db.insert(checkouts).values({
      id: newId(),
      websiteId,
      companyId,
      buyerId,
      lines: [],
      subtotal: "1000.00",
      total: "1599.00",
      shippingMode: "national",
      shipToAddressId: toAddressId,
    })

    const shown = await json<Quote>(await estimate({ mode: "national", items, toAddressId }))

    const charged = await withSystem("envios.materializar", [companyId], (tx) =>
      estimateShipping(tx, { companyId, mode: "national", items, toAddressId }),
    )

    expect(charged.total).toBe(shown.total)
    expect(charged.billableWeightKg).toBe(shown.billableWeightKg)
    expect([...charged.surcharges]).toEqual(shown.surcharges)
    // Y con el recargo por distancia puesto, que es justo el que se perdía en silencio.
    expect(charged.total).toBe("599.00")
  })

  it("un domicilio que no se alcanza detiene el cálculo en lugar de cobrar de menos", async () => {
    // Sin la compra que lo enlace, la materialización no ve el domicilio del comprador. Antes eso
    // se traducía en «sin coordenadas» y el envío perdía sus ochenta pesos de recargo sin que nada
    // lo dijera (H-98).
    const orphan = newId()
    await db.insert(userAddresses).values({
      id: orphan,
      userId: buyerId,
      label: "Sin compra",
      ...CHIHUAHUA,
    })

    await expect(
      withSystem("envios.materializar", [companyId], (tx) =>
        estimateShipping(tx, {
          companyId,
          mode: "national",
          items: [item("a", "1")],
          toAddressId: orphan,
        }),
      ),
    ).rejects.toThrow(/no se encontró/i)
  })
})

// ─── El tipo de cambio ───────────────────────────────────────────────────────

describe("el tipo de cambio", () => {
  it("se configura y queda registrado en el desglose", async () => {
    await request(
      "PATCH",
      `${base}/rates`,
      { exchangeCurrency: "USD", exchangeRate: "0.05" },
      cookie,
    )

    const quote = await json<Quote>(await estimate({ mode: "local", items: [item("a", "1")] }))

    expect(quote.currency).toBe("USD")
    expect(quote.total).toBe("5.95")
    expect(quote.sourceCurrency).toBe("MXN")
    expect(quote.sourceTotal).toBe("119.00")
    // El tipo llega con la escala de su columna, seis decimales: es el valor guardado, no un
    // redondeo de presentación.
    expect(quote.exchangeRate).toBe("0.050000")

    await request("PATCH", `${base}/rates`, { exchangeCurrency: null, exchangeRate: null }, cookie)
  })

  it("retirado el tipo, el total vuelve a la moneda de las tarifas", async () => {
    const quote = await json<Quote>(await estimate({ mode: "local", items: [item("a", "1")] }))

    expect(quote.currency).toBe("MXN")
    expect(quote.exchangeRate).toBeUndefined()
  })
})

// ─── Seguimiento de la entrega ───────────────────────────────────────────────

describe("el seguimiento de la entrega", () => {
  let shipmentId = ""

  /** Un envío ya enlazado a su pedido, que es como lo deja la materialización. */
  async function sow(companyOf = companyId): Promise<string> {
    const id = newId()
    await db.insert(shipments).values({ id, mode: "national", cost: "199.00" })
    await db.insert(buyerOrders).values({
      id: newId(),
      buyerId,
      companyId: companyOf,
      reference: `REF-${newId()}`,
      subtotal: "1000.00",
      total: "1199.00",
      shipmentId: id,
    })
    return id
  }

  beforeAll(async () => {
    shipmentId = await sow()
  })

  it("nace pendiente y ofrece sólo lo que se puede hacer", async () => {
    const shipment = await json<Shipment>(
      await request("GET", `/companies/${companyId}/shipments/${shipmentId}`, undefined, cookie),
    )

    expect(shipment.status).toBe("pending")
    expect(shipment.deliveredAt).toBeNull()
    expect(shipment.allowedTransitions).toEqual(["shipped", "delivered", "canceled"])
  })

  it("registra paquetería y guía", async () => {
    const shipment = await json<Shipment>(
      await request(
        "PATCH",
        `/companies/${companyId}/shipments/${shipmentId}`,
        { carrier: "Paquetería del Norte", trackingNumber: "GUIA-1234" },
        cookie,
      ),
    )

    expect(shipment.carrier).toBe("Paquetería del Norte")
    expect(shipment.trackingNumber).toBe("GUIA-1234")
  })

  it("avanza por su ciclo y la entrega queda fechada", async () => {
    const shipped = await json<Shipment>(
      await request(
        "POST",
        `/companies/${companyId}/shipments/${shipmentId}/status`,
        { status: "shipped" },
        cookie,
      ),
    )
    expect(shipped.status).toBe("shipped")
    expect(shipped.deliveredAt).toBeNull()

    const transit = await json<Shipment>(
      await request(
        "POST",
        `/companies/${companyId}/shipments/${shipmentId}/status`,
        { status: "in_transit" },
        cookie,
      ),
    )
    expect(transit.status).toBe("in_transit")

    const delivered = await json<Shipment>(
      await request(
        "POST",
        `/companies/${companyId}/shipments/${shipmentId}/status`,
        { status: "delivered" },
        cookie,
      ),
    )
    expect(delivered.status).toBe("delivered")
    expect(delivered.deliveredAt).not.toBeNull()
    expect(delivered.allowedTransitions).toEqual([])
  })

  it("una transición que la máquina no prevé responde 409", async () => {
    const response = await request(
      "POST",
      `/companies/${companyId}/shipments/${shipmentId}/status`,
      { status: "shipped" },
      cookie,
    )

    expect(response.status).toBe(409)
  })

  it("un envío entregado a la paquetería ya no se cancela", async () => {
    const id = await sow()
    await request(
      "POST",
      `/companies/${companyId}/shipments/${id}/status`,
      { status: "shipped" },
      cookie,
    )

    const response = await request(
      "POST",
      `/companies/${companyId}/shipments/${id}/status`,
      { status: "canceled" },
      cookie,
    )

    expect(response.status).toBe(409)
  })

  it("el envío de otra empresa no existe", async () => {
    // Se pide por el camino de la empresa propia, que es donde sí hay permiso: lo que corta es que
    // el envío no cuelga de un pedido suyo. Un 403 confirmaría que el envío existe.
    const foreign = await sow(otherCompanyId)

    const response = await request(
      "GET",
      `/companies/${companyId}/shipments/${foreign}`,
      undefined,
      cookie,
    )

    expect(response.status).toBe(404)
  })
})
