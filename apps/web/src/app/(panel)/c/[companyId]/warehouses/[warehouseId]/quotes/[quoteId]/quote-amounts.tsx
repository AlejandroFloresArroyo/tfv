"use client"

import type { QuotationBreakdown, QuotationTaxBreakdown } from "@tfv/contracts/quotation"
import { Panel, Separator } from "@tfv/ui"
import { useFormatter, useTranslations } from "next-intl"
import { formatAmount } from "~/lib/amount.ts"
import { usePreviewedQuote } from "./quote-preview.tsx"

/**
 * La cadena de importes, de subtotal a total.
 *
 * El bloque de cobro **sólo aparece cuando hay algo cobrado**. Con cero, «Saldo» sería el bruto
 * entero mientras «Total a pagar» ya descontó el anticipo pactado: dos cifras distintas sin que
 * nada haya pasado, que es la clase de contradicción aparente que enseña a desconfiar del panel.
 *
 * **Enseña lo que el constructor está calculando si hay algo sin guardar**, y lo que devolvió el
 * servidor si no. Es la única manera de que estas cifras y los totales de línea que tiene al lado
 * digan lo mismo mientras se edita; con el desglose guardado a secas, tocar una cantidad hacía que
 * las dos columnas se contradijeran a un palmo de distancia.
 *
 * El desglose del servidor sigue mandando en cuanto se guarda. Esto no es una segunda fuente: es la
 * misma función de cálculo, un instante antes de que viaje.
 */
export function QuoteAmounts({
  saved,
  closed,
}: {
  /** El desglose que devolvió el servidor. Congelado si la cotización está cerrada. */
  saved: QuotationBreakdown
  closed: boolean
}) {
  const t = useTranslations("warehouses.quotes")
  const format = useFormatter()
  const preview = usePreviewedQuote()

  const breakdown = preview.dirty && preview.breakdown ? preview.breakdown : saved
  const amount = (value: string) => formatAmount(value, format)

  return (
    <Panel className="p-5">
      <h2 className="text-title2 font-bold text-content">{t("amounts")}</h2>
      <p className="mt-1 text-body3 text-content-faint">
        {preview.dirty ? t("amountsUnsaved") : closed ? t("amountsFrozen") : t("amountsLive")}
      </p>

      <dl className="mt-4 grid gap-3">
        <Row
          label={breakdown.packagePrice === undefined ? t("linesTotal") : t("packagePrice")}
          value={amount(breakdown.packagePrice ?? breakdown.linesTotal)}
        />
        {breakdown.additionals !== "0.00" ? (
          <Row label={t("additionals")} value={amount(breakdown.additionals)} />
        ) : null}
        <Row label={t("subtotal")} value={amount(breakdown.subtotal)} />
        {breakdown.discount !== "0.00" ? (
          <Row label={t("discount")} value={`−${amount(breakdown.discount)}`} />
        ) : null}
        <Row label={t("base")} value={amount(breakdown.base)} />

        {breakdown.taxes.map((tax) => (
          <Row
            key={tax.key}
            label={taxLabel(tax, t)}
            value={`${tax.effect === "decrease" ? "−" : ""}${amount(tax.amount)}`}
          />
        ))}

        <Row label={t("net")} value={amount(breakdown.net)} />
        {breakdown.fees !== "0.00" ? (
          <Row label={t("fees")} value={amount(breakdown.fees)} />
        ) : null}
        {breakdown.advance !== "0.00" ? (
          <Row label={t("advance")} value={`−${amount(breakdown.advance)}`} />
        ) : null}
      </dl>

      <Separator className="my-4" />

      <dl className="grid gap-1">
        <dt className="text-body3 font-semibold text-content-faint">{t("total")}</dt>
        <dd className="display font-mono text-h2 text-content tnum">{amount(breakdown.total)}</dd>
      </dl>

      {breakdown.collected !== "0.00" ? (
        <>
          <Separator className="my-4" />
          <dl className="grid gap-3">
            <Row label={t("collected")} value={`−${amount(breakdown.collected)}`} />
            <Row label={t("balance")} value={amount(breakdown.balance)} />
          </dl>
          <p className="mt-2 text-body3 text-content-faint">{t("balanceHint")}</p>
        </>
      ) : null}

      {breakdown.penalty !== "0.00" || breakdown.deposit !== "0.00" ? (
        <>
          <Separator className="my-4" />
          <p className="text-body3 font-semibold text-content-faint">{t("contingent")}</p>
          <p className="mt-1 text-body3 text-content-faint">{t("contingentHint")}</p>

          <dl className="mt-3 grid gap-3">
            {breakdown.penalty !== "0.00" ? (
              <Row label={t("penalty")} value={amount(breakdown.penalty)} />
            ) : null}
            {breakdown.deposit !== "0.00" ? (
              <Row label={t("deposit")} value={amount(breakdown.deposit)} />
            ) : null}
          </dl>
        </>
      ) : null}
    </Panel>
  )
}

/**
 * El nombre de un impuesto.
 *
 * Manda lo que escribió quien lo registró; si no escribió nada, se traduce su clave. Lo que **no**
 * se hace es enseñar la clave: `iva` es un identificador interno, y un documento con consecuencias
 * contractuales no puede mostrar el nombre de una columna.
 */
function taxLabel(tax: QuotationTaxBreakdown, t: (key: string) => string): string {
  if (tax.concept) return tax.concept
  return tax.key.startsWith("additional:") ? tax.key : t(`taxOf.${tax.key}`)
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-body3 font-semibold text-content-faint">{label}</dt>
      <dd className="font-mono text-body2 text-content-muted tnum">{value}</dd>
    </div>
  )
}
