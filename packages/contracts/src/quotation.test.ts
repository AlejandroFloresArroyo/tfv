/**
 * Los casos de este archivo están transcritos de los escenarios de
 * `openspec/specs/quotation-pricing/spec.md`. Hay uno por escenario, y el orden es el de la spec.
 *
 * Cuando un escenario de la spec cambie, este archivo debe cambiar con él.
 */

import { describe, expect, it } from "vitest"
import { add, formatMoney, money, subtract, sum } from "./money.ts"
import {
  appliedDays,
  computeQuotation,
  frequencyDays,
  type QuotationBreakdown,
  type QuotationInput,
  type QuotationLineInput,
} from "./quotation.ts"

describe("conversión de días según la frecuencia", () => {
  it("convierte diez días a una frecuencia semanal", () => {
    expect(frequencyDays(10, "weekly")).toBe("1.43")
  })

  it("convierte cuarenta y cinco días a una frecuencia mensual", () => {
    expect(frequencyDays(45, "monthly")).toBe("1.50")
  })

  it("no divide en la frecuencia diaria", () => {
    expect(frequencyDays(10, "daily")).toBe("10.00")
  })
})

describe("redondeo opcional de los días aplicados", () => {
  it("redondea hacia arriba", () => {
    expect(appliedDays("1.43", { round: true, direction: "up" })).toBe("2")
  })

  it("redondea hacia abajo", () => {
    expect(appliedDays("1.43", { round: true, direction: "down" })).toBe("1")
  })

  it("conserva el valor real cuando el redondeo daría cero", () => {
    // No se cobra cero por un periodo que existió.
    expect(appliedDays("0.43", { round: true, direction: "down" })).toBe("0.43")
  })

  it("no redondea cuando la cotización no lo pide", () => {
    expect(appliedDays("1.43", { round: false, direction: "up" })).toBe("1.43")
  })
})

/** Ventana de diez días, la de los escenarios de la spec. */
const WINDOW = {
  startsOn: new Date("2026-03-01T00:00:00Z"),
  endsOn: new Date("2026-03-11T00:00:00Z"),
}

function line(overrides: Partial<QuotationLineInput> = {}): QuotationLineInput {
  return {
    id: "linea-1",
    productId: "producto-1",
    measurementId: "medida-1",
    quantity: 1,
    frequency: "weekly",
    basePrice: "0.00",
    ...overrides,
  }
}

function quote(overrides: Partial<QuotationInput> = {}): QuotationInput {
  return { type: "rent", ...WINDOW, lines: [line()], ...overrides }
}

describe("precio unitario de renta y de venta", () => {
  it("una tarifa fija ignora los días", () => {
    const result = computeQuotation(
      quote({ lines: [line({ rent: { isFixed: true, fixed: "500.00", weekly: "80.00" } })] }),
    )

    expect(result.lines[0]?.unitCost).toBe("500.00")
  })

  it("recurre al precio base cuando la frecuencia no tiene tarifa", () => {
    const result = computeQuotation(
      quote({
        lines: [
          line({
            frequency: "monthly",
            basePrice: "300.00",
            rent: { isFixed: false, weekly: "80.00" },
          }),
        ],
      }),
    )

    expect(result.lines[0]?.unitCost).toBe("300.00")
  })

  it("una tarifa fija sin importe cobra cero, no el precio base", () => {
    // Sólo la rama no fija recae en el precio base. Marcar una tarifa como fija y dejarla vacía
    // es declarar que no se cobra por periodicidad, no pedir que se cobre el catálogo.
    const result = computeQuotation(
      quote({ lines: [line({ basePrice: "300.00", rent: { isFixed: true, weekly: "80.00" } })] }),
    )

    expect(result.lines[0]?.unitCost).toBe("0.00")
  })

  it("una venta cobra el precio base", () => {
    const result = computeQuotation(
      quote({
        type: "sale",
        lines: [line({ basePrice: "250.00", rent: { isFixed: true, fixed: "500.00" } })],
      }),
    )

    expect(result.lines[0]?.unitCost).toBe("250.00")
  })
})

describe("total de una línea", () => {
  it("multiplica el precio de renta por los días aplicados y por la cantidad", () => {
    // Tres unidades a 100.00 por semana, dos semanas aplicadas, sin descuento.
    const result = computeQuotation(
      quote({
        startsOn: new Date("2026-03-01T00:00:00Z"),
        endsOn: new Date("2026-03-15T00:00:00Z"),
        lines: [line({ quantity: 3, rent: { isFixed: false, weekly: "100.00" } })],
      }),
    )

    expect(result.lines[0]?.appliedDays).toBe("2.00")
    expect(result.lines[0]?.total).toBe("600.00")
  })

  it("no deja que los días afecten a una venta", () => {
    const result = computeQuotation(
      quote({ type: "sale", lines: [line({ quantity: 2, basePrice: "250.00" })] }),
    )

    expect(result.lines[0]?.total).toBe("500.00")
  })
})

describe("descuento por producto", () => {
  it("reduce el costo unitario de cada línea antes de multiplicar", () => {
    // Diez por ciento sobre cuatro unidades a 200.00.
    const result = computeQuotation(
      quote({
        type: "sale",
        lines: [line({ quantity: 4, basePrice: "200.00" })],
        payment: { version: 1, discount: { type: "percent", value: "10", perProduct: true } },
      }),
    )

    expect(result.lines[0]?.discount).toBe("80.00")
    expect(result.lines[0]?.total).toBe("720.00")
  })

  it("deja el descuento unitario en cero cuando el descuento es global", () => {
    const result = computeQuotation(
      quote({
        type: "sale",
        lines: [line({ quantity: 4, basePrice: "200.00" })],
        payment: { version: 1, discount: { type: "percent", value: "10" } },
      }),
    )

    expect(result.lines[0]?.discount).toBe("0.00")
    expect(result.lines[0]?.total).toBe("800.00")
  })
})

describe("redondeo por línea antes de sumar", () => {
  it("hace que las líneas impresas sumen exactamente el subtotal", () => {
    // Con 1.43 semanas aplicadas cada línea arrastra decimales. Redondear al final en vez de por
    // línea daría 276.96, y las líneas impresas no cuadrarían con el total.
    const prices = ["33.33", "16.66", "8.33", "4.16", "2.08"]
    const result = computeQuotation(
      quote({
        lines: prices.map((weekly, index) =>
          line({ id: `linea-${index}`, quantity: 3, rent: { isFixed: false, weekly } }),
        ),
      }),
    )

    const printed = sum(result.lines.map((current) => money(current.total)))
    expect(formatMoney(printed)).toBe(result.subtotal)
    expect(result.subtotal).toBe("276.93")
  })
})

/** Una cotización de venta cuyas líneas suman exactamente mil pesos. */
function thousand(overrides: Partial<QuotationInput> = {}): QuotationInput {
  return quote({
    type: "sale",
    lines: [line({ quantity: 4, basePrice: "250.00" })],
    ...overrides,
  })
}

describe("conceptos adicionales en el subtotal", () => {
  it("suma el concepto adicional junto con los totales de línea", () => {
    const result = computeQuotation(
      thousand({
        payment: { version: 1, additionals: [{ name: "Traslado", amount: "150.00" }] },
      }),
    )

    expect(result.linesTotal).toBe("1000.00")
    expect(result.subtotal).toBe("1150.00")
  })
})

describe("descuento global", () => {
  it("aplica el descuento global por porcentaje", () => {
    const result = computeQuotation(
      thousand({ payment: { version: 1, discount: { type: "percent", value: "15" } } }),
    )

    expect(result.discount).toBe("150.00")
    expect(result.base).toBe("850.00")
  })

  it("aplica el descuento global por importe", () => {
    const result = computeQuotation(
      thousand({ payment: { version: 1, discount: { type: "amount", value: "120.00" } } }),
    )

    expect(result.base).toBe("880.00")
  })

  it("no vuelve a descontar en el documento lo ya descontado por producto", () => {
    const result = computeQuotation(
      thousand({
        payment: { version: 1, discount: { type: "percent", value: "10", perProduct: true } },
      }),
    )

    expect(result.subtotal).toBe("900.00")
    expect(result.discount).toBe("0.00")
    expect(result.base).toBe("900.00")
  })
})

describe("precio fijo que sustituye a la base", () => {
  it("manda sobre lo que sumen las líneas", () => {
    const result = computeQuotation(thousand({ payment: { version: 1, fixedPrice: "800.00" } }))

    expect(result.subtotal).toBe("1000.00")
    expect(result.base).toBe("800.00")
  })

  it("recibe igualmente el descuento global", () => {
    const result = computeQuotation(
      thousand({
        payment: {
          version: 1,
          fixedPrice: "800.00",
          discount: { type: "percent", value: "10" },
        },
      }),
    )

    expect(result.base).toBe("720.00")
  })
})

function taxOf(result: QuotationBreakdown, key: string) {
  return result.taxes.find((tax) => tax.key === key)
}

describe("aplicación de los impuestos", () => {
  it("el IVA trasladado aumenta la base", () => {
    const result = computeQuotation(
      thousand({
        taxes: { version: 1, iva: { enabled: true, rate: "16", type: "trasladado" } },
      }),
    )

    expect(taxOf(result, "iva")?.amount).toBe("160.00")
    expect(taxOf(result, "iva")?.effect).toBe("increase")
    expect(result.net).toBe("1160.00")
  })

  it("una retención disminuye la base", () => {
    const result = computeQuotation(
      thousand({ taxes: { version: 1, ivaRetention: { enabled: true, rate: "10.67" } } }),
    )

    expect(taxOf(result, "ivaRetention")?.amount).toBe("106.70")
    expect(taxOf(result, "ivaRetention")?.effect).toBe("decrease")
    expect(result.net).toBe("893.30")
  })

  it("un impuesto desactivado no interviene aunque tenga porcentaje", () => {
    const result = computeQuotation(
      thousand({ taxes: { version: 1, isn: { enabled: false, rate: "3" } } }),
    )

    expect(taxOf(result, "isn")).toBeUndefined()
    expect(result.net).toBe("1000.00")
  })

  it("el IVA acreditable no interviene", () => {
    const result = computeQuotation(
      thousand({
        taxes: { version: 1, iva: { enabled: true, rate: "16", type: "acreditable" } },
      }),
    )

    expect(result.net).toBe("1000.00")
  })

  it("aplica una contribución adicional con el signo que declara", () => {
    const result = computeQuotation(
      thousand({
        taxes: {
          version: 1,
          additional: [
            {
              name: "Ecológico",
              enabled: true,
              type: "amount",
              value: "25.00",
              effect: "increase",
            },
            { name: "Convenio", enabled: true, type: "percent", value: "2", effect: "decrease" },
          ],
        },
      }),
    )

    expect(result.net).toBe("1005.00")
  })
})

/** Base de mil pesos con IVA trasladado del dieciséis por ciento: neto de 1160.00. */
const IVA = { version: 1, iva: { enabled: true, rate: "16", type: "trasladado" } } as const

describe("comisiones aplicadas sobre el neto", () => {
  it("calcula la comisión sobre el neto, después de los impuestos", () => {
    const result = computeQuotation(
      thousand({ taxes: IVA, payment: { version: 1, transferFeeRate: "3" } }),
    )

    expect(result.net).toBe("1160.00")
    expect(result.fees).toBe("34.80")
    expect(result.gross).toBe("1194.80")
  })

  it("suma la comisión por transferencia y la adicional", () => {
    const result = computeQuotation(
      thousand({
        taxes: IVA,
        payment: { version: 1, transferFeeRate: "3", additionalFeeRate: "1" },
      }),
    )

    expect(result.fees).toBe("46.40")
  })
})

describe("reparto de comisiones entre líneas", () => {
  const spread = (spreadFeesAcrossLines: boolean) =>
    computeQuotation(
      thousand({
        taxes: IVA,
        payment: { version: 1, transferFeeRate: "3", spreadFeesAcrossLines },
      }),
    )

  it("no altera el total", () => {
    expect(spread(true).total).toBe("1194.80")
    expect(spread(true).total).toBe(spread(false).total)
  })

  it("no cambia los impuestos", () => {
    // El requisito que existe porque la implementación anterior cambiaba de convención de signo
    // según esta misma opción.
    expect(spread(true).taxTotal).toBe("160.00")
    expect(spread(true).taxTotal).toBe(spread(false).taxTotal)
    expect(spread(true).taxes).toEqual(spread(false).taxes)
  })

  it("asigna el residuo a la última línea", () => {
    // Una comisión de 10.00 repartida entre tres unidades: 3.33, 3.33 y 3.34.
    const result = computeQuotation(
      quote({
        type: "sale",
        lines: [
          line({ id: "a", basePrice: "400.00" }),
          line({ id: "b", basePrice: "300.00" }),
          line({ id: "c", basePrice: "300.00" }),
        ],
        payment: { version: 1, transferFeeRate: "1", spreadFeesAcrossLines: true },
      }),
    )

    expect(result.fees).toBe("10.00")
    expect(result.lines.map((current) => current.fee)).toEqual(["3.33", "3.33", "3.34"])
    expect(formatMoney(sum(result.lines.map((current) => money(current.fee))))).toBe(result.fees)
  })

  it("deja las líneas sin comisión cuando no se reparte", () => {
    expect(spread(false).lines.every((current) => current.fee === "0.00")).toBe(true)
    expect(spread(false).feesSpread).toBe(false)
  })
})

describe("el anticipo se descuenta del total", () => {
  it("reduce lo pendiente sin ocultar el bruto", () => {
    const result = computeQuotation(
      thousand({
        taxes: IVA,
        payment: { version: 1, transferFeeRate: "3", advance: { amount: "500.00" } },
      }),
    )

    expect(result.gross).toBe("1194.80")
    expect(result.advance).toBe("500.00")
    expect(result.total).toBe("694.80")
  })

  it("no descuenta el depósito, que no es un pago a cuenta", () => {
    const result = computeQuotation(
      thousand({ payment: { version: 1, deposit: { amount: "500.00" } } }),
    )

    expect(result.total).toBe("1000.00")
  })
})

describe("penalización calculada aparte", () => {
  it("no la incluye en el total", () => {
    const result = computeQuotation(
      quote({
        type: "sale",
        lines: [
          line({ quantity: 4, basePrice: "250.00", penalty: { isFixed: true, fixed: "50.00" } }),
        ],
      }),
    )

    expect(result.penalty).toBe("200.00")
    expect(result.total).toBe("1000.00")
  })

  it("una penalización fija ignora las líneas", () => {
    const result = computeQuotation(
      quote({
        type: "sale",
        lines: [
          line({ quantity: 4, basePrice: "250.00", penalty: { isFixed: true, fixed: "50.00" } }),
        ],
        payment: { version: 1, penalty: { fixed: "750.00" } },
      }),
    )

    expect(result.penalty).toBe("750.00")
  })
})

describe("agrupación por producto en la presentación", () => {
  it("agrupa las medidas bajo su producto y respeta el orden de la cotización", () => {
    const result = computeQuotation(
      quote({
        type: "sale",
        lines: [
          line({
            id: "b1",
            productId: "camara",
            positionProduct: 1,
            position: 1,
            basePrice: "300.00",
          }),
          line({
            id: "a1",
            productId: "tripie",
            positionProduct: 0,
            position: 0,
            basePrice: "100.00",
          }),
          line({
            id: "b0",
            productId: "camara",
            positionProduct: 1,
            position: 0,
            basePrice: "200.00",
          }),
        ],
      }),
    )

    expect(result.groups.map((group) => group.productId)).toEqual(["tripie", "camara"])
    expect(result.groups[1]?.lineIds).toEqual(["b0", "b1"])
    expect(result.groups[1]?.subtotal).toBe("500.00")
    expect(result.lines.map((current) => current.lineId)).toEqual(["a1", "b0", "b1"])
  })
})

describe("trazabilidad del cálculo", () => {
  it("permite reconstruir la cadena desde las líneas hasta el total", () => {
    const result = computeQuotation(
      thousand({
        taxes: IVA,
        payment: {
          version: 1,
          additionals: [{ name: "Traslado", amount: "150.00" }],
          discount: { type: "percent", value: "10" },
          transferFeeRate: "3",
          advance: { amount: "200.00" },
        },
      }),
    )

    const step = (value: string) => money(value)
    expect(formatMoney(add(step(result.linesTotal), step(result.additionals)))).toBe(
      result.subtotal,
    )
    expect(formatMoney(subtract(step(result.subtotal), step(result.discount)))).toBe(result.base)
    expect(formatMoney(add(step(result.base), step(result.taxTotal)))).toBe(result.net)
    expect(formatMoney(add(step(result.net), step(result.fees)))).toBe(result.gross)
    expect(formatMoney(subtract(step(result.gross), step(result.advance)))).toBe(result.total)
  })
})
