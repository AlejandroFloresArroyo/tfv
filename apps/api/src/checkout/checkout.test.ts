/**
 * La compra en tienda pública, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/storefront-checkout/spec.md` y de
 * `order-fulfillment/spec.md`. Rebanada 18.
 *
 * Las cuatro que justifican la rebanada entera, y las cuatro tienen que fallar por la razón
 * correcta si alguien afloja algo:
 *
 * - **Dos compradores, una unidad**: exactamente uno obtiene su sesión (`DEFECTS.md` M-10).
 * - **Un fallo a mitad de la materialización no deja ninguna de las ocho entidades** (M-02).
 * - **El mismo cobro dos veces deja un solo pedido** (M-03).
 * - **El total del pedido es lo que se cobró**, envío incluido (M-01).
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { createHmac } from "node:crypto"
import { newId } from "@tfv/contracts"
import { closeConnection, db, withElevated, withRequester } from "@tfv/db"
import {
  buyerOrderLines,
  buyerOrders,
  checkouts,
  companies,
  companyAddresses,
  companyMembers,
  companyServices,
  companySubscriptions,
  counterparties,
  globalCategories,
  loginAttempts,
  merchantPayments,
  merchantProfiles,
  notificationDeliveries,
  paymentEvents,
  payments,
  roles,
  services,
  sessions,
  shipments,
  shippingRates,
  subscriptionPlans,
  userAddresses,
  users,
  warehouseOrderLines,
  warehouseOrders,
  warehouseStockEvents,
  warehouseStockReservations,
  warehouseStockUnits,
  warehouses,
  websites,
} from "@tfv/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"
import { sweepExpiredCheckouts } from "./expiry.ts"
import { localStorefrontProvider, useStorefrontProvider } from "./provider.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"
const SECRET = "un-secreto-compartido-de-prueba"

/** CDMX y Chihuahua: 1242.70 km, el tramo de más de mil. */
const CDMX = { latitude: "19.4326000", longitude: "-99.1332000" }
const CHIHUAHUA = { latitude: "28.6353000", longitude: "-106.0889000" }

async function reset() {
  await db.execute(
    sql`truncate table ${paymentEvents}, ${notificationDeliveries}, ${warehouseStockEvents}, ${warehouseStockReservations}, ${warehouseStockUnits}, ${warehouseOrderLines}, ${warehouseOrders}, ${buyerOrderLines}, ${buyerOrders}, ${merchantPayments}, ${merchantProfiles}, ${payments}, ${shipments}, ${checkouts}, ${shippingRates}, ${sessions}, ${loginAttempts}, ${counterparties}, ${userAddresses}, ${companyAddresses}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${companySubscriptions}, ${subscriptionPlans}, ${websites}, ${warehouses}, ${globalCategories}, ${services}, ${companies} cascade`,
  )
}

function request(method: string, path: string, body?: unknown, cookie?: string, headers = {}) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function signIn(email: string, name = "Quien sea"): Promise<string> {
  await request("POST", "/auth/register", { email, password: PASSWORD, name })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const login = await request("POST", "/auth/login", { email, password: PASSWORD })
  return (
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""
  )
}

async function enable(company: string, keycode: string) {
  const [service] = await db.select().from(services).where(eq(services.keycode, keycode))
  const serviceId = service?.id ?? newId()
  if (!service) await db.insert(services).values({ id: serviceId, keycode, name: keycode })
  await db.insert(companyServices).values({ id: newId(), companyId: company, serviceId })
}

/** El evento firmado, tal y como lo manda el procesador. */
function sign(body: string): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex")
  return `t=${timestamp},v1=${signature}`
}

async function deliver(type: string, object: Record<string, unknown>, id = `evt_${newId()}`) {
  const body = JSON.stringify({ id, type, data: { object } })
  return app.request("/payments/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": sign(body) },
    body,
  })
}

/** El cobro confirmado de una compra, como lo cuenta el procesador. */
function paidIntent(checkoutId: string, intentId = `pi_${checkoutId}`) {
  return {
    id: intentId,
    amount: 0,
    metadata: { checkoutId },
    charges: { data: [{ id: `ch_${checkoutId}`, receipt_url: "https://recibo.example/1" }] },
  }
}

interface CartBody {
  storeSlug: string
  storeName: string
  subtotal: string
  lines: { refId: string; name: string; unitPrice: string; total: string; available: number }[]
}

interface CheckoutBody {
  id: string
  status: string
  subtotal: string
  shippingCost: string
  total: string
  checkoutUrl: string | null
  expiresAt: string | null
  lines: { refId: string; quantity: number; unitPrice: string; total: string }[]
}

interface OrderBody {
  id: string
  reference: string
  status: string
  total: string
  subtotal: string
  shippingCost: string
  storeName: string
  lines: { refId: string; quantity: number }[]
  payment: { status: string; grossAmount: string; refundedAmount: string } | null
  shipment: { id: string; mode: string; status: string; cost: string } | null
}

let sellerCookie = ""
let buyerCookie = ""
let otherBuyerCookie = ""
let companyId = ""
let warehouseId = ""
let buyerId = ""
let addressId = ""
let measurementId = ""
let scarceMeasurementId = ""
let rentOnlyMeasurementId = ""
let planId = ""
let profileId = ""
const SLUG = "renta-norte"

let restoreProvider: () => void

beforeAll(async () => {
  await reset()
  restoreProvider = useStorefrontProvider(localStorefrontProvider())

  const [plan] = await db
    .insert(subscriptionPlans)
    .values({ id: newId(), tier: 1, title: "Plan de prueba" })
    .returning()
  planId = plan?.id ?? ""

  sellerCookie = await signIn("vendedora@ejemplo.mx", "Vendedora")
  buyerCookie = await signIn("compradora@ejemplo.mx", "Compradora")
  otherBuyerCookie = await signIn("otra@ejemplo.mx", "Otra")

  const [buyer] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "compradora@ejemplo.mx"))
  buyerId = buyer?.id as string

  companyId = (
    await json<{ id: string }>(
      await request("POST", "/companies", { name: "Renta Norte" }, sellerCookie),
    )
  ).id

  await enable(companyId, "warehouses")
  await enable(companyId, "websites")
  await db
    .insert(companySubscriptions)
    .values({ id: newId(), companyId, planId, status: "active", interval: "month" })

  // El comercio puede cobrar: perfil primario, activo y con cuenta en el procesador.
  profileId = newId()
  await db.insert(merchantProfiles).values({
    id: profileId,
    companyId,
    alias: "Renta Norte SA",
    business: {
      type: "company",
      legalName: "Renta Norte SA de CV",
      taxId: "RNO010101AAA",
    },
    bank: {
      holderType: "company",
      holder: "Renta Norte SA de CV",
      clabe: "012180001234567895",
      currency: "MXN",
      country: "MX",
    },
    representative: {
      name: "Ana",
      lastname: "Serna",
      birthdate: { day: 1, month: 1, year: 1980 },
      address: {
        line1: "Reforma 1",
        city: "CDMX",
        state: "CDMX",
        postalCode: "06600",
        country: "MX",
      },
      relationship: { isRepresentative: true },
    },
    status: "active",
    verificationStatus: "verified",
    canAcceptCharges: true,
    isPrimary: true,
    externalAccountId: "acct_prueba",
  })

  await db
    .insert(companyAddresses)
    .values({ id: newId(), companyId, label: "Bodega", isPrimary: true, ...CDMX })

  addressId = newId()
  await db
    .insert(userAddresses)
    .values({ id: addressId, userId: buyerId, label: "Casa", ...CHIHUAHUA })

  warehouseId = (
    await json<{ id: string }>(
      await request(
        "POST",
        `/companies/${companyId}/warehouses`,
        { name: "Nave uno" },
        sellerCookie,
      ),
    )
  ).id

  const base = `/companies/${companyId}/warehouses/${warehouseId}`

  measurementId = await product(base, "Panel LED bicolor", "1250.00", 5)
  scarceMeasurementId = await product(base, "Grúa pequeña", "3000.00", 1)
  rentOnlyMeasurementId = await product(base, "Dolly", "0", 2, false)

  const vertical = newId()
  await db
    .insert(globalCategories)
    .values({ id: vertical, name: "Tienda de almacén", keyname: "warehouse-store" })

  await request(
    "POST",
    `/companies/${companyId}/websites`,
    {
      name: "Renta Norte",
      slug: SLUG,
      description: "Equipo de cine",
      warehouseId,
      categoryId: vertical,
      isPublished: true,
    },
    sellerCookie,
  )
})

/** Un producto publicado con una medida y sus unidades. Devuelve el identificador de la medida. */
async function product(
  base: string,
  name: string,
  price: string,
  units: number,
  forSale = true,
): Promise<string> {
  const created = await json<{ id: string; measurements: { id: string }[] }>(
    await request(
      "POST",
      `${base}/products`,
      {
        name,
        price,
        availableForSale: forSale,
        availableForRent: !forSale,
        isPublished: true,
        // Un bulto compacto: su peso volumétrico —10×10×10 cm entre 5000— queda muy por debajo del
        // real, así que el envío se cobra por el kilo que pesa de verdad.
        measurements: [
          {
            name: "Cuerpo",
            dimensions: { length: 10, width: 10, height: 10, weight: 1000 },
            lengthUnit: "cm",
            massUnit: "g",
          },
        ],
      },
      sellerCookie,
    ),
  )

  const measurement = created.measurements[0]?.id as string
  await request(
    "POST",
    `${base}/measurements/${measurement}/units`,
    { quantity: units },
    sellerCookie,
  )
  return measurement
}

afterAll(async () => {
  restoreProvider()
  await reset()
  await closeConnection()
})

/** Cada escenario parte sin compras: lo que aparta una prueba no puede faltarle a la siguiente. */
beforeEach(async () => {
  await db.execute(
    sql`truncate table ${paymentEvents}, ${warehouseOrderLines}, ${warehouseOrders}, ${buyerOrderLines}, ${buyerOrders}, ${merchantPayments}, ${payments}, ${shipments}, ${checkouts} cascade`,
  )
  await db.execute(sql`truncate table ${warehouseStockReservations} cascade`)
  await db.update(warehouseStockUnits).set({ status: "available" })
})

function cart(measurement: string, quantity = 1) {
  return { items: [{ kind: "warehouse_measurement" as const, refId: measurement, quantity }] }
}

async function buy(
  body: Record<string, unknown>,
  cookie = buyerCookie,
  key?: string,
): Promise<Response> {
  return request(
    "POST",
    `/public/sites/${SLUG}/checkout`,
    body,
    cookie,
    key ? { "idempotency-key": key } : {},
  )
}

async function availableUnits(measurement: string): Promise<number> {
  const rows = await withElevated("contar unidades disponibles en una prueba", async (tx) =>
    tx
      .select({ id: warehouseStockUnits.id })
      .from(warehouseStockUnits)
      .where(
        and(
          eq(warehouseStockUnits.measurementId, measurement),
          eq(warehouseStockUnits.status, "available"),
        ),
      ),
  )
  return rows.length
}

// ─── El carrito ──────────────────────────────────────────────────────────────

describe("el carrito se valora en el servidor", () => {
  it("los precios salen del catálogo, no del navegador", async () => {
    // Escenario: «Un precio manipulado se descarta». El cuerpo **no tiene** campo de precio, así
    // que enviarlo no altera nada: se pierde en la validación y el importe sale del catálogo.
    const response = await request("POST", `/public/sites/${SLUG}/cart`, {
      items: [
        { kind: "warehouse_measurement", refId: measurementId, quantity: 2, unitPrice: "1.00" },
      ],
    })

    expect(response.status).toBe(200)
    const body = await json<CartBody>(response)
    expect(body.lines[0]?.unitPrice).toBe("1250.00")
    expect(body.lines[0]?.total).toBe("2500.00")
    expect(body.subtotal).toBe("2500.00")
  })

  it("dice cuánta existencia queda de cada artículo", async () => {
    const body = await json<CartBody>(
      await request("POST", `/public/sites/${SLUG}/cart`, cart(measurementId)),
    )

    expect(body.lines[0]?.available).toBe(5)
    expect(body.storeName).toBe("Renta Norte")
  })

  it("un producto sólo de renta no se vende", async () => {
    // Escenario: «Un producto sólo de renta no se vende».
    const response = await request(
      "POST",
      `/public/sites/${SLUG}/cart`,
      cart(rentOnlyMeasurementId),
    )

    expect(response.status).toBe(422)
    expect(JSON.stringify(await response.json())).toContain("no está a la venta")
  })

  it("una tienda que no existe responde 404 sin decir nada más", async () => {
    const response = await request("POST", "/public/sites/no-existe/cart", cart(measurementId))
    expect(response.status).toBe(404)
  })
})

// ─── Requisitos previos ──────────────────────────────────────────────────────

describe("para cobrar hacen falta tres cosas", () => {
  it("sin sesión no se abre una sesión de pago", async () => {
    // «Crear una sesión de pago SHALL exigir un comprador identificado».
    const response = await request("POST", `/public/sites/${SLUG}/checkout`, {
      mode: "national",
      ...cart(measurementId),
      toAddressId: addressId,
    })

    expect(response.status).toBe(401)
  })

  it("sin domicilio no se paga un envío", async () => {
    // Escenario: «Sin domicilio no se paga un envío».
    const response = await buy({ mode: "national", ...cart(measurementId) })

    expect(response.status).toBe(422)
    expect(JSON.stringify(await response.json())).toContain("Indica a dónde enviamos")
  })

  it("la recolección no exige domicilio", async () => {
    // Escenario: «La recolección no exige domicilio».
    const response = await buy({ mode: "pickup", ...cart(measurementId) })

    expect(response.status).toBe(201)
    expect((await json<CheckoutBody>(response)).shippingCost).toBe("0.00")
  })

  it("el domicilio de otra persona no vale", async () => {
    // La comprobación es de la aplicación: el motor no puede saber que un identificador ajeno es
    // ajeno, sólo que no lo ve. La respuesta es 404, como cualquier recurso fuera de alcance.
    const response = await buy(
      { mode: "national", ...cart(measurementId), toAddressId: addressId },
      otherBuyerCookie,
    )

    expect(response.status).toBe(404)
  })

  it("sin suscripción vigente la tienda no vende", async () => {
    // Escenario: «Sin suscripción vigente la tienda no vende», y el motivo que ve el comprador no
    // revela cuál de las tres compuertas está cerrada.
    await db
      .update(companySubscriptions)
      .set({ status: "canceled" })
      .where(eq(companySubscriptions.companyId, companyId))

    const response = await buy({ mode: "pickup", ...cart(measurementId) })
    expect(response.status).toBe(422)
    expect(JSON.stringify(await response.json())).toContain("no puede procesar pagos")

    await db
      .update(companySubscriptions)
      .set({ status: "active" })
      .where(eq(companySubscriptions.companyId, companyId))
  })

  it("sin perfil de facturación operativo no se cobra", async () => {
    // Escenario: «Sin perfil de facturación no se cobra». Mismo mensaje que el anterior, y a
    // propósito: cuál de las dos cosas falta es configuración interna de la empresa.
    await db
      .update(merchantProfiles)
      .set({ canAcceptCharges: false, status: "inactive" })
      .where(eq(merchantProfiles.id, profileId))

    const response = await buy({ mode: "pickup", ...cart(measurementId) })
    expect(response.status).toBe(422)
    expect(JSON.stringify(await response.json())).toContain("no puede procesar pagos")

    await db
      .update(merchantProfiles)
      .set({ canAcceptCharges: true, status: "active" })
      .where(eq(merchantProfiles.id, profileId))
  })
})

// ─── La reserva ──────────────────────────────────────────────────────────────

describe("las existencias se apartan al crear la sesión", () => {
  it("una línea sin existencia detiene la compra, diciendo cuánto queda", async () => {
    // Escenario: «Una línea sin existencia detiene la compra».
    const response = await buy({ mode: "pickup", ...cart(scarceMeasurementId, 3) })

    expect(response.status).toBe(422)
    const body = JSON.stringify(await response.json())
    expect(body).toContain("Grúa pequeña")
    expect(body).toContain("sólo quedan 1")
  })

  it("la reserva se refleja en la disponibilidad", async () => {
    // Escenario: «La reserva se refleja en la disponibilidad»: tres disponibles, se pagan dos,
    // queda una.
    expect(await availableUnits(measurementId)).toBe(5)

    const response = await buy({ mode: "pickup", ...cart(measurementId, 2) })
    expect(response.status).toBe(201)

    expect(await availableUnits(measurementId)).toBe(3)

    const cartAfter = await json<CartBody>(
      await request("POST", `/public/sites/${SLUG}/cart`, cart(measurementId)),
    )
    expect(cartAfter.lines[0]?.available).toBe(3)
  })

  it("dos compradores no se llevan la misma unidad", async () => {
    // Escenario: «Dos compradores no se llevan la misma unidad». Es el defecto M-10: la pila
    // anterior seleccionaba unidades sin marcarlas y las dos compras salían adelante.
    const [first, second] = await Promise.all([
      buy({ mode: "pickup", ...cart(scarceMeasurementId) }, buyerCookie),
      buy({ mode: "pickup", ...cart(scarceMeasurementId) }, otherBuyerCookie),
    ])

    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([201, 422])

    const loser = first.status === 422 ? first : second
    expect(JSON.stringify(await loser.json())).toContain("no queda ninguna")

    expect(await availableUnits(scarceMeasurementId)).toBe(0)
    expect(await db.select().from(checkouts)).toHaveLength(1)
  })

  it("cancelar libera de inmediato", async () => {
    // Escenario: «Cancelar libera de inmediato».
    const checkout = await json<CheckoutBody>(
      await buy({ mode: "pickup", ...cart(measurementId, 2) }),
    )
    expect(await availableUnits(measurementId)).toBe(3)

    const canceled = await request(
      "POST",
      `/me/checkouts/${checkout.id}/cancellation`,
      undefined,
      buyerCookie,
    )

    expect(canceled.status).toBe(200)
    expect((await json<CheckoutBody>(canceled)).status).toBe("canceled")
    expect(await availableUnits(measurementId)).toBe(5)
  })

  it("la compra de otro no se cancela", async () => {
    const checkout = await json<CheckoutBody>(await buy({ mode: "pickup", ...cart(measurementId) }))

    const response = await request(
      "POST",
      `/me/checkouts/${checkout.id}/cancellation`,
      undefined,
      otherBuyerCookie,
    )

    expect(response.status).toBe(404)
    expect(await availableUnits(measurementId)).toBe(4)
  })

  it("abandonar el pago libera el inventario al caducar", async () => {
    // Escenario: «Abandonar el pago libera el inventario». La caducidad se adelanta escribiendo la
    // fecha, que es lo mismo que hace el tiempo.
    const checkout = await json<CheckoutBody>(
      await buy({ mode: "pickup", ...cart(measurementId, 2) }),
    )
    expect(await availableUnits(measurementId)).toBe(3)

    await db
      .update(checkouts)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(checkouts.id, checkout.id))

    const report = await sweepExpiredCheckouts()

    expect(report.expired).toBe(1)
    expect(report.released).toBe(2)
    expect(await availableUnits(measurementId)).toBe(5)

    const [row] = await db.select().from(checkouts).where(eq(checkouts.id, checkout.id))
    expect(row?.status).toBe("expired")
  })

  it("el recolector no toca una compra ya materializada", async () => {
    // «Un recolector de reservas caducadas, que **respete las materializaciones en curso**»: una
    // compra cobrada tiene su marca puesta y su fecha de caducidad ya pasada, y aun así no caduca.
    const checkout = await json<CheckoutBody>(await buy({ mode: "pickup", ...cart(measurementId) }))
    expect((await deliver("payment_intent.succeeded", paidIntent(checkout.id))).status).toBe(200)

    await db
      .update(checkouts)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(checkouts.id, checkout.id))

    expect((await sweepExpiredCheckouts()).expired).toBe(0)

    const [row] = await db.select().from(checkouts).where(eq(checkouts.id, checkout.id))
    expect(row?.status).toBe("completed")
  })
})

// ─── Idempotencia ────────────────────────────────────────────────────────────

describe("la creación de la sesión es idempotente", () => {
  it("un doble clic no aparta dos veces", async () => {
    // Escenario: «Un doble clic no aparta dos veces».
    const key = `idem-${newId()}`
    const body = { mode: "pickup", ...cart(measurementId, 2) }

    const first = await buy(body, buyerCookie, key)
    const second = await buy(body, buyerCookie, key)

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect((await json<CheckoutBody>(first)).id).toBe((await json<CheckoutBody>(second)).id)

    expect(await db.select().from(checkouts)).toHaveLength(1)
    expect(await availableUnits(measurementId)).toBe(3)
  })

  it("la misma clave con otro cuerpo se rechaza", async () => {
    // Escenario de `api-conventions`: «La misma clave con otro cuerpo se rechaza» con 409.
    const key = `idem-${newId()}`

    expect((await buy({ mode: "pickup", ...cart(measurementId) }, buyerCookie, key)).status).toBe(
      201,
    )
    const second = await buy({ mode: "pickup", ...cart(measurementId, 2) }, buyerCookie, key)

    expect(second.status).toBe(409)
    expect(await availableUnits(measurementId)).toBe(4)
  })
})

// ─── Los importes ────────────────────────────────────────────────────────────

describe("los importes de la compra", () => {
  it("el envío se cobra al comprador, aparte del subtotal", async () => {
    // Escenario: «El envío aparece como línea aparte» y «el total es la suma del subtotal y el
    // envío». El envío lo calcula la rebanada 17 con la misma llamada con la que se estima.
    const checkout = await json<CheckoutBody>(
      await buy({ mode: "national", ...cart(measurementId, 2), toAddressId: addressId }),
    )

    expect(checkout.subtotal).toBe("2500.00")
    // Nacional: base 199 + 30 por kilo (dos piezas de un kilo) + 80 de recargo por más de mil km.
    expect(checkout.shippingCost).toBe("339.00")
    expect(checkout.total).toBe("2839.00")
  })

  it("la comisión se retiene sobre el subtotal y el neto es lo que queda", async () => {
    // Escenario: «Se retiene la comisión configurada». La empresa lleva el porcentaje por defecto
    // del modelo, 12.5 %.
    const checkout = await json<CheckoutBody>(
      await buy({ mode: "pickup", ...cart(measurementId, 2) }),
    )

    const [row] = await db.select().from(checkouts).where(eq(checkouts.id, checkout.id))
    expect(row?.platformFeeRate).toBe("12.5000")
    expect(row?.platformFee).toBe("312.50")
  })

  it("la instantánea congela lo comprado", async () => {
    // Escenario: «Un cambio de precio posterior no altera la compra».
    const checkout = await json<CheckoutBody>(await buy({ mode: "pickup", ...cart(measurementId) }))
    expect(checkout.lines[0]?.unitPrice).toBe("1250.00")

    await request(
      "PATCH",
      `/companies/${companyId}/warehouses/${warehouseId}/products/${await productOf(measurementId)}`,
      { price: "9999.00" },
      sellerCookie,
    )

    expect((await deliver("payment_intent.succeeded", paidIntent(checkout.id))).status).toBe(200)

    const [order] = await db
      .select()
      .from(buyerOrders)
      .where(eq(buyerOrders.checkoutId, checkout.id))
    expect(order?.subtotal).toBe("1250.00")

    await request(
      "PATCH",
      `/companies/${companyId}/warehouses/${warehouseId}/products/${await productOf(measurementId)}`,
      { price: "1250.00" },
      sellerCookie,
    )
  })
})

async function productOf(measurement: string): Promise<string> {
  const [row] = await withElevated(
    "localizar el producto de una medida en una prueba",
    async (tx) =>
      tx.execute<{ product_id: string }>(
        sql`select product_id from warehouse_measurements where id = ${measurement}`,
      ),
  )
  return row?.product_id as string
}

// ─── La materialización ──────────────────────────────────────────────────────

describe("un cobro confirmado materializa las ocho entidades", () => {
  it("deja pago, envío, pedido, líneas, cliente, ingreso, pedido de almacén y movimientos", async () => {
    const checkout = await json<CheckoutBody>(
      await buy({ mode: "national", ...cart(measurementId, 2), toAddressId: addressId }),
    )

    expect((await deliver("payment_intent.succeeded", paidIntent(checkout.id))).status).toBe(200)

    const [order] = await db
      .select()
      .from(buyerOrders)
      .where(eq(buyerOrders.checkoutId, checkout.id))
    expect(order).toBeDefined()
    expect(order?.reference).toMatch(/^[0-9A-Z]{10}$/)

    // 1 · el pago, con su desglose
    const [payment] = await db.select().from(payments).where(eq(payments.checkoutId, checkout.id))
    expect(payment?.grossAmount).toBe(checkout.total)
    expect(payment?.platformFee).toBe("312.50")
    expect(payment?.netAmount).toBe("2187.50")
    expect(payment?.externalPaymentIntentId).toBe(`pi_${checkout.id}`)
    expect(payment?.receiptUrl).toBe("https://recibo.example/1")

    // 2 · el envío, pendiente y con fecha estimada
    const [shipment] = await db
      .select()
      .from(shipments)
      .where(eq(shipments.id, order?.shipmentId as string))
    expect(shipment?.status).toBe("pending")
    expect(shipment?.mode).toBe("national")
    expect(shipment?.estimatedDeliveryAt).not.toBeNull()
    expect(shipment?.toAddressId).toBe(addressId)

    // 3 y 4 · el pedido y sus líneas
    expect(
      await db
        .select()
        .from(buyerOrderLines)
        .where(eq(buyerOrderLines.orderId, order?.id as string)),
    ).toHaveLength(1)

    // 5 · el comprador es cliente de la empresa
    const clients = await db
      .select()
      .from(counterparties)
      .where(and(eq(counterparties.companyId, companyId), eq(counterparties.userId, buyerId)))
    expect(clients).toHaveLength(1)

    // 6 · el libro de ingresos del comercio
    const [income] = await db
      .select()
      .from(merchantPayments)
      .where(eq(merchantPayments.companyId, companyId))
    expect(income?.netAmount).toBe("2187.50")
    expect(income?.merchantProfileId).toBe(profileId)

    // 7 · el pedido operativo, ya finalizado
    const [operational] = await db
      .select()
      .from(warehouseOrders)
      .where(eq(warehouseOrders.buyerOrderId, order?.id as string))
    expect(operational?.status).toBe("finished")
    expect(operational?.origin).toBe("storefront")
    expect(
      await db
        .select()
        .from(warehouseOrderLines)
        .where(eq(warehouseOrderLines.orderId, operational?.id as string)),
    ).toHaveLength(1)

    // 8 · las unidades quedan vendidas
    const sold = await withElevated("contar unidades vendidas en una prueba", async (tx) =>
      tx
        .select({ id: warehouseStockUnits.id })
        .from(warehouseStockUnits)
        .where(
          and(
            eq(warehouseStockUnits.measurementId, measurementId),
            eq(warehouseStockUnits.status, "sold"),
          ),
        ),
    )
    expect(sold).toHaveLength(2)

    // Y la compra queda completada, con su marca.
    const [row] = await db.select().from(checkouts).where(eq(checkouts.id, checkout.id))
    expect(row?.status).toBe("completed")
    expect(row?.fulfilledAt).not.toBeNull()
  })

  it("el comprobante cuadra con el cargo", async () => {
    // Escenario: «El comprobante cuadra con el cargo» — el defecto M-01, que fijaba el total del
    // pedido igual al subtotal e ignoraba el envío.
    const checkout = await json<CheckoutBody>(
      await buy({ mode: "national", ...cart(measurementId), toAddressId: addressId }),
    )
    await deliver("payment_intent.succeeded", paidIntent(checkout.id))

    const [order] = await db
      .select()
      .from(buyerOrders)
      .where(eq(buyerOrders.checkoutId, checkout.id))
    const [payment] = await db.select().from(payments).where(eq(payments.checkoutId, checkout.id))

    expect(order?.total).toBe(checkout.total)
    expect(order?.total).toBe(payment?.grossAmount)
    expect(order?.subtotal).toBe(checkout.subtotal)
    expect(order?.shippingCost).toBe(checkout.shippingCost)
  })

  it("el mismo cobro dos veces deja un solo pedido", async () => {
    // Escenario: «Un reintento no duplica el pedido». **Con dos identificadores de evento
    // distintos**, que es lo que la unicidad del evento no detiene: quien lo detiene es la marca de
    // materialización. Es el defecto M-03.
    const checkout = await json<CheckoutBody>(await buy({ mode: "pickup", ...cart(measurementId) }))

    expect(
      (await deliver("payment_intent.succeeded", paidIntent(checkout.id), "evt_1")).status,
    ).toBe(200)
    expect(
      (await deliver("payment_intent.succeeded", paidIntent(checkout.id), "evt_2")).status,
    ).toBe(200)

    expect(await db.select().from(buyerOrders)).toHaveLength(1)
    expect(await db.select().from(payments)).toHaveLength(1)
    expect(await db.select().from(shipments)).toHaveLength(1)
    expect(await db.select().from(merchantPayments)).toHaveLength(1)
    expect(await db.select().from(warehouseOrders)).toHaveLength(1)
  })

  it("un fallo a mitad no deja ninguna de las ocho entidades", async () => {
    // Escenario: «Un fallo a mitad no deja rastro». La instantánea se corrompe apuntando a una
    // medida que no existe: la orden de trabajo del almacén es la séptima entidad, y su línea no
    // puede escribirse. Todo lo anterior se revierte con ella.
    const checkout = await json<CheckoutBody>(await buy({ mode: "pickup", ...cart(measurementId) }))
    const snapshot = (await db.select().from(checkouts).where(eq(checkouts.id, checkout.id)))[0]

    const broken = snapshot?.lines.map((line) => ({ ...line, refId: newId() }))
    await db.update(checkouts).set({ lines: broken }).where(eq(checkouts.id, checkout.id))

    // El receptor responde error para que el procesador reintente.
    const failed = await deliver("payment_intent.succeeded", paidIntent(checkout.id), "evt_roto")
    expect(failed.status).toBeGreaterThanOrEqual(400)

    expect(await db.select().from(payments)).toHaveLength(0)
    expect(await db.select().from(shipments)).toHaveLength(0)
    expect(await db.select().from(buyerOrders)).toHaveLength(0)
    expect(await db.select().from(buyerOrderLines)).toHaveLength(0)
    expect(await db.select().from(merchantPayments)).toHaveLength(0)
    expect(await db.select().from(warehouseOrders)).toHaveLength(0)

    // Y las unidades conservan el estado que tenían: siguen apartadas, no vendidas.
    expect(await availableUnits(measurementId)).toBe(4)
    const [row] = await db.select().from(checkouts).where(eq(checkouts.id, checkout.id))
    expect(row?.fulfilledAt).toBeNull()
    expect(row?.status).toBe("pending")

    // Escenario: «Un fallo previo permite reintentar». Resuelta la causa, el reenvío materializa.
    await db.update(checkouts).set({ lines: snapshot?.lines }).where(eq(checkouts.id, checkout.id))
    expect(
      (await deliver("payment_intent.succeeded", paidIntent(checkout.id), "evt_bueno")).status,
    ).toBe(200)

    expect(await db.select().from(buyerOrders)).toHaveLength(1)
  })

  it("un cobro rechazado cancela la compra y suelta el inventario", async () => {
    const checkout = await json<CheckoutBody>(
      await buy({ mode: "pickup", ...cart(measurementId, 2) }),
    )
    expect(await availableUnits(measurementId)).toBe(3)

    expect(
      (
        await deliver("payment_intent.payment_failed", {
          id: "pi_fallido",
          metadata: { checkoutId: checkout.id },
        })
      ).status,
    ).toBe(200)

    expect(await availableUnits(measurementId)).toBe(5)
    const [row] = await db.select().from(checkouts).where(eq(checkouts.id, checkout.id))
    expect(row?.status).toBe("canceled")
  })

  it("una devolución total deja el pedido devuelto", async () => {
    const checkout = await json<CheckoutBody>(await buy({ mode: "pickup", ...cart(measurementId) }))
    await deliver("payment_intent.succeeded", paidIntent(checkout.id))

    const response = await deliver("charge.refunded", {
      id: `ch_${checkout.id}`,
      payment_intent: `pi_${checkout.id}`,
      amount_captured: 125000,
      amount_refunded: 125000,
      refunded: true,
    })
    expect(response.status).toBe(200)

    const [order] = await db
      .select()
      .from(buyerOrders)
      .where(eq(buyerOrders.checkoutId, checkout.id))
    expect(order?.status).toBe("refunded")

    const [payment] = await db.select().from(payments).where(eq(payments.checkoutId, checkout.id))
    expect(payment?.status).toBe("refunded")
    expect(payment?.refundedAmount).toBe("1250.00")
  })

  it("un contracargo queda anotado en el pago", async () => {
    const checkout = await json<CheckoutBody>(await buy({ mode: "pickup", ...cart(measurementId) }))
    await deliver("payment_intent.succeeded", paidIntent(checkout.id))

    await deliver("charge.dispute.created", { id: "dp_1", payment_intent: `pi_${checkout.id}` })

    const [payment] = await db.select().from(payments).where(eq(payments.checkoutId, checkout.id))
    expect(payment?.status).toBe("disputed")
    expect(payment?.disputedAt).not.toBeNull()
  })
})

// ─── Lo que ve el comprador ──────────────────────────────────────────────────

describe("el comprador consulta sus pedidos", () => {
  it("obtiene pedidos con sus artículos, su pago y su envío", async () => {
    // Escenario: «La lectura devuelve pedidos», y no registros de envío en su lugar
    // (`DEFECTS.md` C-01 a C-04).
    const checkout = await json<CheckoutBody>(
      await buy({ mode: "national", ...cart(measurementId, 2), toAddressId: addressId }),
    )
    await deliver("payment_intent.succeeded", paidIntent(checkout.id))

    const orders = await json<OrderBody[]>(
      await request("GET", "/me/orders", undefined, buyerCookie),
    )

    expect(orders).toHaveLength(1)
    const order = orders[0] as OrderBody
    expect(order.reference).toMatch(/^[0-9A-Z]{10}$/)
    expect(order.storeName).toBe("Renta Norte")
    expect(order.total).toBe(checkout.total)
    expect(order.lines).toHaveLength(1)
    expect(order.lines[0]?.quantity).toBe(2)
    expect(order.payment?.status).toBe("succeeded")
    expect(order.shipment?.mode).toBe("national")
    expect(order.shipment?.status).toBe("pending")
  })

  it("un comprador no ve el pedido de otro", async () => {
    // Escenario: «Un comprador no ve los pedidos de otro» — la respuesta es 404.
    const checkout = await json<CheckoutBody>(await buy({ mode: "pickup", ...cart(measurementId) }))
    await deliver("payment_intent.succeeded", paidIntent(checkout.id))

    const [order] = await db
      .select()
      .from(buyerOrders)
      .where(eq(buyerOrders.checkoutId, checkout.id))

    expect((await request("GET", `/me/orders/${order?.id}`, undefined, buyerCookie)).status).toBe(
      200,
    )
    expect(
      (await request("GET", `/me/orders/${order?.id}`, undefined, otherBuyerCookie)).status,
    ).toBe(404)
    expect(
      await json<OrderBody[]>(await request("GET", "/me/orders", undefined, otherBuyerCookie)),
    ).toHaveLength(0)
  })

  it("la compra de otro no se lee", async () => {
    const checkout = await json<CheckoutBody>(await buy({ mode: "pickup", ...cart(measurementId) }))

    expect(
      (await request("GET", `/me/checkouts/${checkout.id}`, undefined, buyerCookie)).status,
    ).toBe(200)
    expect(
      (await request("GET", `/me/checkouts/${checkout.id}`, undefined, otherBuyerCookie)).status,
    ).toBe(404)
  })
})

// ─── El aislamiento, en la capa del motor ────────────────────────────────────

describe("el motor protege la compra aunque falle la aplicación", () => {
  /** El solicitante tal y como lo ve el motor: usuario y sesión viva. */
  async function requesterOf(email: string) {
    const [row] = await withElevated("localizar la sesión viva de una prueba", async (tx) =>
      tx.execute<{ user_id: string; session_id: string }>(
        sql`select s.user_id, s.id as session_id
              from sessions s join users u on u.id = s.user_id
             where u.email = ${email} and s.revoked_at is null
             order by s.created_at desc limit 1`,
      ),
    )
    return { userId: row?.user_id as string, sessionId: row?.session_id as string }
  }

  it("el comprador no puede reescribir la instantánea de su compra", async () => {
    // La instantánea es la fuente de la materialización: «un cambio posterior en el catálogo no
    // altera lo comprado». Con la política de la `0005` el propio comprador podía cambiar precios,
    // cantidades y hasta la marca de materialización. Ver `HALLAZGOS.md` H-102 y la `0021`.
    const checkout = await json<CheckoutBody>(await buy({ mode: "pickup", ...cart(measurementId) }))
    const buyer = await requesterOf("compradora@ejemplo.mx")

    const changed = await withRequester(buyer, async (tx) =>
      tx
        .update(checkouts)
        .set({ total: "1.00", subtotal: "1.00" })
        .where(eq(checkouts.id, checkout.id))
        .returning({ id: checkouts.id }),
    )

    expect(changed).toHaveLength(0)

    // Y sí la lee, que es lo que la spec le concede.
    const visible = await withRequester(buyer, async (tx) =>
      tx.select().from(checkouts).where(eq(checkouts.id, checkout.id)),
    )
    expect(visible).toHaveLength(1)
    expect(visible[0]?.total).toBe(checkout.total)
  })

  it("el comprador no puede fabricar el asiento de su propio cobro", async () => {
    // `payments` se escribía componiendo con la **lectura** de la compra, que incluye al comprador.
    // Ver `HALLAZGOS.md` H-103.
    const checkout = await json<CheckoutBody>(await buy({ mode: "pickup", ...cart(measurementId) }))
    const buyer = await requesterOf("compradora@ejemplo.mx")

    await expect(
      withRequester(buyer, async (tx) =>
        tx.insert(payments).values({
          id: newId(),
          checkoutId: checkout.id,
          buyerId: buyer.userId,
          grossAmount: "1.00",
          netAmount: "1.00",
          status: "succeeded",
        }),
      ),
    ).rejects.toThrow()

    expect(await db.select().from(payments)).toHaveLength(0)
  })

  it("el comprador no puede meter una orden de trabajo en el almacén ajeno", async () => {
    // La escritura de `warehouse_orders` admitía componerse con el pedido del comprador, y la
    // lectura del pedido la concede su comprador: cualquiera con un pedido suyo podía insertar una
    // orden en el almacén de cualquier empresa. Ver `HALLAZGOS.md` H-103.
    const checkout = await json<CheckoutBody>(await buy({ mode: "pickup", ...cart(measurementId) }))
    await deliver("payment_intent.succeeded", paidIntent(checkout.id))

    const [order] = await db
      .select()
      .from(buyerOrders)
      .where(eq(buyerOrders.checkoutId, checkout.id))
    const buyer = await requesterOf("compradora@ejemplo.mx")

    await expect(
      withRequester(buyer, async (tx) =>
        tx.insert(warehouseOrders).values({
          id: newId(),
          warehouseId,
          code: `PED-${newId()}`,
          origin: "storefront",
          buyerOrderId: order?.id as string,
        }),
      ),
    ).rejects.toThrow()

    // La que creó la materialización sigue siendo la única.
    expect(await db.select().from(warehouseOrders)).toHaveLength(1)
  })

  it("el comprador sí lee las líneas de su pedido", async () => {
    // El mismo error por el otro lado: `buyer_order_lines` sólo tenía política de arrendatario, así
    // que el comprador veía el total y no veía qué compró. Ver la `0021`.
    const checkout = await json<CheckoutBody>(
      await buy({ mode: "pickup", ...cart(measurementId, 2) }),
    )
    await deliver("payment_intent.succeeded", paidIntent(checkout.id))

    const [order] = await db
      .select()
      .from(buyerOrders)
      .where(eq(buyerOrders.checkoutId, checkout.id))
    const buyer = await requesterOf("compradora@ejemplo.mx")

    const lines = await withRequester(buyer, async (tx) =>
      tx
        .select()
        .from(buyerOrderLines)
        .where(eq(buyerOrderLines.orderId, order?.id as string)),
    )

    expect(lines).toHaveLength(1)
    expect(lines[0]?.line.quantity).toBe(2)
  })
})

// ─── La estimación y el cobro son el mismo cálculo ───────────────────────────

describe("lo que se estima es lo que se cobra", () => {
  it("la ruta de estimación y la instantánea de la compra dan el mismo importe", async () => {
    // No se comprueba con dos números escritos a mano: se ejecutan **las dos vías reales**. Es la
    // misma prueba que la rebanada 17 escribió para su motor, ahora atravesando la compra entera.
    const checkout = await json<CheckoutBody>(
      await buy({ mode: "national", ...cart(measurementId, 2), toAddressId: addressId }),
    )

    const estimate = await json<{ total: string }>(
      await request(
        "POST",
        `/companies/${companyId}/shipping/estimate`,
        {
          mode: "national",
          toAddressId: addressId,
          items: [
            {
              id: measurementId,
              quantity: 2,
              length: "10",
              width: "10",
              height: "10",
              lengthUnit: "cm",
              weight: "1",
              weightUnit: "kg",
            },
          ],
        },
        sellerCookie,
      ),
    )

    expect(checkout.shippingCost).toBe(estimate.total)
  })
})
