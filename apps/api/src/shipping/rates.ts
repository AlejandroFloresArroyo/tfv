/**
 * El cuadro de tarifas de envío de una empresa.
 *
 * Ver `openspec/specs/shipping-rates/spec.md`, requisito «Las tarifas son datos configurables».
 * Rebanada 17.
 *
 * Este módulo **no calcula nada**: lee y escribe la configuración, y la traduce a la forma que
 * consume el motor de `@tfv/contracts`. La regla vive allí, en una función pura, por el mismo
 * motivo que el motor de cotizaciones: la interfaz enseña la estimación antes de pagar y el
 * servidor cobra al materializar, y con dos implementaciones no coincidirían — que es el defecto
 * M-11 entero.
 *
 * ## Una empresa sin fila cobra igual
 *
 * `resolveRates` recae en `DEFAULT_SHIPPING_RATES`, el cuadro de la spec. Sin eso, dar de alta una
 * empresa dejaría sus envíos sin precio hasta que alguien entrara a configurarlos, y la primera
 * compra fallaría por una pantalla que nadie sabía que había que visitar.
 */

import {
  DEFAULT_SHIPPING_RATES,
  newId,
  type ShippingRates,
  type ShippingThreshold,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import { shippingRates } from "@tfv/db/schema"
import { eq } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"

/** Lo que la pantalla enseña y guarda. Todo importe, cadena decimal. */
export interface RatesRecord {
  readonly currency: string
  readonly volumetricDivisor: number
  readonly localBase: string
  readonly localPerKilogram: string
  readonly nationalBase: string
  readonly nationalPerKilogram: string
  readonly internationalBase: string
  readonly internationalPerKilogram: string
  readonly distanceSurcharges: readonly ShippingThreshold[]
  readonly itemSurcharges: readonly ShippingThreshold[]
  readonly exchangeCurrency: string | null
  readonly exchangeRate: string | null
  /** Falso mientras la empresa no ha guardado nada y hereda el cuadro de la spec. */
  readonly configured: boolean
}

export interface RatesInput {
  readonly currency?: string | undefined
  readonly volumetricDivisor?: number | undefined
  readonly localBase?: string | undefined
  readonly localPerKilogram?: string | undefined
  readonly nationalBase?: string | undefined
  readonly nationalPerKilogram?: string | undefined
  readonly internationalBase?: string | undefined
  readonly internationalPerKilogram?: string | undefined
  readonly distanceSurcharges?: readonly ShippingThreshold[] | undefined
  readonly itemSurcharges?: readonly ShippingThreshold[] | undefined
  readonly exchangeCurrency?: string | null | undefined
  readonly exchangeRate?: string | null | undefined
}

/** El cuadro de la spec, en la forma de la fila. Es lo que ve una empresa que no ha configurado. */
const FALLBACK: RatesRecord = {
  currency: DEFAULT_SHIPPING_RATES.currency,
  volumetricDivisor: Number(DEFAULT_SHIPPING_RATES.volumetricDivisor),
  localBase: DEFAULT_SHIPPING_RATES.local.base,
  localPerKilogram: DEFAULT_SHIPPING_RATES.local.perKilogram,
  nationalBase: DEFAULT_SHIPPING_RATES.national.base,
  nationalPerKilogram: DEFAULT_SHIPPING_RATES.national.perKilogram,
  internationalBase: DEFAULT_SHIPPING_RATES.international.base,
  internationalPerKilogram: DEFAULT_SHIPPING_RATES.international.perKilogram,
  distanceSurcharges: DEFAULT_SHIPPING_RATES.distanceSurcharges,
  itemSurcharges: DEFAULT_SHIPPING_RATES.itemSurcharges,
  exchangeCurrency: null,
  exchangeRate: null,
  configured: false,
}

type Row = typeof shippingRates.$inferSelect

function toRecord(row: Row): RatesRecord {
  return {
    currency: row.currency,
    volumetricDivisor: row.volumetricDivisor,
    localBase: row.localBase,
    localPerKilogram: row.localPerKilogram,
    nationalBase: row.nationalBase,
    nationalPerKilogram: row.nationalPerKilogram,
    internationalBase: row.internationalBase,
    internationalPerKilogram: row.internationalPerKilogram,
    distanceSurcharges: row.distanceSurcharges,
    itemSurcharges: row.itemSurcharges,
    exchangeCurrency: row.exchangeCurrency,
    exchangeRate: row.exchangeRate,
    configured: true,
  }
}

/**
 * La fila de una empresa, dentro de una transacción ya abierta.
 *
 * No lleva filtro de empresa además del de la consulta: la política de la tabla ya acota, y la
 * consulta nombra la empresa para no traer la de otra cuando el alcance abarca varias.
 */
async function rowOf(tx: Transaction, companyId: string): Promise<Row | undefined> {
  const [row] = await tx.select().from(shippingRates).where(eq(shippingRates.companyId, companyId))
  return row
}

/** El cuadro de una empresa, con el de la spec cuando no ha configurado el suyo. */
export async function getRates(actor: Actor, companyId: string): Promise<RatesRecord> {
  return withRequester(actor, async (tx) => {
    const row = await rowOf(tx, companyId)
    return row ? toRecord(row) : FALLBACK
  })
}

/**
 * Guarda el cuadro de una empresa. Crea la fila la primera vez.
 *
 * Es una fusión sobre lo que ya había, no un reemplazo: la pantalla manda el bloque entero en cada
 * intento —que es lo que hace seguro repetir un guardado que falló—, pero un cliente que mande sólo
 * el campo que cambió obtiene lo que espera y no un cuadro a medias.
 */
export async function updateRates(
  actor: Actor,
  companyId: string,
  input: RatesInput,
): Promise<RatesRecord> {
  return withRequester(actor, async (tx) => {
    const existing = await rowOf(tx, companyId)
    const current = existing ? toRecord(existing) : FALLBACK

    const merged = {
      currency: input.currency ?? current.currency,
      volumetricDivisor: input.volumetricDivisor ?? current.volumetricDivisor,
      localBase: input.localBase ?? current.localBase,
      localPerKilogram: input.localPerKilogram ?? current.localPerKilogram,
      nationalBase: input.nationalBase ?? current.nationalBase,
      nationalPerKilogram: input.nationalPerKilogram ?? current.nationalPerKilogram,
      internationalBase: input.internationalBase ?? current.internationalBase,
      internationalPerKilogram: input.internationalPerKilogram ?? current.internationalPerKilogram,
      distanceSurcharges: input.distanceSurcharges ?? current.distanceSurcharges,
      itemSurcharges: input.itemSurcharges ?? current.itemSurcharges,
      // Nulo explícito borra el tipo de cambio; ausente lo deja como estaba. Son dos intenciones
      // distintas y `exactOptionalPropertyTypes` obliga a distinguirlas.
      exchangeCurrency:
        input.exchangeCurrency === undefined ? current.exchangeCurrency : input.exchangeCurrency,
      exchangeRate: input.exchangeRate === undefined ? current.exchangeRate : input.exchangeRate,
    }

    if (existing) {
      const [updated] = await tx
        .update(shippingRates)
        .set(merged)
        .where(eq(shippingRates.id, existing.id))
        .returning()
      return toRecord(updated as Row)
    }

    const [created] = await tx
      .insert(shippingRates)
      .values({ id: newId(), companyId, ...merged })
      .returning()
    return toRecord(created as Row)
  })
}

/**
 * El cuadro de una empresa en la forma que consume el motor.
 *
 * Recibe la transacción en lugar de abrirla porque quien calcula un envío ya está dentro de una:
 * la estimación de la tienda y la materialización del pedido leen tarifas, existencias y
 * direcciones en la misma lectura coherente.
 */
export async function resolveRates(tx: Transaction, companyId: string): Promise<ShippingRates> {
  const row = await rowOf(tx, companyId)
  if (!row) return DEFAULT_SHIPPING_RATES

  return {
    currency: row.currency,
    volumetricDivisor: String(row.volumetricDivisor),
    local: { base: row.localBase, perKilogram: row.localPerKilogram },
    national: { base: row.nationalBase, perKilogram: row.nationalPerKilogram },
    international: {
      base: row.internationalBase,
      perKilogram: row.internationalPerKilogram,
    },
    distanceSurcharges: row.distanceSurcharges,
    itemSurcharges: row.itemSurcharges,
  }
}

/** La conversión configurada, o ninguna. Las dos columnas van juntas o no van. */
export async function resolveConversion(
  tx: Transaction,
  companyId: string,
): Promise<{ currency: string; rate: string } | undefined> {
  const row = await rowOf(tx, companyId)
  if (!row?.exchangeCurrency || !row.exchangeRate) return undefined
  return { currency: row.exchangeCurrency, rate: row.exchangeRate }
}
