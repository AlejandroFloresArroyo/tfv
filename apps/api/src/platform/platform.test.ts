/**
 * El área de administración de plataforma, de extremo a extremo.
 *
 * Transcritas de `openspec/specs/access-control/spec.md` —«El administrador de plataforma cruza
 * empresas» y «Toda acción de plataforma deja asiento»— y de `app-shell`, «Guarda de administración
 * de plataforma».
 *
 * Aquí cada ruta es una superficie donde un fallo **no filtra los datos de una empresa sino los de
 * todas**. Por eso cada una lleva su prueba de que un usuario corriente no pasa, y por eso el
 * bloque final se salta la API entera y pregunta al motor: si la compuerta de la aplicación
 * desapareciera mañana, el aislamiento tiene que seguir en pie.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db, withElevated, withRequester } from "@tfv/db"
import {
  companies,
  companyMembers,
  loginAttempts,
  notificationDeliveries,
  oneTimeCredentials,
  platformActivities,
  prospects,
  roles,
  sessions,
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
    sql`truncate table ${platformActivities}, ${prospects}, ${notificationDeliveries}, ${oneTimeCredentials}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companies} cascade`,
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
  readonly email: string
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

async function signUp(email: string, { platformAdmin = false } = {}): Promise<Session> {
  await request("POST", "/auth/register", { email, password: PASSWORD, name: email.split("@")[0] })
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), isPlatformAdmin: platformAdmin })
    .where(eq(users.email, email))

  const login = await request("POST", "/auth/login", { email, password: PASSWORD })
  const cookie = login.headers
    .getSetCookie()
    .find((raw) => raw.startsWith("tfv_session="))
    ?.split(";")[0]
  if (!cookie) throw new Error("no se abrió sesión")

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (!user) throw new Error("la cuenta debería existir")

  return { cookie, userId: user.id, email }
}

async function newCompany(session: Session, name: string): Promise<{ id: string; name: string }> {
  const response = await request("POST", "/companies", { name }, session.cookie)
  expect(response.status).toBe(201)
  return json(response)
}

async function capture(email: string, companyName = "Productora Sierra") {
  const response = await request("POST", "/prospects", {
    name: "Ana",
    lastname: "Villarreal",
    email,
    companyName,
    message: "Nos interesa rentar equipo de cámara.",
  })
  expect(response.status).toBe(201)

  const [row] = await db.select().from(prospects).where(eq(prospects.email, email))
  if (!row) throw new Error("el prospecto debería existir")
  return row.id
}

interface Page<T> {
  items: T[]
  totalItems: number
}

// ─── El padrón de empresas ───────────────────────────────────────────────────

describe("el padrón de empresas", () => {
  it("no lo abre quien no es administración de plataforma", async () => {
    // Ocultar el enlace no es protegerlo: quien escriba la dirección se topa con esto.
    const cualquiera = await signUp("ajena@ejemplo.mx")
    expect((await request("GET", "/platform/companies", undefined, cualquiera.cookie)).status).toBe(
      403,
    )
  })

  it("no lo abre quien no trae sesión", async () => {
    expect((await request("GET", "/platform/companies")).status).toBe(401)
  })

  it("enseña empresas de las que la administración no es miembro", async () => {
    // Es la razón de existir del padrón, y a la vez lo más delicado que tiene: la respuesta cruza
    // arrendatarios a propósito.
    const duena = await signUp("duena@ejemplo.mx")
    await newCompany(duena, "Renta Fílmica del Norte")

    const admin = await signUp("admin@ejemplo.mx", { platformAdmin: true })
    const page = await json<Page<{ name: string; memberCount: number }>>(
      await request("GET", "/platform/companies", undefined, admin.cookie),
    )

    const found = page.items.find((row) => row.name === "Renta Fílmica del Norte")
    expect(found).toBeDefined()
    expect(found?.memberCount).toBe(1)
  })

  it("y el mismo listado, para quien no es de plataforma, no existe", async () => {
    const duena = await signUp("duena2@ejemplo.mx")
    await newCompany(duena, "Renta Fílmica del Norte")

    // Ni siquiera las suyas: la ruta es de plataforma, no una vista alternativa de lo propio.
    expect((await request("GET", "/platform/companies", undefined, duena.cookie)).status).toBe(403)
  })

  it("dice quién lleva una empresa ajena", async () => {
    const duena = await signUp("duena3@ejemplo.mx")
    const company = await newCompany(duena, "Renta Fílmica del Norte")
    const admin = await signUp("admin10@ejemplo.mx", { platformAdmin: true })

    const body = await json<{ items: { email: string; isOwner: boolean }[] }>(
      await request("GET", `/platform/companies/${company.id}/members`, undefined, admin.cookie),
    )
    expect(body.items).toHaveLength(1)
    expect(body.items[0]?.email).toBe(duena.email)
    expect(body.items[0]?.isOwner).toBe(true)
  })

  it("y esa lista tampoco la abre nadie más", async () => {
    // Es la ruta más apetecible del área: enseña nombres y correos de una empresa cualquiera.
    const duena = await signUp("duena4@ejemplo.mx")
    const company = await newCompany(duena, "Renta Fílmica del Norte")
    const ajena = await signUp("ajena2@ejemplo.mx")

    expect(
      (await request("GET", `/platform/companies/${company.id}/members`, undefined, ajena.cookie))
        .status,
    ).toBe(403)

    // Ni la propia dueña por esta puerta: para eso está el panel de su empresa, con su permiso.
    expect(
      (await request("GET", `/platform/companies/${company.id}/members`, undefined, duena.cookie))
        .status,
    ).toBe(403)
  })
})

// ─── El padrón de usuarios ───────────────────────────────────────────────────

describe("el padrón de usuarios", () => {
  it("no lo abre quien no es administración de plataforma", async () => {
    const cualquiera = await signUp("ajena3@ejemplo.mx")
    expect((await request("GET", "/platform/users", undefined, cualquiera.cookie)).status).toBe(403)
  })

  it("enseña cuentas con las que no se comparte ninguna empresa", async () => {
    const suelta = await signUp("suelta@ejemplo.mx")
    const admin = await signUp("admin2@ejemplo.mx", { platformAdmin: true })

    const page = await json<Page<{ email: string; companyCount: number }>>(
      await request("GET", "/platform/users?search=suelta", undefined, admin.cookie),
    )
    expect(page.items.map((row) => row.email)).toContain(suelta.email)
    expect(page.items[0]?.companyCount).toBe(0)
  })

  it("no devuelve la contraseña de nadie", async () => {
    await signUp("con-clave@ejemplo.mx")
    const admin = await signUp("admin3@ejemplo.mx", { platformAdmin: true })

    const body = await (await request("GET", "/platform/users", undefined, admin.cookie)).text()
    expect(body).not.toContain("passwordHash")
    expect(body).not.toContain("password_hash")
  })
})

// ─── La bitácora de plataforma ───────────────────────────────────────────────

describe("toda acción de plataforma deja asiento", () => {
  it("aceptar un prospecto lo escribe, con quién lo hizo", async () => {
    const prospectId = await capture("convertida@productora.mx")
    const admin = await signUp("admin4@ejemplo.mx", { platformAdmin: true })

    expect(
      (await request("POST", `/prospects/${prospectId}/acceptance`, {}, admin.cookie)).status,
    ).toBe(201)

    const asientos = await db.select().from(platformActivities)
    expect(asientos).toHaveLength(1)
    expect(asientos[0]?.entity).toBe("prospects")
    expect(asientos[0]?.entityId).toBe(prospectId)
    expect(asientos[0]?.performedById).toBe(admin.userId)
    // La etiqueta dice sobre quién se ejerció el poder, no sólo que se ejerció.
    expect(asientos[0]?.entityLabel).toContain("convertida@productora.mx")
  })

  it("descartar un prospecto también", async () => {
    const prospectId = await capture("descartada@productora.mx")
    const admin = await signUp("admin5@ejemplo.mx", { platformAdmin: true })

    expect(
      (await request("DELETE", `/prospects/${prospectId}`, undefined, admin.cookie)).status,
    ).toBe(204)

    const [asiento] = await db.select().from(platformActivities)
    expect(asiento?.action).toBe("delete")
    expect(asiento?.entityId).toBe(prospectId)
  })

  it("y corregirlo también", async () => {
    const prospectId = await capture("erratta@productora.mx")
    const admin = await signUp("admin6@ejemplo.mx", { platformAdmin: true })

    expect(
      (
        await request(
          "PATCH",
          `/prospects/${prospectId}`,
          { email: "errata@productora.mx" },
          admin.cookie,
        )
      ).status,
    ).toBe(200)

    const [asiento] = await db.select().from(platformActivities)
    expect(asiento?.action).toBe("update")
  })

  it("una acción denegada no deja ninguno", async () => {
    // «La comprobación SHALL ocurrir antes de cualquier efecto». Un `403` no escribe bitácora, que
    // sería la forma más silenciosa de llenarla de ruido y de decir que pasó algo que no pasó.
    const prospectId = await capture("intacta@productora.mx")
    const cualquiera = await signUp("ajena4@ejemplo.mx")

    expect(
      (await request("POST", `/prospects/${prospectId}/acceptance`, {}, cualquiera.cookie)).status,
    ).toBe(403)

    expect(await db.select().from(platformActivities)).toEqual([])
    const [row] = await db.select().from(prospects).where(eq(prospects.id, prospectId))
    expect(row?.acceptedAt).toBeNull()
  })

  it("se puede leer, y sólo desde plataforma", async () => {
    const prospectId = await capture("leida@productora.mx")
    const admin = await signUp("admin7@ejemplo.mx", { platformAdmin: true })
    await request("POST", `/prospects/${prospectId}/acceptance`, {}, admin.cookie)

    const page = await json<Page<{ title: string; performedBy: string }>>(
      await request("GET", "/platform/activity", undefined, admin.cookie),
    )
    expect(page.totalItems).toBe(1)
    expect(page.items[0]?.performedBy).not.toBe("")

    const cualquiera = await signUp("ajena5@ejemplo.mx")
    expect((await request("GET", "/platform/activity", undefined, cualquiera.cookie)).status).toBe(
      403,
    )
  })

  it("no se puede reescribir ni borrar, ni siquiera desde plataforma", async () => {
    // La garantía la da el motor retirando el permiso, no una convención del código. Una bitácora
    // que su protagonista puede corregir no sirve para lo único que sirve.
    const prospectId = await capture("inmutable@productora.mx")
    const admin = await signUp("admin8@ejemplo.mx", { platformAdmin: true })
    await request("POST", `/prospects/${prospectId}/acceptance`, {}, admin.cookie)

    const [asiento] = await db.select().from(platformActivities)
    if (!asiento) throw new Error("el asiento debería existir")

    const [sesion] = await withElevated("comprobación de prueba", (tx) =>
      tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, admin.userId)),
    )
    if (!sesion) throw new Error("la sesión debería existir")

    await expect(
      withRequester({ userId: admin.userId, sessionId: sesion.id }, (tx) =>
        tx
          .update(platformActivities)
          .set({ title: "otra cosa" })
          .where(eq(platformActivities.id, asiento.id)),
      ),
    ).rejects.toThrow()
  })
})

// ─── El motor, como segunda capa ─────────────────────────────────────────────

describe("las políticas siguen en pie sin la compuerta", () => {
  it("la bitácora de plataforma no devuelve nada a quien no lo es", async () => {
    // Se salta la API entera y se pregunta al motor con la identidad de un usuario corriente. Es lo
    // que quedaría si la compuerta de la aplicación desapareciera: cero filas, no las de todos.
    const prospectId = await capture("motor@productora.mx")
    const admin = await signUp("admin9@ejemplo.mx", { platformAdmin: true })
    await request("POST", `/prospects/${prospectId}/acceptance`, {}, admin.cookie)

    const cualquiera = await signUp("motor2@ejemplo.mx")
    const [sesion] = await withElevated("comprobación de prueba", (tx) =>
      tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, cualquiera.userId)),
    )
    if (!sesion) throw new Error("la sesión debería existir")

    const visible = await withRequester({ userId: cualquiera.userId, sessionId: sesion.id }, (tx) =>
      tx.select().from(platformActivities),
    )
    expect(visible).toEqual([])
  })

  it("y el padrón de empresas tampoco cruza arrendatarios sin la marca", async () => {
    const duena = await signUp("motor3@ejemplo.mx")
    const ajena = await newCompany(duena, `Ajena ${newId().slice(0, 6)}`)

    const cualquiera = await signUp("motor4@ejemplo.mx")
    const [sesion] = await withElevated("comprobación de prueba", (tx) =>
      tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, cualquiera.userId)),
    )
    if (!sesion) throw new Error("la sesión debería existir")

    const visible = await withRequester({ userId: cualquiera.userId, sessionId: sesion.id }, (tx) =>
      tx.select().from(companies).where(eq(companies.id, ajena.id)),
    )
    expect(visible).toEqual([])
  })
})
