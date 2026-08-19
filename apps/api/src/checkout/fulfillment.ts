/**
 * Lo que ocurre cuando se confirma el cobro de una compra: **ocho entidades de golpe**.
 *
 * Ver `openspec/specs/order-fulfillment/spec.md`. Rebanada 18, y corrige `DEFECTS.md` M-01, M-02
 * y M-03 —los tres defectos más caros del levantamiento, y los tres viven aquí—.
 *
 * | Se crea | Para quién |
 * |---|---|
 * | Pago | Registro del cobro, con su desglose |
 * | Envío | Seguimiento del transporte |
 * | Pedido de comprador | El comprobante que el comprador puede citar |
 * | Líneas del pedido | El detalle de lo comprado |
 * | Cliente | Alta del comprador en la cartera del comercio |
 * | Cobro del comercio | La entrada en su libro de ingresos |
 * | Pedido operativo | La orden de trabajo del almacén |
 * | Movimientos de inventario | Las unidades pasan a vendidas o rentadas |
 *
 * ## Una transacción, y la marca al final
 *
 * «La marca que garantiza la unicidad SHALL confirmarse **junto con** el resto del trabajo, no
 * antes.» La pila anterior ponía `fulfilled_at` **antes** de hacer nada, así que un fallo posterior
 * dejaba una compra marcada como resuelta y sin pedido, que ningún reintento reparaba (M-03). Aquí
 * es la última escritura de la transacción: o está la marca y están las ocho entidades, o no está
 * ninguna de las nueve cosas.
 *
 * ## Por qué esto abre su propia transacción y no usa la del evento
 *
 * El receptor de webhooks corre por la **vía elevada** —tiene que escribir `payment_events`, cuya
 * política es `false` para todo el mundo salvo la administración de plataforma—, y elevada significa
 * *sin políticas*. Materializar ahí dentro sería renunciar a la segunda capa de aislamiento en la
 * operación que más escribe de todo el sistema.
 *
 * Así que la materialización abre la suya, con la **empresa vendedora declarada**, y las políticas
 * siguen puestas sobre las ocho tablas. Lo que se pierde es que la reclamación del evento y el
 * trabajo dejen de ser la misma transacción; lo que no se pierde es la ejecución única, porque no
 * dependía de eso:
 *
 * - si la materialización falla, lanza, y el receptor revierte también la reclamación → el
 *   procesador reintenta y se vuelve a intentar entera;
 * - si la materialización cuaja y la reclamación no, el reintento encuentra `fulfilled_at` puesta y
 *   **no duplica nada**.
 *
 * Las dos barreras que la rebanada 07 describe siguen siendo dos, y ahora cada una hace su trabajo
 * en el sitio donde sirve: la unicidad del evento contra la doble entrega, la marca contra el doble
 * cobro con eventos distintos.
 */

import { formatMoney, money, newId, subtract, UnprocessableError } from "@tfv/contracts"
import type { Transaction } from "@tfv/db"
import { withElevated, withSystem } from "@tfv/db"
import {
  buyerOrderLines,
  buyerOrders,
  checkouts,
  counterparties,
  merchantPayments,
  payments,
  shipments,
  users,
  warehouseOrderLines,
  warehouseOrders,
  websites,
} from "@tfv/db/schema"
import { and, eq, isNull, sql } from "drizzle-orm"
import { audienceFor, enqueueInbox } from "../activity/delivery.ts"
import { rootLogger } from "../runtime/logger.ts"
import { settleCheckout } from "./reservations.ts"

const OPERATION = "tienda_publica.materializacion"

/** Lo que el procesador cuenta del cobro. Todo lo demás sale de la instantánea. */
export interface ConfirmedPayment {
  readonly externalPaymentIntentId?: string | undefined
  readonly externalChargeId?: string | undefined
  readonly method?: string | undefined
  readonly receiptUrl?: string | undefined
}

export interface FulfillmentResult {
  readonly kind: "materializado" | "ya_materializado" | "sin_compra"
  readonly orderId?: string | undefined
  readonly reference?: string | undefined
}

/**
 * Materializa una compra cobrada.
 *
 * **Todo sale de la instantánea**, no del catálogo: «un cambio posterior en el catálogo no altera lo
 * comprado». El catálogo sólo se vuelve a tocar para mover las unidades que ya estaban apartadas.
 */
export async function fulfillCheckout(
  checkoutId: string,
  payment: ConfirmedPayment,
): Promise<FulfillmentResult> {
  const companyId = await companyOfCheckout(checkoutId)
  if (!companyId) {
    // Un cobro de una compra que aquí no existe —de otro entorno, de una prueba del procesador— no
    // es un fallo: tratarlo como tal provocaría reintentos eternos.
    return { kind: "sin_compra" }
  }

  return withSystem(OPERATION, [companyId], async (tx) => {
    /**
     * La compra, **con la fila bloqueada**.
     *
     * Dos eventos distintos del procesador pueden nombrar la misma sesión de pago —un
     * `payment_intent.succeeded` y un reproceso manual, por ejemplo—, y la unicidad del evento no
     * los detiene porque sus identificadores son distintos. Lo que los detiene es esto: el segundo
     * espera al primero y, cuando entra, encuentra la marca puesta.
     */
    const [checkout] = await tx
      .select()
      .from(checkouts)
      .where(eq(checkouts.id, checkoutId))
      .for("update")
      .limit(1)

    if (!checkout) return { kind: "sin_compra" }

    if (checkout.fulfilledAt !== null) {
      const [existing] = await tx
        .select({ id: buyerOrders.id, reference: buyerOrders.reference })
        .from(buyerOrders)
        .where(eq(buyerOrders.checkoutId, checkoutId))
        .limit(1)

      return { kind: "ya_materializado", orderId: existing?.id, reference: existing?.reference }
    }

    if (checkout.status === "canceled" || checkout.status === "expired") {
      // Cobrar algo que ya se soltó no se arregla materializándolo: el inventario volvió al
      // catálogo y puede estar vendido a otro. Se detiene, queda constancia, y lo resuelve una
      // persona con un reembolso.
      throw new UnprocessableError(
        `Llegó un cobro de una compra ${checkout.status === "canceled" ? "cancelada" : "caducada"}`,
        { checkoutId },
      )
    }

    const type = checkout.type === "rent" ? "rent" : "sale"

    // ── 1 · El pago, con su desglose ────────────────────────────────────────
    const paymentId = newId()
    await tx.insert(payments).values({
      id: paymentId,
      checkoutId,
      buyerId: checkout.buyerId,
      grossAmount: checkout.total,
      platformFee: checkout.platformFee,
      platformFeeRate: checkout.platformFeeRate,
      // Lo que se transfiere al comercio: el subtotal menos la comisión. El envío **no entra**: lo
      // paga el comprador y se queda en la plataforma, tal y como lo escribe la fórmula de la spec.
      // Ver `HALLAZGOS.md` H-106.
      netAmount: netOf(checkout),
      currency: checkout.currency,
      status: "succeeded",
      ...(payment.method === undefined ? {} : { method: payment.method }),
      ...(payment.externalPaymentIntentId === undefined
        ? {}
        : { externalPaymentIntentId: payment.externalPaymentIntentId }),
      ...(payment.externalChargeId === undefined
        ? {}
        : { externalChargeId: payment.externalChargeId }),
      ...(payment.receiptUrl === undefined ? {} : { receiptUrl: payment.receiptUrl }),
    })

    // ── 2 · El envío ────────────────────────────────────────────────────────
    const shipmentId = newId()
    await tx.insert(shipments).values({
      id: shipmentId,
      mode: checkout.shippingMode,
      cost: checkout.shippingCost,
      status: "pending",
      estimatedDeliveryAt: estimatedDelivery(checkout.shippingMode),
      fromAddressId: checkout.shipFromAddressId,
      // «Una compra con recolección en tienda SHALL registrar el envío como recolección, sin
      // domicilio de destino».
      toAddressId: checkout.shippingMode === "pickup" ? null : checkout.shipToAddressId,
    })

    // ── 3 y 4 · El pedido del comprador y sus líneas ────────────────────────
    const orderId = newId()
    const reference = orderReference()

    await tx.insert(buyerOrders).values({
      id: orderId,
      checkoutId,
      buyerId: checkout.buyerId,
      companyId: checkout.companyId,
      paymentId,
      shipmentId,
      reference,
      type: checkout.type,
      status: "paid",
      subtotal: checkout.subtotal,
      shippingCost: checkout.shippingCost,
      platformFee: checkout.platformFee,
      // «El total del pedido SHALL ser el importe que el comprador pagó». La pila anterior lo fijaba
      // igual al subtotal e ignoraba el envío, así que el comprobante no cuadraba con el cargo
      // (`DEFECTS.md` M-01).
      total: checkout.total,
      currency: checkout.currency,
    })

    if (checkout.lines.length > 0) {
      await tx.insert(buyerOrderLines).values(
        checkout.lines.map((line, index) => ({
          id: newId(),
          orderId,
          line,
          position: index,
        })),
      )
    }

    // ── 5 · El comprador pasa a ser cliente del comercio ────────────────────
    await registerBuyerAsClient(tx, checkout.companyId, checkout.buyerId)

    // ── 6 · La entrada en el libro de ingresos ──────────────────────────────
    await tx.insert(merchantPayments).values({
      id: newId(),
      companyId: checkout.companyId,
      merchantProfileId: checkout.merchantProfileId,
      buyerId: checkout.buyerId,
      grossAmount: checkout.total,
      platformFee: checkout.platformFee,
      platformFeeRate: checkout.platformFeeRate,
      netAmount: netOf(checkout),
      currency: checkout.currency,
      // El libro de ingresos llama «pagado» a lo que el registro del pago llama «cobrado»: son dos
      // enumerados distintos del mismo hecho, y el que manda en cada tabla es el suyo.
      status: "paid",
      ...(payment.externalPaymentIntentId === undefined
        ? {}
        : { externalPaymentIntentId: payment.externalPaymentIntentId }),
      ...(payment.receiptUrl === undefined ? {} : { receiptUrl: payment.receiptUrl }),
    })

    // ── 7 · El pedido operativo del almacén ─────────────────────────────────
    await createWarehouseOrder(tx, checkout, orderId, reference)

    // ── 8 · Las unidades pasan al estado de la modalidad ────────────────────
    await settleCheckout(tx, checkoutId, type, checkout.buyerId)

    await notifyWarehouse(tx, checkout.companyId, reference, checkout.total)

    // Y **al final**, la marca. Nunca antes: es el orden que arruina todo lo demás si se equivoca.
    await tx
      .update(checkouts)
      .set({ status: "completed", fulfilledAt: new Date() })
      .where(eq(checkouts.id, checkoutId))

    return { kind: "materializado", orderId, reference }
  })
}

/**
 * Lo que recibe el comercio: subtotal menos comisión.
 *
 * Escrito una vez porque lo escriben dos filas —el pago y el asiento del libro de ingresos— y dos
 * cálculos del mismo importe acaban discrepando en el céntimo del redondeo, que es exactamente el
 * tipo de descuadre que nadie encuentra.
 */
function netOf(checkout: typeof checkouts.$inferSelect): string {
  return formatMoney(subtract(money(checkout.subtotal), money(checkout.platformFee)))
}

/**
 * De qué empresa es la compra.
 *
 * Por la vía elevada y a propósito: **la empresa es justo lo que se está averiguando**, así que no
 * hay alcance que declarar todavía. Es una sola lectura de una sola columna, y lleva su motivo
 * escrito. Todo lo que escribe después sí declara su alcance.
 */
async function companyOfCheckout(checkoutId: string): Promise<string | null> {
  const [row] = await withElevated(
    "averiguar de qué empresa es la compra que se acaba de cobrar",
    async (tx) =>
      tx
        .select({ companyId: checkouts.companyId })
        .from(checkouts)
        .where(eq(checkouts.id, checkoutId))
        .limit(1),
  )

  return row?.companyId ?? null
}

/**
 * Da de alta al comprador como cliente de la empresa, si no lo era ya.
 *
 * «El sistema SHALL registrar al comprador como cliente de la empresa vendedora si aún no lo era.»
 * La idempotencia la garantiza el índice único parcial de contrapartes, no una comprobación previa:
 * la segunda compra reutiliza la contraparte sin tocarla. Es la misma forma que `provisionBuyer`, y
 * está aquí escrito sobre la transacción que llama porque tiene que revertirse con ella.
 */
async function registerBuyerAsClient(
  tx: Transaction,
  companyId: string,
  buyerId: string,
): Promise<void> {
  const [buyer] = await tx
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, buyerId))
    .limit(1)

  await tx
    .insert(counterparties)
    .values({
      id: newId(),
      companyId,
      role: "client",
      alias: buyer?.name ?? "Comprador",
      userId: buyerId,
      snapshot: buyer?.email ? { email: buyer.email } : {},
    })
    .onConflictDoNothing()
}

/**
 * El pedido de trabajo del almacén, **ya finalizado**.
 *
 * «Una compra en tienda de almacén SHALL generar un pedido de almacén ya finalizado, con sus líneas
 * y las unidades concretas que se apartaron.» Nace finalizado porque no hay nada que aceptar: el
 * equipo ya está apartado y ya está cobrado. Un pedido pendiente en la bandeja del operador diría
 * que alguien tiene que decidir algo, y no lo hay.
 *
 * Las unidades concretas no se copian aquí: las sostiene la reserva, que sigue apuntando a la compra
 * y de la compra cuelga este pedido. Copiarlas sería un segundo censo del mismo hecho, y el día que
 * los dos difieran no habría forma de saber cuál miente.
 */
async function createWarehouseOrder(
  tx: Transaction,
  checkout: typeof checkouts.$inferSelect,
  buyerOrderId: string,
  reference: string,
): Promise<void> {
  const [site] = await tx
    .select({ warehouseId: websites.warehouseId, name: websites.name })
    .from(websites)
    .where(eq(websites.id, checkout.websiteId))
    .limit(1)

  if (!site?.warehouseId) {
    throw new UnprocessableError("La tienda de esta compra ya no tiene almacén que la sirva", {
      checkoutId: checkout.id,
    })
  }

  const [client] = await tx
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(
      and(
        eq(counterparties.companyId, checkout.companyId),
        eq(counterparties.userId, checkout.buyerId),
        eq(counterparties.role, "client"),
        isNull(counterparties.deletedAt),
      ),
    )
    .limit(1)

  const orderId = newId()
  await tx.insert(warehouseOrders).values({
    id: orderId,
    warehouseId: site.warehouseId,
    code: `PED-${reference}`,
    name: `Compra en ${site.name}`,
    origin: "storefront",
    type: checkout.type === "rent" ? "rent" : "sale",
    status: "finished",
    buyerOrderId,
    clientId: client?.id ?? null,
  })

  const lines = checkout.lines.filter((line) => line.kind === "warehouse_measurement")
  if (lines.length > 0) {
    await tx.insert(warehouseOrderLines).values(
      lines.map((line, index) => ({
        id: newId(),
        orderId,
        measurementId: line.refId,
        quantity: line.quantity,
        position: index,
      })),
    )
  }
}

/**
 * Cuándo se estima que llegue.
 *
 * La spec exige que el envío tenga fecha estimada y **no dice de dónde sale**: hoy no hay
 * integración con paquetería que la declare. Se deriva de la modalidad, que es lo único que se sabe,
 * y queda señalado aquí para que quien conecte la paquetería sepa qué está sustituyendo. La
 * recolección es el mismo día: el paquete no viaja.
 */
function estimatedDelivery(mode: string): Date {
  const days = mode === "pickup" ? 0 : mode === "local" ? 2 : mode === "national" ? 5 : 12
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date
}

/** Mismo alfabeto que el resto de códigos: sin caracteres que se confundan al dictarlos. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/**
 * La referencia legible que el comprador puede citar.
 *
 * Aleatoria y no derivada del identificador, por lo mismo que el código de un pedido de almacén: los
 * identificadores llevan el instante en los bits altos, así que dos compras del mismo milisegundo
 * compartirían prefijo — y el prefijo es justo lo que cabe en una referencia corta.
 */
function orderReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("")
}

/** A quien despacha: hay un pedido pagado esperando en la nave. */
async function notifyWarehouse(
  tx: Transaction,
  companyId: string,
  reference: string,
  total: string,
): Promise<void> {
  const audience = await audienceFor(tx, {
    companyId,
    permissions: ["warehouses.orders.view"],
  })

  await enqueueInbox(tx, {
    recipients: audience,
    kind: "storefront_order",
    payload: {
      title: `Compra ${reference}`,
      body: `Una compra de la tienda pública quedó pagada por ${total}`,
      url: `/${companyId}/orders`,
      reference,
    },
  })
}

// ─── Devoluciones y contracargos ─────────────────────────────────────────────

/**
 * El cobro se devolvió, entero o en parte.
 *
 * El pedido pasa a devuelto **sólo cuando la devolución es total**: una parcial es un ajuste, y
 * marcar el pedido entero como devuelto por haber reembolsado el envío diría que el cliente se
 * quedó sin nada.
 *
 * **El inventario no vuelve solo.** Devolver el dinero no devuelve el equipo: la cámara está en casa
 * del cliente hasta que alguien la recibe y lo registra. Devolverla al catálogo aquí sería acuñar
 * disponibilidad que no existe, que es el mismo error que la pila anterior cometía al completar una
 * renta.
 */
export async function applyRefund(
  externalPaymentIntentId: string,
  refundedAmount: string,
  isFull: boolean,
): Promise<boolean> {
  return updatePaymentByIntent(externalPaymentIntentId, async (tx, row) => {
    await tx
      .update(payments)
      .set({
        refundedAmount,
        refundedAt: new Date(),
        status: isFull ? "refunded" : row.status,
      })
      .where(eq(payments.id, row.id))

    await tx
      .update(merchantPayments)
      .set({ status: isFull ? "refunded" : "paid" })
      .where(eq(merchantPayments.externalPaymentIntentId, externalPaymentIntentId))

    if (isFull && row.checkoutId) {
      await tx
        .update(buyerOrders)
        .set({ status: "refunded" })
        .where(eq(buyerOrders.checkoutId, row.checkoutId))
    }
  })
}

/** Se abrió o se cerró un contracargo. Queda anotado en el pago, que es donde se concilia. */
export async function applyDispute(
  externalPaymentIntentId: string,
  opened: boolean,
): Promise<boolean> {
  return updatePaymentByIntent(externalPaymentIntentId, async (tx, row) => {
    await tx
      .update(payments)
      .set(
        opened
          ? { status: "disputed", disputedAt: new Date() }
          : // Cerrado no significa perdido: el desenlace lo cuenta el importe reembolsado, que llega
            // por su propio evento. Aquí sólo deja de estar en disputa.
            { status: row.refundedAt ? "refunded" : "succeeded" },
      )
      .where(eq(payments.id, row.id))

    await tx
      .update(merchantPayments)
      .set({ status: opened ? "disputed" : "paid" })
      .where(eq(merchantPayments.externalPaymentIntentId, externalPaymentIntentId))
  })
}

/**
 * Encuentra el pago por su referencia del procesador y le aplica un cambio, con su alcance.
 *
 * La búsqueda es elevada por lo mismo que la de la compra —hay que averiguar la empresa antes de
 * poder declararla— y la escritura corre con la empresa puesta.
 */
async function updatePaymentByIntent(
  externalPaymentIntentId: string,
  work: (
    tx: Transaction,
    row: {
      id: string
      checkoutId: string | null
      status: (typeof payments.$inferSelect)["status"]
      refundedAt: Date | null
    },
  ) => Promise<void>,
): Promise<boolean> {
  const [row] = await withElevated(
    "localizar el cobro que el procesador acaba de mover",
    async (tx) =>
      tx
        .select({
          id: payments.id,
          checkoutId: payments.checkoutId,
          status: payments.status,
          refundedAt: payments.refundedAt,
          companyId: checkouts.companyId,
        })
        .from(payments)
        .leftJoin(checkouts, eq(checkouts.id, payments.checkoutId))
        .where(eq(payments.externalPaymentIntentId, externalPaymentIntentId))
        .limit(1),
  )

  if (!row?.companyId) {
    rootLogger.info("movimiento de un cobro que aquí no existe", { externalPaymentIntentId })
    return false
  }

  await withSystem(`${OPERATION}.movimiento`, [row.companyId], async (tx) => {
    await work(tx, row)
  })

  return true
}

/**
 * Localiza la compra que un cobro nombra, cuando el evento no trae metadatos.
 *
 * Un reintento lanzado a mano desde el panel del procesador llega sin ellos, y sin esto no habría
 * forma de saber qué compra estaba pagando.
 */
export async function checkoutOfSession(sessionId: string): Promise<string | null> {
  const [row] = await withElevated(
    "localizar la compra a la que pertenece una sesión de pago",
    async (tx) =>
      tx
        .select({ id: checkouts.id })
        .from(checkouts)
        .where(
          sql`${checkouts.externalSessionId} = ${sessionId} or ${checkouts.id}::text = ${sessionId}`,
        )
        .limit(1),
  )

  return row?.id ?? null
}

/**
 * Deja constancia de lo que no se pudo materializar.
 *
 * «SHALL registrar la incidencia con el detalle suficiente para diagnosticarla»: qué compra, qué
 * cobro y qué falló. No se escribe en ninguna tabla porque la transacción que habría escrito la
 * incidencia es la que se acaba de revertir; el registro del servicio sobrevive al `rollback`, que
 * es justamente su gracia.
 */
export function reportFailure(checkoutId: string, event: string, error: unknown): void {
  rootLogger.error("la materialización de una compra falló y se revirtió entera", {
    checkoutId,
    evento: event,
    causa: error instanceof Error ? error.message : String(error),
  })
}
