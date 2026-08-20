"use client"

import { Button, Field, Input, Select, Textarea } from "@tfv/ui"
import { Pencil, Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import type { AnchorRow, ProductionCategoryRow } from "../../../production.ts"
import { AmountField } from "../amount-field.tsx"

/**
 * Alta, edición y baja de una partida presupuestada.
 *
 * El alta y la edición comparten formulario porque son **el mismo formulario**: los cinco campos de
 * un ancla son los mismos antes y después de existir. Dos copias divergen en cuanto alguien añade
 * un campo a una.
 *
 * ## El importe entra por el control de importes, no por un campo de texto
 *
 * `AmountInput` es el que sabe que el separador decimal depende del idioma y que un importe no es
 * un número de coma flotante. Un `<input type="number">` aquí dejaría escribir `1e5`, redondearía
 * al pegar, y en español convertiría la coma en un separador de miles.
 */

function anchorsPath(companyId: string, productionId: string): string {
  return `/companies/${companyId}/productions/${productionId}/anchors`
}

function AnchorForm({
  categories,
  canSelectCategory,
  anchor,
}: {
  categories: readonly ProductionCategoryRow[]
  canSelectCategory: boolean
  anchor?: AnchorRow | undefined
}) {
  const t = useTranslations("productions.budget")

  return (
    <>
      <Field label={t("name")} required>
        {(ids) => (
          <Input
            {...ids}
            name="name"
            autoComplete="off"
            maxLength={250}
            defaultValue={anchor?.name ?? ""}
          />
        )}
      </Field>

      <Field label={t("amount")} required>
        {(ids) => <AmountField ids={ids} name="amount" defaultValue={anchor?.amount ?? ""} />}
      </Field>

      {canSelectCategory && categories.length > 0 ? (
        <Field label={t("category")}>
          {(ids) => (
            <Select {...ids} name="categoryId" defaultValue={anchor?.categoryId ?? ""}>
              <option value="">{t("noCategory")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}

      <Field label={t("description")}>
        {(ids) => (
          <Textarea
            {...ids}
            name="description"
            rows={3}
            maxLength={4000}
            defaultValue={anchor?.description ?? ""}
          />
        )}
      </Field>
    </>
  )
}

/**
 * Lo que el formulario manda.
 *
 * La categoría va como **nulo explícito** cuando se dejó vacía, y no ausente: ausente significaría
 * «no la toques», que en una edición dejaría imposible desclasificar una partida.
 */
function bodyOf(data: FormData, canSelectCategory: boolean): Record<string, unknown> {
  return {
    name: text(data, "name"),
    amount: text(data, "amount"),
    description: optional(data, "description") ?? "",
    ...(canSelectCategory ? { categoryId: optional(data, "categoryId") ?? null } : {}),
  }
}

export function CreateAnchor({
  companyId,
  productionId,
  categories,
  canSelectCategory,
}: {
  companyId: string
  productionId: string
  categories: readonly ProductionCategoryRow[]
  canSelectCategory: boolean
}) {
  const t = useTranslations("productions.budget")

  return (
    <FormDialog
      trigger={
        <Button>
          <Plus className="size-4" aria-hidden="true" />
          {t("newAnchor")}
        </Button>
      }
      title={t("newAnchorTitle")}
      description={t("newAnchorBody")}
      submitLabel={t("newAnchor")}
      action={async (data) => {
        await api(anchorsPath(companyId, productionId), {
          method: "POST",
          body: bodyOf(data, canSelectCategory),
        })
      }}
    >
      {() => <AnchorForm categories={categories} canSelectCategory={canSelectCategory} />}
    </FormDialog>
  )
}

export function EditAnchor({
  companyId,
  productionId,
  anchor,
  categories,
  canSelectCategory,
}: {
  companyId: string
  productionId: string
  anchor: AnchorRow
  categories: readonly ProductionCategoryRow[]
  canSelectCategory: boolean
}) {
  const t = useTranslations("productions.budget")

  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="sm" aria-label={t("editAnchorOf", { name: anchor.name })}>
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      }
      title={t("editAnchorTitle")}
      submitLabel={t("save")}
      action={async (data) => {
        await api(`${anchorsPath(companyId, productionId)}/${anchor.id}`, {
          method: "PATCH",
          body: bodyOf(data, canSelectCategory),
        })
      }}
    >
      {() => (
        <AnchorForm categories={categories} canSelectCategory={canSelectCategory} anchor={anchor} />
      )}
    </FormDialog>
  )
}

/**
 * Dar de baja una partida.
 *
 * La confirmación enumera **los comprobantes que se van con ella**, porque se van de verdad: la
 * baja del ancla los borra y barre el archivo si quedó sin dueño. Un archivo que desaparece sin
 * avisar es lo que hace que alguien lo vuelva a subir.
 */
export function DeleteAnchor({
  companyId,
  productionId,
  anchor,
}: {
  companyId: string
  productionId: string
  anchor: AnchorRow
}) {
  const t = useTranslations("productions.budget")

  return (
    <ConfirmDestructive
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="text-tinta-alto"
          aria-label={t("deleteAnchorOf", { name: anchor.name })}
        >
          {t("delete")}
        </Button>
      }
      title={t("deleteAnchorTitle")}
      entity={anchor.name}
      cascade={
        anchor.attachments.length > 0
          ? [t("deleteAnchorReceipts", { count: anchor.attachments.length })]
          : []
      }
      confirmLabel={t("delete")}
      action={async () => {
        await api(`${anchorsPath(companyId, productionId)}/${anchor.id}`, { method: "DELETE" })
      }}
    />
  )
}
