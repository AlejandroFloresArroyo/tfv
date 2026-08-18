import { describe, expect, it } from "vitest"
import { allowedTransitions, isClosed, needsWindow } from "./quote-status.ts"

describe("allowedTransitions", () => {
  it("una cotización cerrada no ofrece ninguna salida", () => {
    // Escenario: «No se reabre una cotización cerrada».
    expect(allowedTransitions("completed", "rent")).toEqual([])
    expect(allowedTransitions("sold", "sale")).toEqual([])
    expect(allowedTransitions("canceled", "rent")).toEqual([])
  })

  it("entre estados abiertos se puede volver atrás", () => {
    expect(allowedTransitions("in_progress", "rent")).toContain("pending")
  })

  it("una venta no ofrece pasar a renta", () => {
    expect(allowedTransitions("in_progress", "sale")).not.toContain("in_rent")
  })

  it("una renta no ofrece darla por vendida", () => {
    expect(allowedTransitions("in_progress", "rent")).not.toContain("sold")
  })

  it("una renta en curso sólo termina o se cancela", () => {
    expect(allowedTransitions("in_rent", "rent")).toEqual(["completed", "canceled"])
  })
})

describe("isClosed", () => {
  it("reconoce los tres estados cerrados", () => {
    expect(isClosed("completed")).toBe(true)
    expect(isClosed("sold")).toBe(true)
    expect(isClosed("canceled")).toBe(true)
    expect(isClosed("in_rent")).toBe(false)
  })
})

describe("needsWindow", () => {
  it("una renta necesita fechas desde que hay equipo comprometido", () => {
    expect(needsWindow("in_progress", "rent")).toBe(true)
    expect(needsWindow("in_rent", "rent")).toBe(true)
    expect(needsWindow("completed", "rent")).toBe(true)
  })

  it("una venta no exige fechas nunca", () => {
    // Escenario: «Una venta no exige fechas».
    expect(needsWindow("completed", "sale")).toBe(false)
  })

  it("los primeros estados de una renta tampoco", () => {
    expect(needsWindow("pending", "rent")).toBe(false)
  })
})
