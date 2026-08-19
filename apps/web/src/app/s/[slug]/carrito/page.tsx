import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { readProfile } from "~/lib/session.ts"
import { resolveSite } from "../storefront.ts"
import { CartScreen } from "./cart-screen.tsx"

/**
 * El carrito de una tienda pública.
 *
 * Ver `openspec/specs/storefront-checkout/spec.md`. Rebanada 18.
 *
 * La página es la cáscara y el trabajo lo hace un componente de navegador, porque **el carrito vive
 * en el navegador**: dibujarlo en el servidor daría siempre uno vacío. Lo que sí se resuelve aquí es
 * si hay sesión, que es lo que decide entre «continuar al pago» y «inicia sesión».
 *
 * No se exige sesión para **entrar**: mirar lo que uno lleva en el carrito no es comprar, y mandar
 * a la pantalla de acceso a quien sólo quería ver el total es la forma más rápida de que se vaya.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const t = await getTranslations("storefront")
  const resolution = await resolveSite((await params).slug)

  if (resolution.status !== "ready") return { title: t("notFound") }
  return { title: t("cart") }
}

export default async function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getTranslations("storefront")
  const { slug } = await params
  const resolution = await resolveSite(slug)

  // Las tres compuertas ya las resolvió la disposición; aquí sólo se comprueba que sea una tienda
  // que vende, porque una en construcción no tiene carrito que enseñar.
  if (resolution.status !== "ready" || resolution.site.vertical !== "warehouse") return null

  // Quién mira. La compra exige cuenta; el carrito, no.
  const profile = await readProfile()

  return (
    <main className="mx-auto w-full max-w-(--breakpoint-desktop) flex-1 px-4 py-6 tablet:px-6 tablet:py-8">
      <h1 className="text-h5 font-bold tracking-tight text-content">{t("cart")}</h1>
      <div className="mt-6">
        <CartScreen slug={slug} signedIn={profile !== null} />
      </div>
    </main>
  )
}
