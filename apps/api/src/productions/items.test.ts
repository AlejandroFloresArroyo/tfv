/**
 * Inventario de una producción, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/production-inventory/spec.md`. Rebanada 22,
 * bloque de inventario.
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
  productionContinuities,
  productionProps,
  productionRecordings,
  productionSetItems,
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
import { canTransition, ITEM_STATUSES, type ItemStatus } from "./items.ts"

// ─── La tabla de transiciones ────────────────────────────────────────────────

/**
 * Las ocho por las ocho, sin excepción.
 *
 * La spec enumera los estados y **no dice qué pasa a qué**; el criterio está adoptado y escrito en
 * `items.ts`. Se ejerce entero —sesenta y cuatro celdas— y no por muestreo: una tabla de
 * transiciones probada a medias es igual de peligrosa que ninguna, porque lo que se cuela es
 * justamente la celda que nadie escribió.
 */
describe("la tabla de transiciones", () => {
  const INCIDENTS: readonly ItemStatus[] = ["damaged", "incomplete", "lost", "robbed"]

  /**
   * Lo esperado, escrito **desde las reglas** y no desde la tabla, para que no se prueben iguales.
   *
   * Las reglas **se suman, no se excluyen**: que un artículo dañado se repare y vuelva a disponible
   * no impide devolverlo dañado a su dueño, que es lo que se hace con la utilería rentada que se
   * rompió. Escribirlas como cascada —la primera que casa decide— es el error que esta prueba
   * cometió en su primera versión, y dio cuatro celdas de diferencia: las cuatro incidencias hacia
   * «devuelto».
   */
  function shouldAllow(from: ItemStatus, to: ItemStatus): boolean {
    // Quedarse donde se está no es una transición: no figura en la tabla.
    if (from === to) return false
    // «Devuelto» es el único terminal: volvió a su dueño y salió de las manos de la producción.
    if (from === "returned") return false
    // «Entregado» no se pone a mano nunca: es consecuencia de cerrar una nota de entrega.
    if (to === "delivered") return false

    // Se rompe y se pierde en cualquier momento, incluso guardado.
    if (INCIDENTS.includes(to)) return true
    // Se devuelve desde donde esté: el dueño lo recupera igual roto que entero.
    if (to === "returned") return true
    // Disponible ↔ Almacenado, libre en ambos sentidos.
    if (from === "available" || from === "stored") return to === "available" || to === "stored"
    // Nada de eso es terminal: se reparó, apareció la pieza, estaba debajo de una mesa.
    if (INCIDENTS.includes(from)) return to === "available" || to === "stored"
    // Entregado ya no está en manos de la producción: no vuelve al inventario con un botón.
    return false
  }

  it("cubre las sesenta y cuatro celdas con el criterio adoptado", () => {
    expect(ITEM_STATUSES).toHaveLength(8)

    const wrong: string[] = []
    for (const from of ITEM_STATUSES) {
      for (const to of ITEM_STATUSES) {
        if (canTransition(from, to) !== shouldAllow(from, to)) wrong.push(`${from} → ${to}`)
      }
    }

    expect(wrong).toEqual([])
  })

  it("«devuelto» no tiene salida, y es el único que no la tiene", () => {
    const sinSalida = ITEM_STATUSES.filter((from) =>
      ITEM_STATUSES.every((to) => !canTransition(from, to)),
    )

    expect(sinSalida).toEqual(["returned"])
  })

  it("«entregado» no tiene entrada, y es el único que no la tiene", () => {
    // Deliberado: se llega ahí cerrando una nota de entrega, que se verifica pieza por pieza y se
    // firma. Las notas son de la rebanada 22 y no entran en esta ronda, así que hoy es inalcanzable.
    const sinEntrada = ITEM_STATUSES.filter((to) =>
      ITEM_STATUSES.every((from) => !canTransition(from, to)),
    )

    expect(sinEntrada).toEqual(["delivered"])
  })
})

// ─── Andamiaje ───────────────────────────────────────────────────────────────

/**
 * Contra un servidor de verdad, en un puerto efímero.
 *
 * El bloque entero se recorre por HTTP: serialización, cookie, enrutado, guardián y manejador. El
 * puerto lo elige el sistema —`0`— y no sale de `API_PORT`, que puede apuntar a un servicio de
 * desarrollo con los datos de alguien delante.
 */
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

/**
 * Una empresa con el servicio contratado y una producción dentro.
 *
 * **Cada producción lleva un nombre distinto, y hace falta que lo lleve** (`H-174`): el identificador
 * legible es único de plataforma y se comprueba con las políticas puestas, así que dos empresas que
 * llamen igual a su producción chocan contra el índice y la segunda recibe `500`. Es H-90 sobre una
 * cuarta entidad, y no es defecto de esta tanda.
 */
async function scene() {
  const session = await signUp(`utileria-${newId()}@tfv.dev`)
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
  allowedStatuses: ItemStatus[]
  categoryName: string | null
  images: { uploadId: string; position: number }[]
}

async function newItem(s: Scene, body: Record<string, unknown>): Promise<Item> {
  const response = await request("POST", `${s.base}/items`, body, s.session.cookie)
  expect(response.status).toBe(201)
  return json(response)
}

async function newSet(s: Scene, name: string): Promise<{ id: string }> {
  return json(await request("POST", `${s.base}/sets`, { name }, s.session.cookie))
}

async function newCategory(s: Scene, name: string): Promise<{ id: string }> {
  const response = await request("POST", `${s.base}/categories`, { name }, s.session.cookie)
  expect(response.status).toBe(201)
  return json(response)
}

async function seedPhoto(companyId: string, name: string): Promise<string> {
  const id = newId()
  await db.insert(uploads).values({
    id,
    kind: "image",
    status: "uploaded",
    url: `http://almacen/${companyId}/${id}/original.jpg`,
    fileName: `${name}.jpg`,
    extension: "jpg",
    contentType: "image/jpeg",
    byteSize: 2048,
    storagePath: `${companyId}/${id}`,
  })
  return id
}

/** Una jornada con una continuidad y una pieza de utilería que apunta al artículo. */
async function seedUseInRecording(productionId: string, itemId: string, name: string) {
  const recordingId = newId()
  const continuityId = newId()

  await db.insert(productionRecordings).values({ id: recordingId, productionId, name })
  await db.insert(productionContinuities).values({ id: continuityId, recordingId })
  await db.insert(productionProps).values({ id: newId(), continuityId, itemId, videoId: null })

  return { recordingId, continuityId }
}

async function statusOf(s: Scene, itemId: string): Promise<ItemStatus> {
  const item = await json<Item>(
    await request("GET", `${s.base}/items/${itemId}`, undefined, s.session.cookie),
  )
  return item.status
}

function changeStatus(s: Scene, itemId: string, status: string) {
  return request("PUT", `${s.base}/items/${itemId}/status`, { status }, s.session.cookie)
}

// ─── Alta y código ───────────────────────────────────────────────────────────

describe("alta de un artículo", () => {
  it("nace disponible y con un código acuñado por el sistema", async () => {
    // Escenario: «Se da de alta un artículo» — «queda registrado con un código identificativo único
    // generado por el sistema AND su estado inicial es disponible».
    const s = await scene()
    const item = await newItem(s, { name: "Silla de mimbre" })

    expect(item.status).toBe("available")
    expect(item.code).toMatch(/^[0-9A-HJ-NP-TV-Z]{12}$/)
  })

  it("el código no se recibe: mandarlo no lo fija", async () => {
    // Es lo que hace que no repita el agujero de H-90: nadie elige, así que no hay nada que
    // comprobar antes de insertar y no hay dos empresas compitiendo por la misma cadena.
    const s = await scene()
    const item = await newItem(s, { name: "Lámpara", code: "ELEGIDO12345" })

    expect(item.code).not.toBe("ELEGIDO12345")
  })

  it("dos artículos con el mismo nombre no comparten código", async () => {
    const s = await scene()
    const uno = await newItem(s, { name: "Silla" })
    const otro = await newItem(s, { name: "Silla" })

    expect(uno.code).not.toBe(otro.code)
  })

  it("el código no cambia al editar: está impreso en la etiqueta", async () => {
    const s = await scene()
    const item = await newItem(s, { name: "Silla" })

    const edited = await json<Item>(
      await request(
        "PATCH",
        `${s.base}/items/${item.id}`,
        { name: "Silla de mimbre", code: "OTRO12345678" },
        s.session.cookie,
      ),
    )

    expect(edited.name).toBe("Silla de mimbre")
    expect(edited.code).toBe(item.code)
  })
})

// ─── Etiqueta y localización ─────────────────────────────────────────────────

describe("etiqueta legible por máquina", () => {
  it("lo que va en la etiqueta es lo que la localización acepta de vuelta", async () => {
    // Escenario: «Se localiza un artículo escaneado» — «se obtiene el artículo con su estado y su
    // producción».
    //
    // Se ejerce el viaje completo —imprimir y escanear— y no cada mitad por su lado: lo que se
    // rompe en la práctica es que la etiqueta lleve una cosa y el buscador espere otra, y eso sólo
    // se ve encadenando los dos.
    const s = await scene()
    const item = await newItem(s, { name: "Silla de mimbre" })
    await changeStatus(s, item.id, "stored")

    const label = await json<{ code: string; payload: string }>(
      await request("GET", `${s.base}/items/${item.id}/label`, undefined, s.session.cookie),
    )
    expect(label.code).toBe(item.code)

    const found = await json<{
      id: string
      status: string
      productionId: string
      productionName: string
    }>(
      await request(
        "GET",
        `/companies/${s.companyId}/production-items/by-code/${label.payload}`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(found.id).toBe(item.id)
    expect(found.status).toBe("stored")
    expect(found.productionId).toBe(s.productionId)
    expect(found.productionName).not.toBe("")
  })

  it("localiza sin saber de qué producción es, que es para lo que se lee una etiqueta", async () => {
    const s = await scene()

    const otra = await json<{ id: string }>(
      await request(
        "POST",
        `/companies/${s.companyId}/productions`,
        { name: `Segunda Serie ${newId()}` },
        s.session.cookie,
      ),
    )
    const item = await json<Item>(
      await request(
        "POST",
        `/companies/${s.companyId}/productions/${otra.id}/items`,
        { name: "Cámara de época" },
        s.session.cookie,
      ),
    )

    // Se busca desde la empresa, sin nombrar ninguna producción, y la respuesta dice cuál es.
    const found = await json<{ id: string; productionId: string }>(
      await request(
        "GET",
        `/companies/${s.companyId}/production-items/by-code/${item.code}`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(found.id).toBe(item.id)
    expect(found.productionId).toBe(otra.id)
  })

  it("el código de otra empresa no se encuentra", async () => {
    const s = await scene()
    const ajena = await scene()
    const suyo = await newItem(ajena, { name: "Silla ajena" })

    const response = await request(
      "GET",
      `/companies/${s.companyId}/production-items/by-code/${suyo.code}`,
      undefined,
      s.session.cookie,
    )
    expect(response.status).toBe(404)
  })
})

// ─── Cambio de estado ────────────────────────────────────────────────────────

describe("cambio de estado de un artículo", () => {
  it("recorre los caminos legales", async () => {
    // Escenario: «Se marca un artículo como dañado». Y el resto del recorrido que el arte hace de
    // verdad: se guarda, se saca, se rompe, se repara, se pierde, aparece, y se devuelve.
    const s = await scene()
    const item = await newItem(s, { name: "Jarrón" })

    for (const to of [
      "stored",
      "available",
      "damaged",
      "stored",
      "lost",
      "available",
      "returned",
    ] as const) {
      const response = await changeStatus(s, item.id, to)
      expect(response.status).toBe(200)
      expect(await statusOf(s, item.id)).toBe(to)
    }
  })

  it("rechaza los ilegales, y dice a dónde sí se puede ir", async () => {
    const s = await scene()
    const item = await newItem(s, { name: "Jarrón" })

    await changeStatus(s, item.id, "returned")

    const response = await changeStatus(s, item.id, "available")
    expect(response.status).toBe(422)

    const body = await json<{ message?: string; error?: { message?: string } }>(response)
    expect(JSON.stringify(body)).toContain("devuelto")

    // Y no se movió: un rechazo que además escribiera sería peor que ninguno.
    expect(await statusOf(s, item.id)).toBe("returned")
  })

  it("«entregado» no se pone a mano desde ningún estado", async () => {
    // Es consecuencia de cerrar una nota de entrega, que se verifica pieza por pieza y se firma.
    // Las notas son de la rebanada 22 y no entran en esta ronda: hoy es inalcanzable, y a propósito.
    const s = await scene()

    for (const from of [
      "available",
      "stored",
      "damaged",
      "incomplete",
      "lost",
      "robbed",
    ] as const) {
      const item = await newItem(s, { name: `Pieza ${from}` })
      if (from !== "available") expect((await changeStatus(s, item.id, from)).status).toBe(200)

      const response = await changeStatus(s, item.id, "delivered")
      expect(response.status).toBe(422)
      expect(await statusOf(s, item.id)).toBe(from)
    }
  })

  it("quedarse en el mismo estado no es un cambio", async () => {
    const s = await scene()
    const item = await newItem(s, { name: "Jarrón" })

    expect((await changeStatus(s, item.id, "available")).status).toBe(422)
  })

  it("la ficha enumera los estados a los que puede pasar", async () => {
    const s = await scene()
    const item = await newItem(s, { name: "Jarrón" })

    // Sale de la misma tabla que decide, así que no puede desviarse de lo que la operación admite.
    for (const to of item.allowedStatuses) {
      expect(canTransition("available", to)).toBe(true)
    }
    expect(item.allowedStatuses).not.toContain("delivered")
    expect(item.allowedStatuses).not.toContain("available")
  })
})

// ─── Dónde se usa ────────────────────────────────────────────────────────────

describe("dónde se está usando un artículo", () => {
  it("devuelve sus sets y sus jornadas", async () => {
    // Escenario: «Se comprueba el uso antes de eliminar». La spec pide tres sitios; las notas de
    // entrega son de la rebanada 22 y no existen, así que aquí van los dos que sí se pueden decir.
    const s = await scene()
    const item = await newItem(s, { name: "Silla de mimbre" })

    const salon = await newSet(s, "Salón")
    const cocina = await newSet(s, "Cocina")
    for (const set of [salon, cocina]) {
      await request(
        "PUT",
        `${s.base}/sets/${set.id}/items`,
        { itemIds: [item.id] },
        s.session.cookie,
      )
    }

    const { recordingId, continuityId } = await seedUseInRecording(
      s.productionId,
      item.id,
      "Jornada del martes",
    )

    const usage = await json<{
      sets: { id: string; name: string }[]
      recordings: { id: string; name: string; continuityId: string }[]
    }>(await request("GET", `${s.base}/items/${item.id}/usage`, undefined, s.session.cookie))

    expect(usage.sets.map((row) => row.name)).toEqual(["Cocina", "Salón"])
    expect(usage.recordings).toEqual([
      { id: recordingId, name: "Jornada del martes", continuityId },
    ])
  })

  it("un artículo sin usar no está en ninguna parte", async () => {
    const s = await scene()
    const item = await newItem(s, { name: "Cojín" })

    const usage = await json<{ sets: unknown[]; recordings: unknown[] }>(
      await request("GET", `${s.base}/items/${item.id}/usage`, undefined, s.session.cookie),
    )

    expect(usage).toEqual({ sets: [], recordings: [] })
  })
})

// ─── Baja ────────────────────────────────────────────────────────────────────

describe("dar de baja un artículo", () => {
  it("lo retira de sets y continuidades sin eliminar ni unos ni otras", async () => {
    // Escenario: «Los sets sobreviven al artículo» — «el set sigue existiendo con el resto de sus
    // artículos».
    const s = await scene()
    const silla = await newItem(s, { name: "Silla" })
    const mesa = await newItem(s, { name: "Mesa" })

    const salon = await newSet(s, "Salón")
    await request(
      "PUT",
      `${s.base}/sets/${salon.id}/items`,
      { itemIds: [silla.id, mesa.id] },
      s.session.cookie,
    )

    const { continuityId } = await seedUseInRecording(s.productionId, silla.id, "Jornada")

    expect(
      (await request("DELETE", `${s.base}/items/${silla.id}`, undefined, s.session.cookie)).status,
    ).toBe(204)

    // El set sigue, con el resto de sus artículos.
    const set = await json<{ items: { itemId: string }[]; itemCount: number }>(
      await request("GET", `${s.base}/sets/${salon.id}`, undefined, s.session.cookie),
    )
    expect(set.items.map((row) => row.itemId)).toEqual([mesa.id])
    expect(set.itemCount).toBe(1)

    // La continuidad sigue, y su utilería ya no señala al artículo retirado.
    const [continuity] = await db
      .select()
      .from(productionContinuities)
      .where(eq(productionContinuities.id, continuityId))
    expect(continuity).toBeDefined()

    const props = await db
      .select()
      .from(productionProps)
      .where(eq(productionProps.continuityId, continuityId))
    expect(props).toHaveLength(0)

    // Y no quedan filas de composición colgando de un artículo que ya no está.
    const membership = await db
      .select()
      .from(productionSetItems)
      .where(eq(productionSetItems.itemId, silla.id))
    expect(membership).toHaveLength(0)
  })

  it("deja de estar en el inventario y de localizarse por su código", async () => {
    const s = await scene()
    const item = await newItem(s, { name: "Silla" })

    await request("DELETE", `${s.base}/items/${item.id}`, undefined, s.session.cookie)

    expect(
      (await request("GET", `${s.base}/items/${item.id}`, undefined, s.session.cookie)).status,
    ).toBe(404)

    expect(
      (
        await request(
          "GET",
          `/companies/${s.companyId}/production-items/by-code/${item.code}`,
          undefined,
          s.session.cookie,
        )
      ).status,
    ).toBe(404)
  })
})

// ─── Búsqueda y filtrado ─────────────────────────────────────────────────────

describe("búsqueda y filtrado del inventario", () => {
  it("se localiza un artículo por el nombre de su categoría", async () => {
    // Escenario: «Se localiza un artículo por su categoría» — «aparecen los artículos clasificados
    // en ella». Es el campo que vive en otra tabla, y el que se olvida al declarar la búsqueda.
    const s = await scene()
    const vestuario = await newCategory(s, "Vestuario")

    await newItem(s, { name: "Abrigo largo", categoryId: vestuario.id })
    await newItem(s, { name: "Silla de mimbre" })

    const found = await json<{ items: { name: string }[] }>(
      await request("GET", `${s.base}/items?search=vestuario`, undefined, s.session.cookie),
    )

    expect(found.items.map((row) => row.name)).toEqual(["Abrigo largo"])
  })

  it("la búsqueda es insensible a acentos y alcanza nombre, descripción y código", async () => {
    const s = await scene()
    const item = await newItem(s, {
      name: "Lámpara de época",
      description: "Comprada en el mercado de San Ángel",
    })
    await newItem(s, { name: "Silla" })

    for (const term of ["lampara", "LÁMPARA", "san angel", item.code]) {
      const found = await json<{ items: { id: string }[] }>(
        await request(
          "GET",
          `${s.base}/items?search=${encodeURIComponent(term)}`,
          undefined,
          s.session.cookie,
        ),
      )
      expect(found.items.map((row) => row.id)).toEqual([item.id])
    }
  })

  it("filtra por estado y por categoría", async () => {
    const s = await scene()
    const arte = await newCategory(s, "Arte")

    const roto = await newItem(s, { name: "Jarrón", categoryId: arte.id })
    await newItem(s, { name: "Silla", categoryId: arte.id })
    await newItem(s, { name: "Cable" })

    await changeStatus(s, roto.id, "damaged")

    const damaged = await json<{ items: { id: string }[] }>(
      await request("GET", `${s.base}/items?status=damaged`, undefined, s.session.cookie),
    )
    expect(damaged.items.map((row) => row.id)).toEqual([roto.id])

    const byCategory = await json<{ totalItems: number }>(
      await request("GET", `${s.base}/items?categoryId=${arte.id}`, undefined, s.session.cookie),
    )
    expect(byCategory.totalItems).toBe(2)
  })

  it("un filtro que no está declarado se rechaza nombrándolo", async () => {
    // La gramática es cerrada: es lo que impide que un valor de la URL altere la forma de la
    // consulta ejecutada.
    const s = await scene()

    const response = await request("GET", `${s.base}/items?color=rojo`, undefined, s.session.cookie)
    expect(response.status).toBe(400)
  })
})

// ─── Fotos ───────────────────────────────────────────────────────────────────

describe("fotos de un artículo", () => {
  async function stillThere(id: string): Promise<boolean> {
    const [row] = await db.select({ id: uploads.id }).from(uploads).where(eq(uploads.id, id))
    return row !== undefined
  }

  it("se eliminan las que dejaron de estar y se conservan las que siguen", async () => {
    // `DEFECTS.md` L-01, con el escenario escrito con estas mismas letras: A, B, C → A, D. La
    // implementación anterior **intersecaba** en vez de diferenciar, y las dos mitades del error se
    // compensaban en el recuento — por eso nadie lo vio.
    const s = await scene()
    const item = await newItem(s, { name: "Silla" })
    const [a, b, c, d] = await Promise.all([
      seedPhoto(s.companyId, "a"),
      seedPhoto(s.companyId, "b"),
      seedPhoto(s.companyId, "c"),
      seedPhoto(s.companyId, "d"),
    ])

    const first = await request(
      "PUT",
      `${s.base}/items/${item.id}/images`,
      { uploadIds: [a, b, c] },
      s.session.cookie,
    )
    expect(first.status).toBe(200)

    const updated = await json<Item>(
      await request(
        "PUT",
        `${s.base}/items/${item.id}/images`,
        { uploadIds: [a, d] },
        s.session.cookie,
      ),
    )

    expect(updated.images.map((image) => image.uploadId)).toEqual([a, d])
    expect(updated.images.map((image) => image.position)).toEqual([0, 1])
    expect(await stillThere(a)).toBe(true)
    expect(await stillThere(d)).toBe(true)
    expect(await stillThere(b)).toBe(false)
    expect(await stillThere(c)).toBe(false)
  })

  it("reordenar no retira ninguna foto", async () => {
    const s = await scene()
    const item = await newItem(s, { name: "Silla" })
    const [a, b, c] = await Promise.all([
      seedPhoto(s.companyId, "a"),
      seedPhoto(s.companyId, "b"),
      seedPhoto(s.companyId, "c"),
    ])

    await request(
      "PUT",
      `${s.base}/items/${item.id}/images`,
      { uploadIds: [a, b, c] },
      s.session.cookie,
    )
    const moved = await json<Item>(
      await request(
        "PUT",
        `${s.base}/items/${item.id}/images`,
        { uploadIds: [c, a, b] },
        s.session.cookie,
      ),
    )

    expect(moved.images.map((image) => image.uploadId)).toEqual([c, a, b])
    expect(await stillThere(b)).toBe(true)
  })

  it("no admite una foto de otra empresa", async () => {
    const s = await scene()
    const item = await newItem(s, { name: "Silla" })
    const ajena = await seedPhoto(newId(), "ajena")

    const response = await request(
      "PUT",
      `${s.base}/items/${item.id}/images`,
      { uploadIds: [ajena] },
      s.session.cookie,
    )
    expect(response.status).toBe(404)
  })
})

// ─── El recorrido entero ─────────────────────────────────────────────────────

/**
 * Un artículo, de principio a fin, contra el servidor que escucha.
 *
 * No comprueba nada que las de arriba no comprueben por separado, y por eso está: **compilar no es
 * funcionar**, y una pieza que pasa sus pruebas por su cuenta todavía puede no encadenar con la
 * siguiente. Es la vuelta completa que da en un día alguien del departamento de arte.
 */
describe("el recorrido entero de una pieza de utilería", () => {
  it("nace, se fotografía, cambia de estado, entra en dos sets y dice dónde se ha usado", async () => {
    const s = await scene()
    const arte = await newCategory(s, "Arte")

    // Nace: disponible, clasificada y con etiqueta.
    const item = await newItem(s, {
      name: "Silla Thonet nº 14",
      description: "Madera curvada, respaldo de rejilla",
      categoryId: arte.id,
    })
    expect(item.status).toBe("available")
    expect(item.categoryName).toBe("Arte")

    // Recibe foto.
    const foto = await seedPhoto(s.companyId, "silla-thonet")
    const conFoto = await json<Item>(
      await request(
        "PUT",
        `${s.base}/items/${item.id}/images`,
        { uploadIds: [foto] },
        s.session.cookie,
      ),
    )
    expect(conFoto.images).toHaveLength(1)

    // Cambia de estado por caminos legales…
    expect((await changeStatus(s, item.id, "stored")).status).toBe(200)
    expect((await changeStatus(s, item.id, "damaged")).status).toBe(200)
    expect((await changeStatus(s, item.id, "available")).status).toBe(200)

    // …y rechaza los ilegales, sin moverse.
    expect((await changeStatus(s, item.id, "delivered")).status).toBe(422)
    expect(await statusOf(s, item.id)).toBe("available")

    // Entra en dos sets.
    const salon = await newSet(s, "Salón de la casa grande")
    const despacho = await newSet(s, "Despacho")
    for (const set of [salon, despacho]) {
      const response = await request(
        "PUT",
        `${s.base}/sets/${set.id}/items`,
        { itemIds: [item.id] },
        s.session.cookie,
      )
      expect(response.status).toBe(200)
    }

    // Se usa en una jornada.
    const { recordingId } = await seedUseInRecording(s.productionId, item.id, "Jornada 12")

    // Y responde correctamente a dónde se ha usado.
    const usage = await json<{ sets: { id: string }[]; recordings: { id: string }[] }>(
      await request("GET", `${s.base}/items/${item.id}/usage`, undefined, s.session.cookie),
    )

    expect(usage.sets.map((row) => row.id).sort()).toEqual([despacho.id, salon.id].sort())
    expect(usage.recordings.map((row) => row.id)).toEqual([recordingId])

    // Se le lee la etiqueta y aparece con su estado, su producción y su foto.
    const label = await json<{ payload: string }>(
      await request("GET", `${s.base}/items/${item.id}/label`, undefined, s.session.cookie),
    )
    const found = await json<Item & { productionId: string }>(
      await request(
        "GET",
        `/companies/${s.companyId}/production-items/by-code/${label.payload}`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(found.id).toBe(item.id)
    expect(found.status).toBe("available")
    expect(found.productionId).toBe(s.productionId)
    expect(found.images.map((image) => image.uploadId)).toEqual([foto])
  })
})
