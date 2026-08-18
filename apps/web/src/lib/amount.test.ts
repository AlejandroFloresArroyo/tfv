/**
 * La presentación de importes.
 *
 * Es la última pieza antes del papel: aquí un fallo no se ve como un error, se ve como una cifra
 * que el cliente lee mal.
 */

import { describe, expect, it } from "vitest"
import { formatAmount } from "./amount.ts"

const formatterOf = (locale: string) => {
  const intl = new Intl.NumberFormat(locale)
  return { number: (value: number | bigint) => intl.format(value) }
}

const es = formatterOf("es")
const en = formatterOf("en")

describe("presentación de importes", () => {
  it("usa el separador decimal del idioma, no siempre un punto", () => {
    // En español el punto ya separa los miles: `10.500.00` es la misma marca para dos cosas.
    expect(formatAmount("10500.00", es)).toBe("10.500,00")
    expect(formatAmount("10500.00", en)).toBe("10,500.00")
  })

  it("conserva los dos decimales exactos que trae la cadena", () => {
    expect(formatAmount("0.05", en)).toBe("0.05")
    expect(formatAmount("1234.5", en)).toBe("1,234.50")
    expect(formatAmount("7", en)).toBe("7.00")
  })

  it("marca el negativo con el signo menos, no con un guion", () => {
    expect(formatAmount("-1234.56", en)).toBe("−1,234.56")
  })

  it("no pierde precisión con un importe que no cabe en un flotante", () => {
    // Nadie cotiza esto, pero pasar por `Number` para agrupar es el hábito que un día redondea.
    expect(formatAmount("9007199254740993.01", en)).toBe("9,007,199,254,740,993.01")
  })
})
