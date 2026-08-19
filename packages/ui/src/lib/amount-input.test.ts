import { describe, expect, it } from "vitest"
import { sanitizeAmount, toDecimalString } from "./amount-input.ts"

describe("lo que se admite al teclear", () => {
  it("deja pasar los dígitos y un separador", () => {
    expect(sanitizeAmount("1234.5")).toBe("1234.5")
  })

  it("descarta el separador de millar del idioma en lugar de confundirlo con el decimal", () => {
    // Con punto decimal —`es-MX`, `en`— la coma agrupa: `12,345.678` son doce mil trescientos
    // cuarenta y cinco, no doce con treinta y cuatro.
    expect(sanitizeAmount("12,345.678")).toBe("12345.67")

    // Con coma decimal —`es` a la europea— es al revés, y se escribe con coma.
    expect(sanitizeAmount("12.345,678", { decimal: "," })).toBe("12345,67")
  })

  it("escribe con el separador del idioma, para que la siguiente tecla no lo destruya", () => {
    // Es el paso que faltaba: si el campo enseña `12.` y luego lee el punto como millar, la
    // pulsación siguiente se come el decimal y `12,3` acaba siendo `123`.
    expect(sanitizeAmount(sanitizeAmount("12,", { decimal: "," }) + "3", { decimal: "," })).toBe(
      "12,3",
    )
    expect(sanitizeAmount(sanitizeAmount("12.", {}) + "3", {})).toBe("12.3")
  })

  it("admite la coma como decimal cuando es la del idioma", () => {
    expect(sanitizeAmount("1234,5", { decimal: "," })).toBe("1234,5")
    expect(sanitizeAmount("1234.5")).toBe("1234.5")
  })

  it("descarta lo que no es número", () => {
    expect(sanitizeAmount("1a2$3 ")).toBe("123")
  })

  it("no admite un tercer decimal", () => {
    expect(sanitizeAmount("12.345")).toBe("12.34")
  })

  it("se queda con el primer separador decimal y descarta los demás", () => {
    expect(sanitizeAmount("1.2.3")).toBe("1.23")
  })

  it("conserva el separador recién tecleado, sin decimales todavía", () => {
    expect(sanitizeAmount("12.")).toBe("12.")
    expect(sanitizeAmount("12,", { decimal: "," })).toBe("12,")
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

  it("traduce el separador del idioma al que viaja en la petición", () => {
    expect(toDecimalString("12345,67", ",")).toBe("12345.67")
  })

  it("no devuelve nada cuando no hay número", () => {
    expect(toDecimalString("")).toBeUndefined()
    expect(toDecimalString(".")).toBeUndefined()
    expect(toDecimalString("-")).toBeUndefined()
  })

  it("da algo que el esquema del servicio acepta", () => {
    const pattern = /^-?\d+(\.\d{1,2})?$/
    for (const raw of ["1,234.5", "0", "0.05", "-30.25", "007.10"]) {
      const value = toDecimalString(sanitizeAmount(raw, { negative: true }))
      expect(value).toBeDefined()
      expect(value).toMatch(pattern)
    }

    for (const raw of ["1.234,5", "0", "0,05", "-30,25", "007,10"]) {
      const written = sanitizeAmount(raw, { negative: true, decimal: "," })
      expect(toDecimalString(written, ",")).toMatch(pattern)
    }
  })
})
