/**
 * Notas de entrega de una producción, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/production-inventory/spec.md`, requisitos «Notas
 * de entrega de una producción» a «Eliminar una nota». Rebanada 22, bloque de entregas.
 *
 * El bloque entero se recorre por HTTP, como el del inventario: serialización, cookie, enrutado,
 * guardián y manejador. Lo que se prueba aquí no es que las funciones devuelvan lo que devuelven,
 * es que **el objeto físico acaba donde debe** — y eso sólo se ve leyendo el artículo después.
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
  loginAttempts,
  notificationDeliveries,
  productionItemEvents,
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
import type { ItemStatus } from "./items.ts"

// ─── Andamiaje ───────────────────────────────────────────────────────────────

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

let server: ReturnType<typeof serve>
let origin = ""

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${productions}, ${uploads}, ${services}, ${companies} cascade`,
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
  const session = await signUp(`entregas-${newId()}@tfv.dev`)
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

interface Item {
  id: string
  name: string
  code: string
  status: ItemStatus
}

interface Line {
  id: string
  itemId: string
  itemName: string
  itemCode: string
  isVerified: boolean
  verifiedById: string | null
  verifiedAt: string | null
  returnCondition: string | null
}

interface Delivery {
  id: string
  name: string
  status: "pending" | "in_progress" | "completed" | "canceled"
  direction: "outbound" | "inbound"
  responsibleId: string | null
  signedById: string | null
  receiverName: string | null
  signedAt: string | null
  isSigned: boolean
  lines: Line[]
  counts: { total: number; verified: number; pending: number }
}

async function newItem(s: Scene, name: string): Promise<Item> {
  const response = await request("POST", `${s.base}/items`, { name }, s.session.cookie)
  expect(response.status).toBe(201)
  return json(response)
}

async function items(s: Scene, howMany: number): Promise<Item[]> {
  const made: Item[] = []
  for (let index = 0; index < howMany; index += 1) made.push(await newItem(s, `Silla ${index}`))
  return made
}

async function newDelivery(s: Scene, body: Record<string, unknown> = {}): Promise<Delivery> {
  const response = await request(
    "POST",
    `${s.base}/deliveries`,
    { name: `Nota ${newId()}`, ...body },
    s.session.cookie,
  )
  expect(response.status).toBe(201)
  return json(response)
}

async function setItems(s: Scene, deliveryId: string, itemIds: string[]): Promise<Delivery> {
  const response = await request(
    "PUT",
    `${s.base}/deliveries/${deliveryId}/items`,
    { itemIds },
    s.session.cookie,
  )
  expect(response.status).toBe(200)
  return json(response)
}

function verify(
  s: Scene,
  deliveryId: string,
  lineId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return request(
    "PUT",
    `${s.base}/deliveries/${deliveryId}/lines/${lineId}/verification`,
    body,
    s.session.cookie,
  )
}

async function verifyAll(s: Scene, delivery: Delivery, condition?: string): Promise<void> {
  for (const line of delivery.lines) {
    const response = await verify(s, delivery.id, line.id, {
      isVerified: true,
      ...(condition ? { returnCondition: condition } : {}),
    })
    expect(response.status).toBe(200)
  }
}

async function itemOf(s: Scene, itemId: string): Promise<Item> {
  return json(await request("GET", `${s.base}/items/${itemId}`, undefined, s.session.cookie))
}

// ─── La nota y sus cuatro estados ────────────────────────────────────────────

describe("la nota y sus estados", () => {
  it("nace pendiente, de salida y sin líneas", async () => {
    const s = await scene()
    const delivery = await newDelivery(s, { name: "Entrega de arte" })

    expect(delivery.status).toBe("pending")
    expect(delivery.direction).toBe("outbound")
    expect(delivery.lines).toEqual([])
    expect(delivery.counts).toEqual({ total: 0, verified: 0, pending: 0 })
  })

  it("nace de devolución cuando así se pide", async () => {
    const s = await scene()
    const delivery = await newDelivery(s, { direction: "inbound" })

    expect(delivery.direction).toBe("inbound")
  })

  it("se cancela, y una cancelada ya no admite composición", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await newDelivery(s)

    const canceled = await json<Delivery>(
      await request(
        "POST",
        `${s.base}/deliveries/${delivery.id}/cancellation`,
        {},
        s.session.cookie,
      ),
    )
    expect(canceled.status).toBe("canceled")

    const rejected = await request(
      "PUT",
      `${s.base}/deliveries/${delivery.id}/items`,
      { itemIds: [silla?.id] },
      s.session.cookie,
    )
    expect(rejected.status).toBe(422)
  })
})

// ─── Componer la lista ───────────────────────────────────────────────────────

describe("componer la lista de artículos", () => {
  it("pone la nota en curso y deja cada línea pendiente de verificar", async () => {
    const s = await scene()
    const three = await items(s, 3)
    const delivery = await newDelivery(s)

    const composed = await setItems(
      s,
      delivery.id,
      three.map((item) => item.id),
    )

    expect(composed.status).toBe("in_progress")
    expect(composed.lines).toHaveLength(3)
    expect(composed.lines.every((line) => !line.isVerified)).toBe(true)
    expect(composed.counts).toEqual({ total: 3, verified: 0, pending: 3 })
  })

  it("recomponer crea las que faltan, elimina las que sobran y conserva las que siguen", async () => {
    const s = await scene()
    const [uno, dos, tres] = await items(s, 3)
    const delivery = await newDelivery(s)

    const first = await setItems(s, delivery.id, [uno?.id as string, dos?.id as string])
    const kept = first.lines.find((line) => line.itemId === uno?.id)
    expect(kept).toBeDefined()

    const second = await setItems(s, delivery.id, [uno?.id as string, tres?.id as string])

    expect(second.lines.map((line) => line.itemId).sort()).toEqual(
      [uno?.id, tres?.id].sort() as string[],
    )
    // La línea que sigue **es la misma fila**: recomponer no es rehacer, y rehacerla borraría su
    // verificación sin que nadie la deshiciera.
    expect(second.lines.find((line) => line.itemId === uno?.id)?.id).toBe(kept?.id)
  })

  it("no admite un artículo de otra producción", async () => {
    const s = await scene()
    const otra = await scene()
    const [ajeno] = await items(otra, 1)
    const delivery = await newDelivery(s)

    const response = await request(
      "PUT",
      `${s.base}/deliveries/${delivery.id}/items`,
      { itemIds: [ajeno?.id] },
      s.session.cookie,
    )

    expect(response.status).toBe(404)
  })
})

// ─── Verificación pieza por pieza ────────────────────────────────────────────

describe("verificación pieza por pieza", () => {
  it("registra su verificador y el instante", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await setItems(s, (await newDelivery(s)).id, [silla?.id as string])
    const line = delivery.lines[0] as Line

    const updated = await json<Delivery>(
      await verify(s, delivery.id, line.id, { isVerified: true }),
    )
    const verified = updated.lines[0] as Line

    expect(verified.isVerified).toBe(true)
    expect(verified.verifiedById).toBe(s.session.userId)
    expect(verified.verifiedAt).not.toBeNull()
    expect(updated.counts).toEqual({ total: 1, verified: 1, pending: 0 })
  })

  it("deshacerla borra el verificador y el instante", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await setItems(s, (await newDelivery(s)).id, [silla?.id as string])
    const line = delivery.lines[0] as Line

    await verify(s, delivery.id, line.id, { isVerified: true })
    const undone = await json<Delivery>(
      await verify(s, delivery.id, line.id, { isVerified: false }),
    )

    expect(undone.lines[0]?.isVerified).toBe(false)
    expect(undone.lines[0]?.verifiedById).toBeNull()
    expect(undone.lines[0]?.verifiedAt).toBeNull()
  })

  it("localiza la línea por el código de la etiqueta del artículo", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await setItems(s, (await newDelivery(s)).id, [silla?.id as string])

    const found = await json<Line>(
      await request(
        "GET",
        `${s.base}/deliveries/${delivery.id}/lines/by-code/${silla?.code}`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(found.id).toBe(delivery.lines[0]?.id)
    expect(found.itemCode).toBe(silla?.code)
  })

  it("una nota de salida no admite condición de vuelta en la línea", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await setItems(s, (await newDelivery(s)).id, [silla?.id as string])

    const response = await verify(s, delivery.id, delivery.lines[0]?.id as string, {
      isVerified: true,
      returnCondition: "damaged",
    })

    expect(response.status).toBe(422)
  })
})

// ─── Cerrar la nota ──────────────────────────────────────────────────────────

describe("cerrar la nota", () => {
  it("no se cierra con líneas pendientes, y dice cuántas faltan", async () => {
    const s = await scene()
    const ten = await items(s, 10)
    const delivery = await setItems(
      s,
      (await newDelivery(s)).id,
      ten.map((item) => item.id),
    )

    // Siete de diez: quedan tres.
    for (const line of delivery.lines.slice(0, 7)) {
      await verify(s, delivery.id, line.id, { isVerified: true })
    }

    const response = await request(
      "POST",
      `${s.base}/deliveries/${delivery.id}/completion`,
      {},
      s.session.cookie,
    )

    expect(response.status).toBe(422)
    const body = await json<{ message: string }>(response)
    expect(body.message).toContain("3")

    // Y la nota no se movió.
    const after = await json<Delivery>(
      await request("GET", `${s.base}/deliveries/${delivery.id}`, undefined, s.session.cookie),
    )
    expect(after.status).toBe("in_progress")
  })

  it("el cierre marca los ocho artículos como entregados", async () => {
    const s = await scene()
    const eight = await items(s, 8)
    const delivery = await setItems(
      s,
      (await newDelivery(s)).id,
      eight.map((item) => item.id),
    )
    await verifyAll(s, delivery)

    const closed = await json<Delivery>(
      await request("POST", `${s.base}/deliveries/${delivery.id}/completion`, {}, s.session.cookie),
    )
    expect(closed.status).toBe("completed")

    for (const item of eight) {
      expect((await itemOf(s, item.id)).status).toBe("delivered")
    }
  })

  it("un cierre que falla no deja ni la nota cerrada ni ningún artículo movido", async () => {
    const s = await scene()
    const three = await items(s, 3)
    const delivery = await setItems(
      s,
      (await newDelivery(s)).id,
      three.map((item) => item.id),
    )
    await verifyAll(s, delivery)

    // Se rompe el cierre por debajo: uno de los tres artículos ya está devuelto, que es el único
    // estado terminal, así que la tabla de transiciones rechaza su paso a entregado. Es un fallo a
    // mitad del recorrido —el primero y el segundo ya se habrían escrito—, que es exactamente lo
    // que la atomicidad tiene que revertir.
    const rebelde = three[2] as Item
    await request(
      "PUT",
      `${s.base}/items/${rebelde.id}/status`,
      { status: "returned" },
      s.session.cookie,
    )

    const response = await request(
      "POST",
      `${s.base}/deliveries/${delivery.id}/completion`,
      {},
      s.session.cookie,
    )
    expect(response.status).toBe(422)

    const after = await json<Delivery>(
      await request("GET", `${s.base}/deliveries/${delivery.id}`, undefined, s.session.cookie),
    )
    expect(after.status).toBe("in_progress")

    // Ninguno de los dos primeros se movió, aunque su actualización sí llegó a ejecutarse.
    expect((await itemOf(s, (three[0] as Item).id)).status).toBe("available")
    expect((await itemOf(s, (three[1] as Item).id)).status).toBe("available")
    expect((await itemOf(s, rebelde.id)).status).toBe("returned")
  })

  it("una nota de devolución deja cada artículo en el estado que su línea declara", async () => {
    const s = await scene()
    const [entera, rota] = await items(s, 2)
    const salida = await setItems(s, (await newDelivery(s)).id, [
      entera?.id as string,
      rota?.id as string,
    ])
    await verifyAll(s, salida)
    await request("POST", `${s.base}/deliveries/${salida.id}/completion`, {}, s.session.cookie)

    const vuelta = await setItems(s, (await newDelivery(s, { direction: "inbound" })).id, [
      entera?.id as string,
      rota?.id as string,
    ])

    for (const line of vuelta.lines) {
      const response = await verify(s, vuelta.id, line.id, {
        isVerified: true,
        returnCondition: line.itemId === rota?.id ? "damaged" : "returned",
      })
      expect(response.status).toBe(200)
    }

    const closed = await json<Delivery>(
      await request("POST", `${s.base}/deliveries/${vuelta.id}/completion`, {}, s.session.cookie),
    )
    expect(closed.status).toBe("completed")

    expect((await itemOf(s, entera?.id as string)).status).toBe("returned")
    expect((await itemOf(s, rota?.id as string)).status).toBe("damaged")
  })

  it("una devolución no se verifica sin decir en qué estado vuelve la pieza", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const vuelta = await setItems(s, (await newDelivery(s, { direction: "inbound" })).id, [
      silla?.id as string,
    ])

    const rejected = await verify(s, vuelta.id, vuelta.lines[0]?.id as string, { isVerified: true })
    expect(rejected.status).toBe(422)
  })
})

// ─── Firmas ──────────────────────────────────────────────────────────────────

describe("firmas", () => {
  it("no bloquean el cierre: se cierra con las líneas verificadas y sin firma", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await setItems(s, (await newDelivery(s)).id, [silla?.id as string])
    await verifyAll(s, delivery)

    const closed = await json<Delivery>(
      await request("POST", `${s.base}/deliveries/${delivery.id}/completion`, {}, s.session.cookie),
    )

    expect(closed.status).toBe("completed")
    expect(closed.isSigned).toBe(false)
    expect(closed.signedAt).toBeNull()
  })

  it("se firman después del cierre, y la nota dice quién", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await setItems(s, (await newDelivery(s)).id, [silla?.id as string])
    await verifyAll(s, delivery)
    await request("POST", `${s.base}/deliveries/${delivery.id}/completion`, {}, s.session.cookie)

    const signed = await json<Delivery>(
      await request(
        "PUT",
        `${s.base}/deliveries/${delivery.id}/signatures`,
        { receiverName: "Marta de vestuario" },
        s.session.cookie,
      ),
    )

    expect(signed.isSigned).toBe(true)
    expect(signed.signedById).toBe(s.session.userId)
    expect(signed.receiverName).toBe("Marta de vestuario")
    expect(signed.signedAt).not.toBeNull()
  })

  it("una vez escritas son inmutables", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await setItems(s, (await newDelivery(s)).id, [silla?.id as string])
    await verifyAll(s, delivery)
    await request("POST", `${s.base}/deliveries/${delivery.id}/completion`, {}, s.session.cookie)

    await request(
      "PUT",
      `${s.base}/deliveries/${delivery.id}/signatures`,
      { receiverName: "Marta de vestuario" },
      s.session.cookie,
    )

    const again = await request(
      "PUT",
      `${s.base}/deliveries/${delivery.id}/signatures`,
      { receiverName: "Otro nombre" },
      s.session.cookie,
    )

    expect(again.status).toBe(409)

    const after = await json<Delivery>(
      await request("GET", `${s.base}/deliveries/${delivery.id}`, undefined, s.session.cookie),
    )
    expect(after.receiverName).toBe("Marta de vestuario")
  })
})

// ─── Eliminar la nota ────────────────────────────────────────────────────────

describe("eliminar la nota", () => {
  it("devuelve a disponible los cinco artículos que había entregado", async () => {
    const s = await scene()
    const five = await items(s, 5)
    const delivery = await setItems(
      s,
      (await newDelivery(s)).id,
      five.map((item) => item.id),
    )
    await verifyAll(s, delivery)
    await request("POST", `${s.base}/deliveries/${delivery.id}/completion`, {}, s.session.cookie)

    for (const item of five) expect((await itemOf(s, item.id)).status).toBe("delivered")

    const removed = await request(
      "DELETE",
      `${s.base}/deliveries/${delivery.id}`,
      undefined,
      s.session.cookie,
    )
    expect(removed.status).toBe(204)

    for (const item of five) expect((await itemOf(s, item.id)).status).toBe("available")
  })

  it("no devuelve el artículo que ya se había movido después de la entrega", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await setItems(s, (await newDelivery(s)).id, [silla?.id as string])
    await verifyAll(s, delivery)
    await request("POST", `${s.base}/deliveries/${delivery.id}/completion`, {}, s.session.cookie)

    // Se rompió estando entregada. Eso es cierto, y eliminar la nota no lo deshace.
    await request(
      "PUT",
      `${s.base}/items/${silla?.id}/status`,
      { status: "damaged" },
      s.session.cookie,
    )

    await request("DELETE", `${s.base}/deliveries/${delivery.id}`, undefined, s.session.cookie)

    expect((await itemOf(s, silla?.id as string)).status).toBe("damaged")
  })

  it("los artículos siguen existiendo y la nota ya no se encuentra", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await setItems(s, (await newDelivery(s)).id, [silla?.id as string])

    await request("DELETE", `${s.base}/deliveries/${delivery.id}`, undefined, s.session.cookie)

    const gone = await request(
      "GET",
      `${s.base}/deliveries/${delivery.id}`,
      undefined,
      s.session.cookie,
    )
    expect(gone.status).toBe(404)
    expect((await itemOf(s, silla?.id as string)).status).toBe("available")
  })
})

// ─── El artículo retenido · H-172 ────────────────────────────────────────────

describe("un artículo en una nota sin cerrar no se elimina", () => {
  it("se rechaza con 409 y el mensaje enumera las notas que lo retienen", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const abierta = await newDelivery(s, { name: "Entrega del jueves" })
    await setItems(s, abierta.id, [silla?.id as string])

    const response = await request(
      "DELETE",
      `${s.base}/items/${silla?.id}`,
      undefined,
      s.session.cookie,
    )

    expect(response.status).toBe(409)
    const body = await json<{ message: string }>(response)
    expect(body.message).toContain("Entrega del jueves")

    // Y sigue ahí.
    expect((await itemOf(s, silla?.id as string)).status).toBe("available")
  })

  it("una nota cerrada no lo retiene", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await setItems(s, (await newDelivery(s)).id, [silla?.id as string])
    await verifyAll(s, delivery)
    await request("POST", `${s.base}/deliveries/${delivery.id}/completion`, {}, s.session.cookie)

    const response = await request(
      "DELETE",
      `${s.base}/items/${silla?.id}`,
      undefined,
      s.session.cookie,
    )

    expect(response.status).toBe(204)
  })

  it("una nota cancelada tampoco lo retiene", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await newDelivery(s)
    await setItems(s, delivery.id, [silla?.id as string])
    await request("POST", `${s.base}/deliveries/${delivery.id}/cancellation`, {}, s.session.cookie)

    const response = await request(
      "DELETE",
      `${s.base}/items/${silla?.id}`,
      undefined,
      s.session.cookie,
    )

    expect(response.status).toBe(204)
  })
})

// ─── Dónde se usa un artículo ────────────────────────────────────────────────

describe("dónde se usa un artículo", () => {
  it("enumera también las notas en que figura", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await newDelivery(s, { name: "Entrega de arte" })
    await setItems(s, delivery.id, [silla?.id as string])

    const usage = await json<{
      deliveries: { id: string; name: string; status: string; direction: string }[]
    }>(await request("GET", `${s.base}/items/${silla?.id}/usage`, undefined, s.session.cookie))

    expect(usage.deliveries).toHaveLength(1)
    expect(usage.deliveries[0]?.name).toBe("Entrega de arte")
    expect(usage.deliveries[0]?.status).toBe("in_progress")
  })
})

// ─── El historial del artículo · H-171 ───────────────────────────────────────

describe("el historial del artículo", () => {
  it("el alta deja el primer evento, sin estado de origen", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)

    const history = await json<{
      items: { fromStatus: string | null; toStatus: string; reason: string; actorId: string }[]
    }>(await request("GET", `${s.base}/items/${silla?.id}/events`, undefined, s.session.cookie))

    expect(history.items).toHaveLength(1)
    expect(history.items[0]?.fromStatus).toBeNull()
    expect(history.items[0]?.toStatus).toBe("available")
    expect(history.items[0]?.reason).toBe("created")
    expect(history.items[0]?.actorId).toBe(s.session.userId)
  })

  it("el cambio a mano queda firmado por quien lo hizo", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)

    await request(
      "PUT",
      `${s.base}/items/${silla?.id}/status`,
      { status: "stored" },
      s.session.cookie,
    )

    const history = await json<{
      items: { fromStatus: string | null; toStatus: string; reason: string; actorId: string }[]
    }>(await request("GET", `${s.base}/items/${silla?.id}/events`, undefined, s.session.cookie))

    // El más reciente primero: la vida de un objeto se lee desde donde está.
    const last = history.items[0]
    expect(last?.fromStatus).toBe("available")
    expect(last?.toStatus).toBe("stored")
    expect(last?.reason).toBe("manual")
    expect(last?.actorId).toBe(s.session.userId)
  })

  it("el cierre de la nota deja el evento con su razón y la nota como causa", async () => {
    const s = await scene()
    const [silla] = await items(s, 1)
    const delivery = await setItems(s, (await newDelivery(s)).id, [silla?.id as string])
    await verifyAll(s, delivery)
    await request("POST", `${s.base}/deliveries/${delivery.id}/completion`, {}, s.session.cookie)

    const rows = await db
      .select()
      .from(productionItemEvents)
      .where(eq(productionItemEvents.itemId, silla?.id as string))

    const entrega = rows.find((row) => row.reason === "delivery")
    expect(entrega).toBeDefined()
    expect(entrega?.toStatus).toBe("delivered")
    expect(entrega?.fromStatus).toBe("available")
    expect(entrega?.causeId).toBe(delivery.id)
    expect(entrega?.actorId).toBe(s.session.userId)
  })
})

// ─── Documento y enlace público ──────────────────────────────────────────────

describe("documento y enlace público", () => {
  it("agrupa los artículos por su estado de verificación y se abre sin cuenta", async () => {
    const s = await scene()
    const [uno, dos] = await items(s, 2)
    const delivery = await setItems(s, (await newDelivery(s, { name: "Entrega de arte" })).id, [
      uno?.id as string,
      dos?.id as string,
    ])
    await verify(s, delivery.id, delivery.lines[0]?.id as string, { isVerified: true })

    const result = await json<{
      document: {
        kind: string
        identity: { name: string }
        groups: { isVerified: boolean; lines: { itemName: string }[] }[]
        counts: { total: number; verified: number; pending: number }
      }
      reference: string
    }>(
      await request(
        "GET",
        `${s.base}/deliveries/${delivery.id}/document`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(result.document.kind).toBe("delivery-note")
    expect(result.document.identity.name).toBe("Entrega de arte")
    expect(result.document.groups.map((group) => group.isVerified)).toEqual([true, false])
    expect(result.document.counts).toEqual({ total: 2, verified: 1, pending: 1 })

    // Sin cookie: quien recibe el enlace no tiene cuenta.
    const publico = await request("GET", `/public/documents/${result.reference}`)
    expect(publico.status).toBe(200)
    const body = await json<{ document: { identity: { name: string } } }>(publico)
    expect(body.document.identity.name).toBe("Entrega de arte")
  })

  it("una nota dada de baja deja de abrirse por su enlace", async () => {
    const s = await scene()
    const delivery = await newDelivery(s)
    const result = await json<{ reference: string }>(
      await request(
        "GET",
        `${s.base}/deliveries/${delivery.id}/document`,
        undefined,
        s.session.cookie,
      ),
    )
    expect((await request("GET", `/public/documents/${result.reference}`)).status).toBe(200)

    await request("DELETE", `${s.base}/deliveries/${delivery.id}`, undefined, s.session.cookie)

    expect((await request("GET", `/public/documents/${result.reference}`)).status).toBe(404)
  })
})

// ─── Aislamiento ─────────────────────────────────────────────────────────────

describe("aislamiento", () => {
  it("la nota de otra empresa no existe para quien mira", async () => {
    const mia = await scene()
    const ajena = await scene()
    const delivery = await newDelivery(ajena)

    const response = await request(
      "GET",
      `${mia.base}/deliveries/${delivery.id}`,
      undefined,
      mia.session.cookie,
    )

    expect(response.status).toBe(404)
  })
})
