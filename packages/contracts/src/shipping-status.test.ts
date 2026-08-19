/**
 * El ciclo de vida del envío.
 *
 * Ver `openspec/specs/order-fulfillment/spec.md`, requisito «Registro del envío», y la rebanada 17.
 */

import { describe, expect, it } from "vitest"
import {
  allowedShipmentTransitions,
  isShipmentClosed,
  SHIPMENT_STATUSES,
  shipmentIsDelivered,
} from "./shipping-status.ts"

describe("estados del envío", () => {
  it("declara los seis estados del modelo", () => {
    expect(SHIPMENT_STATUSES).toEqual([
      "pending",
      "shipped",
      "in_transit",
      "delivered",
      "returned",
      "canceled",
    ])
  })

  it("nace pendiente y de ahí sale a la paquetería o se cancela", () => {
    // La recolección en tienda entrega desde pendiente: no hay transporte que la mueva.
    expect(allowedShipmentTransitions("pending")).toEqual(["shipped", "delivered", "canceled"])
  })

  it("una vez entregado a la paquetería ya no se cancela", () => {
    // El paquete está fuera: o llega, o vuelve. Cancelarlo sería decir que nunca salió.
    expect(allowedShipmentTransitions("shipped")).not.toContain("canceled")
    expect(allowedShipmentTransitions("in_transit")).not.toContain("canceled")
  })

  it("desde el tránsito sólo se llega o se devuelve", () => {
    expect(allowedShipmentTransitions("in_transit")).toEqual(["delivered", "returned"])
  })

  it("los tres estados cerrados no llevan a ninguna parte", () => {
    for (const status of ["delivered", "returned", "canceled"] as const) {
      expect(isShipmentClosed(status)).toBe(true)
      expect(allowedShipmentTransitions(status)).toEqual([])
    }
  })

  it("los tres abiertos no están cerrados", () => {
    for (const status of ["pending", "shipped", "in_transit"] as const) {
      expect(isShipmentClosed(status)).toBe(false)
    }
  })

  it("sólo la entrega cierra el ciclo con efecto", () => {
    expect(shipmentIsDelivered("delivered")).toBe(true)
    expect(shipmentIsDelivered("returned")).toBe(false)
    expect(shipmentIsDelivered("canceled")).toBe(false)
  })
})
