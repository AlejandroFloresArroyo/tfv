/**
 * La máquina de estados del documento comercial.
 *
 * Ver `openspec/specs/quotations/spec.md`. Rebanada 13.
 *
 * Está aquí, y no en el servidor, porque **las dos partes la necesitan**: el servidor rechaza con
 * `409` lo que no está previsto, y la interfaz tiene que ofrecer sólo lo que se puede hacer. Con
 * dos copias, el día que una cambie la pantalla ofrecerá un botón que responde error, que es la
 * peor manera de enterarse de una regla.
 *
 * La autoridad sigue siendo el servidor: aquí no se comprueba nada al guardar. Lo que se comparte
 * es **el mapa**, para que quien lo enseña y quien lo aplica lean el mismo.
 */

export const QUOTE_STATUSES = [
  "pre_quote",
  "pending",
  "in_progress",
  "in_rent",
  "completed",
  "sold",
  "canceled",
] as const

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

export const TRADE_TYPES = ["rent", "sale"] as const
export type TradeType = (typeof TRADE_TYPES)[number]

/**
 * Estados cerrados: el documento terminó, con efecto o sin él.
 *
 * De aquí no se sale. Reabrir una cotización completada significaría recalcular importes que el
 * cliente ya firmó y volver a comprometer equipo que ya salió.
 */
const CLOSED: readonly QuoteStatus[] = ["completed", "sold", "canceled"]

/**
 * Las transiciones previstas. Lo que no está aquí responde `409`.
 *
 * Hacia atrás entre estados abiertos **sí** se puede —una cotización en progreso que el cliente
 * deja en el aire vuelve a pendiente—, porque nada se ha consumido todavía. Lo que no se deshace
 * es cerrar.
 */
export const TRANSITIONS: Readonly<Record<QuoteStatus, readonly QuoteStatus[]>> = {
  pre_quote: ["pending", "in_progress", "canceled"],
  pending: ["pre_quote", "in_progress", "canceled"],
  in_progress: ["pending", "in_rent", "completed", "sold", "canceled"],
  in_rent: ["completed", "canceled"],
  completed: [],
  sold: [],
  canceled: [],
}

/** Estados que sólo tienen sentido en un tipo de cotización. */
export const TYPE_ONLY: Partial<Record<QuoteStatus, TradeType>> = {
  in_rent: "rent",
  sold: "sale",
}

/** Desde aquí, una renta necesita su ventana de fechas: hay equipo comprometido para unos días. */
const WINDOW_FROM: readonly QuoteStatus[] = ["in_progress", "in_rent", "completed"]

/**
 * Estados en los que **el equipo ya salió de la nave**.
 *
 * Es lo que congela las líneas: mientras el equipo está fuera, cambiar una cantidad no cambia un
 * documento, cambiaría dónde dice el sistema que está una cámara que está en un rodaje. El equipo
 * vuelve registrando su retorno, unidad por unidad, que es la única operación que sabe en qué
 * condiciones volvió.
 *
 * Una renta **completada** también lo tiene fuera: terminó el periodo, pero la devolución puede
 * llegar después.
 */
const EQUIPMENT_OUT: readonly QuoteStatus[] = ["in_rent", "completed"]

export function isClosed(status: QuoteStatus): boolean {
  return CLOSED.includes(status)
}

/** Si llegar a este estado exige que la cotización tenga fechas. Sólo las rentas las necesitan. */
export function needsWindow(status: QuoteStatus, type: TradeType): boolean {
  return type === "rent" && WINDOW_FROM.includes(status)
}

/**
 * Si las líneas de la cotización ya no se tocan.
 *
 * Dos motivos distintos con la misma consecuencia: el documento está **cerrado**, o el equipo está
 * **fuera**. En el segundo caso las líneas no se congelan por burocracia sino porque bajar una
 * cantidad soltaría el vínculo de una unidad que sigue en la calle, y el inventario pasaría a decir
 * que está libre.
 */
export function linesFrozen(status: QuoteStatus, type: TradeType): boolean {
  return isClosed(status) || (type === "rent" && EQUIPMENT_OUT.includes(status))
}

/**
 * A dónde puede ir una cotización desde donde está, según su tipo.
 *
 * Filtra los destinos que no corresponden al tipo: una venta no pasa «a renta» y una renta no se
 * «vende». Ofrecerlos y que el servidor los rechace sería enseñar una puerta pintada en la pared.
 */
export function allowedTransitions(status: QuoteStatus, type: TradeType): readonly QuoteStatus[] {
  return TRANSITIONS[status].filter((destination) => {
    const only = TYPE_ONLY[destination]
    return only === undefined || only === type
  })
}
