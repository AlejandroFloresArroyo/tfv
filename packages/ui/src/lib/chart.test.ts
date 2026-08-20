import { describe, expect, it } from "vitest"
import { barRatios, MIN_BAR, shareOf } from "./chart.ts"

describe("las proporciones de una gráfica de barras", () => {
  it("escala todas contra el mismo máximo", () => {
    expect(barRatios(["100.00", "50.00", "25.00"])).toEqual([1, 0.5, 0.25])
  })

  it("con todo en cero no dibuja nada", () => {
    expect(barRatios(["0.00", "0.00"])).toEqual([0, 0])
  })

  it("sin barras no falla", () => {
    expect(barRatios([])).toEqual([])
  })

  it("da suelo a lo que no es cero, para que se vea que hay algo", () => {
    const [grande, pequeño] = barRatios(["1000000.00", "100.00"])

    expect(grande).toBe(1)
    expect(pequeño).toBe(MIN_BAR)
  })

  it("el cero sigue siendo cero: el suelo no inventa gasto", () => {
    expect(barRatios(["1000.00", "0.00"])).toEqual([1, 0])
  })

  it("compara por tamaño, no por signo", () => {
    // Una diferencia negativa mide lo que mide. Lo que dice que es desfavorable es la palabra.
    expect(barRatios(["-100.00", "50.00"])).toEqual([1, 0.5])
  })

  it("un importe ilegible dibuja barra vacía en vez de romper la escala", () => {
    expect(barRatios(["100.00", "no es un número"])).toEqual([1, 0])
  })
})

describe("el peso de una parte", () => {
  it("da el porcentaje con un decimal", () => {
    expect(shareOf("250.00", "1000.00")).toBe(25)
    expect(shareOf("333.00", "1000.00")).toBe(33.3)
  })

  it("con total cero no hay conjunto del que ser parte", () => {
    expect(shareOf("10.00", "0.00")).toBe(0)
  })
})
