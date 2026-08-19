import { cn } from "@tfv/ui"
import { ImageOff } from "lucide-react"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { Photo } from "~/components/photo.tsx"
import { SECTION_PRODUCT_SAMPLE, sectionsCatalog } from "~/components/site/page.ts"
import { SiteSections } from "~/components/site/sections.tsx"
import { formatAmount } from "~/lib/amount.ts"
import {
  catalogParams,
  fetchProducts,
  fetchSitePage,
  type ProductCard,
  productPath,
  resolveSite,
  type StorefrontCategory,
} from "./storefront.ts"

/**
 * El catálogo de la tienda.
 *
 * Ver `openspec/specs/public-storefronts/spec.md`, requisito «Catálogo público paginado y
 * filtrable».
 *
 * **El estado de exploración vive en la dirección** —búsqueda, categoría y página son parámetros—,
 * igual que en las colecciones del panel y por las mismas tres razones: un catálogo filtrado se
 * comparte por enlace, retroceder deshace el último filtro, y recargar no pierde nada. Aquí pesa
 * además una cuarta: es una página pública, y una dirección que no describe lo que enseña no se
 * puede indexar.
 *
 * Por eso los controles son enlaces y un formulario de método `GET`, no estado de cliente. Esta
 * pantalla entera funciona **sin una línea de JavaScript**, que es lo que hace que el catálogo
 * cargue igual en el teléfono de alguien con mala conexión.
 */
export default async function StorefrontCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations("storefront")
  const { slug } = await params
  const resolution = await resolveSite(slug)

  // La disposición ya está enseñando el motivo. Sin esto se pediría un catálogo que no se va a
  // pintar, y a una tienda que quizá ni existe.
  if (resolution.status !== "ready" || resolution.site.vertical !== "warehouse") return null

  const query = await searchParams
  const params_ = catalogParams(query)
  const page = await fetchProducts(slug, params_)

  const format = await getFormatter()
  /**
   * El importe, con el mismo formateador que el resto de la aplicación.
   *
   * `formatAmount` **no pasa por `Number`** en ningún punto: agrupa la parte entera y vuelve a
   * pegar la fracción. Convertir para pintar parece inofensivo y es el hábito que hace que un día
   * el precio del escaparate no coincida con el que se cobra. Ver `~/lib/amount.ts`.
   */
  const money = (amount: string) => formatAmount(amount, format)

  const search = params_.get("search") ?? ""
  const categoryId = params_.get("categoryId")

  /**
   * Las secciones sólo en la portada, no sobre un catálogo filtrado.
   *
   * Quien busca «panel LED» ya dijo a qué venía, y volver a enseñarle la portada entera encima de
   * su resultado es empujar hacia abajo lo que pidió. Es la misma decisión que toma cualquier
   * tienda: la página de inicio se compone, la de resultados no.
   */
  const landing = search === "" && categoryId === null && params_.get("page") === null

  const site = landing ? await fetchSitePage(slug) : null
  const sample = landing
    ? await fetchProducts(slug, new URLSearchParams({ limit: String(SECTION_PRODUCT_SAMPLE) }))
    : null

  return (
    <>
      {site === null ? null : (
        <SiteSections
          sections={site.sections}
          color={site.color}
          bannerUrl={site.bannerUrl}
          catalog={sectionsCatalog({
            slug,
            categories: resolution.site.categories,
            products: sample?.items ?? [],
            money,
            emptyProducts: t("empty"),
            emptyCategories: t("emptyCategories"),
            askForPriceLabel: t("askForPrice"),
          })}
        />
      )}

      <main className="mx-auto w-full max-w-(--breakpoint-desktop) flex-1 px-4 py-6 tablet:px-6 tablet:py-8">
        {/* Una página pública necesita su encabezado: es lo primero que lee un lector de pantalla y
          lo que un buscador toma como asunto de la página. El nombre de la tienda queda arriba, en
          la navegación, así que repetirlo aquí lo diría dos veces. */}
        <h1 className="mb-4 text-h4 font-bold tracking-tight text-content">{t("catalog")}</h1>

        <form method="get" className="mb-5 flex flex-wrap items-center gap-2">
          {/* La categoría elegida sobrevive a una búsqueda nueva; la página, no: buscar empieza por
            el principio, y conservar la séptima página daría un catálogo vacío. */}
          {categoryId ? <input type="hidden" name="categoryId" value={categoryId} /> : null}
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-body1 text-content placeholder:text-content-faint"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-body1 font-semibold text-ink-6"
          >
            {t("search")}
          </button>
        </form>

        {resolution.site.categories.length > 0 ? (
          <Categories
            slug={slug}
            categories={resolution.site.categories}
            selected={categoryId}
            search={search}
            allLabel={t("allCategories")}
          />
        ) : null}

        {page === null || page.items.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-body1 text-content-muted">
            {t("empty")}
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-4 tablet:grid-cols-3 desktop:grid-cols-4">
              {page.items.map((product) => (
                <li key={product.id}>
                  <Card
                    slug={slug}
                    product={product}
                    money={money}
                    askForPrice={t("askForPrice")}
                  />
                </li>
              ))}
            </ul>

            <Pager
              page={page.page}
              totalPages={page.totalPages}
              hasPrevious={page.hasPrevious}
              hasNext={page.hasNext}
              params={params_}
              previousLabel={t("previous")}
              nextLabel={t("next")}
              statusLabel={t("pageOf", { page: page.page, total: page.totalPages })}
            />
          </>
        )}
      </main>
    </>
  )
}

/**
 * Las categorías, como fichas.
 *
 * Sólo las raíces: filtrar por una raíz **incluye sus descendientes** —lo resuelve el servicio—, así
 * que ofrecer el árbol entero sería ofrecer veinte fichas para navegar lo que se navega con cuatro.
 */
function Categories({
  slug,
  categories,
  selected,
  search,
  allLabel,
}: {
  slug: string
  categories: readonly StorefrontCategory[]
  selected: string | null
  search: string
  allLabel: string
}) {
  const roots = categories.filter((category) => category.parentId === null)
  if (roots.length === 0) return null

  const href = (categoryId: string | null) => {
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (categoryId) params.set("categoryId", categoryId)
    const query = params.toString()
    return `/s/${slug}${query ? `?${query}` : ""}`
  }

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-body2",
      active
        ? "border-brand bg-brand text-ink-6 font-semibold"
        : "border-line bg-surface text-content-muted",
    )

  return (
    <nav className="mb-6 flex flex-wrap gap-2">
      <Link href={href(null)} className={chip(selected === null)}>
        {allLabel}
      </Link>
      {roots.map((category) => (
        <Link key={category.id} href={href(category.id)} className={chip(selected === category.id)}>
          {category.name}
        </Link>
      ))}
    </nav>
  )
}

function Card({
  slug,
  product,
  money,
  askForPrice,
}: {
  slug: string
  product: ProductCard
  money: (amount: string) => string
  askForPrice: string
}) {
  return (
    <Link
      href={productPath(slug, product)}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface"
    >
      <span className="flex aspect-square w-full items-center justify-center overflow-hidden bg-canvas">
        {product.coverUrl ? (
          <Photo src={product.coverUrl} alt="" className="size-full object-cover" />
        ) : (
          // Un hueco vacío del tamaño de una foto parece una imagen que no cargó. Una marca
          // discreta dice lo que pasa: este producto todavía no tiene fotos.
          <ImageOff className="size-8 text-content-faint" aria-hidden />
        )}
      </span>
      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 text-body1 font-semibold text-content">{product.name}</span>
        <span className="mt-auto text-body1 text-content">
          {product.price === null ? (
            <span className="text-content-muted">{askForPrice}</span>
          ) : (
            money(product.price)
          )}
        </span>
      </span>
    </Link>
  )
}

function Pager({
  page,
  totalPages,
  hasPrevious,
  hasNext,
  params,
  previousLabel,
  nextLabel,
  statusLabel,
}: {
  page: number
  totalPages: number
  hasPrevious: boolean
  hasNext: boolean
  params: URLSearchParams
  previousLabel: string
  nextLabel: string
  statusLabel: string
}) {
  if (totalPages <= 1) return null

  const at = (target: number) => {
    const next = new URLSearchParams(params)
    next.set("page", String(target))
    return `?${next.toString()}`
  }

  const button = "rounded-lg border border-line bg-surface px-3 py-2 text-body2 text-content"

  return (
    <nav className="mt-6 flex items-center justify-center gap-3">
      {hasPrevious ? (
        <Link href={at(page - 1)} className={button} rel="prev">
          {previousLabel}
        </Link>
      ) : null}
      <span className="text-body2 text-content-muted">{statusLabel}</span>
      {hasNext ? (
        <Link href={at(page + 1)} className={button} rel="next">
          {nextLabel}
        </Link>
      ) : null}
    </nav>
  )
}
