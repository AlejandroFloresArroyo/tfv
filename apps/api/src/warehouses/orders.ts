/**
 * Pedidos de almacén.
 *
 * Ver `openspec/specs/warehouse-orders/spec.md`. Rebanada 15.
 *
 * Es el ciclo de trabajo del operador: llega una solicitud, se acepta o se rechaza, y aceptarla
 * **crea la cotización con su inventario ya apartado**.
 *
 * ## Aceptar es atómico, y eso es el cambio de fondo
 *
 * La pila anterior creaba la cotización, reservaba el inventario y enlazaba el pedido en pasos
 * sueltos. Un fallo a mitad dejaba un pedido aceptado sin cotización, o una cotización con reservas
 * que ningún pedido reclamaba — y las dos cosas se descubren semanas después, cuando alguien va a
 * la nave a buscar equipo que figura comprometido con nadie.
 *
 * Aquí todo ocurre dentro de una transacción: o quedan el pedido aceptado, la cotización creada y
 * las unidades apartadas, o no cambia nada.
 *
 * ## Existencia insuficiente
 *
 * Por defecto entra **sólo lo que cabe**, y se informa de lo que quedó fuera con su motivo. Aceptar
 * a medias y decirlo es más útil que rechazar entero: el operador ve qué falta y decide. Pedir que
 * entre todo obliga a autorizar expresamente la creación de inventario, que es la regla de
 * `stock-reservation` y no se relaja aquí.
 */

import {
  allowedOrderTransitions,
  buildPage,
  ConflictError,
  isOrderClosed,
  NotFoundError,
  newId,
  ORDER_ORIGINS,
  ORDER_STATUSES,
  type OrderOrigin,
  type OrderStatus,
  type Page,
  type ParsedQuery,
  type QuerySchema,
  TRADE_TYPES,
  type TradeType,
  UnprocessableError,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import {
  productionPurchaseOrders,
  warehouseMeasurements,
  warehouseOrderLines,
  warehouseOrderMessages,
  warehouseOrders,
  warehouseProducts,
  warehouseQuoteLines,
  warehouseQuotes,
  warehouseStockUnits,
} from "@tfv/db/schema"
import { and, count, eq, inArray, isNull, ne, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { applyQuoteLines, quoteCode } from "./quotes.ts"
import { pendingReturn, releaseLine } from "./reservations.ts"
import { loadWarehouse } from "./warehouses.ts"

export const orderQuery: QuerySchema = {
  filters: {
    status: { type: "enum", values: [...ORDER_STATUSES], set: true, label: "Estado" },
    type: { type: "enum", values: [...TRADE_TYPES], label: "Tipo" },
    origin: { type: "enum", values: [...ORDER_ORIGINS], label: "Origen" },
    clientId: { type: "id", label: "Cliente" },
    providerId: { type: "id", label: "Proveedor" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["name", "observations", "code"],
  sortable: ["priority", "createdAt", "name", "code"],
  defaultSort: [
    { field: "priority", direction: "desc" },
    { field: "createdAt", direction: "desc" },
  ],
}

const mapping = {
  fields: {
    status: warehouseOrders.status,
    type: warehouseOrders.type,
    origin: warehouseOrders.origin,
    clientId: warehouseOrders.clientId,
    providerId: warehouseOrders.providerId,
    priority: warehouseOrders.priority,
    createdAt: warehouseOrders.createdAt,
    name: warehouseOrders.name,
    code: warehouseOrders.code,
  },
  searchable: [warehouseOrders.name, warehouseOrders.observations, warehouseOrders.code],
  tiebreak: warehouseOrders.id,
}

export interface OrderRecord {
  readonly id: string
  readonly warehouseId: string
  readonly code: string
  readonly name: string
  readonly observations: string
  readonly origin: OrderOrigin
  readonly type: TradeType
  readonly status: OrderStatus
  readonly quoteId: string | null
  readonly purchaseOrderId: string | null
  readonly buyerOrderId: string | null
  readonly clientId: string | null
  readonly providerId: string | null
  readonly canceledAt: Date | null
  readonly canceledById: string | null
  readonly cancelReason: string | null
  /** Mensajes de la conversación que **este lado** no ha leído. Ver la spec. */
  readonly unread: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface OrderLineRecord {
  readonly id: string
  readonly orderId: string
  readonly measurementId: string
  readonly measurementName: string
  readonly productId: string
  readonly productName: string
  readonly productCode: string
  readonly quantity: number
  /** Unidades libres de la medida. Es lo que decide si la línea cabe al aceptar. */
  readonly available: number
  readonly position: number
}

// ─── Consulta ────────────────────────────────────────────────────────────────

export async function listOrders(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  query: ParsedQuery,
): Promise<Page<OrderRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const where = and(
      eq(warehouseOrders.warehouseId, warehouseId),
      isNull(warehouseOrders.deletedAt),
      ...collectionConditions(query, mapping),
    )

    const [total] = await tx.select({ value: count() }).from(warehouseOrders).where(where)
    const rows = await tx
      .select()
      .from(warehouseOrders)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    const unread = await unreadByOrder(
      tx,
      rows.map((row) => row.id),
    )

    return buildPage(
      rows.map((row) => toRecord(row, unread.get(row.id) ?? 0)),
      total?.value ?? 0,
      page,
      limit,
    )
  })
}

export async function getOrder(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  orderId: string,
): Promise<OrderRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const order = await loadOrder(tx, warehouseId, orderId)
    const unread = await unreadByOrder(tx, [orderId])
    return toRecord(order, unread.get(orderId) ?? 0)
  })
}

export async function listOrderLines(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  orderId: string,
): Promise<OrderLineRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadOrder(tx, warehouseId, orderId)
    return readLines(tx, orderId)
  })
}

// ─── Alta ────────────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  readonly origin: OrderOrigin
  readonly type: TradeType
  readonly name?: string | undefined
  readonly observations?: string | undefined
  readonly clientId?: string | undefined
  readonly providerId?: string | undefined
  readonly purchaseOrderId?: string | undefined
  readonly lines: readonly { measurementId: string; quantity: number }[]
}

export async function createOrder(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  input: CreateOrderInput,
): Promise<OrderRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const orderId = newId()
    const [row] = await tx
      .insert(warehouseOrders)
      .values({
        id: orderId,
        warehouseId,
        code: orderCode(),
        name: input.name ?? "",
        observations: input.observations ?? "",
        origin: input.origin,
        type: input.type,
        status: "pending",
        clientId: input.clientId ?? null,
        providerId: input.providerId ?? null,
        purchaseOrderId: input.purchaseOrderId ?? null,
      })
      .returning()

    if (!row) throw new Error("El pedido no se insertó")

    if (input.lines.length > 0) {
      await tx.insert(warehouseOrderLines).values(
        input.lines.map((line, index) => ({
          id: newId(),
          orderId,
          measurementId: line.measurementId,
          quantity: line.quantity,
          position: index,
        })),
      )
    }

    return toRecord(row, 0)
  })
}

// ─── Aceptación ──────────────────────────────────────────────────────────────

export interface AcceptResult {
  readonly order: OrderRecord
  readonly quoteId: string
  /** Lo que no entró en la cotización, con su motivo. Vacío cuando cupo todo. */
  readonly excluded: readonly {
    readonly lineId: string
    readonly productName: string
    readonly measurementName: string
    readonly requested: number
    readonly available: number
  }[]
}

/**
 * Acepta un pedido y crea su cotización con el inventario apartado.
 *
 * El folio de la cotización **se deriva del código del pedido**, no del correlativo del almacén: es
 * lo que permite reconocer de un vistazo qué documento vino de qué solicitud, y lo que pide la spec.
 */
export async function acceptOrder(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  orderId: string,
  options: { readonly includeAll?: boolean; readonly allowMinting?: boolean } = {},
): Promise<AcceptResult> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const order = await loadOrder(tx, warehouseId, orderId)
    assertTransition(order.status, "accepted")

    const lines = await readLines(tx, orderId)
    if (lines.length === 0) {
      throw new UnprocessableError("Un pedido sin líneas no genera cotización")
    }

    // Por defecto entra lo que cabe. Pedir que entre todo traslada la decisión a la regla de
    // `stock-reservation`, que exige autorización expresa para crear el inventario que falte.
    const included = options.includeAll
      ? lines
      : lines.filter((line) => line.available >= line.quantity)
    const excluded = lines
      .filter((line) => !included.includes(line))
      .map((line) => ({
        lineId: line.id,
        productName: line.productName,
        measurementName: line.measurementName,
        requested: line.quantity,
        available: line.available,
      }))

    if (included.length === 0) {
      throw new UnprocessableError(
        "Ninguna línea del pedido tiene existencia suficiente. Autoriza la creación de inventario " +
          "si el equipo existe y falta darlo de alta.",
      )
    }

    const quoteId = newId()
    await tx.insert(warehouseQuotes).values({
      id: quoteId,
      warehouseId,
      orderId,
      clientId: order.clientId,
      responsibleId: actor.userId,
      code: quoteCode(),
      // Derivado del pedido: es lo que hace reconocible de dónde vino el documento.
      folio: order.code,
      name: order.name,
      description: order.observations,
      type: order.type,
      status: "in_progress",
      // Sin ventana: el pedido no lleva fechas. Las pone quien negocia, en la cotización, y hasta
      // entonces la renta no puede avanzar — que es la comprobación de `quotations`.
    })

    await applyQuoteLines(
      tx,
      quoteId,
      warehouseId,
      included.map((line, index) => ({
        measurementId: line.measurementId,
        quantity: line.quantity,
        position: index,
        positionProduct: index,
      })),
      { actorId: actor.userId, allowMinting: options.allowMinting ?? false },
    )

    const [updated] = await tx
      .update(warehouseOrders)
      .set({ status: "accepted", quoteId, updatedAt: new Date() })
      .where(eq(warehouseOrders.id, orderId))
      .returning()

    if (!updated) throw new Error("El pedido no se actualizó")
    return { order: toRecord(updated, 0), quoteId, excluded }
  })
}

// ─── Rechazo y cambio de estado ──────────────────────────────────────────────

/**
 * Rechaza un pedido.
 *
 * El motivo es obligatorio porque **lo lee quien hizo la solicitud desde otra empresa**: un pedido
 * que aparece cancelado sin explicación obliga a llamar por teléfono, que es lo que este sistema
 * existe para evitar.
 */
export async function rejectOrder(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  orderId: string,
  reason: string,
): Promise<OrderRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const order = await loadOrder(tx, warehouseId, orderId)
    assertTransition(order.status, "canceled")

    if (reason.trim() === "") {
      throw new UnprocessableError("El rechazo necesita un motivo: lo lee quien hizo la solicitud")
    }

    await releaseOrderStock(tx, order, actor.userId)

    const [updated] = await tx
      .update(warehouseOrders)
      .set({
        status: "canceled",
        canceledAt: new Date(),
        canceledById: actor.userId,
        cancelReason: reason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(warehouseOrders.id, orderId))
      .returning()

    if (!updated) throw new Error("El pedido no se actualizó")

    await cancelPurchaseOrderIfExhausted(tx, order.purchaseOrderId, orderId, actor.userId)
    return toRecord(updated, 0)
  })
}

export async function changeOrderStatus(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  orderId: string,
  next: OrderStatus,
): Promise<OrderRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const order = await loadOrder(tx, warehouseId, orderId)
    assertTransition(order.status, next)

    if (next === "canceled") {
      throw new UnprocessableError("Cancelar un pedido exige un motivo. Usa el rechazo.")
    }

    const [updated] = await tx
      .update(warehouseOrders)
      .set({ status: next, updatedAt: new Date() })
      .where(eq(warehouseOrders.id, orderId))
      .returning()

    if (!updated) throw new Error("El pedido no se actualizó")
    return toRecord(updated, 0)
  })
}

/**
 * Da de baja un pedido.
 *
 * **No se elimina con equipo sin devolver.** El pedido es lo que enlaza la solicitud con la
 * cotización que sujeta el equipo; borrarlo con unidades fuera deja el rastro cortado justo donde
 * hace falta para reclamarlas.
 */
export async function deleteOrder(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  orderId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const order = await loadOrder(tx, warehouseId, orderId)

    const outstanding = order.quoteId ? await pendingReturn(tx, order.quoteId) : 0
    if (outstanding > 0) {
      throw new UnprocessableError(
        `Hay ${outstanding === 1 ? "una unidad" : `${outstanding} unidades`} sin devolver. ` +
          "Registra el retorno del equipo antes de dar de baja el pedido.",
      )
    }

    await releaseOrderStock(tx, order, actor.userId)

    // La cotización se **desvincula**, no se borra: es un documento con importes que alguien firmó.
    if (order.quoteId) {
      await tx
        .update(warehouseQuotes)
        .set({ orderId: null, updatedAt: new Date() })
        .where(eq(warehouseQuotes.id, order.quoteId))
    }

    await tx
      .update(warehouseOrders)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(warehouseOrders.id, orderId))
  })
}

// ─── Interno ─────────────────────────────────────────────────────────────────

export async function loadOrder(tx: Transaction, warehouseId: string, orderId: string) {
  const [order] = await tx
    .select()
    .from(warehouseOrders)
    .where(
      and(
        eq(warehouseOrders.id, orderId),
        eq(warehouseOrders.warehouseId, warehouseId),
        isNull(warehouseOrders.deletedAt),
      ),
    )

  if (!order) throw new NotFoundError("El pedido no existe en este almacén")
  return order
}

function assertTransition(current: OrderStatus, next: OrderStatus): void {
  if (isOrderClosed(current)) {
    throw new ConflictError("Un pedido cerrado no vuelve a abrirse")
  }
  if (!allowedOrderTransitions(current).includes(next)) {
    throw new ConflictError(`Un pedido en «${current}» no pasa a «${next}»`)
  }
}

/** Suelta lo que la cotización del pedido tuviera apartado dentro de la nave. */
async function releaseOrderStock(
  tx: Transaction,
  order: { readonly quoteId: string | null },
  actorId: string,
): Promise<void> {
  if (!order.quoteId) return
  const lines = await tx
    .select({ id: warehouseQuoteLines.id })
    .from(warehouseQuoteLines)
    .where(eq(warehouseQuoteLines.quoteId, order.quoteId))

  for (const line of lines) {
    await releaseLine(tx, line.id, { actorId, quoteId: order.quoteId })
  }
}

/**
 * Cancela la orden de compra cuando **todos** sus pedidos han quedado cancelados.
 *
 * Se comprueba dentro de la misma transacción que acaba de cancelar uno, así que el hermano que
 * otro operador esté rechazando a la vez ve un estado consistente: la carrera que la pila anterior
 * tenía —dos rechazos simultáneos, ninguno el «último»— no puede darse.
 */
async function cancelPurchaseOrderIfExhausted(
  tx: Transaction,
  purchaseOrderId: string | null,
  justCanceled: string,
  actorId: string,
): Promise<void> {
  if (!purchaseOrderId) return

  const [alive] = await tx
    .select({ value: count() })
    .from(warehouseOrders)
    .where(
      and(
        eq(warehouseOrders.purchaseOrderId, purchaseOrderId),
        ne(warehouseOrders.id, justCanceled),
        ne(warehouseOrders.status, "canceled"),
        isNull(warehouseOrders.deletedAt),
      ),
    )

  if ((alive?.value ?? 0) > 0) return

  await tx
    .update(productionPurchaseOrders)
    .set({
      status: "canceled",
      canceledAt: new Date(),
      canceledById: actorId,
      cancelReason: "Todos sus pedidos de almacén fueron rechazados",
      updatedAt: new Date(),
    })
    .where(eq(productionPurchaseOrders.id, purchaseOrderId))
}

async function readLines(tx: Transaction, orderId: string): Promise<OrderLineRecord[]> {
  const rows = await tx
    .select({
      line: warehouseOrderLines,
      measurementName: warehouseMeasurements.name,
      productId: warehouseProducts.id,
      productName: warehouseProducts.name,
      productCode: warehouseProducts.code,
      available: sql<number>`(
        select count(*)::int from warehouse_stock_units u
         where u.measurement_id = ${warehouseOrderLines.measurementId}
           and u.status = 'available'
           and u.deleted_at is null
      )`,
    })
    .from(warehouseOrderLines)
    .innerJoin(
      warehouseMeasurements,
      eq(warehouseMeasurements.id, warehouseOrderLines.measurementId),
    )
    .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
    .where(eq(warehouseOrderLines.orderId, orderId))
    .orderBy(warehouseOrderLines.position)

  return rows.map((row) => ({
    id: row.line.id,
    orderId: row.line.orderId,
    measurementId: row.line.measurementId,
    measurementName: row.measurementName,
    productId: row.productId,
    productName: row.productName,
    productCode: row.productCode,
    quantity: row.line.quantity,
    available: row.available,
    position: row.line.position,
  }))
}

/**
 * Mensajes sin leer **del otro lado**, por pedido.
 *
 * Es por lado y no por persona: si tres personas del almacén están en la conversación y una lee,
 * queda leído para el lado del proveedor. Es lo correcto aquí, porque el cliente quiere saber si
 * *el almacén* lo vio.
 */
async function unreadByOrder(
  tx: Transaction,
  orderIds: readonly string[],
): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map()

  const rows = await tx
    .select({ orderId: warehouseOrderMessages.orderId, value: count() })
    .from(warehouseOrderMessages)
    .where(
      and(
        inArray(warehouseOrderMessages.orderId, [...orderIds]),
        eq(warehouseOrderMessages.side, "client"),
        isNull(warehouseOrderMessages.readByProviderAt),
      ),
    )
    .groupBy(warehouseOrderMessages.orderId)

  return new Map(rows.map((row) => [row.orderId, row.value]))
}

function toRecord(row: typeof warehouseOrders.$inferSelect, unread: number): OrderRecord {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    code: row.code,
    name: row.name,
    observations: row.observations,
    origin: row.origin,
    type: row.type,
    status: row.status,
    quoteId: row.quoteId,
    purchaseOrderId: row.purchaseOrderId,
    buyerOrderId: row.buyerOrderId,
    clientId: row.clientId,
    providerId: row.providerId,
    canceledAt: row.canceledAt,
    canceledById: row.canceledById,
    cancelReason: row.cancelReason,
    unread,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Código del pedido. **Inmutable**: la pila anterior lo regeneraba en cada listado (`DEFECTS.md`
 * L-05), de modo que el código impreso en un papel dejaba de encontrar nada.
 *
 * Aleatorio y no derivado del identificador: los identificadores llevan el instante en los bits
 * altos, así que dos pedidos creados en el mismo milisegundo compartirían prefijo — y el prefijo es
 * justo lo que cabría en un código corto.
 */
function orderCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return `PED-${Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("")}`
}

/** Mismo alfabeto que el resto de códigos: sin caracteres que se confundan al dictarlos. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
