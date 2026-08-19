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
  productionScripts,
  productions,
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
