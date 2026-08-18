"use client"

import { Field, Input, Select, Separator } from "@tfv/ui"
import { Info } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { ApiError, api } from "~/lib/api.client.ts"
import type { RateSchedule } from "../../../warehouse.ts"

/**
 * Un importe completo, tal y como lo acepta la API.
 *
 * Se comprueba **como texto**. Un importe no pasa por `Number` en ningún punto de este archivo:
 * `parseFloat("0.1") + parseFloat("0.2")` no es `0.3`, y una tarifa que se escribe una vez se
 * multiplica después por cada día de cada renta de cada cotización.
 */
const AMOUNT = /^\d+(\.\d{1,2})?$/

/** Las tres periodicidades, en el orden en que se cotizan. */
const FREQUENCIES = ["daily", "weekly", "monthly"] as const

/** La tarifa de un producto, con lo que hace falta para nombrarla y para poder editarla. */
export interface RateRow {
  productId: string
  /** Vacío cuando el producto no cabe en el catálogo cargado. La pantalla lo dice. */
  productName: string
  productCode: string
  sale: string
  rent: RateSchedule
  penalty: RateSchedule
}

interface ScheduleForm {
  readonly isFixed: boolean
  readonly fixed: string
  readonly daily: string
  readonly weekly: string
  readonly monthly: string
}

interface Form {
  readonly sale: string
  readonly rent: ScheduleForm
  readonly penalty: ScheduleForm
}

/**
 * La tarifa de un producto en una lista: venta, renta y penalización.
 *
 * Ver `openspec/specs/warehouse-catalog/spec.md`, «Tarifa de un producto en una lista».
 *
 * ## Una tarifa fija no enseña la periodicidad
 *
 * Marcarla fija significa que se cobra igual con cualquier frecuencia, así que los tres campos por
 * día, semana y mes **desaparecen** y en su sitio queda escrito que no se usan. Dejarlos a la vista
 * y en gris invita a rellenarlos, y quien lo hace se queda esperando un cobro que no llega.
 *
 * Los importes que hubiera **se conservan y viajan igual**: volver a periodicidad no debe costar
 * teclearlos otra vez, y borrarlos por haber pulsado un selector es perder trabajo sin haberlo
 * pedido.
 */
export function EditRate({
  base,
  row,
  open,
  onOpenChange,
}: {
  /** La ruta de la lista: `…/price-lists/{id}`. */
  base: string
  row: RateRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("warehouses.priceLists")
  const [form, setForm] = useState<Form>(() => formOf(row))

  // Se recarga al **abrir**, no al cerrar: cuando se cierra tras guardar, la fila todavía es la
  // anterior —el árbol de servidor está rehaciéndose— y volver a ella dejaría el formulario
  // enseñando lo viejo la próxima vez.
  function change(next: boolean) {
    if (next) setForm(formOf(row))
    onOpenChange(next)
  }

  return (
    <FormDialog
      title={t("rateTitle", { product: row.productName })}
      description={t("rateBody")}
      submitLabel={t("saveRate")}
      size="lg"
      open={open}
      onOpenChange={change}
      action={async () => {
        const invalid = validate(form, t("badAmount"))
        if (invalid.size > 0) throw new ApiError(400, t("badAmounts"), invalid)

        return api(`${base}/prices/${row.productId}`, { method: "PUT", body: bodyOf(form) })
      }}
    >
      {(state) => (
        <>
          <AmountField
            label={t("sale")}
            hint={t("amountHint")}
            value={form.sale}
            error={state.fieldErrors.get("sale")}
            autoFocus
            className="tablet:max-w-56"
            onChange={(sale) => setForm({ ...form, sale })}
          />

          <Separator />

          <ScheduleFields
            name="rent"
            legend={t("rent")}
            hint={t("rentHint")}
            value={form.rent}
            errors={state.fieldErrors}
            onChange={(rent) => setForm({ ...form, rent })}
          />

          <Separator />

          <ScheduleFields
            name="penalty"
            legend={t("penalty")}
            hint={t("penaltyHint")}
            value={form.penalty}
            errors={state.fieldErrors}
            onChange={(penalty) => setForm({ ...form, penalty })}
          />
        </>
      )}
    </FormDialog>
  )
}

/** Una tarifa fija o por periodicidad, con sus campos y sin los que no se usan. */
function ScheduleFields({
  name,
  legend,
  hint,
  value,
  errors,
  onChange,
}: {
  /** `rent` o `penalty`: es también el prefijo con el que la API nombra sus errores. */
  name: "rent" | "penalty"
  legend: string
  hint: string
  value: ScheduleForm
  errors: ReadonlyMap<string, string>
  onChange: (value: ScheduleForm) => void
}) {
  const t = useTranslations("warehouses.priceLists")
  const kept = FREQUENCIES.some((frequency) => value[frequency].trim() !== "")

  return (
    <fieldset className="grid gap-3">
      <legend className="text-body2 font-bold text-content">{legend}</legend>
      <p className="text-body3 text-content-faint">{hint}</p>

      <Field label={t("rateMode")} className="tablet:max-w-56">
        {(ids) => (
          <Select
            {...ids}
            value={value.isFixed ? "fixed" : "periodic"}
            onChange={(event) => onChange({ ...value, isFixed: event.target.value === "fixed" })}
          >
            <option value="periodic">{t("byFrequency")}</option>
            <option value="fixed">{t("fixedRate")}</option>
          </Select>
        )}
      </Field>

      {value.isFixed ? (
        <>
          <AmountField
            label={t("fixedAmount")}
            hint={t("amountHint")}
            value={value.fixed}
            error={errors.get(`${name}.fixed`)}
            className="tablet:max-w-56"
            onChange={(fixed) => onChange({ ...value, fixed })}
          />

          <p className="inline-flex items-start gap-1.5 text-body3 text-content-muted">
            <Info className="mt-0.5 size-4 shrink-0 text-content-faint" aria-hidden="true" />
            <span>{kept ? t("fixedKeepsPeriodic") : t("fixedIgnoresFrequency")}</span>
          </p>
        </>
      ) : (
        <div className="grid gap-3 tablet:grid-cols-3">
          {FREQUENCIES.map((frequency) => (
            <AmountField
              key={frequency}
              label={t(`frequencyOf.${frequency}`)}
              value={value[frequency]}
              error={errors.get(`${name}.${frequency}`)}
              onChange={(amount) => onChange({ ...value, [frequency]: amount })}
            />
          ))}
        </div>
      )}
    </fieldset>
  )
}

/**
 * Un campo de importe.
 *
 * Es el **único** sitio de esta pantalla donde se teclea dinero, y está extraído a propósito:
 * cuando exista el primitivo de entrada de importe de la 28e, se cambia aquí y no en los nueve
 * campos que lo usan.
 *
 * Mientras tanto es un campo de texto con teclado decimal, no un `type="number"`: el numérico
 * redondea, admite notación científica, cambia de valor con la rueda del ratón y devuelve un
 * número de coma flotante. Un importe no puede pasar por ninguna de esas cuatro cosas.
 *
 * En blanco es **sin precio**, que es lo que significa un cero: por eso el marcador de posición lo
 * dice en lugar de sugerir un formato.
 */
function AmountField({
  label,
  hint,
  value,
  error,
  autoFocus,
  className,
  onChange,
}: {
  label: string
  // Con `| undefined` explícito, como `Field`: sin él, `exactOptionalPropertyTypes` obliga a que
  // cada sitio que lo use monte la propiedad condicionalmente para decir «no hay error».
  hint?: string | undefined
  value: string
  error?: string | undefined
  autoFocus?: boolean | undefined
  className?: string | undefined
  onChange: (value: string) => void
}) {
  const t = useTranslations("warehouses.priceLists")

  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(ids) => (
        <Input
          {...ids}
          type="text"
          inputMode="decimal"
          value={value}
          autoFocus={autoFocus}
          placeholder={t("noPrice")}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  )
}

/**
 * Retirar un producto de la lista.
 *
 * **El producto no se toca.** Lo que se borra es la tarifa que tenía aquí, y a partir de ese
 * momento quien resuelva su precio contra esta lista cae al precio escalar del producto o a cero.
 * Es la precedencia funcionando, y hay que decirlo antes de pulsar: «quitar de la lista» se puede
 * leer perfectamente como «dar de baja del catálogo».
 */
export function RemoveFromList({
  base,
  row,
  open,
  onOpenChange,
}: {
  base: string
  row: RateRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()

  return (
    <ConfirmDestructive
      title={t("warehouses.priceLists.removeTitle")}
      entity={row.productName}
      cascade={[t("warehouses.priceLists.removeCascade")]}
      confirmLabel={t("warehouses.priceLists.remove")}
      open={open}
      onOpenChange={onOpenChange}
      action={() => api(`${base}/prices/${row.productId}`, { method: "DELETE" })}
    />
  )
}

/** Las acciones de una tarifa. Las que la persona no puede hacer no se pintan. */
export function RateActions({
  base,
  row,
  canEdit,
  canDelete,
}: {
  base: string
  row: RateRow
  canEdit: boolean
  canDelete: boolean
}) {
  const t = useTranslations()

  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: t("warehouses.priceLists.editRate"),
      dialog: (control) => <EditRate key="edit" base={base} row={row} {...control} />,
    })
  }

  if (canDelete) {
    actions.push({
      key: "remove",
      label: t("warehouses.priceLists.remove"),
      danger: true,
      dialog: (control) => <RemoveFromList key="remove" base={base} row={row} {...control} />,
    })
  }

  // El punto de acceso lleva el nombre del producto: en esta pantalla hay uno por tarifa y otro de
  // la lista entera, y «Acciones» a secas no distingue cuál se está abriendo.
  return (
    <ItemActions
      label={t("warehouses.priceLists.rateActions", { product: row.productName })}
      actions={actions}
    />
  )
}

// ─── Del servidor al formulario, y de vuelta ─────────────────────────────────

function formOf(row: RateRow): Form {
  return {
    // El cero llega del servidor como el importe que es, y aquí se enseña como lo que significa:
    // un campo vacío. Un «0.00» en la casilla se lee como un precio decidido, y casi nunca lo es.
    sale: amountOf(row.sale),
    rent: scheduleForm(row.rent),
    penalty: scheduleForm(row.penalty),
  }
}

function scheduleForm(schedule: RateSchedule): ScheduleForm {
  return {
    isFixed: schedule.isFixed,
    fixed: amountOf(schedule.fixed),
    daily: amountOf(schedule.daily),
    weekly: amountOf(schedule.weekly),
    monthly: amountOf(schedule.monthly),
  }
}

/** Un importe del servidor, listo para el campo. Cero y ausencia se enseñan igual: en blanco. */
function amountOf(amount: string | undefined): string {
  if (amount === undefined) return ""
  return isBlank(amount) ? "" : amount
}

/**
 * Los importes que no se pueden mandar, con su mensaje.
 *
 * Se comprueba aquí y **también** en el servidor, y las dos comprobaciones acaban en el mismo sitio:
 * las claves son las que la API usa para sus errores de validación —`sale`, `rent.daily`—, así que
 * el campo enseña su error venga de donde venga.
 */
function validate(form: Form, message: string): Map<string, string> {
  const invalid = new Map<string, string>()

  const check = (key: string, value: string) => {
    const text = value.trim()
    if (text !== "" && !AMOUNT.test(text)) invalid.set(key, message)
  }

  check("sale", form.sale)
  for (const name of ["rent", "penalty"] as const) {
    check(`${name}.fixed`, form[name].fixed)
    for (const frequency of FREQUENCIES) check(`${name}.${frequency}`, form[name][frequency])
  }

  return invalid
}

/**
 * El formulario, como lo quiere la API.
 *
 * Un campo vacío es **cero**, no ausencia: la venta se manda siempre, porque omitirla dejaría en pie
 * la que hubiera y vaciar el campo es una instrucción —«este producto ya no tiene precio de venta
 * aquí»—, no un olvido.
 *
 * Los importes de la periodicidad viajan aunque la tarifa esté marcada como fija. No se cobran —eso
 * lo decide `isFixed`, y el motor lo mira primero—, pero se conservan para que volver a
 * periodicidad no cueste teclearlos otra vez.
 */
function bodyOf(form: Form) {
  return {
    sale: form.sale.trim() === "" ? "0" : form.sale.trim(),
    rent: schedulePayload(form.rent),
    penalty: schedulePayload(form.penalty),
  }
}

function schedulePayload(schedule: ScheduleForm): RateSchedule {
  const fixed = schedule.fixed.trim()
  const daily = schedule.daily.trim()
  const weekly = schedule.weekly.trim()
  const monthly = schedule.monthly.trim()

  return {
    isFixed: schedule.isFixed,
    ...(fixed === "" ? {} : { fixed }),
    ...(daily === "" ? {} : { daily }),
    ...(weekly === "" ? {} : { weekly }),
    ...(monthly === "" ? {} : { monthly }),
  }
}

/**
 * Si una cadena decimal es la ausencia de un precio.
 *
 * Cero y vacío son lo mismo para esto, y la comparación es **de texto**: `"0"`, `"0.00"` y `"000"`
 * son el mismo cero, y ninguno pasa por `Number` para averiguarlo.
 */
function isBlank(amount: string): boolean {
  return /^0*(\.0*)?$/.test(amount.trim())
}
