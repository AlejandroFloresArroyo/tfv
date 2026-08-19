"use client"

import {
  AmountInput,
  Button,
  Callout,
  Field,
  Input,
  Panel,
  Separator,
  toDecimalString,
} from "@tfv/ui"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { text, useSubmit } from "~/components/use-submit.ts"
import { decimalSeparator } from "~/lib/amount.ts"
import { api } from "~/lib/api.client.ts"

export interface Threshold {
  over: number
  amount: string
}

export interface RatesRecord {
  currency: string
  volumetricDivisor: number
  localBase: string
  localPerKilogram: string
  nationalBase: string
  nationalPerKilogram: string
  internationalBase: string
  internationalPerKilogram: string
  distanceSurcharges: Threshold[]
  itemSurcharges: Threshold[]
  exchangeCurrency: string | null
  exchangeRate: string | null
  configured: boolean
}

/** Los tres modos con transporte. La recolección no aparece: cuesta cero por definición. */
const MODES = ["local", "national", "international"] as const
type Mode = (typeof MODES)[number]

const BASE_FIELD = {
  local: "localBase",
  national: "nationalBase",
  international: "internationalBase",
} as const satisfies Record<Mode, keyof RatesRecord>

const PER_KG_FIELD = {
  local: "localPerKilogram",
  national: "nationalPerKilogram",
  international: "internationalPerKilogram",
} as const satisfies Record<Mode, keyof RatesRecord>

/**
 * El cuadro de tarifas, editable.
 *
 * Manda **el bloque entero** en cada guardado, no sólo lo que cambió: es lo que hace seguro repetir
 * un intento que falló a medias, y evita depender de que la fusión del servidor se comporte de una
 * manera concreta.
 *
 * Los umbrales se editan como filas y no como campos sueltos porque son una lista: la spec define
 * hoy dos tramos, y quien necesite un tercero no debería tener que esperar a una migración.
 */
export function ShippingRatesForm({
  companyId,
  rates,
  canEdit,
}: {
  companyId: string
  rates: RatesRecord
  canEdit: boolean
}) {
  const t = useTranslations()
  const decimal = decimalSeparator(useFormatter())

  const [draft, setDraft] = useState(rates)
  const [saved, setSaved] = useState(false)

  const state = useSubmit(
    (data) =>
      api<RatesRecord>(`/companies/${companyId}/shipping/rates`, {
        method: "PATCH",
        body: {
          currency: text(data, "currency").toUpperCase(),
          volumetricDivisor: Number(text(data, "volumetricDivisor")),
          localBase: toDecimalString(draft.localBase, decimal),
          localPerKilogram: toDecimalString(draft.localPerKilogram, decimal),
          nationalBase: toDecimalString(draft.nationalBase, decimal),
          nationalPerKilogram: toDecimalString(draft.nationalPerKilogram, decimal),
          internationalBase: toDecimalString(draft.internationalBase, decimal),
          internationalPerKilogram: toDecimalString(draft.internationalPerKilogram, decimal),
          distanceSurcharges: draft.distanceSurcharges.map((row) => ({
            over: Number(row.over),
            amount: toDecimalString(row.amount, decimal),
          })),
          itemSurcharges: draft.itemSurcharges.map((row) => ({
            over: Number(row.over),
            amount: toDecimalString(row.amount, decimal),
          })),
          // Cadena vacía es «no convertir», no «convertir a nada»: se manda nulo explícito, que es
          // lo que el servidor distingue de ausente.
          exchangeCurrency: text(data, "exchangeCurrency").toUpperCase() || null,
          exchangeRate: toDecimalString(draft.exchangeRate ?? "", decimal) || null,
        },
      }),
    // El borrador se rehace con lo que **devolvió el servidor**, no con lo que se envió. Sin esto
    // el aviso de «cuadro heredado» seguía puesto después de guardar —`configured` se queda en el
    // valor con el que se pintó la página— y decía que la empresa aún no tiene tarifas propias
    // justo cuando acaba de estrenarlas.
    {
      onDone: (record) => {
        setDraft(record)
        setSaved(true)
      },
    },
  )

  function patch(next: Partial<RatesRecord>) {
    setSaved(false)
    setDraft((current) => ({ ...current, ...next }))
  }

  function patchThreshold(
    key: "distanceSurcharges" | "itemSurcharges",
    index: number,
    next: Partial<Threshold>,
  ) {
    setSaved(false)
    setDraft((current) => ({
      ...current,
      [key]: current[key].map((row, position) => (position === index ? { ...row, ...next } : row)),
    }))
  }

  return (
    <Panel className="p-5">
      <form onSubmit={state.submit} className="flex flex-col gap-5">
        <div>
          <h2 className="text-title2 font-bold text-content">{t("shipping.rates.title")}</h2>
          <p className="mt-1 text-body3 text-content-faint">{t("shipping.rates.hint")}</p>
        </div>

        {/* Que el cuadro sea heredado y no propio es lo primero que hay que saber: explica por qué
            los números están puestos sin que nadie los haya escrito. */}
        {draft.configured ? null : <Callout tone="info">{t("shipping.rates.inherited")}</Callout>}

        {state.error ? <Callout tone="danger">{state.error}</Callout> : null}
        {saved && !state.pending ? (
          <Callout tone="success">{t("shipping.rates.saved")}</Callout>
        ) : null}

        <Separator />

        <div className="grid gap-3 tablet:grid-cols-2">
          <Field label={t("shipping.rates.currency")} error={state.fieldErrors.get("currency")}>
            {(ids) => (
              <Input
                {...ids}
                name="currency"
                defaultValue={draft.currency}
                maxLength={3}
                disabled={!canEdit}
              />
            )}
          </Field>

          <Field
            label={t("shipping.rates.volumetricDivisor")}
            hint={t("shipping.rates.volumetricDivisorHint")}
            error={state.fieldErrors.get("volumetricDivisor")}
          >
            {(ids) => (
              <Input
                {...ids}
                name="volumetricDivisor"
                inputMode="numeric"
                defaultValue={String(draft.volumetricDivisor)}
                disabled={!canEdit}
              />
            )}
          </Field>
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <h3 className="text-body1 font-semibold text-content">{t("shipping.rates.tariffs")}</h3>

          {MODES.map((mode) => (
            <div key={mode} className="grid gap-3 tablet:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Field label={t(`shipping.modes.${mode}`)} hint={t("shipping.rates.base")}>
                {(ids) => (
                  <AmountInput
                    {...ids}
                    decimal={decimal}
                    value={draft[BASE_FIELD[mode]] as string}
                    onValueChange={(next) => patch({ [BASE_FIELD[mode]]: next })}
                    disabled={!canEdit}
                  />
                )}
              </Field>

              <Field label={t("shipping.rates.perKilogram")} hint={t("shipping.rates.perKgHint")}>
                {(ids) => (
                  <AmountInput
                    {...ids}
                    decimal={decimal}
                    value={draft[PER_KG_FIELD[mode]] as string}
                    onValueChange={(next) => patch({ [PER_KG_FIELD[mode]]: next })}
                    disabled={!canEdit}
                  />
                )}
              </Field>
            </div>
          ))}

          <p className="text-body3 text-content-faint">{t("shipping.rates.pickupHint")}</p>
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <h3 className="text-body1 font-semibold text-content">{t("shipping.rates.distance")}</h3>
          <p className="text-body3 text-content-faint">{t("shipping.rates.exclusiveHint")}</p>

          {draft.distanceSurcharges.map((row, index) => (
            <div
              // El umbral identifica la fila: es lo único estable mientras se edita el importe.
              key={`distancia-${row.over}`}
              className="grid gap-3 tablet:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            >
              <Field label={t("shipping.rates.overKm")}>
                {(ids) => (
                  <Input
                    {...ids}
                    inputMode="numeric"
                    value={String(row.over)}
                    onChange={(event) =>
                      patchThreshold("distanceSurcharges", index, {
                        over: Number(event.target.value.replace(/\D/g, "") || 0),
                      })
                    }
                    disabled={!canEdit}
                  />
                )}
              </Field>

              <Field label={t("shipping.rates.surcharge")}>
                {(ids) => (
                  <AmountInput
                    {...ids}
                    decimal={decimal}
                    value={row.amount}
                    onValueChange={(next) =>
                      patchThreshold("distanceSurcharges", index, { amount: next })
                    }
                    disabled={!canEdit}
                  />
                )}
              </Field>
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <h3 className="text-body1 font-semibold text-content">{t("shipping.rates.items")}</h3>
          <p className="text-body3 text-content-faint">{t("shipping.rates.exclusiveHint")}</p>

          {draft.itemSurcharges.map((row, index) => (
            <div
              key={`articulos-${row.over}`}
              className="grid gap-3 tablet:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            >
              <Field label={t("shipping.rates.overItems")}>
                {(ids) => (
                  <Input
                    {...ids}
                    inputMode="numeric"
                    value={String(row.over)}
                    onChange={(event) =>
                      patchThreshold("itemSurcharges", index, {
                        over: Number(event.target.value.replace(/\D/g, "") || 0),
                      })
                    }
                    disabled={!canEdit}
                  />
                )}
              </Field>

              <Field label={t("shipping.rates.surcharge")}>
                {(ids) => (
                  <AmountInput
                    {...ids}
                    decimal={decimal}
                    value={row.amount}
                    onValueChange={(next) =>
                      patchThreshold("itemSurcharges", index, { amount: next })
                    }
                    disabled={!canEdit}
                  />
                )}
              </Field>
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <h3 className="text-body1 font-semibold text-content">{t("shipping.rates.exchange")}</h3>
          <p className="text-body3 text-content-faint">{t("shipping.rates.exchangeHint")}</p>

          <div className="grid gap-3 tablet:grid-cols-2">
            <Field label={t("shipping.rates.exchangeCurrency")}>
              {(ids) => (
                <Input
                  {...ids}
                  name="exchangeCurrency"
                  defaultValue={draft.exchangeCurrency ?? ""}
                  maxLength={3}
                  placeholder={t("shipping.rates.noExchange")}
                  disabled={!canEdit}
                />
              )}
            </Field>

            <Field label={t("shipping.rates.exchangeRate")}>
              {(ids) => (
                <AmountInput
                  {...ids}
                  decimal={decimal}
                  value={draft.exchangeRate ?? ""}
                  onValueChange={(next) => patch({ exchangeRate: next })}
                  disabled={!canEdit}
                />
              )}
            </Field>
          </div>
        </div>

        {canEdit ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={state.pending}>
              {state.pending ? t("shipping.rates.saving") : t("common.save")}
            </Button>
          </div>
        ) : (
          <p className="text-body3 text-content-faint">{t("shipping.rates.readOnly")}</p>
        )}
      </form>
    </Panel>
  )
}
