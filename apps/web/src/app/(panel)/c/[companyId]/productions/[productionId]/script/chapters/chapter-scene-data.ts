import type { ChapterRow, ProductionBreakdown, SceneRow } from "../../../production.ts"

/**
 * De dónde saca la pantalla de capítulos y escenas los tres niveles que `TreeBrowser` necesita.
 *
 * **Sin nada de `next/headers` ni del alias `~/`.** Es lo que hace falta para que esto se pueda
 * probar con `vitest` en el entorno `node`: `vitest.config.ts` no resuelve `~/`, y `api.server.ts`
 * importa `next/headers`, que fuera de una petición real no tiene nada que devolver. La llamada a
 * la API vive en `chapter-scene-loader.ts`, aparte, y no aquí.
 *
 * ## Por qué esto no es `category-data.ts`
 *
 * El árbol de categorías baja **nivel a nivel**, con una petición por padre, porque el recurso de
 * categorías no tiene ruta que devuelva el árbol entero. El desglose del guion sí la tiene —
 * `GET …/breakdown` responde con todos los capítulos y, dentro de cada uno, todas sus escenas, de
 * una sola vez—, y el encargo es explícito: usarla, y no componer una petición por capítulo como
 * hace el otro árbol. Por eso aquí no hay `childrenOf` ni `findTreePath`: hay una sola llamada y
 * después todo se resuelve **en memoria**.
 *
 * ## Por qué la jerarquía no es genérica
 *
 * Categorías puede anidarse a cualquier profundidad; capítulos y escenas son exactamente dos
 * niveles, fijos por el propio modelo — una escena no tiene hijas y un capítulo no cuelga de otro
 * capítulo. `resolveBreakdownLevels` no recorre un árbol arbitrario: mira si el identificador es un
 * capítulo o, si no, si es una de sus escenas, y con eso basta.
 */

/** Un capítulo decorado con lo que `TreeBrowser` exige de un nodo: `parentId` y `childCount`. */
export interface ChapterNode extends ChapterRow {
  readonly kind: "chapter"
  readonly parentId: null
  /** El recuento de escenas, con el nombre que pide `TreeNode`. */
  readonly childCount: number
}

/** Una escena decorada igual. Es siempre una hoja: `childCount` es cero por construcción. */
export interface SceneNode extends SceneRow {
  readonly kind: "scene"
  readonly parentId: string
  readonly childCount: 0
}

export type BreakdownNode = ChapterNode | SceneNode

export function chapterNode(chapter: ChapterRow): ChapterNode {
  return { ...chapter, kind: "chapter", parentId: null, childCount: chapter.sceneCount }
}

export function sceneNode(scene: SceneRow): SceneNode {
  return { ...scene, kind: "scene", parentId: scene.chapterId, childCount: 0 }
}

export interface BreakdownLevels {
  /** Los capítulos de la producción. Es la columna de la izquierda. */
  readonly roots: readonly ChapterNode[]
  /** Del capítulo a lo elegido, ambos incluidos. Vacío si no hay nada elegido o no se encontró. */
  readonly path: readonly BreakdownNode[]
  /** Las escenas del capítulo elegido; vacío si lo elegido es una escena o no hay nada elegido. */
  readonly children: readonly BreakdownNode[]
}

/**
 * Resuelve los tres niveles a partir de la estructura completa ya en memoria. Pura y sin
 * peticiones: no hace falta más que recorrer lo que `/breakdown` ya trajo.
 */
export function resolveBreakdownLevels(
  breakdown: ProductionBreakdown,
  nodeId: string | undefined,
): BreakdownLevels {
  const roots = breakdown.chapters.map(chapterNode)

  if (nodeId === undefined) return { roots, path: [], children: [] }

  for (const chapter of breakdown.chapters) {
    if (chapter.id === nodeId) {
      return { roots, path: [chapterNode(chapter)], children: chapter.scenes.map(sceneNode) }
    }

    const scene = chapter.scenes.find((candidate) => candidate.id === nodeId)
    if (scene !== undefined) {
      return { roots, path: [chapterNode(chapter), sceneNode(scene)], children: [] }
    }
  }

  return { roots, path: [], children: [] }
}

/**
 * El índice que se propone para un capítulo o una escena nuevos: el último vivo más uno, nunca el
 * primer hueco libre. Es la misma cuenta que hacen `chapterIndexHint` y `sceneIndexHint` en el
 * servidor, y se puede hacer aquí sin pedirla aparte porque `/breakdown` ya trae todos los índices
 * vivos —de capítulo o de escena— sin paginar: no hay hueco que la respuesta esconda.
 */
export function nextIndexAfter(indices: readonly number[]): number {
  return indices.length === 0 ? 1 : Math.max(...indices) + 1
}
