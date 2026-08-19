/**
 * Planes, suscripción y cobros, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/subscriptions-and-entitlements/spec.md` y de los
 * criterios de aceptación de la rebanada 11.
 *
 * Recorren la API real, así que atraviesan las **dos** capas de aislamiento —la compuerta de
 * permisos y las políticas del motor— y, en los cobros, la recepción verificada de eventos de la
 * rebanada 07: los eventos se firman como los firmaría el procesador y entran por su endpoint
 * público. Una prueba que llamara a los manejadores directamente se saltaría la verificación, la
 * unicidad y la transaccionalidad, que es justo lo que hace que un evento sea de fiar.
 */

import { createHmac } from "node:crypto"
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
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"
import { type PaymentProvider, usePaymentProvider } from "./provider.ts"
import { sweepExpiredGrace, syncSeats } from "./subscriptions.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"
const SECRET = "un-secreto-compartido-de-prueba"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${paymentEvents}, ${subscriptionPayments}, ${companySubscriptions}, ${subscriptionPlans}, ${users}, ${companyMembers}, ${roles}, ${companies} cascade`,
  )
}

let restoreProvider: (() => void) | null = null

beforeEach(async () => {
  await reset()
  restoreProvider = usePaymentProvider(stubProvider())
})

afterEach(() => {
  restoreProvider?.()
  restoreProvider = null
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

// ─── El doble del procesador ─────────────────────────────────────────────────

interface StubOptions {
  /** Operaciones que fallan adrede, para probar lo que pasa cuando el procesador se cae. */
  readonly failOn?: readonly string[]
}

/**
 * Un procesador de mentira que **puede fallar a propósito**.
 *
 * Lo segundo importa tanto como lo primero: la mitad de los requisitos de esta rebanada hablan de
 * qué debe ocurrir cuando el procesador rechaza algo, y un doble que siempre dice que sí no puede
 * probar ninguno.
 */
function stubProvider(options: StubOptions = {}): PaymentProvider {
  const fails = (operation: string) => {
    if (options.failOn?.includes(operation)) {
      throw new Error(`el procesador rechazó «${operation}»`)
    }
  }

  const period = () => ({
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2026-02-01T00:00:00.000Z"),
  })

  return {
    name: "doble",
    listPrices: async (productId) => {
      fails("listPrices")
      const tier = Number(productId.replace(/\D+/g, "")) || 1
      return [
        {
          id: `price_${tier}_month`,
          interval: "month",
          intervalCount: 1,
          unitAmount: `${tier * 100}.00`,
          currency: "MXN",
        },
        {
          id: `price_${tier}_year`,
          interval: "year",
          intervalCount: 1,
          unitAmount: `${tier * 1000}.00`,
          currency: "MXN",
        },
      ]
    },
    createCheckoutSession: async (request) => {
      fails("createCheckoutSession")
      lastCheckout = request
      return { id: "cs_prueba", url: "https://procesador.example/cs_prueba" }
    },
    changePlan: async (id, priceId) => {
      fails("changePlan")
      return { externalSubscriptionId: id, externalPriceId: priceId, ...period() }
    },
    changeSeats: async (id) => {
      fails("changeSeats")
      seatCalls.push(id)
      return { externalSubscriptionId: id, externalPriceId: "price_1_month", ...period() }
    },
    cancelAtPeriodEnd: async (id) => {
      fails("cancelAtPeriodEnd")
      return { externalSubscriptionId: id, externalPriceId: "price_1_month", ...period() }
    },
    resume: async (id) => {
      fails("resume")
      return { externalSubscriptionId: id, externalPriceId: "price_1_month", ...period() }
    },
    createConnectedAccount: async () => {
      fails("createConnectedAccount")
      return {
        id: "acct_prueba",
        canAcceptCharges: true,
        canReceivePayouts: false,
        requirementsPending: true,
      }
    },
    updateConnectedAccount: async (id) => {
      fails("updateConnectedAccount")
      return { id, canAcceptCharges: true, canReceivePayouts: true, requirementsPending: false }
    },
    deleteConnectedAccount: async () => {
      fails("deleteConnectedAccount")
    },
    createAccountLink: async ({ returnUrl }) => {
      fails("createAccountLink")
      return { url: `https://procesador.example/onboarding?vuelta=${returnUrl}` }
    },
  }
}

let lastCheckout: {
  seats: number
  allowsPromotionCode: boolean
  metadata: Record<string, string>
} | null = null
let seatCalls: string[] = []

beforeEach(() => {
  lastCheckout = null
  seatCalls = []
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

async function newCompany(session: Session, name = "Casa de Renta"): Promise<string> {
  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name }, session.cookie),
  )
  return company.id
}

async function newPlan(tier: number, title: string, withProduct = true): Promise<string> {
  const id = newId()
  await db.insert(subscriptionPlans).values({
    id,
    tier,
    title,
    ...(withProduct ? { externalProductId: `prod_${tier}` } : {}),
  })
  return id
}

/** El evento tal y como lo manda el procesador: firmado y por su endpoint público. */
async function sendEvent(type: string, object: Record<string, unknown>, id: string = newId()) {
  const body = JSON.stringify({ id, type, data: { object } })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex")

  return app.request("/payments/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
    body,
  })
}

async function subscriptionOf(companyId: string) {
  const [row] = await db
    .select()
    .from(companySubscriptions)
    .where(eq(companySubscriptions.companyId, companyId))
    .limit(1)
  return row
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

describe("el catálogo de planes", () => {
  it("trae los precios vigentes del procesador y todas sus periodicidades", async () => {
    // Escenario: «El catálogo incluye los precios vigentes».
    const session = await signUp("catalogo@ejemplo.mx")
    await newPlan(1, "Básico")

    const body = await json<{ items: { title: string; prices: { interval: string }[] }[] }>(
      await request("GET", "/plans", undefined, session.cookie),
    )

    expect(body.items).toHaveLength(1)
    expect(body.items[0]?.prices.map((price) => price.interval).sort()).toEqual(["month", "year"])
  })

  it("un plan sin producto en el procesador sale sin precios, no rompe la lista", async () => {
    // Es el caso del plan gratuito: no tiene nada que cobrar.
    const session = await signUp("gratis-catalogo@ejemplo.mx")
    await newPlan(0, "Gratuito", false)

    const body = await json<{ items: { prices: unknown[] }[] }>(
      await request("GET", "/plans", undefined, session.cookie),
    )

    expect(body.items[0]?.prices).toEqual([])
  })

  it("no se sirve sin sesión", async () => {
    expect((await request("GET", "/plans")).status).toBe(401)
  })
})

// ─── Plan gratuito ───────────────────────────────────────────────────────────

describe("el plan gratuito está restringido", () => {
  it("no admite dos asientos", async () => {
    // Escenario: «El plan gratuito no admite dos asientos».
    const session = await signUp("dos-asientos@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(0, "Gratuito", false)

    const response = await request(
      "POST",
      `/companies/${companyId}/subscription`,
      { planId, interval: "month", seats: 2 },
      session.cookie,
    )

    expect(response.status).toBe(422)
    expect(await response.text()).toContain("un solo asiento")
  })

  it("una segunda empresa gratuita se rechaza, y se dice por qué", async () => {
    // Escenario: «Una segunda empresa gratuita se rechaza».
    const session = await signUp("dos-empresas@ejemplo.mx")
    const planId = await newPlan(0, "Gratuito", false)

    const first = await newCompany(session, "Primera")
    expect(
      (
        await request(
          "POST",
          `/companies/${first}/subscription`,
          { planId, interval: "month", seats: 1 },
          session.cookie,
        )
      ).status,
    ).toBe(200)

    const second = await newCompany(session, "Segunda")
    const response = await request(
      "POST",
      `/companies/${second}/subscription`,
      { planId, interval: "month", seats: 1 },
      session.cookie,
    )

    expect(response.status).toBe(409)
    expect(await response.text()).toContain("Ya dispones del plan gratuito")
  })

  it("se puede consultar si ya se usó", async () => {
    // Escenario: «Se puede consultar si ya se usó».
    const session = await signUp("disponibilidad@ejemplo.mx")
    const planId = await newPlan(0, "Gratuito", false)

    const before = await json<{ available: boolean }>(
      await request("GET", "/plans/free-availability", undefined, session.cookie),
    )
    expect(before.available).toBe(true)

    const companyId = await newCompany(session)
    await request(
      "POST",
      `/companies/${companyId}/subscription`,
      { planId, interval: "month", seats: 1 },
      session.cookie,
    )

    const after = await json<{ available: boolean }>(
      await request("GET", "/plans/free-availability", undefined, session.cookie),
    )
    expect(after.available).toBe(false)
  })
})

// ─── Contratación ────────────────────────────────────────────────────────────

describe("la contratación de un plan", () => {
  it("devuelve la dirección de pago a la que redirigir", async () => {
    // Escenario: «Se obtiene la dirección de pago».
    const session = await signUp("contrata@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    const body = await json<{ kind: string; url: string }>(
      await request(
        "POST",
        `/companies/${companyId}/subscription`,
        { planId, interval: "month", seats: 3 },
        session.cookie,
      ),
    )

    expect(body.kind).toBe("checkout")
    expect(body.url).toContain("https://procesador.example/")
  })

  it("abandonar el pago no deja suscripción, y se puede reintentar", async () => {
    // Escenario: «Abandonar el pago no deja suscripción». Es la razón de que la fila no se cree al
    // abrir la sesión: creada, el índice único bloquearía el segundo intento.
    const session = await signUp("abandona@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    const body = { planId, interval: "month", seats: 1 }
    await request("POST", `/companies/${companyId}/subscription`, body, session.cookie)

    expect(await subscriptionOf(companyId)).toBeUndefined()

    const retry = await request(
      "POST",
      `/companies/${companyId}/subscription`,
      body,
      session.cookie,
    )
    expect(retry.status).toBe(200)
  })

  it("con suscripción vigente se rechaza: el camino es cambiar de plan", async () => {
    // Escenario: «No se contrata dos veces».
    const session = await signUp("dos-veces@ejemplo.mx")
    const companyId = await newCompany(session)
    const free = await newPlan(0, "Gratuito", false)
    const paid = await newPlan(1, "Básico")

    await request(
      "POST",
      `/companies/${companyId}/subscription`,
      { planId: free, interval: "month", seats: 1 },
      session.cookie,
    )

    const response = await request(
      "POST",
      `/companies/${companyId}/subscription`,
      { planId: paid, interval: "month", seats: 1 },
      session.cookie,
    )

    expect(response.status).toBe(409)
  })

  it("al completarse el pago la suscripción queda activa", async () => {
    const session = await signUp("completa@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await request(
      "POST",
      `/companies/${companyId}/subscription`,
      { planId, interval: "month", seats: 4 },
      session.cookie,
    )

    const response = await sendEvent("checkout.session.completed", {
      id: "cs_prueba",
      subscription: "sub_1",
      customer: "cus_1",
      metadata: lastCheckout?.metadata ?? {},
    })

    expect(response.status).toBe(200)

    const row = await subscriptionOf(companyId)
    expect(row?.status).toBe("active")
    expect(row?.seats).toBe(4)
    expect(row?.externalSubscriptionId).toBe("sub_1")
  })
})

// ─── Descuento por volumen ───────────────────────────────────────────────────

describe("el descuento por volumen", () => {
  it("por encima del umbral se aplica y cierra el código manual", async () => {
    // Escenario: «Se aplica el descuento por volumen». El umbral de fábrica son diez asientos.
    const session = await signUp("volumen@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await request(
      "POST",
      `/companies/${companyId}/subscription`,
      { planId, interval: "month", seats: 11, promotionCode: "INTENTO" },
      session.cookie,
    )

    expect(lastCheckout?.allowsPromotionCode).toBe(false)
    expect(lastCheckout?.metadata.discountPercent).toBe("15.0000")
    // El código escrito a mano se descarta: acumularlo concedería dos descuentos.
    expect(lastCheckout?.metadata.promotionCode).toBeUndefined()
  })

  it("por debajo del umbral se admite código manual", async () => {
    // Escenario: «Por debajo del umbral se admite código manual».
    const session = await signUp("codigo@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await request(
      "POST",
      `/companies/${companyId}/subscription`,
      { planId, interval: "month", seats: 3, promotionCode: "BIENVENIDA" },
      session.cookie,
    )

    expect(lastCheckout?.allowsPromotionCode).toBe(true)
    expect(lastCheckout?.metadata.promotionCode).toBe("BIENVENIDA")
    expect(lastCheckout?.metadata.discountPercent).toBeUndefined()
  })
})

// ─── Cambio, cancelación y reactivación ──────────────────────────────────────

describe("el cambio de plan", () => {
  it("conserva el número de asientos", async () => {
    // Escenario: «El cambio conserva los asientos».
    const session = await signUp("cambia@ejemplo.mx")
    const companyId = await newCompany(session)
    const basic = await newPlan(1, "Básico")
    const pro = await newPlan(2, "Profesional")

    await activate(companyId, basic, { seats: 5 })

    const body = await json<{ subscription: { seats: number; planId: string }; due: string }>(
      await request(
        "PATCH",
        `/companies/${companyId}/subscription`,
        { planId: pro },
        session.cookie,
      ),
    )

    expect(body.subscription.seats).toBe(5)
    expect(body.subscription.planId).toBe(pro)
    // El cambio se prorratea: no se cobra un periodo entero por cambiar a mitad de camino.
    expect(body.due).toMatch(/^-?\d+\.\d{2}$/)
  })
})

describe("la cancelación", () => {
  it("surte efecto al terminar el periodo, y la empresa sigue operando", async () => {
    // Escenario: «La empresa opera hasta el final del periodo».
    const session = await signUp("cancela@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await activate(companyId, planId, { periodEnd: future() })

    const body = await json<{
      cancelAtPeriodEnd: boolean
      isOperating: boolean
      periodEnd: string | null
    }>(
      await request(
        "POST",
        `/companies/${companyId}/subscription/cancel`,
        undefined,
        session.cookie,
      ),
    )

    expect(body.cancelAtPeriodEnd).toBe(true)
    expect(body.isOperating).toBe(true)
    // Se le informa de la fecha en que terminará, que es lo que la spec pide.
    expect(body.periodEnd).not.toBeNull()
  })

  it("al terminar el periodo la empresa deja de operar", async () => {
    // Escenario: «Al terminar el periodo se bloquea».
    const session = await signUp("vencida@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await activate(companyId, planId, { periodEnd: past(), cancelAtPeriodEnd: true })

    const body = await json<{ subscription: { isOperating: boolean } }>(
      await request("GET", `/companies/${companyId}/entitlements`, undefined, session.cookie),
    )

    expect(body.subscription.isOperating).toBe(false)
  })

  it("no se cancela dos veces", async () => {
    const session = await signUp("recancela@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")
    await activate(companyId, planId, { periodEnd: future(), cancelAtPeriodEnd: true })

    const response = await request(
      "POST",
      `/companies/${companyId}/subscription/cancel`,
      undefined,
      session.cookie,
    )

    expect(response.status).toBe(409)
  })
})

describe("la reactivación", () => {
  it("revierte la cancelación mientras el periodo siga vigente", async () => {
    // Escenario: «Se revierte la cancelación».
    const session = await signUp("reactiva@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await activate(companyId, planId, { periodEnd: future(), cancelAtPeriodEnd: true })

    const body = await json<{ cancelAtPeriodEnd: boolean }>(
      await request(
        "POST",
        `/companies/${companyId}/subscription/reactivate`,
        undefined,
        session.cookie,
      ),
    )

    expect(body.cancelAtPeriodEnd).toBe(false)
  })

  it("con el periodo terminado no hay cancelación que revertir", async () => {
    const session = await signUp("tarde@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await activate(companyId, planId, { periodEnd: past(), cancelAtPeriodEnd: true })

    const response = await request(
      "POST",
      `/companies/${companyId}/subscription/reactivate`,
      undefined,
      session.cookie,
    )

    expect(response.status).toBe(422)
  })
})

// ─── Asientos ────────────────────────────────────────────────────────────────

describe("los asientos siguen a los miembros activos", () => {
  it("incorporar amplía cuando no quedan libres, con prorrateo", async () => {
    // Escenario: «Incorporar amplía cuando hace falta».
    const session = await signUp("amplia@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await activate(companyId, planId, {
      seats: 1,
      periodStart: past(),
      periodEnd: future(),
      externalSubscriptionId: "sub_asientos",
    })

    await addMembers(companyId, 3)

    const result = await syncSeats(companyId)

    expect(result?.widened).toBe(true)
    expect(result?.seats).toBe(4)
    expect(seatCalls).toContain("sub_asientos")
  })

  it("con asientos libres no se amplía ni se genera cargo", async () => {
    // Escenario: «Con asientos libres no se amplía».
    const session = await signUp("libres@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await activate(companyId, planId, { seats: 5, externalSubscriptionId: "sub_libres" })
    await addMembers(companyId, 2)

    const result = await syncSeats(companyId)

    expect(result?.widened).toBe(false)
    expect(result?.seats).toBe(5)
    expect(result?.due).toBe("0.00")
    expect(seatCalls).toHaveLength(0)
  })

  it("la sincronización conserva el descuento", async () => {
    // Escenario: «El descuento sobrevive a la renovación». Es la corrección M-07: la pila anterior
    // reescribía las líneas de la suscripción al sincronizar asientos y borraba el descuento.
    const session = await signUp("descuento@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await activate(companyId, planId, {
      seats: 1,
      periodStart: past(),
      periodEnd: future(),
      discountPercent: "15.0000",
      promotionCode: "VOLUMEN",
      externalSubscriptionId: "sub_descuento",
    })

    await addMembers(companyId, 5)
    await syncSeats(companyId)

    const row = await subscriptionOf(companyId)
    expect(row?.seats).toBe(6)
    expect(row?.discountPercent).toBe("15.0000")
    expect(row?.promotionCode).toBe("VOLUMEN")
  })

  it("una renovación del procesador tampoco lo borra", async () => {
    // La misma corrección donde más peligro tiene: el manejador que corre en cada ciclo.
    const session = await signUp("renueva@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await activate(companyId, planId, {
      seats: 4,
      discountPercent: "15.0000",
      promotionCode: "VOLUMEN",
      externalSubscriptionId: "sub_renueva",
    })

    await sendEvent("customer.subscription.updated", {
      id: "sub_renueva",
      status: "active",
      quantity: 4,
      current_period_start: 1_800_000_000,
      current_period_end: 1_802_592_000,
    })

    const row = await subscriptionOf(companyId)
    expect(row?.discountPercent).toBe("15.0000")
    expect(row?.promotionCode).toBe("VOLUMEN")
  })
})

// ─── Cobro, gracia y restablecimiento ────────────────────────────────────────

describe("un fallo de cobro concede gracia", () => {
  it("pasa a pago pendiente y no elimina la suscripción", async () => {
    // Escenario: «Un fallo transitorio no corta el servicio». Corrección M-08: la pila anterior
    // borraba la suscripción y tumbaba la empresa entera por un rechazo de tarjeta.
    const session = await signUp("falla@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await activate(companyId, planId, { externalSubscriptionId: "sub_falla" })

    await sendEvent("invoice.payment_failed", {
      id: "in_falla",
      subscription: "sub_falla",
      amount_due: 30_000,
      currency: "mxn",
      quantity: 3,
    })

    const row = await subscriptionOf(companyId)
    expect(row).toBeDefined()
    expect(row?.status).toBe("past_due")
    expect(row?.gracePeriodEndsAt).not.toBeNull()

    // Y sigue operando durante la gracia.
    const entitlements = await json<{ subscription: { isOperating: boolean } }>(
      await request("GET", `/companies/${companyId}/entitlements`, undefined, session.cookie),
    )
    expect(entitlements.subscription.isOperating).toBe(true)
  })

  it("al agotarse la gracia pasa a impagada", async () => {
    // Escenario: «Al agotarse la gracia se bloquea».
    const session = await signUp("agota@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await activate(companyId, planId, {
      status: "past_due",
      gracePeriodEndsAt: past(),
      externalSubscriptionId: "sub_agota",
    })

    expect(await sweepExpiredGrace()).toBe(1)
    expect((await subscriptionOf(companyId))?.status).toBe("unpaid")
  })

  it("un cobro posterior restablece", async () => {
    // Escenario: «Un cobro posterior restablece».
    const session = await signUp("restablece@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await activate(companyId, planId, {
      status: "past_due",
      gracePeriodEndsAt: future(),
      externalSubscriptionId: "sub_restablece",
    })

    await sendEvent("invoice.paid", {
      id: "in_bueno",
      subscription: "sub_restablece",
      amount_paid: 30_000,
      currency: "mxn",
      quantity: 3,
    })

    const row = await subscriptionOf(companyId)
    expect(row?.status).toBe("active")
    expect(row?.gracePeriodEndsAt).toBeNull()
  })
})

describe("el historial de cobros", () => {
  it("registra importe, periodo, asientos y resultado, y es consultable", async () => {
    // Escenario: «Un cobro correcto queda registrado».
    const session = await signUp("historial@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    await activate(companyId, planId, { externalSubscriptionId: "sub_historial" })

    await sendEvent("invoice.paid", {
      id: "in_historial",
      subscription: "sub_historial",
      amount_paid: 123_456,
      currency: "mxn",
      quantity: 7,
      period_start: 1_800_000_000,
      period_end: 1_802_592_000,
    })

    const page = await json<{
      items: { amount: string; seats: number; succeeded: boolean; periodEnd: string | null }[]
    }>(
      await request(
        "GET",
        `/companies/${companyId}/subscription/payments`,
        undefined,
        session.cookie,
      ),
    )

    expect(page.items).toHaveLength(1)
    // El importe viaja como cadena decimal exacta, nunca como número de coma flotante.
    expect(page.items[0]?.amount).toBe("1234.56")
    expect(page.items[0]?.seats).toBe(7)
    expect(page.items[0]?.succeeded).toBe(true)
    expect(page.items[0]?.periodEnd).not.toBeNull()
  })

  it("un fallo también queda registrado, con lo que se debía", async () => {
    const session = await signUp("fallido@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")
    await activate(companyId, planId, { externalSubscriptionId: "sub_fallido" })

    await sendEvent("invoice.payment_failed", {
      id: "in_fallido",
      subscription: "sub_fallido",
      amount_due: 50_000,
      currency: "mxn",
    })

    const page = await json<{ items: { amount: string; succeeded: boolean }[] }>(
      await request(
        "GET",
        `/companies/${companyId}/subscription/payments`,
        undefined,
        session.cookie,
      ),
    )

    expect(page.items[0]?.amount).toBe("500.00")
    expect(page.items[0]?.succeeded).toBe(false)
  })

  it("un reintento del procesador no duplica el asiento", async () => {
    const session = await signUp("reintento@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")
    await activate(companyId, planId, { externalSubscriptionId: "sub_reintento" })

    const invoice = {
      id: "in_repetida",
      subscription: "sub_reintento",
      amount_paid: 10_000,
      currency: "mxn",
    }

    // Dos eventos distintos con la misma factura: la unicidad del evento no los para, y lo que los
    // para es el índice único de la factura una capa más abajo.
    await sendEvent("invoice.paid", invoice, "evt_a")
    await sendEvent("invoice.paid", invoice, "evt_b")

    const rows = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.companyId, companyId))

    expect(rows).toHaveLength(1)
  })
})

// ─── Cuando el procesador falla ──────────────────────────────────────────────

describe("cuando el procesador falla", () => {
  it("no se abre sesión de pago ni queda suscripción", async () => {
    restoreProvider?.()
    restoreProvider = usePaymentProvider(stubProvider({ failOn: ["createCheckoutSession"] }))

    const session = await signUp("procesador-caido@ejemplo.mx")
    const companyId = await newCompany(session)
    const planId = await newPlan(1, "Básico")

    const response = await request(
      "POST",
      `/companies/${companyId}/subscription`,
      { planId, interval: "month", seats: 1 },
      session.cookie,
    )

    expect(response.status).toBe(500)
    expect(await subscriptionOf(companyId)).toBeUndefined()
  })
})

// ─── Ayudas ──────────────────────────────────────────────────────────────────

function future(): Date {
  return new Date(Date.now() + 30 * 24 * 3600 * 1000)
}

function past(): Date {
  return new Date(Date.now() - 30 * 24 * 3600 * 1000)
}

/** Deja una suscripción puesta, como si el pago se hubiera completado. */
async function activate(
  companyId: string,
  planId: string,
  overrides: Partial<typeof companySubscriptions.$inferInsert> = {},
): Promise<void> {
  await db.insert(companySubscriptions).values({
    id: newId(),
    companyId,
    planId,
    status: "active",
    seats: 1,
    interval: "month",
    ...overrides,
  })
}

/** Miembros activos adicionales, con cuenta propia cada uno. */
async function addMembers(companyId: string, howMany: number): Promise<void> {
  for (let index = 0; index < howMany; index++) {
    const id = newId()
    await db.insert(users).values({
      id,
      email: `miembro-${index}-${id}@ejemplo.mx`,
      passwordHash: "x",
      name: "Miembro",
      lastname: "De prueba",
      username: `miembro-${id}`,
    })
    await db.insert(companyMembers).values({ id: newId(), companyId, userId: id, isActive: true })
  }
}
