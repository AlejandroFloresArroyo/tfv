"use client"

import { Badge, Button, Callout, DialogTrigger, Field, Input, Select, Textarea } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import type { ItemRow, ItemStatus } from "../../production.ts"
import { itemStatusTone } from "./item-badges.tsx"
import { ItemLabel } from "./item-label.tsx"

/**
 * Lo que se hace sobre un artículo de utilería.
 *
 * ## El estado tiene su propio diálogo, y no es un desplegable de la ficha
 *
 * Porque **no todos los destinos son legales desde donde está**: el servidor lleva una tabla de
 * transiciones y devuelve en `allowedStatuses` los que sí. La pantalla ofrece exactamente esos, así
 * que nadie elige una opción para que se la rechacen — que es la forma más barata de enseñarle a
 * alguien a desconfiar de un formulario.
 *
 * `Entregado` **no aparece nunca**, ni siquiera cuando el artículo ya lo está: no se pone a mano.
 * Se llega ahí cerrando una nota de entrega verificada pieza por pieza, y el servidor tampoco lo
 * admite por esta vía. La pantalla no inventa una puerta que el servidor tiene cerrada.
 *
 * ## La baja puede chocar con una nota abierta
 *
 * Y cuando choca, el `409` trae **los nombres de las notas que lo retienen**. Ese mensaje se pinta
 * tal cual en el aviso del diálogo: convertirlo en «algo salió mal» dejaría a quien lo intenta sin
 * saber cuál de las entregas abiertas es la que hay que cerrar primero.
 */

const CATEGORY_NONE = ""

export function CreateItem({
  companyId,
  productionId,
  categories,
}: {
  companyId: string
  productionId: string
  categories: readonly { id: string; name: string }[]
}) {
  const t = useTranslations("productions.items")

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            {t("create")}
          </Button>
        </DialogTrigger>
      }
      title={t("createTitle")}
      description={t("createBody")}
      submitLabel={t("create")}
      action={async (data) => {
        const categoryId = text(data, "categoryId")
        await api(`/companies/${companyId}/productions/${productionId}/items`, {
          method: "POST",
          body: {
            name: text(data, "name"),
            ...(optional(data, "description") === undefined
              ? {}
              : { description: text(data, "description") }),
            ...(categoryId === CATEGORY_NONE ? {} : { categoryId }),
          },
        })
      }}
    >
      {(state) => (
        <>
          <Field label={t("name")} error={state.fieldErrors.get("name")} required>
            {(ids) => <Input {...ids} name="name" autoComplete="off" maxLength={250} />}
          </Field>

          <Field label={t("category")} hint={t("categoryHint")}>
            {(ids) => (
              <Select {...ids} name="categoryId" defaultValue={CATEGORY_NONE}>
                <option value={CATEGORY_NONE}>{t("noCategory")}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t("description")}>
            {(ids) => <Textarea {...ids} name="description" rows={3} maxLength={4000} />}
          </Field>

          <Callout tone="info">{t("codeIsMinted")}</Callout>
        </>
      )}
    </FormDialog>
  )
}

export function ItemRowActions({
  companyId,
  productionId,
  item,
  categories,
  canEdit,
  canChangeStatus,
  canDelete,
}: {
  companyId: string
  productionId: string
  item: ItemRow
  categories: readonly { id: string; name: string }[]
  canEdit: boolean
  canChangeStatus: boolean
  canDelete: boolean
}) {
  const t = useTranslations("productions.items")
  const base = `/companies/${companyId}/productions/${productionId}/items/${item.id}`

  const actions: ItemAction[] = []

  // La etiqueta la puede pedir cualquiera que vea el artículo: es su nombre y su código, que ya
  // están en la ficha. Va primero porque es lo que se hace de pie, con el objeto delante.
  actions.push({
    key: "label",
    label: t("label.action"),
    dialog: (control) => <ItemLabel item={item} {...control} />,
  })

  if (canChangeStatus && item.allowedStatuses.length > 0) {
    actions.push({
      key: "status",
      label: t("changeStatus"),
      dialog: (control) => (
        <FormDialog
          {...control}
          title={t("changeStatusTitle")}
          description={t("changeStatusBody", { name: item.name })}
          submitLabel={t("changeStatusConfirm")}
          action={async (data) => {
            await api(`${base}/status`, {
              method: "PUT",
              body: { status: text(data, "status") as ItemStatus },
            })
          }}
        >
          {(state) => (
            <>
              <p className="flex flex-wrap items-center gap-2 text-body2 text-content-muted">
                {t("currentStatus")}
                <Badge tone={itemStatusTone(item.status)}>{t(`state.${item.status}`)}</Badge>
              </p>

              <Field label={t("newStatus")} error={state.fieldErrors.get("status")} required>
                {(ids) => (
                  <Select {...ids} name="status" defaultValue={item.allowedStatuses[0]}>
                    {item.allowedStatuses.map((status) => (
                      <option key={status} value={status}>
                        {t(`state.${status}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Callout tone="info">{t("deliveredIsEarned")}</Callout>
            </>
          )}
        </FormDialog>
      ),
    })
  }

  if (canEdit) {
    actions.push({
      key: "edit",
      label: t("edit"),
      dialog: (control) => (
        <FormDialog
          {...control}
          title={t("editTitle")}
          submitLabel={t("save")}
          action={async (data) => {
            const categoryId = text(data, "categoryId")
            await api(base, {
              method: "PATCH",
              body: {
                name: text(data, "name"),
                description: text(data, "description"),
                categoryId: categoryId === CATEGORY_NONE ? null : categoryId,
              },
            })
          }}
        >
          {(state) => (
            <>
              <Field label={t("name")} error={state.fieldErrors.get("name")} required>
                {(ids) => <Input {...ids} name="name" defaultValue={item.name} maxLength={250} />}
              </Field>

              <Field label={t("category")}>
                {(ids) => (
                  <Select
                    {...ids}
                    name="categoryId"
                    defaultValue={item.categoryId ?? CATEGORY_NONE}
                  >
                    <option value={CATEGORY_NONE}>{t("noCategory")}</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label={t("description")}>
                {(ids) => (
                  <Textarea
                    {...ids}
                    name="description"
                    rows={3}
                    defaultValue={item.description}
                    maxLength={4000}
                  />
                )}
              </Field>

              <Callout tone="info">{t("codeIsFixed")}</Callout>
            </>
          )}
        </FormDialog>
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: t("delete"),
      danger: true,
      dialog: (control) => (
        <ConfirmDestructive
          {...control}
          title={t("deleteTitle")}
          entity={item.name}
          cascade={[t("deleteCascadeSets"), t("deleteCascadeContinuities")]}
          confirmLabel={t("delete")}
          action={() => api(base, { method: "DELETE" })}
        />
      ),
    })
  }

  return <ItemActions label={t("actions", { name: item.name })} actions={actions} />
}
