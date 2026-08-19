import { Badge } from "@tfv/ui"
import { ImageOff } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { Photo } from "~/components/photo.tsx"
import { formatAmount } from "~/lib/amount.ts"
import { fetchProduct, type ProductCard, productPath, resolveSite } from "../../storefront.ts"

/**
 * La ficha pública de un producto.
 *
 * Ver `openspec/specs/public-storefronts/spec.md`, requisito «Ficha de producto»: sus imágenes, su
 * nombre, su descripción, su precio y sus variantes.
 *
 * **Lo que no está aquí también es el requisito.** No hay costo, ni ubicación en la nave, ni
 * responsable, ni existencias por estado: el servicio no los manda, y esta pantalla no podría
 * pintarlos aunque quisiera. Es la mitad visible de una decisión que se toma en
 * `apps/api/src/websites/storefront.ts`, donde lo público se compone campo a campo.
 *
 * El botón de añadir al carrito espera a la rebanada 18, que es la que trae el carrito.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; handle: string }>
}): Promise<Metadata> {
  const { slug, handle } = await params
  const resolution = await resolveSite(slug)
  if (resolution.status !== "ready") return {}

  const product = await fetchProduct(slug, handle)
  if (!product) return { title: (await getTranslations("storefront"))("productNotFound") }

  // Los metadatos de la página **son los del producto**, no los del sitio: es lo que la spec pide
  // con «reflejan ese producto y el sitio al que pertenece». La plantilla de la disposición añade
  // el nombre de la tienda.
  return {
    title: product.name,
    description: product.description || resolution.site.description,
    ...(product.coverUrl ? { openGraph: { images: [product.coverUrl] } } : {}),
  }
}

export default async function StorefrontProductPage({
  params,
}: {
  params: Promise<{ slug: string; handle: string }>
}) {
  const t = await getTranslations("storefront")
  const { slug, handle } = await params
  const resolution = await resolveSite(slug)

  if (resolution.status !== "ready" || resolution.site.vertical !== "warehouse") return null

  const product = await fetchProduct(slug, handle)

  /**
   * Un producto despublicado, provisional o de otro almacén responde `404` en el servicio, y aquí
   * se ve igual que uno que nunca existió. Es lo mismo que hace la resolución con un sitio sin
   * publicar: distinguirlos le diría a quien prueba direcciones cuál de sus intentos acertó.
   */
  if (!product) {
    return (
      <main className="mx-auto w-full max-w-(--breakpoint-desktop) flex-1 px-4 py-16 text-center tablet:px-6">
        <h1 className="text-h5 font-bold text-content">{t("productNotFound")}</h1>
        <p className="mt-2 text-body1 text-content-muted">{t("productNotFoundBody")}</p>
        <Link
          href={`/s/${slug}`}
          className="mt-6 inline-block rounded-lg border border-line bg-surface px-4 py-2 text-body1 text-content"
        >
          {t("backToCatalog")}
        </Link>
      </main>
    )
  }

  const format = await getFormatter()
  // El mismo formateador que el resto de la aplicación, y por el mismo motivo: el precio que se
  // enseña no puede pasar por un flotante. Ver `~/lib/amount.ts`.
  const money = (amount: string) => formatAmount(amount, format)

  // La portada primero, y luego el resto por su posición: es el orden en el que la galería se
  // enseña, y la portada es una marca y no la primera posición.
  const gallery = [...product.images].sort(
    (a, b) => Number(b.isCover) - Number(a.isCover) || a.position - b.position,
  )

  return (
    <main className="mx-auto w-full max-w-(--breakpoint-desktop) flex-1 px-4 py-6 tablet:px-6 tablet:py-8">
      <Link
        href={`/s/${slug}`}
        className="text-body2 text-content-muted underline-offset-2 hover:underline"
      >
        {t("backToCatalog")}
      </Link>

      <div className="mt-4 grid gap-6 desktop:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-surface">
            {gallery[0] ? (
              <Photo src={gallery[0].url} alt={product.name} className="size-full object-cover" />
            ) : (
              <ImageOff className="size-10 text-content-faint" aria-hidden />
            )}
          </div>

          {gallery.length > 1 ? (
            <ul className="grid grid-cols-5 gap-2">
              {gallery.slice(1).map((image) => (
                <li
                  key={image.url}
                  className="aspect-square overflow-hidden rounded-lg border border-line bg-surface"
                >
                  <Photo
                    src={image.thumbnailUrl ?? image.url}
                    alt=""
                    className="size-full object-cover"
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-h4 font-bold tracking-tight text-content">{product.name}</h1>

          <p className="text-h5 font-bold text-content">
            {product.price === null ? (
              <span className="text-content-muted">{t("askForPrice")}</span>
            ) : (
              money(product.price)
            )}
          </p>

          <div className="flex flex-wrap gap-2">
            {product.availableForSale ? <Badge tone="success">{t("forSale")}</Badge> : null}
            {product.availableForRent ? <Badge tone="accent">{t("forRent")}</Badge> : null}
          </div>

          {product.description ? (
            <p className="whitespace-pre-line text-body1 text-content-muted">
              {product.description}
            </p>
          ) : null}

          {product.measurements.length > 0 ? (
            <section>
              <h2 className="text-title2 font-semibold text-content">{t("measurements")}</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {product.measurements.map((measurement) => (
                  <li
                    key={measurement.id}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-body2 text-content-muted"
                  >
                    {measurement.name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      <Related
        slug={slug}
        title={t("variants")}
        products={product.variants}
        money={money}
        askForPrice={t("askForPrice")}
      />
      <Related
        slug={slug}
        title={t("accessories")}
        products={product.accessories}
        money={money}
        askForPrice={t("askForPrice")}
      />
    </main>
  )
}

function Related({
  slug,
  title,
  products,
  money,
  askForPrice,
}: {
  slug: string
  title: string
  products: readonly ProductCard[]
  money: (amount: string) => string
  askForPrice: string
}) {
  if (products.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="text-title1 font-semibold text-content">{title}</h2>
      <ul className="mt-3 grid grid-cols-2 gap-4 tablet:grid-cols-4">
        {products.map((product) => (
          <li key={product.id}>
            <Link
              href={productPath(slug, product)}
              className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface"
            >
              <span className="flex aspect-square w-full items-center justify-center overflow-hidden bg-canvas">
                {product.coverUrl ? (
                  <Photo src={product.coverUrl} alt="" className="size-full object-cover" />
                ) : (
                  <ImageOff className="size-7 text-content-faint" aria-hidden />
                )}
              </span>
              <span className="flex flex-1 flex-col gap-1 p-3">
                <span className="line-clamp-2 text-body2 font-semibold text-content">
                  {product.name}
                </span>
                <span className="mt-auto text-body2 text-content-muted">
                  {product.price === null ? askForPrice : money(product.price)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
