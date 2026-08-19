"use client"

import type {
  QuotationAdditional,
  QuotationDiscount,
  QuotationPayment,
  QuotePaymentTerms,
} from "@tfv/contracts/quotation"
import { Button, Callout, Field, Input, Panel, Select, Separator, Switch } from "@tfv/ui"
import { Check, Plus, Trash2, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useId, useMemo, useState } from "react"
import { ApiError, api, SessionExpiredError } from "~/lib/api.client.ts"
import { useAutosave } from "~/lib/autosave.ts"
import { usePublishPreview } from "./quote-preview.tsx"

/**
 * Las condiciones de pago: descuento, paquete, adicionales, comisiones, anticipo, depósito y
 * penalización.
 *
 * ## Sin botón
 *
 * Se guarda solo: el texto al perder el foco, los interruptores y selectores al cambiar. La
 * mecánica —una petición en vuelo a la vez, y un fallo que no revierte lo escrito— vive en
 * `useAutosave`, con sus pruebas.
 *
 * ## Por qué un campo a medio escribir bloquea el guardado entero
 *
 * El `PUT` manda **el objeto completo**. Si un importe a medio escribir se tratara como «ausente»,
 * teclear `15` y salir del campo borraría del servidor el valor que había. Así que un campo con
 * algo que no es un importe no se manda: se marca, y el bloque entero espera. Vaciarlo del todo sí
 * es una instrucción —«quítalo»— y viaja.
 *
 * ## Por qué las filas incompletas no viajan
 *
 * Un concepto adicional sin nombre lo rechaza el esquema, y uno guardado a medias acaba en el
 * documento del cliente con el nombre en blanco. Mientras le falte nombre o importe vive sólo aquí,
 * marcado. No bloquea: no es un error, es una fila a medio hacer.
 */

const AMOUNT = /^\d+(\.\d{1,2})?$/
const RATE = /^\d+(\.\d{1,4})?$/
const METHODS = ["card", "cash", "transfer"] as const

interface AdditionalRow {
  readonly key: string
  readonly name: string
  readonly description: string
  readonly amount: string
}

interface Form {
  readonly discountType: "percent" | "amount"
  readonly discountValue: string
  readonly discountPerProduct: boolean
  readonly fixedPrice: string
  readonly additionals: readonly AdditionalRow[]
  readonly transferFeeRate: string
  readonly additionalFeeRate: string
  readonly spreadFees: boolean
  readonly advanceAmount: string
  readonly advanceMethod: string
  readonly advanceDate: string
  readonly depositAmount: string
  readonly depositMethod: string
  readonly depositDate: string
  readonly penaltyFixed: string
  readonly penaltyConcept: string
}

export function QuotePaymentTermsPanel({
  companyId,
  warehouseId,
  quoteId,
  terms,
  editable,
}: {
  companyId: string
  warehouseId: string
  quoteId: string
  terms: QuotePaymentTerms | null
  /** Sin permiso de edición, o con la cotización cerrada: se ve, no se toca. */
  editable: boolean
}) {
  const t = useTranslations("warehouses.quotes")
  const router = useRouter()
  const [form, setForm] = useState<Form>(() => formOf(terms))

  const { value, invalid } = useMemo(() => derive(form), [form])

  const autosave = useAutosave(value, async (next) => {
    try {
      await api(
        `/companies/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}/payment-terms`,
        {
          method: "PUT",
          body: next,
        },
      )
      router.refresh()
    } catch (failure) {
      if (failure instanceof SessionExpiredError) {
        router.replace("/login")
        return
      }
      throw failure instanceof ApiError ? failure : new Error(t("paymentFailed"))
    }
  })

  // El panel de importes vive en la otra columna: publica en cada tecla, no al guardar.
  const publish = usePublishPreview()
  useEffect(() => {
    if (invalid.size === 0) publish.payment(value)
  }, [publish, value, invalid])

  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }))
  // Sólo se manda lo que está completo. Un campo a medias espera; no borra lo que había.
  const commit = () => {
    if (invalid.size === 0) autosave.commit()
  }
  const bad = (field: string) => invalid.has(field) || undefined

  const money = (field: keyof Form, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      {(ids) => (
        <Input
          {...ids}
          type="text"
          inputMode="decimal"
          value={String(form[field])}
          disabled={!editable}
          aria-invalid={bad(field)}
          onChange={(event) => set({ [field]: event.target.value } as Partial<Form>)}
          onBlur={commit}
        />
      )}
    </Field>
  )

  return (
    <section aria-labelledby="payment-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="payment-heading" className="text-title2 font-bold text-content">
          {t("paymentTerms")}
        </h2>
        <SaveState
          saving={autosave.saving}
          pending={autosave.pending}
          saved={autosave.saved}
          editable={editable}
          incomplete={invalid.size > 0}
        />
      </div>

      {autosave.error ? (
        <Callout tone="danger" live>
          {autosave.error}
        </Callout>
      ) : null}

      <Panel className="space-y-5 p-5">
        <div className="grid gap-4 tablet:grid-cols-3">
          <Field label={t("discountType")}>
            {(ids) => (
              <Select
                {...ids}
                value={form.discountType}
                disabled={!editable}
                onChange={(event) => {
                  set({ discountType: event.target.value as Form["discountType"] })
                  queueMicrotask(commit)
                }}
              >
                <option value="percent">{t("discountPercent")}</option>
                <option value="amount">{t("discountAmount")}</option>
              </Select>
            )}
          </Field>

          {money(
            "discountValue",
            form.discountType === "percent" ? t("discountAsRate") : t("discountAsAmount"),
          )}

          <Field label={t("discountScope")} hint={t("discountScopeHint")}>
            {(ids) => (
              <Switch
                {...ids}
                checked={form.discountPerProduct}
                disabled={!editable}
                onCheckedChange={(checked) => {
                  set({ discountPerProduct: checked })
                  queueMicrotask(commit)
                }}
              />
            )}
          </Field>
        </div>

        <Separator />

        <div className="grid gap-4 tablet:grid-cols-2">
          {money("fixedPrice", t("packagePrice"), t("packagePriceHint"))}
          {money("penaltyFixed", t("penaltyFixed"), t("penaltyFixedHint"))}
        </div>

        <Field label={t("penaltyConcept")}>
          {(ids) => (
            <Input
              {...ids}
              type="text"
              value={form.penaltyConcept}
              disabled={!editable}
              onChange={(event) => set({ penaltyConcept: event.target.value })}
              onBlur={commit}
            />
          )}
        </Field>

        <Separator />

        <Additionals
          rows={form.additionals}
          editable={editable}
          onChange={(additionals) => set({ additionals })}
          onCommit={commit}
        />

        <Separator />

        <div className="grid gap-4 tablet:grid-cols-2">
          {money("transferFeeRate", t("transferFee"))}
          {money("additionalFeeRate", t("additionalFee"))}
        </div>

        <Field label={t("spreadFees")} hint={t("spreadFeesHint")}>
          {(ids) => (
            <Switch
              {...ids}
              checked={form.spreadFees}
              disabled={!editable}
              onCheckedChange={(checked) => {
                set({ spreadFees: checked })
                queueMicrotask(commit)
              }}
            />
          )}
        </Field>

        {form.spreadFees && form.fixedPrice.trim() !== "" ? (
          <p className="inline-flex items-center gap-1.5 text-body3 text-content-muted">
            <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
            {t("spreadFeesMoot")}
          </p>
        ) : null}

        <Separator />

        <PaymentFields
          legend={t("advance")}
          hint={t("advanceHint")}
          amount={form.advanceAmount}
          method={form.advanceMethod}
          date={form.advanceDate}
          invalid={bad("advanceAmount")}
          editable={editable}
          onChange={(patch) =>
            set({
              ...(patch.amount === undefined ? {} : { advanceAmount: patch.amount }),
              ...(patch.method === undefined ? {} : { advanceMethod: patch.method }),
              ...(patch.date === undefined ? {} : { advanceDate: patch.date }),
            })
          }
          onCommit={commit}
        />

        <PaymentFields
          legend={t("deposit")}
          hint={t("depositHint")}
          amount={form.depositAmount}
          method={form.depositMethod}
          date={form.depositDate}
          invalid={bad("depositAmount")}
          editable={editable}
          onChange={(patch) =>
            set({
              ...(patch.amount === undefined ? {} : { depositAmount: patch.amount }),
              ...(patch.method === undefined ? {} : { depositMethod: patch.method }),
              ...(patch.date === undefined ? {} : { depositDate: patch.date }),
            })
          }
          onCommit={commit}
        />
      </Panel>
    </section>
  )
}

/**
 * El estado del guardado automático, donde estaría el botón que no hay.
 *
 * El aviso y el visto van con **la pareja cruda de la paleta**, no con `text-warning` y
 * `text-success`: esos dos nombres no existen. El sistema de diseño declara `danger` y ninguno de
 * los otros dos, así que la clase no generaba nada y el aviso salía del color del texto normal —
 * comprobado en el navegador, `rgb(30,30,30)` en los dos casos. Son las mismas parejas que usa
 * `Badge` para sus tonos. Ver H-57: cuando el token semántico exista, esto vuelve a un nombre.
 */
export function SaveState({
  saving,
  pending,
  saved,
  editable,
  incomplete,
  incompleteLabel,
}: {
  saving: boolean
  pending: boolean
  saved: boolean
  editable: boolean
  incomplete: boolean
  /**
   * Qué está a medio escribir, cuando no es un importe.
   *
   * Los dos bloques de dinero sólo se quedan a medias por una cifra, y ése es el aviso por omisión.
   * La identidad se queda a medias por **media ventana de fechas**, que es otra cosa y pide otro
   * texto: decirle «hay un importe a medio escribir» a quien acaba de teclear una fecha le manda a
   * buscar un campo que no existe.
   */
  incompleteLabel?: string
}) {
  const t = useTranslations("warehouses.quotes")
  if (!editable) return <span className="text-body3 text-content-faint">{t("readOnly")}</span>
  if (saving) return <span className="text-body3 text-content-muted">{t("saving")}</span>
  if (incomplete)
    return (
      <span className="inline-flex items-center gap-1 text-body3 text-warning">
        <TriangleAlert className="size-4" aria-hidden="true" />
        {incompleteLabel ?? t("incompleteField")}
      </span>
    )
  if (pending) return <span className="text-body3 text-content-muted">{t("unsaved")}</span>
  // Sin nada guardado todavía no hay nada que anunciar: al abrir la ficha, un «Guardado» cuenta un
  // acto que nadie hizo.
  if (!saved) return null
  return (
    <span className="inline-flex items-center gap-1 text-body3 text-content-muted">
      <Check className="size-4 text-success" aria-hidden="true" />
      {t("autosaved")}
    </span>
  )
}

/** Importe, método y fecha de un anticipo o un depósito. */
function PaymentFields({
  legend,
  hint,
  amount,
  method,
  date,
  invalid,
  editable,
  onChange,
  onCommit,
}: {
  legend: string
  hint: string
  amount: string
  method: string
  date: string
  invalid: true | undefined
  editable: boolean
  onChange: (patch: { amount?: string; method?: string; date?: string }) => void
  onCommit: () => void
}) {
  const t = useTranslations("warehouses.quotes")

  return (
    <fieldset className="grid gap-3">
      <legend className="text-body2 font-bold text-content">{legend}</legend>
      <p className="text-body3 text-content-faint">{hint}</p>

      <div className="grid gap-4 tablet:grid-cols-3">
        <Field label={t("amount")}>
          {(ids) => (
            <Input
              {...ids}
              type="text"
              inputMode="decimal"
              value={amount}
              disabled={!editable}
              aria-invalid={invalid}
              onChange={(event) => onChange({ amount: event.target.value })}
              onBlur={onCommit}
            />
          )}
        </Field>

        <Field label={t("method")}>
          {(ids) => (
            <Select
              {...ids}
              value={method}
              disabled={!editable}
              onChange={(event) => {
                onChange({ method: event.target.value })
                queueMicrotask(onCommit)
              }}
            >
              <option value="">{t("noMethod")}</option>
              {METHODS.map((option) => (
                <option key={option} value={option}>
                  {t(`methodOf.${option}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t("date")}>
          {(ids) => (
            <Input
              {...ids}
              type="date"
              value={date}
              disabled={!editable}
              onChange={(event) => onChange({ date: event.target.value })}
              onBlur={onCommit}
            />
          )}
        </Field>
      </div>
    </fieldset>
  )
}

/** Los conceptos sueltos que suman al subtotal sin ser catálogo. */
function Additionals({
  rows,
  editable,
  onChange,
  onCommit,
}: {
  rows: readonly AdditionalRow[]
  editable: boolean
  onChange: (rows: readonly AdditionalRow[]) => void
  onCommit: () => void
}) {
  const t = useTranslations("warehouses.quotes")
  const prefix = useId()

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body2 font-bold text-content">{t("additionals")}</h3>
        {editable ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange([
                ...rows,
                {
                  key: `${prefix}-${rows.length}-${Date.now()}`,
                  name: "",
                  description: "",
                  amount: "",
                },
              ])
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("addAdditional")}
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-body3 text-content-muted">{t("noAdditionals")}</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => {
            const incomplete = row.name.trim() === "" || !AMOUNT.test(row.amount.trim())

            return (
              <li key={row.key} className="grid gap-2 rounded-sm border border-field p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label={t("conceptName")} className="min-w-40 flex-1">
                    {(ids) => (
                      <Input
                        {...ids}
                        type="text"
                        value={row.name}
                        disabled={!editable}
                        onChange={(event) =>
                          onChange(
                            rows.map((current) =>
                              current.key === row.key
                                ? { ...current, name: event.target.value }
                                : current,
                            ),
                          )
                        }
                        onBlur={onCommit}
                      />
                    )}
                  </Field>

                  <Field label={t("amount")} className="w-32">
                    {(ids) => (
                      <Input
                        {...ids}
                        type="text"
                        inputMode="decimal"
                        value={row.amount}
                        disabled={!editable}
                        onChange={(event) =>
                          onChange(
                            rows.map((current) =>
                              current.key === row.key
                                ? { ...current, amount: event.target.value }
                                : current,
                            ),
                          )
                        }
                        onBlur={onCommit}
                      />
                    )}
                  </Field>

                  {editable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("removeAdditional", { name: row.name || t("conceptName") })}
                      onClick={() => {
                        onChange(rows.filter((current) => current.key !== row.key))
                        queueMicrotask(onCommit)
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>

                {incomplete ? (
                  <p className="inline-flex items-center gap-1.5 text-body3 text-warning">
                    <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                    {t("additionalIncomplete")}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Del servidor al formulario, y de vuelta ─────────────────────────────────

function formOf(terms: QuotePaymentTerms | null): Form {
  return {
    discountType: terms?.discount?.type ?? "percent",
    discountValue: terms?.discount?.value ?? "",
    discountPerProduct: terms?.discount?.perProduct === true,
    fixedPrice: terms?.fixedPrice ?? "",
    additionals: (terms?.additionals ?? []).map((additional, index) => ({
      key: `guardado-${index}`,
      name: additional.name,
      description: additional.description ?? "",
      amount: additional.amount,
    })),
    transferFeeRate: terms?.transferFeeRate ?? "",
    additionalFeeRate: terms?.additionalFeeRate ?? "",
    spreadFees: terms?.spreadFeesAcrossLines === true,
    advanceAmount: terms?.advance?.amount ?? "",
    advanceMethod: terms?.advance?.method ?? "",
    advanceDate: terms?.advance?.date ?? "",
    depositAmount: terms?.deposit?.amount ?? "",
    depositMethod: terms?.deposit?.method ?? "",
    depositDate: terms?.deposit?.date ?? "",
    penaltyFixed: terms?.penalty?.fixed ?? "",
    penaltyConcept: terms?.penalty?.concept ?? "",
  }
}

/**
 * El formulario convertido en condiciones de pago, y los campos que todavía no lo son.
 *
 * Un campo vacío significa «no hay», y viaja como ausencia. Uno con algo que no es un importe está
 * a medio escribir: se señala y **detiene el guardado del bloque**, porque mandar el objeto sin él
 * borraría del servidor lo que hubiera.
 */
function derive(form: Form): { value: QuotePaymentTerms | null; invalid: ReadonlySet<string> } {
  const invalid = new Set<string>()

  const amount = (field: keyof Form, pattern: RegExp): string | undefined => {
    const text = String(form[field]).trim()
    if (text === "") return undefined
    if (!pattern.test(text)) {
      invalid.add(field)
      return undefined
    }
    return text
  }

  const discountValue = amount("discountValue", form.discountType === "percent" ? RATE : AMOUNT)
  const discount: QuotationDiscount | undefined =
    discountValue === undefined
      ? undefined
      : {
          type: form.discountType,
          value: discountValue,
          ...(form.discountPerProduct ? { perProduct: true } : {}),
        }

  const payment = (
    amountField: keyof Form,
    method: string,
    date: string,
  ): QuotationPayment | undefined => {
    const value = amount(amountField, AMOUNT)
    if (value === undefined) return undefined
    return {
      amount: value,
      ...(method === "" ? {} : { method: method as QuotationPayment["method"] }),
      ...(date === "" ? {} : { date }),
    }
  }

  // Una fila sin nombre o sin importe completo vive sólo en el panel: no es un error, es una fila
  // a medio hacer, y el esquema la rechazaría por el nombre vacío.
  const additionals: QuotationAdditional[] = form.additionals
    .filter((row) => row.name.trim() !== "" && AMOUNT.test(row.amount.trim()))
    .map((row) => ({
      name: row.name.trim(),
      ...(row.description.trim() === "" ? {} : { description: row.description.trim() }),
      amount: row.amount.trim(),
    }))

  const transferFeeRate = amount("transferFeeRate", RATE)
  const additionalFeeRate = amount("additionalFeeRate", RATE)
  const fixedPrice = amount("fixedPrice", AMOUNT)
  const penaltyFixed = amount("penaltyFixed", AMOUNT)
  const penaltyConcept = form.penaltyConcept.trim()
  const advance = payment("advanceAmount", form.advanceMethod, form.advanceDate)
  const deposit = payment("depositAmount", form.depositMethod, form.depositDate)

  const terms: QuotePaymentTerms = {
    version: 1,
    ...(additionals.length === 0 ? {} : { additionals }),
    ...(transferFeeRate === undefined ? {} : { transferFeeRate }),
    ...(additionalFeeRate === undefined ? {} : { additionalFeeRate }),
    ...(form.spreadFees ? { spreadFeesAcrossLines: true } : {}),
    ...(advance === undefined ? {} : { advance }),
    ...(deposit === undefined ? {} : { deposit }),
    ...(fixedPrice === undefined ? {} : { fixedPrice }),
    ...(penaltyFixed === undefined && penaltyConcept === ""
      ? {}
      : {
          penalty: {
            ...(penaltyFixed === undefined ? {} : { fixed: penaltyFixed }),
            ...(penaltyConcept === "" ? {} : { concept: penaltyConcept }),
          },
        }),
    ...(discount === undefined ? {} : { discount }),
  }

  // Sin nada pactado, el bloque entero se retira en lugar de quedar como un objeto con sólo su
  // versión dentro.
  return { value: Object.keys(terms).length === 1 ? null : terms, invalid }
}
