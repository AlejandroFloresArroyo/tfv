"use client"

import { Button, DialogTrigger, Field, Input, Textarea } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { type SinglePhoto, SinglePhotoField, useSinglePhoto } from "~/components/photo-picker.tsx"
import { text } from "~/components/use-submit.ts"
import { apiTyped } from "~/lib/api.client.ts"
import type { SetRow } from "../../../production.ts"

/**
 * Alta, edición y baja de un set.
 *
 * Mismo patrón que `characters/character-actions.tsx` para el alta con foto — crear, subir,
 * parchar—. La diferencia es la baja: **al crear se entra directo a la ficha**, porque lo siguiente
 * que hay que hacer con un decorado recién dado de alta es componerlo, y eso sólo se hace dentro
 * (`[setId]/page.tsx`). Es la misma razón por la que `CreateDelivery` navega a la nota recién
 * abierta en vez de devolver al listado.
 */

export function CreateSet({
  companyId,
  productionId,
}: {
  companyId: string
  productionId: string
}) {
  const t = useTranslations("productions.sets")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const photo = useSinglePhoto(companyId, null)
  const { restore } = photo

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            {t("create")}
          </Button>
        </DialogTrigger>
      }
      title={t("createTitle")}
      description={t("createBody")}
      submitLabel={t("create")}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) restore()
      }}
      action={async (data) => {
        const created = await apiTyped(
          "POST /companies/{companyId}/productions/{productionId}/sets",
          {
            params: { companyId, productionId },
            body: { name: text(data, "name"), description: text(data, "description") },
          },
        )

        const outcome = await photo.run()
        const patch = photo.patch(outcome.uploaded)
        if (patch !== undefined) {
          await apiTyped("PATCH /companies/{companyId}/productions/{productionId}/sets/{setId}", {
            params: { companyId, productionId, setId: created.id },
            body: patch,
          })
        }

        router.push(`/c/${companyId}/productions/${productionId}/rodaje/sets/${created.id}`)
      }}
    >
      {(state) => <Fields state={state} photo={photo} />}
    </FormDialog>
  )
}

export function EditSet({
  companyId,
  productionId,
  set,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  set: SetRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.sets")
  const photo = useSinglePhoto(companyId, set.imageUrl)
  const { restore } = photo

  useEffect(() => {
    if (open) restore()
  }, [open, restore])

  return (
    <FormDialog
      title={t("editTitle", { name: set.name })}
      submitLabel={t("save")}
      open={open}
      onOpenChange={onOpenChange}
      action={async (data) => {
        await apiTyped("PATCH /companies/{companyId}/productions/{productionId}/sets/{setId}", {
          params: { companyId, productionId, setId: set.id },
          body: { name: text(data, "name"), description: text(data, "description") },
        })

        const outcome = await photo.run()
        const patch = photo.patch(outcome.uploaded)
        if (patch !== undefined) {
          await apiTyped("PATCH /companies/{companyId}/productions/{productionId}/sets/{setId}", {
            params: { companyId, productionId, setId: set.id },
            body: patch,
          })
        }
      }}
    >
      {(state) => <Fields state={state} set={set} photo={photo} />}
    </FormDialog>
  )
}

export function DeleteSet({
  companyId,
  productionId,
  set,
  trigger,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  set: SetRow
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("productions.sets")
  const router = useRouter()

  return (
    <ConfirmDestructive
      {...(trigger === undefined ? {} : { trigger })}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      title={t("deleteTitle")}
      entity={set.name}
      cascade={[t("deleteCascade")]}
      confirmLabel={t("delete")}
      action={async () => {
        await apiTyped("DELETE /companies/{companyId}/productions/{productionId}/sets/{setId}", {
          params: { companyId, productionId, setId: set.id },
        })
        router.push(`/c/${companyId}/productions/${productionId}/rodaje/sets`)
      }}
    />
  )
}

export function SetRowActions({
  companyId,
  productionId,
  set,
  canEdit,
  canDelete,
}: {
  companyId: string
  productionId: string
  set: SetRow
  canEdit: boolean
  canDelete: boolean
}) {
  const t = useTranslations("productions.sets")
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: t("edit"),
      dialog: (control) => (
        <EditSet companyId={companyId} productionId={productionId} set={set} {...control} />
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: t("delete"),
      danger: true,
      dialog: (control) => (
        <DeleteSet companyId={companyId} productionId={productionId} set={set} {...control} />
      ),
    })
  }

  return <ItemActions label={t("actions", { name: set.name })} actions={actions} />
}

function Fields({
  state,
  set,
  photo,
}: {
  state: { fieldErrors: ReadonlyMap<string, string> }
  set?: SetRow
  photo: SinglePhoto
}) {
  const t = useTranslations("productions.sets")

  return (
    <>
      <Field label={t("name")} error={state.fieldErrors.get("name")} required>
        {(ids) => <Input {...ids} name="name" autoFocus maxLength={250} defaultValue={set?.name} />}
      </Field>

      <Field label={t("description")} error={state.fieldErrors.get("description")}>
        {(ids) => (
          <Textarea
            {...ids}
            name="description"
            rows={3}
            maxLength={4000}
            defaultValue={set?.description}
          />
        )}
      </Field>

      <SinglePhotoField photo={photo} label={t("image")} />
    </>
  )
}
