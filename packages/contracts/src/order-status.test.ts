/**
 * El ciclo de vida de un pedido de almacén.
 *
 * Transcrito de `openspec/specs/warehouse-orders/spec.md`, «Transiciones de estado permitidas».
 */

import { describe, expect, it } from "vitest"
import { allowedOrderTransitions, isOrderClosed, ORDER_STATUSES } from "./order-status.ts"

describe("transiciones de un pedido", () => {
  it("un pedido pendiente se acepta o se cancela", () => {
    expect(allowedOrderTransitions("pending")).toEqual(["accepted", "canceled"])
  })

  it("no se reabre un pedido cancelado", () => {
    // Escenario: «No se reabre un pedido cancelado».
    expect(allowedOrderTransitions("canceled")).toEqual([])
    expect(isOrderClosed("canceled")).toBe(true)
  })

  it("tampoco uno finalizado", () => {
    expect(allowedOrderTransitions("finished")).toEqual([])
    expect(isOrderClosed("finished")).toBe(true)
  })

  it("no se vuelve atrás entre estados abiertos", () => {
    // Cada paso adelante movió inventario: aceptar lo aparta, entregar lo saca. Deshacerlo con un
    // cambio de estado dejaría el almacén diciendo una cosa y la nave otra.
    expect(allowedOrderTransitions("accepted")).not.toContain("pending")
    expect(allowedOrderTransitions("delivered")).not.toContain("accepted")
  })

  it("cancelar está disponible desde todo estado abierto", () => {
    for (const status of ORDER_STATUSES) {
      if (isOrderClosed(status)) continue
      expect(allowedOrderTransitions(status)).toContain("canceled")
    }
  })
})
