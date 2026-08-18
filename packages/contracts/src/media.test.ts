import { describe, expect, it } from "vitest"
import { classify, isCoherent, plannedVariants, splitFileName, UPLOAD_VARIANTS } from "./media.ts"

describe("el nombre de un archivo", () => {
  it("se parte en nombre y extensión", () => {
    expect(splitFileName("contrato.pdf")).toEqual({ base: "contrato", extension: "pdf" })
  })

  it("no vale sin extensión", () => {
    expect(splitFileName("documento")).toBeUndefined()
  })

  it("no vale sin nombre", () => {
    expect(splitFileName(".gitignore")).toBeUndefined()
  })

  it("se queda con la última extensión y la escribe en minúsculas", () => {
    expect(splitFileName("mi.foto.final.JPG")).toEqual({ base: "mi.foto.final", extension: "jpg" })
  })
})

describe("la clasificación por extensión", () => {
  it("reconoce las cuatro familias de la tabla", () => {
    expect(classify("jpg")).toBe("image")
    expect(classify("heic")).toBe("image")
    expect(classify("mov")).toBe("video")
    expect(classify("pdf")).toBe("document")
    expect(classify("xlsx")).toBe("file")
  })

  it("trata como archivo genérico lo que no reconoce", () => {
    // Escenario: «Una extensión desconocida es archivo genérico».
    expect(classify("sketch")).toBe("file")
  })
})

describe("los objetos que se van a escribir", () => {
  it("una imagen son cinco: el original y sus cuatro derivados", () => {
    expect(plannedVariants("image")).toEqual(UPLOAD_VARIANTS)
    expect(plannedVariants("image")).toHaveLength(5)
  })

  it("un video también son cinco, con sus portadas", () => {
    expect(plannedVariants("video")).toHaveLength(5)
  })

  it("lo demás es uno solo", () => {
    expect(plannedVariants("document")).toEqual(["original"])
    expect(plannedVariants("file")).toEqual(["original"])
  })

  it("el original va primero", () => {
    // Si la conexión se corta a mitad, lo escrito es el archivo y no una miniatura huérfana.
    expect(plannedVariants("image")[0]).toBe("original")
  })
})

describe("la coherencia entre lo declarado y la extensión", () => {
  it("admite otro formato de la misma familia", () => {
    // Quien sube puede declarar `image/png` para un `.jpg`: sigue siendo una imagen, y el
    // navegador de quien lo sube no siempre acierta con el tipo exacto.
    expect(isCoherent("image/png", "jpg")).toBe(true)
  })

  it("rechaza el tipo de otra familia", () => {
    expect(isCoherent("image/jpeg", "pdf")).toBe(false)
    expect(isCoherent("application/pdf", "mp4")).toBe(false)
  })

  it("admite lo que un sistema operativo declara mal sobre un archivo genérico", () => {
    // Windows declara un `.csv` como hoja de cálculo. Los dos son archivo genérico.
    expect(isCoherent("application/vnd.ms-excel", "csv")).toBe(true)
  })

  it("no admite un tipo vacío", () => {
    expect(isCoherent("", "jpg")).toBe(false)
  })
})
