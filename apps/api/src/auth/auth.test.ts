/**
 * Ciclo de vida de la sesión, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/user-accounts/spec.md`. Recorren la API real
 * —no las funciones sueltas— porque lo que la spec describe es comportamiento observable.
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
  oneTimeCredentials,
  services,
  sessions,
  users,
} from "@tfv/db/schema"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import type { Profile } from "../auth/profile.ts"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"

const app = createApp(routes)

const PASSWORD = "una-frase-larga-y-buena"
const EMAIL = "ana@ejemplo.mx"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${companyServices}, ${services}, ${companies} cascade`,
  )
}

beforeEach(reset)
afterAll(async () => {
  await reset()
  await closeConnection()
})

// ─── Utilidades ──────────────────────────────────────────────────────────────

async function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

/** Recupera el token que se encoló para enviar por correo. Nunca sale en la respuesta. */
async function lastEmailedToken(kind: string): Promise<string> {
  const [row] = await db
    .select({ payload: notificationDeliveries.payload })
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.kind, kind))
    .orderBy(desc(notificationDeliveries.createdAt))
    .limit(1)

  const token = (row?.payload as { token?: string } | undefined)?.token
  if (!token) throw new Error(`no se encoló ningún enlace de tipo ${kind}`)
  return token
}

async function lastEmailPayload(kind: string): Promise<{ token: string; email?: string }> {
  const [row] = await db
    .select({ payload: notificationDeliveries.payload })
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.kind, kind))
    .orderBy(desc(notificationDeliveries.createdAt))
    .limit(1)

  const payload = row?.payload as { token?: string; email?: string } | undefined
  if (!payload?.token) throw new Error(`no se encoló ningún enlace de tipo ${kind}`)
  return payload as { token: string; email?: string }
}

function cookiesFrom(response: Response): Record<string, string> {
  const jar: Record<string, string> = {}
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";")
    const [name, ...rest] = (pair ?? "").split("=")
    if (name) jar[name.trim()] = rest.join("=")
  }
  return jar
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ")
}

/** Registra, verifica e inicia sesión. Devuelve las cookies resultantes. */
async function signedInUser(email = EMAIL) {
  await post("/auth/register", { email, password: PASSWORD, name: "Ana", lastname: "López" })
  await post("/auth/verify-email", { token: await lastEmailedToken("email_verification") })

  const response = await post("/auth/login", { email, password: PASSWORD })
  expect(response.status).toBe(200)
  return cookiesFrom(response)
}

// ─── Registro y verificación ─────────────────────────────────────────────────

describe("registro", () => {
  it("crea la cuenta sin verificar y encola el enlace", async () => {
    const response = await post("/auth/register", {
      email: EMAIL,
      password: PASSWORD,
      name: "Ana",
    })

    expect(response.status).toBe(201)

    const [user] = await db.select().from(users).where(eq(users.email, EMAIL))
    expect(user?.emailVerifiedAt).toBeNull()
    await expect(lastEmailedToken("email_verification")).resolves.toBeTruthy()
  })

  it("no devuelve el enlace en el cuerpo", async () => {
    const response = await post("/auth/register", {
      email: EMAIL,
      password: PASSWORD,
      name: "Ana",
    })

    const body = await readJson<Record<string, unknown>>(response)
    expect(JSON.stringify(body)).not.toContain(await lastEmailedToken("email_verification"))
  })

  it("rechaza un correo ya registrado", async () => {
    await post("/auth/register", { email: EMAIL, password: PASSWORD, name: "Ana" })
    const response = await post("/auth/register", {
      email: EMAIL,
      password: PASSWORD,
      name: "Otra",
    })

    expect(response.status).toBe(409)
  })

  it("normaliza el correo", async () => {
    await post("/auth/register", { email: EMAIL, password: PASSWORD, name: "Ana" })
    const response = await post("/auth/register", {
      email: EMAIL.toUpperCase(),
      password: PASSWORD,
      name: "Otra",
    })

    expect(response.status).toBe(409)
  })

  it("rechaza una contraseña demasiado corta", async () => {
    const response = await post("/auth/register", {
      email: EMAIL,
      password: "corta",
      name: "Ana",
    })

    expect(response.status).toBe(400)
    const body = await readJson<{ message: { key: string }[] }>(response)
    expect(body.message[0]?.key).toBe("password")
  })
})

describe("verificación de correo", () => {
  it("sin verificar no se entra", async () => {
    // Escenario de la spec: la verificación es efectiva, no decorativa.
    await post("/auth/register", { email: EMAIL, password: PASSWORD, name: "Ana" })

    const response = await post("/auth/login", { email: EMAIL, password: PASSWORD })
    expect(response.status).toBe(403)
  })

  it("el enlace verifica y permite entrar", async () => {
    await post("/auth/register", { email: EMAIL, password: PASSWORD, name: "Ana" })
    const verify = await post("/auth/verify-email", {
      token: await lastEmailedToken("email_verification"),
    })

    expect(verify.status).toBe(200)
    expect((await post("/auth/login", { email: EMAIL, password: PASSWORD })).status).toBe(200)
  })

  it("el enlace es de un solo uso", async () => {
    await post("/auth/register", { email: EMAIL, password: PASSWORD, name: "Ana" })
    const token = await lastEmailedToken("email_verification")

    await post("/auth/verify-email", { token })
    const second = await post("/auth/verify-email", { token })

    expect(second.status).toBe(400)
  })
})

describe("cambio de correo verificado", () => {
  it("exige sesión y conserva el correo anterior hasta confirmar", async () => {
    const withoutSession = await post("/auth/change-email", { newEmail: "nueva@ejemplo.mx" })
    expect(withoutSession.status).toBe(401)

    const jar = await signedInUser()
    const response = await post(
      "/auth/change-email",
      { newEmail: "  NUEVA@EJEMPLO.MX " },
      { cookie: cookieHeader(jar) },
    )

    expect(response.status).toBe(200)
    const [before] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.email, EMAIL))
    expect(before?.email).toBe(EMAIL)

    const delivery = await lastEmailPayload("email_change_verification")
    expect(delivery.email).toBe("nueva@ejemplo.mx")
    expect(JSON.stringify(await readJson(response))).not.toContain(delivery.token)

    const verify = await post(
      "/auth/verify-email",
      { token: delivery.token },
      { cookie: cookieHeader(jar) },
    )
    expect(verify.status).toBe(200)
    expect((await readJson<{ sameSession: boolean }>(verify)).sameSession).toBe(true)

    const me = await app.request("/auth/me", { headers: { cookie: cookieHeader(jar) } })
    expect((await readJson<Profile>(me)).email).toBe("nueva@ejemplo.mx")
    expect((await post("/auth/login", { email: EMAIL, password: PASSWORD })).status).toBe(401)
    expect(
      (await post("/auth/login", { email: "nueva@ejemplo.mx", password: PASSWORD })).status,
    ).toBe(200)
    expect((await post("/auth/verify-email", { token: delivery.token })).status).toBe(400)
  })

  it("rechaza el correo actual o uno ocupado sin encolar", async () => {
    const jar = await signedInUser()
    await post("/auth/register", {
      email: "ocupado@ejemplo.mx",
      password: PASSWORD,
      name: "Otra",
    })
    await db.delete(notificationDeliveries)

    const same = await post(
      "/auth/change-email",
      { newEmail: ` ${EMAIL.toUpperCase()} ` },
      { cookie: cookieHeader(jar) },
    )
    const occupied = await post(
      "/auth/change-email",
      { newEmail: "ocupado@ejemplo.mx" },
      { cookie: cookieHeader(jar) },
    )

    expect(same.status).toBe(422)
    expect(occupied.status).toBe(409)
    expect(await db.select().from(notificationDeliveries)).toHaveLength(0)
  })

  it("no sustituye el correo si la dirección se ocupa antes de confirmar", async () => {
    const jar = await signedInUser()
    await post(
      "/auth/change-email",
      { newEmail: "disputado@ejemplo.mx" },
      { cookie: cookieHeader(jar) },
    )
    const { token } = await lastEmailPayload("email_change_verification")

    await post("/auth/register", {
      email: "disputado@ejemplo.mx",
      password: PASSWORD,
      name: "Otra",
    })
    const verify = await post("/auth/verify-email", { token })

    expect(verify.status).toBe(409)
    const me = await app.request("/auth/me", { headers: { cookie: cookieHeader(jar) } })
    expect((await readJson<Profile>(me)).email).toBe(EMAIL)
  })

  it("una segunda solicitud simultánea deja una sola credencial viva", async () => {
    const jar = await signedInUser()
    const headers = { cookie: cookieHeader(jar) }

    const responses = await Promise.all([
      post("/auth/change-email", { newEmail: "primera@ejemplo.mx" }, headers),
      post("/auth/change-email", { newEmail: "segunda@ejemplo.mx" }, headers),
    ])
    expect(responses.map(({ status }) => status)).toEqual([200, 200])

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL))
    const live = await db
      .select()
      .from(oneTimeCredentials)
      .where(
        and(
          eq(oneTimeCredentials.userId, user?.id ?? ""),
          eq(oneTimeCredentials.purpose, "email_verification"),
          isNull(oneTimeCredentials.consumedAt),
        ),
      )
    expect(live).toHaveLength(1)
  })

  it("dos confirmaciones simultáneas sólo consumen el enlace una vez", async () => {
    const jar = await signedInUser()
    await post(
      "/auth/change-email",
      { newEmail: "concurrente@ejemplo.mx" },
      { cookie: cookieHeader(jar) },
    )
    const { token } = await lastEmailPayload("email_change_verification")

    const responses = await Promise.all([
      post("/auth/verify-email", { token }),
      post("/auth/verify-email", { token }),
    ])

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 400])
  })

  it("no ofrece la cuenta activa cuando el token pertenece a otra persona", async () => {
    const ownJar = await signedInUser()
    const otherJar = await signedInUser("otra@ejemplo.mx")
    await post(
      "/auth/change-email",
      { newEmail: "otra-nueva@ejemplo.mx" },
      { cookie: cookieHeader(otherJar) },
    )
    const { token } = await lastEmailPayload("email_change_verification")

    const verify = await post("/auth/verify-email", { token }, { cookie: cookieHeader(ownJar) })

    expect(verify.status).toBe(200)
    expect((await readJson<{ sameSession: boolean }>(verify)).sameSession).toBe(false)
  })

  it("dos cuentas no pueden confirmar simultáneamente la misma dirección", async () => {
    const firstJar = await signedInUser("primera-persona@ejemplo.mx")
    const secondJar = await signedInUser("segunda-persona@ejemplo.mx")

    await post(
      "/auth/change-email",
      { newEmail: "compartido@ejemplo.mx" },
      { cookie: cookieHeader(firstJar) },
    )
    const firstToken = (await lastEmailPayload("email_change_verification")).token
    await post(
      "/auth/change-email",
      { newEmail: "compartido@ejemplo.mx" },
      { cookie: cookieHeader(secondJar) },
    )
    const secondToken = (await lastEmailPayload("email_change_verification")).token

    const responses = await Promise.all([
      post("/auth/verify-email", { token: firstToken }),
      post("/auth/verify-email", { token: secondToken }),
    ])

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409])
    expect(
      await db.select().from(users).where(eq(users.email, "compartido@ejemplo.mx")),
    ).toHaveLength(1)

    const credentials = await db
      .select({ consumedAt: oneTimeCredentials.consumedAt })
      .from(oneTimeCredentials)
      .where(eq(oneTimeCredentials.pendingEmail, "compartido@ejemplo.mx"))
    expect(credentials).toHaveLength(2)
    expect(credentials.filter(({ consumedAt }) => consumedAt === null)).toHaveLength(1)
    expect(credentials.filter(({ consumedAt }) => consumedAt !== null)).toHaveLength(1)
  })
})

// ─── Acceso ──────────────────────────────────────────────────────────────────

describe("inicio de sesión", () => {
  it("una contraseña incorrecta no revela si el correo existe", async () => {
    await signedInUser()

    const existing = await post("/auth/login", { email: EMAIL, password: "otra-cosa-larga-aqui" })
    const missing = await post("/auth/login", {
      email: "nadie@ejemplo.mx",
      password: "otra-cosa-larga-aqui",
    })

    expect(existing.status).toBe(missing.status)
    expect(await readJson(existing)).toEqual(await readJson(missing))
  })

  it("entrega las credenciales en cookies no accesibles por script", async () => {
    await post("/auth/register", { email: EMAIL, password: PASSWORD, name: "Ana" })
    await post("/auth/verify-email", { token: await lastEmailedToken("email_verification") })

    const response = await post("/auth/login", { email: EMAIL, password: PASSWORD })
    const raw = response.headers.getSetCookie()

    expect(raw.length).toBeGreaterThanOrEqual(2)
    for (const cookie of raw) {
      expect(cookie.toLowerCase()).toContain("httponly")
    }
  })

  it("una cuenta desactivada no entra", async () => {
    await signedInUser()
    await db.update(users).set({ isActive: false }).where(eq(users.email, EMAIL))

    expect((await post("/auth/login", { email: EMAIL, password: PASSWORD })).status).toBe(401)
  })

  it("frena tras demasiados intentos fallidos", async () => {
    await signedInUser()

    let last: Response | undefined
    for (let attempt = 0; attempt < 10; attempt++) {
      last = await post("/auth/login", { email: EMAIL, password: "incorrecta-pero-larga" })
    }

    expect(last?.status).toBe(429)
    expect(last?.headers.get("retry-after")).toBeTruthy()
  })

  it("los fallos sin origen conocido no frenan a otras cuentas", async () => {
    // Regresión de una denegación de servicio real. El limitador guardaba `"unknown"` cuando no
    // conocía la dirección, y esa cadena se comparaba como si fuera una dirección: ocho fallos con
    // correos inventados llenaban la casilla compartida y **el sistema entero dejaba de admitir
    // inicios de sesión durante quince minutos**. Comprobado contra el servicio antes de arreglarlo.
    await signedInUser()

    for (let attempt = 0; attempt < 10; attempt++) {
      await post("/auth/login", {
        email: `desconocido${attempt}@ejemplo.mx`,
        password: "incorrecta-pero-larga",
      })
    }

    // Una cuenta que no falló ni una vez tiene que poder entrar.
    const response = await post("/auth/login", { email: EMAIL, password: PASSWORD })
    expect(response.status).toBe(200)
  })

  it("frena por origen cuando sí se conoce", async () => {
    // La otra mitad: quien prueba una contraseña contra muchas cuentas desde la misma dirección se
    // frena aunque ninguna cuenta acumule fallos por su cuenta.
    const origin = { "x-forwarded-for": "203.0.113.7" }

    for (let attempt = 0; attempt < 10; attempt++) {
      await post(
        "/auth/login",
        { email: `victima${attempt}@ejemplo.mx`, password: "incorrecta-pero-larga" },
        origin,
      )
    }

    const response = await post(
      "/auth/login",
      { email: "otra-mas@ejemplo.mx", password: "incorrecta-pero-larga" },
      origin,
    )
    expect(response.status).toBe(429)
  })
})

// ─── Sesión ──────────────────────────────────────────────────────────────────

describe("sesión", () => {
  it("la credencial abre las rutas autenticadas", async () => {
    const jar = await signedInUser()

    const response = await app.request("/auth/sessions", {
      headers: { cookie: cookieHeader(jar) },
    })

    expect(response.status).toBe(200)
    const body = await readJson<{ items: unknown[] }>(response)
    expect(body.items).toHaveLength(1)
  })

  it("sin credencial se responde 401", async () => {
    expect((await app.request("/auth/sessions")).status).toBe(401)
  })

  it("una credencial inventada se rechaza", async () => {
    const response = await app.request("/auth/sessions", {
      headers: { authorization: "Bearer inventada" },
    })

    expect(response.status).toBe(401)
  })

  it("cerrar sesión la invalida de inmediato", async () => {
    // Escenario: «su credencial deja de ser aceptada de inmediato».
    const jar = await signedInUser()
    const cookie = cookieHeader(jar)

    expect((await app.request("/auth/sessions", { headers: { cookie } })).status).toBe(200)
    await post("/auth/logout", undefined, { cookie })
    expect((await app.request("/auth/sessions", { headers: { cookie } })).status).toBe(401)
  })

  it("desactivar la cuenta corta el acceso en la siguiente petición", async () => {
    const jar = await signedInUser()
    const cookie = cookieHeader(jar)

    expect((await app.request("/auth/sessions", { headers: { cookie } })).status).toBe(200)
    await db.update(users).set({ isActive: false }).where(eq(users.email, EMAIL))
    expect((await app.request("/auth/sessions", { headers: { cookie } })).status).toBe(401)
  })
})

// ─── Perfil ──────────────────────────────────────────────────────────────────

describe("perfil del solicitante", () => {
  it("devuelve quién entró", async () => {
    const jar = await signedInUser()

    const response = await app.request("/auth/me", { headers: { cookie: cookieHeader(jar) } })
    expect(response.status).toBe(200)

    const profile = await readJson<Profile>(response)
    expect(profile.email).toBe(EMAIL)
    expect(profile.name).toBe("Ana")
    expect(profile.lastname).toBe("López")
    expect(profile.emailVerified).toBe(true)
    expect(profile.isPlatformAdmin).toBe(false)
  })

  it("una cuenta sin membresías no trae empresas", async () => {
    // Es el padrón único (`project.md` D-01): quien compra en una tienda pública tiene cuenta y no
    // pertenece a ninguna empresa. La cáscara tiene que poder distinguirlo de un fallo de carga.
    const jar = await signedInUser()

    const profile = await readJson<Profile>(
      await app.request("/auth/me", { headers: { cookie: cookieHeader(jar) } }),
    )

    expect(profile.companies).toEqual([])
  })

  it("trae las empresas con membresía activa y sus servicios habilitados", async () => {
    const jar = await signedInUser()
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL))
    if (!user) throw new Error("la cuenta debería existir")

    const companyId = newId()
    const serviceId = newId()
    const otherServiceId = newId()

    await db.insert(companies).values({ id: companyId, name: "Almacén Uno" })
    await db.insert(services).values([
      { id: serviceId, keycode: "warehouses", name: "Almacenes" },
      { id: otherServiceId, keycode: "pixit", name: "Pixit" },
    ])
    // Sólo uno de los dos se habilita: si salieran los dos, la prueba no distinguiría entre
    // «devuelve lo habilitado» y «devuelve el catálogo entero».
    await db.insert(companyServices).values({ id: newId(), companyId, serviceId })
    await db
      .insert(companyMembers)
      .values({ id: newId(), companyId, userId: user.id, isOwner: true })

    const profile = await readJson<Profile>(
      await app.request("/auth/me", { headers: { cookie: cookieHeader(jar) } }),
    )

    expect(profile.companies).toHaveLength(1)
    expect(profile.companies[0]?.name).toBe("Almacén Uno")
    expect(profile.companies[0]?.isOwner).toBe(true)
    expect(profile.companies[0]?.services.map((service) => service.keycode)).toEqual(["warehouses"])
  })

  it("una membresía desactivada deja de traer la empresa", async () => {
    const jar = await signedInUser()
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL))
    if (!user) throw new Error("la cuenta debería existir")

    const companyId = newId()
    await db.insert(companies).values({ id: companyId, name: "Almacén Dos" })
    await db
      .insert(companyMembers)
      .values({ id: newId(), companyId, userId: user.id, isActive: false })

    const profile = await readJson<Profile>(
      await app.request("/auth/me", { headers: { cookie: cookieHeader(jar) } }),
    )

    expect(profile.companies).toEqual([])
  })

  it("sin sesión responde 401", async () => {
    expect((await app.request("/auth/me")).status).toBe(401)
  })
})

describe("renovación rotatoria", () => {
  it("entrega credenciales nuevas e invalida las anteriores", async () => {
    const jar = await signedInUser()
    const original = jar.tfv_session

    const refreshed = await post("/auth/refresh", undefined, { cookie: cookieHeader(jar) })
    expect(refreshed.status).toBe(200)

    const renewed = cookiesFrom(refreshed)
    expect(renewed.tfv_session).not.toBe(original)

    // La respuesta dice de quién es la sesión renovada. Devolvía cadena vacía, que obligaba al
    // cliente a pedir el perfil sólo para saber a quién acababa de renovar.
    const body = await readJson<{ userId: string }>(refreshed)
    expect(body.userId).not.toBe("")

    // La credencial de acceso anterior sigue viva hasta caducar; la de renovación, no.
    const reuse = await post("/auth/refresh", undefined, { cookie: cookieHeader(jar) })
    expect(reuse.status).toBe(401)
  })

  it("reutilizar una credencial consumida invalida toda la cadena", async () => {
    // Escenario: es el indicio de que alguien más tiene la credencial.
    const jar = await signedInUser()

    const refreshed = await post("/auth/refresh", undefined, { cookie: cookieHeader(jar) })
    const renewed = cookiesFrom(refreshed)

    // El ladrón usa la vieja. Eso corta también la sesión del legítimo.
    await post("/auth/refresh", undefined, { cookie: cookieHeader(jar) })

    const afterCut = await app.request("/auth/sessions", {
      headers: { cookie: cookieHeader(renewed) },
    })
    expect(afterCut.status).toBe(401)
  })
})

// ─── Recuperación ────────────────────────────────────────────────────────────

describe("recuperación de contraseña", () => {
  it("responde igual exista o no la cuenta", async () => {
    await signedInUser()

    const known = await post("/auth/forgot-password", { email: EMAIL })
    const unknown = await post("/auth/forgot-password", { email: "nadie@ejemplo.mx" })

    expect(known.status).toBe(unknown.status)
    expect(await readJson(known)).toEqual(await readJson(unknown))
  })

  it("sólo encola el enlace cuando la cuenta existe", async () => {
    await signedInUser()
    await db.delete(notificationDeliveries)

    await post("/auth/forgot-password", { email: "nadie@ejemplo.mx" })
    expect(await db.select().from(notificationDeliveries)).toHaveLength(0)

    await post("/auth/forgot-password", { email: EMAIL })
    expect((await db.select().from(notificationDeliveries)).length).toBeGreaterThan(0)
  })

  it("no devuelve el token en el cuerpo", async () => {
    await signedInUser()
    const response = await post("/auth/forgot-password", { email: EMAIL })

    const body = JSON.stringify(await readJson(response))
    expect(body).not.toContain(await lastEmailedToken("password_reset"))
  })

  it("restablece la contraseña y cierra las sesiones anteriores", async () => {
    const jar = await signedInUser()
    const cookie = cookieHeader(jar)

    await post("/auth/forgot-password", { email: EMAIL })
    const reset = await post("/auth/reset-password", {
      token: await lastEmailedToken("password_reset"),
      password: "otra-frase-igual-de-larga",
    })

    expect(reset.status).toBe(200)
    // Escenario: «Restablecer cierra las demás sesiones».
    expect((await app.request("/auth/sessions", { headers: { cookie } })).status).toBe(401)
    expect(
      (await post("/auth/login", { email: EMAIL, password: "otra-frase-igual-de-larga" })).status,
    ).toBe(200)
  })

  it("el enlace es de un solo uso", async () => {
    await signedInUser()
    await post("/auth/forgot-password", { email: EMAIL })
    const token = await lastEmailedToken("password_reset")

    await post("/auth/reset-password", { token, password: "otra-frase-igual-de-larga" })
    const second = await post("/auth/reset-password", { token, password: "y-una-tercera-frase" })

    expect(second.status).toBe(400)
  })
})

describe("cambio de contraseña con sesión", () => {
  it("exige la actual", async () => {
    const jar = await signedInUser()

    const response = await post(
      "/auth/change-password",
      { currentPassword: "no-es-la-mia-pero-larga", newPassword: "otra-frase-igual-de-larga" },
      { cookie: cookieHeader(jar) },
    )

    expect(response.status).toBe(422)
  })

  it("cambia la contraseña y cierra las sesiones", async () => {
    const jar = await signedInUser()
    const cookie = cookieHeader(jar)

    const response = await post(
      "/auth/change-password",
      { currentPassword: PASSWORD, newPassword: "otra-frase-igual-de-larga" },
      { cookie },
    )

    expect(response.status).toBe(200)
    expect((await app.request("/auth/sessions", { headers: { cookie } })).status).toBe(401)
  })
})

describe("cierre global", () => {
  it("cierra todas las sesiones del usuario", async () => {
    const first = await signedInUser()
    const second = cookiesFrom(await post("/auth/login", { email: EMAIL, password: PASSWORD }))

    await post("/auth/logout-all", undefined, { cookie: cookieHeader(first) })

    expect(
      (await app.request("/auth/sessions", { headers: { cookie: cookieHeader(first) } })).status,
    ).toBe(401)
    expect(
      (await app.request("/auth/sessions", { headers: { cookie: cookieHeader(second) } })).status,
    ).toBe(401)
  })
})
