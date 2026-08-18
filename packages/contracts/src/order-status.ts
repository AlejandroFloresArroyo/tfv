/**
 * El ciclo de vida de un pedido de almacén.
 *
 * Ver `openspec/specs/warehouse-orders/spec.md`. Rebanada 15.
 *
 * Vive aquí por lo mismo que la máquina de la cotización: el servidor rechaza con `409` lo que no
 * está previsto y la bandeja tiene que ofrecer sólo lo que se puede hacer. Con dos copias, el día
 * que una cambie la pantalla ofrecerá un botón que responde error.
 */

export const ORDER_STATUSES = ["pending", "accepted", "delivered", "finished", "canceled"] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** De dónde vino el pedido. Condiciona si nace pendiente o ya resuelto. */
export const ORDER_ORIGINS = ["production", "storefront"] as const
export type OrderOrigin = (typeof ORDER_ORIGINS)[number]

/**
 * Estados cerrados: el pedido terminó, con efecto o sin él.
 *
 * De aquí no se sale. Reabrir un finalizado sería volver a comprometer equipo que ya salió y
 * volvió; reabrir un cancelado, resucitar un trato que la otra empresa ya dio por muerto.
 */
const CLOSED: readonly OrderStatus[] = ["finished", "canceled"]

/**
 * Las transiciones previstas. Lo que no está aquí responde `409`.
 *
 * Hacia atrás no se vuelve, ni siquiera entre estados abiertos: cada paso adelante **movió
 * inventario** —aceptar lo aparta, entregar lo saca— y deshacerlo con un cambio de estado dejaría
 * el almacén diciendo una cosa y la nave otra. Lo que se hace es cancelar, que sí lo libera.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending: ["accepted", "canceled"],
  accepted: ["delivered", "canceled"],
  delivered: ["finished", "canceled"],
  finished: [],
  canceled: [],
}

export function isOrderClosed(status: OrderStatus): boolean {
  return CLOSED.includes(status)
}

/** A dónde puede ir un pedido desde donde está. */
export function allowedOrderTransitions(status: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[status]
}
