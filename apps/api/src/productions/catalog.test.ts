/**
 * Catálogos de una producción: personajes, sets y biblioteca de videos.
 *
 * Transcritas de los escenarios de `openspec/specs/production-management/spec.md`, requisitos
 * «Personajes de la producción», «Eliminar un personaje libera sus continuidades», «Sets de la
 * producción», «Biblioteca de videos» y «Eliminar un video libera sus referencias».
 *
 * ## Contra un servidor de verdad
 *
 * Hay un proceso escuchando en un puerto efímero y las peticiones son HTTP de verdad, con su
 * serialización, su cookie y su enrutado. El puerto lo elige el sistema —`0`— y no se lee de
 * `API_PORT`: esa variable puede apuntar a un servicio de desarrollo con los datos de alguien
 * delante, y una prueba no tiene por qué saber contra qué se levantó la máquina donde corre.
 *
 * Las jornadas, las continuidades y la utilería se siembran **por la base**: sus rutas son de la
 * rebanada 20, bloque de continuidad, y no existen todavía. Lo que se ejerce aquí es lo que esta
 * tanda construye —las tres bajas— sobre filas que sí tienen que estar.
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

// ─── Andamiaje ───────────────────────────────────────────────────────────────

interface Session {
  readonly cookie: string
  readonly userId: string
}

/** Una petición HTTP de verdad contra el servidor que escucha. */
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
 * Una empresa con el servicio contratado y una producción dentro. El punto de partida de todo.
 *
 * **La producción lleva un nombre distinto en cada llamada, y hace falta que lo lleve** (`H-174`):
 * el identificador legible es único de plataforma y se comprueba con las políticas puestas, así que
 * dos empresas que llamen igual a su producción chocan contra el índice y la segunda recibe `500`.
 * Es H-90 sobre una cuarta entidad. Repetir el nombre aquí haría fallar estas pruebas por un defecto
 * que no es suyo.
 */
async function scene() {
  const session = await signUp(`arte-${newId()}@tfv.dev`)
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

/** Una jornada de rodaje con una continuidad. Sus rutas son de la 20, bloque de continuidad. */
async function seedRecording(productionId: string, characterId: string | null = null) {
  const recordingId = newId()
  const continuityId = newId()

  await db
    .insert(productionRecordings)
    .values({ id: recordingId, productionId, name: "Jornada del martes" })
  await db.insert(productionContinuities).values({ id: continuityId, recordingId, characterId })

  return { recordingId, continuityId }
}

async function seedUpload(companyId: string, kind: "image" | "video", name: string) {
  const id = newId()
  await db.insert(uploads).values({
    id,
    kind,
    status: "uploaded",
    url: `http://almacen/${companyId}/${id}/original.${kind === "image" ? "jpg" : "mp4"}`,
    fileName: `${name}.${kind === "image" ? "jpg" : "mp4"}`,
    extension: kind === "image" ? "jpg" : "mp4",
    contentType: kind === "image" ? "image/jpeg" : "video/mp4",
    byteSize: 4096,
    storagePath: `${companyId}/${id}`,
  })
  return id
}

async function newItem(
  s: Awaited<ReturnType<typeof scene>>,
  name: string,
): Promise<{ id: string; code: string }> {
  const response = await request("POST", `${s.base}/items`, { name }, s.session.cookie)
  expect(response.status).toBe(201)
  return json(response)
}

// ─── Personajes ──────────────────────────────────────────────────────────────

describe("personajes de una producción", () => {
  it("se registra un personaje y queda disponible para asignarlo", async () => {
    // Escenario: «Se registra un personaje».
    const s = await scene()

    const response = await request(
      "POST",
      `${s.base}/characters`,
      { name: "Marisol", description: "Protagonista" },
      s.session.cookie,
    )
    expect(response.status).toBe(201)

    const created = await json<{ id: string; name: string; continuityCount: number }>(response)
    expect(created.name).toBe("Marisol")
    expect(created.continuityCount).toBe(0)

    const listed = await json<{ items: { id: string }[] }>(
      await request("GET", `${s.base}/characters`, undefined, s.session.cookie),
    )
    expect(listed.items.map((row) => row.id)).toContain(created.id)
  })

  it("las continuidades sobreviven al personaje, sin personaje", async () => {
    // Escenario: «Las continuidades sobreviven al personaje». Es la propiedad entera del requisito:
    // lo que se conserva es el trabajo —cómo iba vestido alguien en una jornada—, no el personaje.
    const s = await scene()

    const character = await json<{ id: string }>(
      await request("POST", `${s.base}/characters`, { name: "Marisol" }, s.session.cookie),
    )
    const { continuityId } = await seedRecording(s.productionId, character.id)

    const before = await json<{ continuityCount: number }>(
      await request("GET", `${s.base}/characters/${character.id}`, undefined, s.session.cookie),
    )
    expect(before.continuityCount).toBe(1)

    const removed = await request(
      "DELETE",
      `${s.base}/characters/${character.id}`,
      undefined,
      s.session.cookie,
    )
    expect(removed.status).toBe(204)

    const [continuity] = await db
      .select()
      .from(productionContinuities)
      .where(eq(productionContinuities.id, continuityId))

    expect(continuity).toBeDefined()
    expect(continuity?.characterId).toBeNull()
  })
})

// ─── Sets ────────────────────────────────────────────────────────────────────

describe("sets de una producción", () => {
  it("un artículo pertenece a dos sets y figura en ambos", async () => {
    // Escenario: «Un artículo pertenece a dos sets».
    const s = await scene()

    const silla = await newItem(s, "Silla de mimbre")
    const salon = await json<{ id: string }>(
      await request("POST", `${s.base}/sets`, { name: "Salón" }, s.session.cookie),
    )
    const cocina = await json<{ id: string }>(
      await request("POST", `${s.base}/sets`, { name: "Cocina" }, s.session.cookie),
    )

    for (const set of [salon, cocina]) {
      const response = await request(
        "PUT",
        `${s.base}/sets/${set.id}/items`,
        { itemIds: [silla.id] },
        s.session.cookie,
      )
      expect(response.status).toBe(200)
    }

    for (const set of [salon, cocina]) {
      const detail = await json<{ items: { itemId: string }[] }>(
        await request("GET", `${s.base}/sets/${set.id}`, undefined, s.session.cookie),
      )
      expect(detail.items.map((row) => row.itemId)).toEqual([silla.id])
    }
  })

  it("componer un set establece el conjunto entero, no una suma de altas", async () => {
    const s = await scene()

    const set = await json<{ id: string }>(
      await request("POST", `${s.base}/sets`, { name: "Salón" }, s.session.cookie),
    )
    const [a, b, c] = await Promise.all([
      newItem(s, "Sofá"),
      newItem(s, "Lámpara"),
      newItem(s, "Alfombra"),
    ])

    await request(
      "PUT",
      `${s.base}/sets/${set.id}/items`,
      { itemIds: [a.id, b.id] },
      s.session.cookie,
    )

    const recomposed = await json<{ items: { itemId: string }[]; itemCount: number }>(
      await request(
        "PUT",
        `${s.base}/sets/${set.id}/items`,
        { itemIds: [a.id, c.id] },
        s.session.cookie,
      ),
    )

    expect(recomposed.items.map((row) => row.itemId).sort()).toEqual([a.id, c.id].sort())
    expect(recomposed.itemCount).toBe(2)
  })

  it("eliminar un set no elimina sus artículos", async () => {
    // Escenario: «Eliminar un set no elimina sus artículos» — «siguen existiendo en el inventario
    // de la producción».
    const s = await scene()

    const set = await json<{ id: string }>(
      await request("POST", `${s.base}/sets`, { name: "Salón" }, s.session.cookie),
    )
    const sofa = await newItem(s, "Sofá")
    await request("PUT", `${s.base}/sets/${set.id}/items`, { itemIds: [sofa.id] }, s.session.cookie)

    expect(
      (await request("DELETE", `${s.base}/sets/${set.id}`, undefined, s.session.cookie)).status,
    ).toBe(204)

    // El set ya no está…
    expect(
      (await request("GET", `${s.base}/sets/${set.id}`, undefined, s.session.cookie)).status,
    ).toBe(404)

    // …y el artículo sigue en el inventario, entero.
    const item = await json<{ id: string; name: string }>(
      await request("GET", `${s.base}/items/${sofa.id}`, undefined, s.session.cookie),
    )
    expect(item.name).toBe("Sofá")

    // Y un set dado de baja no aparece como sitio donde se usa el artículo.
    const usage = await json<{ sets: unknown[] }>(
      await request("GET", `${s.base}/items/${sofa.id}/usage`, undefined, s.session.cookie),
    )
    expect(usage.sets).toEqual([])
  })

  it("no admite un artículo de otra producción", async () => {
    const s = await scene()
    const other = await scene()

    const ajeno = await newItem(other, "Silla ajena")
    const set = await json<{ id: string }>(
      await request("POST", `${s.base}/sets`, { name: "Salón" }, s.session.cookie),
    )

    const response = await request(
      "PUT",
      `${s.base}/sets/${set.id}/items`,
      { itemIds: [ajeno.id] },
      s.session.cookie,
    )
    // Que no existe, no que no se puede: distinguirlo confirmaría que existe.
    expect(response.status).toBe(404)
  })
})

// ─── Biblioteca de videos ────────────────────────────────────────────────────

describe("biblioteca de videos", () => {
  it("un video se reproduce sin descargarlo: la ficha trae su dirección", async () => {
    // Escenario: «Se reproduce un video de la biblioteca». Lo que el servidor tiene que dar es la
    // dirección del archivo, que es lo que un reproductor consume por partes. No hay descarga.
    const s = await scene()
    const file = await seedUpload(s.companyId, "video", "prueba-de-vestuario")

    const created = await json<{ id: string; videoUrl: string | null }>(
      await request(
        "POST",
        `${s.base}/videos`,
        { name: "Prueba de vestuario", videoUploadId: file },
        s.session.cookie,
      ),
    )

    expect(created.videoUrl).toContain(`/${file}/`)

    const fetched = await json<{ videoUrl: string | null }>(
      await request("GET", `${s.base}/videos/${created.id}`, undefined, s.session.cookie),
    )
    expect(fetched.videoUrl).toBe(created.videoUrl)
  })

  it("no admite una imagen donde va un video", async () => {
    const s = await scene()
    const foto = await seedUpload(s.companyId, "image", "no-es-un-video")

    const response = await request(
      "POST",
      `${s.base}/videos`,
      { name: "Referencia", videoUploadId: foto },
      s.session.cookie,
    )
    expect(response.status).toBe(404)
  })

  it("eliminar un video retira la utilería que lo señalaba, y la continuidad sobrevive", async () => {
    // Escenario: «La continuidad sobrevive al video» — «la continuidad sigue existiendo AND su
    // referencia a ese video desaparece».
    //
    // La pieza de utilería **se elimina** en lugar de quedarse sin video, y no hay otra opción: la
    // restricción `production_props_item_xor_video` exige artículo o video, nunca ninguno.
    const s = await scene()
    const file = await seedUpload(s.companyId, "video", "como-debia-verse")

    const video = await json<{ id: string }>(
      await request(
        "POST",
        `${s.base}/videos`,
        { name: "Cómo debía verse", videoUploadId: file },
        s.session.cookie,
      ),
    )
    const { continuityId } = await seedRecording(s.productionId)

    // Dos piezas de utilería en la misma continuidad: una apunta al video y otra a un artículo. Al
    // retirar el video tiene que irse una y quedarse la otra.
    const silla = await newItem(s, "Silla")
    await db
      .insert(productionProps)
      .values({ id: newId(), continuityId, videoId: video.id, itemId: null })
    await db
      .insert(productionProps)
      .values({ id: newId(), continuityId, itemId: silla.id, videoId: null })

    const before = await json<{ propCount: number }>(
      await request("GET", `${s.base}/videos/${video.id}`, undefined, s.session.cookie),
    )
    expect(before.propCount).toBe(1)

    expect(
      (await request("DELETE", `${s.base}/videos/${video.id}`, undefined, s.session.cookie)).status,
    ).toBe(204)

    // La continuidad sigue existiendo…
    const [continuity] = await db
      .select()
      .from(productionContinuities)
      .where(eq(productionContinuities.id, continuityId))
    expect(continuity).toBeDefined()

    // …y de su utilería sólo desapareció la que señalaba al video.
    const props = await db
      .select()
      .from(productionProps)
      .where(eq(productionProps.continuityId, continuityId))

    expect(props).toHaveLength(1)
    expect(props[0]?.itemId).toBe(silla.id)
  })
})
