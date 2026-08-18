/**
 * Las cuatro funciones del árbol compartido.
 *
 * Se prueban porque las cuatro tienen una suposición que no se ve leyéndolas: que el aplanado va en
 * profundidad primero —de lo que depende que excluir un subárbol baste con una pasada—, y que sólo
 * se piden las hijas de quien declara tenerlas. Si alguna de las dos se rompe, la interfaz sigue
 * funcionando y lo que falla es el número que aparece en una confirmación de borrado.
 */

import { describe, expect, it, vi } from "vitest"
import { findTreePath, flattenTree, subtreeSize, type TreeNode, withoutSubtree } from "./tree.ts"

interface Node extends TreeNode {
  readonly id: string
  readonly parentId: string | null
  readonly name: string
  readonly childCount: number
}

/**
 * Un árbol de mentira con la misma forma que los de verdad.
 *
 * ```
 * camaras ─┬─ lentes ─── primos
 *          └─ cuerpos
 * grip
 * ```
 */
const TREE: Record<string, Node[]> = {
  raiz: [node("camaras", null, 2), node("grip", null, 0)],
  camaras: [node("lentes", "camaras", 1), node("cuerpos", "camaras", 0)],
  lentes: [node("primos", "lentes", 0)],
}

function node(id: string, parentId: string | null, childCount: number): Node {
  return { id, parentId, name: id, childCount }
}

function childrenOf(parentId: string | null): Promise<readonly Node[]> {
  return Promise.resolve(TREE[parentId ?? "raiz"] ?? [])
}

describe("flattenTree", () => {
  it("devuelve el árbol entero en profundidad primero, con su sangría", async () => {
    const flat = await flattenTree(childrenOf, (item) => item.name)

    expect(flat.map((option) => `${option.depth}:${option.id}`)).toEqual([
      "0:camaras",
      "1:lentes",
      "2:primos",
      "1:cuerpos",
      "0:grip",
    ])
  })

  it("no pide las hijas de una hoja", async () => {
    const spy = vi.fn(childrenOf)
    await flattenTree(spy, (item) => item.name)

    // Tres niveles con descendencia —la raíz, «camaras» y «lentes»— y ni una petición más.
    expect(spy.mock.calls.map(([parentId]) => parentId)).toEqual([null, "camaras", "lentes"])
  })
})

describe("findTreePath", () => {
  it("devuelve el camino desde la raíz hasta el nodo", async () => {
    const path = await findTreePath(childrenOf, "primos")

    expect(path?.map((item) => item.id)).toEqual(["camaras", "lentes", "primos"])
  })

  it("una raíz es un camino de un solo nodo", async () => {
    expect((await findTreePath(childrenOf, "grip"))?.map((item) => item.id)).toEqual(["grip"])
  })

  it("devuelve nulo cuando el nodo no está en el árbol", async () => {
    expect(await findTreePath(childrenOf, "vestuario")).toBeNull()
  })
})

describe("withoutSubtree", () => {
  it("quita el nodo y todo lo que cuelga de él, a cualquier profundidad", async () => {
    const flat = await flattenTree(childrenOf, (item) => item.name)

    expect(withoutSubtree(flat, "camaras").map((option) => option.id)).toEqual(["grip"])
  })

  it("una hoja sólo se quita a sí misma", async () => {
    const flat = await flattenTree(childrenOf, (item) => item.name)

    expect(withoutSubtree(flat, "primos").map((option) => option.id)).toEqual([
      "camaras",
      "lentes",
      "cuerpos",
      "grip",
    ])
  })
})

describe("subtreeSize", () => {
  it("cuenta el nodo y sus descendientes", async () => {
    const flat = await flattenTree(childrenOf, (item) => item.name)

    // «camaras», «lentes», «primos» y «cuerpos».
    expect(subtreeSize(flat, "camaras")).toBe(4)
    expect(subtreeSize(flat, "lentes")).toBe(2)
    expect(subtreeSize(flat, "grip")).toBe(1)
  })
})
