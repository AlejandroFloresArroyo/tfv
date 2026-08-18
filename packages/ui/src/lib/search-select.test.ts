import { describe, expect, it } from "vitest"
import { filterOptions, type SelectOption } from "./search-select.ts"

const OPTIONS: readonly SelectOption[] = [
  { value: "1", label: "Producciones Ángel" },
  { value: "2", label: "Bodega Sótano", hint: "BOD-3" },
  { value: "3", label: "Almacén Central" },
  { value: "4", label: "angeles cinematográficos" },
]

describe("el filtrado del selector", () => {
  it("devuelve todo cuando no hay búsqueda", () => {
    expect(filterOptions(OPTIONS, "  ")).toHaveLength(4)
  })

  it("ignora los acentos, en los dos sentidos", () => {
    expect(filterOptions(OPTIONS, "angel").map((o) => o.value)).toEqual(["1", "4"])
    expect(filterOptions(OPTIONS, "ángeles").map((o) => o.value)).toEqual(["4"])
  })

  it("ignora las mayúsculas", () => {
    expect(filterOptions(OPTIONS, "CENTRAL").map((o) => o.value)).toEqual(["3"])
  })

  it("busca dentro de la palabra, no sólo al principio", () => {
    expect(filterOptions(OPTIONS, "tano").map((o) => o.value)).toEqual(["2"])
  })

  it("busca también por la pista, que es donde va el código", () => {
    expect(filterOptions(OPTIONS, "bod-3").map((o) => o.value)).toEqual(["2"])
  })

  it("conserva el orden que traía la lista", () => {
    expect(filterOptions(OPTIONS, "a").map((o) => o.value)).toEqual(["1", "2", "3", "4"])
  })
})
