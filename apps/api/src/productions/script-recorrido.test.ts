/**
 * El desglose recorrido de punta a punta, **contra un servidor de verdad**.
 *
 * El resto de la suite llama a `app.request()`, que atraviesa el motor entero —enrutado, guardas,
 * validación— pero no la red. Aquí se levanta la aplicación escuchando en un puerto y se conduce
 * con `fetch`, porque hay cosas que sólo fallan del otro lado del cable: el orden de la tabla de
 * rutas resolviendo `/chapters/indices` contra `/chapters/{id}`, la serialización de la respuesta,
 * los códigos de estado tal y como salen.
 *
 * **El puerto es efímero** (`port: 0`). Los del entorno de trabajo de una persona —el `3000` y el
 * `5000`— no se tocan, y dos ejecuciones simultáneas de esto no se pisan.
 *
 * El recorrido es el de un desglose real: un guion que nace sin extraer, sus capítulos numerados,
 * sus escenas, la estructura completa navegable, y entonces **se borra el capítulo de en medio** y
 * se comprueba lo que este módulo defiende — que los índices no se mueven y que el siguiente libre
 * dice la verdad.
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

/** Una petición de verdad: por la red, al puerto en el que la aplicación está escuchando. */
async function call(method: string, path: string, body?: unknown, cookie?: string) {
  return fetch(`${origin}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function ok<T>(response: Response, status: number): Promise<T> {
  expect(response.status).toBe(status)
  return (await response.json()) as T
}

async function signIn(email: string): Promise<string> {
  await call("POST", "/auth/register", { email, password: PASSWORD, name: "Continuidad" })
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

interface Chapter {
  id: string
  name: string
  index: number
  sceneCount: number
}

interface Scene {
  id: string
  index: number
  label: string
}

interface IndexHint {
  lastIndex: number | null
  nextIndex: number
  available: boolean | null
}

// ─── El recorrido ────────────────────────────────────────────────────────────

it("se desglosa un guion entero, y borrar el capítulo de en medio no mueve los números", async () => {
  const cookie = await signIn("script-supervisor@ejemplo.mx")

  const company = await ok<{ id: string }>(
    await call("POST", "/companies", { name: "Estudios Mariposa" }, cookie),
    201,
  )
  await enableProductions(company.id)

  const production = await ok<{ id: string }>(
    await call("POST", `/companies/${company.id}/productions`, { name: "La casa del río" }, cookie),
    201,
  )

  const base = `/companies/${company.id}/productions/${production.id}`

  // ─── El guion nace, y nace sin extraer ─────────────────────────────────────

  const documentId = newId()
  await db.insert(uploads).values({
    id: documentId,
    kind: "document",
    status: "uploaded",
    url: `https://archivos.ejemplo.mx/${company.id}/${documentId}.pdf`,
    fileName: "la-casa-del-rio-v3.pdf",
    extension: "pdf",
    contentType: "application/pdf",
    byteSize: 182_344,
    storagePath: `${company.id}/`,
  })

  const script = await ok<{ id: string; syncStatus: string; chapterCount: number }>(
    await call(
      "POST",
      `${base}/scripts`,
      { name: "Guion de rodaje", index: 1, documentUploadId: documentId },
      cookie,
    ),
    201,
  )
  expect(script.syncStatus).toBe("not_extracted")
  expect(script.chapterCount).toBe(0)

  // ─── Los capítulos, numerados ──────────────────────────────────────────────

  const firstHint = await ok<IndexHint>(
    await call("GET", `${base}/chapters/indices`, undefined, cookie),
    200,
  )
  expect(firstHint.lastIndex).toBeNull()
  expect(firstHint.nextIndex).toBe(1)

  const chapters: Chapter[] = []
  for (const [index, name] of [
    [1, "El río crecido"],
    [2, "La casa vacía"],
    [3, "Lo que quedó dentro"],
  ] as const) {
    chapters.push(
      await ok<Chapter>(
        await call("POST", `${base}/chapters`, { name, index, scriptId: script.id }, cookie),
        201,
      ),
    )
  }

  // Repetir un número que ya está puesto se rechaza, y lo dice con su código.
  const clash = await call("POST", `${base}/chapters`, { name: "Otro dos", index: 2 }, cookie)
  expect(clash.status).toBe(409)

  // ─── Las escenas de cada capítulo ──────────────────────────────────────────

  const scenesPerChapter = [
    [1, 2, 3],
    [1, 2],
    [1, 2, 3, 4],
  ]

  for (const [position, chapter] of chapters.entries()) {
    for (const index of scenesPerChapter[position] ?? []) {
      await ok<Scene>(
        await call(
          "POST",
          `${base}/chapters/${chapter.id}/scenes`,
          { name: `Secuencia ${index}`, synopsis: `Lo que pasa en la ${index}`, index },
          cookie,
        ),
        201,
      )
    }
  }

  // ─── La estructura completa, navegable ─────────────────────────────────────

  const structure = await ok<{ chapters: (Chapter & { scenes: Scene[] })[] }>(
    await call("GET", `${base}/breakdown`, undefined, cookie),
    200,
  )

  expect(structure.chapters.map((row) => row.index)).toEqual([1, 2, 3])
  expect(structure.chapters.map((row) => row.sceneCount)).toEqual([3, 2, 4])
  expect(structure.chapters.flatMap((row) => row.scenes.map((scene) => scene.label))).toEqual([
    "1.1",
    "1.2",
    "1.3",
    "2.1",
    "2.2",
    "3.1",
    "3.2",
    "3.3",
    "3.4",
  ])

  // El guion ya sabe cuántos capítulos salieron de él.
  const withChapters = await ok<{ chapterCount: number }>(
    await call("GET", `${base}/scripts/${script.id}`, undefined, cookie),
    200,
  )
  expect(withChapters.chapterCount).toBe(3)

  // ─── Se borra el capítulo de en medio ──────────────────────────────────────

  const middle = chapters[1] as Chapter

  const scope = await ok<{ scenes: number; recordings: number; workflows: number }>(
    await call("GET", `${base}/chapters/${middle.id}/scope`, undefined, cookie),
    200,
  )
  // La confirmación enumera antes lo que se pierde, que es lo que la spec exige.
  expect(scope.scenes).toBe(2)

  const removed = await call("DELETE", `${base}/chapters/${middle.id}`, undefined, cookie)
  expect(removed.status).toBe(204)

  // ─── Y los números no se han movido ────────────────────────────────────────

  const after = await ok<{ chapters: (Chapter & { scenes: Scene[] })[] }>(
    await call("GET", `${base}/breakdown`, undefined, cookie),
    200,
  )

  // El tres sigue siendo el tres. Nadie ha ascendido a dos.
  expect(after.chapters.map((row) => row.index)).toEqual([1, 3])
  expect(after.chapters.map((row) => row.name)).toEqual(["El río crecido", "Lo que quedó dentro"])
  // Y las etiquetas de sus escenas tampoco: la 3.4 sigue llamándose 3.4 en la orden del día.
  expect(after.chapters[1]?.scenes.map((row) => row.label)).toEqual(["3.1", "3.2", "3.3", "3.4"])

  // Las escenas del capítulo que se fue se fueron con él, y ninguna quedó suelta.
  const allScenes = await ok<{ totalItems: number }>(
    await call("GET", `${base}/scenes`, undefined, cookie),
    200,
  )
  expect(allScenes.totalItems).toBe(7)

  // ─── Y el siguiente índice libre dice la verdad ────────────────────────────

  const hint = await ok<IndexHint>(
    await call("GET", `${base}/chapters/indices?index=2`, undefined, cookie),
    200,
  )

  // El último **vivo** es el tres, así que se propone el cuatro. El hueco del dos está libre —se
  // puede pedir a mano, que es el «12A»— pero no se propone: rellenarlo solo reutilizaría un número
  // que el equipo ya usó en su papeleo.
  expect(hint.lastIndex).toBe(3)
  expect(hint.nextIndex).toBe(4)
  expect(hint.available).toBe(true)

  // Y pedirlo a mano funciona, que es lo que hace que el hueco sea una posibilidad y no un residuo.
  const intercalated = await ok<Chapter>(
    await call("POST", `${base}/chapters`, { name: "El dos que faltaba", index: 2 }, cookie),
    201,
  )
  expect(intercalated.index).toBe(2)

  const finalStructure = await ok<{ chapters: Chapter[] }>(
    await call("GET", `${base}/breakdown`, undefined, cookie),
    200,
  )
  expect(finalStructure.chapters.map((row) => row.index)).toEqual([1, 2, 3])
})
