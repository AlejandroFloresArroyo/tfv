/**
 * El ciclo de vida de un envío.
 *
 * Ver `openspec/specs/order-fulfillment/spec.md`, requisito «Registro del envío». Rebanada 17.
 *
 * Vive aquí por lo mismo que la máquina del pedido de almacén (`order-status.ts`): el servidor
 * rechaza con `409` lo que no está previsto y la pantalla de seguimiento tiene que ofrecer sólo lo
 * que se puede hacer. Con dos copias, el día que una cambie la interfaz enseñará un botón que
 * responde error.
 */

export const SHIPMENT_STATUSES = [
  "pending",
  "shipped",
  "in_transit",
  "delivered",
  "returned",
  "canceled",
] as const

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

/**
 * Estados cerrados: el envío terminó, con efecto o sin él.
 *
 * De aquí no se sale. Una devolución posterior a la entrega **no es un estado del envío**: es un
 * reembolso del pedido, y vive en el estado del pedido de comprador. Reabrir un envío entregado
 * para representarla haría que «entregado» dejara de significar que llegó.
 */
const CLOSED: readonly ShipmentStatus[] = ["delivered", "returned", "canceled"]

/**
 * Las transiciones previstas. Lo que no está aquí responde `409`.
 *
 * **Se cancela mientras está pendiente, y no después.** Una vez entregado a la paquetería el
 * paquete está fuera de la nave: o llega, o vuelve. Marcarlo cancelado diría que nunca salió, y el
 * bulto seguiría existiendo en un camión.
 *
 * **De pendiente se puede entregar directamente**, sin pasar por la paquetería: es el camino de la
 * recolección en tienda —que no se transporta— y el de la entrega en mano el mismo día.
 */
export const SHIPMENT_TRANSITIONS: Readonly<Record<ShipmentStatus, readonly ShipmentStatus[]>> = {
  pending: ["shipped", "delivered", "canceled"],
  shipped: ["in_transit", "delivered", "returned"],
  in_transit: ["delivered", "returned"],
  delivered: [],
  returned: [],
  canceled: [],
}

export function isShipmentClosed(status: ShipmentStatus): boolean {
  return CLOSED.includes(status)
}

/** A dónde puede ir un envío desde donde está. */
export function allowedShipmentTransitions(status: ShipmentStatus): readonly ShipmentStatus[] {
  return SHIPMENT_TRANSITIONS[status]
}

/**
 * El envío llegó a su destino.
 *
 * De los tres estados cerrados, es el único que cierra el ciclo **con efecto**: es el que marca la
 * fecha de entrega y el que permite dar por completado el pedido del comprador.
 */
export function shipmentIsDelivered(status: ShipmentStatus): boolean {
  return status === "delivered"
}
