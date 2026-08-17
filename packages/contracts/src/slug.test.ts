import { describe, expect, it } from "vitest"
import { slugCandidate, slugify } from "./slug.ts"

describe("identificador legible", () => {
  it("retira los diacríticos sin retirar la letra", () => {
    // Con la forma descompuesta de Unicode la tilde es un carácter aparte, y borrar el rango
    // equivocado se lleva la vocal: «iluminacin» en lugar de «iluminacion».
    expect(slugify("Iluminación")).toBe("iluminacion")
    expect(slugify("Cámara Réflex")).toBe("camara-reflex")
    expect(slugify("Ñandú")).toBe("nandu")
  })

  it("colapsa todo lo que no sea letra o número en un solo guion", () => {
    expect(slugify("Renta  Fílmica / del Norte")).toBe("renta-filmica-del-norte")
    expect(slugify("Grupo (Norte) S.A. de C.V.")).toBe("grupo-norte-s-a-de-c-v")
  })

  it("no empieza ni termina en guion", () => {
    expect(slugify("  ¡Luces!  ")).toBe("luces")
  })

  it("no deja un guion al final después de truncar", () => {
    // El corte cae en mitad de una palabra y deja el separador huérfano.
    const largo = `${"a".repeat(59)} bcdef`
    expect(slugify(largo).endsWith("-")).toBe(false)
  })

  it("un nombre sin caracteres utilizables cae en el respaldo", () => {
    // Un identificador vacío no se puede poner en una dirección.
    expect(slugify("¿?!")).toBe("sin-nombre")
    expect(slugify("···", "almacen")).toBe("almacen")
  })

  it("el primer candidato no lleva sufijo, y el segundo empieza en dos", () => {
    expect(slugCandidate("iluminacion", 0)).toBe("iluminacion")
    expect(slugCandidate("iluminacion", 1)).toBe("iluminacion-2")
    expect(slugCandidate("iluminacion", 2)).toBe("iluminacion-3")
  })
})
