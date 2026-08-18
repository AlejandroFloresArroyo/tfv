import { describe, expect, it } from "vitest"
import { advance, back, errorsOf, goTo, start, submit, type WizardStep } from "./wizard.ts"

interface Product {
  name: string
  category: string
  price: string
}

const EMPTY: Product = { name: "", category: "", price: "" }

const STEPS: readonly WizardStep<Product>[] = [
  { id: "identidad", validate: (v) => (v.name ? {} : { name: "Falta el nombre" }) },
  { id: "clasificación", validate: (v) => (v.category ? {} : { category: "Falta la categoría" }) },
  { id: "dinero", validate: (v) => (v.price ? {} : { price: "Falta el precio" }) },
]

describe("el avance por pasos", () => {
  it("avanza con los pasos posteriores incompletos", () => {
    const state = advance(STEPS, { ...EMPTY, name: "Silla Luis XV" }, start())

    expect(state.current).toBe(1)
  })

  it("no avanza si el paso actual está incompleto", () => {
    const state = advance(STEPS, EMPTY, start())

    expect(state.current).toBe(0)
  })

  it("enseña el error del paso sólo después de intentar avanzar desde él", () => {
    const before = start()
    expect(errorsOf(STEPS, EMPTY, before).size).toBe(0)

    const after = advance(STEPS, EMPTY, before)
    expect(errorsOf(STEPS, EMPTY, after).get("identidad")).toEqual({ name: "Falta el nombre" })
  })

  it("no delata los pasos posteriores al avanzar", () => {
    const state = advance(STEPS, { ...EMPTY, name: "Silla" }, start())

    expect([...errorsOf(STEPS, { ...EMPTY, name: "Silla" }, state).keys()]).toEqual([])
  })
})

describe("volver atrás", () => {
  it("recuerda hasta dónde se había llegado", () => {
    const values: Product = { name: "Silla", category: "Mobiliario", price: "" }
    const second = advance(STEPS, values, advance(STEPS, values, start()))
    const returned = back(second)

    expect(returned.current).toBe(1)
    expect(goTo(returned, 2).current).toBe(2)
  })

  it("no salta a un paso al que nunca se llegó", () => {
    expect(goTo(start(), 2).current).toBe(0)
  })

  it("no retrocede más allá del primero", () => {
    expect(back(start()).current).toBe(0)
  })
})

describe("el envío", () => {
  it("señala todos los pasos con error, no sólo el actual", () => {
    const values: Product = { name: "Silla", category: "", price: "" }
    const { state, invalid } = submit(STEPS, values, advance(STEPS, values, start()))

    expect(invalid).toEqual(["clasificación", "dinero"])
    expect([...errorsOf(STEPS, values, state).keys()]).toEqual(["clasificación", "dinero"])
  })

  it("lleva al primer paso que falla", () => {
    const values: Product = { name: "", category: "", price: "" }
    const { state } = submit(STEPS, values, goTo(start(), 0))

    expect(state.current).toBe(0)
  })

  it("no señala nada cuando todo está completo", () => {
    const values: Product = { name: "Silla", category: "Mobiliario", price: "1200.00" }
    const { invalid } = submit(STEPS, values, start())

    expect(invalid).toEqual([])
  })
})
