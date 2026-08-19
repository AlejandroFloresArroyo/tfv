/**
 * Prorrateo, mayoría de edad y descuento por volumen.
 *
 * Transcritas de `openspec/specs/subscriptions-and-entitlements/spec.md` y de
 * `merchant-onboarding/spec.md`. Es cálculo puro: se prueba sin base de datos ni procesador, que es
 * lo que permite fijar aquí el comportamiento del dinero y no dentro de una prueba de integración
 * donde el importe se pierde entre otras diez cosas.
 */

import { describe, expect, it } from "vitest"
import {
  clabe,
  decideDiscount,
  isOfLegalAge,
  prorate,
  remainingRatio,
  subscribeInput,
  withDiscount,
} from "./billing.ts"
import { formatMoney, money, percent } from "./money.ts"

const START = new Date("2026-01-01T00:00:00.000Z")
const END = new Date("2026-01-31T00:00:00.000Z")

describe("la fracción de periodo que queda", () => {
  it("al empezar queda entero", () => {
    expect(remainingRatio(START, END, START)).toBe("1.000000")
  })

  it("a la mitad queda la mitad", () => {
    expect(remainingRatio(START, END, new Date("2026-01-16T00:00:00.000Z"))).toBe("0.500000")
  })

  it("pasado el final no queda nada", () => {
    expect(remainingRatio(START, END, new Date("2026-02-10T00:00:00.000Z"))).toBe("0.000000")
  })

  it("un periodo sin duración no prorratea", () => {
    expect(remainingRatio(START, START, START)).toBe("0.000000")
  })
})

describe("el cambio de plan se prorratea", () => {
  it("abona lo no consumido y cobra lo que queda", () => {
    // Escenario: «El cambio conserva los asientos», con el prorrateo que la spec exige.
    const result = prorate({
      periodStart: START,
      periodEnd: END,
      at: new Date("2026-01-16T00:00:00.000Z"),
      currentUnitAmount: money("100.00"),
      currentSeats: 5,
      nextUnitAmount: money("180.00"),
      nextSeats: 5,
    })

    expect(result.remainingRatio).toBe("0.500000")
    expect(formatMoney(result.credit)).toBe("250.00")
    expect(formatMoney(result.charge)).toBe("450.00")
    expect(formatMoney(result.due)).toBe("200.00")
  })

  it("bajar de plan deja saldo a favor, no un cobro", () => {
    const result = prorate({
      periodStart: START,
      periodEnd: END,
      at: new Date("2026-01-16T00:00:00.000Z"),
      currentUnitAmount: money("200.00"),
      currentSeats: 1,
      nextUnitAmount: money("100.00"),
      nextSeats: 1,
    })

    expect(formatMoney(result.due)).toBe("-50.00")
  })

  it("ampliar asientos cobra sólo los nuevos por el tiempo restante", () => {
    // Escenario: «Incorporar amplía cuando hace falta». Tres asientos pasan a cuatro a mitad de
    // periodo: se cobra un asiento por medio mes, no cuatro por un mes.
    const result = prorate({
      periodStart: START,
      periodEnd: END,
      at: new Date("2026-01-16T00:00:00.000Z"),
      currentUnitAmount: money("120.00"),
      currentSeats: 3,
      nextUnitAmount: money("120.00"),
      nextSeats: 4,
    })

    expect(formatMoney(result.due)).toBe("60.00")
  })

  it("cambiar el último día no cobra un periodo entero", () => {
    const result = prorate({
      periodStart: START,
      periodEnd: END,
      at: END,
      currentUnitAmount: money("100.00"),
      currentSeats: 2,
      nextUnitAmount: money("500.00"),
      nextSeats: 2,
    })

    expect(formatMoney(result.due)).toBe("0.00")
  })
})

describe("el descuento por volumen", () => {
  const POLICY = { thresholdSeats: 10, percent: percent("15") }

  it("se aplica por encima del umbral y cierra el código manual", () => {
    // Escenario: «Se aplica el descuento por volumen».
    const decision = decideDiscount(11, POLICY)

    expect(decision.percent).toBe(POLICY.percent)
    expect(decision.allowsPromotionCode).toBe(false)
  })

  it("en el umbral todavía no se aplica", () => {
    expect(decideDiscount(10, POLICY).percent).toBeNull()
  })

  it("por debajo del umbral se admite código manual", () => {
    // Escenario: «Por debajo del umbral se admite código manual».
    expect(decideDiscount(3, POLICY).allowsPromotionCode).toBe(true)
  })

  it("descontar es exacto, sin coma flotante", () => {
    expect(formatMoney(withDiscount(money("1200.00"), percent("15")))).toBe("1020.00")
    expect(formatMoney(withDiscount(money("1200.00"), null))).toBe("1200.00")
  })
})

describe("la mayoría de edad del representante", () => {
  const NOW = new Date("2026-08-18T00:00:00.000Z")

  it("acepta a quien los cumple justo hoy", () => {
    expect(isOfLegalAge({ day: 18, month: 8, year: 2008 }, NOW)).toBe(true)
  })

  it("rechaza a quien los cumple mañana", () => {
    // Escenario: «Un representante menor de edad se rechaza».
    expect(isOfLegalAge({ day: 19, month: 8, year: 2008 }, NOW)).toBe(false)
  })

  it("rechaza a quien los cumple el mes que viene", () => {
    expect(isOfLegalAge({ day: 1, month: 9, year: 2008 }, NOW)).toBe(false)
  })

  it("acepta a quien los pasó de largo", () => {
    expect(isOfLegalAge({ day: 3, month: 5, year: 1980 }, NOW)).toBe(true)
  })
})

describe("la clave interbancaria", () => {
  it("acepta dieciocho dígitos", () => {
    expect(clabe.safeParse("012345678901234567").success).toBe(true)
  })

  it("rechaza una longitud distinta", () => {
    // Escenario: «Una CLABE con longitud incorrecta se rechaza».
    expect(clabe.safeParse("01234567890123456").success).toBe(false)
    expect(clabe.safeParse("0123456789012345678").success).toBe(false)
  })

  it("rechaza lo que no son dígitos", () => {
    expect(clabe.safeParse("01234567890123456X").success).toBe(false)
  })
})

describe("la contratación", () => {
  it("exige al menos un asiento", () => {
    const result = subscribeInput.safeParse({
      planId: "01a017ef-0000-7000-8000-000000000000",
      interval: "month",
      seats: 0,
    })

    expect(result.success).toBe(false)
  })

  it("admite un código promocional opcional", () => {
    const result = subscribeInput.safeParse({
      planId: "01a017ef-0000-7000-8000-000000000000",
      interval: "month",
      seats: 3,
      promotionCode: "BIENVENIDA",
    })

    expect(result.success).toBe(true)
  })
})
