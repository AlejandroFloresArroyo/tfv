/**
 * Prospectos.
 *
 * Transcritas de `openspec/specs/user-accounts/spec.md`. Lo que más importa es lo que la
 * implementación anterior no hacía: **el prospecto aceptado sale de la bandeja** (`DEFECTS.md`
 * L-02), y el enlace de un solo uso **no vuelve en la respuesta**.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  loginAttempts,
  notificationDeliveries,
  oneTimeCredentials,
  prospects,
  roles,
  services,
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
    sql`truncate table ${prospects}, ${notificationDeliveries}, ${oneTimeCredentials}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${services}, ${companies} cascade`,
  )
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

/** Una cuenta con sesión abierta. `platform` la marca como administración de plataforma. */
async function signIn(email: string, platform = false) {
  await request("POST", "/auth/register", { email, password: PASSWORD, name: "Quien Sea" })
  const patch = platform
    ? { emailVerifiedAt: new Date(), isPlatformAdmin: true }
    : { emailVerifiedAt: new Date() }
  await db.update(users).set(patch).where(eq(users.email, email))

  const login = await request("POST", "/auth/login", { email, password: PASSWORD })
  return (
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""
  )
}

function capture(body: Record<string, unknown> = {}) {
  return request("POST", "/prospects", {
    name: "Ana",
    lastname: "Villarreal",
    email: `ana-${newId().slice(0, 8)}@productora.mx`,
    phone: "81-1234-5678",
    companyName: "Productora Sierra",
    message: "Nos interesa rentar equipo de cámara.",
    ...body,
  })
}

beforeEach(reset)

afterAll(async () => {
  await reset()
  await closeConnection()
})

describe("captura pública", () => {
  it("registra el contacto sin crear cuenta y encola su acuse", async () => {
    // Escenario: «Se registra un contacto sin cuenta».
    const email = "sin-cuenta@productora.mx"
    const response = await capture({ email })
    expect(response.status).toBe(201)

    const rows = await db.select().from(prospects).where(eq(prospects.email, email))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.acceptedAt).toBeNull()

    // No se ha creado ninguna cuenta: un prospecto no es un usuario a medias.
    const accounts = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    expect(accounts).toHaveLength(0)

    // Y el acuse va a una dirección, no a un usuario que no existe.
    const [delivery] = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.kind, "prospect_acknowledged"))
    expect(delivery?.recipientId).toBeNull()
    expect((delivery?.payload as { email?: string }).email).toBe(email)
  })

  it("no exige sesión", async () => {
    // Si la exigiera no sería un formulario de contacto.
    expect((await capture()).status).toBe(201)
  })
})

describe("la bandeja es de la plataforma", () => {
  it("una cuenta corriente no la ve", async () => {
    await capture()
    const cookie = await signIn("cualquiera@ejemplo.mx")

    expect((await request("GET", "/prospects", undefined, cookie)).status).toBe(403)
  })

  it("la administración de plataforma sí", async () => {
    await capture({ email: "buscable@productora.mx", companyName: "Productora Sierra" })
    const cookie = await signIn("admin@ejemplo.mx", true)

    const page = await json<{ items: { email: string }[] }>(
      await request("GET", "/prospects", undefined, cookie),
    )
    expect(page.items.map((row) => row.email)).toContain("buscable@productora.mx")

    // Y se busca por lo que se escribió, que es como se encuentra a alguien que llamó hace un mes.
    const found = await json<{ items: { email: string }[] }>(
      await request("GET", "/prospects?search=Sierra", undefined, cookie),
    )
    expect(found.items.map((row) => row.email)).toContain("buscable@productora.mx")
  })
})

describe("aceptar un prospecto", () => {
  async function pending(email: string) {
    await capture({ email })
    const [row] = await db.select().from(prospects).where(eq(prospects.email, email))
    return row?.id as string
  }

  it("crea la cuenta verificada y lo saca de la bandeja", async () => {
    // Escenario: «El prospecto se convierte y sale de la bandeja». Es la corrección de L-02: la
    // implementación anterior no llegaba a retirarlo, así que seguía pidiendo atención para siempre.
    const email = "convertida@productora.mx"
    const prospectId = await pending(email)
    const cookie = await signIn("admin@ejemplo.mx", true)

    const response = await request("POST", `/prospects/${prospectId}/acceptance`, {}, cookie)
    expect(response.status).toBe(201)

    const [account] = await db
      .select({ id: users.id, verified: users.emailVerifiedAt, hash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))
    expect(account?.verified).not.toBeNull()
    // Sin contraseña: la establece el titular con su enlace.
    expect(account?.hash).toBeNull()

    // El enlace se encola y **no vuelve en la respuesta**: devolverlo dejaría entrar en la cuenta
    // ajena a quien acepta.
    expect(await response.text()).not.toContain("token")
    const [delivery] = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.kind, "prospect_accepted"))
    expect(delivery?.recipientId).toBe(account?.id)

    const page = await json<{ items: { id: string }[] }>(
      await request("GET", "/prospects", undefined, cookie),
    )
    expect(page.items.map((row) => row.id)).not.toContain(prospectId)

    // Pero la fila se conserva, con quién lo aceptó y qué cuenta salió de él.
    const [row] = await db.select().from(prospects).where(eq(prospects.id, prospectId))
    expect(row?.acceptedAt).not.toBeNull()
    expect(row?.userId).toBe(account?.id)
  })

  it("no se acepta dos veces", async () => {
    const prospectId = await pending("dos-veces@productora.mx")
    const cookie = await signIn("admin@ejemplo.mx", true)

    expect((await request("POST", `/prospects/${prospectId}/acceptance`, {}, cookie)).status).toBe(
      201,
    )
    expect((await request("POST", `/prospects/${prospectId}/acceptance`, {}, cookie)).status).toBe(
      409,
    )
  })

  it("un correo que ya tiene cuenta no se duplica", async () => {
    // Escenario: «Un prospecto con correo ya registrado no duplica». Reutilizar la cuenta en
    // silencio haría creer que se creó una nueva y dejaría el prospecto marcado como resuelto sin
    // que nadie lo estuviera.
    const cookie = await signIn("admin@ejemplo.mx", true)
    await signIn("ya-existe@productora.mx")
    const prospectId = await pending("ya-existe@productora.mx")

    const response = await request("POST", `/prospects/${prospectId}/acceptance`, {}, cookie)
    expect(response.status).toBe(409)

    const [row] = await db.select().from(prospects).where(eq(prospects.id, prospectId))
    expect(row?.acceptedAt).toBeNull()
  })
})

describe("gestión", () => {
  it("se corrige lo que llegó mal escrito", async () => {
    // Un correo con una errata no se convierte en cuenta: se corrige antes.
    await capture({ email: "erratta@productora.mx" })
    const [row] = await db
      .select()
      .from(prospects)
      .where(eq(prospects.email, "erratta@productora.mx"))
    const cookie = await signIn("admin@ejemplo.mx", true)

    const updated = await json<{ email: string }>(
      await request("PATCH", `/prospects/${row?.id}`, { email: "errata@productora.mx" }, cookie),
    )
    expect(updated.email).toBe("errata@productora.mx")
  })

  it("se descarta lo que no lleva a ninguna parte", async () => {
    await capture({ email: "descartada@productora.mx" })
    const [row] = await db
      .select()
      .from(prospects)
      .where(eq(prospects.email, "descartada@productora.mx"))
    const cookie = await signIn("admin@ejemplo.mx", true)

    expect((await request("DELETE", `/prospects/${row?.id}`, undefined, cookie)).status).toBe(204)

    const page = await json<{ items: { id: string }[] }>(
      await request("GET", "/prospects", undefined, cookie),
    )
    expect(page.items.map((one) => one.id)).not.toContain(row?.id)
  })
})
