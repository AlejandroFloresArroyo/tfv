/**
 * Compras de una producción a los almacenes de otras empresas.
 *
 * Ver `openspec/specs/production-procurement/spec.md`. Rebanada 23.
 *
 * Es la integración más acoplada del sistema y **la única operación que escribe en dos
 * arrendatarios a la vez**. Todo lo demás de este módulo es consecuencia de eso.
 *
 * ## El abanico
 *
 * La producción arma **una** solicitud con todo lo que necesita, sin preocuparse de a quién
 * pertenece cada cosa. El sistema resuelve de qué almacén es cada línea y abre **un pedido por
 * almacén**, cada uno en la empresa que corresponde, y de paso da de alta la relación comercial en
 * los dos sentidos.
 *
 * ```
 * Orden de compra        (empresa A)
 *    ├── Pedido → almacén 1 (empresa B)
 *    ├── Pedido → almacén 2 (empresa C)
 *    └── Pedido → almacén 3 (empresa B)
 * ```
 *
 * **Una transacción para todo.** Si falla el tercer almacén no queda ni la orden, ni los dos
 * pedidos que ya se habían escrito, ni las contrapartes que se habían dado de alta. Por eso
 * `provisionPairIn` recibe la transacción en vez de abrir la suya, y por eso los pedidos se
 * componen dentro del mismo `withSystem` que creó la orden.
 *
 * ## Cómo se declara el alcance cuando el alcance es justo lo que no se sabe
 *
 * `withSystem` exige nombrar las empresas por adelantado, y las empresas de los almacenes son
 * precisamente lo que las políticas esconden hasta que se nombran. La salida es la misma que la de
 * la resolución de un sitio público: **funciones `security definer` que responden a una sola
 * pregunta** (migración `0031`), y con su respuesta todo lo demás corre sujeto a las políticas.
 *
 * | Función | Responde | La usa |
 * |---|---|---|
 * | `app.procurement_source(uuid[])` | de qué almacén y empresa es cada medida | el abanico |
 * | `app.published_warehouses()` | qué almacenes publicados hay | la tienda interna |
 * | `app.purchase_order_scope(uuid)` | qué empresas toca una orden ya abierta | leer, cancelar, liquidar |
 *
 * La tercera **comprueba por dentro que quien pregunta alcanza la orden**, así que no revela nada:
 * a quien no la alcanza le responde el conjunto vacío, que aquí se traduce en `404`.
 *
 * ## Lo que este módulo no hace, a propósito
 *
 * **No devuelve nombres de la empresa ajena en los listados de la producción.** El resumen de una
 * orden dice cuántos pedidos abrió, en qué almacén y en qué estado están, y nada más. El nombre del
 * almacén lo tiene la pantalla porque lo vio en la tienda interna, que sí es una lectura del
 * escaparate publicado. Eso es «el vínculo no abre otros datos de la empresa ajena» aplicado a la
 * forma de las respuestas y no sólo al aislamiento del motor.
 *
 * **No escribe en la bitácora de ninguna de las dos empresas.** El asiento va por clave de catálogo
 * cerrado (`HALLAZGOS.md` H-153) y ninguna de las siete existentes dice lo que aquí ocurre. Lo que
 * sí queda, y las dos partes leen, es el hito en la conversación del pedido — que es la vía que la
 * rebanada 15 ya usa para aceptar y rechazar. Ver `tasks.md` de la rebanada, «Diseño previo».
 */

import {
  buildPage,
  ConflictError,
  isOrderClosed,
  NotFoundError,
  newId,
  type OrderStatus,
  type Page,
  type ParsedQuery,
  type QuerySchema,
  type TradeType,
  UnprocessableError,
} from "@tfv/contracts"
import { type Transaction, withRequester, withSystem } from "@tfv/db"
import {
  companies,
  companyAddresses,
  companyMembers,
  counterparties,
  productionCategories,
  productionPurchaseOrderLines,
  productionPurchaseOrders,
  productionShoppings,
  warehouseMeasurements,
  warehouseOrderLines,
  warehouseOrders,
  warehouseProductImages,
  warehouseProducts,
  warehouseQuotePayments,
  warehouseQuotes,
  warehouseStockReservations,
  warehouseStockUnits,
  warehouses,
} from "@tfv/db/schema"
import { and, count, eq, inArray, isNull, notInArray, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { provisionPairIn } from "../companies/counterparties.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { publishSystemMessage } from "../warehouses/order-chat.ts"
import { releaseOrderStock } from "../warehouses/orders.ts"
import type { PaymentMethod } from "../warehouses/payments.ts"
import { sellQuote } from "../warehouses/quotes.ts"
import { mintItems } from "./items.ts"
import { loadProduction } from "./productions.ts"

/** Los nombres de operación que aparecen en `app_operation` y en cualquier auditoría del motor. */
const FAN_OUT = "abanico_de_compra"
const CANCEL = "cancelar_orden_de_compra"
const SETTLE = "liquidar_pedido_de_almacen"
const SHOP = "tienda_interna"

export const PURCHASE_ORDER_STATUSES = ["open", "settled", "canceled"] as const
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number]

// ─── Lo que sale de aquí ─────────────────────────────────────────────────────

/**
 * Un pedido de la orden, visto desde la producción.
 *
 * Sin el nombre del almacén ni el de su empresa: ver la cabecera del módulo.
 */
export interface PurchaseShipmentRecord {
  readonly id: string
  readonly warehouseId: string
  readonly code: string
  readonly status: OrderStatus
  readonly quoteId: string | null
  /** Cuántas líneas de la orden fueron a este pedido. */
  readonly lines: number
  readonly cancelReason: string | null
}

export interface PurchaseOrderRecord {
  readonly id: string
  readonly productionId: string
  readonly code: string
  readonly name: string
  readonly type: TradeType
  readonly status: PurchaseOrderStatus
  readonly categoryId: string | null
  readonly deliveryAddressId: string | null
  readonly responsibleId: string | null
  readonly canceledAt: Date | null
  readonly cancelReason: string | null
  /** El resumen que pide la spec: cuántos pedidos generó y en qué estado está cada uno. */
  readonly orders: readonly PurchaseShipmentRecord[]
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface PurchaseOrderLineRecord {
  readonly id: string
  readonly purchaseOrderId: string
  readonly measurementId: string
  readonly measurementName: string | null
  readonly productId: string | null
  readonly productName: string | null
  readonly quantity: number
  readonly warehouseId: string | null
  readonly warehouseOrderId: string | null
}

/** Un almacén del escaparate de la tienda interna. */
export interface ShopWarehouseRecord {
  readonly warehouseId: string
  readonly companyId: string
  readonly companyName: string
  readonly name: string
  readonly description: string
}

export interface ShopMeasurementRecord {
  readonly id: string
  readonly name: string
  /** Unidades libres ahora mismo. Es lo que decide si la línea se puede pedir. */
  readonly available: number
}

export interface ShopProductRecord {
  readonly productId: string
  readonly name: string
  readonly description: string
  readonly code: string
  readonly availableForSale: boolean
  readonly availableForRent: boolean
  readonly measurements: readonly ShopMeasurementRecord[]
}

export interface SettlementRecord {
  readonly purchaseOrder: PurchaseOrderRecord
  readonly warehouseOrderId: string
  readonly quoteId: string
  readonly shoppingId: string
  readonly amount: string
  readonly items: readonly { readonly id: string; readonly name: string; readonly code: string }[]
}

// ─── Consulta de las órdenes ─────────────────────────────────────────────────

export const purchaseOrderQuery: QuerySchema = {
  filters: {
    status: { type: "enum", values: [...PURCHASE_ORDER_STATUSES], set: true, label: "Estado" },
    type: { type: "enum", values: ["rent", "sale"], label: "Tipo" },
    categoryId: { type: "id", label: "Categoría" },
    responsibleId: { type: "id", label: "Responsable" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["name", "code"],
  sortable: ["createdAt", "name", "code"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
}

const mapping = {
  fields: {
    status: productionPurchaseOrders.status,
    type: productionPurchaseOrders.type,
    categoryId: productionPurchaseOrders.categoryId,
    responsibleId: productionPurchaseOrders.responsibleId,
    createdAt: productionPurchaseOrders.createdAt,
    name: productionPurchaseOrders.name,
    code: productionPurchaseOrders.code,
  },
  searchable: [productionPurchaseOrders.name, productionPurchaseOrders.code],
  tiebreak: productionPurchaseOrders.id,
}

/**
 * El listado de órdenes de una producción.
 *
 * Corre con **el alcance de la propia empresa y nada más**. Lo que necesita del otro lado —el
 * estado de cada pedido— sale de `warehouse_orders`, cuya política de lectura ya concede el acceso
 * a quien alcanza la orden de compra que lo originó; y cuántas líneas fueron a cada pedido sale de
 * la columna que el abanico dejó escrita en las líneas de la propia orden.
 *
 * **El código no se toca.** Se escribió una vez, al crearla. La pila anterior lo regeneraba en cada
 * llamada a este listado, con lo que un código impreso en un papel dejaba de encontrar nada
 * (`DEFECTS.md` L-05).
 */
export async function listPurchaseOrders(
  actor: Actor,
  companyId: string,
  productionId: string,
  query: ParsedQuery,
): Promise<Page<PurchaseOrderRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const where = and(
      eq(productionPurchaseOrders.productionId, productionId),
      isNull(productionPurchaseOrders.deletedAt),
      ...collectionConditions(query, mapping),
    )

    const [total] = await tx.select({ value: count() }).from(productionPurchaseOrders).where(where)
    const rows = await tx
      .select()
      .from(productionPurchaseOrders)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    return buildPage(await decorate(tx, rows), total?.value ?? 0, page, limit)
  })
}

export async function getPurchaseOrder(
  actor: Actor,
  companyId: string,
  productionId: string,
  purchaseOrderId: string,
): Promise<PurchaseOrderRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const row = await loadPurchaseOrder(tx, productionId, purchaseOrderId)
    return single(await decorate(tx, [row]))
  })
}

/**
 * Las líneas de una orden, con el nombre de lo que se pidió.
 *
 * Es la única lectura de la producción que **necesita alcance sobre las empresas ajenas**: el
 * nombre de un producto vive en el catálogo del almacén. Lo declara acotado a las empresas que la
 * propia orden ya toca, y una línea cuyo producto se retiró del catálogo desde entonces sale con
 * su cantidad y sin nombre, en lugar de desaparecer.
 */
export async function listPurchaseOrderLines(
  actor: Actor,
  companyId: string,
  productionId: string,
  purchaseOrderId: string,
): Promise<readonly PurchaseOrderLineRecord[]> {
  const scope = await purchaseOrderScope(actor, purchaseOrderId)

  return withSystem(`${FAN_OUT}.lineas`, scope, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadPurchaseOrder(tx, productionId, purchaseOrderId)

    const rows = await tx
      .select({
        line: productionPurchaseOrderLines,
        measurementName: warehouseMeasurements.name,
        productId: warehouseProducts.id,
        productName: warehouseProducts.name,
        warehouseId: warehouseProducts.warehouseId,
      })
      .from(productionPurchaseOrderLines)
      .leftJoin(
        warehouseMeasurements,
        eq(warehouseMeasurements.id, productionPurchaseOrderLines.measurementId),
      )
      .leftJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
      .where(eq(productionPurchaseOrderLines.purchaseOrderId, purchaseOrderId))
      .orderBy(productionPurchaseOrderLines.createdAt, productionPurchaseOrderLines.id)

    return rows.map((row) => ({
      id: row.line.id,
      purchaseOrderId: row.line.purchaseOrderId,
      measurementId: row.line.measurementId,
      measurementName: row.measurementName,
      productId: row.productId,
      productName: row.productName,
      quantity: row.line.quantity,
      warehouseId: row.warehouseId,
      warehouseOrderId: row.line.warehouseOrderId,
    }))
  })
}

// ─── El abanico ──────────────────────────────────────────────────────────────

export interface PurchaseLineInput {
  readonly measurementId: string
  readonly quantity: number
}

export interface CreatePurchaseOrderInput {
  readonly name: string
  readonly type: TradeType
  readonly categoryId?: string | null | undefined
  readonly deliveryAddressId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
  readonly lines: readonly PurchaseLineInput[]
}

/**
 * Crea la orden y abre un pedido por almacén, **todo o nada**.
 *
 * El orden de los almacenes es el de la primera línea que los nombra, así que dos envíos iguales
 * producen el mismo reparto. No es cosmético: hace reproducible qué pedido se estaba componiendo
 * cuando algo falló.
 *
 * La comprobación de permiso no está aquí: la hace el guardián, en la empresa de la producción,
 * **antes** de que exista el manejador. Es lo que hace que un `403` no llegue a escribir nada — ni
 * una contraparte.
 */
export async function createPurchaseOrder(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: CreatePurchaseOrderInput,
): Promise<PurchaseOrderRecord> {
  if (input.lines.length === 0) {
    throw new UnprocessableError("Una orden de compra sin líneas no abre ningún pedido")
  }

  await assertProduction(actor, companyId, productionId)

  const sources = await resolveSources(input.lines.map((line) => line.measurementId))

  // Lo que la resolución no encuentra no existe **para esta producción**: o la medida no está, o su
  // producto no está publicado, o su almacén no lo está. Las tres respuestas son la misma a
  // propósito, y por eso el mensaje no distingue.
  const unresolved = input.lines.filter((line) => !sources.has(line.measurementId))
  if (unresolved.length > 0) {
    throw new UnprocessableError(
      unresolved.length === 1
        ? "Uno de los productos pedidos ya no está disponible en la tienda"
        : `${unresolved.length} de los productos pedidos ya no están disponibles en la tienda`,
    )
  }

  const own = [...sources.values()].filter((source) => source.companyId === companyId)
  if (own.length > 0) {
    throw new UnprocessableError("Una producción no se compra a sí misma")
  }

  const scope = [companyId, ...new Set([...sources.values()].map((source) => source.companyId))]

  return withSystem(FAN_OUT, scope, async (tx) => {
    const production = await loadProduction(tx, companyId, productionId)
    await assertCategory(tx, productionId, input.categoryId ?? null)
    await assertAddress(tx, companyId, input.deliveryAddressId ?? null)
    await assertResponsible(tx, companyId, input.responsibleId ?? null)

    const purchaseOrderId = newId()
    const [order] = await tx
      .insert(productionPurchaseOrders)
      .values({
        id: purchaseOrderId,
        productionId,
        // Se escribe **una vez**. Nada vuelve a tocarlo, y esa es toda la corrección de L-05.
        code: purchaseOrderCode(),
        name: input.name.trim(),
        type: input.type,
        status: "open",
        categoryId: input.categoryId ?? null,
        deliveryAddressId: input.deliveryAddressId ?? null,
        responsibleId: input.responsibleId ?? actor.userId,
      })
      .returning()

    if (!order) throw new Error("la orden de compra no se insertó")

    const lineIds = input.lines.map(() => newId())
    await tx.insert(productionPurchaseOrderLines).values(
      input.lines.map((line, index) => ({
        id: lineIds[index] as string,
        purchaseOrderId,
        measurementId: line.measurementId,
        quantity: line.quantity,
      })),
    )

    // Agrupadas por almacén, en el orden en que aparecieron.
    const byWarehouse = new Map<string, { index: number; line: PurchaseLineInput }[]>()
    for (const [index, line] of input.lines.entries()) {
      const source = sources.get(line.measurementId)
      if (!source) throw new Error("la resolución perdió una medida entre pasos")
      const bucket = byWarehouse.get(source.warehouseId)
      if (bucket) bucket.push({ index, line })
      else byWarehouse.set(source.warehouseId, [{ index, line }])
    }

    const buyer = { companyId, name: await companyName(tx, companyId) }

    for (const [warehouseId, group] of byWarehouse) {
      const warehouse = await loadWarehouseInScope(tx, warehouseId)

      // La modalidad y la existencia se comprueban **aquí**, con el almacén ya en el alcance: es la
      // primera vez que se pueden mirar. Un fallo en el tercer almacén revierte los dos primeros.
      for (const { line } of group) {
        await assertOfferable(tx, line, input.type)
      }

      const pair = await provisionPairIn(
        tx,
        { companyId: warehouse.companyId, name: warehouse.companyName },
        buyer,
      )

      const orderId = newId()
      await tx.insert(warehouseOrders).values({
        id: orderId,
        warehouseId,
        code: warehouseOrderCode(),
        name: order.name,
        observations: `Orden de compra ${order.code} de «${production.name}»`,
        origin: "production",
        type: input.type,
        status: "pending",
        // Es lo que deja a la producción **leer** su pedido y su cotización en la empresa ajena.
        clientId: pair.clientId,
        purchaseOrderId,
      })

      await tx.insert(warehouseOrderLines).values(
        group.map(({ line }, position) => ({
          id: newId(),
          orderId,
          measurementId: line.measurementId,
          quantity: line.quantity,
          position,
        })),
      )

      // Y la línea de la orden apunta al pedido en el que acabó. Es lo que permite contar sin
      // salir del arrendatario de la producción.
      await tx
        .update(productionPurchaseOrderLines)
        .set({ warehouseOrderId: orderId })
        .where(
          inArray(
            productionPurchaseOrderLines.id,
            group.map(({ index }) => lineIds[index] as string),
          ),
        )
    }

    return single(await decorate(tx, [order]))
  })
}

// ─── Cancelación descendente ─────────────────────────────────────────────────

/**
 * Cancela la orden y con ella todos sus pedidos vigentes, en todas las empresas implicadas.
 *
 * **Un pedido ya liquidado conserva su estado.** No es una excepción cómoda: cancelar un pedido
 * finalizado significaría devolver al estante equipo que ya se pagó, se sacó de la nave y está en
 * el inventario de la producción.
 *
 * Es cancelación y no baja, y por eso el camino se llama así. Una orden que repartió pedidos en
 * empresas ajenas es un documento con consecuencias fuera de casa: borrarla deja a la otra parte
 * con un pedido cuyo origen ya no se puede abrir.
 */
export async function cancelPurchaseOrder(
  actor: Actor,
  companyId: string,
  productionId: string,
  purchaseOrderId: string,
  reason: string,
): Promise<PurchaseOrderRecord> {
  const motivo = reason.trim()
  if (motivo === "") {
    throw new UnprocessableError("La cancelación necesita un motivo: lo lee la otra empresa")
  }

  const scope = await purchaseOrderScope(actor, purchaseOrderId)

  return withSystem(CANCEL, scope, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const order = await loadPurchaseOrder(tx, productionId, purchaseOrderId)

    if (order.status === "canceled") {
      throw new ConflictError("La orden de compra ya está cancelada")
    }

    const shipments = await tx
      .select()
      .from(warehouseOrders)
      .where(
        and(
          eq(warehouseOrders.purchaseOrderId, purchaseOrderId),
          isNull(warehouseOrders.deletedAt),
        ),
      )
      .for("update")

    const now = new Date()
    const aviso = `La producción canceló la orden de compra: ${motivo}`

    for (const shipment of shipments) {
      if (isOrderClosed(shipment.status)) continue

      await releaseOrderStock(tx, shipment, actor.userId)
      await tx
        .update(warehouseOrders)
        .set({
          status: "canceled",
          canceledAt: now,
          canceledById: actor.userId,
          cancelReason: aviso,
          updatedAt: now,
        })
        .where(eq(warehouseOrders.id, shipment.id))

      await publishSystemMessage(tx, shipment.id, aviso)
    }

    const [updated] = await tx
      .update(productionPurchaseOrders)
      .set({
        status: "canceled",
        canceledAt: now,
        canceledById: actor.userId,
        cancelReason: motivo,
        updatedAt: now,
      })
      .where(eq(productionPurchaseOrders.id, purchaseOrderId))
      .returning()

    if (!updated) throw new Error("la orden de compra no se actualizó")
    return single(await decorate(tx, [updated]))
  })
}

// ─── Liquidación ─────────────────────────────────────────────────────────────

export interface SettlementInput {
  readonly amount: string
  readonly method: PaymentMethod
  readonly description?: string | undefined
}

/**
 * Liquida un pedido de almacén: los seis efectos, o ninguno.
 *
 * 1. el pedido queda finalizado;
 * 2. su cotización, vendida;
 * 3. el pago queda registrado contra ella;
 * 4. las unidades reservadas pasan a vendidas;
 * 5. se materializa **un artículo por cada unidad** en el inventario de la producción;
 * 6. se registra la compra, vinculada a esos artículos, y el presupuesto se mueve solo.
 *
 * ## Por qué el pedido salta de «aceptado» a «finalizado»
 *
 * La máquina de estados de un pedido —`@tfv/contracts`, rebanada 15— sólo admite
 * `accepted → delivered → finished`, y la spec de esta rebanada dice, con esas palabras, liquidar
 * un pedido **aceptado** y dejarlo **finalizado**. No hay contradicción que resolver eligiendo una:
 * la máquina gobierna los cambios de estado que alguien hace a mano, uno por uno, y esto no es uno
 * de ellos — es el cierre del circuito, que ocurre entero o no ocurre. Se admite desde los dos
 * estados abiertos que tienen cotización. Anotado en `HALLAZGOS.md` H-284.
 *
 * ## Y por qué sólo de venta
 *
 * Los efectos 4 y 5 —unidades **vendidas**, artículos en el inventario de la producción— sólo
 * significan algo en una venta. Una renta no transfiere nada: el equipo vuelve, y su ciclo es el de
 * `warehouse-orders`. Liquidar una renta responde `422` en vez de fingir. Ver `HALLAZGOS.md` H-285.
 *
 * ## La idempotencia
 *
 * Se comprueba con el pedido **bloqueado**, y debajo hay un índice único parcial sobre
 * `production_shoppings.warehouse_order_id` por si dos peticiones entran a la vez.
 */
export async function settleWarehouseOrder(
  actor: Actor,
  companyId: string,
  productionId: string,
  purchaseOrderId: string,
  warehouseOrderId: string,
  input: SettlementInput,
): Promise<SettlementRecord> {
  const scope = await purchaseOrderScope(actor, purchaseOrderId)

  return withSystem(SETTLE, scope, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const order = await loadPurchaseOrder(tx, productionId, purchaseOrderId)

    // Bloqueo primero, y todo lo demás después: sin él dos liquidaciones simultáneas leen las dos
    // un pedido sin liquidar.
    const [shipment] = await tx
      .select()
      .from(warehouseOrders)
      .where(
        and(
          eq(warehouseOrders.id, warehouseOrderId),
          eq(warehouseOrders.purchaseOrderId, purchaseOrderId),
          isNull(warehouseOrders.deletedAt),
        ),
      )
      .for("update")

    if (!shipment) throw new NotFoundError("El pedido no pertenece a esta orden de compra")

    const [already] = await tx
      .select({ id: productionShoppings.id })
      .from(productionShoppings)
      .where(
        and(
          eq(productionShoppings.warehouseOrderId, warehouseOrderId),
          isNull(productionShoppings.deletedAt),
        ),
      )
      .limit(1)

    if (already) throw new ConflictError("Este pedido ya se liquidó")

    if (isOrderClosed(shipment.status)) {
      throw new ConflictError(`Un pedido «${shipment.status}» ya no se liquida`)
    }
    if (!shipment.quoteId) {
      throw new UnprocessableError(
        "El pedido todavía no tiene cotización: el almacén no lo ha aceptado",
      )
    }

    const [quote] = await tx
      .select()
      .from(warehouseQuotes)
      .where(eq(warehouseQuotes.id, shipment.quoteId))
      .limit(1)

    if (!quote) throw new NotFoundError("La cotización del pedido no existe")
    if (quote.type !== "sale") {
      throw new UnprocessableError(
        "Sólo se liquida una compra de venta. El equipo rentado vuelve, y su ciclo es el del pedido",
      )
    }

    // Las unidades apartadas, **antes** de proyectar: vender suelta el vínculo, y después de eso
    // ya no hay a qué preguntarle qué se llevó la producción.
    const units = await heldUnits(tx, quote.id)
    if (units.length === 0) {
      throw new UnprocessableError("La cotización no tiene ninguna unidad apartada que liquidar")
    }

    await sellQuote(tx, quote, actor.userId)

    await tx.insert(warehouseQuotePayments).values({
      id: newId(),
      quoteId: quote.id,
      amount: input.amount,
      method: input.method,
      description: input.description ?? null,
      paidById: actor.userId,
    })

    const now = new Date()
    await tx
      .update(warehouseOrders)
      .set({ status: "finished", updatedAt: now })
      .where(eq(warehouseOrders.id, warehouseOrderId))

    const warehouse = await loadWarehouseInScope(tx, shipment.warehouseId)
    const providerId = await providerFor(tx, companyId, warehouse.companyId)

    const shoppingId = newId()
    await tx.insert(productionShoppings).values({
      id: shoppingId,
      productionId,
      categoryId: order.categoryId,
      providerId,
      // La trazabilidad entre arrendatarios, y de paso lo que hace imposible la segunda liquidación.
      warehouseOrderId,
      name: `${warehouse.name} · ${shipment.code}`,
      observations: `Liquidación de la orden de compra ${order.code}`,
      amount: input.amount,
      kind: "shopping",
      method: input.method,
      occurredOn: now,
      responsibleId: actor.userId,
    })

    // Un artículo por **unidad física**, no por línea.
    const images = await imagesByProduct(tx, [...new Set(units.map((unit) => unit.productId))])
    const items = await mintItems(
      tx,
      productionId,
      actor.userId,
      units.map((unit) => ({
        name: unit.productName,
        description: unit.productDescription,
        shoppingId,
        uploadIds: images.get(unit.productId) ?? [],
      })),
    )

    await publishSystemMessage(
      tx,
      warehouseOrderId,
      `La producción liquidó el pedido: ${items.length === 1 ? "una unidad incorporada" : `${items.length} unidades incorporadas`} a su inventario.`,
    )

    const settled = await closeIfExhausted(tx, purchaseOrderId)

    return {
      purchaseOrder: single(await decorate(tx, [settled])),
      warehouseOrderId,
      quoteId: quote.id,
      shoppingId,
      amount: input.amount,
      items,
    }
  })
}

/**
 * Deja la orden liquidada cuando ya no le queda ningún pedido vivo.
 *
 * Sólo cuenta los que están abiertos: uno cancelado por el almacén no impide dar por cerrada la
 * orden cuyos demás pedidos se pagaron.
 */
async function closeIfExhausted(tx: Transaction, purchaseOrderId: string) {
  const [alive] = await tx
    .select({ value: count() })
    .from(warehouseOrders)
    .where(
      and(
        eq(warehouseOrders.purchaseOrderId, purchaseOrderId),
        notInArray(warehouseOrders.status, ["finished", "canceled"]),
        isNull(warehouseOrders.deletedAt),
      ),
    )

  const [row] = await tx
    .update(productionPurchaseOrders)
    .set({
      ...((alive?.value ?? 0) === 0 ? { status: "settled" as const } : {}),
      updatedAt: new Date(),
    })
    .where(eq(productionPurchaseOrders.id, purchaseOrderId))
    .returning()

  if (!row) throw new Error("la orden de compra no se actualizó al cerrar")
  return row
}

// ─── La tienda interna ───────────────────────────────────────────────────────

/**
 * El escaparate: los almacenes publicados, con su empresa.
 *
 * Lo que se enseña **no es el catálogo interno de nadie**: es el nombre y la descripción de un
 * almacén que su dueño decidió publicar, que es exactamente lo que ya sirve la tienda pública sin
 * pedir sesión.
 */
export async function listShopWarehouses(
  actor: Actor,
  companyId: string,
  productionId: string,
): Promise<readonly ShopWarehouseRecord[]> {
  await assertProduction(actor, companyId, productionId)

  const escaparate = await publishedWarehouses()
  const ajenos = escaparate.filter((row) => row.companyId !== companyId)
  if (ajenos.length === 0) return []

  const scope = [companyId, ...new Set(ajenos.map((row) => row.companyId))]

  return withSystem(SHOP, scope, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const rows = await tx
      .select({
        warehouseId: warehouses.id,
        companyId: warehouses.companyId,
        companyName: companies.name,
        name: warehouses.name,
        description: warehouses.description,
      })
      .from(warehouses)
      .innerJoin(companies, eq(companies.id, warehouses.companyId))
      .where(
        inArray(
          warehouses.id,
          ajenos.map((row) => row.warehouseId),
        ),
      )
      .orderBy(companies.name, warehouses.name)

    return rows
  })
}

/**
 * El catálogo publicado de un almacén del escaparate, con lo que queda libre de cada medida.
 *
 * Un almacén que no está en el escaparate responde `404`, igual que uno inexistente: la lista de
 * publicados es la única puerta, y pedirlo por su identificador no la esquiva.
 */
export async function listShopProducts(
  actor: Actor,
  companyId: string,
  productionId: string,
  warehouseId: string,
): Promise<readonly ShopProductRecord[]> {
  await assertProduction(actor, companyId, productionId)

  const escaparate = await publishedWarehouses()
  const target = escaparate.find(
    (row) => row.warehouseId === warehouseId && row.companyId !== companyId,
  )
  if (!target) throw new NotFoundError("El almacén no está disponible")

  return withSystem(SHOP, [companyId, target.companyId], async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const rows = await tx
      .select({
        productId: warehouseProducts.id,
        name: warehouseProducts.name,
        description: warehouseProducts.description,
        code: warehouseProducts.code,
        availableForSale: warehouseProducts.availableForSale,
        availableForRent: warehouseProducts.availableForRent,
        measurementId: warehouseMeasurements.id,
        measurementName: warehouseMeasurements.name,
        available: availableUnits(warehouseMeasurements.id),
      })
      .from(warehouseProducts)
      .innerJoin(
        warehouseMeasurements,
        and(
          eq(warehouseMeasurements.productId, warehouseProducts.id),
          isNull(warehouseMeasurements.deletedAt),
        ),
      )
      .where(
        and(
          eq(warehouseProducts.warehouseId, warehouseId),
          eq(warehouseProducts.isPublished, true),
          isNull(warehouseProducts.deletedAt),
        ),
      )
      .orderBy(warehouseProducts.name, warehouseMeasurements.name)

    const byProduct = new Map<
      string,
      ShopProductRecord & { measurements: ShopMeasurementRecord[] }
    >()
    for (const row of rows) {
      const existing = byProduct.get(row.productId)
      const measurement = {
        id: row.measurementId,
        name: row.measurementName,
        available: row.available,
      }

      if (existing) existing.measurements.push(measurement)
      else {
        byProduct.set(row.productId, {
          productId: row.productId,
          name: row.name,
          description: row.description,
          code: row.code,
          availableForSale: row.availableForSale,
          availableForRent: row.availableForRent,
          measurements: [measurement],
        })
      }
    }

    return [...byProduct.values()]
  })
}

/**
 * La producción es de esta empresa y quien pregunta la alcanza, **como solicitante**.
 *
 * Se hace antes de declarar ningún alcance de sistema, y por eso es una transacción aparte. El
 * guardián ya comprobó la membresía y la clave, pero lo que sigue corre con empresas ajenas
 * declaradas: la segunda capa tiene que decir que sí **antes** de que la primera se ensanche, no
 * después. Sin esto, un fallo de encaminamiento en la primera capa dejaría la segunda concedida.
 */
async function assertProduction(
  actor: Actor,
  companyId: string,
  productionId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
  })
}

// ─── Resolución del alcance ──────────────────────────────────────────────────

interface Source {
  readonly warehouseId: string
  readonly companyId: string
}

/**
 * De qué almacén y de qué empresa es cada medida.
 *
 * Con alcance vacío a propósito: lo que responde no sale de ninguna política sino de
 * `app.procurement_source`, que es `security definer` y comprueba la publicación por dentro. Es la
 * misma forma con la que la tienda pública resuelve su subdominio.
 */
async function resolveSources(measurementIds: readonly string[]): Promise<Map<string, Source>> {
  const unique = [...new Set(measurementIds)]
  if (unique.length === 0) return new Map()

  return withSystem(`${FAN_OUT}.resolver`, [], async (tx) => {
    const rows = await tx.execute<{
      measurement_id: string
      warehouse_id: string
      company_id: string
    }>(
      sql`select * from app.procurement_source(array[${sql.join(
        unique.map((id) => sql`${id}`),
        sql`, `,
      )}]::uuid[])`,
    )

    return new Map(
      rows.map((row) => [
        row.measurement_id,
        { warehouseId: row.warehouse_id, companyId: row.company_id },
      ]),
    )
  })
}

async function publishedWarehouses(): Promise<readonly Source[]> {
  return withSystem(`${SHOP}.resolver`, [], async (tx) => {
    const rows = await tx.execute<{ warehouse_id: string; company_id: string }>(
      sql`select * from app.published_warehouses()`,
    )
    return rows.map((row) => ({ warehouseId: row.warehouse_id, companyId: row.company_id }))
  })
}

/**
 * Las empresas que toca una orden de compra.
 *
 * Corre **como el solicitante** y no como sistema, y es la pieza que sostiene el aislamiento de
 * todo lo que viene después: `app.purchase_order_scope` comprueba por dentro que quien pregunta
 * alcanza la orden, y esa comprobación mira las membresías de quien está en la transacción. Como
 * sistema con alcance vacío respondería siempre el conjunto vacío; con alcance declarado sería
 * pedirle permiso a quien se lo estamos concediendo.
 */
async function purchaseOrderScope(
  actor: Actor,
  purchaseOrderId: string,
): Promise<readonly string[]> {
  const scope = await withRequester(actor, async (tx) => {
    const rows = await tx.execute<{ scope: string[] | null }>(
      sql`select app.purchase_order_scope(${purchaseOrderId}) as scope`,
    )
    return rows[0]?.scope ?? []
  })

  if (scope.length === 0) throw new NotFoundError("La orden de compra no existe")
  return scope
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/** Las unidades libres de una medida. Misma cuenta que la bandeja del almacén. */
function availableUnits(measurementId: unknown) {
  return sql<number>`(
    select count(*)::int from warehouse_stock_units u
     where u.measurement_id = ${measurementId}
       and u.status = 'available'
       and u.deleted_at is null
  )`
}

/**
 * La línea se puede pedir: el producto se ofrece en esa modalidad y tiene con qué surtirla.
 *
 * Las dos comprobaciones son de la tienda interna —«el catálogo SHALL respetar la disponibilidad y
 * la modalidad»— y se hacen aquí y no en el carrito porque el carrito vive en el navegador. Corren
 * con el almacén ya en el alcance, que es la primera vez que se pueden hacer.
 */
async function assertOfferable(
  tx: Transaction,
  line: PurchaseLineInput,
  type: TradeType,
): Promise<void> {
  const [row] = await tx
    .select({
      productName: warehouseProducts.name,
      availableForSale: warehouseProducts.availableForSale,
      availableForRent: warehouseProducts.availableForRent,
      available: availableUnits(warehouseMeasurements.id),
    })
    .from(warehouseMeasurements)
    .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
    .where(
      and(
        eq(warehouseMeasurements.id, line.measurementId),
        isNull(warehouseMeasurements.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new UnprocessableError("Uno de los productos pedidos ya no está en el catálogo")

  const offered = type === "rent" ? row.availableForRent : row.availableForSale
  if (!offered) {
    throw new UnprocessableError(
      `«${row.productName}» no se ofrece ${type === "rent" ? "en renta" : "en venta"}`,
    )
  }

  if (row.available < line.quantity) {
    throw new UnprocessableError(
      `«${row.productName}» no tiene ${line.quantity === 1 ? "una unidad libre" : `${line.quantity} unidades libres`}: ` +
        `quedan ${row.available}`,
    )
  }
}

/** El equipo apartado de una cotización, con lo que el artículo hereda de su producto. */
async function heldUnits(tx: Transaction, quoteId: string) {
  return tx
    .select({
      unitId: warehouseStockUnits.id,
      productId: warehouseProducts.id,
      productName: warehouseProducts.name,
      productDescription: warehouseProducts.description,
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

/** Las imágenes de cada producto, en su orden, para que el artículo las herede. */
async function imagesByProduct(
  tx: Transaction,
  productIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (productIds.length === 0) return new Map()

  const rows = await tx
    .select({
      productId: warehouseProductImages.productId,
      uploadId: warehouseProductImages.uploadId,
    })
    .from(warehouseProductImages)
    .where(inArray(warehouseProductImages.productId, [...productIds]))
    .orderBy(warehouseProductImages.position)

  const byProduct = new Map<string, string[]>()
  for (const row of rows) {
    const existing = byProduct.get(row.productId)
    if (existing) existing.push(row.uploadId)
    else byProduct.set(row.productId, [row.uploadId])
  }
  return byProduct
}

/** El proveedor de la producción que representa a la empresa del almacén. */
async function providerFor(
  tx: Transaction,
  companyId: string,
  warehouseCompanyId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(
      and(
        eq(counterparties.companyId, companyId),
        eq(counterparties.role, "provider"),
        eq(counterparties.counterpartyCompanyId, warehouseCompanyId),
        isNull(counterparties.deletedAt),
      ),
    )
    .limit(1)

  return row?.id ?? null
}

async function loadWarehouseInScope(tx: Transaction, warehouseId: string) {
  const [row] = await tx
    .select({
      id: warehouses.id,
      name: warehouses.name,
      companyId: warehouses.companyId,
      companyName: companies.name,
    })
    .from(warehouses)
    .innerJoin(companies, eq(companies.id, warehouses.companyId))
    .where(and(eq(warehouses.id, warehouseId), isNull(warehouses.deletedAt)))
    .limit(1)

  if (!row) throw new NotFoundError("El almacén no está disponible")
  return row
}

async function companyName(tx: Transaction, companyId: string): Promise<string> {
  const [row] = await tx
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!row) throw new NotFoundError("La empresa no existe")
  return row.name
}

/**
 * La categoría es de esta producción.
 *
 * Las claves foráneas se comprueban con los permisos del dueño de la tabla y **se saltan las
 * políticas de fila**, así que el motor aceptaría la de otra producción. Y aquí importa el doble,
 * porque bajo `withSystem` hay más de una empresa en el alcance.
 */
async function assertCategory(
  tx: Transaction,
  productionId: string,
  categoryId: string | null,
): Promise<void> {
  if (categoryId === null) return

  const [row] = await tx
    .select({ id: productionCategories.id })
    .from(productionCategories)
    .where(
      and(
        eq(productionCategories.id, categoryId),
        eq(productionCategories.productionId, productionId),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La categoría no existe en esta producción")
}

/** La dirección de entrega es de la empresa de la producción, no de la del almacén. */
async function assertAddress(
  tx: Transaction,
  companyId: string,
  addressId: string | null,
): Promise<void> {
  if (addressId === null) return

  const [row] = await tx
    .select({ id: companyAddresses.id })
    .from(companyAddresses)
    .where(and(eq(companyAddresses.id, addressId), eq(companyAddresses.companyId, companyId)))
    .limit(1)

  if (!row) throw new NotFoundError("La dirección de entrega no existe en esta empresa")
}

/** El responsable es miembro de la empresa de la producción. */
async function assertResponsible(
  tx: Transaction,
  companyId: string,
  responsibleId: string | null,
): Promise<void> {
  if (responsibleId === null) return

  const [row] = await tx
    .select({ id: companyMembers.id })
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, responsibleId)))
    .limit(1)

  if (!row) throw new NotFoundError("El responsable no es miembro de esta empresa")
}

export async function loadPurchaseOrder(
  tx: Transaction,
  productionId: string,
  purchaseOrderId: string,
) {
  const [row] = await tx
    .select()
    .from(productionPurchaseOrders)
    .where(
      and(
        eq(productionPurchaseOrders.id, purchaseOrderId),
        eq(productionPurchaseOrders.productionId, productionId),
        isNull(productionPurchaseOrders.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La orden de compra no existe")
  return row
}

/**
 * Añade a cada orden el resumen de sus pedidos.
 *
 * Dos consultas para todas las órdenes de la página, no dos por orden: un listado de veinte con la
 * consulta dentro del bucle son cuarenta viajes.
 */
async function decorate(
  tx: Transaction,
  rows: readonly (typeof productionPurchaseOrders.$inferSelect)[],
): Promise<PurchaseOrderRecord[]> {
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)

  const shipments = await tx
    .select({
      id: warehouseOrders.id,
      purchaseOrderId: warehouseOrders.purchaseOrderId,
      warehouseId: warehouseOrders.warehouseId,
      code: warehouseOrders.code,
      status: warehouseOrders.status,
      quoteId: warehouseOrders.quoteId,
      cancelReason: warehouseOrders.cancelReason,
    })
    .from(warehouseOrders)
    .where(and(inArray(warehouseOrders.purchaseOrderId, ids), isNull(warehouseOrders.deletedAt)))
    .orderBy(warehouseOrders.createdAt)

  const counted = await tx
    .select({
      warehouseOrderId: productionPurchaseOrderLines.warehouseOrderId,
      value: count(),
    })
    .from(productionPurchaseOrderLines)
    .where(inArray(productionPurchaseOrderLines.purchaseOrderId, ids))
    .groupBy(productionPurchaseOrderLines.warehouseOrderId)

  const lines = new Map(counted.map((row) => [row.warehouseOrderId ?? "", row.value]))

  const byOrder = new Map<string, PurchaseShipmentRecord[]>()
  for (const shipment of shipments) {
    const key = shipment.purchaseOrderId ?? ""
    const record: PurchaseShipmentRecord = {
      id: shipment.id,
      warehouseId: shipment.warehouseId,
      code: shipment.code,
      status: shipment.status,
      quoteId: shipment.quoteId,
      lines: lines.get(shipment.id) ?? 0,
      cancelReason: shipment.cancelReason,
    }
    const bucket = byOrder.get(key)
    if (bucket) bucket.push(record)
    else byOrder.set(key, [record])
  }

  return rows.map((row) => ({
    id: row.id,
    productionId: row.productionId,
    code: row.code,
    name: row.name,
    type: row.type as TradeType,
    status: row.status,
    categoryId: row.categoryId,
    deliveryAddressId: row.deliveryAddressId,
    responsibleId: row.responsibleId,
    canceledAt: row.canceledAt,
    cancelReason: row.cancelReason,
    orders: byOrder.get(row.id) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

function single(records: readonly PurchaseOrderRecord[]): PurchaseOrderRecord {
  const [record] = records
  if (!record) throw new Error("la orden de compra no se pudo componer")
  return record
}

/** Mismo alfabeto que el resto de códigos: sin caracteres que se confundan al dictarlos. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/**
 * El código de una orden de compra. **Se escribe una vez y nadie vuelve a tocarlo.**
 *
 * Aleatorio y no derivado del identificador: los identificadores llevan el instante en los bits
 * altos, así que dos órdenes creadas en el mismo milisegundo compartirían prefijo — y el prefijo es
 * justo lo que cabría en un código corto.
 */
function purchaseOrderCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return `OC-${Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("")}`
}

/** El del pedido que abre el abanico, con la misma forma que el que crea el almacén a mano. */
function warehouseOrderCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return `PED-${Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("")}`
}
