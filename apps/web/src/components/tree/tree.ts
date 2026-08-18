/**
 * El vocabulario común de los dos árboles del almacén.
 *
 * Ver `openspec/specs/category-trees/spec.md` y el árbol de ubicaciones de
 * `openspec/specs/warehouses-and-storage/spec.md`. Son la misma jerarquía descrita dos veces:
 * raíces, hijas que se piden por su padre, re-parentado, rechazo de ciclos y borrado recursivo que
 * **no** se lleva lo clasificado.
 *
 * Aquí vive sólo lo que las dos comparten de verdad. Lo que cambia —el código de una ubicación, el
 * identificador legible de una categoría, qué se enumera antes de borrar— entra por una ranura y no
 * por una bandera: un componente con seis banderas se lee peor que dos componentes.
 */

/**
 * Lo mínimo que un nodo tiene que traer para poder navegarse.
 *
 * `childCount` no es decoración: es lo que permite **no** pedir las hijas de una hoja. Sin él, el
 * aplanado de más abajo haría una petición por nodo en lugar de una por nodo con descendencia.
 */
export interface TreeNode {
  readonly id: string
  readonly parentId: string | null
  readonly name: string
  readonly childCount: number
}

/** Un nodo del árbol entero, ya aplanado, con la profundidad con la que se sangra al pintarlo. */
export interface TreeOption {
  readonly id: string
  readonly parentId: string | null
  readonly label: string
  readonly depth: number
}

/**
 * El árbol entero, aplanado en orden de lectura.
 *
 * Hace falta para elegir padre: un desplegable de destinos no se construye con un solo nivel. Y
 * cuesta **una petición por nodo con descendencia**, porque ninguno de los dos recursos sabe
 * devolver el árbol completo de una vez; se pide nivel a nivel, que es como está declarado el
 * listado. Los hermanos se piden a la vez, así que lo que se espera es la profundidad, no el censo.
 *
 * Se paga al abrir el diálogo y no al pintar la pantalla, que es la diferencia entre un coste
 * ocasional y uno en cada visita.
 */
export async function flattenTree<T extends TreeNode>(
  childrenOf: (parentId: string | null) => Promise<readonly T[]>,
  label: (node: T) => string,
): Promise<TreeOption[]> {
  async function walk(parentId: string | null, depth: number): Promise<TreeOption[]> {
    const nodes = await childrenOf(parentId)

    const subtrees = await Promise.all(
      nodes.map((node) => (node.childCount > 0 ? walk(node.id, depth + 1) : Promise.resolve([]))),
    )

    return nodes.flatMap((node, index) => [
      { id: node.id, parentId: node.parentId, label: label(node), depth },
      ...(subtrees[index] ?? []),
    ])
  }

  return walk(null, 0)
}

/**
 * El camino desde la raíz hasta un nodo, buscándolo hacia abajo.
 *
 * Las ubicaciones **no necesitan esto**: tienen su propia ruta —`GET …/storages/{id}/path`—, que la
 * resuelve el servidor con una consulta recursiva y en una sola petición. Las categorías no la
 * tienen, ni tienen forma de pedir una suelta por su identificador, así que la única manera de
 * situar la seleccionada es bajar desde las raíces hasta encontrarla. Está anotado en
 * `openspec/HALLAZGOS.md`; el día que exista la ruta, esta función se queda sin uso.
 *
 * Baja por todas las ramas de un nivel a la vez, así que lo que se espera es la profundidad. No
 * corta las hermanas al encontrarlo: ya estaban pedidas.
 */
export async function findTreePath<T extends TreeNode>(
  childrenOf: (parentId: string | null) => Promise<readonly T[]>,
  id: string,
): Promise<T[] | null> {
  async function descend(parentId: string | null, trail: readonly T[]): Promise<T[] | null> {
    const nodes = await childrenOf(parentId)

    const found = nodes.find((node) => node.id === id)
    if (found) return [...trail, found]

    const branches = await Promise.all(
      nodes.filter((node) => node.childCount > 0).map((node) => descend(node.id, [...trail, node])),
    )

    return branches.find((branch) => branch !== null) ?? null
  }

  return descend(null, [])
}

/**
 * El árbol sin un nodo y sin lo que cuelga de él.
 *
 * Es la lista de destinos válidos para moverlo. Ofrecer sus propias descendientes sería ofrecer un
 * error garantizado —el servidor rechaza el ciclo—, y aun así el rechazo se sigue enseñando: entre
 * que se carga la lista y se pulsa guardar, otra persona puede haber colgado algo justo ahí.
 *
 * Aprovecha que `flattenTree` devuelve en profundidad primero: cuando se mira una fila, su padre ya
 * se miró, así que basta una pasada.
 */
export function withoutSubtree(options: readonly TreeOption[], id: string): TreeOption[] {
  const excluded = new Set([id])

  for (const option of options) {
    if (option.parentId !== null && excluded.has(option.parentId)) excluded.add(option.id)
  }

  return options.filter((option) => !excluded.has(option.id))
}

/**
 * Cuántos nodos se lleva por delante borrar uno, él incluido.
 *
 * `category-trees` pide que la confirmación diga cuántas categorías resultan afectadas, y el
 * recurso de categorías no tiene la consulta de alcance que sí tiene el de ubicaciones. Con el
 * árbol ya aplanado el número sale de restar, sin una petición más.
 */
export function subtreeSize(options: readonly TreeOption[], id: string): number {
  return options.length - withoutSubtree(options, id).length
}
