import { describe, expect, it } from "vitest"
import { DERIVATIVE_EDGE, derivativeSizes, fitWithin, plannedVariants } from "./file-derivatives.ts"

describe("qué objetos tiene cada archivo", () => {
  it("una imagen son cinco: el original y sus cuatro derivados", () => {
    expect(plannedVariants("image")).toEqual(["original", "large", "medium", "small", "thumbnail"])
  })

  it("un video también son cinco: el video y sus cuatro portadas", () => {
    expect(plannedVariants("video")).toEqual(plannedVariants("image"))
  })

  it("un documento, un archivo o una firma son uno solo", () => {
    expect(plannedVariants("document")).toEqual(["original"])
    expect(plannedVariants("file")).toEqual(["original"])
    expect(plannedVariants("signature")).toEqual(["original"])
  })
})

describe("la reducción antes de subir", () => {
  it("reduce conservando la proporción", () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin({ width: 3000, height: 4000 }, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it("no amplía lo pequeño: una imagen de 400 no se estira a 1600", () => {
    expect(fitWithin({ width: 400, height: 300 }, 1600)).toEqual({ width: 400, height: 300 })
  })

  it("deja intacto lo que mide justo el objetivo", () => {
    expect(fitWithin({ width: 1600, height: 900 }, 1600)).toEqual({ width: 1600, height: 900 })
  })

  it("nunca devuelve un lado de cero, por muy apaisado que venga", () => {
    // Un panorama de 6000×20 reducido a la miniatura da 0.53 de alto. Un `canvas` de altura cero
    // no dibuja nada, y lo que se sube es un archivo vacío.
    expect(fitWithin({ width: 6000, height: 20 }, 160)).toEqual({ width: 160, height: 1 })
  })

  it("devuelve enteros, que es lo único que un lienzo entiende", () => {
    const { width, height } = fitWithin({ width: 1000, height: 333 }, 300)
    expect(Number.isInteger(width) && Number.isInteger(height)).toBe(true)
    expect({ width, height }).toEqual({ width: 300, height: 100 })
  })

  it("no se inventa nada con medidas imposibles", () => {
    expect(fitWithin({ width: 0, height: 0 }, 160)).toEqual({ width: 0, height: 0 })
  })
})

describe("los cuatro tamaños de un original", () => {
  it("van de mayor a menor y ninguno supera al original", () => {
    const sizes = derivativeSizes({ width: 4000, height: 2000 })

    expect(sizes).toEqual({
      large: { width: 1600, height: 800 },
      medium: { width: 800, height: 400 },
      small: { width: 400, height: 200 },
      thumbnail: { width: 160, height: 80 },
    })
  })

  it("un original pequeño se copia tal cual en los derivados que lo superan", () => {
    // Es el escenario literal de la spec: el derivado mediano conserva las dimensiones del
    // original y no se escala hacia arriba.
    const sizes = derivativeSizes({ width: 400, height: 300 })

    expect(sizes.large).toEqual({ width: 400, height: 300 })
    expect(sizes.medium).toEqual({ width: 400, height: 300 })
    expect(sizes.small).toEqual({ width: 400, height: 300 })
    expect(sizes.thumbnail).toEqual({ width: 160, height: 120 })
  })

  it("los bordes van en orden decreciente", () => {
    expect(DERIVATIVE_EDGE.large).toBeGreaterThan(DERIVATIVE_EDGE.medium)
    expect(DERIVATIVE_EDGE.medium).toBeGreaterThan(DERIVATIVE_EDGE.small)
    expect(DERIVATIVE_EDGE.small).toBeGreaterThan(DERIVATIVE_EDGE.thumbnail)
  })
})
