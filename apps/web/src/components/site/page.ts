import type { RenderableSection } from "@tfv/contracts/sections"
import type { SectionsCatalog } from "./sections.tsx"

/**
 * Lo que las dos mitades comparten para pintar la página de un sitio.
 *
 * La portada pública y la vista previa del constructor no comparten transporte —una lo pide desde
 * el servidor con la cookie de quien navega, la otra desde el navegador de quien edita— pero sí
 * comparten **qué piden y cómo lo convierten en direcciones**. Puesto en cada lado, el día que una
 * ficha cambiara de dirección la vista previa seguiría enlazando a la vieja y sólo se notaría al
 * pulsar.
 */

/** Tal y como lo devuelven `/public/sites/{slug}/page` y la ruta de vista previa. Es el mismo. */
export interface SitePageBody {
  readonly customizationId: string | null
  readonly name: string | null
  readonly color: string
  readonly bannerUrl: string | null
  readonly sections: readonly RenderableSection[]
}

/**
 * Cuántos productos se traen para las secciones de catálogo.
 *
 * El mismo número en los dos lados, y de ahí que sea una constante y no un literal en cada
 * llamada: una sección que declare enseñar ocho enseñará ocho en los dos sitios, y una que no
 * declare nada enseñará lo mismo aquí y allá.
 */
export const SECTION_PRODUCT_SAMPLE = 12

export interface CatalogSource {
  readonly slug: string
  readonly categories: readonly { readonly id: string; readonly name: string }[]
  readonly products: readonly {
    readonly id: string
    readonly slug: string | null
    readonly name: string
    readonly price: string | null
    readonly coverUrl: string | null
  }[]
  readonly money: (amount: string) => string
  readonly emptyProducts: string
  readonly emptyCategories: string
  readonly askForPriceLabel: string
}

/** Las direcciones de la tienda, compuestas una sola vez para los dos lados. */
export function sectionsCatalog(source: CatalogSource): SectionsCatalog {
  return {
    categories: source.categories.map((category) => ({
      id: category.id,
      name: category.name,
      href: `/s/${source.slug}?categoryId=${encodeURIComponent(category.id)}`,
    })),
    products: source.products.map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      coverUrl: product.coverUrl,
      // La ficha se alcanza por identificador legible si lo tiene, y si no por identificador.
      href: `/s/${source.slug}/p/${product.slug ?? product.id}`,
    })),
    money: source.money,
    emptyProducts: source.emptyProducts,
    emptyCategories: source.emptyCategories,
    askForPriceLabel: source.askForPriceLabel,
  }
}
