/**
 * El producto visto desde una lista de precios, y cómo se busca.
 *
 * Vive aparte de `price-lists.ts` porque **lo usan las dos orillas**: la ficha lo pinta en el
 * servidor y el diálogo de asignación lo filtra en el navegador. Aquel módulo llega a la API, y la
 * API llega a `next/headers`, que no puede acabar en el paquete servido al navegador.
 */

/** Un producto, reducido a lo que hace falta para nombrarlo y para poder buscarlo. */
export interface ProductOption {
  readonly id: string
  readonly name: string
  readonly code: string
}

/**
 * El texto sin acentos y en minúsculas.
 *
 * La búsqueda del servidor es insensible a acentos, y una que se hace aquí no puede comportarse
 * distinto: quien escribe «camara» en el catálogo y encuentra la cámara espera lo mismo al buscarla
 * dentro de una lista.
 */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}
