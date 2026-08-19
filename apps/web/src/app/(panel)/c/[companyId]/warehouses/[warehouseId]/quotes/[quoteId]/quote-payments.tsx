"use client"

import { Badge, Button, Callout, Field, Input, Panel, Select, Separator } from "@tfv/ui"
import { Plus, Trash2, Wallet } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { formatAmount } from "~/lib/amount.ts"
import { ApiError, api, SessionExpiredError } from "~/lib/api.client.ts"

/**
 * Los cobros: dinero que **entró**, no dinero pactado.
 *
 * El anticipo vive arriba, en las condiciones de pago, y mueve el total del documento. Esto mueve
 * el saldo. Están separados en la pantalla por la misma razón que en el modelo: son dos hechos
 * distintos, y el día que no coincidan —que es casi siempre, porque se pacta antes de cobrar— hace
 * falta poder verlos por separado.
 *
 * ## Con botón, al contrario que las condiciones
 *
 * Registrar un cobro es un **acto**, no la edición de un campo: la fecha en que se hizo importa, y
 * dispararlo al perder el foco convertiría un tecleo a medias en un asiento. Las condiciones se
 * negocian y se corrigen; un cobro ocurre una vez.
 *
 * ## Todavía sin comprobante
 *
 * La spec pide que sea consultable y no lo es: falta el almacenamiento de ficheros. Se decidió que
 * el registro entrara antes, porque llevar la cuenta a mano mientras tanto es peor.
 */

const METHODS = ["cash", "transfer", "card"] as const
const AMOUNT = /^\d+(\.\d{1,2})?$/

export interface PaymentRow {
  id: string
  amount: string
  method: (typeof METHODS)[number]
  description: string | null
  paidByName: string | null
  createdAt: string
}

export function QuotePayments({
  companyId,
  warehouseId,
  quoteId,
  payments,
  editable,
}: {
  companyId: string
  warehouseId: string
  quoteId: string
  payments: readonly PaymentRow[]
  /** Sin `edit_payment` se ven, no se tocan. Una cotización cerrada **sí** admite cobro. */
  editable: boolean
}) {
  const t = useTranslations("warehouses.quotes")
  const format = useFormatter()
  const router = useRouter()

  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<(typeof METHODS)[number]>("transfer")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()

  const base = `/companies/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}/payments`
  const valid = AMOUNT.test(amount.trim())

  function run(work: () => Promise<unknown>) {
    setError(null)
    startBusy(async () => {
      try {
        await work()
        router.refresh()
      } catch (failure) {
        if (failure instanceof SessionExpiredError) {
          router.replace("/login")
          return
        }
        setError(failure instanceof ApiError ? failure.message : t("paymentFailed"))
      }
    })
  }

  return (
    <section aria-labelledby="payments-heading" className="space-y-3">
      <div className="flex items-center gap-2">
        <Wallet className="size-5 text-content-faint" aria-hidden="true" />
        <h2 id="payments-heading" className="text-title2 font-bold text-content">
          {t("payments")}
        </h2>
      </div>

      {error ? (
        <Callout tone="danger" live>
          {error}
        </Callout>
      ) : null}

      <Panel className="space-y-4 p-5">
        <p className="text-body3 text-content-faint">{t("paymentsHint")}</p>

        {payments.length === 0 ? (
          <p className="text-body3 text-content-muted">{t("noPayments")}</p>
        ) : (
          <ul className="grid gap-2">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-edge-control p-3"
              >
                <div className="min-w-0">
                  <p className="text-body1 font-semibold text-content tabular-nums">
                    {formatAmount(payment.amount, format)}
                  </p>
                  <p className="truncate text-body3 text-content-faint">
                    {[
                      format.dateTime(new Date(payment.createdAt), { dateStyle: "medium" }),
                      payment.paidByName,
                      payment.description,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge>{t(`methodOf.${payment.method}`)}</Badge>
                  {editable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busy}
                      aria-label={t("removePayment", {
                        amount: formatAmount(payment.amount, format),
                      })}
                      onClick={() => run(() => api(`${base}/${payment.id}`, { method: "DELETE" }))}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {editable ? (
          <>
            <Separator />

            <div className="flex flex-wrap items-end gap-3">
              <Field label={t("amount")} className="w-32">
                {(ids) => (
                  <Input
                    {...ids}
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    aria-invalid={(amount.trim() !== "" && !valid) || undefined}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                )}
              </Field>

              <Field label={t("method")} className="w-40">
                {(ids) => (
                  <Select
                    {...ids}
                    value={method}
                    onChange={(event) => setMethod(event.target.value as (typeof METHODS)[number])}
                  >
                    {METHODS.map((option) => (
                      <option key={option} value={option}>
                        {t(`methodOf.${option}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label={t("paymentNote")} className="min-w-40 flex-1">
                {(ids) => (
                  <Input
                    {...ids}
                    type="text"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                )}
              </Field>

              <Button
                loading={busy}
                disabled={!valid}
                onClick={() =>
                  run(async () => {
                    await api(base, {
                      method: "POST",
                      body: {
                        amount: amount.trim(),
                        method,
                        ...(description.trim() === "" ? {} : { description: description.trim() }),
                      },
                    })
                    setAmount("")
                    setDescription("")
                  })
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                {t("addPayment")}
              </Button>
            </div>
          </>
        ) : null}
      </Panel>
    </section>
  )
}
