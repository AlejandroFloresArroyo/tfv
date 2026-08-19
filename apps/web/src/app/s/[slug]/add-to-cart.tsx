"use client"

import { Button, Field, Input, Select } from "@tfv/ui"
import { Check, ShoppingCart } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { type CartItem, mergeItem, readCart, writeCart } from "~/lib/cart.ts"

/**
 * El botón que llena el carrito, en la ficha del producto.
 *
 * Ver `openspec/specs/storefront-checkout/spec.md`, requisito «Carrito de la tienda de almacén»:
 * «cada línea del carrito SHALL referenciar una **medida** de producto con su cantidad».
 *
 * Por eso hay que elegir medida antes de añadir, y por eso el botón no existe cuando el producto no
 * tiene ninguna: no hay nada que apartar. Un producto sin precio publicado tampoco se puede añadir —
 * la ficha dice «precio a consultar», que es una invitación a escribir, no a comprar.
 *
 * **No comprueba existencia.** Lo hace el carrito al valorarse y, de verdad, la compra al apartar:
 * entre mirar y pagar cabe otro comprador, así que una comprobación aquí sería una promesa que esta
 * pantalla no puede cumplir.
 */
export function AddToCart({
  slug,
  productName,
  price,
  coverUrl,
  measurements,
}: {
  slug: string
  productName: string
  price: string | null
  coverUrl: string | null
  measurements: readonly { id: string; name: string }[]
}) {
  const t = useTranslations("storefront")
  const [measurementId, setMeasurementId] = useState(measurements[0]?.id ?? "")
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  if (price === null || measurements.length === 0) return null

  const add = () => {
    const measurement = measurements.find((row) => row.id === measurementId)
    if (!measurement) return

    const item: CartItem = {
      refId: measurement.id,
      quantity,
      name: `${productName} · ${measurement.name}`,
      unitPrice: price,
      coverUrl,
    }

    writeCart(slug, mergeItem(readCart(slug), item))
    setAdded(true)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end gap-3">
        {measurements.length > 1 ? (
          <Field label={t("measurement")}>
            {(ids) => (
              <Select
                {...ids}
                value={measurementId}
                onChange={(event) => setMeasurementId(event.target.value)}
              >
                {measurements.map((measurement) => (
                  <option key={measurement.id} value={measurement.id}>
                    {measurement.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        <Field label={t("quantity")} className="w-24">
          {(ids) => (
            <Input
              {...ids}
              type="number"
              min={1}
              max={99}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
            />
          )}
        </Field>

        <Button onClick={add}>
          <ShoppingCart className="size-4" aria-hidden />
          {t("addToCart")}
        </Button>
      </div>

      {added ? (
        <p className="flex items-center gap-2 text-body2 text-content-muted">
          <Check className="size-4 text-success" aria-hidden />
          {t("addedToCart")}
          <Link href={`/s/${slug}/carrito`} className="font-semibold text-content underline">
            {t("goToCart")}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
