/**
 * El carrito de una tienda pública.
 *
 * Ver `openspec/specs/storefront-checkout/spec.md`, requisito «Carrito de la tienda de almacén».
 *
 * Lo que se prueba aquí es la **aritmética del carrito**, que es la parte que se puede equivocar sin
 * que nadie lo note: añadir dos veces el mismo artículo, bajar una cantidad a cero, o que el carrito
 * de una tienda se mezcle con el de otra.
 */

import { describe, expect, it } from "vitest"
import { type CartItem, cartCount, mergeItem, withoutItem, withQuantity } from "./cart.ts"

const item = (refId: string, quantity = 1): CartItem => ({
  refId,
  quantity,
  name: `Artículo ${refId}`,
  unitPrice: "100.00",
  coverUrl: null,
})

describe("añadir al carrito", () => {
  it("un artículo nuevo se añade al final", () => {
    const cart = mergeItem([item("a")], item("b", 2))

    expect(cart).toHaveLength(2)
    expect(cart[1]?.quantity).toBe(2)
  })

  it("el mismo artículo dos veces suma cantidades, no duplica la línea", () => {
    // Dos líneas de la misma medida son una de la suma: separadas, el servidor apartaría para cada
    // una por su cuenta y la comprobación de existencia miraría media compra cada vez.
    const cart = mergeItem([item("a", 2)], item("a", 3))

    expect(cart).toHaveLength(1)
    expect(cart[0]?.quantity).toBe(5)
  })

  it("conserva lo que ya sabía del artículo y actualiza el precio que enseña", () => {
    const cart = mergeItem([item("a")], { ...item("a"), unitPrice: "150.00" })

    expect(cart[0]?.unitPrice).toBe("150.00")
  })
})

describe("cambiar la cantidad", () => {
  it("la fija en el artículo indicado y no toca los demás", () => {
    const cart = withQuantity([item("a", 1), item("b", 4)], "a", 3)

    expect(cart[0]?.quantity).toBe(3)
    expect(cart[1]?.quantity).toBe(4)
  })

  it("bajar a cero o menos retira el artículo", () => {
    // Un artículo con cantidad cero no es un artículo: dejarlo llegaría al servidor como una línea
    // que su validación rechaza, y el comprador vería un error donde esperaba un carrito.
    expect(withQuantity([item("a"), item("b")], "a", 0)).toHaveLength(1)
    expect(withQuantity([item("a")], "a", -2)).toHaveLength(0)
  })

  it("una cantidad fraccionaria se redondea hacia abajo", () => {
    expect(withQuantity([item("a")], "a", 2.7)[0]?.quantity).toBe(2)
  })
})

describe("quitar del carrito", () => {
  it("retira sólo el que se nombra", () => {
    const cart = withoutItem([item("a"), item("b")], "a")

    expect(cart).toHaveLength(1)
    expect(cart[0]?.refId).toBe("b")
  })
})

describe("el contador del carrito", () => {
  it("cuenta piezas y no líneas", () => {
    expect(cartCount([item("a", 2), item("b", 3)])).toBe(5)
    expect(cartCount([])).toBe(0)
  })
})
