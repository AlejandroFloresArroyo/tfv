import { describe, expect, it } from "vitest"
import { sanitizeAmount, toDecimalString } from "./amount-input.ts"

describe("lo que se admite al teclear", () => {
  it("deja pasar los dígitos y un separador", () => {
    expect(sanitizeAmount("1234.5")).toBe("1234.5")
  })

  it("admite la coma como separador decimal y la escribe como punto", () => {
    expect(sanitizeAmount("1234,5")).toBe("1234.5")
  })

  it("descarta lo que no es número", () => {
    expect(sanitizeAmount("1a2$3 ")).toBe("123")
  })

  it("no admite un tercer decimal", () => {
    expect(sanitizeAmount("12.345")).toBe("12.34")
  })

  it("se queda con el primer separador y descarta los demás", () => {
    expect(sanitizeAmount("1.2.3")).toBe("1.23")
  })

  it("conserva el separador recién tecleado, sin decimales todavía", () => {
    expect(sanitizeAmount("12.")).toBe("12.")
  })

  it("quita los ceros de la izquierda sin estropear el cero coma", () => {
    expect(sanitizeAmount("007")).toBe("7")
    expect(sanitizeAmount("0.5")).toBe("0.5")
    expect(sanitizeAmount("0")).toBe("0")
  })

  it("sólo admite el signo donde se permite", () => {
    expect(sanitizeAmount("-30", { negative: true })).toBe("-30")
    expect(sanitizeAmount("-30")).toBe("30")
    expect(sanitizeAmount("3-0", { negative: true })).toBe("30")
  })
})

describe("lo que se envía", () => {
  it("devuelve la cadena decimal tal cual, sin pasar por coma flotante", () => {
    expect(toDecimalString("1234.50")).toBe("1234.50")
  })

  it("completa lo que el motor no admitiría a medias", () => {
    expect(toDecimalString("12.")).toBe("12")
    expect(toDecimalString(".5")).toBe("0.5")
  })

  it("no devuelve nada cuando no hay número", () => {
    expect(toDecimalString("")).toBeUndefined()
    expect(toDecimalString(".")).toBeUndefined()
    expect(toDecimalString("-")).toBeUndefined()
  })

  it("da algo que el esquema del servicio acepta", () => {
    const pattern = /^-?\d+(\.\d{1,2})?$/
    for (const raw of ["1234,5", "0", "0.05", "-30,25", "007.10"]) {
      const value = toDecimalString(sanitizeAmount(raw, { negative: true }))
      expect(value).toBeDefined()
      expect(value).toMatch(pattern)
    }
  })
})
