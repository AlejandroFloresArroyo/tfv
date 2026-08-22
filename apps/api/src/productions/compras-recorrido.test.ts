/**
 * Compras de una producción a los almacenes de otras empresas, **contra un servidor de verdad**.
 *
 * Transcritas de `openspec/specs/production-procurement/spec.md`. Rebanada 23.
 *
 * ## Por qué es un recorrido y no una suite por función
 *
 * Porque lo que hay que demostrar aquí **no cabe en una función**. El abanico nace en la empresa de
 * la producción, sigue en la de cada almacén, vuelve por la aceptación —que es código de la
 * rebanada 15 y no se toca— y termina en el inventario y en el presupuesto de la producción, que
 * son de la 22. Tres bloques que ya estaban verdes por separado, y la costura entre ellos es
 * exactamente lo que esta rebanada añade.
 *
 * Se ejerce con `fetch` contra un servidor levantado en un puerto efímero (`port: 0`), así que el
 * de quien esté trabajando no se toca. Las tres compuertas, la validación, el aislamiento y la
 * serialización corren de verdad; nada se llama por dentro.
 *
 * ## Dos personas, tres empresas
 *
 * Es lo que hace que las afirmaciones de aislamiento signifiquen algo. La productora es dueña de su
 * empresa y de ninguna más; la almacenista, de las dos que surten. Ninguna es miembro de las de la
 * otra, así que un `404` es un `404` de verdad y no el resultado de haberse olvidado una cookie.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import type { AddressInfo } from "node:net"
import { serve } from "@hono/node-server"
import { newId } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  companyServices,
  counterparties,
  loginAttempts,
  notificationDeliveries,
  productionItemEvents,
  productionItems,
  productionPurchaseOrderLines,
  productionPurchaseOrders,
  productionShoppings,
  productions,
  roles,
  services,
  sessions,
  uploads,
  users,
  warehouseCategories,
  warehouseMeasurements,
  warehouseOrderLines,
  warehouseOrderMessages,
  warehouseOrders,
  warehousePriceLists,
  warehouseProductPrices,
  warehouseProducts,
  warehouseQuoteLines,
  warehouseQuotePayments,
  warehouseQuotes,
  warehouseStockEvents,
  warehouseStockReservations,
  warehouseStockUnits,
  warehouseStorages,
  warehouses,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

let server: ReturnType<typeof serve>
let origin = ""

async function reset() {
  await db.execute(
    sql`truncate table ${productionItemEvents}, ${productionItems}, ${productionShoppings}, ${productionPurchaseOrderLines}, ${productionPurchaseOrders}, ${productions}, ${warehouseOrderMessages}, ${warehouseOrderLines}, ${warehouseOrders}, ${warehouseStockReservations}, ${warehouseQuotePayments}, ${warehouseQuoteLines}, ${warehouseQuotes}, ${warehouseStockEvents}, ${warehouseStockUnits}, ${warehouseMeasurements}, ${warehouseProductPrices}, ${warehousePriceLists}, ${warehouseProducts}, ${warehouseCategories}, ${warehouseStorages}, ${warehouses}, ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${counterparties}, ${companyServices}, ${uploads}, ${services}, ${companies} cascade`,
  )
}

beforeAll(async () => {
  const port = await new Promise<number>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) =>
      resolve((info as AddressInfo).port),
    )
  })
  origin = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await reset()
  await closeConnection()
})

// ─── Andamiaje ───────────────────────────────────────────────────────────────

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  return fetch(`${origin}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function ok<T>(response: Response, status: number): Promise<T> {
  // El cuerpo entra en el mensaje del fallo: este recorrido atraviesa más de treinta llamadas y un
  // `422` sin motivo obliga a instrumentar a mano.
  const texto = await response.text()
  if (response.status !== status) {
    throw new Error(`${response.url} respondió ${response.status}, se esperaba ${status}: ${texto}`)
  }
  return JSON.parse(texto) as T
}

let cuentas = 0

async function signIn(nombre: string): Promise<string> {
  cuentas += 1
  const email = `${nombre}-${cuentas}@ejemplo.mx`
  await call("POST", "/auth/register", { email, password: PASSWORD, name: nombre })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const response = await call("POST", "/auth/login", { email, password: PASSWORD })
  const cookie = response.headers
    .getSetCookie()
    .find((raw) => raw.startsWith("tfv_session="))
    ?.split(";")[0]

  if (!cookie) throw new Error(`no se abrió sesión de ${email}`)
  return cookie
}

/** Un miembro con exactamente estas claves y ninguna más. */
async function memberWith(companyId: string, permissions: string[]): Promise<string> {
  cuentas += 1
  const email = `acotada-${cuentas}@ejemplo.mx`
  await call("POST", "/auth/register", { email, password: PASSWORD, name: "Acotada" })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  const roleId = newId()
  await db.insert(roles).values({ id: roleId, companyId, name: `Rol ${cuentas}`, permissions })
  await db
    .insert(companyMembers)
    .values({ id: newId(), companyId, userId: user?.id ?? "", roleId, isOwner: false })

  const login = await call("POST", "/auth/login", { email, password: PASSWORD })
  return (
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""
  )
}

async function enableService(companyId: string, keycode: string) {
  const [existing] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.keycode, keycode))

  const serviceId = existing?.id ?? newId()
  if (!existing) await db.insert(services).values({ id: serviceId, keycode, name: keycode })

  await db
    .insert(companyServices)
    .values({ id: newId(), companyId, serviceId })
    .onConflictDoNothing()
}

interface Identificado {
  id: string
}

interface Almacen {
  id: string
  companyId: string
  cookie: string
  base: string
}

/** Una empresa con almacenes contratados y un almacén **publicado** dentro. */
async function nave(cookie: string, empresa: string, nombre: string): Promise<Almacen> {
  const company = await ok<Identificado>(
    await call("POST", "/companies", { name: empresa }, cookie),
    201,
  )
  await enableService(company.id, "warehouses")

  const warehouse = await ok<Identificado>(
    await call(
      "POST",
      `/companies/${company.id}/warehouses`,
      { name: nombre, isPublished: true },
      cookie,
    ),
    201,
  )

  return {
    id: warehouse.id,
    companyId: company.id,
    cookie,
    base: `/companies/${company.id}/warehouses/${warehouse.id}`,
  }
}

interface ProductoCreado {
  id: string
  measurements: { id: string }[]
}

/** Un producto publicado con `unidades` libres en su única medida. */
async function producto(
  almacen: Almacen,
  nombre: string,
  unidades: number,
): Promise<{ productId: string; measurementId: string }> {
  const created = await ok<ProductoCreado>(
    await call(
      "POST",
      `${almacen.base}/products`,
      {
        name: nombre,
        description: `${nombre}, con su maleta`,
        isPublished: true,
        availableForSale: true,
        availableForRent: true,
        measurements: [{ name: "Única", initialQuantity: unidades }],
      },
      almacen.cookie,
    ),
    201,
  )

  const measurementId = created.measurements[0]?.id
  if (!measurementId) throw new Error(`${nombre} nació sin medida`)
  return { productId: created.id, measurementId }
}

interface PedidoResumen {
  id: string
  warehouseId: string
  code: string
  status: string
  quoteId: string | null
  lines: number
  cancelReason: string | null
}

interface OrdenDeCompra {
  id: string
  productionId: string
  code: string
  name: string
  type: string
  status: string
  cancelReason: string | null
  orders: PedidoResumen[]
}

interface Productora {
  cookie: string
  companyId: string
  productionId: string
  base: string
}

async function productora(nombre = "Estudios Mariposa"): Promise<Productora> {
  const cookie = await signIn("jefa-de-produccion")
  const company = await ok<Identificado>(
    await call("POST", "/companies", { name: nombre }, cookie),
    201,
  )
  await enableService(company.id, "productions")

  const production = await ok<Identificado>(
    await call("POST", `/companies/${company.id}/productions`, { name: "La casa del río" }, cookie),
    201,
  )

  return {
    cookie,
    companyId: company.id,
    productionId: production.id,
    base: `/companies/${company.id}/productions/${production.id}`,
  }
}

function crearOrden(
  quien: Productora,
  lines: { measurementId: string; quantity: number }[],
  extra: Record<string, unknown> = {},
  cookie?: string,
) {
  return call(
    "POST",
    `${quien.base}/purchase-orders`,
    { name: "Equipo de cámara, semana 1", type: "sale", lines, ...extra },
    cookie ?? quien.cookie,
  )
}

beforeEach(reset)

// ─── El abanico ──────────────────────────────────────────────────────────────

describe("el abanico ocurre al crear la orden", () => {
  it("seis líneas de tres almacenes producen tres pedidos, cada uno con lo suyo", async () => {
    // Escenarios «Tres almacenes producen tres pedidos» y «Dos líneas del mismo almacén van
    // juntas»: la producción arma **una** solicitud y no se entera de a quién pertenece cada cosa.
    const compra = await productora()
    const almacenista = await signIn("almacenista")

    const bajio = await nave(almacenista, "Renta del Bajío", "Nave central")
    const luz = await nave(almacenista, "Luz y Grip", "Bodega norte")
    const otra = await nave(await signIn("tercera"), "Cine Sur", "Almacén sur")

    const camara = await producto(bajio, "Cámara", 4)
    const tripode = await producto(bajio, "Trípode", 4)
    const foco = await producto(luz, "Foco de 1K", 4)
    const bandera = await producto(luz, "Bandera", 4)
    const grua = await producto(otra, "Grúa", 4)
    const dolly = await producto(otra, "Dolly", 4)

    const orden = await ok<OrdenDeCompra>(
      await crearOrden(compra, [
        { measurementId: camara.measurementId, quantity: 2 },
        { measurementId: foco.measurementId, quantity: 1 },
        { measurementId: grua.measurementId, quantity: 1 },
        { measurementId: tripode.measurementId, quantity: 2 },
        { measurementId: bandera.measurementId, quantity: 1 },
        { measurementId: dolly.measurementId, quantity: 1 },
      ]),
      201,
    )

    expect(orden.status).toBe("open")
    expect(orden.orders).toHaveLength(3)

    // Cada pedido lleva **sólo** las líneas de su almacén: dos, dos y dos.
    const porAlmacen = new Map(orden.orders.map((pedido) => [pedido.warehouseId, pedido]))
    expect(porAlmacen.get(bajio.id)?.lines).toBe(2)
    expect(porAlmacen.get(luz.id)?.lines).toBe(2)
    expect(porAlmacen.get(otra.id)?.lines).toBe(2)
    expect(orden.orders.every((pedido) => pedido.status === "pending")).toBe(true)

    // Escenario «El pedido conoce su origen»: el almacén lo ve en su propia bandeja, con la
    // referencia a la orden que lo abrió.
    const bandeja = await ok<{ items: { id: string; purchaseOrderId: string | null }[] }>(
      await call("GET", `${bajio.base}/orders`, undefined, almacenista),
      200,
    )
    expect(bandeja.items).toHaveLength(1)
    expect(bandeja.items[0]?.purchaseOrderId).toBe(orden.id)
  })

  it("un fallo en el tercer almacén no deja ni la orden ni ningún pedido", async () => {
    // Escenario «Un fallo no deja pedidos sueltos». El tercer almacén tiene el producto publicado
    // y **sin una sola unidad libre**, que es el rechazo que la tienda interna aplica al carrito.
    // Los dos primeros pedidos llegan a escribirse; la transacción se revierte entera.
    const compra = await productora()
    const almacenista = await signIn("almacenista")

    const uno = await nave(almacenista, "Renta del Bajío", "Nave central")
    const dos = await nave(almacenista, "Luz y Grip", "Bodega norte")
    const tres = await nave(almacenista, "Cine Sur", "Almacén sur")

    const camara = await producto(uno, "Cámara", 3)
    const foco = await producto(dos, "Foco de 1K", 3)
    const agotado = await producto(tres, "Grúa", 0)

    const respuesta = await crearOrden(compra, [
      { measurementId: camara.measurementId, quantity: 1 },
      { measurementId: foco.measurementId, quantity: 1 },
      { measurementId: agotado.measurementId, quantity: 1 },
    ])
    expect(respuesta.status).toBe(422)

    const ordenes = await db
      .select({ id: productionPurchaseOrders.id })
      .from(productionPurchaseOrders)
    expect(ordenes).toEqual([])

    const pedidos = await db.select({ id: warehouseOrders.id }).from(warehouseOrders)
    expect(pedidos).toEqual([])

    const lineas = await db
      .select({ id: productionPurchaseOrderLines.id })
      .from(productionPurchaseOrderLines)
    expect(lineas).toEqual([])
  })

  it("una medida de un almacén sin publicar no se encuentra", async () => {
    // La tienda interna enseña lo publicado, y de ahí sale la orden. Un almacén sin publicar y una
    // medida inexistente son la misma respuesta: no hay forma de distinguirlos desde fuera.
    const compra = await productora()
    const almacenista = await signIn("almacenista")
    const oculto = await nave(almacenista, "Renta del Bajío", "Nave central")
    await db.update(warehouses).set({ isPublished: false }).where(eq(warehouses.id, oculto.id))

    const camara = await producto(oculto, "Cámara", 3)

    const respuesta = await crearOrden(compra, [
      { measurementId: camara.measurementId, quantity: 1 },
    ])
    expect(respuesta.status).toBe(422)
  })
})

// ─── Las contrapartes ────────────────────────────────────────────────────────

describe("el alta comercial ocurre en ambos sentidos", () => {
  it("la primera compra crea las dos contrapartes y la segunda las reutiliza", async () => {
    // Escenarios «La primera compra crea las dos contrapartes» y «Una segunda compra no duplica».
    const compra = await productora()
    const almacenista = await signIn("almacenista")
    const bajio = await nave(almacenista, "Renta del Bajío", "Nave central")
    const camara = await producto(bajio, "Cámara", 6)

    await ok(await crearOrden(compra, [{ measurementId: camara.measurementId, quantity: 1 }]), 201)

    const clientes = await db
      .select({
        id: counterparties.id,
        counterpartyCompanyId: counterparties.counterpartyCompanyId,
      })
      .from(counterparties)
      .where(eq(counterparties.companyId, bajio.companyId))
    expect(clientes).toHaveLength(1)
    expect(clientes[0]?.counterpartyCompanyId).toBe(compra.companyId)

    const proveedores = await db
      .select({
        id: counterparties.id,
        counterpartyCompanyId: counterparties.counterpartyCompanyId,
      })
      .from(counterparties)
      .where(eq(counterparties.companyId, compra.companyId))
    expect(proveedores).toHaveLength(1)
    expect(proveedores[0]?.counterpartyCompanyId).toBe(bajio.companyId)

    await ok(await crearOrden(compra, [{ measurementId: camara.measurementId, quantity: 1 }]), 201)

    const despues = await db.select({ id: counterparties.id }).from(counterparties)
    expect(despues).toHaveLength(2)
    expect(despues.map((fila) => fila.id).sort()).toEqual(
      [clientes[0]?.id, proveedores[0]?.id].sort(),
    )
  })

  it("el pedido nace a nombre del cliente que representa a la producción", async () => {
    // No es cosmética: `warehouse_orders.client_id` es lo que deja a la producción **leer** su
    // pedido y su cotización en la empresa ajena. Sin él, el vínculo no existiría.
    const compra = await productora()
    const almacenista = await signIn("almacenista")
    const bajio = await nave(almacenista, "Renta del Bajío", "Nave central")
    const camara = await producto(bajio, "Cámara", 6)

    await ok(await crearOrden(compra, [{ measurementId: camara.measurementId, quantity: 1 }]), 201)

    const [pedido] = await db.select({ clientId: warehouseOrders.clientId }).from(warehouseOrders)
    const [cliente] = await db
      .select({ counterpartyCompanyId: counterparties.counterpartyCompanyId })
      .from(counterparties)
      .where(eq(counterparties.id, pedido?.clientId ?? ""))

    expect(cliente?.counterpartyCompanyId).toBe(compra.companyId)
  })
})

// ─── Autorización y aislamiento ──────────────────────────────────────────────

describe("el alta entre empresas requiere autorización", () => {
  it("sin la clave de crear órdenes no se crea nada, ni contrapartes", async () => {
    // Escenario «Sin permiso no se abre el pedido». La comprobación es en la empresa de **la
    // producción**, que es la única a la que quien compra pertenece.
    const compra = await productora()
    const almacenista = await signIn("almacenista")
    const bajio = await nave(almacenista, "Renta del Bajío", "Nave central")
    const camara = await producto(bajio, "Cámara", 6)

    const mirona = await memberWith(compra.companyId, [
      "productions.productions.view",
      "productions.orders.view",
    ])

    const respuesta = await crearOrden(
      compra,
      [{ measurementId: camara.measurementId, quantity: 1 }],
      {},
      mirona,
    )
    expect(respuesta.status).toBe(403)

    expect(
      await db.select({ id: productionPurchaseOrders.id }).from(productionPurchaseOrders),
    ).toEqual([])
    expect(await db.select({ id: warehouseOrders.id }).from(warehouseOrders)).toEqual([])
    expect(await db.select({ id: counterparties.id }).from(counterparties)).toEqual([])
  })

  it("el vínculo no abre otros datos de la empresa ajena", async () => {
    // Escenario «El vínculo no abre otros datos». Con el pedido abierto, la responsable de
    // producción sigue sin ser nadie en la empresa del almacén: `404`, que ni siquiera confirma
    // que exista.
    const compra = await productora()
    const almacenista = await signIn("almacenista")
    const bajio = await nave(almacenista, "Renta del Bajío", "Nave central")
    const camara = await producto(bajio, "Cámara", 6)

    const orden = await ok<OrdenDeCompra>(
      await crearOrden(compra, [{ measurementId: camara.measurementId, quantity: 1 }]),
      201,
    )
    expect(orden.orders).toHaveLength(1)

    const ajenas = [
      `/companies/${bajio.companyId}/warehouses`,
      `/companies/${bajio.companyId}/warehouses/${bajio.id}`,
      `/companies/${bajio.companyId}/warehouses/${bajio.id}/products`,
      `/companies/${bajio.companyId}/warehouses/${bajio.id}/orders`,
      `/companies/${bajio.companyId}/clients`,
    ]

    for (const camino of ajenas) {
      const respuesta = await call("GET", camino, undefined, compra.cookie)
      expect([respuesta.status, camino]).toEqual([404, camino])
    }
  })
})

// ─── El código no cambia ─────────────────────────────────────────────────────

describe("el código de la orden no cambia", () => {
  it("listar el conjunto varias veces no lo altera", async () => {
    // Escenario «Listar no altera los códigos», y la corrección `DEFECTS.md` L-05: la pila
    // anterior lo regeneraba en cada listado, así que el código impreso dejaba de encontrar nada.
    const compra = await productora()
    const almacenista = await signIn("almacenista")
    const bajio = await nave(almacenista, "Renta del Bajío", "Nave central")
    const camara = await producto(bajio, "Cámara", 6)

    const primera = await ok<OrdenDeCompra>(
      await crearOrden(compra, [{ measurementId: camara.measurementId, quantity: 1 }]),
      201,
    )
    const segunda = await ok<OrdenDeCompra>(
      await crearOrden(compra, [{ measurementId: camara.measurementId, quantity: 1 }]),
      201,
    )
    expect(primera.code).not.toBe(segunda.code)

    const leidos: string[][] = []
    for (let vuelta = 0; vuelta < 3; vuelta += 1) {
      const pagina = await ok<{ items: OrdenDeCompra[] }>(
        await call("GET", `${compra.base}/purchase-orders`, undefined, compra.cookie),
        200,
      )
      leidos.push(pagina.items.map((fila) => fila.code).sort())
    }

    const esperado = [primera.code, segunda.code].sort()
    for (const vuelta of leidos) expect(vuelta).toEqual(esperado)

    // Y lo que quedó en la base es lo mismo que se leyó: no hay reescritura silenciosa.
    const guardados = await db
      .select({ code: productionPurchaseOrders.code })
      .from(productionPurchaseOrders)
    expect(guardados.map((fila) => fila.code).sort()).toEqual(esperado)
  })
})

// ─── El circuito entero ──────────────────────────────────────────────────────

describe("la liquidación cierra el circuito", () => {
  it("tres unidades producen tres artículos, mueven el presupuesto y no se liquidan dos veces", async () => {
    // Los cuatro escenarios que cierran la rebanada, en el orden en que ocurren de verdad:
    // «La liquidación materializa el inventario», «Tres unidades producen tres artículos»,
    // «El gasto aparece solo en el presupuesto» y «No se liquida dos veces».
    const compra = await productora()
    const almacenista = await signIn("almacenista")
    const bajio = await nave(almacenista, "Renta del Bajío", "Nave central")
    const camara = await producto(bajio, "Cámara", 5)

    const presupuestoAntes = await ok<{ overall: { totalGastado: string } }>(
      await call("GET", `${compra.base}/budget`, undefined, compra.cookie),
      200,
    )
    expect(presupuestoAntes.overall.totalGastado).toBe("0.00")

    const orden = await ok<OrdenDeCompra>(
      await crearOrden(compra, [{ measurementId: camara.measurementId, quantity: 3 }]),
      201,
    )
    const pedido = orden.orders[0]
    if (!pedido) throw new Error("el abanico no abrió el pedido")

    // El almacén acepta: es código de la rebanada 15 y aquí sólo se atraviesa.
    const aceptado = await ok<{ quoteId: string }>(
      await call("POST", `${bajio.base}/orders/${pedido.id}/acceptance`, {}, almacenista),
      201,
    )

    const liquidacion = await ok<{
      shoppingId: string
      quoteId: string
      items: { id: string; code: string; name: string }[]
      purchaseOrder: OrdenDeCompra
    }>(
      await call(
        "POST",
        `${compra.base}/purchase-orders/${orden.id}/orders/${pedido.id}/settlement`,
        { amount: "12500.00", method: "transfer", description: "Transferencia del día 3" },
        compra.cookie,
      ),
      201,
    )

    // Un artículo por **unidad física**, no por línea, cada uno con su propio código.
    expect(liquidacion.items).toHaveLength(3)
    expect(new Set(liquidacion.items.map((articulo) => articulo.code)).size).toBe(3)
    // Y heredan el nombre del producto de origen.
    expect(liquidacion.items.every((articulo) => articulo.name === "Cámara")).toBe(true)

    const inventario = await ok<{ items: { id: string; status: string; description: string }[] }>(
      await call("GET", `${compra.base}/items`, undefined, compra.cookie),
      200,
    )
    expect(inventario.items).toHaveLength(3)
    expect(inventario.items.every((articulo) => articulo.status === "available")).toBe(true)
    expect(inventario.items.every((art) => art.description === "Cámara, con su maleta")).toBe(true)

    // El pedido quedó finalizado y su cotización vendida.
    const cerrado = await ok<{ status: string }>(
      await call("GET", `${bajio.base}/orders/${pedido.id}`, undefined, almacenista),
      200,
    )
    expect(cerrado.status).toBe("finished")

    const cotizacion = await ok<{ status: string }>(
      await call("GET", `${bajio.base}/quotes/${aceptado.quoteId}`, undefined, almacenista),
      200,
    )
    expect(cotizacion.status).toBe("sold")

    // El pago quedó registrado contra esa cotización.
    const pagos = await ok<{ items: { amount: string; method: string }[] }>(
      await call(
        "GET",
        `${bajio.base}/quotes/${aceptado.quoteId}/payments`,
        undefined,
        almacenista,
      ),
      200,
    )
    expect(pagos.items).toHaveLength(1)
    expect(pagos.items[0]?.amount).toBe("12500.00")

    // Las tres unidades del almacén quedaron vendidas.
    const unidades = await db
      .select({ status: warehouseStockUnits.status })
      .from(warehouseStockUnits)
      .where(eq(warehouseStockUnits.measurementId, camara.measurementId))
    expect(unidades.filter((fila) => fila.status === "sold")).toHaveLength(3)

    // El presupuesto se movió **solo**: nadie registró la compra a mano.
    const presupuesto = await ok<{
      overall: { totalGastado: string }
      shoppings: { id: string; amount: string; warehouseOrderId: string | null; items: unknown[] }[]
    }>(await call("GET", `${compra.base}/budget`, undefined, compra.cookie), 200)

    expect(presupuesto.overall.totalGastado).toBe("12500.00")
    expect(presupuesto.shoppings).toHaveLength(1)
    expect(presupuesto.shoppings[0]?.warehouseOrderId).toBe(pedido.id)
    expect(presupuesto.shoppings[0]?.items).toHaveLength(3)

    // La orden de compra quedó liquidada: no le queda ningún pedido vivo.
    expect(liquidacion.purchaseOrder.status).toBe("settled")

    // Y liquidar otra vez responde `409`, sin duplicar nada.
    const segunda = await call(
      "POST",
      `${compra.base}/purchase-orders/${orden.id}/orders/${pedido.id}/settlement`,
      { amount: "12500.00", method: "transfer" },
      compra.cookie,
    )
    expect(segunda.status).toBe(409)

    expect(await db.select({ id: productionItems.id }).from(productionItems)).toHaveLength(3)
    expect(await db.select({ id: productionShoppings.id }).from(productionShoppings)).toHaveLength(
      1,
    )
    expect(
      await db.select({ id: warehouseQuotePayments.id }).from(warehouseQuotePayments),
    ).toHaveLength(1)
  })
})

// ─── Propagación ─────────────────────────────────────────────────────────────

describe("la propagación sube y baja", () => {
  it("cancelar la orden cancela sus pedidos vigentes, libera el inventario y respeta lo liquidado", async () => {
    // Escenarios «La cancelación llega a todos los almacenes» y «Un pedido ya liquidado no se
    // cancela».
    const compra = await productora()
    const almacenista = await signIn("almacenista")
    const uno = await nave(almacenista, "Renta del Bajío", "Nave central")
    const dos = await nave(almacenista, "Luz y Grip", "Bodega norte")

    const camara = await producto(uno, "Cámara", 4)
    const foco = await producto(dos, "Foco de 1K", 4)

    const orden = await ok<OrdenDeCompra>(
      await crearOrden(compra, [
        { measurementId: camara.measurementId, quantity: 2 },
        { measurementId: foco.measurementId, quantity: 2 },
      ]),
      201,
    )

    const enUno = orden.orders.find((pedido) => pedido.warehouseId === uno.id)
    const enDos = orden.orders.find((pedido) => pedido.warehouseId === dos.id)
    if (!enUno || !enDos) throw new Error("el abanico no repartió los dos pedidos")

    // Los dos se aceptan —lo que aparta inventario en las dos naves— y uno se liquida.
    await ok(await call("POST", `${uno.base}/orders/${enUno.id}/acceptance`, {}, almacenista), 201)
    await ok(await call("POST", `${dos.base}/orders/${enDos.id}/acceptance`, {}, almacenista), 201)

    await ok(
      await call(
        "POST",
        `${compra.base}/purchase-orders/${orden.id}/orders/${enUno.id}/settlement`,
        { amount: "8000.00", method: "cash" },
        compra.cookie,
      ),
      201,
    )

    const cancelada = await ok<OrdenDeCompra>(
      await call(
        "POST",
        `${compra.base}/purchase-orders/${orden.id}/cancellation`,
        { reason: "Se cayó la locación" },
        compra.cookie,
      ),
      200,
    )
    expect(cancelada.status).toBe("canceled")
    expect(cancelada.cancelReason).toBe("Se cayó la locación")

    const liquidado = await ok<{ status: string }>(
      await call("GET", `${uno.base}/orders/${enUno.id}`, undefined, almacenista),
      200,
    )
    expect(liquidado.status).toBe("finished")

    const vigente = await ok<{ status: string; cancelReason: string | null }>(
      await call("GET", `${dos.base}/orders/${enDos.id}`, undefined, almacenista),
      200,
    )
    expect(vigente.status).toBe("canceled")
    expect(vigente.cancelReason).toContain("Se cayó la locación")

    // El inventario apartado en la nave que no llegó a vender vuelve a estar libre.
    const libres = await db
      .select({ status: warehouseStockUnits.status })
      .from(warehouseStockUnits)
      .where(eq(warehouseStockUnits.measurementId, foco.measurementId))
    expect(libres.every((fila) => fila.status === "available")).toBe(true)
  })

  it("el último rechazo cierra la orden y uno parcial no", async () => {
    // Escenarios «Un almacén acepta y otro rechaza» y «El último rechazo cierra la orden». La
    // propagación hacia arriba ya existía —rebanada 15— y aquí se comprueba desde el otro extremo.
    const compra = await productora()
    const almacenista = await signIn("almacenista")
    const uno = await nave(almacenista, "Renta del Bajío", "Nave central")
    const dos = await nave(almacenista, "Luz y Grip", "Bodega norte")

    const camara = await producto(uno, "Cámara", 4)
    const foco = await producto(dos, "Foco de 1K", 4)

    const orden = await ok<OrdenDeCompra>(
      await crearOrden(compra, [
        { measurementId: camara.measurementId, quantity: 1 },
        { measurementId: foco.measurementId, quantity: 1 },
      ]),
      201,
    )
    const enUno = orden.orders.find((pedido) => pedido.warehouseId === uno.id)
    const enDos = orden.orders.find((pedido) => pedido.warehouseId === dos.id)
    if (!enUno || !enDos) throw new Error("el abanico no repartió los dos pedidos")

    await ok(
      await call(
        "POST",
        `${uno.base}/orders/${enUno.id}/rejection`,
        { reason: "No hay cámara esa semana" },
        almacenista,
      ),
      200,
    )

    const aMedias = await ok<OrdenDeCompra>(
      await call("GET", `${compra.base}/purchase-orders/${orden.id}`, undefined, compra.cookie),
      200,
    )
    expect(aMedias.status).toBe("open")

    await ok(
      await call(
        "POST",
        `${dos.base}/orders/${enDos.id}/rejection`,
        { reason: "Tampoco hay focos" },
        almacenista,
      ),
      200,
    )

    const cerrada = await ok<OrdenDeCompra>(
      await call("GET", `${compra.base}/purchase-orders/${orden.id}`, undefined, compra.cookie),
      200,
    )
    expect(cerrada.status).toBe("canceled")
    expect(cerrada.cancelReason).toContain("rechazados")
  })
})

// ─── La tienda interna ───────────────────────────────────────────────────────

describe("la tienda interna alimenta la orden", () => {
  it("enseña los almacenes publicados y sus productos con lo que queda libre", async () => {
    // Escenario del catálogo: «los productos publicados de los almacenes disponibles», respetando
    // la disponibilidad y la modalidad.
    const compra = await productora()
    const almacenista = await signIn("almacenista")
    const abierta = await nave(almacenista, "Renta del Bajío", "Nave central")
    const cerrada = await nave(almacenista, "Luz y Grip", "Bodega norte")
    await db.update(warehouses).set({ isPublished: false }).where(eq(warehouses.id, cerrada.id))

    const camara = await producto(abierta, "Cámara", 4)
    await producto(cerrada, "Foco de 1K", 4)

    // Un producto sin publicar no aparece, aunque el almacén sí lo esté.
    const oculto = await producto(abierta, "Prototipo", 2)
    await db
      .update(warehouseProducts)
      .set({ isPublished: false })
      .where(eq(warehouseProducts.id, oculto.productId))

    const escaparate = await ok<{
      items: { warehouseId: string; companyId: string; companyName: string; name: string }[]
    }>(await call("GET", `${compra.base}/procurement/warehouses`, undefined, compra.cookie), 200)

    expect(escaparate.items.map((fila) => fila.warehouseId)).toEqual([abierta.id])
    expect(escaparate.items[0]?.companyName).toBe("Renta del Bajío")

    const catalogo = await ok<{
      items: {
        productId: string
        name: string
        availableForRent: boolean
        measurements: { id: string; name: string; available: number }[]
      }[]
    }>(
      await call(
        "GET",
        `${compra.base}/procurement/warehouses/${abierta.id}/products`,
        undefined,
        compra.cookie,
      ),
      200,
    )

    expect(catalogo.items.map((fila) => fila.productId)).toEqual([camara.productId])
    expect(catalogo.items[0]?.measurements[0]?.available).toBe(4)
  })

  it("el escaparate de un almacén sin publicar no se puede pedir por su identificador", async () => {
    const compra = await productora()
    const almacenista = await signIn("almacenista")
    const cerrada = await nave(almacenista, "Luz y Grip", "Bodega norte")
    await db.update(warehouses).set({ isPublished: false }).where(eq(warehouses.id, cerrada.id))
    await producto(cerrada, "Foco de 1K", 4)

    const respuesta = await call(
      "GET",
      `${compra.base}/procurement/warehouses/${cerrada.id}/products`,
      undefined,
      compra.cookie,
    )
    expect(respuesta.status).toBe(404)
  })
})
