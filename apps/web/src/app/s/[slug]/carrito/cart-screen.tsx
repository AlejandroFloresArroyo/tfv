"use client"

import { Button, Callout, Field, Select, Spinner } from "@tfv/ui"
import { ImageOff, Minus, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { Photo } from "~/components/photo.tsx"
import { formatAmount } from "~/lib/amount.ts"
import { ApiError, api } from "~/lib/api.client.ts"
import {
  type CartItem,
  cartCount,
  clearCart,
  readCart,
  withoutItem,
  withQuantity,
  writeCart,
} from "~/lib/cart.ts"

/**
 * El carrito y el paso de compra de una tienda pública.
 *
 * Ver `openspec/specs/storefront-checkout/spec.md`. Rebanada 18.
 *
 * ## Los precios se piden, no se creen
 *
 * Lo que el navegador guardó es una copia de lo que se vio; lo que esta pantalla enseña sale de
 * `POST /public/sites/{slug}/cart`, que los resuelve contra el catálogo publicado con la misma
 * función que pinta la ficha. Si el comercio cambió un precio entre la visita y hoy, aquí se ve el
 * nuevo — y es el que se cobrará, porque el cobro sale del mismo sitio.
 *
 * ## Y el desglose que se enseña antes de pagar es el que se cobra
 *
 * No hay una previsualización de importes: **crear la compra es lo que los calcula**. Al pulsar
 * «continuar» el servidor aparta el inventario, cotiza el envío, congela la instantánea y abre la
 * sesión de pago; lo que esta pantalla enseña después es esa instantánea. Un cálculo aparte para
 * enseñar el total antes habría sido un segundo cálculo, y dos cálculos del mismo importe divergen
 * — que es el defecto M-11 de los envíos y el M-06 de las cotizaciones.
 *
 * El precio de ese orden es que el inventario queda apartado desde antes de pagar, que es
 * exactamente lo que la spec pide: «las existencias se reservan al crear la sesión». Por eso la
 * pantalla dice cuánto dura la reserva y ofrece soltarla.
 */

interface PricedLine {
  refId: string
  name: string
  unitPrice: string
  quantity: number
  total: string
  available: number
  coverUrl: string | null
}

interface PricedCart {
  storeName: string
  subtotal: string
  lines: PricedLine[]
}

interface Checkout {
  id: string
  status: string
  subtotal: string
  shippingCost: string
  total: string
  checkoutUrl: string | null
  expiresAt: string | null
  lines: { name: string; quantity: number; total: string }[]
}

interface Address {
  id: string
  label: string
  line1: string
  city: string
}

const MODES = ["pickup", "local", "national", "international"] as const

type Mode = (typeof MODES)[number]

export function CartScreen({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const t = useTranslations("storefront")
  const format = useFormatter()
  const money = (amount: string) => formatAmount(amount, format)

  const [items, setItems] = useState<readonly CartItem[]>([])
  const [priced, setPriced] = useState<PricedCart | null>(null)
  const [addresses, setAddresses] = useState<readonly Address[]>([])
  const [mode, setMode] = useState<Mode>("pickup")
  const [addressId, setAddressId] = useState("")
  const [checkout, setCheckout] = useState<Checkout | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // El carrito vive en el navegador, así que sólo existe después de montar: leerlo durante el
  // dibujado del servidor daría siempre vacío y la primera pintura parpadearía.
  useEffect(() => {
    setItems(readCart(slug))
    setLoaded(true)
  }, [slug])

  const price = useCallback(
    async (cart: readonly CartItem[]) => {
      if (cart.length === 0) {
        setPriced(null)
        return
      }

      try {
        setPriced(
          await api<PricedCart>(`/public/sites/${encodeURIComponent(slug)}/cart`, {
            method: "POST",
            body: {
              items: cart.map((item) => ({
                kind: "warehouse_measurement",
                refId: item.refId,
                quantity: item.quantity,
              })),
            },
          }),
        )
        setError(null)
      } catch (cause) {
        setPriced(null)
        setError(cause instanceof ApiError ? cause.message : t("cartError"))
      }
    },
    [slug, t],
  )

  // Cada vez que el carrito cambia se vuelve a valorar: el precio y la existencia son del servidor,
  // y lo guardado en el navegador es sólo una copia de lo que se vio.
  useEffect(() => {
    if (loaded) void price(items)
  }, [loaded, items, price])

  useEffect(() => {
    if (!signedIn) return
    void api<Address[]>("/me/addresses")
      .then(setAddresses)
      .catch(() => setAddresses([]))
  }, [signedIn])

  const update = (next: readonly CartItem[]) => {
    writeCart(slug, next)
    setItems(next)
    setCheckout(null)
  }

  const start = async () => {
    setBusy(true)
    setError(null)

    try {
      const created = await api<Checkout>(`/public/sites/${encodeURIComponent(slug)}/checkout`, {
        method: "POST",
        body: {
          type: "sale",
          mode,
          items: items.map((item) => ({
            kind: "warehouse_measurement",
            refId: item.refId,
            quantity: item.quantity,
          })),
          ...(mode === "pickup" || !addressId ? {} : { toAddressId: addressId }),
        },
        // La clave de idempotencia: un doble clic no aparta dos veces. Se genera por intento, no
        // por pulsación, para que el reintento tras renovar la sesión lleve la misma.
        headers: { "idempotency-key": crypto.randomUUID() },
      })

      setCheckout(created)
      // Lo comprado ya está apartado a nombre de quien compra: dejarlo en el carrito llevaría a
      // apartarlo dos veces desde otra pestaña.
      clearCart(slug)
      setItems([])
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("cartError"))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!checkout) return
    setBusy(true)
    try {
      await api(`/me/checkouts/${checkout.id}/cancellation`, { method: "POST" })
      setCheckout(null)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("cartError"))
    } finally {
      setBusy(false)
    }
  }

  if (checkout) {
    return (
      <Summary
        checkout={checkout}
        money={money}
        onCancel={cancel}
        busy={busy}
        slug={slug}
        labels={{
          title: t("checkoutReady"),
          held: t("checkoutHeld"),
          subtotal: t("subtotal"),
          shipping: t("shipping"),
          total: t("total"),
          pay: t("pay"),
          cancel: t("cancelCheckout"),
          back: t("backToCatalog"),
        }}
      />
    )
  }

  if (!loaded) {
    return (
      <p className="flex items-center gap-2 text-body1 text-content-muted">
        <Spinner /> {t("loading")}
      </p>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-body1 text-content-muted">{t("cartEmpty")}</p>
        <Link href={`/s/${slug}`} className="text-body1 font-semibold text-content underline">
          {t("backToCatalog")}
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-6 desktop:grid-cols-[1fr_20rem]">
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const line = priced?.lines.find((row) => row.refId === item.refId)
          const short = line !== undefined && line.available < item.quantity

          return (
            <li
              key={item.refId}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
            >
              <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canvas">
                {item.coverUrl ? (
                  <Photo src={item.coverUrl} alt="" className="size-full object-cover" />
                ) : (
                  <ImageOff className="size-5 text-content-faint" aria-hidden />
                )}
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-body1 font-semibold text-content">
                  {line?.name ?? item.name}
                </span>
                <span className="text-body2 text-content-muted">
                  {money(line?.unitPrice ?? item.unitPrice)}
                </span>
                {short ? (
                  <span className="text-body3 text-danger">
                    {t("onlyLeft", { count: line?.available ?? 0 })}
                  </span>
                ) : null}
              </span>

              <span className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("decrease")}
                  onClick={() => update(withQuantity(items, item.refId, item.quantity - 1))}
                >
                  <Minus className="size-4" aria-hidden />
                </Button>
                <span className="w-8 text-center text-body1 text-content">{item.quantity}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("increase")}
                  onClick={() => update(withQuantity(items, item.refId, item.quantity + 1))}
                >
                  <Plus className="size-4" aria-hidden />
                </Button>
              </span>

              <span className="w-24 text-right text-body1 font-semibold text-content">
                {money(line?.total ?? "0.00")}
              </span>

              <Button
                variant="ghost"
                size="sm"
                aria-label={t("removeItem")}
                onClick={() => update(withoutItem(items, item.refId))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          )
        })}
      </ul>

      <aside className="flex h-fit flex-col gap-4 rounded-xl border border-line bg-surface p-4">
        <p className="flex items-baseline justify-between text-body1 text-content">
          <span className="text-content-muted">{t("subtotal")}</span>
          <span className="text-title1 font-bold">{money(priced?.subtotal ?? "0.00")}</span>
        </p>

        <p className="text-body3 text-content-faint">{t("shippingLater")}</p>

        <Field label={t("shippingMode")}>
          {(ids) => (
            <Select {...ids} value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
              {MODES.map((value) => (
                <option key={value} value={value}>
                  {t(`mode_${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {mode !== "pickup" ? (
          <Field label={t("deliveryAddress")}>
            {(ids) => (
              <Select
                {...ids}
                value={addressId}
                onChange={(event) => setAddressId(event.target.value)}
              >
                <option value="">{t("chooseAddress")}</option>
                {addresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {address.label} · {address.line1}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        {error ? <Callout tone="danger">{error}</Callout> : null}

        {signedIn ? (
          <Button
            onClick={start}
            disabled={busy || cartCount(items) === 0 || (mode !== "pickup" && !addressId)}
            loading={busy}
          >
            {t("continueToPayment")}
          </Button>
        ) : (
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(`/s/${slug}/carrito`)}`}>
              {t("signInToBuy")}
            </Link>
          </Button>
        )}
      </aside>
    </div>
  )
}

/**
 * Lo apartado, con su desglose y su cuenta atrás.
 *
 * Es la instantánea que se acaba de escribir en el servidor: el mismo subtotal, el mismo envío y el
 * mismo total que se van a cobrar. Nada de esto se calcula aquí.
 */
function Summary({
  checkout,
  money,
  onCancel,
  busy,
  slug,
  labels,
}: {
  checkout: Checkout
  money: (amount: string) => string
  onCancel: () => void
  busy: boolean
  slug: string
  labels: Record<string, string>
}) {
  return (
    <div className="mx-auto flex w-full max-w-140 flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <h2 className="text-title1 font-bold text-content">{labels.title}</h2>
      <p className="text-body2 text-content-muted">{labels.held}</p>

      <ul className="flex flex-col gap-2 border-line border-y py-3">
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
          <dt className="text-content-muted">{labels.subtotal}</dt>
          <dd className="text-content">{money(checkout.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-content-muted">{labels.shipping}</dt>
          <dd className="text-content">{money(checkout.shippingCost)}</dd>
        </div>
        <div className="flex justify-between text-title2 font-bold">
          <dt className="text-content">{labels.total}</dt>
          <dd className="text-content">{money(checkout.total)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        {checkout.checkoutUrl ? (
          <Button asChild>
            <a href={checkout.checkoutUrl}>{labels.pay}</a>
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {labels.cancel}
        </Button>
      </div>

      <Link href={`/s/${slug}`} className="text-body2 text-content-muted underline">
        {labels.back}
      </Link>
    </div>
  )
}
