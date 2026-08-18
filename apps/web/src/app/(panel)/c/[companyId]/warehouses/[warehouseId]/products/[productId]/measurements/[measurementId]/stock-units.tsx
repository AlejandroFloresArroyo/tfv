"use client"

import { Badge, Button, Checkbox, DialogTrigger, Field, Input, Select } from "@tfv/ui"
import { Tags } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { DataTable } from "~/components/data-table.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import { STOCK_STATUSES, type StockStatus, type StockUnitRow } from "../../../../../warehouse.ts"
import { linkButton } from "./link-button.ts"
import { UnitHistory } from "./unit-history.tsx"

/**
 * El color de cada estado, que es la lectura rápida de la tabla.
 *
 * Los tres grupos de la spec se distinguen de un vistazo: el compromiso reversible en acento, la
 * salida en neutro, la incidencia en aviso o peligro. Sin esto, once etiquetas grises obligan a
 * leerlas una por una para saber qué hay libre.
 */
const TONES: Record<StockStatus, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  available: "success",
  in_quote: "accent",
  in_order: "accent",
  rented: "warning",
  sold: "neutral",
  expense: "neutral",
  damaged: "warning",
  incomplete: "warning",
  modified: "warning",
  lost: "danger",
  robbed: "danger",
}

export interface UnitLocation {
  id: string
  code: string
  name: string
}

/**
 * Las unidades de una medida, con lo que se hace sobre ellas.
 *
 * ## Por qué la selección no vive en la dirección
 *
 * El resto de la exploración —filtros, página— sí vive ahí, porque compartir por enlace un listado
 * filtrado tiene sentido. Compartir «estas tres marcadas» no lo tiene: es el gesto de un momento,
 * previo a una acción, no un estado que nadie quiera recuperar mañana.
 *
 * ## Lo que la API rechaza se lee dentro del diálogo
 *
 * Un compromiso vigente bloquea el cambio manual, y una salida definitiva no vuelve. Las dos cosas
 * llegan como `422` con el mensaje diciendo **qué códigos** fallan, y ese mensaje se pinta en el
 * aviso del propio diálogo. Convertirlo en «algo salió mal» dejaría a quien lo intenta sin saber
 * cuál de las doce unidades es la que retiene una cotización.
 */
export function StockUnits({
  companyId,
  warehouseId,
  productId,
  measurementId,
  units,
  location,
  canViewLocation,
  actors,
  canEdit,
  canDelete,
  empty,
}: {
  companyId: string
  warehouseId: string
  productId: string
  measurementId: string
  units: readonly StockUnitRow[]
  /** La del producto: el modelo no sitúa las unidades una por una. */
  location: UnitLocation | null
  /**
   * Si esta persona puede ver ubicaciones.
   *
   * Sin el permiso, la columna **no se pinta**. Pintarla diciendo «sin ubicación» sería afirmar
   * algo que no consta: la unidad puede tener sitio y ser esta persona quien no lo puede saber.
   */
  canViewLocation: boolean
  /** Identificador de persona → nombre, para el historial. Vacío si no se pueden nombrar. */
  actors: Readonly<Record<string, string>>
  canEdit: boolean
  canDelete: boolean
  empty: string
}) {
  const t = useTranslations("warehouses")
  const format = useFormatter()

  const base = `/companies/${companyId}/warehouses/${warehouseId}/measurements/${measurementId}`
  const screen = `/c/${companyId}/warehouses/${warehouseId}/products/${productId}/measurements/${measurementId}`

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  /**
   * La selección se vacía cuando cambia lo que hay debajo.
   *
   * Filtrar o pasar de página deja marcadas unidades que ya no se ven: la barra diría «tres
   * seleccionadas» sobre una tabla donde no hay ninguna marcada, y la acción caería sobre unidades
   * que quien la lanza no tiene delante. Se ajusta durante el pintado, que es lo que React
   * recomienda para reiniciar estado al cambiar una propiedad.
   */
  const signature = units.map((unit) => unit.id).join(",")
  const [seen, setSeen] = useState(signature)
  if (seen !== signature) {
    setSeen(signature)
    setSelected(new Set())
  }

  const chosen = units.filter((unit) => selected.has(unit.id))
  const chosenIds = chosen.map((unit) => unit.id)
  const selectable = canEdit || canDelete

  function toggle(id: string, on: boolean) {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    setSelected(next)
  }

  const columns = [
    // La casilla sólo se ofrece a quien puede hacer algo con lo que marque. Marcar por marcar no es
    // una función.
    ...(selectable
      ? [
          {
            header: t("stock.select"),
            className: "w-10",
            cell: (unit: StockUnitRow) => (
              <Checkbox
                checked={selected.has(unit.id)}
                onCheckedChange={(checked) => toggle(unit.id, checked === true)}
                aria-label={t("stock.selectUnit", { code: unit.code })}
              />
            ),
          },
        ]
      : []),
    {
      header: t("stock.code"),
      cell: (unit: StockUnitRow) => (
        <span className="flex flex-col items-start gap-1">
          <span className="font-mono text-body1 font-semibold tracking-wide text-content">
            {unit.code}
          </span>
          {unit.createdByReservation ? <Badge tone="warning">{t("stock.minted")}</Badge> : null}
        </span>
      ),
    },
    {
      header: t("stock.state"),
      cell: (unit: StockUnitRow) => (
        <Badge tone={TONES[unit.status]}>{t(`status.${unit.status}`)}</Badge>
      ),
    },
    ...(canViewLocation
      ? [
          {
            header: t("stock.location"),
            cell: () =>
              location ? (
                <Link
                  href={`/c/${companyId}/warehouses/${warehouseId}/storages/${location.id}`}
                  className="underline decoration-line-strong underline-offset-2 hover:decoration-content"
                >
                  {location.code} · {location.name}
                </Link>
              ) : (
                <span className="text-content-faint">{t("stock.noLocation")}</span>
              ),
          },
        ]
      : []),
    {
      header: t("stock.createdAt"),
      cell: (unit: StockUnitRow) =>
        format.dateTime(new Date(unit.createdAt), { dateStyle: "medium" }),
    },
    {
      header: t("stock.rowActions"),
      className: "text-right",
      cell: (unit: StockUnitRow) => (
        <span className="flex justify-end gap-1">
          <UnitHistory
            companyId={companyId}
            warehouseId={warehouseId}
            unit={unit}
            actors={actors}
          />
          <Link href={`${screen}/labels?unit=${unit.id}`} className={linkButton("ghost")}>
            {t("stock.labelsOne")}
          </Link>
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      {selectable && units.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Checkbox
            label={t("stock.selectAll")}
            checked={
              chosen.length === 0 ? false : chosen.length === units.length ? true : "indeterminate"
            }
            onCheckedChange={(checked) =>
              setSelected(checked === true ? new Set(units.map((unit) => unit.id)) : new Set())
            }
          />

          {chosen.length > 0 ? (
            <>
              <span className="text-body2 font-semibold text-content">
                {t("stock.selected", { count: chosen.length })}
              </span>

              {canEdit ? (
                <FormDialog
                  trigger={
                    <DialogTrigger asChild>
                      <Button variant="secondary" size="sm">
                        {t("stock.changeStatus")}
                      </Button>
                    </DialogTrigger>
                  }
                  title={t("stock.changeStatusTitle", { count: chosen.length })}
                  description={t("stock.changeStatusDescription")}
                  submitLabel={t("stock.changeStatusSubmit")}
                  action={async (data) => {
                    const note = optional(data, "note")
                    await api(`${base}/units`, {
                      method: "PATCH",
                      body: {
                        unitIds: chosenIds,
                        status: text(data, "status"),
                        ...(note === undefined ? {} : { note }),
                      },
                    })
                    setSelected(new Set())
                  }}
                >
                  {(state) => (
                    <>
                      <Field
                        label={t("stock.newStatus")}
                        error={state.fieldErrors.get("status")}
                        required
                      >
                        {(ids) => (
                          <Select {...ids} name="status" defaultValue="available">
                            {STOCK_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {t(`status.${status}`)}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>

                      <Field
                        label={t("stock.reason")}
                        hint={t("stock.reasonHint")}
                        error={state.fieldErrors.get("note")}
                      >
                        {(ids) => <Input {...ids} name="note" type="text" maxLength={500} />}
                      </Field>
                    </>
                  )}
                </FormDialog>
              ) : null}

              {canDelete ? (
                <ConfirmDestructive
                  trigger={
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-danger">
                        {t("stock.delete")}
                      </Button>
                    </DialogTrigger>
                  }
                  title={t("stock.deleteTitle")}
                  entity={t("stock.deleteEntity", { count: chosen.length })}
                  cascade={[t("stock.deleteCascadeInventory"), t("stock.deleteCascadeDocuments")]}
                  confirmLabel={t("stock.deleteConfirm")}
                  action={async () => {
                    await api(`${base}/units`, { method: "DELETE", body: { unitIds: chosenIds } })
                    setSelected(new Set())
                  }}
                />
              ) : null}

              <Link
                href={`${screen}/labels?${chosenIds.map((id) => `unit=${id}`).join("&")}`}
                className={linkButton("ghost")}
              >
                <Tags className="size-4" aria-hidden="true" />
                {t("stock.labelsSelected")}
              </Link>

              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                {t("stock.clearSelection")}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={units}
        rowKey={(unit) => unit.id}
        empty={empty}
        {...(canViewLocation ? { note: t("stock.locationNote") } : {})}
      />
    </div>
  )
}
