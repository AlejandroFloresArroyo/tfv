import { describe, expect, it } from "vitest"
import { resolveRate } from "./rate.ts"

describe("resolveRate", () => {
  it("sin lista de precios usa el precio escalar del producto", () => {
    expect(resolveRate({ productPrice: "1500.00", priceDifference: "0" })).toEqual({
      basePrice: "1500.00",
    })
  })

  it("con tarifa de venta en la lista, manda la tarifa", () => {
    const resolved = resolveRate({
      productPrice: "1500.00",
      priceDifference: "0",
      listed: { sale: "1200.00", rent: { isFixed: false }, penalty: { isFixed: false } },
    })

    expect(resolved.basePrice).toBe("1200.00")
  })

  it("una tarifa de venta en cero no sustituye al precio del producto", () => {
    const resolved = resolveRate({
      productPrice: "1500.00",
      priceDifference: "0",
      listed: { sale: "0", rent: { isFixed: false }, penalty: { isFixed: false } },
    })

    expect(resolved.basePrice).toBe("1500.00")
  })

  it("el ajuste de la medida se suma al precio resuelto", () => {
    expect(resolveRate({ productPrice: "1500.00", priceDifference: "250.50" })).toEqual({
      basePrice: "1750.50",
    })
  })

  it("el ajuste de la medida alcanza a toda la tarifa de renta", () => {
    const resolved = resolveRate({
      productPrice: "0",
      priceDifference: "100.00",
      listed: {
        sale: "1000.00",
        rent: { isFixed: false, daily: "50.00", weekly: "300.00", monthly: "1000.00" },
        penalty: { isFixed: true, fixed: "500.00" },
      },
    })

    expect(resolved).toEqual({
      basePrice: "1100.00",
      rent: { isFixed: false, daily: "150.00", weekly: "400.00", monthly: "1100.00" },
      penalty: { isFixed: true, fixed: "600.00" },
    })
  })

  it("sin ajuste, la tarifa viaja tal cual", () => {
    const rent = { isFixed: false, daily: "50.00" } as const
    const resolved = resolveRate({
      productPrice: "0",
      priceDifference: "0",
      listed: { sale: "1000.00", rent, penalty: { isFixed: false } },
    })

    expect(resolved.rent).toBe(rent)
  })

  it("un importe ausente de la tarifa sigue ausente después del ajuste", () => {
    const resolved = resolveRate({
      productPrice: "0",
      priceDifference: "10.00",
      listed: {
        sale: "100.00",
        rent: { isFixed: false, weekly: "700.00" },
        penalty: { isFixed: false },
      },
    })

    expect(resolved.rent).toEqual({ isFixed: false, weekly: "710.00" })
    expect(resolved.penalty).toEqual({ isFixed: false })
  })

  it("un ajuste negativo abarata", () => {
    expect(resolveRate({ productPrice: "1500.00", priceDifference: "-200.00" })).toEqual({
      basePrice: "1300.00",
    })
  })

  it("los decimales no pasan por coma flotante", () => {
    expect(resolveRate({ productPrice: "0.10", priceDifference: "0.20" }).basePrice).toBe("0.30")
  })
})
