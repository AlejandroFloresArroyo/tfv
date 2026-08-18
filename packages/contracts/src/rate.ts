/**
 * Qué tarifa aplica a una línea.
 *
 * Ver `openspec/specs/warehouse-catalog/spec.md` —la precedencia— y
 * `openspec/specs/quotation-pricing/spec.md` —quién la consume—.
 *
 * Esto **no calcula importes**: decide cuál es el precio de partida y se lo entrega al motor de
 * `quotation.ts`. Son dos reglas distintas y conviene que vivan separadas: el motor no sabe de
 * listas de precios, y esta regla no sabe de impuestos ni de comisiones.
 *
 * Vive aquí, en el paquete compartido, por el mismo motivo que el motor: **el navegador la
 * necesita**. El constructor de cotizaciones muestra el importe de una línea mientras se edita, y
 * si resolviera la tarifa por su cuenta tendríamos dos reglas —la del servidor, que es la que
 * queda guardada, y la que ve quien está cotizando—. Es la mitad del defecto M-06, sólo que un
 * paso antes.
 */

import { add, formatMoney, isZero, money } from "./money.ts"
import type { RateSchedule } from "./quotation.ts"

/** La tarifa de un producto dentro de una lista de precios. */
export interface ListedRate {
  readonly sale: string
  readonly rent: RateSchedule
  readonly penalty: RateSchedule
}

export interface RateSource {
  /** El precio escalar del producto, el que se usa cuando no hay lista o la lista no dice nada. */
  readonly productPrice: string
  /** El ajuste propio de la medida. Puede ser negativo. */
  readonly priceDifference: string
  /** La tarifa del producto en la lista elegida, si hay lista y tiene entrada para él. */
  readonly listed?: ListedRate | undefined
}

export interface ResolvedRate {
  readonly basePrice: string
  readonly rent?: RateSchedule | undefined
  readonly penalty?: RateSchedule | undefined
}

/**
 * Resuelve la tarifa de una medida.
 *
 * La precedencia es la de `warehouse-catalog`: **la tarifa de la lista, o el precio del producto, o
 * cero**. Una tarifa de venta en cero se trata como «la lista no dice nada de este producto», no
 * como «este producto es gratis»; es la lectura que la pila anterior ya hacía y de la que dependen
 * las listas parcialmente rellenadas, que son la mayoría.
 *
 * Sin entrada en la lista no hay calendario de renta, y el motor cobrará el precio base por
 * periodo. Es deliberado: inventar aquí un calendario a partir del escalar sería decidir un precio
 * de renta que nadie fijó.
 */
export function resolveRate(source: RateSource): ResolvedRate {
  const listedSale = source.listed?.sale
  const base =
    listedSale !== undefined && !isZero(money(listedSale)) ? listedSale : source.productPrice

  if (!source.listed) return { basePrice: adjust(base, source.priceDifference) }

  return {
    basePrice: adjust(base, source.priceDifference),
    rent: adjustSchedule(source.listed.rent, source.priceDifference),
    penalty: adjustSchedule(source.listed.penalty, source.priceDifference),
  }
}

/** Suma el ajuste de la medida al precio resuelto. En decimal exacto, nunca en coma flotante. */
function adjust(amount: string, difference: string): string {
  const value = money(amount)
  return isZero(money(difference)) ? formatMoney(value) : formatMoney(add(value, money(difference)))
}

/**
 * El ajuste de la medida alcanza a **todos** los importes de la tarifa.
 *
 * Una medida más cara lo es por semana y por mes, no sólo al venderla. Dejar la renta sin ajustar
 * haría que el mismo equipo costara distinto según se compre o se rente, sin que nadie lo decidiera.
 */
function adjustSchedule(schedule: RateSchedule, difference: string): RateSchedule {
  if (isZero(money(difference))) return schedule

  return {
    isFixed: schedule.isFixed,
    ...(schedule.fixed === undefined ? {} : { fixed: adjust(schedule.fixed, difference) }),
    ...(schedule.daily === undefined ? {} : { daily: adjust(schedule.daily, difference) }),
    ...(schedule.weekly === undefined ? {} : { weekly: adjust(schedule.weekly, difference) }),
    ...(schedule.monthly === undefined ? {} : { monthly: adjust(schedule.monthly, difference) }),
  }
}
