"use client"

import { measurementInput, productChildInput } from "@tfv/contracts/catalog"
import {
  AmountInput,
  Button,
  type DecimalSeparator,
  Field,
  Input,
  Panel,
  Textarea,
  Wizard,
  type WizardState,
  type WizardStepView,
  wizard,
} from "@tfv/ui"
import { Plus } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { z } from "zod"
import { decimalSeparator } from "~/lib/amount.ts"
import { ApiError, api } from "~/lib/api.client.ts"
import { type FieldErrorCode, fieldErrors } from "~/lib/field-errors.ts"
import {
  amount,
  emptyMeasurement,
  MeasurementCard,
  type MeasurementDraft,
  measurementBody,
  size,
  text,
} from "../../../measurement-fields.tsx"

/**
 * Alta de una variante o de un accesorio, en cuatro pasos.
 *
 * Son cuatro y no cinco por una razón del modelo, no de diseño: **un hijo hereda del padre su
 * almacén, su ubicación, su clasificación y su responsable**, así que el paso de clasificación no
 * existe. Lo hereda copiando, no refiriendo, y por eso puede divergir después desde su propia
 * ficha.
 *
 * Variante y accesorio comparten formulario entero. Lo que los distingue es la relación, que la
 * decide el botón desde el que se entra y viaja en la dirección.
 */

type Relation = "variant" | "accessory"

interface ChildValues {
  name: string
  internalCode: string
  description: string
  price: string
  cost: string
  measurements: MeasurementDraft[]
}

const INITIAL: ChildValues = {
  name: "",
  internalCode: "",
  description: "",
  price: "",
  cost: "",
  measurements: [emptyMeasurement()],
}

function body(values: ChildValues, decimal: DecimalSeparator): Record<string, unknown> {
  return {
    name: values.name.trim(),
    ...(text(values.description) === undefined ? {} : { description: text(values.description) }),
    ...(text(values.internalCode) === undefined ? {} : { internalCode: text(values.internalCode) }),
    ...(amount(values.price, decimal) === undefined
      ? {}
      : { price: amount(values.price, decimal) }),
    ...(amount(values.cost, decimal) === undefined ? {} : { cost: amount(values.cost, decimal) }),
    measurements: values.measurements
      .filter((row) => row.name.trim() !== "")
      .map((row) => measurementBody(row, decimal)),
  }
}

export function ChildWizard({
  companyId,
  warehouseId,
  productId,
  parentName,
  relation,
  canEditPayment,
}: {
  companyId: string
  warehouseId: string
  productId: string
  parentName: string
  relation: Relation
  canEditPayment: boolean
}) {
  const t = useTranslations()
  const decimal = decimalSeparator(useFormatter())
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [values, setValues] = useState<ChildValues>(INITIAL)
  const [state, setState] = useState<WizardState>(wizard.start())
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const say = useCallback((code: FieldErrorCode) => t(`forms.errors.${code}`), [t])
  const edit = useCallback((patch: Partial<ChildValues>) => {
    setValues((current) => ({ ...current, ...patch }))
  }, [])

  const steps = useMemo<readonly WizardStepView<ChildValues>[]>(
    () => [
      {
        id: "identity",
        label: t("warehouses.wizard.identity"),
        validate: (current) =>
          fieldErrors(
            productChildInput
              .pick({ name: true, description: true, internalCode: true })
              .safeParse({
                name: current.name.trim(),
                description: text(current.description),
                internalCode: text(current.internalCode),
              }),
            say,
          ),
        content: (errors) => (
          <div className="flex flex-col gap-4">
            <Field label={t("warehouses.products.name")} required error={errors.name}>
              {(ids) => (
                <Input
                  {...ids}
                  value={values.name}
                  onChange={(event) => edit({ name: event.target.value })}
                  autoFocus
                />
              )}
            </Field>

            <Field label={t("warehouses.products.internalCode")} error={errors.internalCode}>
              {(ids) => (
                <Input
                  {...ids}
                  value={values.internalCode}
                  onChange={(event) => edit({ internalCode: event.target.value })}
                />
              )}
            </Field>

            <Field label={t("warehouses.products.description")} error={errors.description}>
              {(ids) => (
                <Textarea
                  {...ids}
                  value={values.description}
                  onChange={(event) => edit({ description: event.target.value })}
                />
              )}
            </Field>
          </div>
        ),
      },

      ...(canEditPayment
        ? [
            {
              id: "money",
              label: t("warehouses.wizard.money"),
              validate: (current) =>
                fieldErrors(
                  productChildInput.pick({ price: true, cost: true }).safeParse({
                    price: amount(current.price, decimal),
                    cost: amount(current.cost, decimal),
                  }),
                  say,
                ),
              content: (errors) => (
                <div className="flex flex-col gap-4">
                  <p className="text-body2 text-content-muted">
                    {t("warehouses.wizard.childPriceHelp")}
                  </p>

                  <Field label={t("warehouses.products.basePrice")} error={errors.price}>
                    {(ids) => (
                      <AmountInput
                        {...ids}
                        decimal={decimal}
                        value={values.price}
                        onValueChange={(next) => edit({ price: next })}
                      />
                    )}
                  </Field>

                  <Field label={t("warehouses.products.cost")} error={errors.cost}>
                    {(ids) => (
                      <AmountInput
                        {...ids}
                        decimal={decimal}
                        value={values.cost}
                        onValueChange={(next) => edit({ cost: next })}
                      />
                    )}
                  </Field>
                </div>
              ),
            } satisfies WizardStepView<ChildValues>,
          ]
        : []),

      {
        id: "measurements",
        label: t("warehouses.wizard.measurements"),
        validate: (current) =>
          fieldErrors(
            z
              .array(measurementInput)
              .safeParse(
                current.measurements
                  .filter((row) => row.name.trim() !== "")
                  .map((row) => measurementBody(row, decimal)),
              ),
            say,
          ),
        content: (errors) => (
          <div className="flex flex-col gap-4">
            <p className="text-body2 text-content-muted">
              {t("warehouses.wizard.measurementsHelp")}
            </p>

            {values.measurements.map((draft, index) => (
              <MeasurementCard
                key={draft.key}
                draft={draft}
                index={index}
                errors={errors}
                decimal={decimal}
                removable={values.measurements.length > 1}
                onChange={(patch) =>
                  edit({
                    measurements: values.measurements.map((row) =>
                      row.key === draft.key ? { ...row, ...patch } : row,
                    ),
                  })
                }
                onRemove={() =>
                  edit({
                    measurements: values.measurements.filter((row) => row.key !== draft.key),
                  })
                }
              />
            ))}

            <Button
              type="button"
              variant="secondary"
              onClick={() => edit({ measurements: [...values.measurements, emptyMeasurement()] })}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("warehouses.wizard.addMeasurement")}
            </Button>
          </div>
        ),
      },

      {
        id: "summary",
        label: t("warehouses.wizard.summary"),
        content: () => {
          const measurements = values.measurements.filter((row) => row.name.trim() !== "")
          const units = measurements.reduce(
            (total, row) => total + (size(row.initialQuantity) ?? 0),
            0,
          )

          return (
            <Panel className="flex flex-col gap-2 p-4">
              <ul className="flex flex-col gap-1 text-body2 text-content-muted">
                <li>{t("warehouses.wizard.summaryProduct", { name: values.name || "—" })}</li>
                <li>{t("warehouses.wizard.summaryParent", { name: parentName })}</li>
                <li>
                  {t("warehouses.wizard.summaryMeasurements", { count: measurements.length })}
                </li>
                <li>{t("warehouses.wizard.summaryUnits", { count: units })}</li>
              </ul>

              <p className="text-body3 text-content-faint">
                {t("warehouses.wizard.summaryInherits")}
              </p>
            </Panel>
          )
        },
      },
    ],
    [values, canEditPayment, decimal, parentName, t, say, edit],
  )

  const requested = Number(params.get("paso") ?? "1") - 1

  useEffect(() => {
    if (requested === state.current) return

    const next = wizard.goTo(state, requested)
    if (next.current === state.current) {
      router.replace(`${pathname}?tipo=${relation}&paso=${state.current + 1}`, { scroll: false })
      return
    }
    setState(next)
  }, [requested, state, router, pathname, relation])

  function change(next: WizardState) {
    setState(next)
    if (next.current !== state.current) {
      router.replace(`${pathname}?tipo=${relation}&paso=${next.current + 1}`, { scroll: false })
    }
  }

  const parent = `/c/${companyId}/warehouses/${warehouseId}/products/${productId}`

  async function submit() {
    setPending(true)
    setFailure(null)

    try {
      const created = await api<{ id: string }>(
        `/companies/${companyId}/warehouses/${warehouseId}/products/${productId}/children`,
        { method: "POST", body: { relation, ...body(values, decimal) } },
      )
      router.push(`/c/${companyId}/warehouses/${warehouseId}/products/${created.id}`)
    } catch (error) {
      setPending(false)
      setFailure(error instanceof ApiError ? error.message : t("common.unexpectedError"))
    }
  }

  return (
    <Panel className="p-5 tablet:p-6">
      <Wizard
        steps={steps}
        values={values}
        state={state}
        onStateChange={change}
        onSubmit={submit}
        onCancel={() => router.push(parent)}
        dirty={JSON.stringify(values) !== JSON.stringify(INITIAL)}
        pending={pending}
        {...(failure === null ? {} : { error: failure })}
        labels={{
          back: t("common.back"),
          next: t("common.next"),
          submit:
            relation === "variant"
              ? t("warehouses.wizard.createVariant")
              : t("warehouses.wizard.createAccessory"),
          cancel: t("common.cancel"),
          counter: (step, total) => t("warehouses.wizard.counter", { step, total }),
          stepWithError: t("warehouses.wizard.stepWithError"),
          stepDone: t("warehouses.wizard.stepDone"),
          discardTitle: t("warehouses.wizard.discardTitle"),
          discardDescription: t("warehouses.wizard.discardBody"),
          discardConfirm: t("warehouses.wizard.discard"),
          discardKeep: t("warehouses.wizard.keep"),
          close: t("common.close"),
        }}
      />
    </Panel>
  )
}
