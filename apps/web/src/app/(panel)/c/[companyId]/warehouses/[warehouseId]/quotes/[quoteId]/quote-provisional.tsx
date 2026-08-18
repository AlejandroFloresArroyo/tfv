"use client"

import { Button, Callout, Dialog, DialogContent, DialogTrigger, Field, Input } from "@tfv/ui"
import { PackagePlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { ApiError, api, SessionExpiredError } from "~/lib/api.client.ts"
import type { RateCandidate } from "./quote-editor.tsx"

/**
 * El alta provisional desde el constructor.
 *
 * Aparece donde se descubre que falta: bajo el «no hay coincidencias» del buscador. Alguien está
 * cotizando con un cliente delante y el equipo existe en la nave pero no en el catálogo; obligarle
 * a irse a la pantalla de catálogo, rellenar cinco pasos y volver es lo que hace que la gente
 * termine la cotización a mano en otro sitio.
 *
 * ## Por qué una sola petición
 *
 * Producto, medida y unidades entran **en una transacción**. Encadenar tres llamadas desde el
 * navegador dejaría productos huérfanos —sin medida, o con medida y sin existencias— el día que la
 * segunda falle, y nadie los volvería a mirar.
 *
 * ## Qué no pide
 *
 * **Precio.** Para eso está el precio negociado de la línea, que es como se cotiza de verdad cuando
 * la lista está sin llenar. Pedirlo aquí obligaría a inventar una tarifa en el peor momento posible
 * para inventarla.
 *
 * Y nace **marcado**: mientras lo esté no se publica, y aparece en la bandeja de por completar. Sin
 * la marca, «ya lo completaré luego» es una intención; con ella es una lista.
 */
export function ProvisionalProduct({
  base,
  type,
  term,
  onCreated,
}: {
  /** `/companies/{id}/warehouses/{id}`. */
  base: string
  type: "rent" | "sale"
  /** Lo que se estaba buscando. Es el nombre más probable, así que se ofrece escrito. */
  term: string
  onCreated: (candidate: RateCandidate) => void
}) {
  const t = useTranslations("warehouses.quotes")
  const common = useTranslations("common")
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [measurement, setMeasurement] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()

  function change(next: boolean) {
    if (busy) return
    setOpen(next)
    if (next) {
      setName(term.trim())
      setMeasurement(t("provisionalDefaultMeasurement"))
      setQuantity(1)
      setError(null)
    }
  }

  function create() {
    setError(null)
    startBusy(async () => {
      try {
        const product = await api<{
          id: string
          name: string
          code: string
          price: string
          measurements: { id: string; name: string }[]
        }>(`${base}/products`, {
          method: "POST",
          body: {
            name: name.trim(),
            isProvisional: true,
            availableForRent: type === "rent",
            availableForSale: type === "sale",
            measurements: [{ name: measurement.trim(), initialQuantity: quantity }],
          },
        })

        const created = product.measurements[0]
        if (!created) throw new Error(t("provisionalFailed"))

        // Sin tarifa: la línea nace sin precio y se señala, que es exactamente lo que es. El precio
        // se pone a mano en la propia línea.
        onCreated({
          measurementId: created.id,
          measurementName: created.name,
          productId: product.id,
          productName: product.name,
          productCode: product.code,
          productPriceId: null,
          basePrice: product.price,
          available: quantity,
        })

        setOpen(false)
        router.refresh()
      } catch (failure) {
        if (failure instanceof SessionExpiredError) {
          router.replace("/login")
          return
        }
        setError(failure instanceof ApiError ? failure.message : t("provisionalFailed"))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <PackagePlus className="size-4" aria-hidden="true" />
          {t("addProvisional")}
        </Button>
      </DialogTrigger>

      <DialogContent
        title={t("provisionalTitle")}
        description={t("provisionalDescription")}
        locked={busy}
        closeLabel={common("close")}
      >
        <div className="flex flex-col gap-4">
          {error ? (
            <Callout tone="danger" live>
              {error}
            </Callout>
          ) : null}

          <Field label={t("provisionalName")}>
            {(ids) => (
              <Input
                {...ids}
                type="text"
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>

          <div className="grid gap-4 tablet:grid-cols-[1fr_8rem]">
            <Field label={t("provisionalMeasurement")} hint={t("provisionalMeasurementHint")}>
              {(ids) => (
                <Input
                  {...ids}
                  type="text"
                  value={measurement}
                  disabled={busy}
                  onChange={(event) => setMeasurement(event.target.value)}
                />
              )}
            </Field>

            <Field label={t("quantity")}>
              {(ids) => (
                <Input
                  {...ids}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={quantity}
                  disabled={busy}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                />
              )}
            </Field>
          </div>

          <p className="text-body3 text-content-faint">{t("provisionalNote")}</p>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => change(false)}>
              {common("cancel")}
            </Button>
            <Button
              loading={busy}
              disabled={name.trim() === "" || measurement.trim() === ""}
              onClick={create}
            >
              {t("provisionalSubmit")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
