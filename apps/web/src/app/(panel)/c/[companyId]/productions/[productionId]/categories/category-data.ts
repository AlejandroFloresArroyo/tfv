import { findTreePath } from "~/components/tree/tree.ts"
import { type ApiResult, apiGet } from "~/lib/api.server.ts"
import type { ItemsEnvelope, ProductionCategoryRow } from "../../production.ts"

/**
 * De dónde saca la pantalla de categorías los tres niveles que enseña.
 *
 * Vive aparte porque **lo usan las dos páginas** —la del árbol sin nada elegido y la de una
 * categoría concreta—.
 *
 * A diferencia de la taxonomía del almacén (H-38), ésta **sí** tiene ruta desde la raíz. Aun así la
 * pantalla baja el árbol nivel a nivel, porque además de la ruta necesita las hermanas de cada
 * nivel para poder navegar. La ruta se usa donde de verdad ahorra: situar una hoja compartida por
 * enlace.
 *
 * Los fallos no se lanzan: se recogen. Una búsqueda que baja por varias ramas puede fallar en
 * cualquiera, y lo que la pantalla necesita es **el primer fallo**, para enseñarlo tal cual —un
 * `403` no es «algo salió mal»—, no una excepción a mitad del recorrido.
 */

export type ApiFailureResult = Extract<ApiResult<unknown>, { ok: false }>

/**
 * Que la categoría no esté en el árbol se trata como el `404` de la API.
 *
 * No como `notFound()` de Next: esta aplicación no tiene página de «no encontrado», y la que trae
 * el marco por omisión se pinta fuera del armazón del panel.
 */
export const CATEGORY_NOT_FOUND: ApiFailureResult = {
  ok: false,
  status: 404,
  message: "La categoría no existe",
}

export interface CategoryLevels {
  /** Las categorías sin padre. Es la columna de la izquierda. */
  readonly roots: readonly ProductionCategoryRow[]
  /** De la raíz a la seleccionada, ambas incluidas. Vacío si no hay nada seleccionado. */
  readonly path: readonly ProductionCategoryRow[]
  /** Las hijas directas de la seleccionada. */
  readonly children: readonly ProductionCategoryRow[]
  /** El primer fallo de la API, si lo hubo. Manda sobre todo lo demás. */
  readonly failure: ApiFailureResult | null
}

export async function loadCategoryLevels(
  companyId: string,
  productionId: string,
  categoryId?: string,
): Promise<CategoryLevels> {
  const base = `/companies/${companyId}/productions/${productionId}/categories`
  let failure: ApiFailureResult | null = null

  const childrenOf = async (parentId: string | null): Promise<ProductionCategoryRow[]> => {
    const url = parentId === null ? base : `${base}?parentId=${encodeURIComponent(parentId)}`
    const result = await apiGet<ItemsEnvelope<ProductionCategoryRow>>(url)

    if (!result.ok) {
      failure ??= result
      return []
    }

    return result.data.items
  }

  const roots = await childrenOf(null)
  if (categoryId === undefined) return { roots, path: [], children: [], failure }

  const path = (await findTreePath(childrenOf, categoryId)) ?? []
  const selected = path.at(-1)

  if (!selected) return { roots, path, children: [], failure: failure ?? CATEGORY_NOT_FOUND }

  const children = selected.childCount > 0 ? await childrenOf(selected.id) : []

  return { roots, path, children, failure }
}
