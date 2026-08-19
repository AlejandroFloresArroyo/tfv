/**
 * Perfiles de facturación y las tres compuertas, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/merchant-onboarding/spec.md` y del requisito
 * «Las tres compuertas son independientes» de `subscriptions-and-entitlements`.
 *
 * El proposal de la rebanada dice, en sus riesgos, que las tres compuertas «es fácil colapsarlas por
 * descuido» y que «conviene una prueba por cada combinación». Eso es lo que hay abajo: cuatro casos
 * que sólo difieren en qué compuerta está abierta.
 */

import { createHmac } from "node:crypto"
import { newId } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  companyServices,
  companySubscriptions,
  loginAttempts,
  merchantPayments,
  merchantProfiles,
  notificationDeliveries,
  paymentEvents,
  roles,
  services,
  sessions,
  subscriptionPlans,
  users,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"
import { useSubscriptionGate } from "./entitlements.ts"
import { assertCanCharge, operatingProfile } from "./merchants.ts"
import { type PaymentProvider, usePaymentProvider } from "./provider.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${paymentEvents}, ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${merchantPayments}, ${merchantProfiles}, ${companySubscriptions}, ${subscriptionPlans}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${services}, ${companies} cascade`,
  )
}

let restore: (() => void)[] = []

beforeEach(async () => {
  await reset()
  restore = [usePaymentProvider(stub())]
})

afterEach(() => {
  for (const undo of restore.reverse()) undo()
  restore = []
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

// ─── El doble ────────────────────────────────────────────────────────────────

function stub(failOn: readonly string[] = []): PaymentProvider {
  const fails = (operation: string) => {
    if (failOn.includes(operation)) throw new Error(`el procesador rechazó «${operation}»`)
  }

  const period = () => ({
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2026-02-01T00:00:00.000Z"),
  })

  return {
    name: "doble",
    listPrices: async () => [
      { id: "price_1", interval: "month", intervalCount: 1, unitAmount: "100.00", currency: "MXN" },
    ],
    createCheckoutSession: async () => ({ id: "cs", url: "https://procesador.example/cs" }),
    changePlan: async (id, priceId) => ({
      externalSubscriptionId: id,
      externalPriceId: priceId,
      ...period(),
    }),
    changeSeats: async (id) => ({
      externalSubscriptionId: id,
      externalPriceId: "price_1",
      ...period(),
    }),
    cancelAtPeriodEnd: async (id) => ({
      externalSubscriptionId: id,
      externalPriceId: "price_1",
      ...period(),
    }),
    resume: async (id) => ({
      externalSubscriptionId: id,
      externalPriceId: "price_1",
      ...period(),
    }),
    createConnectedAccount: async () => {
      fails("createConnectedAccount")
      return {
        id: `acct_${newId()}`,
        canAcceptCharges: true,
        canReceivePayouts: false,
        requirementsPending: true,
      }
    },
    updateConnectedAccount: async (id) => {
      fails("updateConnectedAccount")
      updated.push(id)
      return { id, canAcceptCharges: true, canReceivePayouts: true, requirementsPending: false }
    },
    deleteConnectedAccount: async (id) => {
      fails("deleteConnectedAccount")
      deleted.push(id)
    },
    createAccountLink: async ({ returnUrl }) => {
      fails("createAccountLink")
      return {
        url: `https://procesador.example/onboarding?vuelta=${encodeURIComponent(returnUrl)}`,
      }
    },
  }
}

let updated: string[] = []
let deleted: string[] = []

beforeEach(() => {
  updated = []
  deleted = []
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

async function signUp(email: string): Promise<{ cookie: string; userId: string }> {
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

/** El evento tal y como lo manda el procesador: firmado y por su endpoint público. */
async function sendEvent(type: string, object: Record<string, unknown>) {
  const body = JSON.stringify({ id: newId(), type, data: { object } })
  const timestamp = Math.floor(Date.now() / 1000)
  const secret = "un-secreto-compartido-de-prueba"
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")

  return app.request("/payments/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
    body,
  })
}

async function accountOf(companyId: string): Promise<string> {
  const [row] = await db
    .select({ externalAccountId: merchantProfiles.externalAccountId })
    .from(merchantProfiles)
    .where(eq(merchantProfiles.companyId, companyId))

  return row?.externalAccountId ?? ""
}

async function newCompany(cookie: string, name = "Casa de Renta"): Promise<string> {
  const company = await json<{ id: string }>(await request("POST", "/companies", { name }, cookie))
  return company.id
}

async function enableService(companyId: string, keycode: string): Promise<void> {
  const [existing] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.keycode, keycode))
    .limit(1)

  const serviceId = existing?.id ?? newId()
  if (!existing) {
    await db.insert(services).values({ id: serviceId, keycode, name: keycode })
  }

  await db
    .insert(companyServices)
    .values({ id: newId(), companyId, serviceId })
    .onConflictDoNothing()
}

async function subscribeCompany(companyId: string, periodEnd = future()): Promise<void> {
  const planId = newId()
  await db.insert(subscriptionPlans).values({ id: planId, tier: 1, title: "Básico" })
  await db.insert(companySubscriptions).values({
    id: newId(),
    companyId,
    planId,
    status: "active",
    seats: 5,
    interval: "month",
    periodEnd,
  })
}

function future(): Date {
  return new Date(Date.now() + 30 * 24 * 3600 * 1000)
}

/** Un perfil completo y válido. Las pruebas modifican sólo lo que quieren romper. */
function profileBody(overrides: Record<string, unknown> = {}) {
  return {
    alias: "Razón social principal",
    business: {
      type: "company",
      legalName: "Producciones del Norte SA de CV",
      taxId: "PDN010203AB1",
      taxRegime: "601",
      email: "facturacion@ejemplo.mx",
    },
    bank: {
      holderType: "company",
      holder: "Producciones del Norte SA de CV",
      clabe: "012180001234567895",
      currency: "MXN",
      country: "MX",
    },
    representative: {
      name: "Elena",
      lastname: "Mora",
      birthdate: { day: 3, month: 5, year: 1980 },
      address: {
        line1: "Av. Reforma 100",
        city: "Ciudad de México",
        state: "CDMX",
        postalCode: "06600",
        country: "MX",
      },
      relationship: { title: "Directora", isRepresentative: true },
    },
    ...overrides,
  }
}

// ─── Alta ────────────────────────────────────────────────────────────────────

describe("el alta de un perfil de facturación", () => {
  it("deja el perfil limitado, con su cuenta, y marcado como primario por ser el primero", async () => {
    // Escenarios: «El alta deja el perfil limitado» y «El primer perfil es primario».
    const { cookie } = await signUp("alta@ejemplo.mx")
    const companyId = await newCompany(cookie)

    const response = await request(
      "POST",
      `/companies/${companyId}/billing-profiles`,
      profileBody(),
      cookie,
    )

    expect(response.status).toBe(201)
    const profile = await json<{ status: string; isPrimary: boolean; verificationStatus: string }>(
      response,
    )

    expect(profile.status).toBe("limited")
    expect(profile.isPrimary).toBe(true)
    expect(profile.verificationStatus).toBe("pending")
  })

  it("registra cuándo y desde dónde se aceptaron los términos", async () => {
    // Escenario: «Queda constancia de la aceptación».
    const { cookie } = await signUp("terminos@ejemplo.mx")
    const companyId = await newCompany(cookie)

    await app.request(`/companies/${companyId}/billing-profiles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
        "x-forwarded-for": "189.203.10.4, 10.0.0.1",
      },
      body: JSON.stringify(profileBody()),
    })

    const [row] = await db
      .select()
      .from(merchantProfiles)
      .where(eq(merchantProfiles.companyId, companyId))

    expect(row?.termsAcceptedAt).not.toBeNull()
    // La primera de la cadena es la del cliente; las siguientes son las de los saltos intermedios.
    expect(row?.termsAcceptedIp).toBe("189.203.10.4")
  })

  it("una CLABE con longitud incorrecta se rechaza sin llamar al procesador", async () => {
    // Escenario: «Una CLABE con longitud incorrecta se rechaza».
    const { cookie } = await signUp("clabe@ejemplo.mx")
    const companyId = await newCompany(cookie)

    const response = await request(
      "POST",
      `/companies/${companyId}/billing-profiles`,
      profileBody({
        bank: {
          holderType: "company",
          holder: "Alguien",
          clabe: "01218000123456789",
          currency: "MXN",
          country: "MX",
        },
      }),
      cookie,
    )

    expect(response.status).toBe(400)
    expect(await db.select().from(merchantProfiles)).toHaveLength(0)
  })

  it("un representante menor de edad se rechaza", async () => {
    // Escenario: «Un representante menor de edad se rechaza».
    const { cookie } = await signUp("menor@ejemplo.mx")
    const companyId = await newCompany(cookie)

    const yesterday = new Date(Date.now() - 24 * 3600 * 1000)
    const response = await request(
      "POST",
      `/companies/${companyId}/billing-profiles`,
      profileBody({
        representative: {
          ...profileBody().representative,
          birthdate: {
            day: yesterday.getUTCDate(),
            month: yesterday.getUTCMonth() + 1,
            year: yesterday.getUTCFullYear() - 17,
          },
        },
      }),
      cookie,
    )

    expect(response.status).toBe(422)
    expect(await db.select().from(merchantProfiles)).toHaveLength(0)
  })

  it("un fallo del procesador no deja el perfil a medias", async () => {
    // Escenario: «Un fallo del procesador no deja el perfil a medias». Es la razón de que el alta
    // ante el procesador ocurra antes de escribir nada.
    restore.push(usePaymentProvider(stub(["createConnectedAccount"])))

    const { cookie } = await signUp("caido@ejemplo.mx")
    const companyId = await newCompany(cookie)

    const response = await request(
      "POST",
      `/companies/${companyId}/billing-profiles`,
      profileBody(),
      cookie,
    )

    expect(response.status).toBe(500)
    expect(await db.select().from(merchantProfiles)).toHaveLength(0)
  })
})

// ─── El primario ─────────────────────────────────────────────────────────────

describe("sólo un perfil primario", () => {
  it("marcar uno desmarca el anterior", async () => {
    // Escenario: «Marcar uno desmarca el anterior».
    const { cookie } = await signUp("primario@ejemplo.mx")
    const companyId = await newCompany(cookie)

    const a = await json<{ id: string }>(
      await request("POST", `/companies/${companyId}/billing-profiles`, profileBody(), cookie),
    )
    const b = await json<{ id: string; isPrimary: boolean }>(
      await request(
        "POST",
        `/companies/${companyId}/billing-profiles`,
        profileBody({ alias: "Segunda razón social" }),
        cookie,
      ),
    )

    expect(b.isPrimary).toBe(false)

    const promoted = await json<{ isPrimary: boolean }>(
      await request(
        "POST",
        `/companies/${companyId}/billing-profiles/${b.id}/primary`,
        undefined,
        cookie,
      ),
    )

    expect(promoted.isPrimary).toBe(true)

    const [previous] = await db
      .select({ isPrimary: merchantProfiles.isPrimary })
      .from(merchantProfiles)
      .where(eq(merchantProfiles.id, a.id))

    expect(previous?.isPrimary).toBe(false)
  })
})

// ─── Cobrar ──────────────────────────────────────────────────────────────────

describe("sólo un perfil operativo permite cobrar", () => {
  it("un perfil limitado y primario sí permite cobrar", async () => {
    // Escenario: «Un perfil limitado sí permite cobrar».
    const { cookie } = await signUp("limitado@ejemplo.mx")
    const companyId = await newCompany(cookie)
    await request("POST", `/companies/${companyId}/billing-profiles`, profileBody(), cookie)

    expect((await operatingProfile(companyId)).canCharge).toBe(true)
    await expect(assertCanCharge(companyId)).resolves.toBeUndefined()
  })

  it("sin perfil operativo no se vende, y se dice qué falta", async () => {
    // Escenario: «Sin perfil operativo no se vende».
    const { cookie } = await signUp("sin-perfil@ejemplo.mx")
    const companyId = await newCompany(cookie)

    const state = await operatingProfile(companyId)
    expect(state.exists).toBe(false)
    expect(state.canCharge).toBe(false)

    await expect(assertCanCharge(companyId)).rejects.toThrow(/no tiene un perfil de facturación/)
  })

  it("un perfil activo que no es el primario no habilita", async () => {
    // Escenario: «Un perfil activo que no es el primario no habilita». Es el que más se olvida: hay
    // un perfil activo y con cuenta, y aun así la tienda no cobra.
    const { cookie } = await signUp("no-primario@ejemplo.mx")
    const companyId = await newCompany(cookie)

    const primary = await json<{ id: string }>(
      await request("POST", `/companies/${companyId}/billing-profiles`, profileBody(), cookie),
    )
    const other = await json<{ id: string }>(
      await request(
        "POST",
        `/companies/${companyId}/billing-profiles`,
        profileBody({ alias: "Otra" }),
        cookie,
      ),
    )

    // El primario se queda pendiente y sin cuenta; el otro, activo y con ella.
    await db
      .update(merchantProfiles)
      .set({ status: "pending", externalAccountId: null })
      .where(eq(merchantProfiles.id, primary.id))
    await db
      .update(merchantProfiles)
      .set({ status: "active" })
      .where(eq(merchantProfiles.id, other.id))

    expect((await operatingProfile(companyId)).canCharge).toBe(false)
  })

  it("la consulta pública no revela datos fiscales ni bancarios", async () => {
    // Escenario: «La tienda sabe si puede cobrar».
    const { cookie } = await signUp("publico@ejemplo.mx")
    const companyId = await newCompany(cookie)
    await request("POST", `/companies/${companyId}/billing-profiles`, profileBody(), cookie)

    const body = await json<Record<string, unknown>>(
      await request("GET", `/companies/${companyId}/billing-profiles/operating`, undefined, cookie),
    )

    expect(Object.keys(body).sort()).toEqual([
      "canCharge",
      "exists",
      "status",
      "verificationStatus",
    ])
  })
})

// ─── Modificación y baja ─────────────────────────────────────────────────────

describe("modificar y dar de baja", () => {
  it("un cambio bancario se propaga al procesador", async () => {
    // Escenario: «Un cambio bancario se propaga».
    const { cookie } = await signUp("banco@ejemplo.mx")
    const companyId = await newCompany(cookie)
    const profile = await json<{ id: string }>(
      await request("POST", `/companies/${companyId}/billing-profiles`, profileBody(), cookie),
    )

    await request(
      "PATCH",
      `/companies/${companyId}/billing-profiles/${profile.id}`,
      {
        bank: {
          holderType: "company",
          holder: "Producciones del Norte SA de CV",
          clabe: "002180001234567890",
          currency: "MXN",
          country: "MX",
        },
      },
      cookie,
    )

    expect(updated).toHaveLength(1)
  })

  it("renombrar el alias no habla con el procesador", async () => {
    const { cookie } = await signUp("alias@ejemplo.mx")
    const companyId = await newCompany(cookie)
    const profile = await json<{ id: string }>(
      await request("POST", `/companies/${companyId}/billing-profiles`, profileBody(), cookie),
    )

    await request(
      "PATCH",
      `/companies/${companyId}/billing-profiles/${profile.id}`,
      { alias: "Otro nombre" },
      cookie,
    )

    expect(updated).toHaveLength(0)
  })

  it("al eliminar el primario se promueve un sustituto", async () => {
    // Escenario: «Se promueve un sustituto».
    const { cookie } = await signUp("sustituto@ejemplo.mx")
    const companyId = await newCompany(cookie)

    const primary = await json<{ id: string }>(
      await request("POST", `/companies/${companyId}/billing-profiles`, profileBody(), cookie),
    )
    const other = await json<{ id: string }>(
      await request(
        "POST",
        `/companies/${companyId}/billing-profiles`,
        profileBody({ alias: "Suplente" }),
        cookie,
      ),
    )

    const response = await request(
      "DELETE",
      `/companies/${companyId}/billing-profiles/${primary.id}`,
      undefined,
      cookie,
    )

    expect(response.status).toBe(204)
    expect(deleted).toHaveLength(1)

    const [heir] = await db
      .select({ isPrimary: merchantProfiles.isPrimary })
      .from(merchantProfiles)
      .where(eq(merchantProfiles.id, other.id))

    expect(heir?.isPrimary).toBe(true)
  })

  it("no se elimina con transferencias pendientes, y se indica el motivo", async () => {
    // Escenario: «No se elimina con dinero pendiente».
    const { cookie } = await signUp("pendiente@ejemplo.mx")
    const companyId = await newCompany(cookie)
    const profile = await json<{ id: string }>(
      await request("POST", `/companies/${companyId}/billing-profiles`, profileBody(), cookie),
    )

    await db.insert(merchantPayments).values({
      id: newId(),
      companyId,
      merchantProfileId: profile.id,
      grossAmount: "1500.00",
      netAmount: "1425.00",
      status: "processing",
    })

    const response = await request(
      "DELETE",
      `/companies/${companyId}/billing-profiles/${profile.id}`,
      undefined,
      cookie,
    )

    expect(response.status).toBe(409)
    expect(await response.text()).toContain("sin liquidar")
    expect(deleted).toHaveLength(0)
  })

  it("el enlace de verificación vuelve a la pantalla de facturación de su empresa", async () => {
    // Escenario: «Se obtiene el enlace de verificación».
    const { cookie } = await signUp("verifica@ejemplo.mx")
    const companyId = await newCompany(cookie)
    const profile = await json<{ id: string }>(
      await request("POST", `/companies/${companyId}/billing-profiles`, profileBody(), cookie),
    )

    const body = await json<{ url: string }>(
      await request(
        "POST",
        `/companies/${companyId}/billing-profiles/${profile.id}/verification-link`,
        undefined,
        cookie,
      ),
    )

    expect(body.url).toContain("procesador.example")
    expect(decodeURIComponent(body.url)).toContain(`/c/${companyId}/settings/billing`)
  })
})

// ─── Sincronización con el procesador ────────────────────────────────────────

describe("el estado del perfil sigue al del procesador", () => {
  it("la cuenta habilitada y sin pendientes activa el perfil", async () => {
    // Escenario: «La cuenta habilitada activa el perfil».
    const { cookie } = await signUp("activa@ejemplo.mx")
    const companyId = await newCompany(cookie)
    await request("POST", `/companies/${companyId}/billing-profiles`, profileBody(), cookie)

    await sendEvent("account.updated", {
      id: await accountOf(companyId),
      charges_enabled: true,
      payouts_enabled: true,
      requirements: { currently_due: [] },
    })

    const [after] = await db
      .select({
        status: merchantProfiles.status,
        verificationStatus: merchantProfiles.verificationStatus,
      })
      .from(merchantProfiles)
      .where(eq(merchantProfiles.companyId, companyId))

    expect(after?.status).toBe("active")
    expect(after?.verificationStatus).toBe("verified")
  })

  it("documentación pendiente lo deja limitado", async () => {
    // Escenario: «Documentación pendiente mantiene el perfil limitado».
    const { cookie } = await signUp("pendientes@ejemplo.mx")
    const companyId = await newCompany(cookie)
    await request("POST", `/companies/${companyId}/billing-profiles`, profileBody(), cookie)

    await sendEvent("account.updated", {
      id: await accountOf(companyId),
      charges_enabled: true,
      payouts_enabled: false,
      requirements: { currently_due: ["company.tax_id_verification"] },
    })

    const [after] = await db
      .select({
        status: merchantProfiles.status,
        verificationStatus: merchantProfiles.verificationStatus,
      })
      .from(merchantProfiles)
      .where(eq(merchantProfiles.companyId, companyId))

    expect(after?.status).toBe("limited")
    expect(after?.verificationStatus).toBe("pending")
  })
})

// ─── Las tres compuertas ─────────────────────────────────────────────────────

/**
 * Una por combinación, como pide el proposal.
 *
 * La operación es siempre la misma —crear un almacén, que es la que la spec nombra— y lo único que
 * cambia entre los cuatro casos es qué compuerta está abierta. Que el resultado difiera sólo por eso
 * es lo que demuestra que ninguna implica a las otras.
 */
describe("las tres compuertas son independientes", () => {
  async function createWarehouse(companyId: string, cookie: string) {
    return request("POST", `/companies/${companyId}/warehouses`, { name: "Nave" }, cookie)
  }

  it("con las tres, la operación pasa", async () => {
    const { cookie } = await signUp("tres@ejemplo.mx")
    const companyId = await newCompany(cookie)
    await enableService(companyId, "warehouses")
    await subscribeCompany(companyId)
    restore.push(useSubscriptionGate(true))

    expect((await createWarehouse(companyId, cookie)).status).toBe(201)
  })

  it("la suscripción no sustituye a la habilitación", async () => {
    // Escenario: «La suscripción no sustituye a la habilitación». Propietario, con suscripción
    // vigente, y sin el servicio contratado.
    const { cookie } = await signUp("sin-servicio@ejemplo.mx")
    const companyId = await newCompany(cookie)
    await subscribeCompany(companyId)
    restore.push(useSubscriptionGate(true))

    const response = await createWarehouse(companyId, cookie)

    expect(response.status).toBe(403)
    expect(await response.text()).toContain("service_not_enabled")
  })

  it("la habilitación no sustituye al permiso", async () => {
    // Escenario: «La habilitación no sustituye al permiso». El servicio está contratado y el rol no
    // trae la clave: `403`.
    const owner = await signUp("dueno-compuertas@ejemplo.mx")
    const companyId = await newCompany(owner.cookie)
    await enableService(companyId, "warehouses")
    await subscribeCompany(companyId)
    restore.push(useSubscriptionGate(true))

    const member = await signUp("sin-permiso@ejemplo.mx")
    const roleId = newId()
    await db.insert(roles).values({ id: roleId, companyId, name: "Mirón", permissions: [] })
    await db
      .insert(companyMembers)
      .values({ id: newId(), companyId, userId: member.userId, roleId, isActive: true })

    const response = await createWarehouse(companyId, member.cookie)

    expect(response.status).toBe(403)
    expect(await response.text()).toContain("forbidden")
  })

  it("el permiso no sustituye a la suscripción", async () => {
    // Escenario: «El permiso no sustituye a la suscripción». Propietario —que elude el permiso— con
    // el servicio contratado y sin suscripción: se le pide elegir plan.
    const { cookie } = await signUp("sin-suscripcion@ejemplo.mx")
    const companyId = await newCompany(cookie)
    await enableService(companyId, "warehouses")
    restore.push(useSubscriptionGate(true))

    const response = await createWarehouse(companyId, cookie)

    expect(response.status).toBe(403)
    // El código propio es lo que permite a la pantalla presentar la selección de plan de forma
    // bloqueante en lugar de un «no tienes permiso» que despista.
    expect(await response.text()).toContain("subscription_required")
  })

  it("con la compuerta de suscripción apagada, lo demás sigue mandando", async () => {
    // La compuerta llega apagada porque hoy ninguna empresa tiene suscripción (H-86). Apagarla no
    // afloja las otras dos: sin el servicio contratado se sigue rechazando.
    const { cookie } = await signUp("apagada@ejemplo.mx")
    const companyId = await newCompany(cookie)
    restore.push(useSubscriptionGate(false))

    expect((await createWarehouse(companyId, cookie)).status).toBe(403)

    await enableService(companyId, "warehouses")
    expect((await createWarehouse(companyId, cookie)).status).toBe(201)
  })
})

describe("la habilitación se pregunta por clave", () => {
  it("la respuesta enumera los servicios contratados", async () => {
    // Escenario: «La comprobación es por clave, no por identificador».
    const { cookie } = await signUp("claves@ejemplo.mx")
    const companyId = await newCompany(cookie)
    await enableService(companyId, "warehouses")
    await enableService(companyId, "websites")

    const body = await json<{ services: string[] }>(
      await request("GET", `/companies/${companyId}/entitlements`, undefined, cookie),
    )

    expect(body.services.sort()).toEqual(["warehouses", "websites"])
  })
})
