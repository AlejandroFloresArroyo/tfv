/**
 * Suscripciones y facturación: planes, suscripciones de empresa y sus cobros.
 *
 * Dos conversiones con dientes:
 *
 * - **Centavos → pesos.** El webhook viejo guardaba `invoice.amount_paid` tal cual, en la unidad
 *   menor de Stripe (`core/stripe/events.ts:64` del árbol viejo). La división es entera, nunca
 *   por coma flotante: el destino es `numeric(14,2)` y `@tfv/contracts/money` es exigente.
 * - **Una vigente por empresa.** El índice parcial `company_subscriptions_company_unique` admite
 *   una sola no cancelada. Cuando el origen trae dobles, gana la que la propia empresa nombra en
 *   `companySubscriptionId`; sin ese voto, la de periodo más reciente.
 *
 * Los cobros de suscripciones que `DEFECTS.md` M-08 eliminó migran **sueltos** (`subscriptionId`
 * nulo, como la clave `set null` del destino haría), no se tiran: son historial de dinero.
 */

import {
  companySubscriptions,
  type PlanFeature,
  subscriptionPayments,
  subscriptionPlans,
} from "@tfv/db/schema"
import type { Documento } from "../volcado/ejson.ts"
import type { Volcado } from "../volcado/leer.ts"
import { type Contexto, enTransaccion, fecha, idDe, marcasDe, recortar, texto } from "./contexto.ts"

export const COLECCIONES_FACTURACION = [
  "core_subscription",
  "core_companies_subscription",
  "core_companies_subscriptions_payment",
] as const

const ESTADOS = new Set([
  "trialing",
  "active",
  "past_due",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "canceled",
])

const INTERVALOS = new Set(["day", "week", "month", "year"])

/** Centavos enteros → pesos con dos decimales, en aritmética entera. */
export function pesosDeCentavos(centavos: number): string {
  const enteros = Math.trunc(centavos / 100)
  const resto = Math.abs(centavos % 100)
  return `${enteros}.${String(resto).padStart(2, "0")}`
}

/** La prestación vieja → la del destino, sin `_id` de subdocumento ni banderas internas. */
function prestacionesDe(crudo: unknown): PlanFeature[] {
  if (!Array.isArray(crudo)) return []
  const prestaciones: PlanFeature[] = []
  for (const entrada of crudo) {
    if (entrada === null || typeof entrada !== "object") continue
    const doc = entrada as Record<string, unknown>
    const clave = texto(doc.key)
    if (clave === "") continue
    const tipo = texto(doc.type)
    prestaciones.push({
      key: clave,
      name: texto(doc.name, clave),
      ...(texto(doc.description) !== "" && { description: texto(doc.description) }),
      type: tipo === "boolean" || tipo === "number" ? tipo : "string",
      ...(texto(doc.value) !== "" && { value: texto(doc.value) }),
      ...(doc.limited === true && { limited: true }),
    })
    // Las subprestaciones se aplanan a continuación de su madre: el destino no anida.
    prestaciones.push(...prestacionesDe(doc.subFeatures))
  }
  return prestaciones
}

async function cargar(volcado: Volcado, coleccion: string): Promise<Documento[]> {
  if (!volcado.existe(coleccion)) return []
  const documentos: Documento[] = []
  for await (const doc of volcado.documentos(coleccion)) documentos.push(doc)
  return documentos
}

export async function trasvasarFacturacion(contexto: Contexto): Promise<void> {
  const { registro, volcado } = contexto
  registro.limpiarCuarentena(COLECCIONES_FACTURACION)

  const planes = await cargar(volcado, "core_subscription")
  const suscripciones = await cargar(volcado, "core_companies_subscription")
  const pagos = await cargar(volcado, "core_companies_subscriptions_payment")

  // El voto de cada empresa: a qué suscripción llama suya. Es el desempate de las dobles.
  const votoDeEmpresa = new Map<string, string>()
  for await (const doc of volcado.existe("core_companies")
    ? volcado.documentos("core_companies")
    : (async function* () {})()) {
    const voto = texto(doc.companySubscriptionId)
    if (voto !== "") votoDeEmpresa.set(idDe(doc), voto)
  }

  await enTransaccion(contexto, async (db) => {
    // ── Planes ───────────────────────────────────────────────────────────────
    {
      const productos = new Set<string>()
      for (const doc of planes) {
        const idViejo = idDe(doc)
        if (typeof doc.tier !== "number" || !Number.isInteger(doc.tier)) {
          registro.cuarentena(
            "core_subscription",
            idViejo,
            "tier-invalido",
            "El plan no trae un nivel entero y la columna destino lo exige",
            doc,
          )
          continue
        }

        let producto: string | null = texto(doc.productId) || null
        if (producto !== null) {
          if (productos.has(producto)) {
            registro.incidencia(
              "core_subscription",
              idViejo,
              "productId",
              `El producto «${producto}» ya lo referencia otro plan (subscription_plans_external_unique); éste se soltó`,
            )
            producto = null
          } else {
            productos.add(producto)
          }
        }

        const fila = {
          id: registro.idPara("core_subscription", idViejo),
          tier: doc.tier,
          title: recortar(contexto, "core_subscription", idViejo, "title", texto(doc.title), 160),
          description: texto(doc.description),
          isIndividual: doc.individual === true,
          isRecommended: doc.recommended === true,
          externalProductId: producto,
          features: prestacionesDe(doc.features),
          ...marcasDe(doc),
        }
        await db
          .insert(subscriptionPlans)
          .values(fila)
          .onConflictDoUpdate({ target: subscriptionPlans.id, set: fila })
      }
    }

    // ── Suscripciones ────────────────────────────────────────────────────────
    {
      interface Candidata {
        readonly doc: Documento
        readonly idViejo: string
        readonly companyId: string
        readonly planId: string
      }
      const vigentesPorEmpresa = new Map<string, Candidata[]>()
      const sueltas: Candidata[] = []
      const externas = new Set<string>()

      for (const doc of suscripciones) {
        const idViejo = idDe(doc)
        const companyId = registro.resolver("core_companies", texto(doc.companyId))
        if (!companyId) {
          registro.cuarentena(
            "core_companies_subscription",
            idViejo,
            "empresa-inexistente",
            `La empresa (core_companies/${texto(doc.companyId) || "ninguna"}) no existe o quedó en cuarentena`,
            doc,
          )
          continue
        }
        const planId = registro.resolver("core_subscription", texto(doc.subscriptionId))
        if (!planId) {
          registro.cuarentena(
            "core_companies_subscription",
            idViejo,
            "plan-inexistente",
            `El plan (core_subscription/${texto(doc.subscriptionId) || "ninguno"}) no existe o quedó en cuarentena`,
            doc,
          )
          continue
        }
        const estado = texto(doc.status)
        if (!ESTADOS.has(estado)) {
          registro.cuarentena(
            "core_companies_subscription",
            idViejo,
            "estado-desconocido",
            `El estado «${estado}» no existe en el enum destino (subscription_status)`,
            doc,
          )
          continue
        }

        const candidata: Candidata = { doc, idViejo, companyId, planId }
        if (estado === "canceled") {
          sueltas.push(candidata)
        } else {
          const lista = vigentesPorEmpresa.get(texto(doc.companyId)) ?? []
          lista.push(candidata)
          vigentesPorEmpresa.set(texto(doc.companyId), lista)
        }
      }

      const elegidas: Candidata[] = [...sueltas]
      for (const [empresaVieja, candidatas] of vigentesPorEmpresa) {
        const voto = votoDeEmpresa.get(empresaVieja)
        const puntaje = (candidata: Candidata): number =>
          (candidata.idViejo === voto ? 2 ** 50 : 0) +
          (fecha(candidata.doc.periodEnd)?.getTime() ?? 0)
        const ordenadas = [...candidatas].sort((a, b) => puntaje(b) - puntaje(a))
        elegidas.push(ordenadas[0] as Candidata)
        for (const perdedora of ordenadas.slice(1)) {
          registro.cuarentena(
            "core_companies_subscription",
            perdedora.idViejo,
            "vigente-repetida",
            "La empresa ya tiene una suscripción no cancelada (company_subscriptions_company_unique); se conservó la que la empresa nombra, o la de periodo más reciente",
            perdedora.doc,
          )
        }
      }

      for (const candidata of elegidas) {
        const doc = candidata.doc
        const idViejo = candidata.idViejo

        let externa: string | null = texto(doc.stripe_subscriptionId) || null
        if (externa !== null) {
          if (externas.has(externa)) {
            registro.incidencia(
              "core_companies_subscription",
              idViejo,
              "stripe_subscriptionId",
              `La referencia externa «${externa}» ya la lleva otra suscripción (company_subscriptions_external_unique); ésta se soltó`,
            )
            externa = null
          } else {
            externas.add(externa)
          }
        }

        const intervalo = texto(doc.interval)
        const asientos =
          typeof doc.quantity === "number" && Number.isInteger(doc.quantity)
            ? Math.max(1, doc.quantity)
            : 1

        const fila = {
          id: registro.idPara("core_companies_subscription", idViejo),
          companyId: candidata.companyId,
          planId: candidata.planId,
          subscribedById: registro.resolver("core_user", texto(doc.userId)) ?? null,
          status: texto(doc.status) as
            | "trialing"
            | "active"
            | "past_due"
            | "incomplete"
            | "incomplete_expired"
            | "unpaid"
            | "canceled",
          cancelAtPeriodEnd: doc.cancel_at_period_end === true,
          seats: asientos,
          interval: (INTERVALOS.has(intervalo) ? intervalo : "month") as
            | "day"
            | "week"
            | "month"
            | "year",
          intervalCount:
            typeof doc.intervalCount === "number" && Number.isInteger(doc.intervalCount)
              ? Math.max(1, doc.intervalCount)
              : 1,
          periodStart: fecha(doc.periodStart),
          periodEnd: fecha(doc.periodEnd),
          externalSubscriptionId: externa,
          externalCustomerId: texto(doc.stripe_customerId) || null,
          externalPriceId: texto(doc.stripe_priceId) || null,
          ...marcasDe(doc),
        }
        await db
          .insert(companySubscriptions)
          .values(fila)
          .onConflictDoUpdate({ target: companySubscriptions.id, set: fila })
      }
    }

    // ── Cobros ───────────────────────────────────────────────────────────────
    {
      const facturas = new Set<string>()
      for (const doc of pagos) {
        const idViejo = idDe(doc)
        const companyId = registro.resolver("core_companies", texto(doc.companyId))
        if (!companyId) {
          registro.cuarentena(
            "core_companies_subscriptions_payment",
            idViejo,
            "empresa-inexistente",
            `La empresa (core_companies/${texto(doc.companyId) || "ninguna"}) no existe o quedó en cuarentena`,
            doc,
          )
          continue
        }
        const centavos = doc.amount
        if (typeof centavos !== "number" || !Number.isInteger(centavos) || centavos < 0) {
          registro.cuarentena(
            "core_companies_subscriptions_payment",
            idViejo,
            "importe-invalido",
            `El importe «${String(centavos)}» no es un entero de centavos; no se convierte a ciegas`,
            doc,
          )
          continue
        }

        const factura: string | null = texto(doc.stripe_invoiceId) || null
        if (factura !== null) {
          if (facturas.has(factura)) {
            registro.cuarentena(
              "core_companies_subscriptions_payment",
              idViejo,
              "factura-repetida",
              `La factura externa «${factura}» ya está migrada (subscription_payments_invoice_unique)`,
              doc,
            )
            continue
          }
          facturas.add(factura)
        }

        // `DEFECTS.md` M-08: la suscripción pudo ser eliminada; el cobro migra suelto.
        const suscripcionVieja = texto(doc.companySubscriptionId)
        let subscriptionId: string | null = null
        if (suscripcionVieja !== "") {
          subscriptionId =
            registro.resolver("core_companies_subscription", suscripcionVieja) ?? null
          if (subscriptionId === null) {
            registro.incidencia(
              "core_companies_subscriptions_payment",
              idViejo,
              "companySubscriptionId",
              `La suscripción (core_companies_subscription/${suscripcionVieja}) no existe o quedó en cuarentena; el cobro migra suelto`,
            )
          }
        }

        const fila = {
          id: registro.idPara("core_companies_subscriptions_payment", idViejo),
          companyId,
          subscriptionId,
          amount: pesosDeCentavos(centavos),
          currency: recortar(
            contexto,
            "core_companies_subscriptions_payment",
            idViejo,
            "currency",
            texto(doc.currency, "mxn").toUpperCase(),
            3,
          ),
          seats:
            typeof doc.quantity === "number" && Number.isInteger(doc.quantity)
              ? Math.max(1, doc.quantity)
              : 1,
          periodStart: fecha(doc.periodStart),
          periodEnd: fecha(doc.periodEnd),
          succeeded: texto(doc.status) === "paid",
          externalInvoiceId: factura,
          externalPaymentIntentId: texto(doc.stripe_paymentIntentId) || null,
          ...marcasDe(doc),
        }
        await db
          .insert(subscriptionPayments)
          .values(fila)
          .onConflictDoUpdate({ target: subscriptionPayments.id, set: fila })
      }
    }
  })
}
