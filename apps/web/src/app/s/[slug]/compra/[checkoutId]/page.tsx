import { Badge } from "@tfv/ui"
import { CircleCheck, Clock } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { formatAmount } from "~/lib/amount.ts"
import { apiGet } from "~/lib/api.server.ts"
import { resolveSite } from "../../storefront.ts"

/**
 * A dónde vuelve el comprador después de pagar.
 *
 * Ver `openspec/specs/storefront-checkout/spec.md`, requisito «Direcciones de retorno del pago»:
 * «vuelve a una página de la tienda que confirma la compra». La dirección se la dio la sesión de
 * pago, y es de la propia tienda — no de la plataforma.
 *
 * ## Por qué puede decir «estamos confirmando»
 *
 * Porque el pago y su confirmación **no llegan por el mismo camino**. El comprador vuelve del
 * procesador por el navegador; la confirmación llega por el evento firmado, que es lo único en lo
 * que el sistema se cree que se cobró (`payment-webhooks`). Entre una cosa y la otra caben unos
 * segundos, así que esta página dice la verdad de lo que sabe: la compra está pagada, o todavía se
 * está confirmando.
 *
 * Fingir que ya está pagada porque el navegador volvió es exactamente cómo se acaba materializando
 * un pedido que nadie pagó.
 */

interface Checkout {
  readonly id: string
  readonly status: string
  readonly storeName: string
  readonly subtotal: string
  readonly shippingCost: string
  readonly total: string
  readonly lines: readonly { name: string; quantity: number; total: string }[]
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("storefront"))("purchase") }
}

export default async function PurchasePage({
  params,
}: {
  params: Promise<{ slug: string; checkoutId: string }>
}) {
  const t = await getTranslations("storefront")
  const { slug, checkoutId } = await params
  const resolution = await resolveSite(slug)

  if (resolution.status !== "ready") return null

  const result = await apiGet<Checkout>(`/me/checkouts/${encodeURIComponent(checkoutId)}`)

  // Una compra que no es de quien pregunta responde `404` en el servicio, y aquí se ve igual que
  // una que no existe.
  if (!result.ok) {
    return (
      <main className="mx-auto w-full max-w-140 flex-1 px-4 py-16 text-center tablet:px-6">
        <h1 className="text-h5 font-bold text-content">{t("purchaseNotFound")}</h1>
        <Link
          href={`/s/${slug}`}
          className="mt-6 inline-block text-body1 text-content-muted underline"
        >
          {t("backToCatalog")}
        </Link>
      </main>
    )
  }

  const checkout = result.data
  const format = await getFormatter()
  const money = (amount: string) => formatAmount(amount, format)
  const paid = checkout.status === "completed"

  return (
    <main className="mx-auto w-full max-w-140 flex-1 px-4 py-10 tablet:px-6">
      <div className="flex flex-col gap-4 rounded-xl border border-edge bg-surface p-6">
        <div className="flex items-center gap-3">
          {paid ? (
            <CircleCheck className="size-8 text-tinta-firme" aria-hidden />
          ) : (
            <Clock className="size-8 text-content-muted" aria-hidden />
          )}
          <h1 className="text-title1 font-bold text-content">
            {paid ? t("purchaseDone") : t("purchasePending")}
          </h1>
        </div>

        <p className="text-body1 text-content-muted">
          {paid ? t("purchaseDoneBody") : t("purchasePendingBody")}
        </p>

        {/* Al ancho de su texto: en una columna flexible, una insignia sin esto se estira de
            lado a lado y deja de leerse como una etiqueta. */}
        <span className="self-start">
          <Badge tone={paid ? "success" : "neutral"}>{t(`checkout_${checkout.status}`)}</Badge>
        </span>

        <ul className="flex flex-col gap-2 border-edge border-y py-3">
          {checkout.lines.map((line) => (
            <li key={line.name} className="flex justify-between gap-3 text-body2 text-content">
              <span className="min-w-0 truncate">
                {line.quantity} × {line.name}
              </span>
              <span className="shrink-0">{money(line.total)}</span>
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-1 text-body2">
          <div className="flex justify-between">
            <dt className="text-content-muted">{t("subtotal")}</dt>
            <dd className="text-content">{money(checkout.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-content-muted">{t("shipping")}</dt>
            <dd className="text-content">{money(checkout.shippingCost)}</dd>
          </div>
          <div className="flex justify-between text-title2 font-bold">
            <dt className="text-content">{t("total")}</dt>
            <dd className="text-content">{money(checkout.total)}</dd>
          </div>
        </dl>

        <Link href={`/s/${slug}`} className="text-body2 text-content-muted underline">
          {t("backToCatalog")}
        </Link>
      </div>
    </main>
  )
}
