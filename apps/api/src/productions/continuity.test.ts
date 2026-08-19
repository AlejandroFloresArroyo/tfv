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
  productionChapters,
  productionCharacters,
  productionItems,
  productionProps,
  productionRecordingNotes,
  productionScenes,
  productions,
  productionVideos,
  roles,
  services,
  sessions,
  uploads,
  users,
} from "@tfv/db/schema"
import { and, eq, isNull, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${productions}, ${uploads}, ${services}, ${companies} cascade`,
  )
}

/**
 * Un servidor de verdad, en un puerto que pide el sistema operativo.
 *
 * El recorrido completo del final del archivo no llama al manejador ni a `app.request`: abre un
 * socket y habla HTTP contra él. Es la diferencia entre «el código hace lo que dice» y «esto
 * funciona»: por aquí pasan el enrutado, los guardianes, la validación del cuerpo, la negociación
 * de la cookie y la serialización, que es donde se esconden los fallos que ninguna prueba de
 * unidad ve.
 *
 * Puerto `0`, así que nunca es el 3000 ni el 5000 de nadie.
 */
let server: ReturnType<typeof serve>
let origin = ""

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

interface Prop {
  id: string
  continuityId: string
  kind: "item" | "video"
  itemId: string | null
  videoId: string | null
  name: string
  code: string | null
  createdAt: string
}

interface Continuity {
  id: string
  recordingId: string
  characterId: string | null
  characterName: string | null
  responsibleId: string | null
  props: Prop[]
  createdAt: string
  updatedAt: string
}

interface Note {
  id: string
  recordingId: string
  body: string
  authorId: string | null
  authorName: string | null
  createdAt: string
  updatedAt: string
}

interface SceneRef {
  id: string
  name: string
  index: number
  chapter: { id: string; name: string; index: number }
}

interface RecordingDetail extends Recording {
  scene: SceneRef | null
  continuities: Continuity[]
  notes: Note[]
}

interface CharacterHistory {
  characterId: string
  characterName: string
  recordings: {
    recordingId: string
    recordingName: string
    kind: string
    status: string
    sceneId: string | null
    sceneName: string | null
    chapterName: string | null
    continuityId: string
    props: Prop[]
  }[]
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

async function recordingOf(s: Stage, recordingId: string) {
  const response = await request(
    "GET",
    `${recordingsPath(s)}/${recordingId}`,
    undefined,
    s.session.cookie,
  )
  expect(response.status).toBe(200)
  return json<RecordingDetail>(response)
}

async function assignCharacters(s: Stage, recordingId: string, characterIds: string[]) {
  const response = await request(
    "POST",
    `${recordingsPath(s)}/${recordingId}/characters`,
    { characterIds },
    s.session.cookie,
  )
  expect(response.status).toBe(200)
  return json<RecordingDetail>(response)
}

function continuityPath(s: Stage, recordingId: string, continuityId: string) {
  return `${recordingsPath(s)}/${recordingId}/continuities/${continuityId}`
}

async function newContinuity(s: Stage, recordingId: string, body: Record<string, unknown> = {}) {
  const response = await request(
    "POST",
    `${recordingsPath(s)}/${recordingId}/continuities`,
    body,
    s.session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Continuity>(response)
}

async function addItem(s: Stage, recordingId: string, continuityId: string, itemId: string) {
  const response = await request(
    "POST",
    `${continuityPath(s, recordingId, continuityId)}/items`,
    { itemId },
    s.session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Prop>(response)
}

async function addVideo(s: Stage, recordingId: string, continuityId: string, videoId: string) {
  const response = await request(
    "POST",
    `${continuityPath(s, recordingId, continuityId)}/videos`,
    { videoId },
    s.session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Prop>(response)
}

async function setItems(
  s: Stage,
  recordingId: string,
  continuityId: string,
  itemIds: string[],
): Promise<Prop[]> {
  const response = await request(
    "PUT",
    `${continuityPath(s, recordingId, continuityId)}/items`,
    { itemIds },
    s.session.cookie,
  )
  expect(response.status).toBe(200)
  return (await json<Continuity>(response)).props
}

async function setVideos(
  s: Stage,
  recordingId: string,
  continuityId: string,
  videoIds: string[],
): Promise<Prop[]> {
  const response = await request(
    "PUT",
    `${continuityPath(s, recordingId, continuityId)}/videos`,
    { videoIds },
    s.session.cookie,
  )
  expect(response.status).toBe(200)
  return (await json<Continuity>(response)).props
}

async function characterContinuity(s: Stage, characterId: string) {
  const response = await request(
    "GET",
    `/companies/${s.companyId}/productions/${s.productionId}/characters/${characterId}/continuity`,
    undefined,
    s.session.cookie,
  )
  expect(response.status).toBe(200)
  return json<CharacterHistory>(response)
}

async function newNote(s: Stage, recordingId: string, body: string) {
  const response = await request(
    "POST",
    `${recordingsPath(s)}/${recordingId}/notes`,
    { body },
    s.session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Note>(response)
}

/**
 * Qué restricción del motor rechazó la escritura.
 *
 * El mensaje que envuelve el cliente sólo trae la consulta; el nombre de la restricción viene en la
 * causa. Afirmarlo **por nombre** es lo que distingue «el motor lo impidió» de «falló algo»: una
 * prueba que sólo mirase que hubo error pasaría igual con la columna mal escrita.
 */
async function rejectedBy(work: Promise<unknown>): Promise<string> {
  try {
    await work
  } catch (error) {
    const cause = (error as { cause?: { constraint_name?: string } }).cause
    return cause?.constraint_name ?? "sin restricción"
  }
  return "no falló"
}

/** Recuentos directos: lo que sobrevive a una eliminación se comprueba en la base, no en la API. */
async function countProps(continuityId: string) {
  const rows = await db
    .select({ id: productionProps.id })
    .from(productionProps)
    .where(eq(productionProps.continuityId, continuityId))
  return rows.length
}

async function countItems(productionId: string) {
  const rows = await db
    .select({ id: productionItems.id })
    .from(productionItems)
    .where(and(eq(productionItems.productionId, productionId), isNull(productionItems.deletedAt)))
  return rows.length
}

async function countVideos(productionId: string) {
  const rows = await db
    .select({ id: productionVideos.id })
    .from(productionVideos)
    .where(and(eq(productionVideos.productionId, productionId), isNull(productionVideos.deletedAt)))
  return rows.length
}

let scopedAccounts = 0

/** Una cuenta de la misma empresa con un rol acotado a las claves que se le pasen. */
async function memberWith(companyId: string, permissions: string[]): Promise<string> {
  scopedAccounts += 1
  const email = `acotada-continuidad-${scopedAccounts}@ejemplo.mx`
  await request("POST", "/auth/register", { email, password: PASSWORD, name: "Acotada" })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  const roleId = newId()
  await db
    .insert(roles)
    .values({ id: roleId, companyId, name: `Rol acotado ${scopedAccounts}`, permissions })
  await db
    .insert(companyMembers)
    .values({ id: newId(), companyId, userId: user?.id ?? "", roleId, isOwner: false })

  const login = await request("POST", "/auth/login", { email, password: PASSWORD })
  return (
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""
  )
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

// ─── Asignar el reparto ──────────────────────────────────────────────────────

describe("asignar personajes abre la jornada", () => {
  it("asignar el reparto crea una continuidad por personaje y la pone en curso", async () => {
    // Escenario: «Asignar el reparto crea las continuidades».
    const s = await stage()
    const recording = await newRecording(s)
    const cast = await Promise.all(
      ["Marta", "Julián", "La vecina", "El perro"].map((name) =>
        sowCharacter(s.productionId, name),
      ),
    )

    const opened = await assignCharacters(s, recording.id, cast)

    expect(opened.status).toBe("ongoing")
    expect(opened.continuities).toHaveLength(4)
    expect(opened.continuities.map((row) => row.characterId).sort()).toEqual([...cast].sort())
    expect(opened.continuities.map((row) => row.characterName).sort()).toEqual([
      "El perro",
      "Julián",
      "La vecina",
      "Marta",
    ])
  })

  it("volver a asignar un personaje ya asignado no crea una segunda continuidad", async () => {
    // Escenario: «No se duplica un personaje ya asignado». El motor no lo impide —no hay único
    // parcial sobre `(recording_id, character_id)`, y no puede haberlo a secas porque la columna
    // admite nulo a propósito—, así que lo sostiene la resta del módulo (`HALLAZGOS.md` H-184).
    const s = await stage()
    const recording = await newRecording(s)
    const cast = await Promise.all(
      ["Marta", "Julián", "La vecina", "El perro"].map((name) =>
        sowCharacter(s.productionId, name),
      ),
    )
    await assignCharacters(s, recording.id, cast)

    const again = await assignCharacters(s, recording.id, [cast[0] as string])

    expect(again.continuities).toHaveLength(4)
    expect(again.continuityCount).toBe(4)
  })

  it("de una asignación mezclada sólo entra lo que faltaba", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const marta = await sowCharacter(s.productionId, "Marta")
    const julian = await sowCharacter(s.productionId, "Julián")
    await assignCharacters(s, recording.id, [marta, julian])

    const nuevo = await sowCharacter(s.productionId, "El repartidor")
    const mixed = await assignCharacters(s, recording.id, [marta, nuevo])

    expect(mixed.continuities).toHaveLength(3)
    expect(mixed.continuities.filter((row) => row.characterId === marta)).toHaveLength(1)
  })

  it("el personaje de otra producción no se asigna", async () => {
    // Misma familia que la escena: el modelo no ata el personaje a la producción de la jornada
    // (`HALLAZGOS.md` H-188).
    const s = await stage()
    const recording = await newRecording(s)
    const own = await sowCharacter(s.productionId, "Marta")
    const other = await newProduction(s.session, s.companyId, "Otra Serie")
    const foreign = await sowCharacter(other.id, "Ajeno")

    // La propia primero: distingue «el personaje no vale» de «la ruta no existe».
    await assignCharacters(s, recording.id, [own])

    const response = await request(
      "POST",
      `${recordingsPath(s)}/${recording.id}/characters`,
      { characterIds: [foreign] },
      s.session.cookie,
    )

    expect(response.status).toBe(404)

    const after = await recordingOf(s, recording.id)
    expect(after.continuities).toHaveLength(1)
  })

  it("una cuenta sin la clave de reparto no asigna", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const marta = await sowCharacter(s.productionId, "Marta")
    const cookie = await memberWith(s.companyId, [
      "productions.productions.view",
      "productions.recordings.view",
    ])

    const response = await request(
      "POST",
      `${recordingsPath(s)}/${recording.id}/characters`,
      { characterIds: [marta] },
      cookie,
    )

    expect(response.status).toBe(403)
  })
})

// ─── La continuidad de un personaje dentro de la jornada ─────────────────────

describe("una continuidad por personaje y jornada", () => {
  it("puede nacer sin personaje, para lo que no es de nadie en concreto", async () => {
    // «Una continuidad SHALL poder quedarse sin personaje asignado, para registrar elementos que
    // no corresponden a ninguno en concreto.»
    const s = await stage()
    const recording = await newRecording(s)

    const continuity = await json<Continuity>(
      await request(
        "POST",
        `${recordingsPath(s)}/${recording.id}/continuities`,
        {},
        s.session.cookie,
      ),
    )

    expect(continuity.characterId).toBeNull()
    expect(continuity.characterName).toBeNull()
  })

  it("se le retira el personaje y sigue existiendo", async () => {
    // Escenario: «Se retira el personaje de una continuidad».
    const s = await stage()
    const recording = await newRecording(s)
    const marta = await sowCharacter(s.productionId, "Marta")
    const [continuity] = (await assignCharacters(s, recording.id, [marta])).continuities

    const stripped = await json<Continuity>(
      await request(
        "PUT",
        `${recordingsPath(s)}/${recording.id}/continuities/${continuity?.id}/character`,
        { characterId: null },
        s.session.cookie,
      ),
    )

    expect(stripped.id).toBe(continuity?.id)
    expect(stripped.characterId).toBeNull()

    const after = await recordingOf(s, recording.id)
    expect(after.continuities).toHaveLength(1)
  })

  it("se le pone un personaje distinto", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const marta = await sowCharacter(s.productionId, "Marta")
    const julian = await sowCharacter(s.productionId, "Julián")
    const [continuity] = (await assignCharacters(s, recording.id, [marta])).continuities

    const moved = await json<Continuity>(
      await request(
        "PUT",
        `${recordingsPath(s)}/${recording.id}/continuities/${continuity?.id}/character`,
        { characterId: julian },
        s.session.cookie,
      ),
    )

    expect(moved.characterId).toBe(julian)
    expect(moved.characterName).toBe("Julián")
  })

  it("la continuidad de otra jornada no se alcanza desde ésta", async () => {
    const s = await stage()
    const mine = await newRecording(s, { name: "La mía" })
    const other = await newRecording(s, { name: "La otra" })
    const marta = await sowCharacter(s.productionId, "Marta")
    const [continuity] = (await assignCharacters(s, other.id, [marta])).continuities

    const response = await request(
      "PUT",
      `${recordingsPath(s)}/${mine.id}/continuities/${continuity?.id}/character`,
      { characterId: null },
      s.session.cookie,
    )

    expect(response.status).toBe(404)
  })

  it("se elimina y desaparece de la jornada", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const marta = await sowCharacter(s.productionId, "Marta")
    const julian = await sowCharacter(s.productionId, "Julián")
    const opened = await assignCharacters(s, recording.id, [marta, julian])
    const victim = opened.continuities.find((row) => row.characterId === marta)

    const response = await request(
      "DELETE",
      `${recordingsPath(s)}/${recording.id}/continuities/${victim?.id}`,
      undefined,
      s.session.cookie,
    )
    expect(response.status).toBe(204)

    const after = await recordingOf(s, recording.id)
    expect(after.continuities).toHaveLength(1)
    expect(after.continuities[0]?.characterId).toBe(julian)
  })
})

// ─── La utilería es artículo o video, nunca ambos ni ninguno ─────────────────

describe("una pieza de utilería es artículo o video", () => {
  it("el motor rechaza una pieza que referencie las dos cosas", async () => {
    // Escenario: «No se admiten ambas referencias». Se prueba **contra el motor** y no contra la
    // API a propósito: por la API no hay forma de pedirlo —hay un camino por tipo, y ninguno
    // acepta el otro—, así que el único sitio donde este caso existe es la restricción de
    // comprobación `production_props_item_xor_video`. Es la capa más baja, y es la que se afirma.
    const s = await stage()
    const recording = await newRecording(s)
    const continuity = await newContinuity(s, recording.id)
    const itemId = await sowItem(s.productionId, "Chaqueta")
    const videoId = await sowVideo(s.productionId, "Referencia")

    const constraint = await rejectedBy(
      db
        .insert(productionProps)
        .values({ id: newId(), continuityId: continuity.id, itemId, videoId }),
    )

    expect(constraint).toBe("production_props_item_xor_video")
  })

  it("el motor rechaza una pieza que no referencie nada", async () => {
    // Escenario: «No se admite una pieza vacía». Misma capa, el otro lado de la exclusión.
    const s = await stage()
    const recording = await newRecording(s)
    const continuity = await newContinuity(s, recording.id)

    const constraint = await rejectedBy(
      db.insert(productionProps).values({ id: newId(), continuityId: continuity.id }),
    )

    expect(constraint).toBe("production_props_item_xor_video")
  })

  it("una pieza con un solo lado sí entra, que es lo que hace significativos los dos rechazos", async () => {
    // El control del par anterior: sin esto, los dos casos de arriba pasarían igual si **toda**
    // inserción en la tabla fallara.
    const s = await stage()
    const recording = await newRecording(s)
    const continuity = await newContinuity(s, recording.id)
    const itemId = await sowItem(s.productionId, "Chaqueta")

    const constraint = await rejectedBy(
      db.insert(productionProps).values({ id: newId(), continuityId: continuity.id, itemId }),
    )

    expect(constraint).toBe("no falló")
  })

  it("un artículo solo se cuelga y se ve resuelto", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const continuity = await newContinuity(s, recording.id)
    const itemId = await sowItem(s.productionId, "Chaqueta de mezclilla")

    const prop = await json<Prop>(
      await request(
        "POST",
        `${continuityPath(s, recording.id, continuity.id)}/items`,
        { itemId },
        s.session.cookie,
      ),
    )

    expect(prop.kind).toBe("item")
    expect(prop.itemId).toBe(itemId)
    expect(prop.videoId).toBeNull()
    expect(prop.name).toBe("Chaqueta de mezclilla")
    expect(prop.code).not.toBeNull()
  })

  it("un video solo se cuelga y se ve resuelto", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const continuity = await newContinuity(s, recording.id)
    const videoId = await sowVideo(s.productionId, "Cómo debía verse")

    const prop = await json<Prop>(
      await request(
        "POST",
        `${continuityPath(s, recording.id, continuity.id)}/videos`,
        { videoId },
        s.session.cookie,
      ),
    )

    expect(prop.kind).toBe("video")
    expect(prop.videoId).toBe(videoId)
    expect(prop.itemId).toBeNull()
    expect(prop.name).toBe("Cómo debía verse")
    expect(prop.code).toBeNull()
  })

  it("el artículo de otra producción no se cuelga", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const continuity = await newContinuity(s, recording.id)
    const other = await newProduction(s.session, s.companyId, "Otra Serie")
    const foreign = await sowItem(other.id, "Ajeno")

    // La propia primero: distingue «el artículo no vale» de «la ruta no existe».
    await addItem(s, recording.id, continuity.id, await sowItem(s.productionId, "Propio"))

    const response = await request(
      "POST",
      `${continuityPath(s, recording.id, continuity.id)}/items`,
      { itemId: foreign },
      s.session.cookie,
    )

    expect(response.status).toBe(404)
  })

  it("el video de otra producción no se cuelga", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const continuity = await newContinuity(s, recording.id)
    const other = await newProduction(s.session, s.companyId, "Otra Serie")
    const foreign = await sowVideo(other.id, "Ajeno")

    await addVideo(s, recording.id, continuity.id, await sowVideo(s.productionId, "Propio"))

    const response = await request(
      "POST",
      `${continuityPath(s, recording.id, continuity.id)}/videos`,
      { videoId: foreign },
      s.session.cookie,
    )

    expect(response.status).toBe(404)
  })
})

// ─── Reconciliación ──────────────────────────────────────────────────────────

describe("se establece de una vez el conjunto de artículos", () => {
  it("crea lo que falta, quita lo que sobra y no toca los videos", async () => {
    // Escenario: «Se establece el conjunto de artículos».
    const s = await stage()
    const recording = await newRecording(s)
    const continuity = await newContinuity(s, recording.id)

    const a = await sowItem(s.productionId, "A")
    const b = await sowItem(s.productionId, "B")
    const c = await sowItem(s.productionId, "C")
    const d = await sowItem(s.productionId, "D")
    const video = await sowVideo(s.productionId, "Referencia")

    await setItems(s, recording.id, continuity.id, [a, b, c])
    await addVideo(s, recording.id, continuity.id, video)

    const props = await setItems(s, recording.id, continuity.id, [a, d])

    const items = props.filter((row) => row.kind === "item").map((row) => row.itemId)
    expect(items.sort()).toEqual([a, d].sort())
    expect(items).not.toContain(b)
    expect(items).not.toContain(c)

    const videos = props.filter((row) => row.kind === "video").map((row) => row.videoId)
    expect(videos).toEqual([video])
  })

  it("el conjunto vacío deja la continuidad sin artículos y con sus videos", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const continuity = await newContinuity(s, recording.id)
    const a = await sowItem(s.productionId, "A")
    const video = await sowVideo(s.productionId, "Referencia")
    await setItems(s, recording.id, continuity.id, [a])
    await addVideo(s, recording.id, continuity.id, video)

    const props = await setItems(s, recording.id, continuity.id, [])

    expect(props.filter((row) => row.kind === "item")).toHaveLength(0)
    expect(props.filter((row) => row.kind === "video")).toHaveLength(1)
  })
})

describe("se establece de una vez el conjunto de videos", () => {
  it("deja un video y no toca los tres artículos", async () => {
    // Escenario: «Se establece el conjunto de videos».
    const s = await stage()
    const recording = await newRecording(s)
    const continuity = await newContinuity(s, recording.id)

    const items = await Promise.all(["A", "B", "C"].map((name) => sowItem(s.productionId, name)))
    const uno = await sowVideo(s.productionId, "Uno")
    const dos = await sowVideo(s.productionId, "Dos")

    await setItems(s, recording.id, continuity.id, items)
    await setVideos(s, recording.id, continuity.id, [uno, dos])

    const props = await setVideos(s, recording.id, continuity.id, [uno])

    expect(props.filter((row) => row.kind === "video").map((row) => row.videoId)).toEqual([uno])
    expect(
      props
        .filter((row) => row.kind === "item")
        .map((row) => row.itemId)
        .sort(),
    ).toEqual([...items].sort())
  })

  it("una cuenta con la clave de artículos no reconcilia videos", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const continuity = await newContinuity(s, recording.id)
    const video = await sowVideo(s.productionId, "Referencia")
    const cookie = await memberWith(s.companyId, [
      "productions.productions.view",
      "productions.recordings.view",
      "productions.continuities.view",
      "productions.continuities.products",
    ])

    const items = await request(
      "PUT",
      `${continuityPath(s, recording.id, continuity.id)}/items`,
      { itemIds: [] },
      cookie,
    )
    expect(items.status).toBe(200)

    const videos = await request(
      "PUT",
      `${continuityPath(s, recording.id, continuity.id)}/videos`,
      { videoIds: [video] },
      cookie,
    )
    expect(videos.status).toBe(403)
  })
})

// ─── Lo que sobrevive a cada eliminación ─────────────────────────────────────

describe("eliminar no se lleva lo referenciado", () => {
  it("retirar el personaje conserva la utilería", async () => {
    // Segunda mitad del escenario «Se retira el personaje de una continuidad»: «conserva su
    // utilería».
    const s = await stage()
    const recording = await newRecording(s)
    const marta = await sowCharacter(s.productionId, "Marta")
    const [continuity] = (await assignCharacters(s, recording.id, [marta])).continuities
    const item = await sowItem(s.productionId, "Chaqueta")
    const video = await sowVideo(s.productionId, "Referencia")
    await addItem(s, recording.id, continuity?.id as string, item)
    await addVideo(s, recording.id, continuity?.id as string, video)

    await request(
      "PUT",
      `${continuityPath(s, recording.id, continuity?.id as string)}/character`,
      { characterId: null },
      s.session.cookie,
    )

    const after = await recordingOf(s, recording.id)
    expect(after.continuities[0]?.characterId).toBeNull()
    expect(after.continuities[0]?.props).toHaveLength(2)
  })

  it("eliminar la continuidad elimina su utilería y deja los artículos en el inventario", async () => {
    // Escenario: «Los artículos sobreviven a la continuidad».
    const s = await stage()
    const recording = await newRecording(s)
    const continuity = await newContinuity(s, recording.id)
    const items = await Promise.all(
      ["A", "B", "C", "D"].map((name) => sowItem(s.productionId, name)),
    )
    await setItems(s, recording.id, continuity.id, items)

    const response = await request(
      "DELETE",
      continuityPath(s, recording.id, continuity.id),
      undefined,
      s.session.cookie,
    )
    expect(response.status).toBe(204)

    expect(await countProps(continuity.id)).toBe(0)
    expect(await countItems(s.productionId)).toBe(4)
  })

  it("eliminar la jornada arrastra sus continuidades y deja artículos y videos", async () => {
    // Escenario: «La eliminación arrastra las continuidades».
    const s = await stage()
    const recording = await newRecording(s)
    const cast = await Promise.all(
      ["Marta", "Julián", "La vecina", "El perro"].map((name) =>
        sowCharacter(s.productionId, name),
      ),
    )
    const opened = await assignCharacters(s, recording.id, cast)
    const item = await sowItem(s.productionId, "Chaqueta")
    const video = await sowVideo(s.productionId, "Referencia")
    await addItem(s, recording.id, opened.continuities[0]?.id as string, item)
    await addVideo(s, recording.id, opened.continuities[0]?.id as string, video)

    const response = await request(
      "DELETE",
      `${recordingsPath(s)}/${recording.id}`,
      undefined,
      s.session.cookie,
    )
    expect(response.status).toBe(204)

    // La jornada deja de existir por todas las vías por las que se llega a ella, y con ella sus
    // cuatro continuidades. La baja es lógica —el modelo le da columna a la jornada y no a la
    // continuidad—, así que lo que se afirma es lo que se observa (`HALLAZGOS.md` H-187).
    const gone = await request(
      "GET",
      `${recordingsPath(s)}/${recording.id}`,
      undefined,
      s.session.cookie,
    )
    expect(gone.status).toBe(404)

    const page = await json<{ items: Recording[]; totalItems: number }>(
      await request("GET", recordingsPath(s), undefined, s.session.cookie),
    )
    expect(page.totalItems).toBe(0)

    expect(await countItems(s.productionId)).toBe(1)
    expect(await countVideos(s.productionId)).toBe(1)
  })
})

// ─── El cuaderno del script ──────────────────────────────────────────────────

describe("notas de la jornada", () => {
  it("una observación queda registrada con su autor y su instante", async () => {
    // Escenario: «Se registra una observación durante el rodaje».
    const s = await stage()
    const recording = await newRecording(s)

    const note = await newNote(s, recording.id, "La taza estaba a la izquierda del plato")

    expect(note.body).toBe("La taza estaba a la izquierda del plato")
    expect(note.authorId).toBe(s.session.userId)
    expect(note.authorName).not.toBeNull()
    expect(Number.isNaN(Date.parse(note.createdAt))).toBe(false)
  })

  it("las notas se leen desde la jornada, en el orden en que se escribieron", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    await newNote(s, recording.id, "Primera")
    await newNote(s, recording.id, "Segunda")

    const detail = await recordingOf(s, recording.id)

    expect(detail.notes.map((row) => row.body)).toEqual(["Primera", "Segunda"])
  })

  it("se edita, y la marca de edición avanza sobre la de alta", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const note = await newNote(s, recording.id, "Sin revisar")

    // Se retrocede la fila a mano en vez de confiar en que el reloj avance: alta y edición pueden
    // caer en el mismo milisegundo, y entonces la comparación pasaría por la razón equivocada.
    const before = new Date(Date.now() - 60_000)
    await db
      .update(productionRecordingNotes)
      .set({ createdAt: before, updatedAt: before })
      .where(eq(productionRecordingNotes.id, note.id))

    const edited = await json<Note>(
      await request(
        "PATCH",
        `${recordingsPath(s)}/${recording.id}/notes/${note.id}`,
        { body: "Revisada: la taza cambió de sitio entre tomas" },
        s.session.cookie,
      ),
    )

    expect(edited.body).toBe("Revisada: la taza cambió de sitio entre tomas")
    expect(Date.parse(edited.updatedAt)).toBeGreaterThan(Date.parse(edited.createdAt))
  })

  it("se elimina y deja de leerse", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const uno = await newNote(s, recording.id, "Se queda")
    const dos = await newNote(s, recording.id, "Se va")

    const response = await request(
      "DELETE",
      `${recordingsPath(s)}/${recording.id}/notes/${dos.id}`,
      undefined,
      s.session.cookie,
    )
    expect(response.status).toBe(204)

    const detail = await recordingOf(s, recording.id)
    expect(detail.notes.map((row) => row.id)).toEqual([uno.id])
  })

  it("la nota de otra jornada no se alcanza desde ésta", async () => {
    const s = await stage()
    const mine = await newRecording(s, { name: "La mía" })
    const other = await newRecording(s, { name: "La otra" })
    const note = await newNote(s, other.id, "De la otra")

    const response = await request(
      "PATCH",
      `${recordingsPath(s)}/${mine.id}/notes/${note.id}`,
      { body: "Intrusa" },
      s.session.cookie,
    )

    expect(response.status).toBe(404)
  })

  it("una cuenta que puede ver la jornada no puede anotarla", async () => {
    const s = await stage()
    const recording = await newRecording(s)
    const cookie = await memberWith(s.companyId, [
      "productions.productions.view",
      "productions.recordings.view",
    ])

    const response = await request(
      "POST",
      `${recordingsPath(s)}/${recording.id}/notes`,
      { body: "No debería entrar" },
      cookie,
    )

    expect(response.status).toBe(403)
  })
})

// ─── La jornada, de una sola vez ─────────────────────────────────────────────

describe("vista completa de una jornada", () => {
  it("enseña a qué escena y capítulo corresponde, y sus personajes con su utilería", async () => {
    // Escenario: «La jornada se consulta de una vez».
    const s = await stage()
    const recording = await newRecording(s)
    const marta = await sowCharacter(s.productionId, "Marta")
    const [continuity] = (await assignCharacters(s, recording.id, [marta])).continuities
    const item = await sowItem(s.productionId, "Chaqueta de mezclilla")
    const video = await sowVideo(s.productionId, "Referencia del piloto")
    await addItem(s, recording.id, continuity?.id as string, item)
    await addVideo(s, recording.id, continuity?.id as string, video)

    const detail = await recordingOf(s, recording.id)

    expect(detail.scene?.id).toBe(s.sceneId)
    expect(detail.scene?.name).toContain("Escena")
    expect(detail.scene?.chapter.id).toBe(s.chapterId)
    expect(detail.scene?.chapter.name).toContain("Capítulo")

    expect(detail.continuities).toHaveLength(1)
    expect(detail.continuities[0]?.characterName).toBe("Marta")
    expect(detail.continuities[0]?.props.map((row) => row.name).sort()).toEqual([
      "Chaqueta de mezclilla",
      "Referencia del piloto",
    ])
  })

  it("una jornada sin escena lo dice, en vez de callarse", async () => {
    const s = await stage()
    const recording = await json<Recording>(
      await request("POST", recordingsPath(s), { name: "Sin escena" }, s.session.cookie),
    )

    const detail = await recordingOf(s, recording.id)

    expect(detail.scene).toBeNull()
  })
})

// ─── Cómo apareció un personaje a lo largo del rodaje ────────────────────────

describe("consulta de la continuidad de un personaje", () => {
  it("devuelve las cinco jornadas con la utilería registrada en cada una", async () => {
    // Escenario: «Se revisa el historial de un personaje».
    const s = await stage()
    const marta = await sowCharacter(s.productionId, "Marta")
    const item = await sowItem(s.productionId, "Chaqueta de mezclilla")

    for (const number of [1, 2, 3, 4, 5]) {
      const recording = await newRecording(s, { name: `Jornada ${number}` })
      const [continuity] = (await assignCharacters(s, recording.id, [marta])).continuities
      await addItem(s, recording.id, continuity?.id as string, item)
    }

    const history = await characterContinuity(s, marta)

    expect(history.characterName).toBe("Marta")
    expect(history.recordings).toHaveLength(5)
    expect(history.recordings.map((row) => row.recordingName).sort()).toEqual([
      "Jornada 1",
      "Jornada 2",
      "Jornada 3",
      "Jornada 4",
      "Jornada 5",
    ])
    for (const entry of history.recordings) {
      expect(entry.props.map((row) => row.name)).toEqual(["Chaqueta de mezclilla"])
      expect(entry.sceneId).toBe(s.sceneId)
    }
  })

  it("no cuenta las jornadas de otro personaje", async () => {
    const s = await stage()
    const marta = await sowCharacter(s.productionId, "Marta")
    const julian = await sowCharacter(s.productionId, "Julián")
    const compartida = await newRecording(s, { name: "Compartida" })
    await assignCharacters(s, compartida.id, [marta, julian])
    const suya = await newRecording(s, { name: "Sólo de Julián" })
    await assignCharacters(s, suya.id, [julian])

    const history = await characterContinuity(s, marta)

    expect(history.recordings.map((row) => row.recordingName)).toEqual(["Compartida"])
  })

  it("una jornada dada de baja deja de figurar en el historial", async () => {
    // Consecuencia de que la baja de la jornada sea lógica y la de la continuidad física
    // (`HALLAZGOS.md` H-187): la continuidad sobrevive en su tabla, así que **esta** consulta tiene
    // que filtrar por la jornada. Sin el filtro, el historial enseñaría una jornada que ya no está.
    const s = await stage()
    const marta = await sowCharacter(s.productionId, "Marta")
    const viva = await newRecording(s, { name: "Viva" })
    const muerta = await newRecording(s, { name: "Dada de baja" })
    await assignCharacters(s, viva.id, [marta])
    await assignCharacters(s, muerta.id, [marta])

    await request("DELETE", `${recordingsPath(s)}/${muerta.id}`, undefined, s.session.cookie)

    const history = await characterContinuity(s, marta)

    expect(history.recordings.map((row) => row.recordingName)).toEqual(["Viva"])
  })

  it("el personaje de otra producción no tiene historial aquí", async () => {
    const s = await stage()
    const own = await sowCharacter(s.productionId, "Marta")
    const other = await newProduction(s.session, s.companyId, "Otra Serie")
    const foreign = await sowCharacter(other.id, "Ajena")

    // La propia primero: distingue «el personaje no vale» de «la ruta no existe».
    await characterContinuity(s, own)

    const response = await request(
      "GET",
      `/companies/${s.companyId}/productions/${s.productionId}/characters/${foreign}/continuity`,
      undefined,
      s.session.cookie,
    )

    expect(response.status).toBe(404)
  })
})

// ─── El bloque entero, contra un servidor de verdad ──────────────────────────

/** Una petición por HTTP, contra el socket. Nada de `app.request` aquí. */
async function over(method: string, path: string, body?: unknown, cookie?: string) {
  return fetch(`${origin}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

describe("el día de rodaje, de principio a fin y por la red", () => {
  it("se programa, se reparte, se anota, se viste y se consulta", async () => {
    // No es la suma de las pruebas de arriba: es el orden en el que ocurren. Cada paso usa lo que
    // devolvió el anterior, así que un contrato que no encaje entre dos rutas cae aquí y en ningún
    // otro sitio.
    const email = `rodaje-completo@ejemplo.mx`
    await over("POST", "/auth/register", { email, password: PASSWORD, name: "Script" })
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

    const login = await over("POST", "/auth/login", { email, password: PASSWORD })
    const cookie = login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0]
    expect(cookie).toBeDefined()

    const company = (await (
      await over("POST", "/companies", { name: "Rodaje SA" }, cookie)
    ).json()) as {
      id: string
    }
    await enableService(company.id, "productions")

    const production = (await (
      await over("POST", `/companies/${company.id}/productions`, { name: "La Casa" }, cookie)
    ).json()) as { id: string }

    // Escena y personajes: los escriben otras rebanadas, así que se siembran.
    const { chapterId, sceneId } = await sowScene(production.id, "Interior cocina")
    const cast = await Promise.all(
      ["Marta", "Julián", "La vecina", "El perro"].map((name) => sowCharacter(production.id, name)),
    )

    const base = `/companies/${company.id}/productions/${production.id}/recordings`

    // 1. Nace en borrador.
    const created = await over("POST", base, { name: "Jornada 1", sceneId }, cookie)
    expect(created.status).toBe(201)
    const recording = (await created.json()) as Recording
    expect(recording.status).toBe("draft")

    // 2. Se le asigna reparto de cuatro y pasa a en curso.
    const opened = await over(
      `POST`,
      `${base}/${recording.id}/characters`,
      { characterIds: cast },
      cookie,
    )
    expect(opened.status).toBe(200)
    const withCast = (await opened.json()) as RecordingDetail
    expect(withCast.status).toBe("ongoing")
    expect(withCast.continuities).toHaveLength(4)

    // 3. Se vuelve a asignar uno de los cuatro: no aparece una quinta continuidad.
    const again = await over(
      "POST",
      `${base}/${recording.id}/characters`,
      { characterIds: [cast[0]] },
      cookie,
    )
    expect(again.status).toBe(200)
    expect(((await again.json()) as RecordingDetail).continuities).toHaveLength(4)

    // 4. Se le cuelga utilería de los dos tipos a Marta.
    const marta = withCast.continuities.find((row) => row.characterId === cast[0])
    const continuity = `${base}/${recording.id}/continuities/${marta?.id}`

    const chaqueta = await sowItem(production.id, "Chaqueta de mezclilla")
    const botas = await sowItem(production.id, "Botas cafés")
    const sombrero = await sowItem(production.id, "Sombrero")
    const reloj = await sowItem(production.id, "Reloj de pulso")
    const referencia = await sowVideo(production.id, "Referencia del piloto")
    const prueba = await sowVideo(production.id, "Prueba de cámara")

    for (const itemId of [chaqueta, botas, sombrero]) {
      expect((await over("POST", `${continuity}/items`, { itemId }, cookie)).status).toBe(201)
    }
    for (const videoId of [referencia, prueba]) {
      expect((await over("POST", `${continuity}/videos`, { videoId }, cookie)).status).toBe(201)
    }

    // 5. Se reconcilian los artículos, y los videos no se mueven.
    const reconciled = await over(
      "PUT",
      `${continuity}/items`,
      { itemIds: [chaqueta, reloj] },
      cookie,
    )
    expect(reconciled.status).toBe(200)
    const afterItems = (await reconciled.json()) as Continuity

    expect(
      afterItems.props
        .filter((row) => row.kind === "item")
        .map((row) => row.name)
        .sort(),
    ).toEqual(["Chaqueta de mezclilla", "Reloj de pulso"])
    expect(
      afterItems.props
        .filter((row) => row.kind === "video")
        .map((row) => row.name)
        .sort(),
    ).toEqual(["Prueba de cámara", "Referencia del piloto"])

    // 6. Se anota lo que no cabe en ninguna estructura.
    expect(
      (
        await over(
          "POST",
          `${base}/${recording.id}/notes`,
          { body: "El perro no quiso entrar al plano hasta la toma 7" },
          cookie,
        )
      ).status,
    ).toBe(201)

    // 7. La vista completa lo enseña todo, de una sola vez.
    const view = await over("GET", `${base}/${recording.id}`, undefined, cookie)
    expect(view.status).toBe(200)
    const detail = (await view.json()) as RecordingDetail

    expect(detail.status).toBe("ongoing")
    expect(detail.scene?.id).toBe(sceneId)
    expect(detail.scene?.chapter.id).toBe(chapterId)
    expect(detail.continuities).toHaveLength(4)
    expect(detail.continuities.map((row) => row.characterName).sort()).toEqual([
      "El perro",
      "Julián",
      "La vecina",
      "Marta",
    ])
    expect(
      detail.continuities
        .find((row) => row.characterId === cast[0])
        ?.props.map((row) => row.name)
        .sort(),
    ).toEqual([
      "Chaqueta de mezclilla",
      "Prueba de cámara",
      "Referencia del piloto",
      "Reloj de pulso",
    ])
    expect(detail.notes.map((row) => row.body)).toEqual([
      "El perro no quiso entrar al plano hasta la toma 7",
    ])

    // 8. El historial del personaje lo ve desde el otro lado.
    const history = await over(
      "GET",
      `/companies/${company.id}/productions/${production.id}/characters/${cast[0]}/continuity`,
      undefined,
      cookie,
    )
    expect(history.status).toBe(200)
    const revision = (await history.json()) as CharacterHistory
    expect(revision.characterName).toBe("Marta")
    expect(revision.recordings).toHaveLength(1)
    expect(revision.recordings[0]?.props).toHaveLength(4)

    // 9. Y la jornada se cierra **sin** que la continuidad esté completa: tres de los cuatro
    //    personajes no tienen ni una pieza registrada, y el día de rodaje se acabó igual.
    const closed = await over("POST", `${base}/${recording.id}/close`, {}, cookie)
    expect(closed.status).toBe(200)
    expect(((await closed.json()) as Recording).status).toBe("completed")
  })
})
