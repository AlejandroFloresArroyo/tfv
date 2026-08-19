"use client"

import { Button, Callout, Field, Input, Panel, Select, Separator } from "@tfv/ui"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { text, useSubmit } from "~/components/use-submit.ts"
import { formatAmount } from "~/lib/amount.ts"
import { api } from "~/lib/api.client.ts"

interface Surcharge {
  kind: "distance" | "item_count"
  threshold: number
  amount: string
}

interface Quote {
  mode: string
  realWeightKg: string
  volumetricWeightKg: string
  billableWeightKg: string
  itemCount: number
  distanceKm?: number
  base: string
  variable: string
  surcharges: Surcharge[]
  surchargeTotal: string
  currency: string
  total: string
  sourceCurrency?: string
  sourceTotal?: string
  exchangeRate?: string
}

const MODES = ["local", "national", "international", "pickup"] as const

/**
 * Qué costaría un envío con el cuadro actual.
 *
 * **No calcula nada: pregunta al servidor.** Es el requisito de la spec —«cuando la interfaz
 * muestre una estimación, SHALL obtenerla del servidor y no calcularla por su cuenta»—, y el
 * defecto que esta rebanada cierra es exactamente el contrario: el algoritmo estaba copiado palabra
 * por palabra en el navegador, así que un cambio en una copia dejaba a la otra enseñando un importe
 * que ya no se cobraba.
 *
 * Sirve además para lo que nadie tenía forma de hacer: comprobar una tarifa recién guardada sin
 * esperar a que alguien compre.
 *
 * No manda domicilio de destino, así que **no hay recargo por distancia**: comprobarlo pediría un
 * domicilio de comprador real, y la pantalla lo dice en lugar de callarlo.
 */
export function ShippingSimulator({
  companyId,
  currency,
}: {
  companyId: string
  currency: string
}) {
  const t = useTranslations()
  const format = useFormatter()

  const [quote, setQuote] = useState<Quote | null>(null)

  const state = useSubmit(
    (data) =>
      api<Quote>(`/companies/${companyId}/shipping/estimate`, {
        method: "POST",
        body: {
          mode: text(data, "mode"),
          items: [
            {
              id: t("shipping.simulator.itemId"),
              quantity: Number(text(data, "quantity") || 1),
              weight: text(data, "weight") || "1",
              weightUnit: "kg",
              length: text(data, "length") || "10",
              width: text(data, "width") || "10",
              height: text(data, "height") || "10",
              lengthUnit: "cm",
            },
          ],
        },
      }),
    { onDone: setQuote, refresh: false },
  )

  const rows = quote
    ? [
        { label: t("shipping.simulator.billable"), value: `${quote.billableWeightKg} kg` },
        { label: t("shipping.simulator.real"), value: `${quote.realWeightKg} kg` },
        { label: t("shipping.simulator.volumetric"), value: `${quote.volumetricWeightKg} kg` },
        { label: t("shipping.simulator.base"), value: formatAmount(quote.base, format) },
        { label: t("shipping.simulator.variable"), value: formatAmount(quote.variable, format) },
      ]
    : []

  return (
    <Panel className="p-5">
      <form onSubmit={state.submit} className="flex flex-col gap-4">
        <div>
          <h2 className="text-title2 font-bold text-content">{t("shipping.simulator.title")}</h2>
          <p className="mt-1 text-body3 text-content-faint">{t("shipping.simulator.hint")}</p>
        </div>

        {state.error ? <Callout tone="danger">{state.error}</Callout> : null}

        <Field label={t("shipping.simulator.mode")}>
          {(ids) => (
            <Select {...ids} name="mode" defaultValue="national">
              {MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`shipping.modes.${mode}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid gap-3 tablet:grid-cols-2">
          <Field label={t("shipping.simulator.quantity")}>
            {(ids) => <Input {...ids} name="quantity" inputMode="numeric" defaultValue="1" />}
          </Field>

          <Field label={t("shipping.simulator.weight")}>
            {(ids) => <Input {...ids} name="weight" inputMode="decimal" defaultValue="1" />}
          </Field>
        </div>

        <div className="grid gap-3 tablet:grid-cols-3">
          <Field label={t("shipping.simulator.length")}>
            {(ids) => <Input {...ids} name="length" inputMode="decimal" defaultValue="10" />}
          </Field>
          <Field label={t("shipping.simulator.width")}>
            {(ids) => <Input {...ids} name="width" inputMode="decimal" defaultValue="10" />}
          </Field>
          <Field label={t("shipping.simulator.height")}>
            {(ids) => <Input {...ids} name="height" inputMode="decimal" defaultValue="10" />}
          </Field>
        </div>

        <Button type="submit" variant="secondary" disabled={state.pending}>
          {state.pending ? t("shipping.simulator.calculating") : t("shipping.simulator.calculate")}
        </Button>

        {/* El desglose se retira cuando el cálculo falla. Dejarlo puesto junto al error enseñaría
            un total que ya no corresponde a lo que hay en el formulario, y es el número que quien
            mira se lleva — el error se lee como un aviso y la cifra como la respuesta. */}
        {quote && !state.error ? (
          <>
            <Separator />

            <dl className="flex flex-col gap-2">
              {rows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-2">
                  <dt className="text-body3 text-content-faint">{row.label}</dt>
                  <dd className="text-body2 text-content">{row.value}</dd>
                </div>
              ))}

              {quote.surcharges.map((surcharge) => (
                <div
                  key={`${surcharge.kind}-${surcharge.threshold}`}
                  className="flex items-baseline justify-between gap-2"
                >
                  <dt className="text-body3 text-content-faint">
                    {t(`shipping.simulator.surcharge.${surcharge.kind}`, {
                      threshold: surcharge.threshold,
                    })}
                  </dt>
                  <dd className="text-body2 text-content">
                    {formatAmount(surcharge.amount, format)}
                  </dd>
                </div>
              ))}

              <Separator className="my-1" />

              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-body1 font-semibold text-content">
                  {t("shipping.simulator.total")}
                </dt>
                <dd className="text-title2 font-bold text-content">
                  {formatAmount(quote.total, format)} {quote.currency}
                </dd>
              </div>

              {/* El tipo aplicado se enseña porque es lo que queda registrado con el envío: sin él
                  el importe convertido no se puede explicar meses después. */}
              {quote.exchangeRate ? (
                <p className="text-body3 text-content-faint">
                  {t("shipping.simulator.converted", {
                    amount: formatAmount(quote.sourceTotal ?? "0", format),
                    currency: quote.sourceCurrency ?? currency,
                    rate: quote.exchangeRate,
                  })}
                </p>
              ) : null}
            </dl>

            <p className="text-body3 text-content-faint">{t("shipping.simulator.noDistance")}</p>
          </>
        ) : null}
      </form>
    </Panel>
  )
}
