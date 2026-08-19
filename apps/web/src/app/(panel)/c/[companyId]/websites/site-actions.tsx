"use client"

import { Button, DialogTrigger, Field, Input, Switch, Textarea } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, type SubmitState, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"

/**
 * Alta de un sitio y su publicación.
 *
 * **El identificador legible no se escribe al crear**, igual que en almacenes y por lo mismo: el
 * servicio lo deriva del nombre y le añade sufijo si está ocupado, así que ofrecer el campo aquí
 * prometería que se respeta lo escrito. Y aquí pesa más que en ningún otro sitio, porque ese
 * identificador **es el subdominio**: la dirección en la que se abrirá la tienda.
 */

export function CreateWebsite({
  companyId,
  warehouses,
  verticalId,
}: {
  companyId: string
  warehouses: readonly { id: string; name: string }[]
  /** La categoría global que declara la vertical de almacén, si el sistema la tiene dada de alta. */
  verticalId: string | null
}) {
  const t = useTranslations("websites")
  const common = useTranslations("common")
  const [open, setOpen] = useState(false)

  return (
    <FormDialog
      title={t("createTitle")}
      description={t("createBody")}
      submitLabel={common("create")}
      size="sm"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">{t("create")}</Button>
        </DialogTrigger>
      }
      open={open}
      onOpenChange={setOpen}
      action={async (data) => {
        await api(`/companies/${companyId}/websites`, {
          method: "POST",
          body: {
            name: text(data, "name"),
            ...(optional(data, "description") ? { description: text(data, "description") } : {}),
            ...(optional(data, "warehouseId") ? { warehouseId: text(data, "warehouseId") } : {}),
            ...(verticalId === null ? {} : { categoryId: verticalId }),
          },
        })
      }}
    >
      {(state: SubmitState) => (
        <>
          <Field label={t("name")} required error={state.fieldErrors.get("name")}>
            {(ids) => <Input {...ids} name="name" required maxLength={200} autoFocus />}
          </Field>

          <Field label={t("description")} error={state.fieldErrors.get("description")}>
            {(ids) => <Textarea {...ids} name="description" rows={2} maxLength={4000} />}
          </Field>

          <Field
            label={t("source")}
            hint={t("sourceHint")}
            error={state.fieldErrors.get("warehouseId")}
          >
            {(ids) => (
              <select
                {...ids}
                name="warehouseId"
                className="h-10 w-full rounded-sm border border-edge-control bg-panel px-3 text-body2 text-content"
              >
                <option value="">{t("noSource")}</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </>
      )}
    </FormDialog>
  )
}

/**
 * Publicar y despublicar.
 *
 * No es un verbo aparte: es la marca del sitio, y por eso el control es un interruptor y no dos
 * botones. Despublicar retira la tienda de su subdominio **sin borrar nada**: quien la vuelva a
 * publicar recupera lo que tenía.
 */
export function PublishSwitch({
  companyId,
  websiteId,
  isPublished,
  label,
}: {
  companyId: string
  websiteId: string
  isPublished: boolean
  label: string
}) {
  const [checked, setChecked] = useState(isPublished)
  const [pending, setPending] = useState(false)

  return (
    <Switch
      label={label}
      checked={checked}
      disabled={pending}
      onCheckedChange={async (next) => {
        setChecked(next)
        setPending(true)
        try {
          await api(`/companies/${companyId}/websites/${websiteId}`, {
            method: "PATCH",
            body: { isPublished: next },
          })
        } catch {
          // Devolver el interruptor a donde estaba: dejarlo puesto diría que el sitio se publicó.
          setChecked(!next)
        } finally {
          setPending(false)
        }
      }}
    />
  )
}
