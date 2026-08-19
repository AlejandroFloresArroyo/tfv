import type { WebsiteVertical } from "@tfv/contracts/storefront"
import { cache } from "react"
import type { SitePageBody } from "~/components/site/page.ts"
import { apiGet } from "~/lib/api.server.ts"

/**
 * Lo que la tienda pública le pide al servicio.
 *
 * Las formas están escritas aquí y no importadas del servicio porque el navegador no puede importar
 * nada de `apps/api`: la frontera es HTTP y el contrato publicado. Lo que sí se comparte es la
 * aritmética de la dirección y el catálogo de verticales, que viven en `@tfv/contracts`.
 */

export interface StorefrontCategory {
  readonly id: string
  readonly parentId: string | null
  readonly name: string
  readonly slug: string | null
}

export interface StorefrontSite {
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly vertical: WebsiteVertical
  readonly logoUrl: string | null
  readonly iconUrl: string | null
  readonly categories: readonly StorefrontCategory[]
}

export type UnavailableReason = "subscription" | "service"

export type Resolution =
  | { readonly status: "ready"; readonly site: StorefrontSite }
  | { readonly status: "unavailable"; readonly reason: UnavailableReason }
  | { readonly status: "missing" }

export interface ProductCard {
  readonly id: string
  readonly slug: string | null
  readonly name: string
  readonly description: string
  readonly price: string | null
  readonly availableForSale: boolean
  readonly availableForRent: boolean
  readonly categoryId: string | null
  readonly coverUrl: string | null
}

export interface ProductImage {
  readonly url: string
  readonly thumbnailUrl: string | null
  readonly position: number
  readonly isCover: boolean
}

export interface ProductDetail extends ProductCard {
  readonly images: readonly ProductImage[]
  readonly measurements: readonly { id: string; name: string }[]
  readonly variants: readonly ProductCard[]
  readonly accessories: readonly ProductCard[]
}

export interface ProductPage {
  readonly items: readonly ProductCard[]
  readonly page: number
  readonly totalPages: number
  readonly totalItems: number
  readonly hasPrevious: boolean
  readonly hasNext: boolean
}

/**
 * Resuelve la tienda una vez por petición.
 *
 * `cache` de React memoriza durante el renderizado de **esta** petición y no entre peticiones: la
 * disposición y la página piden la misma resolución y sólo se pregunta una vez, sin que eso
 * convierta la tienda de una empresa en la que ve otro visitante.
 *
 * Un `404` se traduce a `missing` en lugar de propagarse: para quien abre una dirección, «aquí no
 * hay ninguna tienda» es una respuesta y no una avería, y merece su propia página.
 */
export const resolveSite = cache(async (slug: string): Promise<Resolution> => {
  const result = await apiGet<Exclude<Resolution, { status: "missing" }>>(
    `/public/sites/${encodeURIComponent(slug)}`,
  )

  if (!result.ok) return { status: "missing" }
  return result.data
})

/** El catálogo, con el estado de exploración que viaja en la dirección. */
export async function fetchProducts(
  slug: string,
  params: URLSearchParams,
): Promise<ProductPage | null> {
  const query = params.toString()
  const result = await apiGet<ProductPage>(
    `/public/sites/${encodeURIComponent(slug)}/products${query ? `?${query}` : ""}`,
  )

  return result.ok ? result.data : null
}

/**
 * Las secciones que la personalización vigente pone en la portada.
 *
 * Ruta aparte de la resolución y no un campo suyo: la resolución la piden **todas** las páginas de
 * la tienda —la disposición la memoriza— y las secciones sólo las necesita la portada. Metidas
 * dentro, la ficha de un producto cargaría en cada visita un tema entero que no va a pintar.
 */
export async function fetchSitePage(slug: string): Promise<SitePageBody | null> {
  const result = await apiGet<SitePageBody>(`/public/sites/${encodeURIComponent(slug)}/page`)
  return result.ok ? result.data : null
}

export async function fetchProduct(slug: string, handle: string): Promise<ProductDetail | null> {
  const result = await apiGet<ProductDetail>(
    `/public/sites/${encodeURIComponent(slug)}/products/${encodeURIComponent(handle)}`,
  )

  return result.ok ? result.data : null
}

/**
 * Los parámetros que la tienda deja viajar hasta el servicio.
 *
 * Lista blanca corta, y no «todo lo que traiga la dirección». El servicio rechaza con `400` un
 * filtro que no declara, así que un enlace con un parámetro de más —los que añaden las campañas de
 * correo, por ejemplo— dejaría el catálogo en blanco en vez de ignorarlo.
 */
const ALLOWED = ["search", "categoryId", "page", "limit"] as const

export function catalogParams(
  input: Readonly<Record<string, string | string[] | undefined>>,
): URLSearchParams {
  const params = new URLSearchParams()

  for (const key of ALLOWED) {
    const value = input[key]
    const single = Array.isArray(value) ? value[0] : value
    if (single !== undefined && single !== "") params.set(key, single)
  }

  return params
}

/** La dirección de la ficha: el identificador legible si lo tiene, y si no el identificador. */
export function productPath(slug: string, product: ProductCard): string {
  return `/s/${slug}/p/${product.slug ?? product.id}`
}
