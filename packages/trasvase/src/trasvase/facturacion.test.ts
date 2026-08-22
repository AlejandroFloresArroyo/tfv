/**
 * La rutina de suscripciones y facturación.
 *
 * Los dos puntos con dientes: el importe viejo está en **centavos** (el webhook guardaba
 * `invoice.amount_paid` tal cual) y el destino es un decimal exacto en pesos; y el índice parcial
 * nuevo admite **una sola suscripción no cancelada por empresa**, cuando el origen tiene dobles.
 * El desempate no es el azar: gana la que la empresa nombra en `companySubscriptionId`.
 */

import { companySubscriptions, subscriptionPayments, subscriptionPlans } from "@tfv/db/schema"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import postgres from "postgres"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { escribirVolcado } from "../accesorios/construir.ts"
import { type Ensayo, ensayo } from "../accesorios/ensayo.ts"
import { abrirVolcado } from "../volcado/leer.ts"
import { trasvasarArchivos } from "./archivos.ts"
import { abrirContexto, type Contexto } from "./contexto.ts"
import { trasvasarFacturacion } from "./facturacion.ts"
import { trasvasarNucleo } from "./nucleo.ts"

const sql = postgres(process.env.DATABASE_URL as string, { max: 2 })
const raiz = mkdtempSync(join(tmpdir(), "trasvase-facturacion-"))

let escenario: Ensayo
let contexto: Contexto

afterAll(async () => {
  await sql.end()
  rmSync(raiz, { recursive: true, force: true })
})

beforeEach(async () => {
  await sql`truncate table
    subscription_payments, company_subscriptions, subscription_plans,
    company_services, counterparties, global_categories, services,
    user_addresses, company_addresses, company_members, roles, companies, users, uploads
    cascade`
  await sql`drop schema if exists trasvase cascade`
  escenario = ensayo()
  const dir = join(raiz, `caso-${Math.random().toString(36).slice(2)}`)
  escribirVolcado(dir, escenario.colecciones)
  contexto = await abrirContexto(sql, abrirVolcado(dir))
  await trasvasarArchivos(contexto)
  await trasvasarNucleo(contexto)
  await trasvasarFacturacion(contexto)
})

function idNuevo(coleccion: string, idViejo: string): string {
  const id = contexto.registro.idExistente(coleccion, idViejo)
  if (!id) throw new Error(`Sin correspondencia para ${coleccion}/${idViejo}`)
  return id
}

describe("trasvasarFacturacion", () => {
  it("el plan migra con sus prestaciones limpias de adornos de Mongo", async () => {
    const [plan] = await contexto.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, idNuevo("core_subscription", escenario.ids.planPro)))

    expect(plan).toMatchObject({ tier: 1, title: "Pro", externalProductId: "prod_pro" })
    expect(plan?.features).toEqual([
      { key: "seats", name: "Asientos", type: "number", value: "10", limited: true },
    ])
  })

  it("la suscripción vigente migra entera; la doble cae con la regla del índice parcial", async () => {
    const [vigente] = await contexto.db
      .select()
      .from(companySubscriptions)
      .where(
        eq(
          companySubscriptions.id,
          idNuevo("core_companies_subscription", escenario.ids.suscripcionFilmadora),
        ),
      )

    expect(vigente).toMatchObject({
      status: "active",
      seats: 3,
      interval: "month",
      intervalCount: 1,
      externalSubscriptionId: "sub_filmadora",
      companyId: idNuevo("core_companies", escenario.ids.filmadora),
      planId: idNuevo("core_subscription", escenario.ids.planPro),
      subscribedById: idNuevo("core_user", escenario.ids.ana),
    })

    const cuarentena = await sql<{ id_viejo: string; regla: string }[]>`
      select id_viejo, regla from trasvase.cuarentena
      where coleccion = 'core_companies_subscription'
    `
    expect(cuarentena).toEqual([
      { id_viejo: escenario.ids.suscripcionDoble, regla: "vigente-repetida" },
    ])
  })

  it("los centavos del origen llegan como pesos exactos, sin pasar por coma flotante", async () => {
    const junio = await contexto.db
      .select()
      .from(subscriptionPayments)
      .where(
        eq(
          subscriptionPayments.id,
          idNuevo("core_companies_subscriptions_payment", escenario.ids.pagoJunio),
        ),
      )

    expect(junio[0]).toMatchObject({
      amount: "499.00",
      currency: "MXN",
      succeeded: true,
      externalInvoiceId: "in_junio",
    })
  })

  it("el cobro de la suscripción eliminada (M-08) migra suelto, con incidencia", async () => {
    const [colgado] = await contexto.db
      .select()
      .from(subscriptionPayments)
      .where(
        eq(
          subscriptionPayments.id,
          idNuevo("core_companies_subscriptions_payment", escenario.ids.pagoColgado),
        ),
      )

    expect(colgado?.subscriptionId).toBeNull()
    expect(colgado?.amount).toBe("199.00")

    const incidencias = await sql<{ campo: string }[]>`
      select campo from trasvase.incidencias
      where coleccion = 'core_companies_subscriptions_payment'
        and id_viejo = ${escenario.ids.pagoColgado}
    `
    expect(incidencias.map((fila) => fila.campo)).toContain("companySubscriptionId")
  })

  it("el pago fallido migra como no exitoso, no desaparece", async () => {
    const [fallido] = await contexto.db
      .select()
      .from(subscriptionPayments)
      .where(
        eq(
          subscriptionPayments.id,
          idNuevo("core_companies_subscriptions_payment", escenario.ids.pagoFallido),
        ),
      )

    expect(fallido?.succeeded).toBe(false)
  })

  it("cada colección cuadra: origen = migradas + cuarentena", async () => {
    const casos: Array<[string, string]> = [
      ["core_subscription", "subscription_plans"],
      ["core_companies_subscription", "company_subscriptions"],
      ["core_companies_subscriptions_payment", "subscription_payments"],
    ]
    for (const [coleccion, tabla] of casos) {
      const origen = escenario.colecciones[coleccion]?.length ?? 0
      const [destino] = await sql.unsafe<{ total: string }[]>(
        `select count(*)::text as total from ${tabla}`,
      )
      const [cuarentena] = await sql<{ total: string }[]>`
        select count(*)::text as total from trasvase.cuarentena where coleccion = ${coleccion}
      `
      expect(Number(destino?.total) + Number(cuarentena?.total), `${coleccion} no cuadra`).toBe(
        origen,
      )
    }
  })

  it("correr dos veces no duplica pagos ni pierde la suscripción vigente", async () => {
    const antes = (await contexto.db.select().from(subscriptionPayments)).length

    const segundo = await abrirContexto(sql, contexto.volcado)
    await trasvasarArchivos(segundo)
    await trasvasarNucleo(segundo)
    await trasvasarFacturacion(segundo)

    expect((await contexto.db.select().from(subscriptionPayments)).length).toBe(antes)
    const vigentes = await contexto.db.select().from(companySubscriptions)
    expect(vigentes).toHaveLength(1)
  })
})
