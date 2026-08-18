import { describe, expect, it } from "vitest"
import { allowedTransitions, isClosed, linesFrozen, needsWindow } from "./quote-status.ts"

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

describe("las líneas se congelan al salir el equipo", () => {
  it("una renta en curso no se edita", () => {
    // No es burocracia: bajar una cantidad soltaría el vínculo de una unidad que está en un rodaje,
    // y el inventario pasaría a decir que está libre.
    expect(linesFrozen("in_rent", "rent")).toBe(true)
  })

  it("una renta completada tampoco, porque el equipo puede seguir fuera", () => {
    expect(linesFrozen("completed", "rent")).toBe(true)
  })

  it("una cotización abierta sin equipo fuera sí se edita", () => {
    expect(linesFrozen("pre_quote", "rent")).toBe(false)
    expect(linesFrozen("pending", "rent")).toBe(false)
    expect(linesFrozen("in_progress", "rent")).toBe(false)
  })

  it("una venta sólo se congela al cerrarse", () => {
    // «En renta» no existe para una venta, y «completada» es cerrada de todos modos.
    expect(linesFrozen("in_progress", "sale")).toBe(false)
    expect(linesFrozen("sold", "sale")).toBe(true)
  })

  it("una cotización cerrada nunca se edita", () => {
    expect(linesFrozen("canceled", "rent")).toBe(true)
    expect(linesFrozen("completed", "sale")).toBe(true)
  })
})
