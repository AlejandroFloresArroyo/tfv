/**
 * El ciclo entero de contratación, contra el suplente del procesador.
 *
 * Lo que estas pruebas vienen a fijar no es que la suscripción quede activa —eso ya lo comprobaban
 * las de `billing/subscriptions.test.ts` mandando el evento a mano— sino **por dónde llega**: que el
 * suplente recorre el mismo camino que recorrerá el procesador de verdad. Firma un evento, lo
 * entrega por HTTP a `/payments/events`, y la suscripción nace ahí y en ningún otro sitio.
 *
 * Por eso hay un servidor de verdad escuchando: la entrega es una petición HTTP real contra el
 * endpoint público, con su firma y su ventana temporal. Una prueba que llamara al manejador se
 * saltaría justo lo que aquí importa.
 *
 * El puerto es efímero —`0`, y el sistema elige— y el destino de la entrega se declara a mano. Las
 * dos cosas por el mismo motivo: `API_PORT` puede apuntar a un servicio de desarrollo con datos de
 * alguien, y una prueba no tiene por qué saber contra qué se levantó la máquina donde corre.
 */

import type { AddressInfo } from "node:net"
import { serve } from "@hono/node-server"
import { newId } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  companySubscriptions,
  loginAttempts,
  notificationDeliveries,
  paymentEvents,
  roles,
  sessions,
  subscriptionPayments,
  subscriptionPlans,
  users,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { localProvider, usePaymentProvider } from "../billing/provider.ts"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"
import { useLocalDeliveryOrigin } from "./local-processor.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

let server: ReturnType<typeof serve>
let restoreProvider: (() => void) | null = null
let restoreOrigin: (() => void) | null = null

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${paymentEvents}, ${subscriptionPayments}, ${companySubscriptions}, ${subscriptionPlans}, ${users}, ${companyMembers}, ${roles}, ${companies} cascade`,
  )
}

beforeAll(async () => {
  const port = await new Promise<number>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) =>
      resolve((info as AddressInfo).port),
    )
  })

  restoreOrigin = useLocalDeliveryOrigin(`http://127.0.0.1:${port}`)
})

beforeEach(async () => {
  await reset()
  restoreProvider?.()
  restoreProvider = usePaymentProvider(localProvider())
})

afterAll(async () => {
  restoreProvider?.()
  restoreOrigin?.()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await reset()
  await closeConnection()
})

// ─── Andamiaje ───────────────────────────────────────────────────────────────

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

async function signUp(email: string): Promise<string> {
  await request("POST", "/auth/register", { email, password: PASSWORD, name: email.split("@")[0] })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const response = await request("POST", "/auth/login", { email, password: PASSWORD })
  const cookie = response.headers
    .getSetCookie()
    .find((raw) => raw.startsWith("tfv_session="))
    ?.split(";")[0]

  if (!cookie) throw new Error("no se abrió sesión")
  return cookie
}

async function newCompany(cookie: string, name = "Casa de Renta"): Promise<string> {
  const company = await json<{ id: string }>(await request("POST", "/companies", { name }, cookie))
  return company.id
}

/**
 * Un plan de ese nivel, creándolo si aún no está.
 *
 * Reutilizarlo importa: el producto externo es único por nivel —es de donde el suplente saca el
 * precio— y dos empresas contratando el mismo plan es el caso normal, no una excepción.
 */
async function newPlan(tier: number, title: string): Promise<string> {
  const externalProductId = `local_plan_${tier}`

  const [existing] = await db
    .select({ id: subscriptionPlans.id })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.externalProductId, externalProductId))
    .limit(1)

  if (existing) return existing.id

  const id = newId()
  await db.insert(subscriptionPlans).values({ id, tier, title, externalProductId })
  return id
}

/** El identificador de sesión que viaja dentro de la dirección que el suplente devuelve. */
function sessionOf(url: string): string {
  const reference = url.split("/").pop()
  if (!reference) throw new Error(`la dirección no lleva sesión: ${url}`)
  return decodeURIComponent(reference)
}

interface Contratacion {
  readonly companyId: string
  readonly planId: string
  readonly cookie: string
  readonly url: string
  readonly session: string
}

async function contratar(email: string, seats = 1, tier = 1): Promise<Contratacion> {
  const cookie = await signUp(email)
  const companyId = await newCompany(cookie)
  const planId = await newPlan(tier, "Casa de renta")

  const result = await json<{ kind: string; url: string }>(
    await request(
      "POST",
      `/companies/${companyId}/subscription`,
      { planId, interval: "month", seats },
      cookie,
    ),
  )

  expect(result.kind).toBe("checkout")
  return { companyId, planId, cookie, url: result.url, session: sessionOf(result.url) }
}

async function subscriptionOf(companyId: string) {
  const [row] = await db
    .select()
    .from(companySubscriptions)
    .where(eq(companySubscriptions.companyId, companyId))
    .limit(1)
  return row
}

// ─── La sesión de pago ───────────────────────────────────────────────────────

describe("la sesión de pago del suplente", () => {
  it("lleva a la pantalla del suplente, no de vuelta a la aplicación", async () => {
    // Es la diferencia entera: antes la dirección de vuelta era la propia pantalla de planes con la
    // sesión pegada detrás, así que la única forma de completar el pago habría sido que la pantalla
    // se inventara la activación — una vía que producción no tiene.
    const { url } = await contratar("suplente-abre@ejemplo.mx")

    expect(url).toContain("/payments/local/checkouts/")
    expect(url).not.toContain("/settings/plan")
  })

  it("no escribe ninguna suscripción al abrirse", async () => {
    // Escenario «Abandonar el pago no deja suscripción».
    const { companyId } = await contratar("suplente-no-escribe@ejemplo.mx")

    expect(await subscriptionOf(companyId)).toBeUndefined()
  })

  it("la pantalla dice qué se está contratando y ofrece las dos salidas", async () => {
    const { session } = await contratar("suplente-pantalla@ejemplo.mx", 3)

    const response = await app.request(`/payments/local/checkouts/${session}`)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")

    const html = await response.text()
    expect(html).toContain("Casa de renta")
    // Los asientos y el importe, para que quien la mire sepa qué está aceptando.
    expect(html).toContain("3")
    expect(html).toContain("Pagar")
    expect(html).toContain("Cancelar")
  })

  it("una sesión que no existe responde 404", async () => {
    const response = await app.request("/payments/local/checkouts/local_cs_inventada")
    expect(response.status).toBe(404)
  })
})

// ─── El pago ─────────────────────────────────────────────────────────────────

describe("pagar en el suplente", () => {
  it("activa la suscripción, y devuelve al navegador a la aplicación", async () => {
    const { companyId, planId, session } = await contratar("suplente-paga@ejemplo.mx", 5)

    const response = await app.request(`/payments/local/checkouts/${session}/pay`, {
      method: "POST",
    })

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toContain(`/c/${companyId}/settings/plan`)

    const subscription = await subscriptionOf(companyId)
    expect(subscription?.status).toBe("active")
    expect(subscription?.planId).toBe(planId)
    expect(subscription?.seats).toBe(5)
    // La referencia externa es lo que hace que cambiar de plan, cancelar y reactivar tengan a quién
    // preguntarle. Sin ella, cambiar de un plan de pago a otro volvería a mandar a contratar.
    expect(subscription?.externalSubscriptionId).toMatch(/^local_sub_/)
  })

  it("el evento entró firmado por el endpoint público, y quedó procesado", async () => {
    // Lo que esto fija es el camino: si alguien sustituyera la entrega por una llamada directa al
    // manejador, no habría fila de evento y esta prueba lo diría.
    const { session } = await contratar("suplente-evento@ejemplo.mx")

    await app.request(`/payments/local/checkouts/${session}/pay`, { method: "POST" })

    const eventos = await db.select().from(paymentEvents)
    const contratacion = eventos.find((row) => row.type === "checkout.session.completed")

    expect(contratacion).toBeDefined()
    expect(contratacion?.signatureVerified).toBe(true)
    expect(contratacion?.processedAt).not.toBeNull()
  })

  it("deja registrado el cobro del primer periodo, con su importe exacto", async () => {
    // Requisito «Registro de los cobros de suscripción». El suplente cobra el primer periodo como lo
    // cobraría el procesador: con su propio evento, no como efecto secundario de la contratación.
    const { companyId } = await contratar("suplente-cobro@ejemplo.mx", 2)
    const { session } = await contratar("suplente-cobro-2@ejemplo.mx", 2)

    // La segunda empresa es la que se paga; la primera queda abierta a propósito para comprobar
    // que abrir una sesión no cobra nada.
    await app.request(`/payments/local/checkouts/${session}/pay`, { method: "POST" })

    const cobros = await db.select().from(subscriptionPayments)
    expect(cobros).toHaveLength(1)

    const [cobro] = cobros
    expect(cobro?.succeeded).toBe(true)
    expect(cobro?.seats).toBe(2)
    // Nivel 1 son 349.00 por asiento y mes; dos asientos, 698.00. Cadena decimal, nunca coma
    // flotante.
    expect(cobro?.amount).toBe("698.00")
    expect(cobro?.currency).toBe("MXN")
    expect(cobro?.periodEnd).not.toBeNull()

    // Y la que no se pagó sigue sin suscripción.
    expect(await subscriptionOf(companyId)).toBeUndefined()
  })

  it("la suscripción queda con periodo, que es lo que la pantalla enseña como renovación", async () => {
    // El evento de contratación no trae periodo —el del procesador tampoco—: lo trae el cobro del
    // primer periodo, que es el segundo evento. Sin él la pantalla no tendría fecha que enseñar.
    const { companyId, session } = await contratar("suplente-periodo@ejemplo.mx")
    await app.request(`/payments/local/checkouts/${session}/pay`, { method: "POST" })

    const subscription = await subscriptionOf(companyId)
    expect(subscription?.periodStart).not.toBeNull()
    expect(subscription?.periodEnd).not.toBeNull()
    expect(subscription?.periodEnd?.getTime()).toBeGreaterThan(Date.now())
  })

  it("pagar dos veces la misma sesión no duplica nada", async () => {
    // El procesador reintenta ante cualquier respuesta que no sea de éxito, y una persona vuelve
    // atrás en el navegador. Las dos cosas terminan en la misma sesión pagada dos veces.
    const { companyId, session } = await contratar("suplente-doble@ejemplo.mx")

    await app.request(`/payments/local/checkouts/${session}/pay`, { method: "POST" })
    const segunda = await app.request(`/payments/local/checkouts/${session}/pay`, {
      method: "POST",
    })

    expect(segunda.status).toBe(303)

    const suscripciones = await db
      .select()
      .from(companySubscriptions)
      .where(eq(companySubscriptions.companyId, companyId))
    expect(suscripciones).toHaveLength(1)

    const cobros = await db.select().from(subscriptionPayments)
    expect(cobros).toHaveLength(1)
  })

  it("abandonar deja volver a intentarlo", async () => {
    // Escenario «Abandonar el pago no deja suscripción … y puede volver a intentarlo». Sin fila
    // escrita al abrir la sesión, el segundo intento no choca con el índice único.
    const { companyId, planId, cookie } = await contratar("suplente-abandona@ejemplo.mx")

    const segunda = await json<{ kind: string; url: string }>(
      await request(
        "POST",
        `/companies/${companyId}/subscription`,
        { planId, interval: "month", seats: 1 },
        cookie,
      ),
    )

    expect(segunda.kind).toBe("checkout")

    await app.request(`/payments/local/checkouts/${sessionOf(segunda.url)}/pay`, {
      method: "POST",
    })

    expect((await subscriptionOf(companyId))?.status).toBe("active")
  })

  it("una sesión que no existe no cobra nada", async () => {
    const response = await app.request("/payments/local/checkouts/local_cs_inventada/pay", {
      method: "POST",
    })

    expect(response.status).toBe(404)
    expect(await db.select().from(companySubscriptions)).toHaveLength(0)
  })
})

// ─── Lo que cuelga de tener suscripción ──────────────────────────────────────

describe("con la suscripción ya contratada", () => {
  async function contratada(email: string, seats = 2) {
    const contratacion = await contratar(email, seats)
    await app.request(`/payments/local/checkouts/${contratacion.session}/pay`, { method: "POST" })
    return contratacion
  }

  it("cambiar a otro plan de pago se aplica, sin pasar otra vez por la sesión de pago", async () => {
    const { companyId, cookie } = await contratada("suplente-cambia@ejemplo.mx")
    const otro = await newPlan(2, "Productora")

    const body = await json<{ kind: string }>(
      await request("PATCH", `/companies/${companyId}/subscription`, { planId: otro }, cookie),
    )

    expect(body.kind).toBe("aplicado")

    const subscription = await subscriptionOf(companyId)
    expect(subscription?.planId).toBe(otro)
    // Los asientos se conservan: es lo que dice el requisito «Cambio de plan».
    expect(subscription?.seats).toBe(2)
  })

  it("cancelar conserva el periodo pagado en lugar de estrenar uno", async () => {
    // El suplente recuerda la suscripción que emitió, así que cancelar no puede devolver un periodo
    // recién inventado: eso alargaba la suscripción justo al darla de baja.
    const { companyId, cookie } = await contratada("suplente-cancela@ejemplo.mx")
    const antes = await subscriptionOf(companyId)

    await request("POST", `/companies/${companyId}/subscription/cancel`, {}, cookie)

    const despues = await subscriptionOf(companyId)
    expect(despues?.cancelAtPeriodEnd).toBe(true)
    expect(despues?.periodEnd?.getTime()).toBe(antes?.periodEnd?.getTime())
  })

  it("reactivar deshace la cancelación", async () => {
    const { companyId, cookie } = await contratada("suplente-reactiva@ejemplo.mx")

    await request("POST", `/companies/${companyId}/subscription/cancel`, {}, cookie)
    await request("POST", `/companies/${companyId}/subscription/reactivate`, {}, cookie)

    expect((await subscriptionOf(companyId))?.cancelAtPeriodEnd).toBe(false)
  })
})
