/**
 * La conversación del pedido, por HTTP.
 *
 * Transcritas de `openspec/specs/order-chat/spec.md`.
 *
 * **La primera prueba es la que decide si esto puede existir**: la conversación pertenece al
 * pedido, y nadie lee la de un pedido ajeno. Lo demás —historial, acuses, edición— es
 * comportamiento; esto es la frontera.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db, withRequester } from "@tfv/db"
import {
  companies,
  companyMembers,
  companyServices,
  counterparties,
  loginAttempts,
  notificationDeliveries,
  productionPurchaseOrders,
  productions,
  roles,
  services,
  sessions,
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
  warehouseQuotes,
  warehouseStockEvents,
  warehouseStockReservations,
  warehouseStockUnits,
  warehouseStorages,
  warehouses,
} from "@tfv/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"
import { resolveChatSide } from "./order-chat.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${productionPurchaseOrders}, ${productions}, ${warehouseOrderMessages}, ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${counterparties}, ${warehouseOrderLines}, ${warehouseOrders}, ${warehouseStockReservations}, ${warehouseQuoteLines}, ${warehouseQuotes}, ${warehouseStockEvents}, ${warehouseStockUnits}, ${warehouseMeasurements}, ${warehouseProductPrices}, ${warehousePriceLists}, ${warehouseProducts}, ${warehouseCategories}, ${warehouseStorages}, ${warehouses}, ${services}, ${companies} cascade`,
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

interface Session {
  readonly cookie: string
  readonly userId: string
  readonly sessionId: string
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

  const [session] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, user.id))

  return { cookie, userId: user.id, sessionId: session?.id ?? "" }
}

/** Una empresa con el servicio de almacenes contratado, y un almacén dentro. */
async function newWarehouse(session: Session, name: string) {
  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name }, session.cookie),
  )

  const serviceId = newId()
  await db
    .insert(services)
    .values({ id: serviceId, keycode: "warehouses", name: "Almacenes" })
    .onConflictDoNothing()
  const [service] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.keycode, "warehouses"))
  await db
    .insert(companyServices)
    .values({ id: newId(), companyId: company.id, serviceId: service?.id ?? serviceId })
    .onConflictDoNothing()

  const warehouse = await json<{ id: string }>(
    await request(
      "POST",
      `/companies/${company.id}/warehouses`,
      // El identificador legible del almacén es único en todo el sistema: dos «Nave» chocan.
      { name: `Nave de ${name}` },
      session.cookie,
    ),
  )

  return {
    companyId: company.id,
    warehouseId: warehouse.id,
    base: `/companies/${company.id}/warehouses/${warehouse.id}`,
  }
}

interface Message {
  id: string
  side: string
  authorId: string | null
  authorName: string | null
  body: string
  replyToId: string | null
  editedAt: string | null
  deletedAt: string | null
  readByClientAt: string | null
  readByProviderAt: string | null
  createdAt: string
}

interface Conversation {
  items: Message[]
  side: string
  hasMore: boolean
  olderCursor: string | null
  syncCursor: string
  unread: number
}

let almacen: Session
let compa: Session
let ajeno: Session
let casa: { companyId: string; warehouseId: string; base: string }
let otra: { companyId: string; warehouseId: string; base: string }

beforeAll(async () => {
  await reset()

  almacen = await signUp("conversacion@ejemplo.mx")
  casa = await newWarehouse(almacen, "Renta del Bajío")

  // Un segundo par de ojos del **mismo lado**: los acuses son por lado, no por persona.
  compa = await signUp("companero@ejemplo.mx")
  await db.insert(companyMembers).values({
    id: newId(),
    companyId: casa.companyId,
    userId: compa.userId,
    isOwner: true,
  })

  // Y una empresa que no tiene nada que ver con este pedido.
  ajeno = await signUp("ajeno@ejemplo.mx")
  otra = await newWarehouse(ajeno, "Casa Ajena")
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

async function newOrder(name = "Pedido con conversación"): Promise<string> {
  const order = await json<{ id: string }>(
    await request(
      "POST",
      `${casa.base}/orders`,
      { origin: "production", type: "rent", name, lines: [] },
      almacen.cookie,
    ),
  )
  return order.id
}

function chat(orderId: string, suffix = "") {
  return `${casa.base}/orders/${orderId}/messages${suffix}`
}

/** Lo que escribe el otro lado. Su superficie aún no existe; la conversación sí. */
async function fromClient(orderId: string, body: string, at?: Date) {
  const id = newId()
  await db.insert(warehouseOrderMessages).values({
    id,
    orderId,
    side: "client",
    body,
    ...(at ? { createdAt: at, updatedAt: at } : {}),
  })
  return id
}

// ─── La frontera ─────────────────────────────────────────────────────────────

describe("la conversación pertenece al pedido", () => {
  it("sin sesión no se lee", async () => {
    const orderId = await newOrder()
    expect((await request("GET", chat(orderId))).status).toBe(401)
  })

  it("un miembro de una empresa ajena no la alcanza por la ruta del proveedor", async () => {
    // El permiso se resuelve contra la empresa del camino, y no es la suya.
    const orderId = await newOrder()
    const response = await request("GET", chat(orderId), undefined, ajeno.cookie)
    expect(response.status).toBe(404)
  })

  it("ni pidiéndola desde su propio almacén", async () => {
    // Escenario: «La conversación es privada del pedido». Aquí la empresa del camino sí es la
    // suya, así que la compuerta deja pasar: lo que responde que no es el pedido.
    const orderId = await newOrder()
    const response = await request(
      "GET",
      `${otra.base}/orders/${orderId}/messages`,
      undefined,
      ajeno.cookie,
    )
    expect(response.status).toBe(404)
  })

  it("tampoco escribe en ella", async () => {
    const orderId = await newOrder()
    const response = await request(
      "POST",
      `${otra.base}/orders/${orderId}/messages`,
      { body: "Hola" },
      ajeno.cookie,
    )
    expect(response.status).toBe(404)
  })

  it("y el motor tampoco se la enseña", async () => {
    // La segunda capa. Si la primera se equivocara —una ruta nueva que olvida comprobar el
    // pedido—, esto es lo que sigue impidiendo leer la conversación de otro.
    const orderId = await newOrder()
    await fromClient(orderId, "Sólo para las partes")

    const visto = await withRequester({ userId: ajeno.userId, sessionId: ajeno.sessionId }, (tx) =>
      tx
        .select({ id: warehouseOrderMessages.id })
        .from(warehouseOrderMessages)
        .where(eq(warehouseOrderMessages.orderId, orderId)),
    )

    expect(visto).toHaveLength(0)
  })
})

// ─── Historial ───────────────────────────────────────────────────────────────

describe("historial consultable sin conexión persistente", () => {
  it("llega paginado, del más reciente al más antiguo", async () => {
    // Escenario: «Se lee el historial sin conectarse».
    const orderId = await newOrder()
    for (let index = 0; index < 5; index += 1) {
      await request("POST", chat(orderId), { body: `Mensaje ${index}` }, almacen.cookie)
    }

    const page = await json<Conversation>(
      await request("GET", chat(orderId, "?limit=2"), undefined, almacen.cookie),
    )

    expect(page.items.map((message) => message.body)).toEqual(["Mensaje 4", "Mensaje 3"])
    expect(page.hasMore).toBe(true)
    expect(page.olderCursor).not.toBeNull()
  })

  it("el cursor sigue leyendo hacia atrás sin repetir ni saltarse nada", async () => {
    const orderId = await newOrder()
    for (let index = 0; index < 5; index += 1) {
      await request("POST", chat(orderId), { body: `Mensaje ${index}` }, almacen.cookie)
    }

    const leidos: string[] = []
    let cursor: string | null = null
    let vueltas = 0

    do {
      const query: string = cursor ? `?limit=2&before=${encodeURIComponent(cursor)}` : "?limit=2"
      const page: Conversation = await json<Conversation>(
        await request("GET", chat(orderId, query), undefined, almacen.cookie),
      )
      leidos.push(...page.items.map((message) => message.body))
      cursor = page.hasMore ? page.olderCursor : null
      vueltas += 1
    } while (cursor && vueltas < 10)

    expect(leidos).toEqual(["Mensaje 4", "Mensaje 3", "Mensaje 2", "Mensaje 1", "Mensaje 0"])
  })

  it("un cursor ilegible se lee desde el principio y no rompe nada", async () => {
    // Requisito: «Un mensaje mal formado no rompe la conexión». Sin conexión persistente, su
    // equivalente es que una petición mal formada se atienda igual en lugar de responder 500.
    const orderId = await newOrder()
    await request("POST", chat(orderId), { body: "Único" }, almacen.cookie)

    const page = await json<Conversation>(
      await request("GET", chat(orderId, "?before=mañana"), undefined, almacen.cookie),
    )

    expect(page.items).toHaveLength(1)
  })
})

// ─── Envío optimista ─────────────────────────────────────────────────────────

describe("envío optimista con reconciliación", () => {
  it("devuelve la referencia temporal de quien envía, y el mensaje no se duplica", async () => {
    // Escenario: «El mensaje propio no se duplica».
    const orderId = await newOrder()

    const enviado = await json<{ clientRef: string | null; message: Message }>(
      await request(
        "POST",
        chat(orderId),
        { body: "Ya salió el equipo", clientRef: "borrador-7" },
        almacen.cookie,
      ),
    )

    expect(enviado.clientRef).toBe("borrador-7")
    expect(enviado.message.body).toBe("Ya salió el equipo")
    expect(enviado.message.side).toBe("provider")
    expect(enviado.message.authorId).toBe(almacen.userId)

    const page = await json<Conversation>(
      await request("GET", chat(orderId), undefined, almacen.cookie),
    )
    expect(page.items.filter((message) => message.id === enviado.message.id)).toHaveLength(1)
  })

  it("los demás lo reciben como mensaje nuevo, sin la referencia de quien lo envió", async () => {
    // Escenario: «Los demás reciben el mensaje nuevo». La referencia temporal es de quien envía:
    // a otro no le sirve para nada y le diría cómo llama a sus borradores.
    const orderId = await newOrder()
    const antes = await json<Conversation>(
      await request("GET", chat(orderId), undefined, compa.cookie),
    )

    await request(
      "POST",
      chat(orderId),
      { body: "Voy para allá", clientRef: "borrador-9" },
      almacen.cookie,
    )

    const nuevos = await json<Conversation>(
      await request(
        "GET",
        chat(orderId, `?since=${encodeURIComponent(antes.syncCursor)}`),
        undefined,
        compa.cookie,
      ),
    )

    expect(nuevos.items.map((message) => message.body)).toEqual(["Voy para allá"])
    expect(JSON.stringify(nuevos.items)).not.toContain("borrador-9")
  })

  it("lo escrito mientras nadie miraba se recupera con el cursor", async () => {
    // Escenario: «Se recupera lo perdido al reconectar». Sin conexión persistente el cursor es lo
    // que hace de reconexión: se pide desde donde se quedó.
    const orderId = await newOrder()
    const punto = await json<Conversation>(
      await request("GET", chat(orderId), undefined, almacen.cookie),
    )

    await fromClient(orderId, "¿Sigue en pie lo del martes?")
    await fromClient(orderId, "Te dejo el teléfono de la bodega")

    const perdidos = await json<Conversation>(
      await request(
        "GET",
        chat(orderId, `?since=${encodeURIComponent(punto.syncCursor)}`),
        undefined,
        almacen.cookie,
      ),
    )

    expect(perdidos.items.map((message) => message.body)).toEqual([
      "¿Sigue en pie lo del martes?",
      "Te dejo el teléfono de la bodega",
    ])
  })

  it("un cuerpo vacío no es un mensaje", async () => {
    const orderId = await newOrder()
    const response = await request("POST", chat(orderId), { body: "   " }, almacen.cookie)
    expect(response.status).toBe(422)
  })
})

// ─── Acuses de lectura ───────────────────────────────────────────────────────

describe("acuses de lectura por lado", () => {
  it("que lea uno lo marca para todo su lado", async () => {
    // Escenario: «Un lado lee por todos los suyos».
    const orderId = await newOrder()
    await fromClient(orderId, "¿Está listo?")
    await fromClient(orderId, "¿Y el trípode?")

    const antes = await json<Conversation>(
      await request("GET", chat(orderId), undefined, compa.cookie),
    )
    expect(antes.unread).toBe(2)

    // Lee **el otro** del mismo lado.
    const marcado = await json<{ read: number; unread: number }>(
      await request("POST", chat(orderId, "/read"), {}, almacen.cookie),
    )
    expect(marcado.read).toBe(2)

    const despues = await json<Conversation>(
      await request("GET", chat(orderId), undefined, compa.cookie),
    )
    expect(despues.unread).toBe(0)
    expect(despues.items.every((message) => message.readByProviderAt !== null)).toBe(true)
  })

  it("leer por un lado no marca lo del otro", async () => {
    // Escenario: «Leer no afecta al otro lado».
    const orderId = await newOrder()
    await fromClient(orderId, "Del cliente")
    await request("POST", chat(orderId), { body: "Del proveedor" }, almacen.cookie)

    await request("POST", chat(orderId, "/read"), {}, almacen.cookie)

    const page = await json<Conversation>(
      await request("GET", chat(orderId), undefined, almacen.cookie),
    )
    const proveedor = page.items.find((message) => message.side === "provider")
    const cliente = page.items.find((message) => message.side === "client")

    expect(cliente?.readByProviderAt).not.toBeNull()
    // Lo del proveedor sigue sin leer para el cliente: el acuse es de quien lee, no de quien pasa.
    expect(proveedor?.readByClientAt).toBeNull()
  })

  it("el contador del pedido baja con la conversación leída", async () => {
    const orderId = await newOrder()
    await fromClient(orderId, "Pendiente")

    await request("POST", chat(orderId, "/read"), {}, almacen.cookie)

    const order = await json<{ unread: number }>(
      await request("GET", `${casa.base}/orders/${orderId}`, undefined, almacen.cookie),
    )
    expect(order.unread).toBe(0)
  })
})

// ─── Editar y borrar ─────────────────────────────────────────────────────────

describe("editar y borrar los mensajes propios", () => {
  it("editar el propio deja constancia de que se editó", async () => {
    const orderId = await newOrder()
    const enviado = await json<{ message: Message }>(
      await request("POST", chat(orderId), { body: "Salimos a las ocho" }, almacen.cookie),
    )

    const editado = await json<Message>(
      await request(
        "PATCH",
        chat(orderId, `/${enviado.message.id}`),
        { body: "Salimos a las nueve" },
        almacen.cookie,
      ),
    )

    expect(editado.body).toBe("Salimos a las nueve")
    expect(editado.editedAt).not.toBeNull()
  })

  it("no se editan los ajenos, ni los del propio lado", async () => {
    // Escenario: «No se editan mensajes ajenos». El lado no basta: quien escribe es una persona,
    // y reescribir lo que dijo un compañero es poner palabras en su boca.
    const orderId = await newOrder()
    const enviado = await json<{ message: Message }>(
      await request("POST", chat(orderId), { body: "Lo dije yo" }, almacen.cookie),
    )
    const delCliente = await fromClient(orderId, "Lo dijo el cliente")

    const companero = await request(
      "PATCH",
      chat(orderId, `/${enviado.message.id}`),
      { body: "Lo digo yo" },
      compa.cookie,
    )
    expect(companero.status).toBe(403)

    const otroLado = await request(
      "PATCH",
      chat(orderId, `/${delCliente}`),
      { body: "No dijo eso" },
      almacen.cookie,
    )
    expect(otroLado.status).toBe(403)
  })

  it("borrar el propio lo retira del historial y avisa a los demás", async () => {
    // Escenario: «El borrado llega a todos». Sin conexión persistente el aviso viaja por el
    // cursor: el mensaje vuelve marcado como borrado, que es lo que permite retirarlo de la
    // pantalla de quien ya lo tenía.
    const orderId = await newOrder()
    const enviado = await json<{ message: Message }>(
      await request("POST", chat(orderId), { body: "Me equivoqué" }, almacen.cookie),
    )

    const punto = await json<Conversation>(
      await request("GET", chat(orderId), undefined, compa.cookie),
    )

    expect(
      (await request("DELETE", chat(orderId, `/${enviado.message.id}`), undefined, almacen.cookie))
        .status,
    ).toBe(204)

    const historial = await json<Conversation>(
      await request("GET", chat(orderId), undefined, compa.cookie),
    )
    expect(historial.items.map((message) => message.id)).not.toContain(enviado.message.id)

    const aviso = await json<Conversation>(
      await request(
        "GET",
        chat(orderId, `?since=${encodeURIComponent(punto.syncCursor)}`),
        undefined,
        compa.cookie,
      ),
    )
    const borrado = aviso.items.find((message) => message.id === enviado.message.id)
    expect(borrado?.deletedAt).not.toBeNull()
    expect(borrado?.body).toBe("")
  })
})

// ─── Mensajes del sistema ────────────────────────────────────────────────────

describe("mensajes del sistema", () => {
  it("aceptar el pedido deja constancia en la conversación, y no se toca", async () => {
    // Escenario: «La aceptación deja constancia en la conversación».
    const product = await json<{ measurements: { id: string }[] }>(
      await request(
        "POST",
        `${casa.base}/products`,
        {
          name: `Cámara ${Date.now()}`,
          availableForRent: true,
          measurements: [{ name: "Única", initialQuantity: 2 }],
        },
        almacen.cookie,
      ),
    )
    const measurementId = product.measurements[0]?.id as string

    const order = await json<{ id: string }>(
      await request(
        "POST",
        `${casa.base}/orders`,
        {
          origin: "production",
          type: "rent",
          name: "Con hito",
          lines: [{ measurementId, quantity: 1 }],
        },
        almacen.cookie,
      ),
    )

    await request("POST", `${casa.base}/orders/${order.id}/acceptance`, {}, almacen.cookie)

    const page = await json<Conversation>(
      await request("GET", chat(order.id), undefined, almacen.cookie),
    )
    const sistema = page.items.find((message) => message.side === "system")
    expect(sistema).toBeDefined()
    expect(sistema?.authorId).toBeNull()

    const editar = await request(
      "PATCH",
      chat(order.id, `/${sistema?.id}`),
      { body: "No pasó nada" },
      almacen.cookie,
    )
    expect(editar.status).toBe(403)

    const borrar = await request(
      "DELETE",
      chat(order.id, `/${sistema?.id}`),
      undefined,
      almacen.cookie,
    )
    expect(borrar.status).toBe(403)
  })

  it("rechazar también, con su motivo", async () => {
    const orderId = await newOrder("Para rechazar")
    await request(
      "POST",
      `${casa.base}/orders/${orderId}/rejection`,
      { reason: "No hay dos cámaras libres esa semana" },
      almacen.cookie,
    )

    const page = await json<Conversation>(
      await request("GET", chat(orderId), undefined, almacen.cookie),
    )
    expect(
      page.items.some(
        (message) =>
          message.side === "system" && message.body.includes("No hay dos cámaras libres"),
      ),
    ).toBe(true)
  })
})

// ─── El lado por el que se entra ─────────────────────────────────────────────

describe("el lado se resuelve con la autoridad del motor", () => {
  it("quien ve el almacén es el proveedor; la contraparte es el cliente", async () => {
    // La superficie del lado cliente aún no existe —vive en las pantallas de producción—, pero el
    // lado sí se resuelve, y se resuelve preguntándole al motor: si el almacén se te enseña, eres
    // quien lo surte. Así el día que llegue esa pantalla no hay que reescribir esto.
    const orderId = await newOrder("Con contraparte")

    const contraparte = newId()
    await db.insert(counterparties).values({
      id: contraparte,
      companyId: casa.companyId,
      role: "client",
      alias: "Producciones Ajenas",
      counterpartyCompanyId: otra.companyId,
    })
    await db
      .update(warehouseOrders)
      .set({ clientId: contraparte })
      .where(eq(warehouseOrders.id, orderId))

    const [order] = await db
      .select({ warehouseId: warehouseOrders.warehouseId, clientId: warehouseOrders.clientId })
      .from(warehouseOrders)
      .where(eq(warehouseOrders.id, orderId))

    const desdeElAlmacen = await withRequester(
      { userId: almacen.userId, sessionId: almacen.sessionId },
      (tx) => resolveChatSide(tx, order as { warehouseId: string; clientId: string | null }),
    )
    const desdeElCliente = await withRequester(
      { userId: ajeno.userId, sessionId: ajeno.sessionId },
      (tx) => resolveChatSide(tx, order as { warehouseId: string; clientId: string | null }),
    )

    expect(desdeElAlmacen).toBe("provider")
    expect(desdeElCliente).toBe("client")
  })

  it("quien no es de ninguno de los dos lados no tiene lado", async () => {
    const orderId = await newOrder("Sin contraparte")
    const [order] = await db
      .select({ warehouseId: warehouseOrders.warehouseId, clientId: warehouseOrders.clientId })
      .from(warehouseOrders)
      .where(eq(warehouseOrders.id, orderId))

    const lado = await withRequester({ userId: ajeno.userId, sessionId: ajeno.sessionId }, (tx) =>
      resolveChatSide(tx, order as { warehouseId: string; clientId: string | null }),
    )

    expect(lado).toBeNull()
  })
})

// ─── Pertenencia estricta ────────────────────────────────────────────────────

describe("un mensaje pertenece a su conversación", () => {
  it("no se edita desde otro pedido", async () => {
    // El identificador del mensaje no basta: tiene que ser de **este** pedido. Sin esta
    // comprobación, quien alcanza una conversación alcanza todas las demás.
    const primero = await newOrder("Primero")
    const segundo = await newOrder("Segundo")

    const enviado = await json<{ message: Message }>(
      await request("POST", chat(primero), { body: "Del primero" }, almacen.cookie),
    )

    const response = await request(
      "PATCH",
      chat(segundo, `/${enviado.message.id}`),
      { body: "Desde el segundo" },
      almacen.cookie,
    )
    expect(response.status).toBe(404)

    const [intacto] = await db
      .select({ body: warehouseOrderMessages.body })
      .from(warehouseOrderMessages)
      .where(
        and(
          eq(warehouseOrderMessages.id, enviado.message.id),
          eq(warehouseOrderMessages.orderId, primero),
        ),
      )
    expect(intacto?.body).toBe("Del primero")
  })
})
