/**
 * El presupuesto, sin base de datos.
 *
 * Transcritas de los escenarios de `openspec/specs/production-budget/spec.md`: los requisitos
 * «Lectura del presupuesto», «El presupuesto no se almacena» y «Se identifica el pago con tarjeta».
 * Son aritmética pura sobre dos listas, así que se prueban aquí y no contra un servidor.
 */

import { describe, expect, it } from "vitest"
import {
  type BudgetEntry,
  budgetAmounts,
  budgetByCategory,
  composeBudgetDocument,
  optionalPartialCardId,
  partialCardId,
} from "./budget.ts"

function entry(amount: string, categoryId: string | null = null): BudgetEntry {
  return { amount, categoryId, categoryName: categoryId }
}

describe("la diferencia del presupuesto", () => {
  it("resta lo gastado de lo presupuestado", () => {
    const amounts = budgetAmounts([entry("100000.00")], [entry("82500.00")])

    expect(amounts.totalPresupuestado).toBe("100000.00")
    expect(amounts.totalGastado).toBe("82500.00")
    expect(amounts.diferencia).toBe("17500.00")
    expect(amounts.isUnfavorable).toBe(false)
  })

  it("un sobrecoste da diferencia negativa, y la señala como desfavorable", () => {
    const amounts = budgetAmounts([entry("50000.00")], [entry("61000.00")])

    expect(amounts.diferencia).toBe("-11000.00")
    expect(amounts.isUnfavorable).toBe(true)
  })

  it("una producción sin movimientos da los tres importes en cero", () => {
    const amounts = budgetAmounts([], [])

    expect(amounts.totalPresupuestado).toBe("0.00")
    expect(amounts.totalGastado).toBe("0.00")
    expect(amounts.diferencia).toBe("0.00")
    expect(amounts.isUnfavorable).toBe(false)
  })

  it("gastar exactamente lo previsto no es desfavorable", () => {
    expect(budgetAmounts([entry("500.00")], [entry("500.00")]).isUnfavorable).toBe(false)
  })

  it("suma sin coma flotante", () => {
    // 0.1 + 0.2 en coma flotante da 0.30000000000000004. Aquí no.
    expect(budgetAmounts([entry("0.10"), entry("0.20")], []).totalPresupuestado).toBe("0.30")
  })
})

describe("el desglose por categoría", () => {
  it("reparte cada colección en su categoría y resta dentro de cada una", () => {
    const categories = budgetByCategory(
      [entry("1000.00", "arte"), entry("500.00", "vestuario")],
      [entry("1200.00", "arte")],
    )

    expect(categories.map((row) => row.categoryId)).toEqual(["arte", "vestuario"])
    expect(categories[0]).toMatchObject({
      budgeted: "1000.00",
      spent: "1200.00",
      difference: "-200.00",
      isUnfavorable: true,
    })
    expect(categories[1]).toMatchObject({ budgeted: "500.00", spent: "0.00" })
  })

  it("una categoría con gasto y sin ancla aparece igual", () => {
    const categories = budgetByCategory([], [entry("300.00", "utilería")])

    expect(categories).toHaveLength(1)
    expect(categories[0]).toMatchObject({ budgeted: "0.00", spent: "300.00", isUnfavorable: true })
  })

  it("lo no clasificado va al final, y va", () => {
    const categories = budgetByCategory(
      [entry("10.00", null), entry("5.00", "arte")],
      [entry("1.00", null)],
    )

    expect(categories.map((row) => row.categoryId)).toEqual(["arte", null])
  })

  it("las barras del desglose suman los totales generales", () => {
    const anchors = [entry("100.00", "arte"), entry("40.00", null)]
    const shoppings = [entry("30.00", "arte"), entry("70.00", "vestuario")]

    const total = budgetAmounts(anchors, shoppings)
    const categories = budgetByCategory(anchors, shoppings)

    const budgeted = categories.reduce((acc, row) => acc + Number(row.budgeted), 0)
    const spent = categories.reduce((acc, row) => acc + Number(row.spent), 0)

    expect(budgeted.toFixed(2)).toBe(total.totalPresupuestado)
    expect(spent.toFixed(2)).toBe(total.totalGastado)
  })
})

describe("la identificación parcial de la tarjeta", () => {
  it("conserva hasta cuatro dígitos", () => {
    expect(partialCardId("4242")).toBe("4242")
    expect(partialCardId(" 007 ")).toBe("007")
  })

  it("rechaza el número completo en vez de truncarlo", () => {
    expect(() => partialCardId("4242424242424242")).toThrow(TypeError)
  })

  it("rechaza lo que no son dígitos", () => {
    expect(() => partialCardId("42a2")).toThrow(TypeError)
    expect(() => partialCardId("")).toThrow(TypeError)
  })

  it("la versión opcional deja pasar la ausencia", () => {
    expect(optionalPartialCardId(null)).toBeNull()
    expect(optionalPartialCardId("")).toBeNull()
    expect(optionalPartialCardId("  ")).toBeNull()
    expect(optionalPartialCardId("1234")).toBe("1234")
  })
})

describe("el documento del presupuesto", () => {
  const identity = {
    productionName: "Serie Piloto",
    startsOn: null,
    endsOn: null,
    generatedAt: "2026-08-20T10:00:00.000Z",
  }

  it("lleva las dos listas, los dos totales, la diferencia y el desglose", () => {
    const document = composeBudgetDocument({
      identity,
      issuer: { name: "Estudios Mariposa" },
      production: { id: "p1", name: "Serie Piloto" },
      anchors: [
        {
          id: "a1",
          name: "Vestuario de época",
          description: "",
          amount: "100000.00",
          categoryId: "c1",
          categoryName: "Vestuario",
          responsibleName: null,
        },
      ],
      shoppings: [
        {
          id: "s1",
          name: "Telas",
          observations: "",
          amount: "82500.00",
          kind: "shopping",
          method: "card",
          cardLast4: "4242",
          isDeductible: true,
          occurredOn: null,
          providerName: null,
          categoryId: "c1",
          categoryName: "Vestuario",
          responsibleName: null,
          itemCount: 3,
        },
      ],
    })

    expect(document.kind).toBe("budget")
    expect(document.anchors).toHaveLength(1)
    expect(document.shoppings).toHaveLength(1)
    expect(document.amounts.diferencia).toBe("17500.00")
    expect(document.categories).toHaveLength(1)
    expect(document.categories[0]).toMatchObject({ budgeted: "100000.00", spent: "82500.00" })
  })

  it("una producción sin movimientos compone una hoja en cero, no una hoja rota", () => {
    const document = composeBudgetDocument({
      identity,
      issuer: { name: "Estudios Mariposa" },
      production: { id: "p1", name: "Serie Piloto" },
      anchors: [],
      shoppings: [],
    })

    expect(document.amounts.totalPresupuestado).toBe("0.00")
    expect(document.categories).toEqual([])
  })
})
