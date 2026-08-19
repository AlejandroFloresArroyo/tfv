/**
 * Los casos de este archivo están transcritos de los escenarios de
 * `openspec/specs/shipping-rates/spec.md`. Hay uno por escenario, y el orden es el de la spec.
 *
 * Cuando un escenario de la spec cambie, este archivo debe cambiar con él.
 *
 * Las coordenadas son de ciudades reales y las distancias que producen están comprobadas: CDMX a
 * Chihuahua son 1242.70 km —el tramo de más de mil—, a Monterrey 705.93 —el de más de quinientos—
 * y a Veracruz 316.04 —por debajo del primer umbral—. Usar puntos reales en lugar de una distancia
 * inyectada es lo que hace que la prueba ejercite también el cálculo sobre la superficie terrestre.
 */

import { describe, expect, it } from "vitest"
import {
  computeShipping,
  DEFAULT_SHIPPING_RATES,
  haversineKm,
  ShippingDataError,
  type ShippingInput,
  type ShippingItem,
  type ShippingRates,
  toCentimeters,
  toKilograms,
  volumetricWeightKg,
} from "./shipping.ts"

// ─── Puntos de referencia ────────────────────────────────────────────────────

const CDMX = { latitude: 19.4326, longitude: -99.1332 }
const CHIHUAHUA = { latitude: 28.6353, longitude: -106.0889 }
const MONTERREY = { latitude: 25.6866, longitude: -100.3161 }
const VERACRUZ = { latitude: 19.1738, longitude: -96.1342 }

/**
 * Un artículo compacto de peso conocido.
 *
 * Diez centímetros de lado dan `0.2` kilogramos volumétricos, muy por debajo de los pesos reales
 * de los escenarios: así el peso facturable de las composiciones es el real y el escenario prueba
 * lo que dice probar.
 */
function item(overrides: Partial<ShippingItem> = {}): ShippingItem {
  return {
    id: "articulo-1",
    quantity: 1,
    length: "10",
    width: "10",
    height: "10",
    lengthUnit: "cm",
    weight: "1",
    weightUnit: "kg",
    ...overrides,
  }
}

function input(overrides: Partial<ShippingInput> = {}): ShippingInput {
  return {
    mode: "local",
    items: [item()],
    rates: DEFAULT_SHIPPING_RATES,
    ...overrides,
  }
}

/** Tantos artículos iguales como pida el escenario, cada uno con su propio identificador. */
function items(count: number, overrides: Partial<ShippingItem> = {}): ShippingItem[] {
  return Array.from({ length: count }, (_, index) =>
    item({ id: `articulo-${index + 1}`, ...overrides }),
  )
}

// ─── Normalización de dimensiones y peso ─────────────────────────────────────

describe("normalización de dimensiones y peso", () => {
  it("convierte pulgadas a centímetros y libras a kilogramos", () => {
    expect(toCentimeters("10", "in")).toBe("25.4")
    expect(toKilograms("2", "lb")).toBe("0.907184")
  })

  it("convierte las otras unidades declaradas", () => {
    expect(toCentimeters("1", "m")).toBe("100")
    expect(toCentimeters("1", "ft")).toBe("30.48")
    expect(toCentimeters("7", "cm")).toBe("7")
    expect(toKilograms("500", "g")).toBe("0.5")
    expect(toKilograms("3", "kg")).toBe("3")
    expect(toKilograms("16", "oz")).toBe("0.453592")
  })
})

// ─── Peso volumétrico ────────────────────────────────────────────────────────

describe("peso volumétrico por artículo", () => {
  it("calcula el volumétrico de una caja de 50 por 40 por 30", () => {
    expect(volumetricWeightKg("50", "40", "30", DEFAULT_SHIPPING_RATES.volumetricDivisor)).toBe(
      "12",
    )
  })
})

// ─── Peso facturable ─────────────────────────────────────────────────────────

describe("peso facturable del envío", () => {
  it("manda el volumétrico cuando es mayor", () => {
    // Peso real 3 kg; volumétrico 50×40×30 = 12 kg.
    const quote = computeShipping(
      input({
        items: [item({ weight: "3", length: "50", width: "40", height: "30" })],
      }),
    )

    expect(quote.realWeightKg).toBe("3")
    expect(quote.volumetricWeightKg).toBe("12")
    expect(quote.billableWeightKg).toBe("12")
  })

  it("manda el real cuando es mayor", () => {
    // Peso real 20 kg; volumétrico 40×40×25 = 8 kg.
    const quote = computeShipping(
      input({
        items: [item({ weight: "20", length: "40", width: "40", height: "25" })],
      }),
    )

    expect(quote.realWeightKg).toBe("20")
    expect(quote.volumetricWeightKg).toBe("8")
    expect(quote.billableWeightKg).toBe("20")
  })
})

// ─── Modalidades ─────────────────────────────────────────────────────────────

describe("modalidades de envío", () => {
  it("cobra la tarifa de cada modalidad", () => {
    // Un kilogramo facturable, un artículo: base más la tarifa por kilo, sin recargos.
    const local = computeShipping(input({ mode: "local" }))
    const national = computeShipping(input({ mode: "national" }))
    const international = computeShipping(input({ mode: "international" }))

    expect(local.total).toBe("119.00")
    expect(national.total).toBe("229.00")
    expect(international.total).toBe("559.00")
  })

  it("la recolección no cuesta ni pide domicilio", () => {
    const quote = computeShipping(input({ mode: "pickup", destination: undefined }))

    expect(quote.total).toBe("0.00")
    expect(quote.requiresDeliveryAddress).toBe(false)
  })

  it("las tres modalidades con transporte sí piden domicilio", () => {
    for (const mode of ["local", "national", "international"] as const) {
      expect(computeShipping(input({ mode })).requiresDeliveryAddress).toBe(true)
    }
  })
})

// ─── Composición del costo ───────────────────────────────────────────────────

describe("composición del costo", () => {
  it("compone un envío local de 5 kilogramos y 2 artículos", () => {
    const quote = computeShipping(input({ mode: "local", items: items(2, { weight: "2.5" }) }))

    expect(quote.billableWeightKg).toBe("5")
    expect(quote.itemCount).toBe(2)
    expect(quote.total).toBe("199.00")
  })

  it("compone un envío nacional lejano de 10 kilogramos, 4 artículos y 1200 kilómetros", () => {
    const quote = computeShipping(
      input({
        mode: "national",
        items: items(4, { weight: "2.5" }),
        origin: CDMX,
        destination: CHIHUAHUA,
      }),
    )

    expect(quote.billableWeightKg).toBe("10")
    expect(quote.itemCount).toBe(4)
    expect(quote.total).toBe("599.00")
  })
})

// ─── Recargo por distancia ───────────────────────────────────────────────────

describe("recargo por distancia en envíos nacionales", () => {
  it("no acumula los recargos por distancia", () => {
    const quote = computeShipping(input({ mode: "national", origin: CDMX, destination: CHIHUAHUA }))

    const distance = quote.surcharges.filter((surcharge) => surcharge.kind === "distance")
    expect(distance).toHaveLength(1)
    expect(distance[0]?.amount).toBe("80.00")
  })

  it("aplica el tramo inferior cuando sólo se supera el primer umbral", () => {
    const quote = computeShipping(input({ mode: "national", origin: CDMX, destination: MONTERREY }))

    const distance = quote.surcharges.filter((surcharge) => surcharge.kind === "distance")
    expect(distance).toHaveLength(1)
    expect(distance[0]?.amount).toBe("40.00")
  })

  it("bajo el umbral no hay recargo por distancia", () => {
    const quote = computeShipping(input({ mode: "national", origin: CDMX, destination: VERACRUZ }))

    expect(quote.surcharges.filter((surcharge) => surcharge.kind === "distance")).toHaveLength(0)
  })
})

// ─── Recargo por número de artículos ─────────────────────────────────────────

describe("recargo por número de artículos", () => {
  it("un pedido grande lleva únicamente el recargo mayor", () => {
    const quote = computeShipping(input({ items: items(15) }))

    const byCount = quote.surcharges.filter((surcharge) => surcharge.kind === "item_count")
    expect(byCount).toHaveLength(1)
    expect(byCount[0]?.amount).toBe("50.00")
  })

  it("entre cuatro y diez artículos lleva el recargo menor", () => {
    const quote = computeShipping(input({ items: items(4) }))

    const byCount = quote.surcharges.filter((surcharge) => surcharge.kind === "item_count")
    expect(byCount).toHaveLength(1)
    expect(byCount[0]?.amount).toBe("20.00")
  })

  it("tres artículos no superan el umbral", () => {
    const quote = computeShipping(input({ items: items(3) }))

    expect(quote.surcharges.filter((surcharge) => surcharge.kind === "item_count")).toHaveLength(0)
  })
})

// ─── Distancia entre origen y destino ────────────────────────────────────────

describe("distancia entre origen y destino", () => {
  it("mide sobre la superficie terrestre", () => {
    expect(haversineKm(CDMX, CHIHUAHUA)).toBeCloseTo(1242.7, 1)
    expect(haversineKm(CDMX, MONTERREY)).toBeCloseTo(705.93, 1)
  })

  it("sin coordenadas de destino no hay recargo por distancia", () => {
    const quote = computeShipping(input({ mode: "national", origin: CDMX, destination: undefined }))

    expect(quote.distanceKm).toBeUndefined()
    expect(quote.surcharges.filter((surcharge) => surcharge.kind === "distance")).toHaveLength(0)
  })

  it("sin coordenadas de origen tampoco", () => {
    const quote = computeShipping(
      input({ mode: "national", origin: undefined, destination: CHIHUAHUA }),
    )

    expect(quote.distanceKm).toBeUndefined()
    expect(quote.surcharges.filter((surcharge) => surcharge.kind === "distance")).toHaveLength(0)
  })
})

// ─── Las tarifas son datos ───────────────────────────────────────────────────

describe("las tarifas son datos configurables", () => {
  it("un cambio de tarifa cambia el cálculo, sin tocar el código", () => {
    const cheaper: ShippingRates = {
      ...DEFAULT_SHIPPING_RATES,
      local: { base: "49.00", perKilogram: "10.00" },
    }

    expect(computeShipping(input({ rates: cheaper })).total).toBe("59.00")
  })

  it("los umbrales y los recargos también son datos", () => {
    const strict: ShippingRates = {
      ...DEFAULT_SHIPPING_RATES,
      itemSurcharges: [{ over: 1, amount: "5.00" }],
    }

    const quote = computeShipping(input({ items: items(2), rates: strict }))
    expect(quote.surcharges.filter((surcharge) => surcharge.kind === "item_count")).toHaveLength(1)
    // 99 de base, 20 por los dos kilogramos facturables, y 5 del recargo rebajado a más de uno.
    expect(quote.total).toBe("144.00")
  })
})

// ─── Tipo de cambio ──────────────────────────────────────────────────────────

describe("el tipo de cambio es configurable y trazable", () => {
  it("registra el importe de origen y el tipo aplicado", () => {
    const quote = computeShipping(
      input({ mode: "local", conversion: { currency: "USD", rate: "0.05" } }),
    )

    // 119.00 MXN al 0.05 son 5.95 USD.
    expect(quote.currency).toBe("USD")
    expect(quote.total).toBe("5.95")
    expect(quote.sourceCurrency).toBe("MXN")
    expect(quote.sourceTotal).toBe("119.00")
    expect(quote.exchangeRate).toBe("0.05")
  })

  it("sin conversión el total va en la moneda de las tarifas y no hay tipo que registrar", () => {
    const quote = computeShipping(input())

    expect(quote.currency).toBe("MXN")
    expect(quote.exchangeRate).toBeUndefined()
    expect(quote.sourceTotal).toBeUndefined()
  })
})

// ─── Desglose ────────────────────────────────────────────────────────────────

describe("desglose del costo", () => {
  it("permite reconstruir el total a partir de sus componentes", () => {
    const quote = computeShipping(
      input({
        mode: "national",
        items: items(4, { weight: "2.5" }),
        origin: CDMX,
        destination: CHIHUAHUA,
      }),
    )

    expect(quote.mode).toBe("national")
    expect(quote.base).toBe("199.00")
    expect(quote.variable).toBe("300.00")
    expect(quote.surchargeTotal).toBe("100.00")

    const recomposed = Number(quote.base) + Number(quote.variable) + Number(quote.surchargeTotal)
    expect(recomposed.toFixed(2)).toBe(quote.total)
  })

  it("enumera cada recargo con su umbral", () => {
    const quote = computeShipping(
      input({
        mode: "national",
        items: items(15),
        origin: CDMX,
        destination: CHIHUAHUA,
      }),
    )

    expect(quote.surcharges).toEqual([
      { kind: "distance", threshold: 1000, amount: "80.00" },
      { kind: "item_count", threshold: 10, amount: "50.00" },
    ])
  })
})

// ─── Datos que faltan ────────────────────────────────────────────────────────

describe("faltan datos para calcular", () => {
  it("un artículo sin peso detiene el cálculo e identifica cuál y qué falta", () => {
    const broken = input({
      items: [item({ id: "articulo-1" }), item({ id: "articulo-2", weight: undefined })],
    })

    expect(() => computeShipping(broken)).toThrow(ShippingDataError)

    try {
      computeShipping(broken)
      expect.unreachable("el cálculo debía rechazarse")
    } catch (error) {
      const failure = error as ShippingDataError
      expect(failure.itemId).toBe("articulo-2")
      expect(failure.field).toBe("weight")
      expect(failure.status).toBe(422)
      expect(failure.message).toContain("articulo-2")
    }
  })

  it("un artículo sin una de sus dimensiones también lo detiene", () => {
    const broken = input({ items: [item({ id: "articulo-9", height: undefined })] })

    try {
      computeShipping(broken)
      expect.unreachable("el cálculo debía rechazarse")
    } catch (error) {
      const failure = error as ShippingDataError
      expect(failure.itemId).toBe("articulo-9")
      expect(failure.field).toBe("height")
    }
  })

  it("la recolección no exige dimensiones ni peso, porque no se transporta", () => {
    const quote = computeShipping(
      input({ mode: "pickup", items: [item({ weight: undefined, height: undefined })] }),
    )

    expect(quote.total).toBe("0.00")
  })
})

// ─── Una sola implementación ─────────────────────────────────────────────────

describe("una sola implementación del cálculo", () => {
  it("es determinista: la estimación y el cobro salen de la misma función", () => {
    const shared = input({
      mode: "national",
      items: items(4, { weight: "2.5" }),
      origin: CDMX,
      destination: CHIHUAHUA,
    })

    // Lo que la interfaz enseña antes de pagar y lo que el servidor cobra al materializar son
    // dos llamadas a esta misma función pura con la misma instantánea.
    expect(computeShipping(shared)).toEqual(computeShipping(shared))
  })
})
