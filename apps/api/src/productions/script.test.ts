/**
 * El desglose del guion: guiones, capítulos y escenas.
 *
 * Transcritas de los escenarios de `openspec/specs/script-breakdown/spec.md` y de los recuentos y
 * la etiqueta compuesta de `openspec/specs/computed-fields/spec.md`.
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
  productionRecordings,
  productionScripts,
  productions,
  productionWorkflows,
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

interface Script {
  id: string
  productionId: string
  name: string
  index: number
  documentUploadId: string | null
  documentUrl: string | null
  responsibleId: string | null
  syncStatus: string
  syncError: string | null
  syncedAt: string | null
  scenesWithoutBody: number
  chapterCount: number
}

interface Chapter {
  id: string
  productionId: string
  scriptId: string | null
  name: string
  synopsis: string
  index: number
  sceneCount: number
}

interface Scene {
  id: string
  chapterId: string
  chapterIndex: number
  name: string
  synopsis: string
  index: number
  label: string
  workflowCount: number
  synopsisEditedAt: string | null
  missingFromLastSync: boolean
}

interface IndexHint {
  lastIndex: number | null
  nextIndex: number
  available: boolean | null
}

interface Breakdown {
  chapters: (Chapter & { scenes: Scene[] })[]
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
  if (!existing) await db.insert(services).values({ id: serviceId, keycode, name: keycode })

  await db
    .insert(companyServices)
    .values({ id: newId(), companyId, serviceId })
    .onConflictDoNothing()
}

async function newCompany(session: Session, name = "Estudios Mariposa") {
  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name }, session.cookie),
  )
  await enableService(company.id, "productions")
  return company
}

async function newProduction(session: Session, companyId: string) {
  const response = await request(
    "POST",
    `/companies/${companyId}/productions`,
    { name: "Serie Piloto" },
    session.cookie,
  )
  expect(response.status).toBe(201)
  return json<{ id: string }>(response)
}

/**
 * Un archivo subido de esta empresa, escrito directamente.
 *
 * El prefijo de la clave del objeto es lo que lo acota al arrendatario —el archivo no lleva
 * empresa—, así que se escribe con el mismo formato que usa la confirmación de subida.
 */
async function newDocument(companyId: string, fileName = "guion-v1.pdf") {
  const id = newId()
  await db.insert(uploads).values({
    id,
    kind: "document",
    status: "uploaded",
    url: `https://archivos.ejemplo.mx/${companyId}/${id}.pdf`,
    fileName,
    extension: "pdf",
    contentType: "application/pdf",
    byteSize: 4096,
    storagePath: `${companyId}/`,
  })
  return id
}

async function newScript(
  session: Session,
  companyId: string,
  productionId: string,
  body: Record<string, unknown> = { name: "Guion de rodaje" },
) {
  const response = await request(
    "POST",
    `/companies/${companyId}/productions/${productionId}/scripts`,
    body,
    session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Script>(response)
}

async function newChapter(
  session: Session,
  companyId: string,
  productionId: string,
  body: Record<string, unknown>,
) {
  const response = await request(
    "POST",
    `/companies/${companyId}/productions/${productionId}/chapters`,
    body,
    session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Chapter>(response)
}

async function newScene(
  session: Session,
  companyId: string,
  productionId: string,
  chapterId: string,
  body: Record<string, unknown>,
) {
  const response = await request(
    "POST",
    `/companies/${companyId}/productions/${productionId}/chapters/${chapterId}/scenes`,
    body,
    session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Scene>(response)
}

let scopedAccounts = 0

/** Una cuenta de la misma empresa con un rol acotado a las claves que se le pasen. */
async function memberWith(companyId: string, permissions: string[]): Promise<string> {
  scopedAccounts += 1
  const email = `acotada-guion-${scopedAccounts}@ejemplo.mx`
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

// ─── Guiones ─────────────────────────────────────────────────────────────────

describe("los guiones de una producción", () => {
  it("un guion recién registrado está sin extraer", async () => {
    // Escenario: «Se registra un guion → queda registrado y marcado como no extraído».
    const session = await signUp("guiones@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const document = await newDocument(company.id)

    const script = await newScript(session, company.id, production.id, {
      name: "Guion de rodaje",
      index: 1,
      documentUploadId: document,
    })

    expect(script.name).toBe("Guion de rodaje")
    expect(script.index).toBe(1)
    expect(script.documentUploadId).toBe(document)
    expect(script.documentUrl).toContain(document)
    expect(script.syncStatus).toBe("not_extracted")
    expect(script.chapterCount).toBe(0)
  })

  it("sustituir el archivo devuelve el guion a sin extraer", async () => {
    // Escenario: «Sustituir el archivo invalida la extracción».
    const session = await signUp("sustituye@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const first = await newDocument(company.id, "guion-v1.pdf")
    const second = await newDocument(company.id, "guion-v2.pdf")

    const script = await newScript(session, company.id, production.id, {
      name: "Guion",
      documentUploadId: first,
    })

    // El estado de una extracción terminada lo escribe la rebanada 21, que no existe todavía: se
    // pone a mano para poder comprobar que **sustituir lo deshace**, que es lo que se prueba.
    await db
      .update(productionScripts)
      .set({
        syncStatus: "completed",
        syncedAt: new Date(),
        syncError: null,
        scenesWithoutBody: 3,
      })
      .where(eq(productionScripts.id, script.id))

    const response = await request(
      "PATCH",
      `/companies/${company.id}/productions/${production.id}/scripts/${script.id}`,
      { documentUploadId: second },
      session.cookie,
    )

    expect(response.status).toBe(200)
    const updated = await json<Script>(response)
    expect(updated.documentUploadId).toBe(second)
    expect(updated.syncStatus).toBe("not_extracted")
    expect(updated.syncedAt).toBeNull()
    expect(updated.scenesWithoutBody).toBe(0)
  })

  it("volver a asignar el mismo archivo no invalida la extracción", async () => {
    // El requisito dice «se **sustituye** su archivo». Guardar el guion con el archivo que ya
    // tenía no sustituye nada, y tirar por tierra una extracción de media hora porque alguien
    // corrigió el nombre sería exactamente el defecto que este escenario existe para evitar.
    const session = await signUp("mismo-archivo@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const document = await newDocument(company.id)

    const script = await newScript(session, company.id, production.id, {
      name: "Guion",
      documentUploadId: document,
    })

    await db
      .update(productionScripts)
      .set({ syncStatus: "completed", syncedAt: new Date() })
      .where(eq(productionScripts.id, script.id))

    const response = await request(
      "PATCH",
      `/companies/${company.id}/productions/${production.id}/scripts/${script.id}`,
      { name: "Guion corregido", documentUploadId: document },
      session.cookie,
    )

    expect(response.status).toBe(200)
    const updated = await json<Script>(response)
    expect(updated.name).toBe("Guion corregido")
    expect(updated.syncStatus).toBe("completed")
    expect(updated.syncedAt).not.toBeNull()
  })

  it("retirar el archivo también invalida la extracción", async () => {
    // Quitarlo sin poner otro deja al guion sin nada de lo que se pudiera haber extraído: los
    // capítulos que hubiera se quedarían diciendo que proceden de un archivo que ya no está.
    const session = await signUp("retira-archivo@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const document = await newDocument(company.id)

    const script = await newScript(session, company.id, production.id, {
      name: "Guion",
      documentUploadId: document,
    })

    await db
      .update(productionScripts)
      .set({ syncStatus: "completed", syncedAt: new Date() })
      .where(eq(productionScripts.id, script.id))

    const response = await request(
      "PATCH",
      `/companies/${company.id}/productions/${production.id}/scripts/${script.id}`,
      { documentUploadId: null },
      session.cookie,
    )

    expect(response.status).toBe(200)
    const updated = await json<Script>(response)
    expect(updated.documentUploadId).toBeNull()
    expect(updated.syncStatus).toBe("not_extracted")
  })

  it("un archivo que no es documento no se admite", async () => {
    const session = await signUp("no-documento@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const imageId = newId()
    await db.insert(uploads).values({
      id: imageId,
      kind: "image",
      status: "uploaded",
      url: `https://archivos.ejemplo.mx/${company.id}/${imageId}.png`,
      fileName: "foto.png",
      extension: "png",
      contentType: "image/png",
      byteSize: 1024,
      storagePath: `${company.id}/`,
    })

    const response = await request(
      "POST",
      `/companies/${company.id}/productions/${production.id}/scripts`,
      { name: "Guion", documentUploadId: imageId },
      session.cookie,
    )

    expect(response.status).toBe(422)
  })

  it("un archivo de otra empresa responde que no existe", async () => {
    // La misma respuesta que para uno inexistente: distinguirlas confirmaría que existe.
    const session = await signUp("archivo-ajeno@ejemplo.mx")
    const company = await newCompany(session)
    const otherCompany = await newCompany(session, "Otra Casa")
    const production = await newProduction(session, company.id)
    const foreign = await newDocument(otherCompany.id)

    const response = await request(
      "POST",
      `/companies/${company.id}/productions/${production.id}/scripts`,
      { name: "Guion", documentUploadId: foreign },
      session.cookie,
    )

    expect(response.status).toBe(404)
    // Y **por el archivo**, no porque la ruta no exista o la producción no se alcance: sin esto la
    // prueba pasa en verde mientras no haya ruta ninguna, que es la peor forma de estar en verde.
    expect(await response.text()).toContain("archivo")
  })

  it("el listado busca por nombre y ordena por índice", async () => {
    const session = await signUp("listado-guiones@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    await newScript(session, company.id, production.id, { name: "Escaleta", index: 2 })
    await newScript(session, company.id, production.id, { name: "Guion literario", index: 1 })

    const all = await json<{ items: Script[]; totalItems: number }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/scripts`,
        undefined,
        session.cookie,
      ),
    )
    expect(all.totalItems).toBe(2)
    expect(all.items.map((row) => row.index)).toEqual([1, 2])

    const found = await json<{ items: Script[] }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/scripts?search=escaleta`,
        undefined,
        session.cookie,
      ),
    )
    expect(found.items.map((row) => row.name)).toEqual(["Escaleta"])
  })

  it("un guion dado de baja deja de listarse y de poder leerse", async () => {
    const session = await signUp("baja-guion@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const script = await newScript(session, company.id, production.id)

    const removed = await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}/scripts/${script.id}`,
      undefined,
      session.cookie,
    )
    expect(removed.status).toBe(204)

    const gone = await request(
      "GET",
      `/companies/${company.id}/productions/${production.id}/scripts/${script.id}`,
      undefined,
      session.cookie,
    )
    expect(gone.status).toBe(404)

    const listed = await json<{ totalItems: number }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/scripts`,
        undefined,
        session.cookie,
      ),
    )
    expect(listed.totalItems).toBe(0)
  })

  it("sin la clave de guiones no se crea ninguno", async () => {
    const session = await signUp("duena-guiones@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const cookie = await memberWith(company.id, [
      "productions.productions.view",
      "productions.pdfs.view",
    ])

    const response = await request(
      "POST",
      `/companies/${company.id}/productions/${production.id}/scripts`,
      { name: "Guion" },
      cookie,
    )

    expect(response.status).toBe(403)
  })

  it("una producción de otra empresa responde que no existe", async () => {
    const owner = await signUp("duena-ajena@ejemplo.mx")
    const company = await newCompany(owner, "Casa Ajena")
    const production = await newProduction(owner, company.id)

    const intruder = await signUp("intrusa@ejemplo.mx")
    const own = await newCompany(intruder, "Casa Propia")

    const response = await request(
      "GET",
      `/companies/${own.id}/productions/${production.id}/scripts`,
      undefined,
      intruder.cookie,
    )

    expect(response.status).toBe(404)
    expect(await response.text()).toContain("producción")
  })
})

// ─── Capítulos ───────────────────────────────────────────────────────────────

describe("los capítulos de una producción", () => {
  it("un capítulo se registra con el índice que se le da", async () => {
    // Escenario: «Se crea un capítulo → queda registrado en la producción».
    const session = await signUp("capitulos@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const chapter = await newChapter(session, company.id, production.id, {
      name: "El regreso",
      synopsis: "Vuelve al pueblo",
      index: 3,
    })

    expect(chapter.name).toBe("El regreso")
    expect(chapter.index).toBe(3)
    expect(chapter.scriptId).toBeNull()
    // Escenario de `computed-fields`: «una colección vacía cuenta cero».
    expect(chapter.sceneCount).toBe(0)
  })

  it("un índice de capítulo repetido se rechaza", async () => {
    // Escenario: «GIVEN una producción con el capítulo número tres, WHEN se intenta crear otro con
    // el mismo número, THEN la respuesta es 409».
    const session = await signUp("indice-repetido@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    await newChapter(session, company.id, production.id, { name: "Tres", index: 3 })

    const response = await request(
      "POST",
      `/companies/${company.id}/productions/${production.id}/chapters`,
      { name: "Otro tres", index: 3 },
      session.cookie,
    )

    expect(response.status).toBe(409)
  })

  it("el mismo índice en otra producción sí vale", async () => {
    const session = await signUp("indice-otra@ejemplo.mx")
    const company = await newCompany(session)
    const one = await newProduction(session, company.id)
    const other = await newProduction(session, company.id)

    await newChapter(session, company.id, one.id, { name: "Tres", index: 3 })
    const twin = await newChapter(session, company.id, other.id, { name: "Tres", index: 3 })

    expect(twin.index).toBe(3)
  })

  it("editar un capítulo hacia un índice ocupado se rechaza", async () => {
    const session = await signUp("mueve-indice@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })
    const second = await newChapter(session, company.id, production.id, { name: "Dos", index: 2 })

    const response = await request(
      "PATCH",
      `/companies/${company.id}/productions/${production.id}/chapters/${second.id}`,
      { index: 1 },
      session.cookie,
    )

    expect(response.status).toBe(409)

    // Y guardarlo con el índice que ya tenía no choca consigo mismo.
    const same = await request(
      "PATCH",
      `/companies/${company.id}/productions/${production.id}/chapters/${second.id}`,
      { index: 2, name: "Dos corregido" },
      session.cookie,
    )
    expect(same.status).toBe(200)
  })

  it("dar de baja el capítulo de en medio no mueve los índices de los demás", async () => {
    // **La decisión central del módulo.** En un guion real los números son la referencia de todo el
    // papeleo del equipo: renumerar al borrar dejaría a media producción hablando de un capítulo
    // que ya es otro. Esta prueba existe para que nadie lo «arregle».
    const session = await signUp("sin-renumerar@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const first = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })
    const middle = await newChapter(session, company.id, production.id, { name: "Dos", index: 2 })
    const last = await newChapter(session, company.id, production.id, { name: "Tres", index: 3 })

    const removed = await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}/chapters/${middle.id}`,
      undefined,
      session.cookie,
    )
    expect(removed.status).toBe(204)

    const listed = await json<{ items: Chapter[] }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters`,
        undefined,
        session.cookie,
      ),
    )

    expect(listed.items.map((row) => row.id)).toEqual([first.id, last.id])
    expect(listed.items.map((row) => row.index)).toEqual([1, 3])
  })

  it("el índice de un capítulo dado de baja vuelve a estar libre", async () => {
    // El único es parcial —«where deleted_at is null»—, así que el hueco se puede volver a ocupar.
    // Es lo contrario de renumerar: el número se reutiliza porque alguien lo pide, no solo.
    const session = await signUp("hueco-libre@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const chapter = await newChapter(session, company.id, production.id, { name: "Dos", index: 2 })
    await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}`,
      undefined,
      session.cookie,
    )

    const reused = await newChapter(session, company.id, production.id, {
      name: "Dos, otra vez",
      index: 2,
    })
    expect(reused.index).toBe(2)
    expect(reused.id).not.toBe(chapter.id)
  })

  it("un capítulo declara de qué guion procede, y no vale uno de otra producción", async () => {
    const session = await signUp("capitulo-guion@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const other = await newProduction(session, company.id)

    const script = await newScript(session, company.id, production.id, { name: "Guion" })
    const chapter = await newChapter(session, company.id, production.id, {
      name: "Uno",
      index: 1,
      scriptId: script.id,
    })
    expect(chapter.scriptId).toBe(script.id)

    const foreign = await request(
      "POST",
      `/companies/${company.id}/productions/${other.id}/chapters`,
      { name: "Uno", index: 1, scriptId: script.id },
      session.cookie,
    )
    expect(foreign.status).toBe(404)
    expect(await foreign.text()).toContain("guion")
  })

  it("los capítulos sobreviven al guion del que se extrajeron", async () => {
    // Escenario: «GIVEN un guion del que se extrajeron tres capítulos, WHEN se elimina el guion,
    // THEN los tres capítulos y sus escenas siguen existiendo».
    const session = await signUp("guion-baja@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const script = await newScript(session, company.id, production.id, { name: "Guion" })

    for (const index of [1, 2, 3]) {
      await newChapter(session, company.id, production.id, {
        name: `Capítulo ${index}`,
        index,
        scriptId: script.id,
      })
    }

    const scope = await json<{ chapters: number }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/scripts/${script.id}/scope`,
        undefined,
        session.cookie,
      ),
    )
    expect(scope.chapters).toBe(3)

    await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}/scripts/${script.id}`,
      undefined,
      session.cookie,
    )

    const listed = await json<{ items: Chapter[]; totalItems: number }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters`,
        undefined,
        session.cookie,
      ),
    )

    expect(listed.totalItems).toBe(3)
    expect(listed.items.every((row) => row.scriptId === null)).toBe(true)
    expect(listed.items.map((row) => row.index)).toEqual([1, 2, 3])
  })

  it("los capítulos se buscan por nombre y por sinopsis", async () => {
    // Requisito «Búsqueda en el desglose».
    const session = await signUp("busca-capitulos@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    await newChapter(session, company.id, production.id, {
      name: "El regreso",
      synopsis: "Vuelve al pueblo en autobús",
      index: 1,
    })
    await newChapter(session, company.id, production.id, {
      name: "La despedida",
      synopsis: "Se marcha de madrugada",
      index: 2,
    })

    const byName = await json<{ items: Chapter[] }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters?search=regreso`,
        undefined,
        session.cookie,
      ),
    )
    expect(byName.items.map((row) => row.name)).toEqual(["El regreso"])

    const bySynopsis = await json<{ items: Chapter[] }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters?search=madrugada`,
        undefined,
        session.cookie,
      ),
    )
    expect(bySynopsis.items.map((row) => row.name)).toEqual(["La despedida"])
  })

  it("sin la clave de capítulos no se crea ninguno", async () => {
    const session = await signUp("acota-capitulos@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const cookie = await memberWith(company.id, [
      "productions.productions.view",
      "productions.chapters.view",
    ])

    const response = await request(
      "POST",
      `/companies/${company.id}/productions/${production.id}/chapters`,
      { name: "Uno", index: 1 },
      cookie,
    )

    expect(response.status).toBe(403)
  })
})

// ─── Escenas ─────────────────────────────────────────────────────────────────

describe("las escenas de un capítulo", () => {
  it("una escena se registra en su capítulo, con su etiqueta compuesta", async () => {
    // Escenario: «Se crea una escena en un capítulo». Y el de `computed-fields`: «GIVEN la escena
    // número 4 del capítulo número 2, THEN su índice de capítulo es 2 y su etiqueta compuesta
    // distingue esta escena de la escena 4 de cualquier otro capítulo».
    const session = await signUp("escenas@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const chapter = await newChapter(session, company.id, production.id, { name: "Dos", index: 2 })

    const scene = await newScene(session, company.id, production.id, chapter.id, {
      name: "Interior día",
      synopsis: "Discuten en la cocina",
      index: 4,
    })

    expect(scene.chapterId).toBe(chapter.id)
    expect(scene.chapterIndex).toBe(2)
    expect(scene.index).toBe(4)
    expect(scene.label).toBe("2.4")
    expect(scene.workflowCount).toBe(0)
  })

  it("el mismo índice de escena en otro capítulo sí vale, y las etiquetas las distinguen", async () => {
    // Escenario: «GIVEN la escena número cinco del capítulo uno, WHEN se crea la escena número
    // cinco del capítulo dos, THEN la operación se completa».
    const session = await signUp("escena-gemela@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const one = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })
    const two = await newChapter(session, company.id, production.id, { name: "Dos", index: 2 })

    const first = await newScene(session, company.id, production.id, one.id, {
      name: "Cinco",
      index: 5,
    })
    const second = await newScene(session, company.id, production.id, two.id, {
      name: "Cinco",
      index: 5,
    })

    expect(first.label).toBe("1.5")
    expect(second.label).toBe("2.5")
    expect(first.label).not.toBe(second.label)
  })

  it("un índice de escena repetido en el mismo capítulo se rechaza", async () => {
    const session = await signUp("escena-repetida@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const chapter = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })

    await newScene(session, company.id, production.id, chapter.id, { name: "Cinco", index: 5 })

    const response = await request(
      "POST",
      `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scenes`,
      { name: "Otra cinco", index: 5 },
      session.cookie,
    )

    expect(response.status).toBe(409)
  })

  it("un capítulo con seis escenas indica seis", async () => {
    // Escenario de `computed-fields`: «GIVEN un capítulo con seis escenas, THEN indica seis».
    const session = await signUp("seis-escenas@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const chapter = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })

    for (const index of [1, 2, 3, 4, 5, 6]) {
      await newScene(session, company.id, production.id, chapter.id, {
        name: `Escena ${index}`,
        index,
      })
    }

    const read = await json<Chapter>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}`,
        undefined,
        session.cookie,
      ),
    )

    expect(read.sceneCount).toBe(6)
  })

  it("dar de baja el capítulo arrastra sus seis escenas, y lo dice antes", async () => {
    // Escenario: «GIVEN un capítulo con seis escenas, WHEN se elimina el capítulo, THEN las seis
    // escenas desaparecen con él». Y «SHALL enumerar previamente cuántas son».
    const session = await signUp("arrastra@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const chapter = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })

    for (const index of [1, 2, 3, 4, 5, 6]) {
      await newScene(session, company.id, production.id, chapter.id, {
        name: `Escena ${index}`,
        index,
      })
    }

    const scope = await json<{ scenes: number; recordings: number; workflows: number }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scope`,
        undefined,
        session.cookie,
      ),
    )
    expect(scope.scenes).toBe(6)

    await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}`,
      undefined,
      session.cookie,
    )

    // Se van con él: ninguna sobrevive suelta en la producción.
    const remaining = await json<{ totalItems: number }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/scenes`,
        undefined,
        session.cookie,
      ),
    )
    expect(remaining.totalItems).toBe(0)
  })

  it("las jornadas de rodaje sobreviven a la escena, sin escena y en su estado inicial", async () => {
    // Escenario: «GIVEN una escena con una jornada de rodaje en curso, WHEN se elimina la escena,
    // THEN la jornada sigue existiendo sin escena asignada AND vuelve a su estado inicial».
    //
    // Las jornadas son de otro encargo: se escriben directamente contra su tabla, que es lo que
    // permite construir las dos cosas a la vez sin pisarse.
    const session = await signUp("jornadas@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const chapter = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })
    const scene = await newScene(session, company.id, production.id, chapter.id, {
      name: "Interior día",
      index: 1,
    })

    const recordingId = newId()
    await db.insert(productionRecordings).values({
      id: recordingId,
      productionId: production.id,
      sceneId: scene.id,
      name: "Jornada del martes",
      kind: "record",
      status: "ongoing",
    })

    const removed = await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scenes/${scene.id}`,
      undefined,
      session.cookie,
    )
    expect(removed.status).toBe(204)

    const [survivor] = await db
      .select()
      .from(productionRecordings)
      .where(eq(productionRecordings.id, recordingId))

    expect(survivor).toBeDefined()
    expect(survivor?.deletedAt).toBeNull()
    expect(survivor?.sceneId).toBeNull()
    expect(survivor?.status).toBe("draft")
  })

  it("los planes de trabajo sobreviven a la escena, y vuelven a pendiente", async () => {
    // Escenario: «GIVEN una escena con dos planes de trabajo asociados, WHEN se elimina la escena,
    // THEN los dos planes siguen existiendo sin escena asignada AND vuelven a su estado inicial».
    const session = await signUp("planes@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const chapter = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })
    const scene = await newScene(session, company.id, production.id, chapter.id, {
      name: "Interior día",
      index: 1,
    })

    // Los planes nacen por su propia ruta, que ya existe; asociarlos a una escena no está en ella,
    // así que el vínculo y el estado se escriben contra la tabla.
    const plans: string[] = []
    for (const observations of ["Arte", "Vestuario"]) {
      const plan = await json<{ id: string }>(
        await request(
          "POST",
          `/companies/${company.id}/productions/${production.id}/workflows`,
          { scheduledFor: "2026-09-01T08:00:00.000Z", observations },
          session.cookie,
        ),
      )
      plans.push(plan.id)
      await db
        .update(productionWorkflows)
        .set({ sceneId: scene.id, status: "in_progress" })
        .where(eq(productionWorkflows.id, plan.id))
    }

    const counted = await json<Scene>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scenes/${scene.id}`,
        undefined,
        session.cookie,
      ),
    )
    // `computed-fields`, «Planes de una escena».
    expect(counted.workflowCount).toBe(2)

    await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scenes/${scene.id}`,
      undefined,
      session.cookie,
    )

    for (const planId of plans) {
      const read = await json<{ sceneId: string | null; status: string }>(
        await request(
          "GET",
          `/companies/${company.id}/productions/${production.id}/workflows/${planId}`,
          undefined,
          session.cookie,
        ),
      )
      expect(read.sceneId).toBeNull()
      expect(read.status).toBe("pending")
    }
  })

  it("dar de baja el capítulo suelta también las jornadas de sus escenas", async () => {
    // La composición que la spec no enuncia y que sin embargo se deduce de sus dos requisitos: si
    // eliminar el capítulo elimina sus escenas, y eliminar una escena suelta lo que la referencia,
    // eliminar el capítulo tiene que soltar lo que referenciaba a sus escenas. Sin esto quedan
    // jornadas apuntando a escenas muertas.
    const session = await signUp("capitulo-suelta@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const chapter = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })
    const scene = await newScene(session, company.id, production.id, chapter.id, {
      name: "Interior día",
      index: 1,
    })

    const recordingId = newId()
    await db.insert(productionRecordings).values({
      id: recordingId,
      productionId: production.id,
      sceneId: scene.id,
      name: "Jornada del martes",
      status: "ongoing",
    })

    const scope = await json<{ scenes: number; recordings: number }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scope`,
        undefined,
        session.cookie,
      ),
    )
    expect(scope.scenes).toBe(1)
    expect(scope.recordings).toBe(1)

    await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}`,
      undefined,
      session.cookie,
    )

    const [survivor] = await db
      .select()
      .from(productionRecordings)
      .where(eq(productionRecordings.id, recordingId))

    expect(survivor?.sceneId).toBeNull()
    expect(survivor?.status).toBe("draft")
  })

  it("dar de baja la escena de en medio no mueve los índices de las demás", async () => {
    const session = await signUp("escenas-sin-renumerar@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const chapter = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })

    await newScene(session, company.id, production.id, chapter.id, { name: "Una", index: 1 })
    const middle = await newScene(session, company.id, production.id, chapter.id, {
      name: "Dos",
      index: 2,
    })
    await newScene(session, company.id, production.id, chapter.id, { name: "Tres", index: 3 })

    await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scenes/${middle.id}`,
      undefined,
      session.cookie,
    )

    const listed = await json<{ items: Scene[] }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scenes`,
        undefined,
        session.cookie,
      ),
    )

    expect(listed.items.map((row) => row.index)).toEqual([1, 3])
    expect(listed.items.map((row) => row.label)).toEqual(["1.1", "1.3"])
  })

  it("corregir la sinopsis a mano deja marca, y cambiar el nombre no", async () => {
    // La columna existe para que la extracción no sobrescriba lo que una persona escribió: quien
    // la escribe es esta ruta, y sin ella la marca no la pondría nadie.
    const session = await signUp("sinopsis@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const chapter = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })
    const scene = await newScene(session, company.id, production.id, chapter.id, {
      name: "Interior día",
      index: 1,
    })
    expect(scene.synopsisEditedAt).toBeNull()

    const renamed = await json<Scene>(
      await request(
        "PATCH",
        `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scenes/${scene.id}`,
        { name: "Interior noche" },
        session.cookie,
      ),
    )
    expect(renamed.synopsisEditedAt).toBeNull()

    const edited = await json<Scene>(
      await request(
        "PATCH",
        `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scenes/${scene.id}`,
        { synopsis: "Lo escribo yo" },
        session.cookie,
      ),
    )
    expect(edited.synopsis).toBe("Lo escribo yo")
    expect(edited.synopsisEditedAt).not.toBeNull()
  })

  it("las escenas se buscan por nombre y por sinopsis", async () => {
    const session = await signUp("busca-escenas@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const chapter = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })

    await newScene(session, company.id, production.id, chapter.id, {
      name: "Interior día",
      synopsis: "Discuten en la cocina",
      index: 1,
    })
    await newScene(session, company.id, production.id, chapter.id, {
      name: "Exterior noche",
      synopsis: "Corre bajo la lluvia",
      index: 2,
    })

    const found = await json<{ items: Scene[] }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scenes?search=lluvia`,
        undefined,
        session.cookie,
      ),
    )
    expect(found.items.map((row) => row.name)).toEqual(["Exterior noche"])
  })

  it("una escena de otro capítulo responde que no existe", async () => {
    const session = await signUp("escena-ajena@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const one = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })
    const two = await newChapter(session, company.id, production.id, { name: "Dos", index: 2 })

    const scene = await newScene(session, company.id, production.id, one.id, {
      name: "Una",
      index: 1,
    })

    const response = await request(
      "GET",
      `/companies/${company.id}/productions/${production.id}/chapters/${two.id}/scenes/${scene.id}`,
      undefined,
      session.cookie,
    )
    expect(response.status).toBe(404)
  })

  it("sin la clave de escenas no se crea ninguna", async () => {
    const session = await signUp("acota-escenas@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const chapter = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })
    const cookie = await memberWith(company.id, [
      "productions.productions.view",
      "productions.chapters.view",
      "productions.scenes.view",
    ])

    const response = await request(
      "POST",
      `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scenes`,
      { name: "Una", index: 1 },
      cookie,
    )

    expect(response.status).toBe(403)
  })
})

// ─── El siguiente índice libre ───────────────────────────────────────────────

describe("la consulta del siguiente índice libre", () => {
  it("una producción sin capítulos propone el uno", async () => {
    const session = await signUp("primer-indice@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const hint = await json<IndexHint>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters/indices`,
        undefined,
        session.cookie,
      ),
    )

    expect(hint.lastIndex).toBeNull()
    expect(hint.nextIndex).toBe(1)
    expect(hint.available).toBeNull()
  })

  it("un capítulo cuya última escena es la siete propone la ocho", async () => {
    // Escenario: «GIVEN un capítulo cuya última escena es la número siete, WHEN se consulta su
    // último índice, THEN se obtiene 7 AND la interfaz propone 8».
    const session = await signUp("siguiente-escena@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const chapter = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })

    for (const index of [1, 2, 7]) {
      await newScene(session, company.id, production.id, chapter.id, {
        name: `Escena ${index}`,
        index,
      })
    }

    const hint = await json<IndexHint>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scenes/indices`,
        undefined,
        session.cookie,
      ),
    )

    expect(hint.lastIndex).toBe(7)
    expect(hint.nextIndex).toBe(8)
  })

  it("se comprueba si un índice concreto está libre", async () => {
    // Escenario: «WHEN se consulta si un índice está libre en un capítulo, THEN se obtiene una
    // respuesta booleana».
    const session = await signUp("indice-libre@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const chapter = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })

    await newScene(session, company.id, production.id, chapter.id, { name: "Cinco", index: 5 })

    const taken = await json<IndexHint>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scenes/indices?index=5`,
        undefined,
        session.cookie,
      ),
    )
    expect(taken.available).toBe(false)

    const free = await json<IndexHint>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters/${chapter.id}/scenes/indices?index=6`,
        undefined,
        session.cookie,
      ),
    )
    expect(free.available).toBe(true)
  })

  it("los huecos que deja borrar **no** se rellenan solos", async () => {
    // La otra cara de que los índices no se renumeren: con 1, 2 y 3, borrar el 2 deja el siguiente
    // libre en 4 y **no** en 2. Rellenar el hueco reutilizaría un número que el equipo ya usó en su
    // papeleo, que es la misma confusión que renumerar, por la puerta de atrás.
    const session = await signUp("hueco-no-relleno@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })
    const middle = await newChapter(session, company.id, production.id, { name: "Dos", index: 2 })
    await newChapter(session, company.id, production.id, { name: "Tres", index: 3 })

    await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}/chapters/${middle.id}`,
      undefined,
      session.cookie,
    )

    const hint = await json<IndexHint>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/chapters/indices?index=2`,
        undefined,
        session.cookie,
      ),
    )

    expect(hint.lastIndex).toBe(3)
    expect(hint.nextIndex).toBe(4)
    // El hueco está libre —se puede pedir a mano, que es el «12A»—, pero no se propone.
    expect(hint.available).toBe(true)
  })
})

// ─── La estructura completa ──────────────────────────────────────────────────

describe("la estructura de una producción", () => {
  it("se obtiene como índice navegable, por índice y con sus escenas", async () => {
    // Escenario: «WHEN se solicita la estructura de una producción, THEN se obtienen sus capítulos
    // ordenados por índice AND cada uno con sus escenas ordenadas por índice».
    const session = await signUp("estructura@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    // Creados a propósito **fuera de orden**: si la consulta no ordenara, saldrían así.
    const second = await newChapter(session, company.id, production.id, { name: "Dos", index: 2 })
    const first = await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })

    await newScene(session, company.id, production.id, first.id, { name: "B", index: 3 })
    await newScene(session, company.id, production.id, first.id, { name: "A", index: 1 })
    await newScene(session, company.id, production.id, second.id, { name: "C", index: 2 })

    const structure = await json<Breakdown>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/breakdown`,
        undefined,
        session.cookie,
      ),
    )

    expect(structure.chapters.map((row) => row.index)).toEqual([1, 2])
    expect(structure.chapters[0]?.scenes.map((row) => row.index)).toEqual([1, 3])
    expect(structure.chapters[0]?.scenes.map((row) => row.label)).toEqual(["1.1", "1.3"])
    expect(structure.chapters[0]?.sceneCount).toBe(2)
    expect(structure.chapters[1]?.scenes.map((row) => row.label)).toEqual(["2.2"])
  })

  it("un capítulo sin escenas aparece con su lista vacía", async () => {
    const session = await signUp("estructura-vacia@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    await newChapter(session, company.id, production.id, { name: "Uno", index: 1 })

    const structure = await json<Breakdown>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/breakdown`,
        undefined,
        session.cookie,
      ),
    )

    expect(structure.chapters).toHaveLength(1)
    expect(structure.chapters[0]?.scenes).toEqual([])
    expect(structure.chapters[0]?.sceneCount).toBe(0)
  })

  it("quien puede ver capítulos pero no escenas no obtiene la estructura", async () => {
    // La estructura **contiene escenas**. Declarar sólo la clave de capítulos ampliaría en silencio
    // la autoridad de quien la tiene, que es el defecto que cerró H-07 en las cotizaciones.
    const session = await signUp("estructura-acotada@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const cookie = await memberWith(company.id, [
      "productions.productions.view",
      "productions.chapters.view",
    ])

    const response = await request(
      "GET",
      `/companies/${company.id}/productions/${production.id}/breakdown`,
      undefined,
      cookie,
    )

    expect(response.status).toBe(403)
    expect(await response.text()).toContain("productions.scenes.view")
  })
})
