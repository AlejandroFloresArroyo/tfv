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
 * Tampoco decide **cuál es el precio**: la precedencia de `warehouse-catalog` —tarifa de la lista,
 * o precio del producto, o cero— y el ajuste propio de la medida están en `resolveRate`, también
 * compartida, por el mismo motivo: el constructor de cotizaciones resuelve la tarifa de una línea
 * mientras se edita, y dos reglas darían dos precios. Lo que queda aquí es **leer** de la base lo
 * que esa regla necesita.
 */

import {
  computeQuotation,
  type QuotationBreakdown,
  type QuotationLineInput,
  resolveRate,
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
    // La precedencia y el ajuste de la medida son una sola regla, y vive en `@tfv/contracts`
    // porque el navegador la necesita igual que nosotros. Ver `resolveRate`.
    const rate = resolveRate({
      productPrice: row.productPrice,
      priceDifference: row.priceDifference,
      ...(row.rate ? { listed: row.rate } : {}),
    })

    return {
      id: row.line.id,
      productId: row.productId,
      measurementId: row.line.measurementId,
      quantity: (reserved.get(row.line.id) ?? []).length,
      frequency: row.line.frequency,
      ...rate,
      // El precio negociado manda sobre la tarifa resuelta, pero no la borra.
      ...(row.line.price === null ? {} : { linePrice: row.line.price }),
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
