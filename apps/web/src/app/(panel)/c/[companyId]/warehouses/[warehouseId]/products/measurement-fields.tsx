"use client"

import {
  LENGTH_UNITS,
  type LengthUnit,
  MASS_UNITS,
  type MassUnit,
  MEASUREMENT_KINDS,
  type MeasurementKind,
} from "@tfv/contracts/catalog"
import {
  AmountInput,
  Button,
  type DecimalSeparator,
  Field,
  Input,
  Panel,
  Select,
  toDecimalString,
} from "@tfv/ui"
import { Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"

/**
 * Los campos de una medida, y lo que hace falta para convertirlos en lo que la API admite.
 *
 * Viven aparte porque los piden **los dos asistentes**: el de producto, en su paso cuatro, y el de
 * variante, en su paso tres. Son el mismo formulario y la misma conversión; separarlos habría
 * dejado dos copias que divergen en el primer arreglo.
 */

export interface MeasurementDraft {
  /** Sólo para React: las medidas no tienen identidad hasta que el servidor las crea. */
  readonly key: string
  name: string
  kind: MeasurementKind
  priceDifference: string
  height: string
  width: string
  length: string
  weight: string
  lengthUnit: LengthUnit
  massUnit: MassUnit
  initialQuantity: string
  garment: string
  size: string
}

export function newKey(): string {
  return Math.random().toString(36).slice(2)
}

export function emptyMeasurement(): MeasurementDraft {
  return {
    key: newKey(),
    name: "",
    kind: "box",
    priceDifference: "",
    height: "",
    width: "",
    length: "",
    weight: "",
    lengthUnit: "cm",
    massUnit: "kg",
    initialQuantity: "",
    garment: "",
    size: "",
  }
}

/** Una cadena vacía no es un valor: es un campo que nadie llenó. */
export function text(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}

export function amount(value: string, decimal: DecimalSeparator): string | undefined {
  const trimmed = value.trim()
  return trimmed === "" ? undefined : toDecimalString(trimmed, decimal)
}

export function size(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === "") return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function measurementBody(
  draft: MeasurementDraft,
  decimal: DecimalSeparator,
): Record<string, unknown> {
  const dimensions = {
    ...(size(draft.height) === undefined ? {} : { height: size(draft.height) }),
    ...(size(draft.width) === undefined ? {} : { width: size(draft.width) }),
    ...(size(draft.length) === undefined ? {} : { length: size(draft.length) }),
    ...(size(draft.weight) === undefined ? {} : { weight: size(draft.weight) }),
  }

  const clothing = {
    ...(text(draft.garment) === undefined ? {} : { garment: text(draft.garment) }),
    ...(text(draft.size) === undefined ? {} : { size: text(draft.size) }),
  }

  return {
    name: draft.name.trim(),
    kind: draft.kind,
    ...(amount(draft.priceDifference, decimal) === undefined
      ? {}
      : { priceDifference: amount(draft.priceDifference, decimal) }),
    ...(Object.keys(dimensions).length === 0 ? {} : { dimensions }),
    lengthUnit: draft.lengthUnit,
    massUnit: draft.massUnit,
    ...(draft.kind === "clothing" && Object.keys(clothing).length > 0 ? { clothing } : {}),
    ...(size(draft.initialQuantity) === undefined
      ? {}
      : { initialQuantity: size(draft.initialQuantity) }),
  }
}

export function MeasurementCard({
  draft,
  index,
  errors,
  decimal,
  removable,
  onChange,
  onRemove,
}: {
  draft: MeasurementDraft
  index: number
  errors: Readonly<Record<string, string>>
  decimal: DecimalSeparator
  removable: boolean
  onChange: (patch: Partial<MeasurementDraft>) => void
  onRemove: () => void
}) {
  const t = useTranslations()
  const error = (field: string) => errors[`${index}.${field}`]

  return (
    <Panel className="flex flex-col gap-4 bg-panel-sunken p-4">
      <div className="flex items-start gap-3">
        <Field
          label={t("warehouses.products.name")}
          required
          error={error("name")}
          className="flex-1"
        >
          {(ids) => (
            <Input
              {...ids}
              value={draft.name}
              onChange={(event) => onChange({ name: event.target.value })}
              placeholder={t("warehouses.wizard.measurementPlaceholder")}
            />
          )}
        </Field>

        {removable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-7"
            onClick={onRemove}
            aria-label={t("warehouses.wizard.removeMeasurement")}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 tablet:grid-cols-2">
        <Field label={t("warehouses.wizard.kind")}>
          {(ids) => (
            <Select
              {...ids}
              value={draft.kind}
              onChange={(event) => onChange({ kind: event.target.value as MeasurementKind })}
            >
              {MEASUREMENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`warehouses.measurements.kinds.${kind}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label={t("warehouses.wizard.initialQuantity")}
          hint={t("warehouses.wizard.initialQuantityHint")}
          error={error("initialQuantity")}
        >
          {(ids) => (
            <Input
              {...ids}
              inputMode="numeric"
              value={draft.initialQuantity}
              onChange={(event) =>
                onChange({ initialQuantity: event.target.value.replace(/\D/g, "") })
              }
            />
          )}
        </Field>
      </div>

      <div className="grid gap-3 tablet:grid-cols-4">
        {(["height", "width", "length", "weight"] as const).map((dimension) => (
          <Field key={dimension} label={t(`warehouses.measurements.${dimension}`)}>
            {(ids) => (
              <Input
                {...ids}
                inputMode="decimal"
                value={draft[dimension]}
                onChange={(event) => onChange({ [dimension]: event.target.value })}
              />
            )}
          </Field>
        ))}
      </div>

      <div className="grid gap-3 tablet:grid-cols-2">
        <Field label={t("warehouses.wizard.lengthUnit")}>
          {(ids) => (
            <Select
              {...ids}
              value={draft.lengthUnit}
              onChange={(event) => onChange({ lengthUnit: event.target.value as LengthUnit })}
            >
              {LENGTH_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t("warehouses.wizard.massUnit")}>
          {(ids) => (
            <Select
              {...ids}
              value={draft.massUnit}
              onChange={(event) => onChange({ massUnit: event.target.value as MassUnit })}
            >
              {MASS_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field
        label={t("warehouses.wizard.priceDifference")}
        hint={t("warehouses.wizard.priceDifferenceHint")}
        error={error("priceDifference")}
      >
        {(ids) => (
          <AmountInput
            {...ids}
            negative
            decimal={decimal}
            value={draft.priceDifference}
            onValueChange={(next) => onChange({ priceDifference: next })}
          />
        )}
      </Field>

      {draft.kind === "clothing" ? (
        <div className="grid gap-3 tablet:grid-cols-2">
          <Field label={t("warehouses.measurements.garment")}>
            {(ids) => (
              <Input
                {...ids}
                value={draft.garment}
                onChange={(event) => onChange({ garment: event.target.value })}
              />
            )}
          </Field>

          <Field label={t("warehouses.measurements.size")}>
            {(ids) => (
              <Input
                {...ids}
                value={draft.size}
                onChange={(event) => onChange({ size: event.target.value })}
              />
            )}
          </Field>
        </div>
      ) : null}
    </Panel>
  )
}
