/**
 * Precios y unidades de existencia, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/stock-units/spec.md` y de los requisitos de
 * precios de `warehouse-catalog`.
 *
 * Las dos que más importan:
 *
 * - **Retirar un producto de una lista de precios surte efecto.** Es la corrección de `L-04`: la
 *   implementación anterior calculaba altas y bajas con el mismo criterio, así que las bajas nunca
 *   se ejecutaban. Se descubría al facturar.
 * - **Un compromiso vigente bloquea el cambio manual.** Sin eso, el inventario y las cotizaciones
 *   se contradicen y no hay forma de saber cuál miente.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  companyServices,
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
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${warehouseStockEvents}, ${warehouseStockUnits}, ${warehouseMeasurements}, ${warehouseProductPrices}, ${warehousePriceLists}, ${warehouseProducts}, ${warehouseCategories}, ${warehouseStorages}, ${warehouses}, ${services}, ${companies} cascade`,
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

interface Unit {
  id: string
  code: string
  status: string
}

interface Detail {
  id: string
  code: string
  measurements: { id: string; name: string; units: Record<string, number> }[]
}

let cookie = ""
let companyId = ""
let warehouseId = ""
let base = ""

beforeAll(async () => {
  await reset()

  const email = "existencias@ejemplo.mx"
  await request("POST", "/auth/register", { email, password: PASSWORD, name: "Existencias" })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const login = await request("POST", "/auth/login", { email, password: PASSWORD })
  cookie =
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""

  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name: "Casa de Renta" }, cookie),
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
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

async function clearCatalog() {
  await db.execute(
    sql`truncate table ${warehouseQuotes}, ${warehouseStockEvents}, ${warehouseStockUnits}, ${warehouseMeasurements}, ${warehouseProductPrices}, ${warehousePriceLists}, ${warehouseProducts} cascade`,
  )
}

/** Un producto con una medida y `quantity` unidades disponibles. */
async function newStocked(name: string, quantity: number): Promise<Detail> {
  const response = await request(
    "POST",
    `${base}/products`,
    { name, measurements: [{ name: "Cuerpo", initialQuantity: quantity }] },
    cookie,
  )
  expect(response.status).toBe(201)
  return json<Detail>(response)
}

async function unitsOf(measurementId: string): Promise<Unit[]> {
  const page = await json<{ items: Unit[] }>(
    await request("GET", `${base}/measurements/${measurementId}/units`, undefined, cookie),
  )
  return page.items
}

// ─── Unidades ────────────────────────────────────────────────────────────────

describe("una unidad es un objeto físico", () => {
  it("cinco unidades son cinco registros, cada uno con su código", async () => {
    // Escenario: «Cinco unidades son cinco registros».
    await clearCatalog()
    const product = await newStocked("Cámara", 5)
    const measurementId = product.measurements[0]?.id as string

    const units = await unitsOf(measurementId)

    expect(units).toHaveLength(5)
    expect(new Set(units.map((row) => row.code)).size).toBe(5)
    expect(units.every((row) => row.status === "available")).toBe(true)
  })

  it("se crean veinte de una vez", async () => {
    // Escenario: «Se crean veinte de una vez».
    await clearCatalog()
    const product = await newStocked("Cámara", 0)
    const measurementId = product.measurements[0]?.id as string

    const response = await request(
      "POST",
      `${base}/measurements/${measurementId}/units`,
      { quantity: 20 },
      cookie,
    )
    expect(response.status).toBe(201)

    const created = await json<{ items: Unit[] }>(response)
    expect(created.items).toHaveLength(20)
    expect(new Set(created.items.map((row) => row.code)).size).toBe(20)
  })

  it("el código acompaña a la unidad entre cambios de estado", async () => {
    // Escenario: «El código acompaña a la unidad».
    await clearCatalog()
    const product = await newStocked("Cámara", 1)
    const measurementId = product.measurements[0]?.id as string
    const [unit] = await unitsOf(measurementId)

    for (const status of ["damaged", "available", "rented"]) {
      await request(
        "PATCH",
        `${base}/measurements/${measurementId}/units`,
        { unitIds: [unit?.id], status },
        cookie,
      )
    }

    const [after] = await unitsOf(measurementId)
    expect(after?.code).toBe(unit?.code)
    expect(after?.status).toBe("rented")
  })

  it("se localiza una unidad por el código de su etiqueta", async () => {
    // Escenario: «Se localiza una unidad escaneada». Es la consulta del escáner: quien lee la
    // etiqueta no sabe de qué producto es, para eso la lee.
    await clearCatalog()

    const storage = await json<{ id: string }>(
      await request("POST", `${base}/storages`, { name: "Caja", kind: "box" }, cookie),
    )
    const created = await json<Detail & { id: string }>(
      await request(
        "POST",
        `${base}/products`,
        {
          name: "Cámara Sony",
          storageId: storage.id,
          measurements: [{ name: "Cuerpo", initialQuantity: 1 }],
        },
        cookie,
      ),
    )

    const [unit] = await unitsOf(created.measurements[0]?.id as string)

    const found = await json<{
      code: string
      status: string
      productName: string
      measurementName: string
      storageCode: string | null
    }>(await request("GET", `${base}/units/by-code/${unit?.code}`, undefined, cookie))

    expect(found.code).toBe(unit?.code)
    expect(found.productName).toBe("Cámara Sony")
    expect(found.measurementName).toBe("Cuerpo")
    expect(found.storageCode).toBe("BOX1")
  })

  it("un código de otro almacén no se encuentra", async () => {
    await clearCatalog()
    const product = await newStocked("Cámara", 1)
    const [unit] = await unitsOf(product.measurements[0]?.id as string)

    const other = await json<{ id: string }>(
      await request("POST", `/companies/${companyId}/warehouses`, { name: "Otra nave" }, cookie),
    )

    const response = await request(
      "GET",
      `/companies/${companyId}/warehouses/${other.id}/units/by-code/${unit?.code}`,
      undefined,
      cookie,
    )

    expect(response.status).toBe(404)
  })
})

describe("modificación del estado", () => {
  it("se marcan varias como dañadas y el resto no cambia", async () => {
    // Escenario: «Se marcan varias como dañadas».
    await clearCatalog()
    const product = await newStocked("Cámara", 5)
    const measurementId = product.measurements[0]?.id as string
    const units = await unitsOf(measurementId)

    const response = await request(
      "PATCH",
      `${base}/measurements/${measurementId}/units`,
      { unitIds: units.slice(0, 3).map((row) => row.id), status: "damaged" },
      cookie,
    )
    expect(response.status).toBe(200)

    const after = await unitsOf(measurementId)
    expect(after.filter((row) => row.status === "damaged")).toHaveLength(3)
    expect(after.filter((row) => row.status === "available")).toHaveLength(2)
  })

  it("sin lista de unidades cambia todas las de la medida", async () => {
    await clearCatalog()
    const product = await newStocked("Cámara", 4)
    const measurementId = product.measurements[0]?.id as string

    await request(
      "PATCH",
      `${base}/measurements/${measurementId}/units`,
      { status: "damaged" },
      cookie,
    )

    const after = await unitsOf(measurementId)
    expect(after.every((row) => row.status === "damaged")).toBe(true)
  })

  it("una unidad comprometida bloquea el cambio manual, y no cambia ninguna", async () => {
    /**
     * Escenarios: «No se libera a mano una unidad reservada» y «Un fallo parcial no aplica nada».
     *
     * Liberar una unidad reservada se hace deshaciendo el compromiso, no marcándola disponible por
     * detrás — o la cotización seguiría diciendo que la tiene. Y como la operación es atómica, el
     * intento no deja a las otras dos cambiadas.
     */
    await clearCatalog()
    const product = await newStocked("Cámara", 3)
    const measurementId = product.measurements[0]?.id as string
    const units = await unitsOf(measurementId)

    // El compromiso lo pondrá una cotización cuando exista; aquí se simula en la base.
    await db
      .update(warehouseStockUnits)
      .set({ status: "in_quote" })
      .where(eq(warehouseStockUnits.id, units[0]?.id as string))

    const response = await request(
      "PATCH",
      `${base}/measurements/${measurementId}/units`,
      { status: "damaged" },
      cookie,
    )

    expect(response.status).toBe(422)
    expect(await response.text()).toContain("comprometid")

    const after = await unitsOf(measurementId)
    expect(after.filter((row) => row.status === "available")).toHaveLength(2)
    expect(after.filter((row) => row.status === "in_quote")).toHaveLength(1)
  })

  it("una unidad que salió definitivamente no vuelve", async () => {
    // Escenario: «Una unidad vendida no se cotiza». Una vendida no se recupera con un cambio de
    // estado: se da de alta una nueva, porque la vieja lleva meses fuera.
    await clearCatalog()
    const product = await newStocked("Cámara", 2)
    const measurementId = product.measurements[0]?.id as string
    const units = await unitsOf(measurementId)

    await request(
      "PATCH",
      `${base}/measurements/${measurementId}/units`,
      { unitIds: [units[0]?.id], status: "sold" },
      cookie,
    )

    const response = await request(
      "PATCH",
      `${base}/measurements/${measurementId}/units`,
      { unitIds: [units[0]?.id], status: "available" },
      cookie,
    )

    expect(response.status).toBe(422)
    expect(await response.text()).toContain("definitivamente")
  })

  it("una unidad reparada sí vuelve al inventario", async () => {
    // Escenario: «Una unidad reparada vuelve al inventario». Las incidencias se reparan; las
    // salidas definitivas no.
    await clearCatalog()
    const product = await newStocked("Cámara", 1)
    const measurementId = product.measurements[0]?.id as string
    const [unit] = await unitsOf(measurementId)

    await request(
      "PATCH",
      `${base}/measurements/${measurementId}/units`,
      { unitIds: [unit?.id], status: "damaged" },
      cookie,
    )

    const response = await request(
      "PATCH",
      `${base}/measurements/${measurementId}/units`,
      { unitIds: [unit?.id], status: "available" },
      cookie,
    )

    expect(response.status).toBe(200)
    expect((await unitsOf(measurementId))[0]?.status).toBe("available")
  })

  it("se filtran las disponibles", async () => {
    // Escenario: «Se filtran las disponibles».
    await clearCatalog()
    const product = await newStocked("Cámara", 5)
    const measurementId = product.measurements[0]?.id as string
    const units = await unitsOf(measurementId)

    await request(
      "PATCH",
      `${base}/measurements/${measurementId}/units`,
      { unitIds: units.slice(0, 2).map((row) => row.id), status: "damaged" },
      cookie,
    )

    const page = await json<{ items: Unit[]; totalItems: number }>(
      await request(
        "GET",
        `${base}/measurements/${measurementId}/units?status=available`,
        undefined,
        cookie,
      ),
    )

    expect(page.totalItems).toBe(3)
    expect(page.items.every((row) => row.status === "available")).toBe(true)
  })
})

describe("todo cambio de estado deja rastro", () => {
  it("se puede reconstruir la vida de una unidad", async () => {
    // Escenario: «Se puede reconstruir la vida de una unidad». El alta cuenta: sin el momento
    // inicial, el historial empieza en el segundo estado y no se sabe de dónde salió.
    await clearCatalog()
    const product = await newStocked("Cámara", 1)
    const measurementId = product.measurements[0]?.id as string
    const [unit] = await unitsOf(measurementId)

    for (const status of ["in_order", "rented", "available"]) {
      // El primero se pone por la base: un compromiso no se pone a mano, lo pone un documento.
      if (status === "in_order") {
        await db
          .update(warehouseStockUnits)
          .set({ status: "in_order" })
          .where(eq(warehouseStockUnits.id, unit?.id as string))
        await db.insert(warehouseStockEvents).values({
          id: newId(),
          stockUnitId: unit?.id as string,
          fromStatus: "available",
          toStatus: "in_order",
          reason: "order",
        })
        continue
      }

      await db
        .update(warehouseStockUnits)
        .set({ status: status === "rented" ? "rented" : "available" })
        .where(eq(warehouseStockUnits.id, unit?.id as string))
      await db.insert(warehouseStockEvents).values({
        id: newId(),
        stockUnitId: unit?.id as string,
        fromStatus: status === "rented" ? "in_order" : "rented",
        toStatus: status === "rented" ? "rented" : "available",
        reason: status === "rented" ? "order" : "rental_return",
      })
    }

    const history = await json<{ items: { toStatus: string; reason: string }[] }>(
      await request("GET", `${base}/units/${unit?.id}/history`, undefined, cookie),
    )

    // Cuatro momentos: el alta y los tres cambios. De lo más reciente a lo más antiguo.
    expect(history.items).toHaveLength(4)
    expect(history.items.map((row) => row.toStatus)).toEqual([
      "available",
      "rented",
      "in_order",
      "available",
    ])
    expect(history.items.at(-1)?.reason).toBe("created")
  })

  it("un cambio manual registra quién lo hizo y su motivo", async () => {
    await clearCatalog()
    const product = await newStocked("Cámara", 1)
    const measurementId = product.measurements[0]?.id as string
    const [unit] = await unitsOf(measurementId)

    await request(
      "PATCH",
      `${base}/measurements/${measurementId}/units`,
      { unitIds: [unit?.id], status: "damaged", note: "Golpe en el visor" },
      cookie,
    )

    const history = await json<{
      items: {
        fromStatus: string | null
        toStatus: string
        reason: string
        note: string | null
        actorId: string | null
        actorName: string | null
      }[]
    }>(await request("GET", `${base}/units/${unit?.id}/history`, undefined, cookie))

    expect(history.items[0]).toMatchObject({
      fromStatus: "available",
      toStatus: "damaged",
      reason: "manual",
      note: "Golpe en el visor",
    })

    // H-33: el evento viaja con el nombre. Nombrar a quien movió una unidad obligaba a pedir el
    // padrón de la empresa, que exige un permiso de otro dominio.
    expect(history.items[0]?.actorId).not.toBeNull()
    expect(history.items[0]?.actorName).toBe("Existencias")
  })

  it("un cambio sin responsable no inventa uno", async () => {
    // Los que provoca un documento —o la siembra— no tienen persona detrás: el nombre es nulo, y
    // eso es distinto de no saber quién fue.
    await clearCatalog()
    const product = await newStocked("Cámara", 1)
    const measurementId = product.measurements[0]?.id as string
    const [unit] = await unitsOf(measurementId)

    await db.insert(warehouseStockEvents).values({
      id: newId(),
      stockUnitId: unit?.id as string,
      fromStatus: "available",
      toStatus: "in_order",
      reason: "order",
    })

    const history = await json<{ items: { actorId: string | null; actorName: string | null }[] }>(
      await request("GET", `${base}/units/${unit?.id}/history`, undefined, cookie),
    )

    expect(history.items[0]).toMatchObject({ actorId: null, actorName: null })
  })
})

describe("baja de unidades", () => {
  it("es lógica: deja de contar y conserva su rastro", async () => {
    // Escenario: «Una unidad vendida conserva su rastro».
    await clearCatalog()
    const product = await newStocked("Cámara", 3)
    const measurementId = product.measurements[0]?.id as string
    const units = await unitsOf(measurementId)

    const response = await request(
      "DELETE",
      `${base}/measurements/${measurementId}/units`,
      { unitIds: [units[0]?.id] },
      cookie,
    )
    expect(response.status).toBe(204)

    expect(await unitsOf(measurementId)).toHaveLength(2)

    const [row] = await db
      .select()
      .from(warehouseStockUnits)
      .where(eq(warehouseStockUnits.id, units[0]?.id as string))
    expect(row?.deletedAt).not.toBeNull()
  })

  it("una unidad comprometida no se da de baja", async () => {
    await clearCatalog()
    const product = await newStocked("Cámara", 2)
    const measurementId = product.measurements[0]?.id as string
    const units = await unitsOf(measurementId)

    await db
      .update(warehouseStockUnits)
      .set({ status: "in_quote" })
      .where(eq(warehouseStockUnits.id, units[0]?.id as string))

    const response = await request(
      "DELETE",
      `${base}/measurements/${measurementId}/units`,
      { unitIds: [units[0]?.id] },
      cookie,
    )

    expect(response.status).toBe(422)
    expect(await unitsOf(measurementId)).toHaveLength(2)
  })
})

// ─── Precios ─────────────────────────────────────────────────────────────────

async function newList(name: string): Promise<{ id: string }> {
  const response = await request("POST", `${base}/price-lists`, { name }, cookie)
  expect(response.status).toBe(201)
  return json<{ id: string }>(response)
}

describe("listas de precios", () => {
  it("una lista se pide por su identificador, sin recorrer el listado", async () => {
    // H-35: la ficha buscaba la suya dentro del listado paginado, que es un rodeo que ninguna otra
    // ficha del sistema necesita.
    await clearCatalog()
    const product = await newStocked("Cámara", 0)
    const list = await newList("Preferente")

    await request(
      "PUT",
      `${base}/price-lists/${list.id}/prices/${product.id}`,
      { sale: "900.00" },
      cookie,
    )

    const response = await request("GET", `${base}/price-lists/${list.id}`, undefined, cookie)
    expect(response.status).toBe(200)
    expect(await json<{ name: string; productCount: number }>(response)).toMatchObject({
      name: "Preferente",
      productCount: 1,
    })
  })

  it("una lista dada de baja deja de traerse", async () => {
    await clearCatalog()
    const list = await newList("Temporal")
    await request("DELETE", `${base}/price-lists/${list.id}`, undefined, cookie)

    const response = await request("GET", `${base}/price-lists/${list.id}`, undefined, cookie)
    expect(response.status).toBe(404)
  })

  it("cada tarifa viaja con el nombre y el código de su producto", async () => {
    // H-34: la pantalla se traía el catálogo entero del almacén —hasta tres peticiones y dos mil
    // productos— sólo para nombrar las filas. Es H-08b otra vez, en el recurso de al lado.
    await clearCatalog()
    const camara = await newStocked("Cámara", 0)
    const tripie = await newStocked("Tripié", 0)
    const list = await newList("Pública")

    await request(
      "PUT",
      `${base}/price-lists/${list.id}/prices/${tripie.id}`,
      { sale: "300.00" },
      cookie,
    )
    await request(
      "PUT",
      `${base}/price-lists/${list.id}/prices/${camara.id}`,
      { sale: "1200.00" },
      cookie,
    )

    const prices = await json<{
      items: { productId: string; productName: string; productCode: string; sale: string }[]
    }>(await request("GET", `${base}/price-lists/${list.id}/prices`, undefined, cookie))

    // Por nombre de producto: una lista de doscientas tarifas se lee, no se ordena en la pantalla.
    expect(prices.items.map((row) => row.productName)).toEqual(["Cámara", "Tripié"])
    expect(prices.items[0]).toMatchObject({ productId: camara.id, productCode: camara.code })
  })

  it("la tarifa de un producto dado de baja deja de figurar y de contarse", async () => {
    // Las dos cifras se sacan de la misma condición: la ficha no puede decir «dos productos» y
    // enseñar una fila.
    await clearCatalog()
    const a = await newStocked("A", 0)
    const b = await newStocked("B", 0)
    const list = await newList("Pública")

    await request(
      "PUT",
      `${base}/price-lists/${list.id}/products`,
      { productIds: [a.id, b.id] },
      cookie,
    )
    expect((await request("DELETE", `${base}/products/${a.id}`, undefined, cookie)).status).toBe(
      204,
    )

    const prices = await json<{ items: { productId: string }[] }>(
      await request("GET", `${base}/price-lists/${list.id}/prices`, undefined, cookie),
    )
    expect(prices.items.map((row) => row.productId)).toEqual([b.id])

    const ficha = await json<{ productCount: number }>(
      await request("GET", `${base}/price-lists/${list.id}`, undefined, cookie),
    )
    expect(ficha.productCount).toBe(1)
  })

  it("un producto figura en dos listas con tarifas distintas", async () => {
    // Escenario: «Un producto figura en dos listas».
    await clearCatalog()
    const product = await newStocked("Cámara", 0)
    const publica = await newList("Pública")
    const preferente = await newList("Preferente")

    await request(
      "PUT",
      `${base}/price-lists/${publica.id}/prices/${product.id}`,
      { sale: "1200.00" },
      cookie,
    )
    await request(
      "PUT",
      `${base}/price-lists/${preferente.id}/prices/${product.id}`,
      { sale: "950.00" },
      cookie,
    )

    const enPublica = await json<{ items: { sale: string }[] }>(
      await request("GET", `${base}/price-lists/${publica.id}/prices`, undefined, cookie),
    )
    const enPreferente = await json<{ items: { sale: string }[] }>(
      await request("GET", `${base}/price-lists/${preferente.id}/prices`, undefined, cookie),
    )

    expect(enPublica.items[0]?.sale).toBe("1200.00")
    expect(enPreferente.items[0]?.sale).toBe("950.00")
  })

  it("establecer el conjunto retira efectivamente los que sobran", async () => {
    /**
     * Escenario: «Retirar un producto de la lista surte efecto». **Es la corrección de `L-04`.**
     *
     * La implementación anterior calculaba altas y bajas con el mismo criterio —los que están en
     * el conjunto pedido—, así que la lista de bajas salía siempre vacía y retirar un producto de
     * una lista no surtía efecto nunca. Se descubría al facturar.
     */
    await clearCatalog()
    const a = await newStocked("A", 0)
    const b = await newStocked("B", 0)
    const cc = await newStocked("C", 0)
    const d = await newStocked("D", 0)
    const list = await newList("Pública")

    await request(
      "PUT",
      `${base}/price-lists/${list.id}/products`,
      { productIds: [a.id, b.id, cc.id] },
      cookie,
    )

    const result = await json<{ added: number; removed: number; kept: number }>(
      await request(
        "PUT",
        `${base}/price-lists/${list.id}/products`,
        { productIds: [a.id, d.id] },
        cookie,
      ),
    )

    expect(result).toEqual({ added: 1, removed: 2, kept: 1 })

    const prices = await json<{ items: { productId: string }[] }>(
      await request("GET", `${base}/price-lists/${list.id}/prices`, undefined, cookie),
    )
    expect(new Set(prices.items.map((row) => row.productId))).toEqual(new Set([a.id, d.id]))
  })

  it("conservar un producto conserva su tarifa", async () => {
    // «Establecer el conjunto» no es «rehacer la lista»: quien ya tenía tarifa la mantiene.
    await clearCatalog()
    const a = await newStocked("A", 0)
    const b = await newStocked("B", 0)
    const list = await newList("Pública")

    await request(
      "PUT",
      `${base}/price-lists/${list.id}/prices/${a.id}`,
      { sale: "500.00" },
      cookie,
    )
    await request(
      "PUT",
      `${base}/price-lists/${list.id}/products`,
      { productIds: [a.id, b.id] },
      cookie,
    )

    const prices = await json<{ items: { productId: string; sale: string }[] }>(
      await request("GET", `${base}/price-lists/${list.id}/prices`, undefined, cookie),
    )
    const tarifa = prices.items.find((row) => row.productId === a.id)

    expect(tarifa?.sale).toBe("500.00")
  })

  it("eliminar una lista no borra los productos", async () => {
    // Escenario: «Los productos sobreviven a la lista».
    await clearCatalog()
    const product = await newStocked("Cámara", 0)
    const list = await newList("Temporal")

    await request(
      "PUT",
      `${base}/price-lists/${list.id}/prices/${product.id}`,
      { sale: "800.00" },
      cookie,
    )
    await request("DELETE", `${base}/price-lists/${list.id}`, undefined, cookie)

    const catalogo = await json<{ totalItems: number }>(
      await request("GET", `${base}/products`, undefined, cookie),
    )
    expect(catalogo.totalItems).toBe(1)

    const gone = await request("GET", `${base}/price-lists/${list.id}/prices`, undefined, cookie)
    expect(gone.status).toBe(404)
  })
})

/**
 * Una cotización que cobra por las tarifas de una lista.
 *
 * Va por la base y no por la ruta: lo que se prueba aquí es la guarda de la baja, y montar el
 * documento entero por la API metería media rebanada 13 en una suite de precios.
 */
async function quoteUsing(
  status: "pending" | "canceled",
  productPriceIds: readonly string[],
  measurementId: string,
): Promise<string> {
  const quoteId = newId()
  await db
    .insert(warehouseQuotes)
    .values({ id: quoteId, warehouseId, code: `COT-${quoteId}`, type: "rent", status })

  await db.insert(warehouseQuoteLines).values(
    productPriceIds.map((productPriceId, position) => ({
      id: newId(),
      quoteId,
      measurementId,
      productPriceId,
      position,
    })),
  )

  return quoteId
}

describe("baja de una lista de precios", () => {
  it("el alcance enumera las cotizaciones que la usan, y las que están en curso", async () => {
    // H-37: `warehouse-catalog` pide advertir cuando la lista esté referenciada por cotizaciones
    // en curso, y no había dato con el que hacerlo. Es lo mismo que resolvió la baja de un almacén.
    await clearCatalog()
    const camara = await newStocked("Cámara", 1)
    const tripie = await newStocked("Tripié", 1)
    const list = await newList("Pública")
    const measurementId = camara.measurements[0]?.id as string

    const unaTarifa = await json<{ id: string }>(
      await request(
        "PUT",
        `${base}/price-lists/${list.id}/prices/${camara.id}`,
        { sale: "1200.00" },
        cookie,
      ),
    )
    const otraTarifa = await json<{ id: string }>(
      await request(
        "PUT",
        `${base}/price-lists/${list.id}/prices/${tripie.id}`,
        { sale: "300.00" },
        cookie,
      ),
    )

    // Dos líneas de la misma lista en una sola cotización: cuenta el documento, no las líneas.
    await quoteUsing("pending", [unaTarifa.id, otraTarifa.id], measurementId)
    await quoteUsing("canceled", [unaTarifa.id], measurementId)

    const scope = await json<{ products: number; quotes: number; openQuotes: number }>(
      await request("GET", `${base}/price-lists/${list.id}/scope`, undefined, cookie),
    )

    expect(scope).toEqual({ products: 2, quotes: 2, openQuotes: 1 })
  })

  it("no se da de baja mientras una cotización en curso cobre por ella", async () => {
    await clearCatalog()
    const camara = await newStocked("Cámara", 1)
    const list = await newList("Pública")
    const measurementId = camara.measurements[0]?.id as string

    const tarifa = await json<{ id: string }>(
      await request(
        "PUT",
        `${base}/price-lists/${list.id}/prices/${camara.id}`,
        { sale: "1200.00" },
        cookie,
      ),
    )
    const quoteId = await quoteUsing("pending", [tarifa.id], measurementId)

    const rechazada = await request("DELETE", `${base}/price-lists/${list.id}`, undefined, cookie)
    expect(rechazada.status).toBe(409)
    expect(await rechazada.text()).toContain("cotización")

    // Cerrada la cotización, la baja pasa: la guarda mira lo que está en curso, no el historial.
    await db
      .update(warehouseQuotes)
      .set({ status: "canceled" })
      .where(eq(warehouseQuotes.id, quoteId))

    const aceptada = await request("DELETE", `${base}/price-lists/${list.id}`, undefined, cookie)
    expect(aceptada.status).toBe(204)
  })
})

describe("precedencia al resolver el precio", () => {
  it("la tarifa de la lista tiene precedencia sobre el precio del producto", async () => {
    // Escenario: «La tarifa de la lista tiene precedencia».
    await clearCatalog()
    const product = await json<{ id: string }>(
      await request("POST", `${base}/products`, { name: "Cámara", price: "1000.00" }, cookie),
    )
    const list = await newList("Preferente")

    await request(
      "PUT",
      `${base}/price-lists/${list.id}/prices/${product.id}`,
      { sale: "750.00" },
      cookie,
    )

    const resolved = await json<{ amount: string; origin: string; missing: boolean }>(
      await request(
        "GET",
        `${base}/products/${product.id}/price?priceListId=${list.id}`,
        undefined,
        cookie,
      ),
    )

    expect(resolved).toEqual({ amount: "750.00", origin: "price_list", missing: false })
  })

  it("sin tarifa se usa el precio escalar del producto", async () => {
    // Escenario: «Sin tarifa se usa el precio del producto».
    await clearCatalog()
    const product = await json<{ id: string }>(
      await request("POST", `${base}/products`, { name: "Cámara", price: "1000.00" }, cookie),
    )

    const resolved = await json<{ amount: string; origin: string }>(
      await request("GET", `${base}/products/${product.id}/price`, undefined, cookie),
    )

    expect(resolved).toEqual({ amount: "1000.00", origin: "product", missing: false })
  })

  it("sin ninguno de los dos el precio es cero, y se marca que falta", async () => {
    // Escenario: «Sin ninguno de los dos el precio es cero». El cero no es un precio: es la
    // ausencia de uno, y la interfaz tiene que poder advertirlo.
    await clearCatalog()
    const product = await newStocked("Cámara", 0)

    const resolved = await json<{ amount: string; origin: string; missing: boolean }>(
      await request("GET", `${base}/products/${product.id}/price`, undefined, cookie),
    )

    expect(resolved).toEqual({ amount: "0.00", origin: "none", missing: true })
  })

  it("el precio escalar no aplica a la renta", async () => {
    // Cobrar el precio de venta por un día de renta es un error de tres órdenes de magnitud, y de
    // los que se descubren después de emitir la factura.
    await clearCatalog()
    const product = await json<{ id: string }>(
      await request("POST", `${base}/products`, { name: "Cámara", price: "1000.00" }, cookie),
    )

    const resolved = await json<{ amount: string; missing: boolean }>(
      await request("GET", `${base}/products/${product.id}/price?mode=rent`, undefined, cookie),
    )

    expect(resolved).toEqual({ amount: "0.00", origin: "none", missing: true })
  })

  it("una tarifa de renta por periodicidad usa la del plazo pedido", async () => {
    // Escenario: «Se define una tarifa de renta por periodicidad».
    await clearCatalog()
    const product = await newStocked("Cámara", 0)
    const list = await newList("Pública")

    await request(
      "PUT",
      `${base}/price-lists/${list.id}/prices/${product.id}`,
      { rent: { isFixed: false, daily: "300.00", weekly: "1500.00", monthly: "5000.00" } },
      cookie,
    )

    const query = (frequency: string) =>
      request(
        "GET",
        `${base}/products/${product.id}/price?mode=rent&priceListId=${list.id}&frequency=${frequency}`,
        undefined,
        cookie,
      )

    expect((await json<{ amount: string }>(await query("daily"))).amount).toBe("300.00")
    expect((await json<{ amount: string }>(await query("weekly"))).amount).toBe("1500.00")
    expect((await json<{ amount: string }>(await query("monthly"))).amount).toBe("5000.00")
  })

  it("una tarifa fija ignora la periodicidad", async () => {
    // Escenario: «Una tarifa fija ignora la periodicidad». Mirar la frecuencia primero haría que
    // una tarifa fija con un importe diario suelto cobrara el diario.
    await clearCatalog()
    const product = await newStocked("Cámara", 0)
    const list = await newList("Pública")

    await request(
      "PUT",
      `${base}/price-lists/${list.id}/prices/${product.id}`,
      { rent: { isFixed: true, fixed: "2000.00", daily: "300.00" } },
      cookie,
    )

    const resolved = await json<{ amount: string }>(
      await request(
        "GET",
        `${base}/products/${product.id}/price?mode=rent&priceListId=${list.id}&frequency=monthly`,
        undefined,
        cookie,
      ),
    )

    expect(resolved.amount).toBe("2000.00")
  })

  it("el ajuste de la medida se suma al precio resuelto, en centavos", async () => {
    // En enteros y no en coma flotante: `0.1 + 0.2` no es `0.3`, y un catálogo de mil productos
    // convierte ese error en una factura que no cuadra por unos pesos que nadie encuentra.
    await clearCatalog()
    const product = await json<{ id: string }>(
      await request("POST", `${base}/products`, { name: "Cámara", price: "0.10" }, cookie),
    )

    const resolved = await json<{ amount: string }>(
      await request(
        "GET",
        `${base}/products/${product.id}/price?priceDifference=0.20`,
        undefined,
        cookie,
      ),
    )

    expect(resolved.amount).toBe("0.30")
  })
})
