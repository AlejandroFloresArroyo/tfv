/**
 * Seguimiento de la entrega.
 *
 * Ver `openspec/specs/order-fulfillment/spec.md`, requisitos «Registro del envío» y «El comprador
 * consulta sus pedidos». Rebanada 17.
 *
 * El envío lo **crea** la materialización del pedido, que es la rebanada 18. Lo que vive aquí es lo
 * que le pasa después: quién lo despacha, cuándo sale, cuándo llega. Sin esto, un pedido de almacén
 * pagado se queda en «pendiente» para siempre y el comprador no tiene qué consultar.
 *
 * ## Por qué corre por la vía de usuario
 *
 * La `0005` dejó la escritura de `shipments` sólo para el sistema, porque entonces lo único que le
 * ocurría a un envío era nacer. Mover el estado es una operación de quien despacha —con su sesión y
 * su permiso—, así que la `0020` amplía la política a la empresa dueña del pedido y el manejador
 * usa `withRequester`. Hacerlo al revés —correr como sistema para esquivar la política— habría
 * dejado el aislamiento en una sola capa, y la spec exige dos.
 *
 * ## Por qué toda operación nombra la empresa
 *
 * La política acota a **las empresas del solicitante**, en plural: quien pertenece a dos las ve las
 * dos. El permiso, en cambio, se resuelve contra la empresa del camino. Sin filtrar por ella, quien
 * tuviera el permiso en la empresa A podría mover un envío de la B nombrando A en la ruta — que es
 * el defecto S-06 con otra cara. El envío se alcanza **a través de su pedido**, y el pedido lleva
 * su empresa.
 */

import {
  allowedShipmentTransitions,
  ConflictError,
  NotFoundError,
  type ShipmentStatus,
  shipmentIsDelivered,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import { buyerOrders, shipments } from "@tfv/db/schema"
import { and, eq } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"

export interface ShipmentRecord {
  readonly id: string
  readonly orderId: string
  readonly orderReference: string
  readonly mode: string
  readonly cost: string
  readonly status: ShipmentStatus
  readonly carrier: string
  readonly trackingNumber: string | null
  readonly estimatedDeliveryAt: Date | null
  readonly deliveredAt: Date | null
  readonly notes: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  /** Lo que se puede hacer desde donde está. La pantalla ofrece esto y nada más. */
  readonly allowedTransitions: readonly ShipmentStatus[]
}

export interface ShipmentUpdate {
  readonly carrier?: string | undefined
  readonly trackingNumber?: string | null | undefined
  readonly estimatedDeliveryAt?: Date | null | undefined
  readonly notes?: string | null | undefined
}

type Row = typeof shipments.$inferSelect

function toRecord(row: Row, orderId: string, orderReference: string): ShipmentRecord {
  return {
    id: row.id,
    orderId,
    orderReference,
    mode: row.mode,
    cost: row.cost,
    status: row.status,
    carrier: row.carrier,
    trackingNumber: row.trackingNumber,
    estimatedDeliveryAt: row.estimatedDeliveryAt,
    deliveredAt: row.deliveredAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    allowedTransitions: allowedShipmentTransitions(row.status),
  }
}

/**
 * Carga el envío de una empresa, o no lo hay.
 *
 * Un envío de otra empresa **no se distingue de uno que no existe**: la unión con su pedido no
 * encuentra fila y la respuesta es `404`. Ver `access-control`: un `403` confirmaría que existe.
 */
async function load(tx: Transaction, companyId: string, shipmentId: string) {
  const [row] = await tx
    .select({
      shipment: shipments,
      orderId: buyerOrders.id,
      orderReference: buyerOrders.reference,
    })
    .from(shipments)
    .innerJoin(buyerOrders, eq(buyerOrders.shipmentId, shipments.id))
    .where(and(eq(shipments.id, shipmentId), eq(buyerOrders.companyId, companyId)))

  if (!row) throw new NotFoundError("No se encontró el envío", { shipmentId })
  return row
}

/** El envío de un pedido, con lo que se puede hacer con él. */
export async function getShipment(
  actor: Actor,
  companyId: string,
  shipmentId: string,
): Promise<ShipmentRecord> {
  return withRequester(actor, async (tx) => {
    const row = await load(tx, companyId, shipmentId)
    return toRecord(row.shipment, row.orderId, row.orderReference)
  })
}

/**
 * Cambia el estado de un envío.
 *
 * Rechaza con `409` lo que la máquina no prevé, en lugar de aceptarlo y dejar el seguimiento
 * diciendo algo que no ocurrió. La transición válida se pregunta a `@tfv/contracts`, que es la
 * misma lista con la que la pantalla decide qué botones enseña.
 */
export async function changeShipmentStatus(
  actor: Actor,
  companyId: string,
  shipmentId: string,
  next: ShipmentStatus,
): Promise<ShipmentRecord> {
  return withRequester(actor, async (tx) => {
    const row = await load(tx, companyId, shipmentId)
    const current = row.shipment.status

    if (!allowedShipmentTransitions(current).includes(next)) {
      throw new ConflictError(`Un envío en «${current}» no puede pasar a «${next}»`, {
        shipmentId,
        from: current,
        to: next,
      })
    }

    // La fecha de entrega la pone el sistema al entregar, no quien llama: es el registro de cuándo
    // ocurrió, y aceptarla del cuerpo permitiría fecharla cuando conviniera.
    const [updated] = await tx
      .update(shipments)
      .set({
        status: next,
        ...(shipmentIsDelivered(next) ? { deliveredAt: new Date() } : {}),
      })
      .where(eq(shipments.id, shipmentId))
      .returning()

    return toRecord(updated as Row, row.orderId, row.orderReference)
  })
}

/** Datos del transporte: paquetería, guía, fecha estimada y notas. */
export async function updateShipment(
  actor: Actor,
  companyId: string,
  shipmentId: string,
  input: ShipmentUpdate,
): Promise<ShipmentRecord> {
  return withRequester(actor, async (tx) => {
    const row = await load(tx, companyId, shipmentId)

    const [updated] = await tx
      .update(shipments)
      .set({
        ...(input.carrier === undefined ? {} : { carrier: input.carrier }),
        ...(input.trackingNumber === undefined ? {} : { trackingNumber: input.trackingNumber }),
        ...(input.estimatedDeliveryAt === undefined
          ? {}
          : { estimatedDeliveryAt: input.estimatedDeliveryAt }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      })
      .where(eq(shipments.id, shipmentId))
      .returning()

    return toRecord(updated as Row, row.orderId, row.orderReference)
  })
}
