"use client"

import { Button, DialogTrigger, Field, Input, Textarea } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { type SinglePhoto, SinglePhotoField, useSinglePhoto } from "~/components/photo-picker.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { apiTyped } from "~/lib/api.client.ts"
import type { CharacterRow } from "../../../production.ts"

/**
 * Alta, edición y baja de un personaje.
 *
 * ## La foto se sube después de crear, igual que en el almacén
 *
 * Es la regla de `forms-and-wizards`: la escritura va directa al almacenamiento y puede fallar por
 * su cuenta, así que una foto caída no se lleva por delante el nombre y la descripción que alguien
 * acaba de escribir. Ver `warehouses/warehouse-actions.tsx`, de donde sale el patrón entero.
 *
 * ## La baja no borra su rastro
 *
 * `deleteCharacterRoute` lo dice en su propia descripción: las continuidades que lo tenían asignado
 * siguen existiendo, sin personaje. La cascada del diálogo lo dice con las mismas palabras.
 */

export function CreateCharacter({
  companyId,
  productionId,
}: {
  companyId: string
  productionId: string
}) {
  const t = useTranslations("productions.characters")
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
          "POST /companies/{companyId}/productions/{productionId}/characters",
          {
            params: { companyId, productionId },
            body: {
              name: text(data, "name"),
              ...(optional(data, "description") === undefined
                ? {}
                : { description: text(data, "description") }),
            },
          },
        )

        const outcome = await photo.run()
        const patch = photo.patch(outcome.uploaded)
        if (patch !== undefined) {
          await apiTyped(
            "PATCH /companies/{companyId}/productions/{productionId}/characters/{characterId}",
            { params: { companyId, productionId, characterId: created.id }, body: patch },
          )
        }
      }}
    >
      {(state) => <Fields state={state} photo={photo} />}
    </FormDialog>
  )
}

function EditCharacter({
  companyId,
  productionId,
  character,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  character: CharacterRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.characters")
  const photo = useSinglePhoto(companyId, character.imageUrl)
  const { restore } = photo

  useEffect(() => {
    if (open) restore()
  }, [open, restore])

  return (
    <FormDialog
      title={t("editTitle", { name: character.name })}
      submitLabel={t("save")}
      open={open}
      onOpenChange={onOpenChange}
      action={async (data) => {
        await apiTyped(
          "PATCH /companies/{companyId}/productions/{productionId}/characters/{characterId}",
          {
            params: { companyId, productionId, characterId: character.id },
            body: { name: text(data, "name"), description: text(data, "description") },
          },
        )

        const outcome = await photo.run()
        const patch = photo.patch(outcome.uploaded)
        if (patch !== undefined) {
          await apiTyped(
            "PATCH /companies/{companyId}/productions/{productionId}/characters/{characterId}",
            { params: { companyId, productionId, characterId: character.id }, body: patch },
          )
        }
      }}
    >
      {(state) => <Fields state={state} character={character} photo={photo} />}
    </FormDialog>
  )
}

export function CharacterRowActions({
  companyId,
  productionId,
  character,
  canEdit,
  canDelete,
}: {
  companyId: string
  productionId: string
  character: CharacterRow
  canEdit: boolean
  canDelete: boolean
}) {
  const t = useTranslations("productions.characters")
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: t("edit"),
      dialog: (control) => (
        <EditCharacter
          companyId={companyId}
          productionId={productionId}
          character={character}
          {...control}
        />
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
          entity={character.name}
          cascade={[t("deleteCascade")]}
          confirmLabel={t("delete")}
          action={() =>
            apiTyped(
              "DELETE /companies/{companyId}/productions/{productionId}/characters/{characterId}",
              { params: { companyId, productionId, characterId: character.id } },
            )
          }
        />
      ),
    })
  }

  return <ItemActions label={t("actions", { name: character.name })} actions={actions} />
}

function Fields({
  state,
  character,
  photo,
}: {
  state: { fieldErrors: ReadonlyMap<string, string> }
  character?: CharacterRow
  photo: SinglePhoto
}) {
  const t = useTranslations("productions.characters")

  return (
    <>
      <Field label={t("name")} error={state.fieldErrors.get("name")} required>
        {(ids) => (
          <Input {...ids} name="name" autoFocus maxLength={250} defaultValue={character?.name} />
        )}
      </Field>

      <Field label={t("description")} error={state.fieldErrors.get("description")}>
        {(ids) => (
          <Textarea
            {...ids}
            name="description"
            rows={3}
            maxLength={4000}
            defaultValue={character?.description}
          />
        )}
      </Field>

      <SinglePhotoField photo={photo} label={t("image")} />
    </>
  )
}
