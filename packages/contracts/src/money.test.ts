/**
 * Los casos de este archivo están transcritos de los escenarios de
 * `openspec/specs/quotation-pricing/spec.md`, `storefront-checkout` y `computed-fields`.
 *
 * Cuando un escenario de una spec cambie, este archivo debe cambiar con él.
 */

import { describe, expect, it } from "vitest"
import {
  add,
  applyPercent,
  distribute,
  formatMoney,
  money,
  multiply,
  percent,
  scale,
  subtract,
  sum,
  toMinorUnits,
} from "./money.ts"

describe("análisis y formato", () => {
  it("conserva dos decimales exactos", () => {
    expect(formatMoney(money("1234.56"))).toBe("1234.56")
    expect(formatMoney(money("0.01"))).toBe("0.01")
    expect(formatMoney(money("-45.90"))).toBe("-45.90")
  })

  it("rellena los decimales que falten", () => {
    expect(formatMoney(money("100"))).toBe("100.00")
    expect(formatMoney(money("100.5"))).toBe("100.50")
  })

  it("rechaza más de dos decimales en lugar de redondear en silencio", () => {
    expect(() => money("10.555")).toThrow(/decimales/)
  })

  it("rechaza lo que no es un decimal", () => {
    expect(() => money("abc")).toThrow()
    expect(() => money("")).toThrow()
    expect(() => money("1e5")).toThrow()
  })

  it("no pierde precisión donde la coma flotante la perdería", () => {
    // 0.1 + 0.2 en coma flotante da 0.30000000000000004
    expect(formatMoney(add(money("0.10"), money("0.20")))).toBe("0.30")

    const cents = Array.from({ length: 100 }, () => money("0.01"))
    expect(formatMoney(sum(cents))).toBe("1.00")
  })

  it("convierte a unidades mínimas para el procesador de pagos", () => {
    expect(toMinorUnits(money("1194.80"))).toBe(119480)
  })
})

describe("cálculo de línea de cotización", () => {
  it("multiplica precio de renta por días aplicados y por cantidad", () => {
    // Escenario: tres unidades a 100.00 por semana, dos semanas aplicadas, sin descuento
    const unitTotal = scale(money("100.00"), "2")
    expect(formatMoney(multiply(unitTotal, 3))).toBe("600.00")
  })

  it("aplica el descuento por producto sobre el costo unitario", () => {
    // Escenario: descuento del diez por ciento, cuatro unidades a 200.00
    const unitCost = money("200.00")
    const unitDiscount = applyPercent(unitCost, percent("10"))
    const unitTotal = subtract(unitCost, unitDiscount)

    expect(formatMoney(multiply(unitDiscount, 4))).toBe("80.00")
    expect(formatMoney(multiply(unitTotal, 4))).toBe("720.00")
  })

  it("ignora los días en una línea de venta", () => {
    // Escenario: dos unidades a 250.00, con cualquier ventana de fechas
    expect(formatMoney(multiply(money("250.00"), 2))).toBe("500.00")
  })

  it("admite días fraccionarios", () => {
    // Diez días en frecuencia semanal son 1.43 semanas
    expect(formatMoney(scale(money("700.00"), "1.43"))).toBe("1001.00")
  })
})

describe("cálculo del documento", () => {
  it("suma los conceptos adicionales al subtotal", () => {
    // Escenario: líneas por 1000.00 y un concepto adicional de 150.00
    expect(formatMoney(add(money("1000.00"), money("150.00")))).toBe("1150.00")
  })

  it("aplica el descuento global por porcentaje", () => {
    // Escenario: subtotal 1000.00, descuento global del quince por ciento
    const discount = applyPercent(money("1000.00"), percent("15"))
    expect(formatMoney(discount)).toBe("150.00")
    expect(formatMoney(subtract(money("1000.00"), discount))).toBe("850.00")
  })

  it("aplica el descuento global por importe", () => {
    // Escenario: subtotal 1000.00, descuento global de 120.00
    expect(formatMoney(subtract(money("1000.00"), money("120.00")))).toBe("880.00")
  })

  it("suma el IVA trasladado a la base", () => {
    // Escenario: base 1000.00 con IVA trasladado del dieciséis por ciento
    const iva = applyPercent(money("1000.00"), percent("16"))
    expect(formatMoney(add(money("1000.00"), iva))).toBe("1160.00")
  })

  it("resta la retención de IVA", () => {
    // Escenario: base 1000.00, retención del diez punto seis siete por ciento
    expect(formatMoney(applyPercent(money("1000.00"), percent("10.67")))).toBe("106.70")
  })

  it("calcula las comisiones sobre el neto, después de impuestos", () => {
    // Escenario: neto 1160.00, comisión por transferencia del tres por ciento
    const fee = applyPercent(money("1160.00"), percent("3"))
    expect(formatMoney(fee)).toBe("34.80")
    expect(formatMoney(add(money("1160.00"), fee))).toBe("1194.80")
  })

  it("descuenta el anticipo del bruto", () => {
    // Escenario: bruto 1194.80, anticipo 500.00
    expect(formatMoney(subtract(money("1194.80"), money("500.00")))).toBe("694.80")
  })
})

describe("comisión de la plataforma", () => {
  it("retiene el porcentaje configurado y transfiere el neto", () => {
    // Escenario de storefront-checkout: comisión del diez por ciento sobre 1000.00
    const commission = applyPercent(money("1000.00"), percent("10"))
    expect(formatMoney(commission)).toBe("100.00")
    expect(formatMoney(subtract(money("1000.00"), commission))).toBe("900.00")
  })
})

describe("precio final con descuento", () => {
  it("aplica el descuento cuando está activo", () => {
    // Escenario de computed-fields: producto de 200.00 con descuento activo del quince por ciento
    const price = money("200.00")
    expect(formatMoney(subtract(price, applyPercent(price, percent("15"))))).toBe("170.00")
  })
})

describe("redondeo", () => {
  it("resuelve el empate alejándose de cero", () => {
    // 0.5 centavos hacia arriba
    expect(formatMoney(applyPercent(money("0.10"), percent("5")))).toBe("0.01")
    expect(formatMoney(applyPercent(money("-0.10"), percent("5")))).toBe("-0.01")
  })

  it("redondea cada línea antes de sumar, de modo que el documento cuadre", () => {
    // Escenario: la suma de las líneas mostradas es exactamente el subtotal mostrado
    const lines = [
      scale(money("33.33"), "1"),
      scale(money("33.33"), "1"),
      scale(money("33.34"), "1"),
    ]
    expect(formatMoney(sum(lines))).toBe("100.00")
  })
})

describe("reparto de comisiones", () => {
  it("suma exactamente el total y asigna el residuo a la última parte", () => {
    // Escenario: comisión de 10.00 a repartir entre tres unidades
    const parts = distribute(money("10.00"), [1, 1, 1])

    expect(parts.map(formatMoney)).toEqual(["3.33", "3.33", "3.34"])
    expect(formatMoney(sum(parts))).toBe("10.00")
  })

  it("reparte proporcionalmente al peso", () => {
    const parts = distribute(money("100.00"), [1, 3])
    expect(parts.map(formatMoney)).toEqual(["25.00", "75.00"])
    expect(formatMoney(sum(parts))).toBe("100.00")
  })

  it("cuadra con importes que no dividen bien", () => {
    const parts = distribute(money("0.05"), [1, 1, 1, 1, 1, 1, 1])
    expect(formatMoney(sum(parts))).toBe("0.05")
  })

  it("rechaza un peso total de cero", () => {
    expect(() => distribute(money("10.00"), [0, 0])).toThrow(/cero/)
  })
})
