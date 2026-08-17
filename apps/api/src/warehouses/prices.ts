/**
 * Listas de precios y resolución de precio.
 *
 * Ver `openspec/specs/warehouse-catalog/spec.md`, requisitos de precios. Rebanada 12.
 *
 * ## La precedencia vive en un solo sitio
 *
 * | # | Origen | Aplica a |
 * |---|---|---|
 * | 1 | Tarifa del producto en la lista aplicable | Venta y renta |
 * | 2 | Precio escalar del producto | Sólo venta |
 * | 3 | Cero | Último recurso |
 *
 * Está escrita una vez, en `resolvePrice`, y todo lo que necesite un precio pasa por ahí. Repartida
 * por las cotizaciones, la tienda pública y el punto de venta, se convierte en tres reglas que
 * coinciden hasta que alguien toca una — y entonces el mismo producto vale distinto según por dónde
 * se mire, que es la clase de discrepancia que nadie atribuye a su causa.
 *
 * **El cero no es un precio, es la ausencia de uno.** Se devuelve marcado como tal para que la
 * interfaz pueda advertirlo: un producto a cero en una cotización casi siempre es un producto sin
 * tarifa, no un regalo.
 */

import {
  buildPage,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import {
  type RateSchedule,
  warehousePriceLists,
  warehouseProductPrices,
  warehouseProducts,
} from "@tfv/db/schema"
import { and, count, eq, inArray, isNull } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { loadWarehouse } from "./warehouses.ts"

export type { RateSchedule }

/** Con qué frecuencia se cotiza una renta. */
export type Frequency = "daily" | "weekly" | "monthly"
export const FREQUENCIES = ["daily", "weekly", "monthly"] as const

export interface PriceListRecord {
  readonly id: string
  readonly warehouseId: string
  readonly name: string
  readonly description: string
  /** Cuántos productos tienen tarifa en ella. Es lo que hace visible el alcance de eliminarla. */
  readonly productCount: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface ProductPriceRecord {
  readonly id: string
  readonly priceListId: string
  readonly productId: string
  readonly sale: string
  readonly rent: RateSchedule
  readonly penalty: RateSchedule
  readonly createdAt: Date
  readonly updatedAt: Date
}

// ─── Listas ──────────────────────────────────────────────────────────────────

export const priceListQuery: QuerySchema = {
  filters: {},
  searchable: ["name", "description"],
  sortable: ["name", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
}

const mapping = {
  fields: { name: warehousePriceLists.name, createdAt: warehousePriceLists.createdAt },
  searchable: [warehousePriceLists.name, warehousePriceLists.description],
  tiebreak: warehousePriceLists.id,
}

export async function listPriceLists(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  query: ParsedQuery,
): Promise<Page<PriceListRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const where = and(
      eq(warehousePriceLists.warehouseId, warehouseId),
      isNull(warehousePriceLists.deletedAt),
      ...collectionConditions(query, mapping),
    )

    const [total] = await tx.select({ value: count() }).from(warehousePriceLists).where(where)

    const rows = await tx
      .select()
      .from(warehousePriceLists)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    return buildPage(await withProductCounts(tx, rows), total?.value ?? 0, page, limit)
  })
}

export interface PriceListInput {
  readonly name: string
  readonly description?: string | undefined
}

export async function createPriceList(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  input: PriceListInput,
): Promise<PriceListRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const [created] = await tx
      .insert(warehousePriceLists)
      .values({
        id: newId(),
        warehouseId,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
      })
      .returning()

    if (!created) throw new Error("la inserción de la lista no devolvió fila")
    return (await withProductCounts(tx, [created]))[0] as PriceListRecord
  })
}

export interface UpdatePriceListInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
}

export async function updatePriceList(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  priceListId: string,
  input: UpdatePriceListInput,
): Promise<PriceListRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const current = await loadPriceList(tx, warehouseId, priceListId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description.trim()

    if (Object.keys(patch).length === 0) {
      return (await withProductCounts(tx, [current]))[0] as PriceListRecord
    }

    const [updated] = await tx
      .update(warehousePriceLists)
      .set(patch)
      .where(eq(warehousePriceLists.id, priceListId))
      .returning()

    if (!updated) throw new NotFoundError("La lista de precios no existe")
    return (await withProductCounts(tx, [updated]))[0] as PriceListRecord
  })
}

/**
 * Da de baja una lista de precios.
 *
 * **Los productos sobreviven.** Lo que desaparece son sus tarifas en esa lista, y con ellas el
 * precio que la lista les daba: quien resuelva un precio después caerá al escalar del producto o a
 * cero. Es el orden de precedencia funcionando, no una pérdida de datos.
 */
export async function deletePriceList(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  priceListId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadPriceList(tx, warehouseId, priceListId)

    await tx
      .update(warehousePriceLists)
      .set({ deletedAt: new Date() })
      .where(eq(warehousePriceLists.id, priceListId))
  })
}

// ─── Tarifas ─────────────────────────────────────────────────────────────────

export async function listPrices(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  priceListId: string,
): Promise<ProductPriceRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadPriceList(tx, warehouseId, priceListId)

    const rows = await tx
      .select()
      .from(warehouseProductPrices)
      .where(eq(warehouseProductPrices.priceListId, priceListId))

    return rows.map(toPriceRecord)
  })
}

export interface SetPriceInput {
  readonly sale?: string | undefined
  readonly rent?: RateSchedule | undefined
  readonly penalty?: RateSchedule | undefined
}

/**
 * Fija la tarifa de un producto en una lista.
 *
 * Escribe con resolución de conflicto y no comprueba antes: la unicidad de `(lista, producto)` la
 * garantiza un índice, y comprobar y luego escribir deja una ventana en la que dos guardados
 * simultáneos crean dos tarifas para el mismo producto.
 */
export async function setPrice(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  priceListId: string,
  productId: string,
  input: SetPriceInput,
): Promise<ProductPriceRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadPriceList(tx, warehouseId, priceListId)
    await assertProduct(tx, warehouseId, productId)

    const values = {
      ...(input.sale === undefined ? {} : { sale: input.sale }),
      ...(input.rent === undefined ? {} : { rent: input.rent }),
      ...(input.penalty === undefined ? {} : { penalty: input.penalty }),
    }

    const [row] = await tx
      .insert(warehouseProductPrices)
      .values({ id: newId(), priceListId, productId, ...values })
      .onConflictDoUpdate({
        target: [warehouseProductPrices.priceListId, warehouseProductPrices.productId],
        set: { ...values, updatedAt: new Date() },
      })
      .returning()

    if (!row) throw new Error("la escritura de la tarifa no devolvió fila")
    return toPriceRecord(row)
  })
}

/**
 * Establece **el conjunto** de productos de una lista.
 *
 * Añade los que faltan y **retira los que sobran**. La segunda mitad es la corrección de `L-04`: la
 * implementación anterior calculaba altas y bajas con el mismo criterio —los que están en el
 * conjunto pedido—, de modo que la lista de bajas salía siempre vacía y **retirar un producto de
 * una lista no surtía efecto nunca**. Se descubría al facturar.
 *
 * Aquí las dos direcciones se calculan con criterios opuestos y en una sola transacción: se borran
 * las tarifas que no están en el conjunto, y se insertan las que faltan sin tocar las que ya
 * estaban —quien ya tenía tarifa la conserva, que es lo que distingue «establecer el conjunto» de
 * «rehacer la lista».
 */
export async function setProducts(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  priceListId: string,
  productIds: readonly string[],
): Promise<{ added: number; removed: number; kept: number }> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadPriceList(tx, warehouseId, priceListId)

    if (productIds.length > 0) {
      const valid = await tx
        .select({ id: warehouseProducts.id })
        .from(warehouseProducts)
        .where(
          and(
            eq(warehouseProducts.warehouseId, warehouseId),
            inArray(warehouseProducts.id, [...productIds]),
            isNull(warehouseProducts.deletedAt),
          ),
        )

      if (valid.length !== productIds.length) {
        throw new NotFoundError("Alguno de los productos no existe en este almacén")
      }
    }

    const existing = await tx
      .select({ productId: warehouseProductPrices.productId })
      .from(warehouseProductPrices)
      .where(eq(warehouseProductPrices.priceListId, priceListId))

    const wanted = new Set(productIds)
    const current = new Set(existing.map((row) => row.productId))

    // Las bajas: lo que está y no se pidió. Es el criterio **contrario** al de las altas, y ésa es
    // exactamente la línea que la implementación anterior tenía escrita igual que la de arriba.
    const removed = [...current].filter((id) => !wanted.has(id))
    const added = [...wanted].filter((id) => !current.has(id))

    if (removed.length > 0) {
      await tx
        .delete(warehouseProductPrices)
        .where(
          and(
            eq(warehouseProductPrices.priceListId, priceListId),
            inArray(warehouseProductPrices.productId, removed),
          ),
        )
    }

    if (added.length > 0) {
      await tx
        .insert(warehouseProductPrices)
        .values(added.map((productId) => ({ id: newId(), priceListId, productId })))
    }

    return { added: added.length, removed: removed.length, kept: current.size - removed.length }
  })
}

export async function removePrice(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  priceListId: string,
  productId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadPriceList(tx, warehouseId, priceListId)

    await tx
      .delete(warehouseProductPrices)
      .where(
        and(
          eq(warehouseProductPrices.priceListId, priceListId),
          eq(warehouseProductPrices.productId, productId),
        ),
      )
  })
}

// ─── Resolución ──────────────────────────────────────────────────────────────

export type PriceOrigin = "price_list" | "product" | "none"

export interface ResolvedPrice {
  readonly amount: string
  readonly origin: PriceOrigin
  /** El cero no es un precio: es la ausencia de uno, y la interfaz tiene que poder advertirlo. */
  readonly missing: boolean
}

export interface ResolveOptions {
  /** La lista aplicable. Ausente: sólo se considera el precio escalar del producto. */
  readonly priceListId?: string | undefined
  /** Ajuste propio de la medida, sumado al precio resuelto. */
  readonly priceDifference?: string | undefined
  /** Para la renta: con qué frecuencia se cotiza. Una tarifa fija la ignora. */
  readonly frequency?: Frequency | undefined
}

/**
 * Resuelve el precio de venta de un producto.
 *
 * **Aquí y en ningún otro sitio.** Es la precedencia declarada de la spec, escrita una vez.
 */
export async function resolveSalePrice(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  productId: string,
  options: ResolveOptions = {},
): Promise<ResolvedPrice> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const product = await assertProduct(tx, warehouseId, productId)

    const rate = options.priceListId
      ? await findPrice(tx, options.priceListId, productId)
      : undefined

    if (rate && !isZero(rate.sale)) {
      return adjust(rate.sale, "price_list", options.priceDifference)
    }

    // El escalar del producto **sólo aplica a la venta**. Una renta sin tarifa es cero, no el
    // precio de comprarlo: cobrar el precio de venta por un día de renta es un error de tres
    // órdenes de magnitud, y de los que se descubren después de emitir la factura.
    if (!isZero(product.price)) return adjust(product.price, "product", options.priceDifference)

    return { amount: "0.00", origin: "none", missing: true }
  })
}

/** Resuelve el precio de renta. Sin tarifa en la lista aplicable, no hay precio. */
export async function resolveRentPrice(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  productId: string,
  options: ResolveOptions = {},
): Promise<ResolvedPrice> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await assertProduct(tx, warehouseId, productId)

    const rate = options.priceListId
      ? await findPrice(tx, options.priceListId, productId)
      : undefined

    const amount = rate ? amountOf(rate.rent, options.frequency) : undefined
    if (amount && !isZero(amount)) return adjust(amount, "price_list", options.priceDifference)

    return { amount: "0.00", origin: "none", missing: true }
  })
}

/**
 * El importe de una tarifa según su periodicidad.
 *
 * **Una tarifa fija ignora la frecuencia.** Es lo que declara `isFixed`, y por eso se mira primero:
 * mirar la frecuencia antes haría que una tarifa fija con un importe diario suelto cobrara el
 * diario, que es justo lo que marcarla como fija pretende evitar.
 */
export function amountOf(schedule: RateSchedule, frequency?: Frequency | undefined): string {
  if (schedule.isFixed) return schedule.fixed ?? "0.00"

  switch (frequency) {
    case "weekly":
      return schedule.weekly ?? "0.00"
    case "monthly":
      return schedule.monthly ?? "0.00"
    default:
      return schedule.daily ?? "0.00"
  }
}

/**
 * Suma el ajuste de la medida al precio resuelto.
 *
 * En centavos y con enteros: `0.1 + 0.2` no es `0.3` en coma flotante, y un catálogo de mil
 * productos convierte ese error en una factura que no cuadra por unos pesos que nadie encuentra.
 */
function adjust(
  amount: string,
  origin: PriceOrigin,
  priceDifference?: string | undefined,
): ResolvedPrice {
  if (!priceDifference || isZero(priceDifference)) {
    return { amount: normalize(amount), origin, missing: false }
  }

  const total = toCents(amount) + toCents(priceDifference)
  return { amount: fromCents(total), origin, missing: false }
}

function toCents(amount: string): number {
  const [whole = "0", fraction = ""] = amount.replace("-", "").split(".")
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2))
  return amount.startsWith("-") ? -cents : cents
}

function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  const absolute = Math.abs(cents)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`
}

function normalize(amount: string): string {
  return fromCents(toCents(amount))
}

function isZero(amount: string): boolean {
  return toCents(amount) === 0
}

async function findPrice(tx: Transaction, priceListId: string, productId: string) {
  const [row] = await tx
    .select()
    .from(warehouseProductPrices)
    .where(
      and(
        eq(warehouseProductPrices.priceListId, priceListId),
        eq(warehouseProductPrices.productId, productId),
      ),
    )
    .limit(1)

  return row
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

async function withProductCounts(
  tx: Transaction,
  rows: readonly (typeof warehousePriceLists.$inferSelect)[],
): Promise<PriceListRecord[]> {
  if (rows.length === 0) return []

  const counts = await tx
    .select({ priceListId: warehouseProductPrices.priceListId, value: count() })
    .from(warehouseProductPrices)
    .where(
      inArray(
        warehouseProductPrices.priceListId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(warehouseProductPrices.priceListId)

  const byList = new Map(counts.map((row) => [row.priceListId, row.value]))

  return rows.map((row) => ({
    id: row.id,
    warehouseId: row.warehouseId,
    name: row.name,
    description: row.description,
    productCount: byList.get(row.id) ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

async function loadPriceList(tx: Transaction, warehouseId: string, priceListId: string) {
  const [row] = await tx
    .select()
    .from(warehousePriceLists)
    .where(
      and(
        eq(warehousePriceLists.id, priceListId),
        eq(warehousePriceLists.warehouseId, warehouseId),
        isNull(warehousePriceLists.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La lista de precios no existe")
  return row
}

async function assertProduct(tx: Transaction, warehouseId: string, productId: string) {
  const [row] = await tx
    .select()
    .from(warehouseProducts)
    .where(
      and(
        eq(warehouseProducts.id, productId),
        eq(warehouseProducts.warehouseId, warehouseId),
        isNull(warehouseProducts.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El producto no existe")
  return row
}

function toPriceRecord(row: typeof warehouseProductPrices.$inferSelect): ProductPriceRecord {
  return {
    id: row.id,
    priceListId: row.priceListId,
    productId: row.productId,
    sale: row.sale,
    rent: row.rent,
    penalty: row.penalty,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
