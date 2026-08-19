import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { Photo } from "~/components/photo.tsx"
import { resolveSite } from "./storefront.ts"

/**
 * La cáscara de una tienda pública.
 *
 * Ver `openspec/specs/websites/spec.md` —las tres compuertas y la vertical— y `public-storefronts`.
 *
 * **Aquí no hay nada del panel**: ni selector de empresa, ni menú de usuario, ni navegación de
 * gestión. Quien abre esta dirección no tiene cuenta, y ofrecerle la puerta de un panel al que no
 * puede entrar es la forma de que se vaya. Es la misma decisión que toma la hoja del documento
 * compartido, y por el mismo motivo.
 *
 * ## Por qué las compuertas se resuelven en la disposición
 *
 * Porque son de la tienda entera y no de una página: el catálogo, la ficha y lo que venga después
 * fallan por los mismos tres motivos. Resuelto aquí, una página nueva nace con las compuertas
 * puestas en vez de nacer sin ellas y que nadie lo note hasta que la tienda de alguien que dejó de
 * pagar siga vendiendo.
 *
 * Cuando la compuerta está cerrada, `children` **no se pinta**. Las páginas lo saben —vuelven a
 * pedir la resolución, que está memorizada— y se apartan sin ir a buscar nada.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const t = await getTranslations("storefront")
  const resolution = await resolveSite((await params).slug)

  if (resolution.status !== "ready") return { title: t("notFound") }

  const { site } = resolution
  return {
    // Sin plantilla: el título de una tienda es el de la tienda, no «… · TFV». Quien la abre está
    // en casa de la empresa, no en la nuestra.
    title: { absolute: site.name, template: `%s · ${site.name}` },
    description: site.description,
    ...(site.iconUrl ? { icons: { icon: site.iconUrl } } : {}),
  }
}

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const t = await getTranslations("storefront")
  const { slug } = await params
  const resolution = await resolveSite(slug)

  if (resolution.status === "missing") {
    return <Notice title={t("notFound")} body={t("notFoundBody")} />
  }

  if (resolution.status === "unavailable") {
    return (
      <Notice
        title={t("unavailable")}
        body={
          resolution.reason === "subscription" ? t("unavailableBilling") : t("unavailableService")
        }
      />
    )
  }

  const { site } = resolution

  if (site.vertical !== "warehouse") {
    return <Notice title={site.name} body={t("underConstruction")} logoUrl={site.logoUrl} />
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-(--breakpoint-desktop) items-center gap-3 px-4 py-4 tablet:px-6">
          <Link href={`/s/${slug}`} className="flex min-w-0 items-center gap-3">
            {site.logoUrl ? (
              <Photo
                src={site.logoUrl}
                alt=""
                className="size-10 shrink-0 rounded-md object-cover"
              />
            ) : null}
            <span className="min-w-0">
              <span className="block truncate text-title1 font-bold tracking-tight text-content">
                {site.name}
              </span>
              {site.description ? (
                <span className="block truncate text-body3 text-content-muted">
                  {site.description}
                </span>
              ) : null}
            </span>
          </Link>
        </div>
      </header>

      {children}

      <footer className="mt-auto border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-(--breakpoint-desktop) px-4 py-6 text-body3 text-content-faint tablet:px-6">
          {t("footer", { name: site.name })}
        </div>
      </footer>
    </div>
  )
}

/**
 * Una página entera con un solo mensaje.
 *
 * Las tres salidas que no son la tienda —no existe, no está disponible, en construcción— se ven
 * igual a propósito: son la misma situación para quien mira, y lo que cambia es el texto. Lo que no
 * comparten es el motivo, y ése es el que la spec pide no confundir.
 */
function Notice({
  title,
  body,
  logoUrl,
}: {
  title: string
  body: string
  logoUrl?: string | null
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-5 text-center">
      {logoUrl ? <Photo src={logoUrl} alt="" className="size-16 rounded-xl object-cover" /> : null}
      <h1 className="text-h5 font-bold text-content">{title}</h1>
      <p className="max-w-prose text-body1 text-content-muted">{body}</p>
    </main>
  )
}
