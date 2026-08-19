/**
 * Una producción recorrida entera, **contra un servidor de verdad**.
 *
 * ## Por qué existe, y por qué no la escribió ninguno de los tres
 *
 * Los catálogos, el desglose y la continuidad se construyeron **en paralelo**, cada uno con su
 * recorrido y sin poder ver el código de los otros dos. Cada uno demuestra que su bloque anda; lo
 * que ninguno puede demostrar es que **encajan**, porque para eso hay que estar en el único sitio
 * desde el que los tres existen a la vez, que es después de fusionarlos.
 *
 * Y encajar no es un detalle: la cadena de un rodaje **atraviesa los tres**. Una jornada cuelga de
 * una escena, que cuelga de un capítulo, que cuelga de un guion —desglose—; su reparto sale de los
 * personajes —catálogos—; y la utilería de cada continuidad es un artículo del inventario
 * —catálogos otra vez— o un video de referencia. Tres bloques verdes por separado pueden dejar
 * rota justo la costura que los une, y la costura es lo que se usa a diario.
 *
 * ## Qué recorre
 *
 * Lo que hace un equipo de arte en una semana, en orden: se sube el guion, se desglosa en capítulos
 * y escenas, se da de alta el reparto y la utilería física, se programa la jornada de una escena,
 * se le asigna el reparto —lo que abre la jornada y crea una continuidad por personaje—, se le
 * cuelga a cada quien lo que lleva puesto, se escribe la nota del script y se cierra el día.
 *
 * Y al final se pregunta lo que se pregunta de verdad cuando hay que repetir una toma tres meses
 * después: **«¿dónde ha estado esta chamarra?»** — que es la consulta que sólo tiene respuesta si
 * los tres bloques comparten las mismas filas.
 *
 * **El puerto es efímero** (`port: 0`): el `3000` y el `5000` de quien esté trabajando no se tocan.
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
  productions,
  roles,
  services,
  sessions,
  uploads,
  users,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest"
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

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  return fetch(`${origin}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function ok<T>(response: Response, status: number): Promise<T> {
  // El cuerpo entra en el mensaje del fallo: un `400` sin motivo obliga a instrumentar a mano, y
  // este recorrido atraviesa treinta llamadas.
  const texto = await response.text()
  if (response.status !== status) {
    throw new Error(`${response.url} respondió ${response.status}, se esperaba ${status}: ${texto}`)
  }
  return JSON.parse(texto) as T
}

async function signIn(email: string): Promise<string> {
  await call("POST", "/auth/register", { email, password: PASSWORD, name: "Jefa de arte" })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const response = await call("POST", "/auth/login", { email, password: PASSWORD })
  const cookie = response.headers
    .getSetCookie()
    .find((raw) => raw.startsWith("tfv_session="))
    ?.split(";")[0]

  if (!cookie) throw new Error("no se abrió sesión contra el servidor")
  return cookie
}

async function enableProductions(companyId: string) {
  const [existing] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.keycode, "productions"))

  const serviceId = existing?.id ?? newId()
  if (!existing) {
    await db.insert(services).values({ id: serviceId, keycode: "productions", name: "productions" })
  }

  await db
    .insert(companyServices)
    .values({ id: newId(), companyId, serviceId })
    .onConflictDoNothing()
}

/** El archivo del guion. Se siembra porque subirlo es de la rebanada 08 y aquí sólo estorbaría. */
async function sowDocument(companyId: string): Promise<string> {
  const id = newId()
  await db.insert(uploads).values({
    id,
    kind: "document",
    status: "uploaded",
    url: `https://archivos.ejemplo.mx/${companyId}/${id}.pdf`,
    fileName: "la-casa-del-rio-v3.pdf",
    extension: "pdf",
    contentType: "application/pdf",
    byteSize: 182_344,
    storagePath: `${companyId}/`,
  })
  return id
}

interface Identificado {
  id: string
}

// ─── El recorrido ────────────────────────────────────────────────────────────

it("del guion a la continuidad: los tres bloques sostienen la misma cadena", async () => {
  const cookie = await signIn("jefa-de-arte@ejemplo.mx")

  const company = await ok<Identificado>(
    await call("POST", "/companies", { name: "Estudios Mariposa" }, cookie),
    201,
  )
  await enableProductions(company.id)

  const production = await ok<Identificado>(
    await call("POST", `/companies/${company.id}/productions`, { name: "La casa del río" }, cookie),
    201,
  )
  const base = `/companies/${company.id}/productions/${production.id}`

  // ─── Desglose: el guion, su capítulo y su escena ───────────────────────────

  const script = await ok<Identificado>(
    await call(
      "POST",
      `${base}/scripts`,
      { name: "La casa del río · v3", documentId: await sowDocument(company.id) },
      cookie,
    ),
    201,
  )

  const chapter = await ok<Identificado & { index: number }>(
    await call(
      "POST",
      `${base}/chapters`,
      { name: "Episodio piloto", scriptId: script.id, index: 1 },
      cookie,
    ),
    201,
  )

  const scene = await ok<Identificado & { label: string }>(
    await call(
      "POST",
      `${base}/chapters/${chapter.id}/scenes`,
      { name: "Cocina, noche", index: 1 },
      cookie,
    ),
    201,
  )

  // La etiqueta compuesta es lo primero que cruza dos bloques: la escribe el desglose y la lee
  // todo el mundo, porque «1.1» es como se nombra una escena en el set.
  expect(scene.label).toBe(`${chapter.index}.1`)

  // ─── Catálogos: quién sale, y qué lleva puesto ─────────────────────────────

  const [elena, tomas] = await Promise.all(
    ["Elena", "Tomás"].map(async (name) =>
      ok<Identificado>(await call("POST", `${base}/characters`, { name }, cookie), 201),
    ),
  )
  if (!elena || !tomas) throw new Error("no se crearon los personajes")

  const chamarra = await ok<Identificado & { code: string; status: string }>(
    await call("POST", `${base}/items`, { name: "Chamarra de mezclilla" }, cookie),
    201,
  )
  expect(chamarra.status).toBe("available")

  // ─── Continuidad: la jornada, su reparto y su utilería ─────────────────────

  const recording = await ok<Identificado & { status: string }>(
    await call("POST", `${base}/recordings`, { name: "Día 1 · cocina", sceneId: scene.id }, cookie),
    201,
  )
  expect(recording.status).toBe("draft")

  // Asignar el reparto es el acto con el que empieza el trabajo, así que abre la jornada.
  const conReparto = await ok<{
    status: string
    continuities: { id: string; characterId: string | null }[]
  }>(
    await call(
      "POST",
      `${base}/recordings/${recording.id}/characters`,
      { characterIds: [elena.id, tomas.id] },
      cookie,
    ),
    200,
  )
  expect(conReparto.continuities).toHaveLength(2)

  const deElena = conReparto.continuities.find((row) => row.characterId === elena.id)
  if (!deElena) throw new Error("Elena no recibió continuidad")

  const abierta = await ok<{ status: string }>(
    await call("GET", `${base}/recordings/${recording.id}`, undefined, cookie),
    200,
  )
  expect(abierta.status).toBe("ongoing")

  // La chamarra del catálogo colgada de la continuidad: aquí es donde los dos bloques se tocan.
  await ok(
    await call(
      "PUT",
      `${base}/recordings/${recording.id}/continuities/${deElena.id}/items`,
      { itemIds: [chamarra.id] },
      cookie,
    ),
    200,
  )

  await ok(
    await call(
      "POST",
      `${base}/recordings/${recording.id}/notes`,
      { body: "La luz de la ventana cambió a mitad de la tarde. Repetir con contraluz." },
      cookie,
    ),
    201,
  )

  // Cerrar no exige tener la continuidad completa: el día se acaba cuando se acaba.
  await ok(await call("POST", `${base}/recordings/${recording.id}/close`, {}, cookie), 200)

  // ─── La pregunta que sólo tiene respuesta si los tres comparten filas ──────

  // «¿Dónde ha estado esta chamarra?» — la responde el bloque de catálogos leyendo lo que escribió
  // el de continuidad, sobre una escena que nombró el de desglose.
  const uso = await ok<{
    sets: { id: string }[]
    recordings: { id: string; name: string; continuityId: string }[]
  }>(await call("GET", `${base}/items/${chamarra.id}/usage`, undefined, cookie), 200)

  expect(uso.recordings.map((fila) => fila.id)).toEqual([recording.id])
  // La continuidad concreta, que es lo que hace útil la respuesta: no basta «se usó ese día», hay
  // que saber **quién** lo llevaba para poder repetir la toma.
  expect(uso.recordings[0]?.continuityId).toBe(deElena.id)

  // Y desde el otro extremo de la cadena: la continuidad de Elena, con la escena que rodó.
  const historia = await ok<{ recordings: { sceneName: string | null; props: unknown[] }[] }>(
    await call("GET", `${base}/characters/${elena.id}/continuity`, undefined, cookie),
    200,
  )
  expect(historia.recordings).toHaveLength(1)
  expect(historia.recordings[0]?.sceneName).toBe("Cocina, noche")
  expect(historia.recordings[0]?.props).toHaveLength(1)
})
