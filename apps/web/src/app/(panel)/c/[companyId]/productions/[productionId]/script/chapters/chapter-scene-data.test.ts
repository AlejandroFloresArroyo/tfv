/**
 * `resolveBreakdownLevels` en rojo antes que en verde.
 *
 * La estructura completa llega **entera** en una sola llamada a `/breakdown` — es la ruta que la
 * pantalla usa a propósito para no componer una petición por capítulo como hace el árbol de
 * categorías (`components/tree/tree.ts`, `findTreePath`). Lo que se prueba aquí es que, a partir de
 * esa única respuesta, se puede recomponer en memoria lo que `TreeBrowser` necesita: las raíces, la
 * ruta hasta el nodo elegido —capítulo o escena, son dos profundidades y no una jerarquía
 * arbitraria— y las hijas directas de ese nodo.
 */

import { describe, expect, it } from "vitest"
import type { ChapterRow, ProductionBreakdown, SceneRow } from "../../../production.ts"
import { nextIndexAfter, resolveBreakdownLevels } from "./chapter-scene-data.ts"

function chapter(
  id: string,
  index: number,
  scenes: SceneRow[],
): ChapterRow & { scenes: SceneRow[] } {
  return {
    id,
    productionId: "prod-1",
    scriptId: null,
    name: `Capítulo ${index}`,
    synopsis: "",
    index,
    responsibleId: null,
    responsibleName: null,
    sceneCount: scenes.length,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    scenes,
  }
}

function scene(id: string, chapterId: string, chapterIndex: number, index: number): SceneRow {
  return {
    id,
    chapterId,
    chapterIndex,
    name: `Escena ${index}`,
    synopsis: "",
    index,
    label: `${chapterIndex}.${index}`,
    workflowCount: 0,
    synopsisEditedAt: null,
    missingFromLastSync: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

const escena11 = scene("esc-1-1", "cap-1", 1, 1)
const escena12 = scene("esc-1-2", "cap-1", 1, 2)

const BREAKDOWN: ProductionBreakdown = {
  chapters: [chapter("cap-1", 1, [escena11, escena12]), chapter("cap-2", 2, [])],
}

describe("resolveBreakdownLevels", () => {
  it("sin nodo elegido, las raíces son los capítulos con su recuento de escenas como childCount", () => {
    const levels = resolveBreakdownLevels(BREAKDOWN, undefined)

    expect(levels.roots.map((root) => [root.id, root.childCount])).toEqual([
      ["cap-1", 2],
      ["cap-2", 0],
    ])
    expect(levels.path).toEqual([])
    expect(levels.children).toEqual([])
  })

  it("con un capítulo elegido, la ruta es ese capítulo y las hijas son sus escenas", () => {
    const levels = resolveBreakdownLevels(BREAKDOWN, "cap-1")

    expect(levels.path.map((node) => node.id)).toEqual(["cap-1"])
    expect(levels.children.map((node) => node.id)).toEqual(["esc-1-1", "esc-1-2"])
    // Las escenas son hojas: no tienen hijas propias que ofrecer.
    expect(levels.children.every((node) => node.childCount === 0)).toBe(true)
  })

  it("con una escena elegida, la ruta baja hasta ella por su capítulo y no tiene hijas", () => {
    const levels = resolveBreakdownLevels(BREAKDOWN, "esc-1-2")

    expect(levels.path.map((node) => node.id)).toEqual(["cap-1", "esc-1-2"])
    expect(levels.children).toEqual([])
  })

  it("con un capítulo sin escenas, las hijas son una lista vacía y no un error", () => {
    const levels = resolveBreakdownLevels(BREAKDOWN, "cap-2")

    expect(levels.path.map((node) => node.id)).toEqual(["cap-2"])
    expect(levels.children).toEqual([])
  })

  it("con un identificador que no existe en ningún capítulo, la ruta queda vacía", () => {
    const levels = resolveBreakdownLevels(BREAKDOWN, "no-existe")

    expect(levels.path).toEqual([])
    expect(levels.children).toEqual([])
    // Las raíces se siguen ofreciendo: la columna de la izquierda no depende de haber encontrado el nodo.
    expect(levels.roots).toHaveLength(2)
  })

  it("una escena de otro capítulo no se cuela en la ruta del capítulo equivocado", () => {
    const levels = resolveBreakdownLevels(BREAKDOWN, "esc-1-1")

    expect(levels.path.map((node) => node.id)).toEqual(["cap-1", "esc-1-1"])
    expect(levels.path[0]?.id).not.toBe("cap-2")
  })
})

describe("nextIndexAfter", () => {
  it("sin ningún índice vivo, propone el primero", () => {
    expect(nextIndexAfter([])).toBe(1)
  })

  it("propone el último vivo más uno", () => {
    expect(nextIndexAfter([1, 2, 3])).toBe(4)
  })

  it("no rellena el hueco que deja un borrado: sigue después del más alto", () => {
    // El capítulo 3 se borró; quedan el 1, el 2 y el 4. El siguiente es el 5, no el 3.
    expect(nextIndexAfter([1, 2, 4])).toBe(5)
  })
})
