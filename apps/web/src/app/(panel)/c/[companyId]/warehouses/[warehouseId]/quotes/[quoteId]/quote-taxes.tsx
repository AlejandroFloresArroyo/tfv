"use client"

import type { AdditionalTax, QuoteTaxes, TaxEntry } from "@tfv/contracts/quotation"
import {
  Button,
  Callout,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Panel,
  Select,
} from "@tfv/ui"
import { ChevronDown, Plus, Trash2, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useId, useMemo, useState } from "react"
import { ApiError, api, SessionExpiredError } from "~/lib/api.client.ts"
import { useAutosave } from "~/lib/autosave.ts"
import { SaveState } from "./quote-payment.tsx"
import { usePublishPreview } from "./quote-preview.tsx"

/**
 * El bloque fiscal.
 *
 * **Es una guía, no una declaración.** Sirve para entregar un previo a quien pide una cotización:
 * los porcentajes y los conceptos se escriben a mano, no hay catálogo de regímenes ni validación
 * contra la autoridad. Eso llega mucho después, con la facturación.
 *
 * ## Por qué sólo se ve lo activado
 *
 * Son ocho conceptos fijos. Ocho filas en cero, siempre a la vista, son una pared que invita a
 * escribir el porcentaje en la casilla equivocada; casi toda cotización lleva IVA y nada más. Se
 * ven los que están puestos, y un menú ofrece los que faltan.
 *
 * **Quitar uno lo desactiva sin perder su porcentaje**, que es lo que pide `quotation-pricing`: el
 * menú lo devuelve con la cifra que tenía, no en blanco.
 */

const RATE = /^\d+(\.\d{1,4})?$/
const AMOUNT = /^\d+(\.\d{1,2})?$/

/** El orden de presentación es el del documento, no el de escritura. */
const KEYS = [
  "iva",
  "isr",
  "ivaRetention",
  "isrRetention",
  "ieps",
  "isn",
  "hospitality",
  "frontier",
] as const

type TaxKey = (typeof KEYS)[number]

const IVA_TYPES = ["trasladado", "acreditable", "exento"] as const
const ISR_TYPES = ["retenido", "directo"] as const

interface Entry {
  readonly enabled: boolean
  readonly rate: string
  readonly concept: string
  readonly type: string
}

interface Row {
  readonly key: string
  readonly name: string
  readonly enabled: boolean
  readonly type: "percent" | "amount"
  readonly value: string
  readonly effect: "increase" | "decrease"
}

interface Form {
  readonly entries: Readonly<Record<TaxKey, Entry>>
  readonly additional: readonly Row[]
}

export function QuoteTaxesPanel({
  companyId,
  warehouseId,
  quoteId,
  taxes,
  editable,
}: {
  companyId: string
  warehouseId: string
  quoteId: string
  taxes: QuoteTaxes | null
  editable: boolean
}) {
  const t = useTranslations("warehouses.quotes")
  const router = useRouter()
  const prefix = useId()
  const [form, setForm] = useState<Form>(() => formOf(taxes))

  const { value, invalid } = useMemo(() => derive(form), [form])

  const autosave = useAutosave(value, async (next) => {
    try {
      await api(`/companies/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}/taxes`, {
        method: "PUT",
        body: next,
      })
      router.refresh()
    } catch (failure) {
      if (failure instanceof SessionExpiredError) {
        router.replace("/login")
        return
      }
      throw failure instanceof ApiError ? failure : new Error(t("taxesFailed"))
    }
  })

  const publish = usePublishPreview()
  useEffect(() => {
    if (invalid.size === 0) publish.taxes(value)
  }, [publish, value, invalid])

  const commit = () => {
    if (invalid.size === 0) autosave.commit()
  }
  const patch = (key: TaxKey, changes: Partial<Entry>) =>
    setForm((current) => ({
      ...current,
      entries: { ...current.entries, [key]: { ...current.entries[key], ...changes } },
    }))

  const shown = KEYS.filter((key) => form.entries[key].enabled)
  const available = KEYS.filter((key) => !form.entries[key].enabled)

  return (
    <section aria-labelledby="taxes-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="taxes-heading" className="text-title2 font-bold text-content">
          {t("taxes")}
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

      <Panel className="space-y-4 p-5">
        <p className="text-body3 text-content-faint">{t("taxesGuide")}</p>

        {shown.length === 0 && form.additional.length === 0 ? (
          <p className="text-body3 text-content-muted">{t("noTaxes")}</p>
        ) : null}

        {shown.map((key) => (
          <div key={key} className="grid gap-3 rounded-sm border border-field p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-body2 font-bold text-content">{t(`taxOf.${key}`)}</h3>
              {editable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("removeTax", { name: t(`taxOf.${key}`) })}
                  onClick={() => {
                    // Desactivar, no borrar: el porcentaje se recuerda para cuando vuelva.
                    patch(key, { enabled: false })
                    queueMicrotask(commit)
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>

            <div className="grid gap-4 tablet:grid-cols-3">
              <Field label={t("rate")}>
                {(ids) => (
                  <Input
                    {...ids}
                    type="text"
                    inputMode="decimal"
                    value={form.entries[key].rate}
                    disabled={!editable}
                    aria-invalid={invalid.has(key) || undefined}
                    onChange={(event) => patch(key, { rate: event.target.value })}
                    onBlur={commit}
                  />
                )}
              </Field>

              {key === "iva" || key === "isr" ? (
                <Field label={t("taxType")}>
                  {(ids) => (
                    <Select
                      {...ids}
                      value={form.entries[key].type}
                      disabled={!editable}
                      onChange={(event) => {
                        patch(key, { type: event.target.value })
                        queueMicrotask(commit)
                      }}
                    >
                      {(key === "iva" ? IVA_TYPES : ISR_TYPES).map((option) => (
                        <option key={option} value={option}>
                          {t(`taxTypeOf.${option}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : null}

              <Field label={t("concept")} hint={t("conceptHint")}>
                {(ids) => (
                  <Input
                    {...ids}
                    type="text"
                    value={form.entries[key].concept}
                    disabled={!editable}
                    onChange={(event) => patch(key, { concept: event.target.value })}
                    onBlur={commit}
                  />
                )}
              </Field>
            </div>
          </div>
        ))}

        {form.additional.map((row) => {
          const incomplete =
            row.name.trim() === "" ||
            !(row.type === "percent" ? RATE : AMOUNT).test(row.value.trim())

          return (
            <div key={row.key} className="grid gap-3 rounded-sm border border-field p-3">
              <div className="flex flex-wrap items-end gap-3">
                <Field label={t("contributionName")} className="min-w-40 flex-1">
                  {(ids) => (
                    <Input
                      {...ids}
                      type="text"
                      value={row.name}
                      disabled={!editable}
                      onChange={(event) =>
                        updateRow(setForm, row.key, { name: event.target.value })
                      }
                      onBlur={commit}
                    />
                  )}
                </Field>

                <Field label={t("contributionType")} className="w-36">
                  {(ids) => (
                    <Select
                      {...ids}
                      value={row.type}
                      disabled={!editable}
                      onChange={(event) => {
                        updateRow(setForm, row.key, { type: event.target.value as Row["type"] })
                        queueMicrotask(commit)
                      }}
                    >
                      <option value="percent">{t("discountPercent")}</option>
                      <option value="amount">{t("discountAmount")}</option>
                    </Select>
                  )}
                </Field>

                <Field label={t("value")} className="w-28">
                  {(ids) => (
                    <Input
                      {...ids}
                      type="text"
                      inputMode="decimal"
                      value={row.value}
                      disabled={!editable}
                      onChange={(event) =>
                        updateRow(setForm, row.key, { value: event.target.value })
                      }
                      onBlur={commit}
                    />
                  )}
                </Field>

                <Field label={t("effect")} className="w-36">
                  {(ids) => (
                    <Select
                      {...ids}
                      value={row.effect}
                      disabled={!editable}
                      onChange={(event) => {
                        updateRow(setForm, row.key, { effect: event.target.value as Row["effect"] })
                        queueMicrotask(commit)
                      }}
                    >
                      <option value="increase">{t("effectIncrease")}</option>
                      <option value="decrease">{t("effectDecrease")}</option>
                    </Select>
                  )}
                </Field>

                {editable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t("removeTax", { name: row.name || t("contributionName") })}
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        additional: current.additional.filter((one) => one.key !== row.key),
                      }))
                      queueMicrotask(commit)
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>

              {incomplete ? (
                <p className="inline-flex items-center gap-1.5 text-body3 text-warning">
                  <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                  {t("contributionIncomplete")}
                </p>
              ) : null}
            </div>
          )
        })}

        {editable ? (
          <div className="flex flex-wrap gap-2">
            {available.length > 0 ? (
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="secondary" size="sm">
                    {t("addTax")}
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  {available.map((key) => (
                    <MenuItem
                      key={key}
                      onSelect={() => {
                        patch(key, { enabled: true })
                        queueMicrotask(commit)
                      }}
                    >
                      {t(`taxOf.${key}`)}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  additional: [
                    ...current.additional,
                    {
                      key: `${prefix}-${current.additional.length}-${Date.now()}`,
                      name: "",
                      enabled: true,
                      type: "percent" as const,
                      value: "",
                      effect: "increase" as const,
                    },
                  ],
                }))
              }
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("addContribution")}
            </Button>
          </div>
        ) : null}
      </Panel>
    </section>
  )
}

function updateRow(
  setForm: (update: (current: Form) => Form) => void,
  key: string,
  changes: Partial<Row>,
) {
  setForm((current) => ({
    ...current,
    additional: current.additional.map((row) => (row.key === key ? { ...row, ...changes } : row)),
  }))
}

// ─── Del servidor al formulario, y de vuelta ─────────────────────────────────

function entryOf(entry: (TaxEntry & { type?: string }) | undefined, fallback: string): Entry {
  return {
    enabled: entry?.enabled === true,
    rate: entry?.rate ?? "",
    concept: entry?.concept ?? "",
    type: entry?.type ?? fallback,
  }
}

function formOf(taxes: QuoteTaxes | null): Form {
  return {
    entries: {
      iva: entryOf(taxes?.iva, "trasladado"),
      isr: entryOf(taxes?.isr, "retenido"),
      ivaRetention: entryOf(taxes?.ivaRetention, ""),
      isrRetention: entryOf(taxes?.isrRetention, ""),
      ieps: entryOf(taxes?.ieps, ""),
      isn: entryOf(taxes?.isn, ""),
      hospitality: entryOf(taxes?.hospitality, ""),
      frontier: entryOf(taxes?.frontier, ""),
    },
    additional: (taxes?.additional ?? []).map((one, index) => ({
      key: `guardado-${index}`,
      name: one.name,
      enabled: one.enabled,
      type: one.type,
      value: one.value,
      effect: one.effect,
    })),
  }
}

/**
 * El formulario convertido en bloque fiscal, y los conceptos con el porcentaje a medio escribir.
 *
 * Un concepto **desactivado con porcentaje escrito viaja igual**: es lo que permite recuperarlo con
 * su cifra. Uno desactivado y nunca tocado no viaja, para no llenar el documento de ceros.
 */
function derive(form: Form): { value: QuoteTaxes | null; invalid: ReadonlySet<string> } {
  const invalid = new Set<string>()

  const entry = (key: TaxKey): TaxEntry | undefined => {
    const current = form.entries[key]
    const rate = current.rate.trim()
    if (!current.enabled && rate === "") return undefined
    if (rate !== "" && !RATE.test(rate)) {
      invalid.add(key)
      return undefined
    }
    return {
      enabled: current.enabled,
      rate: rate === "" ? "0" : rate,
      ...(current.concept.trim() === "" ? {} : { concept: current.concept.trim() }),
    }
  }

  const iva = entry("iva")
  const isr = entry("isr")

  const additional: AdditionalTax[] = form.additional
    .filter(
      (row) =>
        row.name.trim() !== "" && (row.type === "percent" ? RATE : AMOUNT).test(row.value.trim()),
    )
    .map((row) => ({
      name: row.name.trim(),
      enabled: row.enabled,
      type: row.type,
      value: row.value.trim(),
      effect: row.effect,
    }))

  const taxes: QuoteTaxes = {
    version: 1,
    ...(iva === undefined
      ? {}
      : {
          iva: { ...iva, type: form.entries.iva.type as "trasladado" | "acreditable" | "exento" },
        }),
    ...(isr === undefined
      ? {}
      : { isr: { ...isr, type: form.entries.isr.type as "retenido" | "directo" } }),
    ...withEntry("ivaRetention", entry("ivaRetention")),
    ...withEntry("isrRetention", entry("isrRetention")),
    ...withEntry("ieps", entry("ieps")),
    ...withEntry("isn", entry("isn")),
    ...withEntry("hospitality", entry("hospitality")),
    ...withEntry("frontier", entry("frontier")),
    ...(additional.length === 0 ? {} : { additional }),
  }

  return { value: Object.keys(taxes).length === 1 ? null : taxes, invalid }
}

function withEntry(key: TaxKey, entry: TaxEntry | undefined): Record<string, TaxEntry> {
  return entry === undefined ? {} : { [key]: entry }
}
