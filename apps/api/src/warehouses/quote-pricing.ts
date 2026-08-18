/**
 * De la cotización guardada a sus importes.
 *
 * Ver `openspec/specs/quotation-pricing/spec.md`. Rebanada 14.
 *
 * Este módulo **no calcula nada**: resuelve qué precio aplica a cada línea y se lo entrega al motor
 * de `@tfv/contracts`, que es una función pura y la misma que corre en el navegador. La separación
 * es el requisito de que la previsualización coincida con lo que el servidor calculará — con dos
 * implementaciones no coincidirían, y la que mandaría sería la del navegador, que es exactamente el
 * defecto M-06.
 *
 * Lo que sí decide aquí es **cuál es el precio**: la precedencia de `warehouse-catalog` —tarifa de
 * la lista, o precio del producto, o cero— más el ajuste propio de la medida.
 */

import {
  add,
  computeQuotation,
  formatMoney,
  isZero,
  money,
  type QuotationBreakdown,
  type QuotationLineInput,
  type RateSchedule,
} from "@tfv/contracts"
import type { Transaction } from "@tfv/db"
import {
  warehouseMeasurements,
  warehouseProductPrices,
  warehouseProducts,
  warehouseQuoteLines,
  type warehouseQuotes,
} from "@tfv/db/schema"
import { eq } from "drizzle-orm"
import { reservedByLine } from "./reservations.ts"

/**
 * Resuelve las líneas de una cotización a lo que el motor necesita.
 *
 * La cantidad **no se lee de una columna**: es cuántas unidades tiene apartadas la línea. Es la
 * misma cifra que ve el almacén, así que un importe nunca puede cobrar por equipo que no está
 * comprometido.
 */
export async function resolveLines(
  tx: Transaction,
  quoteId: string,
): Promise<QuotationLineInput[]> {
  const rows = await tx
    .select({
      line: warehouseQuoteLines,
      priceDifference: warehouseMeasurements.priceDifference,
      productId: warehouseProducts.id,
      productPrice: warehouseProducts.price,
      rate: warehouseProductPrices,
    })
    .from(warehouseQuoteLines)
    .innerJoin(
      warehouseMeasurements,
      eq(warehouseMeasurements.id, warehouseQuoteLines.measurementId),
    )
    .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
    .leftJoin(
      warehouseProductPrices,
      eq(warehouseProductPrices.id, warehouseQuoteLines.productPriceId),
    )
    .where(eq(warehouseQuoteLines.quoteId, quoteId))
    .orderBy(warehouseQuoteLines.positionProduct, warehouseQuoteLines.position)

  const reserved = await reservedByLine(tx, quoteId)

  return rows.map((row) => {
    const difference = row.priceDifference

    // Precedencia de `warehouse-catalog`: la tarifa de la lista, o el precio del producto, o cero.
    // El escalar del producto **sólo aplica a la venta**; una renta sin tarifa la resuelve el motor.
    const listed = row.rate?.sale
    const base = listed && !isZero(money(listed)) ? listed : row.productPrice

    return {
      id: row.line.id,
      productId: row.productId,
      measurementId: row.line.measurementId,
      quantity: (reserved.get(row.line.id) ?? []).length,
      frequency: row.line.frequency,
      basePrice: adjust(base, difference),
      ...(row.rate ? { rent: adjustSchedule(row.rate.rent, difference) } : {}),
      ...(row.rate ? { penalty: adjustSchedule(row.rate.penalty, difference) } : {}),
      position: row.line.position,
      positionProduct: row.line.positionProduct,
    }
  })
}

/**
 * El desglose de una cotización.
 *
 * **Si está congelado, manda el congelado.** Es lo que hace cierto que una cotización cerrada no se
 * mueva aunque el catálogo cambie tres veces, y lo que permite explicar un importe de hace ocho
 * meses. Mientras está abierta se calcula al vuelo, y refleja el catálogo de hoy.
 */
export async function breakdownOf(
  tx: Transaction,
  quote: typeof warehouseQuotes.$inferSelect,
): Promise<QuotationBreakdown> {
  if (quote.computed) return quote.computed
  return computeOf(tx, quote)
}

/** Calcula el desglose desde el catálogo, ignorando lo que hubiera congelado. */
export async function computeOf(
  tx: Transaction,
  quote: typeof warehouseQuotes.$inferSelect,
): Promise<QuotationBreakdown> {
  return computeQuotation({
    type: quote.type,
    startsOn: quote.startsOn,
    endsOn: quote.endsOn,
    roundDays: quote.roundDays,
    roundDirection: quote.roundDirection,
    lines: await resolveLines(tx, quote.id),
    ...(quote.paymentTerms ? { payment: quote.paymentTerms } : {}),
    ...(quote.taxes ? { taxes: quote.taxes } : {}),
  })
}

/** Suma el ajuste de la medida al precio resuelto. En decimal exacto, nunca en coma flotante. */
function adjust(amount: string, difference: string): string {
  const value = money(amount)
  return isZero(money(difference)) ? formatMoney(value) : formatMoney(add(value, money(difference)))
}

/**
 * El ajuste de la medida alcanza a **todos** los importes de la tarifa.
 *
 * Una medida más cara lo es por semana y por mes, no sólo al venderla. Dejar la renta sin ajustar
 * haría que el mismo equipo costara distinto según se compre o se rente, sin que nadie lo decidiera.
 */
function adjustSchedule(schedule: RateSchedule, difference: string): RateSchedule {
  if (isZero(money(difference))) return schedule

  return {
    isFixed: schedule.isFixed,
    ...(schedule.fixed === undefined ? {} : { fixed: adjust(schedule.fixed, difference) }),
    ...(schedule.daily === undefined ? {} : { daily: adjust(schedule.daily, difference) }),
    ...(schedule.weekly === undefined ? {} : { weekly: adjust(schedule.weekly, difference) }),
    ...(schedule.monthly === undefined ? {} : { monthly: adjust(schedule.monthly, difference) }),
  }
}
