/**
 * Planes de trabajo, tareas y calendario, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/production-workflows/spec.md`, más las tres
 * decisiones de producto que gobiernan el calendario y que la spec no escribe: que pinta también
 * las jornadas de rodaje, que **la fecha de aterrizaje la resuelve el servidor**, y que la vista y
 * la fecha viajan en la dirección para que una semana se comparta por enlace.
 *
 * ## Las escenas, los capítulos, los personajes y las jornadas se siembran a mano
 *
 * Igual que en continuidad, y por lo mismo: cuelgan de rebanadas que se escriben en paralelo. Sus
 * tablas existen desde la `0022`, así que aquí se insertan contra la base en lugar de llamar a
 * rutas que este árbol no toca. El día que existan, la siembra se sustituye por llamadas sin tocar
 * una sola afirmación.
 *
 * ## Hoy se inyecta, y es lo que hace la prueba honesta
 *
 * El aterrizaje se resuelve contra «hoy». Dejarlo al reloj del sistema haría que estas pruebas
 * cambiaran de resultado según el día en que se corran — verdes en marzo y rojas en junio. El
 * endpoint acepta el día como parámetro por esa razón, y sólo por ella.
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
  productionCategories,
  productionChapters,
  productionCharacters,
  productionContinuities,
  productionRecordings,
  productionScenes,
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

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${productions}, ${uploads}, ${services}, ${companies} cascade`,
  )
}

let server: ReturnType<typeof serve>

beforeAll(async () => {
  await new Promise<number>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) =>
      resolve((info as AddressInfo).port),
    )
  })
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

let accounts = 0

async function signUp(): Promise<Session> {
  accounts += 1
  const email = `planes-${accounts}@ejemplo.mx`
  await request("POST", "/auth/register", { email, password: PASSWORD, name: "Jefa" })
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

interface Stage {
  session: Session
  companyId: string
  productionId: string
  chapterId: string
  sceneId: string
}

let sown = 0

async function stage(): Promise<Stage> {
  const session = await signUp()
  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name: "Estudios Mariposa" }, session.cookie),
  )
  await enableService(company.id, "productions")

  sown += 1

  /**
   * El nombre lleva un número, y no es cosmético.
   *
   * El identificador legible de una producción es único **en toda la plataforma**, pero quien
   * comprueba si está libre lo hace con las políticas del solicitante puestas: no ve la producción
   * de otra empresa, propone el mismo y el índice único lo rechaza con un `500`. Ver `HALLAZGOS.md`
   * H-224. Dos escenarios de esta prueba montan empresas distintas, así que aquí se esquiva.
   */
  const created = await request(
    "POST",
    `/companies/${company.id}/productions`,
    { name: `Serie Piloto ${sown}` },
    session.cookie,
  )
  expect(created.status).toBe(201)
  const production = await json<{ id: string }>(created)

  const chapterId = newId()
  await db
    .insert(productionChapters)
    .values({ id: chapterId, productionId: production.id, name: `Capítulo ${sown}`, index: sown })

  const sceneId = newId()
  await db
    .insert(productionScenes)
    .values({ id: sceneId, chapterId, name: "Interior casa", index: 1 })

  return {
    session,
    companyId: company.id,
    productionId: production.id,
    chapterId,
    sceneId,
  }
}

function base(s: Stage) {
  return `/companies/${s.companyId}/productions/${s.productionId}`
}

interface Workflow {
  id: string
  code: string
  sceneId: string | null
  status: string
  scheduledFor: string
  endsAt: string | null
  observations: string
  taskCount: number
  tasksByStatus?: Record<string, number>
}

interface Task {
  id: string
  workflowId: string
  title: string
  status: string
  categoryId: string | null
  categoryName: string | null
  characterId: string | null
  characterName: string | null
  scheduledFor: string | null
  responsibleId: string | null
  createdById: string | null
  createdByName: string | null
  activityCount: number
  activitiesByStatus?: Record<string, number>
  attachmentCount: number
  commentCount: number
}

interface Activity {
  id: string
  taskId: string
  title: string
  status: string
  createdById: string | null
  attachments: { id: string; uploadId: string; name: string }[]
}

interface Comment {
  id: string
  workflowId: string | null
  taskId: string | null
  body: string
  authorId: string | null
  authorName: string | null
}

interface CalendarEvent {
  kind: "recording" | "workflow" | "task"
  id: string
  day: string
  title: string
  status: string
  workflowId: string | null
  characterId: string | null
  categoryId: string | null
}

interface Calendar {
  view: string
  landing: { date: string; reason: string }
  range: { from: string; to: string }
  events: CalendarEvent[]
}

async function newWorkflow(s: Stage, body: Record<string, unknown> = {}): Promise<Workflow> {
  const response = await request(
    "POST",
    `${base(s)}/workflows`,
    { scheduledFor: "2026-03-10T06:00:00.000Z", ...body },
    s.session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Workflow>(response)
}

async function newTask(
  s: Stage,
  workflowId: string,
  body: Record<string, unknown> = {},
): Promise<Task> {
  const response = await request(
    "POST",
    `${base(s)}/workflows/${workflowId}/tasks`,
    { title: "Conseguir la lámpara", ...body },
    s.session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Task>(response)
}

async function sowCharacter(productionId: string, name: string): Promise<string> {
  const id = newId()
  await db.insert(productionCharacters).values({ id, productionId, name })
  return id
}

async function sowCategory(productionId: string, name: string): Promise<string> {
  const id = newId()
  await db
    .insert(productionCategories)
    .values({ id, productionId, name, slug: `${name.toLowerCase()}-${id.slice(0, 8)}` })
  return id
}

/** Una jornada de rodaje, con la fecha de alta que se le quiera dar. Ver H-220. */
async function sowRecording(
  productionId: string,
  name: string,
  createdAt: Date,
  sceneId?: string,
): Promise<string> {
  const id = newId()
  await db.insert(productionRecordings).values({
    id,
    productionId,
    name,
    createdAt,
    ...(sceneId === undefined ? {} : { sceneId }),
  })
  return id
}

async function sowContinuity(recordingId: string, characterId: string): Promise<void> {
  await db.insert(productionContinuities).values({ id: newId(), recordingId, characterId })
}

/** Un archivo ya subido, para adjuntarlo. Vive bajo el prefijo de su empresa, que es lo que lo acota. */
async function sowUpload(companyId: string, fileName: string): Promise<string> {
  const id = newId()
  await db.insert(uploads).values({
    id,
    kind: "document",
    status: "uploaded",
    url: `https://archivos.local/${id}`,
    fileName,
    extension: "pdf",
    contentType: "application/pdf",
    byteSize: 1024,
    storagePath: `${companyId}/tareas/${id}`,
  })
  return id
}

let scopedAccounts = 0

/** Una cuenta de la misma empresa con un rol acotado a las claves que se le pasen. */
async function memberWith(companyId: string, permissions: string[]): Promise<string> {
  scopedAccounts += 1
  const email = `acotada-planes-${scopedAccounts}@ejemplo.mx`
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

// ─── La escena del plan ──────────────────────────────────────────────────────

describe("un plan se asocia a una escena, y puede vivir sin ella", () => {
  it("se crea sin escena", async () => {
    // Escenario: «Se crea un plan sin escena».
    const s = await stage()
    const workflow = await newWorkflow(s)

    expect(workflow.sceneId).toBeNull()
  })

  it("se asocia a una escena", async () => {
    // Escenario: «Se asocia un plan a una escena».
    const s = await stage()
    const workflow = await newWorkflow(s, { sceneId: s.sceneId })

    expect(workflow.sceneId).toBe(s.sceneId)
  })

  it("se le retira la escena y sigue existiendo", async () => {
    // Escenario: «Se desvincula un plan de su escena»: el plan sigue existiendo sin escena.
    const s = await stage()
    const workflow = await newWorkflow(s, { sceneId: s.sceneId })

    const response = await request(
      "PATCH",
      `${base(s)}/workflows/${workflow.id}`,
      { sceneId: null },
      s.session.cookie,
    )

    expect(response.status).toBe(200)
    expect((await json<Workflow>(response)).sceneId).toBeNull()

    const after = await request(
      "GET",
      `${base(s)}/workflows/${workflow.id}`,
      undefined,
      s.session.cookie,
    )
    expect(after.status).toBe(200)
  })

  it("editar otra cosa no desvincula la escena", async () => {
    // Omitir el campo y mandarlo nulo son cosas distintas. Sin esa diferencia, guardar las
    // observaciones desvincularía la escena sin que nadie lo pidiera.
    const s = await stage()
    const workflow = await newWorkflow(s, { sceneId: s.sceneId })

    const response = await request(
      "PATCH",
      `${base(s)}/workflows/${workflow.id}`,
      { observations: "Llevar el generador" },
      s.session.cookie,
    )

    expect((await json<Workflow>(response)).sceneId).toBe(s.sceneId)
  })

  it("una escena de otra producción no se puede asociar", async () => {
    // Nada en el modelo comprueba que el capítulo de la escena cuelgue de esta producción.
    const s = await stage()
    const otra = await stage()
    const workflow = await newWorkflow(s)

    const response = await request(
      "PATCH",
      `${base(s)}/workflows/${workflow.id}`,
      { sceneId: otra.sceneId },
      s.session.cookie,
    )

    expect(response.status).toBe(404)
  })
})

// ─── Tareas ──────────────────────────────────────────────────────────────────

describe("las tareas de un plan", () => {
  it("el creador queda fijado y no se puede cambiar", async () => {
    // Escenario: «El creador queda fijado» — «ese dato no puede cambiarse después».
    const s = await stage()
    const workflow = await newWorkflow(s)

    const task = await newTask(s, workflow.id)
    expect(task.createdById).toBe(s.session.userId)
    expect(task.status).toBe("pending")

    // El campo ni siquiera se admite en la entrada: mandarlo no lo cambia.
    const otra = await signUp()
    const response = await request(
      "PATCH",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}`,
      { title: "Otro título", createdById: otra.userId },
      s.session.cookie,
    )

    expect(response.status).toBe(200)
    expect((await json<Task>(response)).createdById).toBe(s.session.userId)
  })

  it("responsable y creador quedan registrados por separado", async () => {
    // Escenario: «Se asigna una tarea a otro miembro».
    const s = await stage()
    const workflow = await newWorkflow(s)
    const otro = await memberWith(s.companyId, ["productions.workflows.view"])
    expect(otro).not.toBe("")

    const [miembro] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, `acotada-planes-${scopedAccounts}@ejemplo.mx`))

    const task = await newTask(s, workflow.id, { responsibleId: miembro?.id })

    expect(task.responsibleId).toBe(miembro?.id)
    expect(task.createdById).toBe(s.session.userId)
    expect(task.responsibleId).not.toBe(task.createdById)
  })

  it("una tarea incompleta cuenta como cerrada en el desglose del plan", async () => {
    // Escenario: «Una tarea se cierra como incompleta» — «cuenta como cerrada en los recuentos».
    const s = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)

    await request(
      "PATCH",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}`,
      { status: "incomplete" },
      s.session.cookie,
    )

    const response = await request(
      "GET",
      `${base(s)}/workflows/${workflow.id}?aggregates=true`,
      undefined,
      s.session.cookie,
    )

    const plan = await json<Workflow>(response)
    expect(plan.taskCount).toBe(1)
    expect(plan.tasksByStatus).toEqual({
      pending: 0,
      in_progress: 0,
      completed: 0,
      incomplete: 1,
    })
  })

  it("el plan resume su avance con cinco tareas", async () => {
    // Escenario literal: «un plan con cinco tareas: dos completadas, dos en curso y una pendiente».
    const s = await stage()
    const workflow = await newWorkflow(s)

    const estados = ["completed", "completed", "in_progress", "in_progress", "pending"]
    for (const status of estados) {
      const task = await newTask(s, workflow.id, { title: `Tarea ${status}` })
      if (status !== "pending") {
        await request(
          "PATCH",
          `${base(s)}/workflows/${workflow.id}/tasks/${task.id}`,
          { status },
          s.session.cookie,
        )
      }
    }

    const plan = await json<Workflow>(
      await request(
        "GET",
        `${base(s)}/workflows/${workflow.id}?aggregates=true`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(plan.taskCount).toBe(5)
    expect(plan.tasksByStatus).toEqual({
      pending: 1,
      in_progress: 2,
      completed: 2,
      incomplete: 0,
    })
  })

  it("sin pedir agregados, el desglose no viaja", async () => {
    // `computed-fields`: la propiedad no es que el campo se omita, es que no se pague por él.
    const s = await stage()
    const workflow = await newWorkflow(s)
    await newTask(s, workflow.id)

    const plan = await json<Workflow>(
      await request("GET", `${base(s)}/workflows/${workflow.id}`, undefined, s.session.cookie),
    )

    expect(plan.taskCount).toBe(1)
    expect(plan.tasksByStatus).toBeUndefined()
  })

  it("una categoría de otra producción no clasifica la tarea", async () => {
    const s = await stage()
    const otra = await stage()
    const workflow = await newWorkflow(s)
    const ajena = await sowCategory(otra.productionId, "Vestuario")

    const response = await request(
      "POST",
      `${base(s)}/workflows/${workflow.id}/tasks`,
      { title: "Tarea", categoryId: ajena },
      s.session.cookie,
    )

    expect(response.status).toBe(404)
  })

  it("una tarea eliminada deja de contar", async () => {
    // El recuento descuenta las bajas lógicas. Contar filas ya borradas es el fallo que en la
    // tanda anterior no cazó ninguna de cuarenta y seis pruebas.
    const s = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)
    await newTask(s, workflow.id, { title: "La que se queda" })

    await request(
      "DELETE",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}`,
      undefined,
      s.session.cookie,
    )

    const plan = await json<Workflow>(
      await request("GET", `${base(s)}/workflows/${workflow.id}`, undefined, s.session.cookie),
    )

    expect(plan.taskCount).toBe(1)
  })
})

// ─── Actividades ─────────────────────────────────────────────────────────────

describe("las actividades de una tarea", () => {
  it("tres actividades quedan registradas incompletas", async () => {
    // Escenario: «Se desglosa una tarea en actividades».
    const s = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)

    for (const title of ["Buscar", "Cotizar", "Recoger"]) {
      const response = await request(
        "POST",
        `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/activities`,
        { title },
        s.session.cookie,
      )
      expect(response.status).toBe(201)
      expect((await json<Activity>(response)).status).toBe("incomplete")
    }

    const detail = await json<Task & { activities: Activity[] }>(
      await request(
        "GET",
        `${base(s)}/workflows/${workflow.id}/tasks/${task.id}`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(detail.activities).toHaveLength(3)
    expect(detail.activityCount).toBe(3)
    expect(detail.activitiesByStatus).toEqual({ incomplete: 3, completed: 0 })
  })

  it("completar una actividad mueve el desglose de su tarea", async () => {
    const s = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)

    const activity = await json<Activity>(
      await request(
        "POST",
        `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/activities`,
        { title: "Buscar" },
        s.session.cookie,
      ),
    )

    await request(
      "PATCH",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/activities/${activity.id}`,
      { status: "completed" },
      s.session.cookie,
    )

    const detail = await json<Task>(
      await request(
        "GET",
        `${base(s)}/workflows/${workflow.id}/tasks/${task.id}`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(detail.activitiesByStatus).toEqual({ incomplete: 0, completed: 1 })
  })
})

// ─── Comentarios ─────────────────────────────────────────────────────────────

describe("comentarios en planes y en tareas", () => {
  it("se comenta una tarea y queda con su autor", async () => {
    // Escenario: «Se comenta una tarea» — «queda registrado con su autor y su instante».
    const s = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)

    const response = await request(
      "POST",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/comments`,
      { body: "La lámpara está en la bodega 3" },
      s.session.cookie,
    )

    expect(response.status).toBe(201)
    const comment = await json<Comment>(response)
    expect(comment.authorId).toBe(s.session.userId)
    expect(comment.taskId).toBe(task.id)
    expect(comment.workflowId).toBeNull()
    expect(comment.authorName).not.toBe("")
  })

  it("un comentario de plan cuelga del plan y no de ninguna tarea", async () => {
    const s = await stage()
    const workflow = await newWorkflow(s)

    const comment = await json<Comment>(
      await request(
        "POST",
        `${base(s)}/workflows/${workflow.id}/comments`,
        { body: "Se mueve a la semana que viene" },
        s.session.cookie,
      ),
    )

    expect(comment.workflowId).toBe(workflow.id)
    expect(comment.taskId).toBeNull()

    const listed = await json<{ items: Comment[] }>(
      await request(
        "GET",
        `${base(s)}/workflows/${workflow.id}/comments`,
        undefined,
        s.session.cookie,
      ),
    )
    expect(listed.items).toHaveLength(1)
  })

  it("se edita y se elimina", async () => {
    const s = await stage()
    const workflow = await newWorkflow(s)

    const comment = await json<Comment>(
      await request(
        "POST",
        `${base(s)}/workflows/${workflow.id}/comments`,
        { body: "Primera versión" },
        s.session.cookie,
      ),
    )

    const edited = await json<Comment>(
      await request(
        "PATCH",
        `${base(s)}/workflows/${workflow.id}/comments/${comment.id}`,
        { body: "Segunda versión" },
        s.session.cookie,
      ),
    )
    expect(edited.body).toBe("Segunda versión")

    const removed = await request(
      "DELETE",
      `${base(s)}/workflows/${workflow.id}/comments/${comment.id}`,
      undefined,
      s.session.cookie,
    )
    expect(removed.status).toBe(204)

    const listed = await json<{ items: Comment[] }>(
      await request(
        "GET",
        `${base(s)}/workflows/${workflow.id}/comments`,
        undefined,
        s.session.cookie,
      ),
    )
    expect(listed.items).toHaveLength(0)
  })

  it("el comentario de un plan no se edita por el camino de una tarea", async () => {
    // Sin comprobar de qué cuelga, bastaría con acertar el identificador.
    const s = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)

    const comment = await json<Comment>(
      await request(
        "POST",
        `${base(s)}/workflows/${workflow.id}/comments`,
        { body: "Del plan" },
        s.session.cookie,
      ),
    )

    const response = await request(
      "PATCH",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/comments/${comment.id}`,
      { body: "Secuestrado" },
      s.session.cookie,
    )

    expect(response.status).toBe(404)
  })
})

// ─── Adjuntos ────────────────────────────────────────────────────────────────

describe("archivos adjuntos", () => {
  it("se adjunta un documento a una tarea y queda asociado", async () => {
    // Escenario: «Se adjunta un archivo a una tarea».
    const s = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)
    const uploadId = await sowUpload(s.companyId, "plano.pdf")

    const response = await request(
      "POST",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/attachments`,
      { uploadId },
      s.session.cookie,
    )

    expect(response.status).toBe(201)
    const attachment = await json<{ id: string; name: string; url: string }>(response)
    expect(attachment.name).toBe("plano.pdf")
    expect(attachment.url).not.toBe("")

    const detail = await json<Task & { attachments: { id: string }[] }>(
      await request(
        "GET",
        `${base(s)}/workflows/${workflow.id}/tasks/${task.id}`,
        undefined,
        s.session.cookie,
      ),
    )
    expect(detail.attachments).toHaveLength(1)
    expect(detail.attachmentCount).toBe(1)
  })

  it("adjuntar dos veces el mismo archivo no lo duplica", async () => {
    const s = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)
    const uploadId = await sowUpload(s.companyId, "plano.pdf")
    const path = `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/attachments`

    const first = await json<{ id: string }>(
      await request("POST", path, { uploadId }, s.session.cookie),
    )
    const second = await json<{ id: string }>(
      await request("POST", path, { uploadId }, s.session.cookie),
    )

    expect(second.id).toBe(first.id)
  })

  it("un archivo de otra empresa responde que no existe", async () => {
    const s = await stage()
    const otra = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)
    const ajeno = await sowUpload(otra.companyId, "ajeno.pdf")

    const response = await request(
      "POST",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/attachments`,
      { uploadId: ajeno },
      s.session.cookie,
    )

    expect(response.status).toBe(404)
  })

  it("una actividad lleva los suyos", async () => {
    const s = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)
    const uploadId = await sowUpload(s.companyId, "foto.pdf")

    const activity = await json<Activity>(
      await request(
        "POST",
        `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/activities`,
        { title: "Recoger" },
        s.session.cookie,
      ),
    )

    const response = await request(
      "POST",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/activities/${activity.id}/attachments`,
      { uploadId },
      s.session.cookie,
    )
    expect(response.status).toBe(201)

    const detail = await json<{ activities: Activity[] }>(
      await request(
        "GET",
        `${base(s)}/workflows/${workflow.id}/tasks/${task.id}`,
        undefined,
        s.session.cookie,
      ),
    )
    expect(detail.activities[0]?.attachments).toHaveLength(1)
  })
})

// ─── Eliminación en cascada ──────────────────────────────────────────────────

describe("la eliminación enumera antes lo que se lleva por delante", () => {
  it("el alcance del plan cuenta tareas, actividades, comentarios y adjuntos", async () => {
    // «La confirmación SHALL enumerar previamente lo que se perderá».
    const s = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)

    await request(
      "POST",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/activities`,
      { title: "Una" },
      s.session.cookie,
    )
    await request(
      "POST",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/comments`,
      { body: "De la tarea" },
      s.session.cookie,
    )
    await request(
      "POST",
      `${base(s)}/workflows/${workflow.id}/comments`,
      { body: "Del plan" },
      s.session.cookie,
    )
    await request(
      "POST",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/attachments`,
      { uploadId: await sowUpload(s.companyId, "x.pdf") },
      s.session.cookie,
    )

    const scope = await json<{
      tasks: number
      activities: number
      comments: number
      attachments: number
    }>(
      await request(
        "GET",
        `${base(s)}/workflows/${workflow.id}/scope`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(scope).toEqual({ tasks: 1, activities: 1, comments: 2, attachments: 1 })
  })

  it("eliminar el plan se lleva sus tareas y sus actividades", async () => {
    // Escenario: «La eliminación de un plan arrastra su contenido».
    const s = await stage()
    const workflow = await newWorkflow(s)

    for (const title of ["Una", "Dos", "Tres", "Cuatro"]) {
      const task = await newTask(s, workflow.id, { title })
      await request(
        "POST",
        `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/activities`,
        { title: `Actividad de ${title}` },
        s.session.cookie,
      )
    }

    const removed = await request(
      "DELETE",
      `${base(s)}/workflows/${workflow.id}`,
      undefined,
      s.session.cookie,
    )
    expect(removed.status).toBe(204)

    // El plan deja de existir para quien mira, y con él todo lo que colgaba.
    const gone = await request(
      "GET",
      `${base(s)}/workflows/${workflow.id}/tasks`,
      undefined,
      s.session.cookie,
    )
    expect(gone.status).toBe(404)
  })

  it("el alcance de una tarea cuenta lo suyo", async () => {
    const s = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)

    await request(
      "POST",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/activities`,
      { title: "Una" },
      s.session.cookie,
    )
    await request(
      "POST",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/comments`,
      { body: "Uno" },
      s.session.cookie,
    )

    const scope = await json<{ activities: number; comments: number; attachments: number }>(
      await request(
        "GET",
        `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/scope`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(scope).toEqual({ activities: 1, comments: 1, attachments: 0 })
  })
})

// ─── El calendario ───────────────────────────────────────────────────────────

function calendarPath(s: Stage, query: Record<string, string>) {
  const params = new URLSearchParams(query)
  return `${base(s)}/calendar?${params.toString()}`
}

describe("el calendario nunca enseña una rejilla vacía sin decir por qué", () => {
  it("con el rodaje por delante, aterriza en el primer suceso", async () => {
    const s = await stage()
    await newWorkflow(s, { scheduledFor: "2026-05-01T06:00:00.000Z" })
    await newWorkflow(s, { scheduledFor: "2026-06-02T06:00:00.000Z" })

    const calendar = await json<Calendar>(
      await request(
        "GET",
        calendarPath(s, { view: "month", today: "2026-03-15" }),
        undefined,
        s.session.cookie,
      ),
    )

    expect(calendar.landing).toEqual({ date: "2026-05-01", reason: "before" })
    expect(calendar.range).toEqual({ from: "2026-05-01", to: "2026-05-31" })
    expect(calendar.events.length).toBeGreaterThan(0)
  })

  it("con el rodaje ya pasado, aterriza en el último", async () => {
    const s = await stage()
    await newWorkflow(s, { scheduledFor: "2025-01-10T06:00:00.000Z" })
    await newWorkflow(s, { scheduledFor: "2025-02-20T06:00:00.000Z" })

    const calendar = await json<Calendar>(
      await request(
        "GET",
        calendarPath(s, { view: "month", today: "2026-03-15" }),
        undefined,
        s.session.cookie,
      ),
    )

    expect(calendar.landing).toEqual({ date: "2025-02-20", reason: "after" })
  })

  it("dentro del periodo, aterriza en el suceso más cercano a hoy", async () => {
    const s = await stage()
    await newWorkflow(s, { scheduledFor: "2026-03-01T06:00:00.000Z" })
    await newWorkflow(s, { scheduledFor: "2026-03-14T06:00:00.000Z" })
    await newWorkflow(s, { scheduledFor: "2026-04-30T06:00:00.000Z" })

    const calendar = await json<Calendar>(
      await request(
        "GET",
        calendarPath(s, { view: "day", today: "2026-03-15" }),
        undefined,
        s.session.cookie,
      ),
    )

    expect(calendar.landing).toEqual({ date: "2026-03-14", reason: "during" })
  })

  it("sin nada programado, aterriza en hoy y lo dice con «vacío»", async () => {
    // Es lo que la pantalla convierte en palabras en vez de pintar un mes en blanco.
    const s = await stage()

    const calendar = await json<Calendar>(
      await request(
        "GET",
        calendarPath(s, { view: "month", today: "2026-03-15" }),
        undefined,
        s.session.cookie,
      ),
    )

    expect(calendar.landing).toEqual({ date: "2026-03-15", reason: "empty" })
    expect(calendar.events).toEqual([])
  })
})

describe("el calendario pinta jornadas, planes y tareas", () => {
  it("los tres tipos caben en el mismo flujo, cada uno con el suyo", async () => {
    const s = await stage()
    const workflow = await newWorkflow(s, { scheduledFor: "2026-03-10T06:00:00.000Z" })
    await newTask(s, workflow.id, {
      title: "Conseguir la lámpara",
      scheduledFor: "2026-03-10T06:00:00.000Z",
    })
    await sowRecording(
      s.productionId,
      "Interior casa, día",
      new Date("2026-03-10T06:00:00.000Z"),
      s.sceneId,
    )

    const calendar = await json<Calendar>(
      await request(
        "GET",
        calendarPath(s, { view: "day", date: "2026-03-10" }),
        undefined,
        s.session.cookie,
      ),
    )

    expect(calendar.events.map((event) => event.kind)).toEqual(["recording", "workflow", "task"])
    expect(calendar.events[0]?.title).toBe("Interior casa, día")
    expect(calendar.events[2]?.workflowId).toBe(workflow.id)
  })

  it("una tarea de un plan eliminado desaparece del calendario", async () => {
    const s = await stage()
    const workflow = await newWorkflow(s, { scheduledFor: "2026-03-10T06:00:00.000Z" })
    await newTask(s, workflow.id, { scheduledFor: "2026-03-10T06:00:00.000Z" })

    await request("DELETE", `${base(s)}/workflows/${workflow.id}`, undefined, s.session.cookie)

    const calendar = await json<Calendar>(
      await request(
        "GET",
        calendarPath(s, { view: "day", date: "2026-03-10" }),
        undefined,
        s.session.cookie,
      ),
    )

    expect(calendar.events).toEqual([])
  })
})

describe("el filtro por personaje actúa donde el personaje existe", () => {
  it("deja la jornada y la tarea de ese personaje, y deja pasar el plan", async () => {
    const s = await stage()
    const heroina = await sowCharacter(s.productionId, "Heroína")
    const villano = await sowCharacter(s.productionId, "Villano")

    const workflow = await newWorkflow(s, { scheduledFor: "2026-03-10T06:00:00.000Z" })
    await newTask(s, workflow.id, {
      title: "Vestuario de la heroína",
      characterId: heroina,
      scheduledFor: "2026-03-10T06:00:00.000Z",
    })
    await newTask(s, workflow.id, {
      title: "Vestuario del villano",
      characterId: villano,
      scheduledFor: "2026-03-10T06:00:00.000Z",
    })

    const conHeroina = await sowRecording(
      s.productionId,
      "Con la heroína",
      new Date("2026-03-10T06:00:00.000Z"),
    )
    await sowContinuity(conHeroina, heroina)
    await sowRecording(s.productionId, "Sin ella", new Date("2026-03-10T06:00:00.000Z"))

    const calendar = await json<Calendar>(
      await request(
        "GET",
        calendarPath(s, { view: "day", date: "2026-03-10", characterId: heroina }),
        undefined,
        s.session.cookie,
      ),
    )

    const jornadas = calendar.events.filter((event) => event.kind === "recording")
    const tareas = calendar.events.filter((event) => event.kind === "task")
    const planes = calendar.events.filter((event) => event.kind === "workflow")

    expect(jornadas.map((event) => event.title)).toEqual(["Con la heroína"])
    expect(tareas.map((event) => event.title)).toEqual(["Vestuario de la heroína"])
    // El plan no lleva personaje: esconderlo escondería la jornada de trabajo entera.
    expect(planes).toHaveLength(1)
  })

  it("una jornada con dos continuidades del mismo personaje aparece una vez", async () => {
    const s = await stage()
    const heroina = await sowCharacter(s.productionId, "Heroína")
    const jornada = await sowRecording(
      s.productionId,
      "Doble continuidad",
      new Date("2026-03-10T06:00:00.000Z"),
    )
    await sowContinuity(jornada, heroina)
    await sowContinuity(jornada, heroina)

    const calendar = await json<Calendar>(
      await request(
        "GET",
        calendarPath(s, { view: "day", date: "2026-03-10", characterId: heroina }),
        undefined,
        s.session.cookie,
      ),
    )

    expect(calendar.events.filter((event) => event.kind === "recording")).toHaveLength(1)
  })

  it("el aterrizaje se resuelve con el filtro puesto", async () => {
    // Sin esto, filtrar por un personaje aterrizaría en un día donde no aparece: una rejilla
    // vacía por otro camino.
    const s = await stage()
    const heroina = await sowCharacter(s.productionId, "Heroína")
    const villano = await sowCharacter(s.productionId, "Villano")
    const workflow = await newWorkflow(s, { scheduledFor: "2026-03-01T06:00:00.000Z" })

    // La del villano va **antes**: si el aterrizaje mirase todas las tareas en vez de las
    // filtradas, caería aquí y la heroína no se vería por ninguna parte.
    await newTask(s, workflow.id, {
      title: "Del villano",
      characterId: villano,
      scheduledFor: "2026-02-01T06:00:00.000Z",
    })
    await newTask(s, workflow.id, {
      title: "De la heroína",
      characterId: heroina,
      scheduledFor: "2026-06-20T06:00:00.000Z",
    })

    const calendar = await json<Calendar>(
      await request(
        "GET",
        calendarPath(s, {
          view: "day",
          today: "2026-01-01",
          characterId: heroina,
          kinds: "task",
        }),
        undefined,
        s.session.cookie,
      ),
    )

    expect(calendar.landing).toEqual({ date: "2026-06-20", reason: "before" })
  })
})

describe("una semana del calendario se comparte por enlace", () => {
  it("la misma dirección enseña la misma semana a quien la abra", async () => {
    // **La prueba de verificación de la rebanada.** Escenario de la spec: «un usuario navega a una
    // semana del calendario y copia la dirección → quien la abra ve esa misma semana».
    const s = await stage()
    const workflow = await newWorkflow(s, { scheduledFor: "2026-03-11T06:00:00.000Z" })
    await newTask(s, workflow.id, {
      title: "Dentro de la semana",
      scheduledFor: "2026-03-13T06:00:00.000Z",
    })
    await newWorkflow(s, { scheduledFor: "2026-03-20T06:00:00.000Z" })

    const enlace = calendarPath(s, { view: "week", date: "2026-03-11" })

    // Quien la copió.
    const primera = await json<Calendar>(await request("GET", enlace, undefined, s.session.cookie))

    // Quien la abre después, con otra sesión de la misma empresa y otro «hoy» implícito.
    const otro = await memberWith(s.companyId, ["productions.workflows.view"])
    const segunda = await json<Calendar>(await request("GET", enlace, undefined, otro))

    expect(primera.range).toEqual({ from: "2026-03-09", to: "2026-03-15" })
    expect(segunda.range).toEqual(primera.range)
    expect(segunda.landing.date).toBe("2026-03-11")
    expect(segunda.events.map((event) => event.id)).toEqual(primera.events.map((event) => event.id))

    // Y lo que hay dentro es lo de esa semana, no lo del plan de la semana siguiente.
    expect(primera.events).toHaveLength(2)
    expect(
      primera.events.every((event) => event.day >= "2026-03-09" && event.day <= "2026-03-15"),
    ).toBe(true)
  })

  it("cambiar de vista conserva la fecha", async () => {
    // Escenario: «el calendario situado en una fecha en vista de mes → se cambia a vista de semana
    // → se muestra la semana que contiene esa fecha».
    const s = await stage()
    await newWorkflow(s, { scheduledFor: "2026-03-11T06:00:00.000Z" })

    const mes = await json<Calendar>(
      await request(
        "GET",
        calendarPath(s, { view: "month", date: "2026-03-11" }),
        undefined,
        s.session.cookie,
      ),
    )
    const semana = await json<Calendar>(
      await request(
        "GET",
        calendarPath(s, { view: "week", date: "2026-03-11" }),
        undefined,
        s.session.cookie,
      ),
    )

    expect(mes.range).toEqual({ from: "2026-03-01", to: "2026-03-31" })
    expect(semana.range).toEqual({ from: "2026-03-09", to: "2026-03-15" })
    expect(semana.landing.date).toBe(mes.landing.date)
  })

  it("las cuatro vistas responden con su rango", async () => {
    const s = await stage()
    await newWorkflow(s, { scheduledFor: "2026-03-11T06:00:00.000Z" })

    const esperados = {
      year: { from: "2026-01-01", to: "2026-12-31" },
      month: { from: "2026-03-01", to: "2026-03-31" },
      week: { from: "2026-03-09", to: "2026-03-15" },
      day: { from: "2026-03-11", to: "2026-03-11" },
    }

    for (const [view, range] of Object.entries(esperados)) {
      const calendar = await json<Calendar>(
        await request(
          "GET",
          calendarPath(s, { view, date: "2026-03-11" }),
          undefined,
          s.session.cookie,
        ),
      )
      expect(calendar.range, view).toEqual(range)
      expect(calendar.view, view).toBe(view)
    }
  })
})

// ─── Planes por escena y por capítulo ────────────────────────────────────────

describe("los planes se consultan por escena y por capítulo", () => {
  it("los del capítulo son los de todas sus escenas", async () => {
    // Escenario: «Se consultan los planes de un capítulo».
    const s = await stage()

    const otraEscena = newId()
    await db
      .insert(productionScenes)
      .values({ id: otraEscena, chapterId: s.chapterId, name: "Exterior", index: 2 })

    await newWorkflow(s, { sceneId: s.sceneId })
    await newWorkflow(s, { sceneId: otraEscena })
    await newWorkflow(s)

    const porCapitulo = await json<{ items: Workflow[]; totalItems: number }>(
      await request(
        "GET",
        `${base(s)}/workflows?chapterId=${s.chapterId}`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(porCapitulo.totalItems).toBe(2)

    const porEscena = await json<{ items: Workflow[]; totalItems: number }>(
      await request(
        "GET",
        `${base(s)}/workflows?sceneId=${s.sceneId}`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(porEscena.totalItems).toBe(1)
  })
})

// ─── Filtrado de tareas dentro de los planes ─────────────────────────────────

describe("los planes se filtran por las tareas que llevan dentro", () => {
  it("cada plan trae sólo las tareas del filtro, y los que no tienen ninguna no aparecen", async () => {
    // Escenario: «Se filtra el calendario por departamento».
    const s = await stage()
    const vestuario = await sowCategory(s.productionId, "Vestuario")
    const arte = await sowCategory(s.productionId, "Arte")

    const conVestuario = await newWorkflow(s, { scheduledFor: "2026-03-10T06:00:00.000Z" })
    await newTask(s, conVestuario.id, { title: "Traje", categoryId: vestuario })
    await newTask(s, conVestuario.id, { title: "Mesa", categoryId: arte })

    const soloArte = await newWorkflow(s, { scheduledFor: "2026-03-11T06:00:00.000Z" })
    await newTask(s, soloArte.id, { title: "Silla", categoryId: arte })

    const result = await json<{ items: { id: string; tasks: { title: string }[] }[] }>(
      await request(
        "GET",
        `${base(s)}/calendar/plans?categoryId=${vestuario}`,
        undefined,
        s.session.cookie,
      ),
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.id).toBe(conVestuario.id)
    expect(result.items[0]?.tasks.map((task) => task.title)).toEqual(["Traje"])
  })
})

// ─── El documento y su enlace público ────────────────────────────────────────

interface WorkPlanDoc {
  kind: string
  identity: { code: string; status: string }
  production: { name: string }
  issuer: { name: string }
  weeks: { from: string; to: string; days: { day: string; tasks: { title: string }[] }[] }[]
  undated: { title: string }[]
  totals: { tasks: number; byStatus: Record<string, number> }
}

describe("el plan se genera como documento y se comparte por enlace", () => {
  it("agrupa sus tareas por semana y por día", async () => {
    const s = await stage()
    const workflow = await newWorkflow(s, {
      scheduledFor: "2026-03-09T06:00:00.000Z",
      sceneId: s.sceneId,
    })

    await newTask(s, workflow.id, { title: "Lunes", scheduledFor: "2026-03-09T06:00:00.000Z" })
    await newTask(s, workflow.id, { title: "Miércoles", scheduledFor: "2026-03-11T06:00:00.000Z" })
    await newTask(s, workflow.id, {
      title: "Otra semana",
      scheduledFor: "2026-03-17T06:00:00.000Z",
    })
    await newTask(s, workflow.id, { title: "Sin fecha" })

    const response = await request(
      "GET",
      `${base(s)}/workflows/${workflow.id}/document`,
      undefined,
      s.session.cookie,
    )

    expect(response.status).toBe(200)
    const { document, reference } = await json<{ document: WorkPlanDoc; reference: string }>(
      response,
    )

    expect(document.kind).toBe("work-plan")
    expect(document.production.name).toMatch(/^Serie Piloto \d+$/)
    expect(document.issuer.name).toBe("Estudios Mariposa")
    expect(document.weeks).toHaveLength(2)
    expect(document.weeks[0]?.days.map((day) => day.day)).toEqual(["2026-03-09", "2026-03-11"])
    expect(document.undated.map((task) => task.title)).toEqual(["Sin fecha"])
    expect(document.totals.tasks).toBe(4)
    expect(reference).not.toBe("")
  })

  it("el enlace lo abre quien no tiene cuenta, y no puede modificarlo", async () => {
    // Escenario: «El equipo consulta el plan sin cuenta».
    const s = await stage()
    const workflow = await newWorkflow(s)
    await newTask(s, workflow.id, { title: "Lo que hay que hacer" })

    const { reference } = await json<{ reference: string }>(
      await request(
        "GET",
        `${base(s)}/workflows/${workflow.id}/document`,
        undefined,
        s.session.cookie,
      ),
    )

    // Sin cookie: quien recibe el enlace no tiene sesión.
    const publico = await request("GET", `/public/documents/${reference}`)
    expect(publico.status).toBe(200)

    const { document } = await json<{ document: WorkPlanDoc }>(publico)
    expect(document.kind).toBe("work-plan")
    expect(document.identity.code).toBe(workflow.code)
    expect(document.undated.map((task) => task.title)).toEqual(["Lo que hay que hacer"])

    // No hay verbo de escritura por ese camino.
    const escritura = await request("POST", `/public/documents/${reference}`, { body: "no" })
    expect(escritura.status).toBe(404)
  })

  it("una referencia alterada responde 404 sin decir por qué", async () => {
    const s = await stage()
    const workflow = await newWorkflow(s)

    const { reference } = await json<{ reference: string }>(
      await request(
        "GET",
        `${base(s)}/workflows/${workflow.id}/document`,
        undefined,
        s.session.cookie,
      ),
    )

    const alterada = `${reference.slice(0, -2)}${reference.slice(-2) === "AA" ? "BB" : "AA"}`
    const response = await request("GET", `/public/documents/${alterada}`)

    expect(response.status).toBe(404)
  })

  it("un plan dado de baja deja de servirse por su enlace", async () => {
    const s = await stage()
    const workflow = await newWorkflow(s)

    const { reference } = await json<{ reference: string }>(
      await request(
        "GET",
        `${base(s)}/workflows/${workflow.id}/document`,
        undefined,
        s.session.cookie,
      ),
    )

    await request("DELETE", `${base(s)}/workflows/${workflow.id}`, undefined, s.session.cookie)

    const response = await request("GET", `/public/documents/${reference}`)
    expect(response.status).toBe(404)
  })
})

// ─── Las claves finas ────────────────────────────────────────────────────────

describe("las claves finas se exigen encima de la gruesa", () => {
  it("editar una tarea no permite cambiarle el estado sin «task_status»", async () => {
    const s = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)

    const acotada = await memberWith(s.companyId, [
      "productions.workflows.view",
      "productions.workflows.task_edit",
    ])

    const titulo = await request(
      "PATCH",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}`,
      { title: "Corregido" },
      acotada,
    )
    expect(titulo.status).toBe(200)

    const estado = await request(
      "PATCH",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}`,
      { status: "completed" },
      acotada,
    )
    expect(estado.status).toBe(403)
  })

  it("comentar una tarea exige «task_comments»", async () => {
    const s = await stage()
    const workflow = await newWorkflow(s)
    const task = await newTask(s, workflow.id)

    const acotada = await memberWith(s.companyId, ["productions.workflows.view"])

    const response = await request(
      "POST",
      `${base(s)}/workflows/${workflow.id}/tasks/${task.id}/comments`,
      { body: "No debería entrar" },
      acotada,
    )

    expect(response.status).toBe(403)
  })
})
