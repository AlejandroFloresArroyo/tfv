/**
 * Qué se puede cotizar, a qué tarifa y cuánto queda.
 *
 * Ver `openspec/changes/rebuild-ui-domain-screens` (29b) y `openspec/specs/quotation-pricing`.
 *
 * Es la fuente del constructor de cotizaciones: el editor de líneas necesita, para cada medida del
 * almacén, **la tarifa que se le aplicaría y la existencia que queda libre**, y las necesita juntas.
 * Separarlas obligaría a la interfaz a cruzar dos listados y a resolver la precedencia por su
 * cuenta, que es justo lo que `resolveRate` existe para impedir.
 *
 * ## Por qué la existencia es la disponible y no la total
 *
 * Lo que ya está apartado por otra cotización no se puede volver a comprometer. Enseñar el
 * inventario entero invitaría a cotizar equipo que no está, y el fallo aparecería al guardar —con
 * un `422` y sin haber reservado nada, que es correcto, pero llega tarde y después de haber
 * negociado con el cliente—.
 *
 * Se cuentan las unidades en estado `available`, que es exactamente la definición que usa la
 * reserva al buscar candidatas. Ver `reservations.ts`.
 */

import {
  buildPage,
  type Page,
  type ParsedQuery,
  type QuerySchema,
  type RateSchedule,
  resolveRate,
} from "@tfv/contracts"
import { withRequester } from "@tfv/db"
import {
  warehouseMeasurements,
  warehouseProductPrices,
  warehouseProducts,
  warehouseStockUnits,
} from "@tfv/db/schema"
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { loadWarehouse } from "./warehouses.ts"

export interface RateCandidate {
  readonly measurementId: string
  readonly measurementName: string
  readonly productId: string
  readonly productName: string
  readonly productCode: string
  /** La entrada de la lista de precios de la que salió la tarifa, o nada si no hubo ninguna. */
  readonly productPriceId: string | null
  readonly basePrice: string
  readonly rent?: RateSchedule | undefined
  readonly penalty?: RateSchedule | undefined
  readonly available: number
}

export const rateQuery: QuerySchema = {
  filters: {
    productId: { type: "id", label: "Producto" },
    measurementId: { type: "id", set: true, label: "Medida" },
    categoryId: { type: "id", label: "Categoría" },
    availableForRent: { type: "boolean", label: "Se renta" },
    availableForSale: { type: "boolean", label: "Se vende" },
  },
  searchable: ["name", "code", "measurement"],
  sortable: ["name", "code", "measurement"],
  defaultSort: [
    { field: "name", direction: "asc" },
    { field: "measurement", direction: "asc" },
  ],
}

const mapping = {
  fields: {
    productId: warehouseProducts.id,
    measurementId: warehouseMeasurements.id,
    categoryId: warehouseProducts.categoryId,
    availableForRent: warehouseProducts.availableForRent,
    availableForSale: warehouseProducts.availableForSale,
    name: warehouseProducts.name,
    code: warehouseProducts.code,
    measurement: warehouseMeasurements.name,
  },
  searchable: [warehouseProducts.name, warehouseProducts.code, warehouseMeasurements.name],
  tiebreak: warehouseMeasurements.id,
}

/**
 * Las medidas del almacén con su tarifa y su existencia libre.
 *
 * `priceListId` elige contra qué lista se resuelve. Sin lista —o con una que no tenga entrada para
 * el producto— queda el precio escalar del producto, que es la precedencia declarada. La unión con
 * la tarifa lleva la lista **en la condición de la unión**, no en el `where`: filtrar ahí dejaría
 * fuera a los productos que esa lista no menciona, que son los que más necesitan aparecer.
 */
export async function listRates(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  query: ParsedQuery,
  priceListId?: string,
): Promise<Page<RateCandidate>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const where = and(
      eq(warehouseProducts.warehouseId, warehouseId),
      isNull(warehouseProducts.deletedAt),
      ...collectionConditions(query, mapping),
    )

    const [total] = await tx
      .select({ value: count() })
      .from(warehouseMeasurements)
      .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
      .where(where)

    const rows = await tx
      .select({
        measurementId: warehouseMeasurements.id,
        measurementName: warehouseMeasurements.name,
        priceDifference: warehouseMeasurements.priceDifference,
        productId: warehouseProducts.id,
        productName: warehouseProducts.name,
        productCode: warehouseProducts.code,
        productPrice: warehouseProducts.price,
        rate: warehouseProductPrices,
      })
      .from(warehouseMeasurements)
      .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
      .leftJoin(
        warehouseProductPrices,
        priceListId
          ? and(
              eq(warehouseProductPrices.productId, warehouseProducts.id),
              eq(warehouseProductPrices.priceListId, priceListId),
            )
          : sql`false`,
      )
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    const free = await availability(
      tx,
      rows.map((row) => row.measurementId),
    )

    const items = rows.map((row) => ({
      measurementId: row.measurementId,
      measurementName: row.measurementName,
      productId: row.productId,
      productName: row.productName,
      productCode: row.productCode,
      productPriceId: row.rate?.id ?? null,
      ...resolveRate({
        productPrice: row.productPrice,
        priceDifference: row.priceDifference,
        ...(row.rate ? { listed: row.rate } : {}),
      }),
      available: free.get(row.measurementId) ?? 0,
    }))

    return buildPage(items, total?.value ?? 0, page, limit)
  })
}

/** Cuántas unidades libres tiene cada medida. Las que no aparecen no tienen ninguna. */
async function availability(
  tx: Parameters<Parameters<typeof withRequester>[1]>[0],
  measurementIds: readonly string[],
): Promise<Map<string, number>> {
  if (measurementIds.length === 0) return new Map()

  const rows = await tx
    .select({ measurementId: warehouseStockUnits.measurementId, value: count() })
    .from(warehouseStockUnits)
    .where(
      and(
        inArray(warehouseStockUnits.measurementId, [...measurementIds]),
        eq(warehouseStockUnits.status, "available"),
        isNull(warehouseStockUnits.deletedAt),
      ),
    )
    .groupBy(warehouseStockUnits.measurementId)

  return new Map(rows.map((row) => [row.measurementId, row.value]))
}
