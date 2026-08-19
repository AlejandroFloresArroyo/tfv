/**
 * Continuidad de rodaje, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/continuity-tracking/spec.md`.
 *
 * ## Los personajes y las escenas se siembran a mano, y es a propósito
 *
 * Este módulo cuelga de dos entidades que **otras rebanadas están escribiendo en paralelo**:
 * personajes es de la parte de reparto y escenas de la de desglose. Sus tablas existen desde la
 * `0022`, así que aquí se insertan directamente contra la base en lugar de llamar a rutas que
 * todavía no existen. El día que existan, estas siembras se pueden sustituir por llamadas sin
 * tocar una sola afirmación.
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
  productionChapters,
  productionCharacters,
  productionItems,
  productionScenes,
  productions,
  productionVideos,
  roles,
  services,
  sessions,
  uploads,
  users,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${productions}, ${uploads}, ${services}, ${companies} cascade`,
  )
}

beforeEach(reset)
afterAll(async () => {
  await reset()
  await closeConnection()
})

// ─── Andamiaje ───────────────────────────────────────────────────────────────

interface Session {
  readonly cookie: string
  readonly userId: string
}

interface Recording {
  id: string
  productionId: string
  sceneId: string | null
  name: string
  kind: string
  status: string
  responsibleId: string | null
  continuityCount: number
  createdAt: string
  updatedAt: string
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
  if (!existing) {
    await db.insert(services).values({ id: serviceId, keycode, name: keycode })
  }

  await db
    .insert(companyServices)
    .values({ id: newId(), companyId, serviceId })
    .onConflictDoNothing()
}

/** Una empresa con el servicio de producciones contratado, que es lo que exige crear una. */
async function newCompany(session: Session, name = "Estudios Mariposa") {
  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name }, session.cookie),
  )
  await enableService(company.id, "productions")
  return company
}

async function newProduction(session: Session, companyId: string, name = "Serie Piloto") {
  const response = await request(
    "POST",
    `/companies/${companyId}/productions`,
    { name },
    session.cookie,
  )
  expect(response.status).toBe(201)
  return json<{ id: string }>(response)
}

// ─── Siembra directa de lo que escriben otras rebanadas ──────────────────────

let sown = 0

/** Un capítulo con una escena dentro. Devuelve los dos identificadores. */
async function sowScene(productionId: string, name = "Escena") {
  sown += 1
  const chapterId = newId()
  await db
    .insert(productionChapters)
    .values({ id: chapterId, productionId, name: `Capítulo ${sown}`, index: sown })

  const sceneId = newId()
  await db
    .insert(productionScenes)
    .values({ id: sceneId, chapterId, name: `${name} ${sown}`, index: sown })

  return { chapterId, sceneId }
}

async function sowCharacter(productionId: string, name: string) {
  const id = newId()
  await db.insert(productionCharacters).values({ id, productionId, name })
  return id
}

async function sowItem(productionId: string, name: string) {
  sown += 1
  const id = newId()
  await db
    .insert(productionItems)
    .values({ id, productionId, name, code: `ART-${sown}-${newId().slice(0, 8)}` })
  return id
}

async function sowVideo(productionId: string, name: string) {
  const id = newId()
  await db.insert(productionVideos).values({ id, productionId, name })
  return id
}

// ─── Un escenario completo, montado una vez ──────────────────────────────────

interface Stage {
  session: Session
  companyId: string
  productionId: string
  sceneId: string
  chapterId: string
}

let stages = 0

async function stage(): Promise<Stage> {
  stages += 1
  const session = await signUp(`continuidad-${stages}@ejemplo.mx`)
  const company = await newCompany(session)
  const production = await newProduction(session, company.id)
  const { chapterId, sceneId } = await sowScene(production.id)

  return { session, companyId: company.id, productionId: production.id, sceneId, chapterId }
}

function recordingsPath(s: Stage) {
  return `/companies/${s.companyId}/productions/${s.productionId}/recordings`
}

async function newRecording(s: Stage, body: Record<string, unknown> = {}) {
  const response = await request(
    "POST",
    recordingsPath(s),
    { name: "Jornada 1", sceneId: s.sceneId, ...body },
    s.session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Recording>(response)
}

// ─── Jornadas de rodaje ──────────────────────────────────────────────────────

describe("una jornada de rodaje se programa sobre una escena", () => {
  it("nace en borrador", async () => {
    // Escenario: «Se programa una jornada» y «Una jornada nace en borrador».
    const s = await stage()

    const recording = await newRecording(s, { name: "Interior casa, día" })

    expect(recording.status).toBe("draft")
    expect(recording.kind).toBe("record")
    expect(recording.sceneId).toBe(s.sceneId)
    expect(recording.continuityCount).toBe(0)
  })

  it("una regrabación queda como tal, sin alterar la jornada anterior", async () => {
    // Escenario: «Se distingue una regrabación».
    const s = await stage()
    const first = await newRecording(s, { name: "Toma buena" })

    const again = await newRecording(s, { name: "Se repite", kind: "re_record" })

    expect(again.kind).toBe("re_record")
    expect(again.id).not.toBe(first.id)

    const untouched = await json<Recording>(
      await request("GET", `${recordingsPath(s)}/${first.id}`, undefined, s.session.cookie),
    )
    expect(untouched.kind).toBe("record")
    expect(untouched.status).toBe("draft")
  })

  it("la escena de otra producción no vale", async () => {
    // El modelo no ata la escena a la producción de la jornada: `scene_id` apunta a
    // `production_scenes` y nada comprueba que su capítulo cuelgue de la misma producción
    // (`HALLAZGOS.md` H-188). Sin esta comprobación una jornada podría rodar la escena de otra
    // empresa.
    const s = await stage()
    const other = await newProduction(s.session, s.companyId, "Otra Serie")
    const foreign = await sowScene(other.id)

    // Primero la propia, que es lo que distingue «la escena no vale» de «la ruta no existe»: sin
    // esta línea el caso pasaría en verde contra una API que no tuviera jornadas.
    await newRecording(s, { name: "Jornada legítima" })

    const response = await request(
      "POST",
      recordingsPath(s),
      { name: "Jornada intrusa", sceneId: foreign.sceneId },
      s.session.cookie,
    )

    expect(response.status).toBe(404)
  })

  it("se puede programar sin escena", async () => {
    const s = await stage()

    const recording = await json<Recording>(
      await request("POST", recordingsPath(s), { name: "Sin escena" }, s.session.cookie),
    )

    expect(recording.sceneId).toBeNull()
  })

  it("se lista por producción, y no la de al lado", async () => {
    const s = await stage()
    await newRecording(s, { name: "Mía" })

    const other = await newProduction(s.session, s.companyId, "Otra Serie")
    await request(
      "POST",
      `/companies/${s.companyId}/productions/${other.id}/recordings`,
      { name: "Suya" },
      s.session.cookie,
    )

    const page = await json<{ items: Recording[]; totalItems: number }>(
      await request("GET", recordingsPath(s), undefined, s.session.cookie),
    )

    expect(page.totalItems).toBe(1)
    expect(page.items[0]?.name).toBe("Mía")
  })

  it("se edita el nombre, el tipo y la escena", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const another = await sowScene(s.productionId, "Otra escena")

    const updated = await json<Recording>(
      await request(
        "PATCH",
        `${recordingsPath(s)}/${recording.id}`,
        { name: "Renombrada", kind: "re_record", sceneId: another.sceneId },
        s.session.cookie,
      ),
    )

    expect(updated.name).toBe("Renombrada")
    expect(updated.kind).toBe("re_record")
    expect(updated.sceneId).toBe(another.sceneId)
  })

  it("la jornada de otra empresa no existe", async () => {
    const s = await stage()
    const recording = await newRecording(s)

    const stranger = await signUp("ajena-jornada@ejemplo.mx")
    const response = await request(
      "GET",
      `/companies/${s.companyId}/productions/${s.productionId}/recordings/${recording.id}`,
      undefined,
      stranger.cookie,
    )

    expect(response.status).toBe(404)
  })
})

describe("cerrar una jornada", () => {
  it("no exige tener la continuidad completa", async () => {
    // **Decisión escrita a propósito.** La spec le pone candado a la nota de entrega —«cerrar una
    // nota exige verificarlo todo»— y deliberadamente **no** se lo pone a la jornada. El día de
    // rodaje se acaba cuando se acaba: si a las nueve de la noche falta por registrar la utilería
    // de dos personajes, la jornada se cierra igual y lo que falte se completa al día siguiente.
    // Éste es justo el sitio donde alguien añadiría una validación «obvia» que rompería el oficio.
    const s = await stage()
    const recording = await newRecording(s)

    const closed = await json<Recording>(
      await request("POST", `${recordingsPath(s)}/${recording.id}/close`, {}, s.session.cookie),
    )

    expect(closed.status).toBe("completed")
    expect(closed.continuityCount).toBe(0)
  })

  it("volver a abrirla la deja en curso", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    await request("POST", `${recordingsPath(s)}/${recording.id}/close`, {}, s.session.cookie)

    const reopened = await json<Recording>(
      await request("POST", `${recordingsPath(s)}/${recording.id}/open`, {}, s.session.cookie),
    )

    expect(reopened.status).toBe("ongoing")
  })
})

// Las siembras que todavía no usa ningún caso quedan referenciadas para que el análisis no las dé
// por muertas mientras se construyen los incrementos que las estrenan.
void sowCharacter
void sowItem
void sowVideo
