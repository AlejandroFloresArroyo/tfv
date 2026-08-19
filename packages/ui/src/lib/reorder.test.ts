/**
 * Reordenar una lista, sin ratón.
 *
 * Mover la sección de la posición 3 a la 1 es **aritmética sobre un arreglo**, no un evento del
 * puntero. Escrito dentro del componente, lo único que puede ejercerlo es una persona arrastrando
 * con la mano, y entonces el caso raro —soltar sobre uno mismo, salirse de la lista, soltar sin
 * haber agarrado— no lo prueba nadie: se descubre el día que alguien pierde una sección.
 *
 * Aquí está la máquina entera, y las pruebas la mueven llamándola.
 */

import { describe, expect, it } from "vitest"
import { cancel, drag, drop, grab, move, nudge, preview, type Reorder } from "./reorder.ts"

const list = ["a", "b", "c", "d"] as const

describe("mover un elemento", () => {
  it("de la posición 3 a la 1 lo deja en la 1", () => {
    expect(move(list, 3, 1)).toEqual(["a", "d", "b", "c"])
  })

  it("hacia abajo lo deja en el índice pedido, no uno antes", () => {
    expect(move(list, 0, 2)).toEqual(["b", "c", "a", "d"])
  })

  it("al principio y al final", () => {
    expect(move(list, 2, 0)).toEqual(["c", "a", "b", "d"])
    expect(move(list, 0, 3)).toEqual(["b", "c", "d", "a"])
  })

  it("no pierde ni duplica elementos", () => {
    for (let from = 0; from < list.length; from++) {
      for (let to = 0; to < list.length; to++) {
        expect([...move(list, from, to)].sort()).toEqual([...list].sort())
      }
    }
  })

  it("mover a la misma posición no cambia nada", () => {
    expect(move(list, 2, 2)).toEqual(list)
  })

  it("un origen fuera de la lista se ignora en vez de vaciarla", () => {
    expect(move(list, 9, 0)).toEqual(list)
    expect(move(list, -1, 0)).toEqual(list)
  })

  it("un destino fuera de la lista se ajusta al extremo más cercano", () => {
    expect(move(list, 0, 99)).toEqual(["b", "c", "d", "a"])
    expect(move(list, 3, -5)).toEqual(["d", "a", "b", "c"])
  })

  it("no modifica el arreglo que recibe", () => {
    const original = [...list]
    move(original, 3, 0)
    expect(original).toEqual([...list])
  })

  it("una lista vacía o de uno no tiene nada que mover", () => {
    expect(move([], 0, 0)).toEqual([])
    expect(move(["solo"], 0, 1)).toEqual(["solo"])
  })
})

describe("desplazar con el teclado", () => {
  it("sube y baja una posición", () => {
    expect(nudge(2, -1, 4)).toBe(1)
    expect(nudge(2, 1, 4)).toBe(3)
  })

  it("en los extremos se queda donde está: no da la vuelta", () => {
    expect(nudge(0, -1, 4)).toBe(0)
    expect(nudge(3, 1, 4)).toBe(3)
  })
})

describe("la máquina del arrastre", () => {
  it("agarrar deja el elemento sobre sí mismo", () => {
    expect(grab(2, list.length)).toEqual({ from: 2, over: 2 })
  })

  it("agarrar algo que no está en la lista no agarra nada", () => {
    expect(grab(9, list.length)).toBeNull()
    expect(grab(-1, list.length)).toBeNull()
  })

  it("pasar por encima de otro mueve el destino, no el origen", () => {
    const grabbed = grab(3, list.length)
    expect(drag(grabbed, 1, list.length)).toEqual({ from: 3, over: 1 })
  })

  it("pasar por encima sin haber agarrado nada no empieza un arrastre", () => {
    expect(drag(null, 1, list.length)).toBeNull()
  })

  it("pasar por fuera de la lista deja el destino donde estaba", () => {
    const state = drag(grab(3, list.length), 1, list.length)
    expect(drag(state, 99, list.length)).toEqual({ from: 3, over: 1 })
  })

  it("la vista previa enseña dónde caería antes de soltar", () => {
    const state = drag(grab(3, list.length), 1, list.length)
    expect(preview(list, state)).toEqual(["a", "d", "b", "c"])
  })

  it("sin arrastre en curso la vista previa es la lista tal cual", () => {
    expect(preview(list, null)).toEqual(list)
  })

  it("soltar aplica el movimiento y termina el arrastre", () => {
    const state = drag(grab(3, list.length), 1, list.length)
    const result = drop(list, state)

    expect(result.items).toEqual(["a", "d", "b", "c"])
    expect(result.moved).toBe(true)
    expect(result.state).toBeNull()
  })

  it("soltar sobre uno mismo no cuenta como movimiento", () => {
    const result = drop(list, grab(2, list.length))

    expect(result.items).toEqual(list)
    expect(result.moved).toBe(false)
    expect(result.state).toBeNull()
  })

  it("soltar sin arrastre en curso deja la lista intacta", () => {
    const result = drop(list, null)

    expect(result.items).toEqual(list)
    expect(result.moved).toBe(false)
  })

  it("cancelar deja la lista como estaba", () => {
    const state: Reorder = drag(grab(3, list.length), 0, list.length)
    expect(cancel()).toBeNull()
    expect(preview(list, cancel())).toEqual(list)
    // El estado abandonado no se aplicó a ninguna parte: la lista sigue siendo la de entrada.
    expect(state?.over).toBe(0)
    expect(list).toEqual(["a", "b", "c", "d"])
  })
})
