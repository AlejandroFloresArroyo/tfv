/**
 * Reserva de existencias.
 *
 * Ver `openspec/specs/stock-reservation/spec.md` y su `design.md`. Rebanada 13.
 *
 * La máquina que une las cotizaciones con el inventario físico, y el punto de mayor riesgo de
 * corrección de todo el servicio: aquí se decide qué cámara concreta queda apartada para qué
 * cliente, y un error se traduce en equipo prometido dos veces o en equipo bloqueado que nadie
 * puede rentar.
 *
 * ## Dos mecanismos, y conviene no confundirlos
 *
 * 1. **Reconciliación por cantidad.** Una línea pide *n* unidades de una medida y el sistema
 *    mantiene exactamente *n* apartadas: al subir aparta más, al bajar libera.
 * 2. **Proyección de estado.** El estado de la cotización determina el de todas sus unidades.
 *
 * ## Por qué el vínculo es una tabla
 *
 * Poner `quote_line_id` en la unidad parecería más simple, pero pierde dos cosas: el índice único
 * parcial `(stock_unit_id) where released_at is null`, que es **la garantía estructural** de que
 * una unidad no se compromete dos veces sin depender de que la aplicación lo compruebe, y el
 * histórico de reservas liberadas.
 */

import { newId, UnprocessableError } from "@tfv/contracts"
import type { Transaction } from "@tfv/db"
import {
  warehouseMeasurements,
  warehouseProducts,
  warehouseQuotes,
  warehouseStockReservations,
  warehouseStockUnits,
} from "@tfv/db/schema"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import type { QuoteStatus, TradeType } from "./quotes.ts"
import { recordEvents, type StockStatus } from "./stock.ts"

/**
 * Qué estado tienen las unidades de una cotización según el estado de ésta.
 *
 * **En un solo lugar.** La spec la escribe como tabla y aquí es una tabla: repartida por endpoints
 * es donde aparecen las contradicciones.
 *
 * El caso que más se presta a error: **una cotización de renta completada deja las unidades
 * rentadas, no disponibles.** Completar significa que el equipo salió, no que volvió. El retorno es
 * un acto posterior y explícito, y hasta que ocurra ese equipo no está en la nave.
 */
export function projectedStatus(status: QuoteStatus, type: TradeType): StockStatus {
  switch (status) {
    case "pre_quote":
    case "pending":
    case "in_progress":
      return "in_quote"
    case "in_rent":
      return "rented"
    case "completed":
      return type === "rent" ? "rented" : "sold"
    case "sold":
      return "sold"
    case "canceled":
      return "available"
  }
}

/**
 * Estados en los que la unidad **deja de estar apartada**.
 *
 * Una venta cerrada no necesita el vínculo: la unidad salió del inventario y no vuelve. Una renta
 * sí lo conserva, porque es lo único que dice qué equipo hay que reclamar cuando toque el retorno.
 */
function releasesLink(projected: StockStatus): boolean {
  return projected === "available" || projected === "sold"
}

export interface ReservationContext {
  readonly quoteId: string
  readonly measurementId: string
  readonly actorId: string
  /** `DEFECTS.md` M-04: acuñar inventario que no existe exige decirlo en la operación. */
  readonly allowMinting: boolean
}

// ─── Reconciliación ──────────────────────────────────────────────────────────

/**
 * Deja la línea con exactamente `quantity` unidades apartadas.
 *
 * Reserva o libera **la diferencia**, nunca el total: las unidades que ya estaban apartadas siguen
 * siéndolo. Volver a reservar desde cero devolvería equipo al inventario por un instante y otra
 * cotización simultánea podría llevárselo.
 *
 * La excepción es **cambiar de medida**: entonces lo apartado no sirve, por mucho que la cantidad
 * coincida, y hay que soltarlo entero antes de apartar lo nuevo. Sin esto, una línea puede acabar
 * diciendo una medida y sujetando unidades de otra, que es la clase de descuadre que sólo aparece
 * el día que alguien va a la nave a buscar el equipo.
 */
export async function reconcileLine(
  tx: Transaction,
  lineId: string,
  quantity: number,
  context: ReservationContext,
): Promise<void> {
  const held = await liveReservations(tx, lineId)
  const foreign = held.filter((row) => row.measurementId !== context.measurementId)

  if (foreign.length > 0) await release(tx, foreign, context)

  const mine = held.length - foreign.length
  if (quantity > mine) await reserve(tx, lineId, quantity - mine, context)
  else if (quantity < mine) {
    await release(
      tx,
      held.filter((row) => row.measurementId === context.measurementId).slice(0, mine - quantity),
      context,
    )
  }
}

/**
 * Aparta `amount` unidades disponibles de la medida.
 *
 * `for update skip locked` es la pieza del escenario de concurrencia: sin él, dos reservas
 * simultáneas sobre la misma medida se serializan y la segunda puede fallar por espera en lugar de
 * tomar limpiamente otras unidades. Con él, la segunda **salta** las filas bloqueadas y coge las
 * siguientes; si no quedan, falla por existencia insuficiente, que es la respuesta correcta.
 */
async function reserve(
  tx: Transaction,
  lineId: string,
  amount: number,
  context: ReservationContext,
): Promise<void> {
  const candidates = await tx.execute<{ id: string }>(sql`
    select id from ${warehouseStockUnits}
     where measurement_id = ${context.measurementId}
       and status = 'available'
       and deleted_at is null
     order by created_at, id
     limit ${amount}
     for update skip locked
  `)

  const chosen = [...candidates].map((row) => row.id)
  const missing = amount - chosen.length

  if (missing > 0) {
    if (!context.allowMinting) {
      throw new UnprocessableError(
        `No hay existencia suficiente: se pidieron ${amount} unidades y hay ${chosen.length} disponibles. ` +
          "Autoriza expresamente la creación de inventario si el equipo existe y falta darlo de alta.",
      )
    }
    chosen.push(...(await mint(tx, missing, context)))
  }

  await tx.insert(warehouseStockReservations).values(
    chosen.map((stockUnitId) => ({
      id: newId(),
      stockUnitId,
      quoteLineId: lineId,
      quoteId: context.quoteId,
    })),
  )

  await tx
    .update(warehouseStockUnits)
    .set({ status: "in_quote", updatedAt: new Date() })
    .where(inArray(warehouseStockUnits.id, chosen))

  await recordEvents(
    tx,
    chosen.map((unitId) => ({ unitId, from: "available" as StockStatus, to: "in_quote" as const })),
    "quote_reservation",
    context.actorId,
    undefined,
    context.quoteId,
  )
}

/**
 * Da de alta las unidades que faltan, marcadas como acuñadas por reserva.
 *
 * La implementación anterior hacía esto **en silencio y siempre** (`DEFECTS.md` M-04), de modo que
 * una cotización podía comprometer equipo que no existía en la nave sin que nadie se enterara. Aquí
 * exige autorización explícita en la operación y deja rastro: quién la motivó y con qué cotización,
 * para que el descuadre entre inventario registrado y físico sea auditable.
 */
async function mint(
  tx: Transaction,
  amount: number,
  context: ReservationContext,
): Promise<string[]> {
  const rows = await tx
    .insert(warehouseStockUnits)
    .values(
      Array.from({ length: amount }, () => ({
        id: newId(),
        measurementId: context.measurementId,
        code: unitCode(),
        createdByReservation: true,
        createdByQuoteId: context.quoteId,
      })),
    )
    .returning({ id: warehouseStockUnits.id })

  await recordEvents(
    tx,
    rows.map((row) => ({ unitId: row.id, from: null, to: "available" as StockStatus })),
    "created",
    context.actorId,
    "Acuñada para satisfacer una reserva, con autorización explícita",
    context.quoteId,
  )

  return rows.map((row) => row.id)
}

/**
 * Libera las reservas indicadas y devuelve sus unidades a disponible.
 *
 * Se liberan **las más recientes primero** —es el orden en que llegan— para que las que llevan más
 * tiempo apartadas sigan estándolo: bajar una cantidad no debería soltar la unidad que alguien
 * lleva una semana reservando.
 */
async function release(
  tx: Transaction,
  reservations: readonly { id: string; stockUnitId: string }[],
  context: { readonly actorId: string; readonly quoteId: string },
): Promise<void> {
  if (reservations.length === 0) return

  const unitIds = reservations.map((row) => row.stockUnitId)

  await tx
    .update(warehouseStockReservations)
    .set({ releasedAt: new Date() })
    .where(
      inArray(
        warehouseStockReservations.id,
        reservations.map((row) => row.id),
      ),
    )

  const units = await tx
    .update(warehouseStockUnits)
    .set({ status: "available", updatedAt: new Date() })
    .where(
      and(inArray(warehouseStockUnits.id, unitIds), eq(warehouseStockUnits.status, "in_quote")),
    )
    .returning({ id: warehouseStockUnits.id })

  await recordEvents(
    tx,
    units.map((row) => ({
      unitId: row.id,
      from: "in_quote" as StockStatus,
      to: "available" as const,
    })),
    "quote_release",
    context.actorId,
    undefined,
    context.quoteId,
  )
}

/** Libera todo lo que tenga apartado una línea. La usa el borrado de líneas. */
export async function releaseLine(
  tx: Transaction,
  lineId: string,
  context: { readonly actorId: string; readonly quoteId: string },
): Promise<void> {
  await release(tx, await liveReservations(tx, lineId), context)
}

// ─── Consulta ────────────────────────────────────────────────────────────────

/** Las reservas vivas de una línea, de la más reciente a la más antigua. */
async function liveReservations(
  tx: Transaction,
  lineId: string,
): Promise<{ id: string; stockUnitId: string; measurementId: string }[]> {
  return tx
    .select({
      id: warehouseStockReservations.id,
      stockUnitId: warehouseStockReservations.stockUnitId,
      measurementId: warehouseStockUnits.measurementId,
    })
    .from(warehouseStockReservations)
    .innerJoin(
      warehouseStockUnits,
      eq(warehouseStockUnits.id, warehouseStockReservations.stockUnitId),
    )
    .where(
      and(
        eq(warehouseStockReservations.quoteLineId, lineId),
        isNull(warehouseStockReservations.releasedAt),
      ),
    )
    .orderBy(desc(warehouseStockReservations.createdAt), desc(warehouseStockReservations.id))
}

/** Qué unidades tiene apartadas cada línea de una cotización. */
export async function reservedByLine(
  tx: Transaction,
  quoteId: string,
): Promise<Map<string, string[]>> {
  const rows = await tx
    .select({
      lineId: warehouseStockReservations.quoteLineId,
      stockUnitId: warehouseStockReservations.stockUnitId,
    })
    .from(warehouseStockReservations)
    .where(
      and(
        eq(warehouseStockReservations.quoteId, quoteId),
        isNull(warehouseStockReservations.releasedAt),
      ),
    )
    .orderBy(warehouseStockReservations.createdAt, warehouseStockReservations.id)

  const byLine = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.lineId) continue
    const list = byLine.get(row.lineId)
    if (list) list.push(row.stockUnitId)
    else byLine.set(row.lineId, [row.stockUnitId])
  }
  return byLine
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

function unitCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("")
}

// ─── Proyección ──────────────────────────────────────────────────────────────

/**
 * Lleva todas las unidades apartadas de una cotización al estado que le corresponde.
 *
 * **Atómica**: todas cambian o ninguna, porque corre dentro de la transacción que cambia el estado
 * de la cotización. Un cambio de estado que se confirmara sin mover el inventario dejaría el
 * documento diciendo una cosa y la nave otra, y no habría forma de saber cuál miente.
 */
export async function projectQuote(
  tx: Transaction,
  quoteId: string,
  status: QuoteStatus,
  type: TradeType,
  actorId: string,
): Promise<void> {
  const held = await liveByQuote(tx, quoteId)
  if (held.length === 0) return

  const projected = projectedStatus(status, type)
  const moving = held.filter((row) => row.status !== projected)

  if (moving.length > 0) {
    await tx
      .update(warehouseStockUnits)
      .set({ status: projected, updatedAt: new Date() })
      .where(
        inArray(
          warehouseStockUnits.id,
          moving.map((row) => row.stockUnitId),
        ),
      )

    await recordEvents(
      tx,
      moving.map((row) => ({ unitId: row.stockUnitId, from: row.status, to: projected })),
      "quote_status",
      actorId,
      undefined,
      quoteId,
    )
  }

  if (releasesLink(projected)) {
    await tx
      .update(warehouseStockReservations)
      .set({ releasedAt: new Date() })
      .where(
        inArray(
          warehouseStockReservations.id,
          held.map((row) => row.id),
        ),
      )
  }
}

// ─── Retorno ─────────────────────────────────────────────────────────────────

export interface UnitReturn {
  readonly unitId: string
  /** Disponible si vuelve en condiciones; el estado de incidencia que corresponda si no. */
  readonly status: StockStatus
  readonly note?: string | undefined
}

/**
 * Registra el retorno del equipo rentado, unidad por unidad.
 *
 * El retorno **no existía** en la implementación anterior: una renta completada devolvía el equipo
 * al inventario sola, con lo que el sistema daba por disponible equipo que seguía en un camión.
 * Aquí es un acto explícito, y por eso puede distinguir lo que vuelve en condiciones de lo que
 * vuelve dañado.
 */
export async function registerReturn(
  tx: Transaction,
  quoteId: string,
  returns: readonly UnitReturn[],
  actorId: string,
): Promise<void> {
  if (returns.length === 0) return

  const held = new Map(
    await liveByQuote(tx, quoteId).then((rows) =>
      rows.map((row) => [row.stockUnitId, row] as const),
    ),
  )

  const foreign = returns.filter((row) => !held.has(row.unitId))
  if (foreign.length > 0) {
    throw new UnprocessableError(
      `${foreign.length === 1 ? "Una unidad no salió" : `${foreign.length} unidades no salieron`} con esta cotización. Sólo se devuelve lo que se llevó.`,
    )
  }

  // Y sólo vuelve lo que **está fuera**. Una unidad apartada sigue en la nave: «devolverla» por
  // aquí la soltaría sin pasar por la reconciliación, que es quien sabe qué líneas quedan y con
  // cuántas unidades cada una.
  const inside = returns.filter((row) => held.get(row.unitId)?.status !== "rented")
  if (inside.length > 0) {
    throw new UnprocessableError(
      `${inside.length === 1 ? "Una unidad no ha salido" : `${inside.length} unidades no han salido`} de la nave. El retorno es para el equipo que está fuera.`,
    )
  }

  for (const item of returns) {
    const current = held.get(item.unitId)
    if (!current) continue

    await tx
      .update(warehouseStockUnits)
      .set({ status: item.status, updatedAt: new Date() })
      .where(eq(warehouseStockUnits.id, item.unitId))

    await recordEvents(
      tx,
      [{ unitId: item.unitId, from: current.status, to: item.status }],
      "rental_return",
      actorId,
      item.note,
      quoteId,
    )
  }

  await tx
    .update(warehouseStockReservations)
    .set({ releasedAt: new Date() })
    .where(
      inArray(
        warehouseStockReservations.id,
        returns.map((row) => held.get(row.unitId)?.id ?? ""),
      ),
    )
}

/** Cuántas unidades de la cotización siguen fuera de la nave. */
export async function pendingReturn(tx: Transaction, quoteId: string): Promise<number> {
  const held = await liveByQuote(tx, quoteId)
  return held.filter((row) => row.status === "rented").length
}

// ─── Coherencia ──────────────────────────────────────────────────────────────

export interface Discrepancy {
  readonly unitId: string
  readonly code: string
  readonly status: StockStatus
  readonly reason: "committed_without_link" | "link_without_projection"
  readonly quoteId: string | null
}

/**
 * Estados en los que una unidad está **comprometida**: no se puede prometer a nadie más.
 *
 * El escaneo de huérfanas los recorre todos. Antes sólo miraba `in_quote`, y ésa era la mitad del
 * problema: soltar una reserva devuelve a `available` únicamente lo que estaba `in_quote`, así que
 * una unidad **rentada** que perdía su vínculo se quedaba comprometida para siempre —y era
 * precisamente el caso que la verificación no podía ver.
 */
const COMMITTED: readonly StockStatus[] = ["in_quote", "in_order", "rented"]

/**
 * Comprueba que el inventario y las reservas dicen lo mismo.
 *
 * Dos formas de romperse, y las dos se comunican identificando la unidad:
 *
 * - Una unidad **comprometida sin vínculo vivo**: figura apartada, rentada o en pedido, y nadie la
 *   reclama, así que está bloqueada para siempre sin que nadie sepa por qué.
 * - Un vínculo vivo cuya unidad **no está en el estado que su cotización proyecta**: alguien movió
 *   el inventario por detrás y el documento dejó de ser cierto.
 *
 * Se comprueba a petición y no en cada escritura: es una consulta sobre todo el almacén, y las
 * escrituras ya son transaccionales. Su sitio es una ejecución programada.
 */
export async function checkCoherence(tx: Transaction, warehouseId: string): Promise<Discrepancy[]> {
  const committed = await tx
    .select({
      unitId: warehouseStockUnits.id,
      code: warehouseStockUnits.code,
      status: warehouseStockUnits.status,
      reservationId: warehouseStockReservations.id,
    })
    .from(warehouseStockUnits)
    .innerJoin(
      warehouseMeasurements,
      eq(warehouseMeasurements.id, warehouseStockUnits.measurementId),
    )
    .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
    .leftJoin(
      warehouseStockReservations,
      and(
        eq(warehouseStockReservations.stockUnitId, warehouseStockUnits.id),
        isNull(warehouseStockReservations.releasedAt),
      ),
    )
    .where(
      and(
        eq(warehouseProducts.warehouseId, warehouseId),
        inArray(warehouseStockUnits.status, COMMITTED),
        isNull(warehouseStockUnits.deletedAt),
      ),
    )

  const orphans: Discrepancy[] = committed
    .filter((row) => row.reservationId === null)
    .map((row) => ({
      unitId: row.unitId,
      code: row.code,
      status: row.status,
      reason: "committed_without_link" as const,
      quoteId: null,
    }))

  const linked = await tx
    .select({
      unitId: warehouseStockUnits.id,
      code: warehouseStockUnits.code,
      status: warehouseStockUnits.status,
      quoteId: warehouseQuotes.id,
      quoteStatus: warehouseQuotes.status,
      quoteType: warehouseQuotes.type,
    })
    .from(warehouseStockReservations)
    .innerJoin(
      warehouseStockUnits,
      eq(warehouseStockUnits.id, warehouseStockReservations.stockUnitId),
    )
    .innerJoin(warehouseQuotes, eq(warehouseQuotes.id, warehouseStockReservations.quoteId))
    .where(
      and(
        isNull(warehouseStockReservations.releasedAt),
        eq(warehouseQuotes.warehouseId, warehouseId),
      ),
    )

  const drifted: Discrepancy[] = linked
    .filter((row) => row.status !== projectedStatus(row.quoteStatus, row.quoteType))
    .map((row) => ({
      unitId: row.unitId,
      code: row.code,
      status: row.status,
      reason: "link_without_projection" as const,
      quoteId: row.quoteId,
    }))

  return [...orphans, ...drifted]
}

/**
 * El equipo que una cotización tiene apartado, nombrado.
 *
 * Hace falta para registrar un retorno —hay que decir **qué** unidad vuelve y en qué condiciones—,
 * y de paso es lo que la ficha necesita para enseñar qué salió. El código de la unidad es lo que
 * lleva escrito la etiqueta física, así que es por lo que se la reconoce en la nave.
 */
export async function heldByQuote(tx: Transaction, quoteId: string) {
  return tx
    .select({
      id: warehouseStockUnits.id,
      code: warehouseStockUnits.code,
      status: warehouseStockUnits.status,
      measurementName: warehouseMeasurements.name,
      productName: warehouseProducts.name,
    })
    .from(warehouseStockReservations)
    .innerJoin(
      warehouseStockUnits,
      eq(warehouseStockUnits.id, warehouseStockReservations.stockUnitId),
    )
    .innerJoin(
      warehouseMeasurements,
      eq(warehouseMeasurements.id, warehouseStockUnits.measurementId),
    )
    .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
    .where(
      and(
        eq(warehouseStockReservations.quoteId, quoteId),
        isNull(warehouseStockReservations.releasedAt),
      ),
    )
    .orderBy(warehouseProducts.name, warehouseStockUnits.code)
}

/** Las reservas vivas de una cotización, con el estado actual de cada unidad. */
async function liveByQuote(tx: Transaction, quoteId: string) {
  return tx
    .select({
      id: warehouseStockReservations.id,
      stockUnitId: warehouseStockReservations.stockUnitId,
      status: warehouseStockUnits.status,
    })
    .from(warehouseStockReservations)
    .innerJoin(
      warehouseStockUnits,
      eq(warehouseStockUnits.id, warehouseStockReservations.stockUnitId),
    )
    .where(
      and(
        eq(warehouseStockReservations.quoteId, quoteId),
        isNull(warehouseStockReservations.releasedAt),
      ),
    )
}
