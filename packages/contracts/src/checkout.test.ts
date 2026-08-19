/**
 * La aritmética de la compra y su máquina de estados.
 *
 * Transcritas del bloque «Cálculo del importe» y del requisito «Estados de la compra» de
 * `openspec/specs/storefront-checkout/spec.md`, más «El total del pedido refleja lo pagado» de
 * `order-fulfillment`.
 *
 * Que esto viva en `@tfv/contracts` y no en el servidor es la misma decisión que tomó el motor de
 * cotizaciones y el de envíos: el navegador enseña el desglose antes de pagar y el servidor cobra,
 * y con dos implementaciones lo enseñado y lo cobrado divergen tarde o temprano (`DEFECTS.md` M-06,
 * M-11).
 */

import { describe, expect, it } from "vitest"
import {
  allowedCheckoutTransitions,
  canTransitionCheckout,
  CHECKOUT_STATUSES,
  computeCheckoutTotals,
  isCheckoutOpen,
} from "./checkout.ts"

const line = (unitPrice: string, quantity: number) => ({ unitPrice, quantity })

describe("el importe de una compra", () => {
  it("suma las líneas por su cantidad", () => {
    const totals = computeCheckoutTotals({
      lines: [line("100.00", 3), line("250.50", 2)],
      shippingCost: "0.00",
      commissionRate: "0",
    })

    expect(totals.subtotal).toBe("801.00")
    expect(totals.total).toBe("801.00")
  })

  it("retiene la comisión configurada y transfiere el neto", () => {
    // Escenario: «Se retiene la comisión configurada».
    const totals = computeCheckoutTotals({
      lines: [line("1000.00", 1)],
      shippingCost: "0.00",
      commissionRate: "10",
    })

    expect(totals.platformFee).toBe("100.00")
    expect(totals.netAmount).toBe("900.00")
    expect(totals.platformFeeRate).toBe("10.0000")
  })

  it("el total que paga el comprador es el subtotal más el envío", () => {
    // Escenario: «El comprobante cuadra con el cargo», de `order-fulfillment`.
    const totals = computeCheckoutTotals({
      lines: [line("1000.00", 1)],
      shippingCost: "199.00",
      commissionRate: "10",
    })

    expect(totals.subtotal).toBe("1000.00")
    expect(totals.shippingCost).toBe("199.00")
    expect(totals.total).toBe("1199.00")
  })

  it("el envío no entra en la base de la comisión", () => {
    // La fórmula de la spec calcula la comisión sobre el subtotal, no sobre el total: el comercio
    // no paga comisión por el transporte.
    const withShipping = computeCheckoutTotals({
      lines: [line("1000.00", 1)],
      shippingCost: "500.00",
      commissionRate: "12.5",
    })
    const withoutShipping = computeCheckoutTotals({
      lines: [line("1000.00", 1)],
      shippingCost: "0.00",
      commissionRate: "12.5",
    })

    expect(withShipping.platformFee).toBe(withoutShipping.platformFee)
    expect(withShipping.platformFee).toBe("125.00")
  })

  it("la comisión se redondea al centavo, y el neto cuadra con ella", () => {
    // 333.33 × 7.35 % = 24.499755 → 24.50. Lo que importa es que neto + comisión sea el subtotal
    // exacto: cualquier otra cosa deja un centavo suelto en cada conciliación.
    const totals = computeCheckoutTotals({
      lines: [line("333.33", 1)],
      shippingCost: "0.00",
      commissionRate: "7.35",
    })

    expect(totals.platformFee).toBe("24.50")
    expect(totals.netAmount).toBe("308.83")
  })

  it("una comisión ausente recae en la de la plataforma", () => {
    const totals = computeCheckoutTotals({
      lines: [line("1000.00", 1)],
      shippingCost: "0.00",
    })

    expect(totals.platformFeeRate).toBe("12.5000")
    expect(totals.platformFee).toBe("125.00")
  })

  it("un carrito vacío no es una compra", () => {
    expect(() => computeCheckoutTotals({ lines: [], shippingCost: "0.00" })).toThrow(/vacío/i)
  })

  it("una cantidad que no es entera positiva se rechaza", () => {
    expect(() => computeCheckoutTotals({ lines: [line("10.00", 0)], shippingCost: "0.00" })).toThrow(
      /cantidad/i,
    )
    expect(() =>
      computeCheckoutTotals({ lines: [line("10.00", 1.5)], shippingCost: "0.00" }),
    ).toThrow(/cantidad/i)
  })
})

describe("los estados de la compra", () => {
  it("los cuatro existen y ninguno queda inalcanzable", () => {
    // Escenario: «Los cuatro estados son alcanzables». Aquí se comprueba la mitad estructural —que
    // haya camino hasta cada uno—; que el sistema los recorra de verdad es la prueba de extremo a
    // extremo de la API.
    expect(CHECKOUT_STATUSES).toEqual(["pending", "completed", "canceled", "expired"])

    for (const status of CHECKOUT_STATUSES) {
      if (status === "pending") continue
      expect(allowedCheckoutTransitions("pending")).toContain(status)
    }
  })

  it("los tres finales son terminales", () => {
    expect(allowedCheckoutTransitions("completed")).toEqual([])
    expect(allowedCheckoutTransitions("canceled")).toEqual([])
    expect(allowedCheckoutTransitions("expired")).toEqual([])
  })

  it("una compra pagada no caduca después", () => {
    // El recolector corre cada pocos minutos y una confirmación puede llegar mientras tanto: sin
    // esto, una compra cobrada acabaría marcada como caducada y con su inventario liberado.
    expect(canTransitionCheckout("completed", "expired")).toBe(false)
    expect(canTransitionCheckout("pending", "expired")).toBe(true)
  })

  it("sólo la pendiente sigue apartando inventario", () => {
    expect(isCheckoutOpen("pending")).toBe(true)
    expect(isCheckoutOpen("completed")).toBe(false)
    expect(isCheckoutOpen("canceled")).toBe(false)
    expect(isCheckoutOpen("expired")).toBe(false)
  })
})
