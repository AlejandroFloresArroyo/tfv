/**
 * Lo que la ficha de una lista de precios necesita del servidor, y las vueltas que hay que dar
 * para tenerlo.
 *
 * Son dos rodeos, y los dos están aquí para que se vean juntos en lugar de repartidos por la
 * pantalla:
 *
 * - **No hay «traer una lista»**, sólo el listado paginado. La ficha busca la suya recorriéndolo.
 * - **Las tarifas llegan con el identificador del producto y nada más.** Para poder nombrarlas hay
 *   que traerse el catálogo del almacén y cruzarlo aquí. Es el mismo hueco que las líneas de
 *   cotización ya tenían resuelto —viajan con el nombre y el código del producto— y está anotado
 *   como H-31.
 *
 * Mientras el hueco siga abierto, el rodeo tiene un tope: se traen hasta veintiún páginas de
 * catálogo. Un almacén más grande que eso deja tarifas sin nombre, y la pantalla lo dice en lugar
 * de fingir que la lista está completa.
 */

import type { PageEnvelope } from "~/components/collection/collection.tsx"
import { type ApiResult, apiGet } from "~/lib/api.server.ts"
import type { PriceListRow, ProductRow } from "../../warehouse.ts"

/** El tope de página del lenguaje de consulta. Pedir más lo rechaza el servidor. */
const PAGE_SIZE = 96

/** Cuántas páginas de listas se recorren buscando una. Novecientas sesenta listas en un almacén. */
const LIST_PAGES = 10

/**
 * Cuántas páginas de catálogo se traen para poder nombrar las tarifas.
 *
 * Veintiuna son 2016 productos, que es el tope que la propia API pone a la asignación masiva. Por
 * encima de eso una lista no se puede establecer de una vez, así que traer más no serviría para
 * más.
 */
const CATALOG_PAGES = 21

/** Un producto, reducido a lo que la ficha necesita: nombrarlo y poder buscarlo. */
export interface ProductOption {
  readonly id: string
  readonly name: string
  readonly code: string
}

export interface Catalog {
  readonly products: readonly ProductOption[]
  /** Cuántos hay en el almacén, según el servidor. */
  readonly total: number
  /** Cierto cuando no caben todos: lo cargado es un prefijo, y la pantalla tiene que advertirlo. */
  readonly truncated: boolean
}

/**
 * Una lista de precios por su identificador.
 *
 * La API no publica «traer una», así que se busca en el listado. Sale en la primera vuelta salvo
 * que el almacén tenga más de noventa y seis listas, que es un caso que nadie ha visto: el rodeo
 * cuesta **una** petición en la práctica.
 *
 * Devuelve `null` —y no un fallo— cuando no está: no existe, o se acaba de borrar desde otra
 * pestaña. Las dos cosas se le cuentan a quien mira, no se le enseñan como error.
 */
export async function findPriceList(
  companyId: string,
  warehouseId: string,
  priceListId: string,
): Promise<ApiResult<PriceListRow | null>> {
  const base = `/companies/${companyId}/warehouses/${warehouseId}/price-lists`

  for (let page = 1; page <= LIST_PAGES; page++) {
    const result = await apiGet<PageEnvelope<PriceListRow>>(
      `${base}?limit=${PAGE_SIZE}&page=${page}`,
    )
    if (!result.ok) return result

    const found = result.data.items.find((list) => list.id === priceListId)
    if (found) return { ok: true, data: found }
    if (!result.data.hasNext) break
  }

  return { ok: true, data: null }
}

/**
 * El catálogo del almacén, hasta el tope.
 *
 * La primera página dice cuántas hay; las demás se piden a la vez. En una nave de doscientos
 * productos son tres peticiones, y en una de dos mil, veintiuna — que es caro y por eso el hueco
 * está anotado: con el nombre viajando en la tarifa, esto sería cero peticiones.
 */
export async function loadCatalog(
  companyId: string,
  warehouseId: string,
): Promise<ApiResult<Catalog>> {
  const path = (page: number) =>
    `/companies/${companyId}/warehouses/${warehouseId}/products?limit=${PAGE_SIZE}&page=${page}`

  const first = await apiGet<PageEnvelope<ProductRow>>(path(1))
  if (!first.ok) return first

  const pages = Math.min(first.data.totalPages, CATALOG_PAGES)
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
      apiGet<PageEnvelope<ProductRow>>(path(index + 2)),
    ),
  )

  const products: ProductOption[] = first.data.items.map(toOption)

  for (const result of rest) {
    if (!result.ok) return result
    products.push(...result.data.items.map(toOption))
  }

  return {
    ok: true,
    data: {
      products,
      total: first.data.totalItems,
      truncated: first.data.totalPages > pages,
    },
  }
}

function toOption(product: ProductRow): ProductOption {
  return { id: product.id, name: product.name, code: product.code }
}

/**
 * Una página de una lista que ya está entera en memoria.
 *
 * Las tarifas de una lista llegan **sin paginar** —el servicio las devuelve todas—, y aun así la
 * pantalla las pagina: doscientas filas de tres importes cada una no se recorren, y el estado de
 * exploración sigue viviendo en la dirección como en todas las demás colecciones.
 */
export function pageOf<T>(items: readonly T[], page: number, limit: number): PageEnvelope<T> {
  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / limit))
  const current = Math.min(Math.max(1, page), totalPages)

  return {
    items: [...items].slice((current - 1) * limit, current * limit),
    page: current,
    limit,
    totalItems,
    totalPages,
    hasPrevious: current > 1,
    hasNext: current < totalPages,
    previousPage: current > 1 ? current - 1 : null,
    nextPage: current < totalPages ? current + 1 : null,
  }
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
