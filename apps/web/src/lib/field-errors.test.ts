import { describe, expect, it } from "vitest"
import { z } from "zod"
import { fieldErrors } from "./field-errors.ts"

const schema = z.object({
  name: z.string().trim().min(1).max(10),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/),
  kind: z.enum(["box", "clothing"]).optional(),
})

/** En la pantalla es la capa de traducción; aquí, el propio código para poder mirarlo. */
const say = (code: string) => code

describe("los errores de un esquema, campo a campo", () => {
  it("no devuelve nada cuando todo está bien", () => {
    expect(fieldErrors(schema.safeParse({ name: "Silla", price: "10.00" }), say)).toEqual({})
  })

  it("señala el campo vacío como obligatorio", () => {
    const errors = fieldErrors(schema.safeParse({ name: "", price: "10.00" }), say)

    expect(errors.name).toBe("required")
  })

  it("distingue el campo ausente del campo con formato equivocado", () => {
    const missing = fieldErrors(schema.safeParse({ price: "10.00" }), say)
    const malformed = fieldErrors(schema.safeParse({ name: "Silla", price: "diez" }), say)

    expect(missing.name).toBe("required")
    expect(malformed.price).toBe("invalid")
  })

  it("distingue lo demasiado largo", () => {
    const errors = fieldErrors(schema.safeParse({ name: "x".repeat(11), price: "1" }), say)

    expect(errors.tooLong).toBeUndefined()
    expect(errors.name).toBe("tooLong")
  })

  it("se queda con el primer error de cada campo", () => {
    const errors = fieldErrors(schema.safeParse({ name: "", price: "" }), say)

    expect(Object.keys(errors).sort()).toEqual(["name", "price"])
  })

  it("nombra los campos anidados por su camino", () => {
    const nested = z.object({ clothing: z.object({ size: z.string().min(1) }) })
    const errors = fieldErrors(nested.safeParse({ clothing: { size: "" } }), say)

    expect(errors["clothing.size"]).toBe("required")
  })
})
