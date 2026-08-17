/**
 * Envolvente de paginación.
 *
 * Ver `openspec/specs/query-and-pagination/spec.md`.
 *
 * Toda respuesta paginada de la API tiene esta forma, sin excepción, para que la interfaz pueda
 * tratar cualquier colección con el mismo componente.
 */

export interface Page<T> {
  readonly items: readonly T[]
  /** Página actual, base 1. */
  readonly page: number
  /** Límite realmente aplicado, que puede ser menor que el pedido si se acotó al máximo. */
  readonly limit: number
  readonly totalItems: number
  readonly totalPages: number
  readonly hasPrevious: boolean
  readonly hasNext: boolean
  /** Nulo, no cero ni ausente, cuando no hay página anterior. */
  readonly previousPage: number | null
  readonly nextPage: number | null
}

export function buildPage<T>(
  items: readonly T[],
  totalItems: number,
  page: number,
  limit: number,
): Page<T> {
  const totalPages = limit > 0 ? Math.ceil(totalItems / limit) : 0
  const hasPrevious = page > 1
  const hasNext = page < totalPages

  return {
    items,
    page,
    limit,
    totalItems,
    totalPages,
    hasPrevious,
    hasNext,
    previousPage: hasPrevious ? page - 1 : null,
    nextPage: hasNext ? page + 1 : null,
  }
}

/** Página vacía, para cuando el alcance del solicitante no alcanza a ningún elemento. */
export function emptyPage<T>(page: number, limit: number): Page<T> {
  return buildPage<T>([], 0, page, limit)
}
