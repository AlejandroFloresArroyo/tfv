"use client"

import { Button, DialogTrigger, Field, Input } from "@tfv/ui"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { ApiError, api } from "~/lib/api.client.ts"
import type { PriceListRow } from "../../warehouse.ts"

/** La ruta de las listas de un almacén, que es la única parte que las cuatro acciones comparten. */
function pathOf(companyId: string, warehouseId: string): string {
  return `/companies/${companyId}/warehouses/${warehouseId}/price-lists`
}

/**
 * El nombre, o el aviso de que falta.
 *
 * El servidor también lo rechaza —y ésa es la comprobación que manda—, pero su mensaje es el del
 * validador y llega crudo y en inglés: «Too small: expected string to have >=1 characters». Esto no
 * lo sustituye; le pone delante una frase que se entiende, en el campo que le corresponde.
 */
function nameOf(data: FormData, message: string): string {
  const name = text(data, "name")
  if (name === "") throw new ApiError(400, message, new Map([["name", message]]))
  return name
}

export function CreatePriceList({
  companyId,
  warehouseId,
}: {
  companyId: string
  warehouseId: string
}) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("warehouses.priceLists.createTitle")}
      description={t("warehouses.priceLists.createBody")}
      submitLabel={t("common.create")}
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">{t("warehouses.priceLists.create")}</Button>
        </DialogTrigger>
      }
      action={(data) =>
        api(pathOf(companyId, warehouseId), {
          method: "POST",
          body: {
            name: nameOf(data, t("warehouses.priceLists.nameRequired")),
            description: optional(data, "description"),
          },
        })
      }
    >
      {(state) => (
        <>
          <Field label={t("common.name")} error={state.fieldErrors.get("name")} required>
            {(ids) => <Input {...ids} name="name" autoFocus />}
          </Field>

          <Field
            label={t("warehouses.priceLists.description")}
            hint={t("warehouses.priceLists.descriptionHint")}
            error={state.fieldErrors.get("description")}
          >
            {(ids) => <Input {...ids} name="description" />}
          </Field>
        </>
      )}
    </FormDialog>
  )
}

export function EditPriceList({
  companyId,
  warehouseId,
  list,
  open,
  onOpenChange,
}: {
  companyId: string
  warehouseId: string
  list: PriceListRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("warehouses.priceLists.editTitle", { name: list.name })}
      submitLabel={t("common.save")}
      open={open}
      onOpenChange={onOpenChange}
      action={(data) =>
        api(`${pathOf(companyId, warehouseId)}/${list.id}`, {
          method: "PATCH",
          // La descripción vacía viaja como cadena vacía y no como ausencia: es «bórrala», que no
          // es lo mismo que «no la toques». Al crear sí es ausencia, porque no había nada que
          // borrar.
          body: {
            name: nameOf(data, t("warehouses.priceLists.nameRequired")),
            description: text(data, "description"),
          },
        })
      }
    >
      {(state) => (
        <>
          <Field label={t("common.name")} error={state.fieldErrors.get("name")} required>
            {(ids) => <Input {...ids} name="name" defaultValue={list.name} autoFocus />}
          </Field>

          <Field
            label={t("warehouses.priceLists.description")}
            hint={t("warehouses.priceLists.descriptionHint")}
            error={state.fieldErrors.get("description")}
          >
            {(ids) => <Input {...ids} name="description" defaultValue={list.description} />}
          </Field>
        </>
      )}
    </FormDialog>
  )
}

/**
 * Dar de baja una lista de precios.
 *
 * **Los productos sobreviven**, y la confirmación lo dice con el número real del servidor: lo que
 * desaparece es el precio que la lista les daba, no el catálogo. Sin esa frase, «vas a eliminar
 * Tarifas 2026 · 214 productos» se lee como si se llevara por delante media nave.
 *
 * Quien la borra desde la ficha de la lista **se queda sin ficha**, así que se le lleva al listado
 * en lugar de volver a resolver una pantalla que ya no existe.
 */
export function DeletePriceList({
  companyId,
  warehouseId,
  list,
  redirectTo,
  open,
  onOpenChange,
}: {
  companyId: string
  warehouseId: string
  list: PriceListRow
  /** Adónde ir tras borrarla. Ausente: se queda donde está, que es lo que quiere el listado. */
  redirectTo?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const router = useRouter()

  return (
    <ConfirmDestructive
      title={t("warehouses.priceLists.deleteTitle")}
      entity={list.name}
      cascade={[
        t("warehouses.priceLists.deleteCascade", { count: list.productCount }),
        t("warehouses.priceLists.deleteKeepsProducts"),
      ]}
      confirmLabel={t("common.delete")}
      open={open}
      onOpenChange={onOpenChange}
      action={async () => {
        await api(`${pathOf(companyId, warehouseId)}/${list.id}`, { method: "DELETE" })
        if (redirectTo) router.replace(redirectTo)
      }}
    />
  )
}

/**
 * Las acciones de una lista, agrupadas.
 *
 * Las que la persona no puede hacer no llegan aquí: se omiten en lugar de mostrarse desactivadas.
 */
export function PriceListActions({
  companyId,
  warehouseId,
  list,
  canEdit,
  canDelete,
  redirectOnDelete,
  label,
}: {
  companyId: string
  warehouseId: string
  list: PriceListRow
  canEdit: boolean
  canDelete: boolean
  redirectOnDelete?: string
  /**
   * Cómo se llama el punto de acceso.
   *
   * En la ficha conviven el de la lista y el de cada tarifa. Con el mismo nombre, quien los recorre
   * con lector de pantalla oye «Acciones» tres veces y ninguna dice de qué.
   */
  label?: string
}) {
  const t = useTranslations()

  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: t("common.edit"),
      dialog: (control) => (
        <EditPriceList
          key="edit"
          companyId={companyId}
          warehouseId={warehouseId}
          list={list}
          {...control}
        />
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: t("common.delete"),
      danger: true,
      dialog: (control) => (
        <DeletePriceList
          key="delete"
          companyId={companyId}
          warehouseId={warehouseId}
          list={list}
          {...(redirectOnDelete ? { redirectTo: redirectOnDelete } : {})}
          {...control}
        />
      ),
    })
  }

  return <ItemActions label={label ?? t("common.actions")} actions={actions} />
}
