/**
 * El presupuesto de una producción, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/production-budget/spec.md`. El bloque entero se
 * recorre por HTTP —serialización, cookie, enrutado, guardián y manejador—, y no contra las
 * funciones: lo que se prueba aquí no es que sumen, que eso ya se prueba en los contratos sin base
 * de datos, sino que **el artículo acaba donde debe** y que la diferencia que sale por el cable es
 * la que se espera.
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
  productionAttachments,
  productions,
  roles,
  services,
  sessions,
  uploads,
  users,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"

// ─── Andamiaje ───────────────────────────────────────────────────────────────

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

let server: ReturnType<typeof serve>
let origin = ""

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${counterparties}, ${productions}, ${uploads}, ${services}, ${companies} cascade`,
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

beforeEach(reset)

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await reset()
  await closeConnection()
})

interface Session {
  readonly cookie: string
  readonly userId: string
}

function request(method: string, path: string, body?: unknown, cookie?: string) {
  return fetch(`${origin}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function signUp(email: string): Promise<Session> {
  await request("POST", "/auth/register", { email, password: PASSWORD, name: email.split("@")[0] })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const response = await request("POST", "/auth/login", { email, password: PASSWORD })
  const cookie = response.headers
    .getSetCookie()
    .find((raw) => raw.startsWith("tfv_session="))
    ?.split(";")[0]

  if (!cookie) throw new Error("no se abrió sesión")

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (!user) throw new Error("la cuenta debería existir")

  return { cookie, userId: user.id }
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

async function scene() {
  const session = await signUp(`presupuesto-${newId()}@tfv.dev`)
  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name: "Estudios Mariposa" }, session.cookie),
  )
  await enableService(company.id, "productions")

  const production = await json<{ id: string }>(
    await request(
      "POST",
      `/companies/${company.id}/productions`,
      { name: `Serie Piloto ${newId()}` },
      session.cookie,
    ),
  )

  return {
    session,
    companyId: company.id,
    productionId: production.id,
    base: `/companies/${company.id}/productions/${production.id}`,
  }
}

type Scene = Awaited<ReturnType<typeof scene>>

interface Anchor {
  id: string
  name: string
  amount: string
  categoryId: string | null
  categoryName: string | null
  attachments: { id: string; uploadId: string }[]
}

interface Shopping {
  id: string
  name: string
  amount: string
  kind: string
  method: string
  cardLast4: string | null
  isDeductible: boolean
  providerId: string | null
  providerName: string | null
  categoryId: string | null
  warehouseOrderId: string | null
  items: { id: string; name: string; code: string }[]
  attachments: { id: string; uploadId: string }[]
}

interface Amounts {
  totalPresupuestado: string
  totalGastado: string
  diferencia: string
  isUnfavorable: boolean
}

interface Budget {
  anchors: Anchor[]
  shoppings: Shopping[]
  filtered: Amounts
  overall: Amounts
  categories: {
    categoryId: string | null
    categoryName: string | null
    budgeted: string
    spent: string
    isUnfavorable: boolean
  }[]
}

interface Item {
  id: string
  name: string
  code: string
  /** A qué compra pertenece, o a ninguna. Es la columna que hace de la relación un movimiento. */
  shoppingId: string | null
}

async function newAnchor(s: Scene, body: Record<string, unknown>): Promise<Anchor> {
  const response = await request(
    "POST",
    `${s.base}/anchors`,
    { name: `Partida ${newId()}`, amount: "0.00", ...body },
    s.session.cookie,
  )
  expect(response.status).toBe(201)
  return json(response)
}

async function newShopping(s: Scene, body: Record<string, unknown> = {}): Promise<Shopping> {
  const response = await request(
    "POST",
    `${s.base}/shoppings`,
    { name: `Gasto ${newId()}`, amount: "0.00", ...body },
    s.session.cookie,
  )
  expect(response.status).toBe(201)
  return json(response)
}

async function newItem(s: Scene, name: string): Promise<Item> {
  const response = await request("POST", `${s.base}/items`, { name }, s.session.cookie)
  expect(response.status).toBe(201)
  return json(response)
}

async function newCategory(s: Scene, name: string): Promise<{ id: string; name: string }> {
  const response = await request("POST", `${s.base}/categories`, { name }, s.session.cookie)
  expect(response.status).toBe(201)
  return json(response)
}

async function newProvider(s: Scene, alias: string): Promise<string> {
  const id = newId()
  await db.insert(counterparties).values({ id, companyId: s.companyId, role: "provider", alias })
  return id
}

async function seedUpload(companyId: string, name: string): Promise<string> {
  const id = newId()
  await db.insert(uploads).values({
    id,
    kind: "document",
    status: "uploaded",
    url: `http://almacen/${companyId}/${id}/original.pdf`,
    fileName: `${name}.pdf`,
    extension: "pdf",
    contentType: "application/pdf",
    byteSize: 4096,
    storagePath: `${companyId}/${id}`,
  })
  return id
}

async function setItems(s: Scene, shoppingId: string, itemIds: string[]): Promise<Shopping> {
  const response = await request(
    "PUT",
    `${s.base}/shoppings/${shoppingId}/items`,
    { itemIds },
    s.session.cookie,
  )
  expect(response.status).toBe(200)
  return json(response)
}

async function readBudget(s: Scene, query = ""): Promise<Budget> {
  const response = await request("GET", `${s.base}/budget${query}`, undefined, s.session.cookie)
  expect(response.status).toBe(200)
  return json(response)
}

async function shoppingOf(s: Scene, shoppingId: string): Promise<Shopping> {
  const response = await request(
    "GET",
    `${s.base}/shoppings/${shoppingId}`,
    undefined,
    s.session.cookie,
  )
  expect(response.status).toBe(200)
  return json(response)
}

async function itemOf(s: Scene, itemId: string): Promise<Item> {
  const response = await request("GET", `${s.base}/items/${itemId}`, undefined, s.session.cookie)
  expect(response.status).toBe(200)
  return json(response)
}

// ─── Las anclas ──────────────────────────────────────────────────────────────

describe("las anclas", () => {
  it("se registran con su importe y quedan en la producción", async () => {
    const s = await scene()
    const anchor = await newAnchor(s, { name: "Vestuario de época", amount: "100000.00" })

    expect(anchor.name).toBe("Vestuario de época")
    expect(anchor.amount).toBe("100000.00")

    const listed = await json<{ items: Anchor[]; totalItems: number }>(
      await request("GET", `${s.base}/anchors`, undefined, s.session.cookie),
    )
    expect(listed.totalItems).toBe(1)
  })

  it("llevan categoría y responsable, y los devuelven con su nombre", async () => {
    const s = await scene()
    const category = await newCategory(s, "Vestuario")

    const anchor = await newAnchor(s, {
      amount: "10.00",
      categoryId: category.id,
      responsibleId: s.session.userId,
    })

    expect(anchor.categoryId).toBe(category.id)
    expect(anchor.categoryName).toBe("Vestuario")
  })

  it("no admiten una categoría de otra producción", async () => {
    const s = await scene()
    const otra = await scene()
    const ajena = await newCategory(otra, "De otra")

    const response = await request(
      "POST",
      `${s.base}/anchors`,
      { name: "Con categoría ajena", amount: "1.00", categoryId: ajena.id },
      s.session.cookie,
    )

    expect(response.status).toBe(404)
  })

  it("se editan y se dan de baja", async () => {
    const s = await scene()
    const anchor = await newAnchor(s, { amount: "10.00" })

    const patched = await json<Anchor>(
      await request(
        "PATCH",
        `${s.base}/anchors/${anchor.id}`,
        { amount: "25.50" },
        s.session.cookie,
      ),
    )
    expect(patched.amount).toBe("25.50")

    const deleted = await request(
      "DELETE",
      `${s.base}/anchors/${anchor.id}`,
      undefined,
      s.session.cookie,
    )
    expect(deleted.status).toBe(204)

    const gone = await request("GET", `${s.base}/anchors/${anchor.id}`, undefined, s.session.cookie)
    expect(gone.status).toBe(404)
  })

  it("rechazan un importe con más de dos decimales", async () => {
    const s = await scene()
    const response = await request(
      "POST",
      `${s.base}/anchors`,
      { name: "Milésimas", amount: "10.005" },
      s.session.cookie,
    )

    expect(response.status).toBe(400)
  })

  it("cuelgan comprobantes, y darlas de baja se los lleva", async () => {
    const s = await scene()
    const anchor = await newAnchor(s, { amount: "10.00" })
    const uploadId = await seedUpload(s.companyId, "comprobante")

    const attached = await request(
      "POST",
      `${s.base}/anchors/${anchor.id}/attachments`,
      { uploadId },
      s.session.cookie,
    )
    expect(attached.status).toBe(201)

    const withFile = await json<Anchor>(
      await request("GET", `${s.base}/anchors/${anchor.id}`, undefined, s.session.cookie),
    )
    expect(withFile.attachments).toHaveLength(1)

    await request("DELETE", `${s.base}/anchors/${anchor.id}`, undefined, s.session.cookie)

    const left = await db
      .select({ id: productionAttachments.id })
      .from(productionAttachments)
      .where(eq(productionAttachments.anchorId, anchor.id))
    expect(left).toEqual([])
  })
})

// ─── Las compras ─────────────────────────────────────────────────────────────

describe("las compras", () => {
  it("se registran con su importe y su método de pago", async () => {
    const s = await scene()
    const shopping = await newShopping(s, {
      name: "Telas",
      amount: "1200.00",
      method: "transfer",
      kind: "expense",
    })

    expect(shopping.amount).toBe("1200.00")
    expect(shopping.method).toBe("transfer")
    expect(shopping.kind).toBe("expense")
  })

  it("conservan la identificación parcial de la tarjeta", async () => {
    const s = await scene()
    const shopping = await newShopping(s, { method: "card", cardLast4: "4242" })

    expect(shopping.cardLast4).toBe("4242")
  })

  it("**no** admiten el número completo de la tarjeta", async () => {
    const s = await scene()
    const response = await request(
      "POST",
      `${s.base}/shoppings`,
      {
        name: "Con la tarjeta entera",
        amount: "1.00",
        method: "card",
        cardLast4: "4242424242424242",
      },
      s.session.cookie,
    )

    expect(response.status).toBe(400)

    const listed = await json<{ totalItems: number }>(
      await request("GET", `${s.base}/shoppings`, undefined, s.session.cookie),
    )
    expect(listed.totalItems).toBe(0)
  })

  it("olvidan la tarjeta al cambiar a otro método de pago", async () => {
    const s = await scene()
    const shopping = await newShopping(s, { method: "card", cardLast4: "4242" })

    const patched = await json<Shopping>(
      await request(
        "PATCH",
        `${s.base}/shoppings/${shopping.id}`,
        { method: "cash" },
        s.session.cookie,
      ),
    )

    expect(patched.method).toBe("cash")
    expect(patched.cardLast4).toBeNull()
  })

  it("llevan proveedor, y sólo uno de esta empresa", async () => {
    const s = await scene()
    const providerId = await newProvider(s, "Telas del Centro")

    const shopping = await newShopping(s, { providerId })
    expect(shopping.providerName).toBe("Telas del Centro")

    const otra = await scene()
    const ajeno = await newProvider(otra, "De otra empresa")
    const response = await request(
      "POST",
      `${s.base}/shoppings`,
      { name: "Con proveedor ajeno", amount: "1.00", providerId: ajeno },
      s.session.cookie,
    )
    expect(response.status).toBe(404)
  })

  it("nacen sin pedido de almacén: esa columna la escribe la 23", async () => {
    const s = await scene()
    const shopping = await newShopping(s)

    expect(shopping.warehouseOrderId).toBeNull()
  })
})

// ─── Los artículos que incorporó una compra ──────────────────────────────────

describe("los artículos de una compra", () => {
  it("se establecen de una vez", async () => {
    const s = await scene()
    const shopping = await newShopping(s)
    const uno = await newItem(s, "Silla 1")
    const dos = await newItem(s, "Silla 2")

    const composed = await setItems(s, shopping.id, [uno.id, dos.id])

    expect(composed.items.map((item) => item.id).sort()).toEqual([uno.id, dos.id].sort())
  })

  it("un artículo cambia de compra y sale de la anterior", async () => {
    const s = await scene()
    const a = await newShopping(s, { name: "Compra A" })
    const b = await newShopping(s, { name: "Compra B" })
    const item = await newItem(s, "Lámpara")

    await setItems(s, a.id, [item.id])
    expect((await shoppingOf(s, a.id)).items.map((row) => row.id)).toEqual([item.id])

    await setItems(s, b.id, [item.id])

    expect((await shoppingOf(s, a.id)).items).toEqual([])
    expect((await shoppingOf(s, b.id)).items.map((row) => row.id)).toEqual([item.id])
    expect((await itemOf(s, item.id)).shoppingId).toBe(b.id)
  })

  it("componer con un artículo ajeno no suelta los que ya estaban", async () => {
    const s = await scene()
    const otra = await scene()
    const shopping = await newShopping(s)
    const uno = await newItem(s, "Uno")
    const dos = await newItem(s, "Dos")
    const ajeno = await newItem(otra, "De otra producción")

    await setItems(s, shopping.id, [uno.id, dos.id])

    const rejected = await request(
      "PUT",
      `${s.base}/shoppings/${shopping.id}/items`,
      { itemIds: [uno.id, ajeno.id] },
      s.session.cookie,
    )
    expect(rejected.status).toBe(422)

    // La composición que falla no deja la lista a medias: `dos` sigue dentro.
    expect((await shoppingOf(s, shopping.id)).items.map((row) => row.id).sort()).toEqual(
      [uno.id, dos.id].sort(),
    )
  })

  it("retirar uno del conjunto lo deja sin compra y sin borrarlo", async () => {
    const s = await scene()
    const shopping = await newShopping(s)
    const uno = await newItem(s, "Uno")
    const dos = await newItem(s, "Dos")
    const tres = await newItem(s, "Tres")

    await setItems(s, shopping.id, [uno.id, dos.id, tres.id])
    const reduced = await setItems(s, shopping.id, [uno.id, dos.id])

    expect(reduced.items.map((row) => row.id).sort()).toEqual([uno.id, dos.id].sort())
    // Sigue existiendo en el inventario, y **sin compra asignada**.
    const suelto = await itemOf(s, tres.id)
    expect(suelto.id).toBe(tres.id)
    expect(suelto.shoppingId).toBeNull()
  })

  it("no se lleva un artículo de otra producción", async () => {
    const s = await scene()
    const otra = await scene()
    const shopping = await newShopping(s)
    const ajeno = await newItem(otra, "De otra producción")

    const response = await request(
      "PUT",
      `${s.base}/shoppings/${shopping.id}/items`,
      { itemIds: [ajeno.id] },
      s.session.cookie,
    )

    expect(response.status).toBe(422)
  })
})

// ─── Eliminar una compra ─────────────────────────────────────────────────────

describe("eliminar una compra", () => {
  it("libera sus artículos sin eliminarlos", async () => {
    const s = await scene()
    const shopping = await newShopping(s)
    const items = await Promise.all(
      ["Uno", "Dos", "Tres", "Cuatro", "Cinco"].map((name) => newItem(s, name)),
    )

    await setItems(
      s,
      shopping.id,
      items.map((item) => item.id),
    )

    const deleted = await request(
      "DELETE",
      `${s.base}/shoppings/${shopping.id}`,
      undefined,
      s.session.cookie,
    )
    expect(deleted.status).toBe(204)

    // Los cinco siguen en el inventario, sin compra asignada.
    for (const item of items) {
      const survivor = await itemOf(s, item.id)
      expect(survivor.id).toBe(item.id)
      expect(survivor.shoppingId).toBeNull()
    }

    // Y sin compra asignada: se pueden llevar a otra sin quitarlos de nada.
    const otra = await newShopping(s, { name: "La que viene después" })
    const composed = await setItems(
      s,
      otra.id,
      items.map((item) => item.id),
    )
    expect(composed.items).toHaveLength(5)
  })

  it("borra sus facturas", async () => {
    const s = await scene()
    const shopping = await newShopping(s)
    const uploadId = await seedUpload(s.companyId, "factura")

    const attached = await request(
      "POST",
      `${s.base}/shoppings/${shopping.id}/attachments`,
      { uploadId },
      s.session.cookie,
    )
    expect(attached.status).toBe(201)

    await request("DELETE", `${s.base}/shoppings/${shopping.id}`, undefined, s.session.cookie)

    const left = await db
      .select({ id: productionAttachments.id })
      .from(productionAttachments)
      .where(eq(productionAttachments.shoppingId, shopping.id))
    expect(left).toEqual([])
  })

  it("deja de contar en el gasto", async () => {
    const s = await scene()
    await newAnchor(s, { amount: "100.00" })
    const shopping = await newShopping(s, { amount: "40.00" })

    expect((await readBudget(s)).filtered.totalGastado).toBe("40.00")

    await request("DELETE", `${s.base}/shoppings/${shopping.id}`, undefined, s.session.cookie)

    expect((await readBudget(s)).filtered.totalGastado).toBe("0.00")
  })
})

// ─── La lectura del presupuesto ──────────────────────────────────────────────

describe("la lectura del presupuesto", () => {
  it("devuelve la diferencia entre lo presupuestado y lo gastado", async () => {
    const s = await scene()
    await newAnchor(s, { amount: "100000.00" })
    await newShopping(s, { amount: "82500.00" })

    const budget = await readBudget(s)

    expect(budget.filtered.totalPresupuestado).toBe("100000.00")
    expect(budget.filtered.totalGastado).toBe("82500.00")
    expect(budget.filtered.diferencia).toBe("17500.00")
    expect(budget.filtered.isUnfavorable).toBe(false)
  })

  it("un sobrecoste da diferencia negativa y se señala como desfavorable", async () => {
    const s = await scene()
    await newAnchor(s, { amount: "50000.00" })
    await newShopping(s, { amount: "61000.00" })

    const budget = await readBudget(s)

    expect(budget.filtered.diferencia).toBe("-11000.00")
    expect(budget.filtered.isUnfavorable).toBe(true)
  })

  it("una producción sin movimientos da los tres importes en cero", async () => {
    const s = await scene()
    const budget = await readBudget(s)

    expect(budget.filtered).toMatchObject({
      totalPresupuestado: "0.00",
      totalGastado: "0.00",
      diferencia: "0.00",
      isUnfavorable: false,
    })
    expect(budget.anchors).toEqual([])
    expect(budget.shoppings).toEqual([])
  })

  it("refleja un gasto nuevo de inmediato, sin nada que recalcular", async () => {
    const s = await scene()
    await newAnchor(s, { amount: "1000.00" })

    expect((await readBudget(s)).filtered.diferencia).toBe("1000.00")

    await newShopping(s, { amount: "250.00" })

    expect((await readBudget(s)).filtered.diferencia).toBe("750.00")
  })

  it("editar el importe de una compra mueve la diferencia", async () => {
    const s = await scene()
    await newAnchor(s, { amount: "1000.00" })
    const shopping = await newShopping(s, { amount: "250.00" })

    await request(
      "PATCH",
      `${s.base}/shoppings/${shopping.id}`,
      { amount: "400.00" },
      s.session.cookie,
    )

    expect((await readBudget(s)).filtered.diferencia).toBe("600.00")
  })

  it("con filtros devuelve los totales del filtro **y** los de la producción entera", async () => {
    const s = await scene()
    const arte = await newCategory(s, "Arte")
    const vestuario = await newCategory(s, "Vestuario")

    await newAnchor(s, { amount: "1000.00", categoryId: arte.id })
    await newAnchor(s, { amount: "500.00", categoryId: vestuario.id })
    await newShopping(s, { amount: "300.00", categoryId: arte.id })

    const budget = await readBudget(
      s,
      `?anchor_categoryId=${arte.id}&shopping_categoryId=${arte.id}`,
    )

    expect(budget.filtered.totalPresupuestado).toBe("1000.00")
    expect(budget.filtered.totalGastado).toBe("300.00")
    expect(budget.overall.totalPresupuestado).toBe("1500.00")
    expect(budget.overall.totalGastado).toBe("300.00")
  })

  it("desglosa por categoría, con lo no clasificado al final", async () => {
    const s = await scene()
    const arte = await newCategory(s, "Arte")

    await newAnchor(s, { amount: "1000.00", categoryId: arte.id })
    await newAnchor(s, { amount: "200.00" })
    await newShopping(s, { amount: "1200.00", categoryId: arte.id })

    const budget = await readBudget(s)

    expect(budget.categories.map((row) => row.categoryName)).toEqual(["Arte", null])
    expect(budget.categories[0]).toMatchObject({
      budgeted: "1000.00",
      spent: "1200.00",
      isUnfavorable: true,
    })
  })

  it("no guarda ningún total: dos lecturas seguidas coinciden sin nada en medio", async () => {
    const s = await scene()
    await newAnchor(s, { amount: "7.77" })

    const primera = await readBudget(s)
    const segunda = await readBudget(s)

    expect(primera.filtered).toEqual(segunda.filtered)
    expect(primera.overall).toEqual(segunda.overall)
  })
})

// ─── Búsqueda y filtrado ─────────────────────────────────────────────────────

describe("la búsqueda y el filtrado", () => {
  it("filtra las compras deducibles", async () => {
    const s = await scene()
    await newShopping(s, { name: "Con factura", isDeductible: true })
    await newShopping(s, { name: "Sin factura", isDeductible: false })

    const listed = await json<{ items: Shopping[] }>(
      await request("GET", `${s.base}/shoppings?isDeductible=true`, undefined, s.session.cookie),
    )

    expect(listed.items.map((row) => row.name)).toEqual(["Con factura"])
  })

  it("filtra las compras por método de pago y por tipo", async () => {
    const s = await scene()
    await newShopping(s, { name: "En efectivo", method: "cash" })
    await newShopping(s, { name: "Con tarjeta", method: "card", kind: "rent" })

    const porMetodo = await json<{ items: Shopping[] }>(
      await request("GET", `${s.base}/shoppings?method=card`, undefined, s.session.cookie),
    )
    expect(porMetodo.items.map((row) => row.name)).toEqual(["Con tarjeta"])

    const porTipo = await json<{ items: Shopping[] }>(
      await request("GET", `${s.base}/shoppings?kind=rent`, undefined, s.session.cookie),
    )
    expect(porTipo.items.map((row) => row.name)).toEqual(["Con tarjeta"])
  })

  it("busca las compras por nombre", async () => {
    const s = await scene()
    await newShopping(s, { name: "Telas de algodón" })
    await newShopping(s, { name: "Gasolina" })

    const found = await json<{ items: Shopping[] }>(
      await request("GET", `${s.base}/shoppings?search=telas`, undefined, s.session.cookie),
    )
    expect(found.items.map((row) => row.name)).toEqual(["Telas de algodón"])
  })

  it("busca las anclas por el nombre de su categoría", async () => {
    const s = await scene()
    const vestuario = await newCategory(s, "Vestuario")
    await newAnchor(s, { name: "Partida uno", amount: "1.00", categoryId: vestuario.id })
    await newAnchor(s, { name: "Partida dos", amount: "1.00" })

    const found = await json<{ items: Anchor[] }>(
      await request("GET", `${s.base}/anchors?search=vestuario`, undefined, s.session.cookie),
    )

    expect(found.items.map((row) => row.name)).toEqual(["Partida uno"])
  })

  it("rechaza un filtro que el recurso no declara", async () => {
    const s = await scene()
    const response = await request(
      "GET",
      `${s.base}/anchors?method=card`,
      undefined,
      s.session.cookie,
    )

    expect(response.status).toBe(400)
  })
})

// ─── El documento ────────────────────────────────────────────────────────────

describe("el documento del presupuesto", () => {
  it("lleva las anclas, las compras, los dos totales y la diferencia", async () => {
    const s = await scene()
    const arte = await newCategory(s, "Arte")
    await newAnchor(s, { name: "Escenografía", amount: "5000.00", categoryId: arte.id })
    await newShopping(s, { name: "Madera", amount: "1500.00", categoryId: arte.id })

    const result = await json<{
      document: {
        kind: string
        anchors: { name: string }[]
        shoppings: { name: string }[]
        amounts: Amounts
        categories: unknown[]
      }
      reference: string
    }>(await request("GET", `${s.base}/budget/document`, undefined, s.session.cookie))

    expect(result.document.kind).toBe("budget")
    expect(result.document.anchors.map((row) => row.name)).toEqual(["Escenografía"])
    expect(result.document.shoppings.map((row) => row.name)).toEqual(["Madera"])
    expect(result.document.amounts.diferencia).toBe("3500.00")
    expect(result.document.categories).toHaveLength(1)
    expect(result.reference).not.toBe("")
  })

  it("su enlace público sirve la misma hoja sin sesión", async () => {
    const s = await scene()
    await newAnchor(s, { amount: "900.00" })

    const { reference } = await json<{ reference: string }>(
      await request("GET", `${s.base}/budget/document`, undefined, s.session.cookie),
    )

    const publico = await request("GET", `/public/documents/${reference}`)
    expect(publico.status).toBe(200)

    const { document } = await json<{ document: { kind: string; amounts: Amounts } }>(publico)
    expect(document.kind).toBe("budget")
    expect(document.amounts.totalPresupuestado).toBe("900.00")
  })

  it("el enlace es estable: pedirlo dos veces da el mismo", async () => {
    const s = await scene()

    const primera = await json<{ reference: string }>(
      await request("GET", `${s.base}/budget/document`, undefined, s.session.cookie),
    )
    const segunda = await json<{ reference: string }>(
      await request("GET", `${s.base}/budget/document`, undefined, s.session.cookie),
    )

    expect(primera.reference).toBe(segunda.reference)
  })

  it("una referencia alterada responde 404, sin decir por qué", async () => {
    const s = await scene()
    const { reference } = await json<{ reference: string }>(
      await request("GET", `${s.base}/budget/document`, undefined, s.session.cookie),
    )

    const alterada = `${reference.slice(0, -1)}${reference.endsWith("A") ? "B" : "A"}`
    const response = await request("GET", `/public/documents/${alterada}`)

    expect(response.status).toBe(404)
  })

  it("una producción dada de baja deja de abrirse por su enlace", async () => {
    const s = await scene()
    const { reference } = await json<{ reference: string }>(
      await request("GET", `${s.base}/budget/document`, undefined, s.session.cookie),
    )

    await db
      .update(productions)
      .set({ deletedAt: new Date() })
      .where(eq(productions.id, s.productionId))

    const response = await request("GET", `/public/documents/${reference}`)
    expect(response.status).toBe(404)
  })

  it("la hoja **no** hace caso de los filtros: imprime la producción entera", async () => {
    const s = await scene()
    const arte = await newCategory(s, "Arte")
    await newAnchor(s, { amount: "100.00", categoryId: arte.id })
    await newAnchor(s, { amount: "300.00" })

    const result = await json<{ document: { amounts: Amounts } }>(
      await request(
        "GET",
        `${s.base}/budget/document?anchor_categoryId=${arte.id}`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(result.document.amounts.totalPresupuestado).toBe("400.00")
  })
})

// ─── El aislamiento ──────────────────────────────────────────────────────────

describe("el aislamiento entre empresas", () => {
  it("no deja leer el presupuesto de otra empresa", async () => {
    const s = await scene()
    const otra = await scene()
    await newAnchor(otra, { amount: "999.00" })

    const response = await request(
      "GET",
      `/companies/${otra.companyId}/productions/${otra.productionId}/budget`,
      undefined,
      s.session.cookie,
    )

    expect([403, 404]).toContain(response.status)
  })

  it("no deja registrar una compra en la producción de otra empresa", async () => {
    const s = await scene()
    const otra = await scene()

    const response = await request(
      "POST",
      `/companies/${otra.companyId}/productions/${otra.productionId}/shoppings`,
      { name: "Intrusa", amount: "1.00" },
      s.session.cookie,
    )

    expect([403, 404]).toContain(response.status)
  })
})
