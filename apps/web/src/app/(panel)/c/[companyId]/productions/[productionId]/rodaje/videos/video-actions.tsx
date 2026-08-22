"use client"

import { Button, Dialog, DialogContent, DialogTrigger, Field, Input, Select } from "@tfv/ui"
import { Play, Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { text } from "~/components/use-submit.ts"
import { type SingleVideo, SingleVideoField, useSingleVideo } from "~/components/video-picker.tsx"
import { apiTyped } from "~/lib/api.client.ts"
import type { VideoRow } from "../../../production.ts"

const CATEGORY_NONE = ""

/**
 * Alta, edición, reproducción y baja de un video de la biblioteca.
 *
 * ## El selector de categoría respeta la clave fina, y es la primera pantalla que lo hace
 *
 * `productions.videos.select_category` está en el catálogo cerrado y hasta ahora no la consumía
 * ninguna ruta ni ninguna pantalla —`HALLAZGOS.md` H-173—: en la pila anterior decidía si el
 * desplegable de categoría se podía desplegar. Aquí sí hay un desplegable de categoría, así que es
 * el sitio correcto para ejercerla: sin la clave, el campo no se ofrece y la categoría se deja
 * como está.
 *
 * ## Por qué reproducir es su propio diálogo y no un enlace a otra ficha
 *
 * No hay `[videoId]/page.tsx`. Un enlace de descarga tampoco existe a propósito: la spec pide
 * reproducirlo, no descargarlo, y `videoUrl` es justo para eso —lo que un reproductor consume por
 * partes—. Un diálogo con un `<video controls>` cumple exactamente eso sin inventar una ficha para
 * un solo campo.
 */

export function PlayVideo({ video }: { video: VideoRow }) {
  const t = useTranslations("productions.videos")
  const common = useTranslations("common")
  const [open, setOpen] = useState(false)

  if (!video.videoUrl) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Play className="size-4" aria-hidden="true" />
        {t("play")}
      </Button>

      <DialogContent title={video.name} closeLabel={common("close")} size="lg">
        {/* biome-ignore lint/a11y/useMediaCaption: referencia de continuidad subida sin diálogo, sin guion que subtitular. */}
        <video src={video.videoUrl} controls autoPlay className="w-full rounded-lg bg-black" />
      </DialogContent>
    </Dialog>
  )
}

export function CreateVideo({
  companyId,
  productionId,
  categories,
  canSelectCategory,
}: {
  companyId: string
  productionId: string
  categories: readonly { id: string; name: string }[]
  canSelectCategory: boolean
}) {
  const t = useTranslations("productions.videos")
  const [open, setOpen] = useState(false)
  const video = useSingleVideo(companyId, null)
  const { restore } = video

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
        const categoryId = text(data, "categoryId")

        const created = await apiTyped(
          "POST /companies/{companyId}/productions/{productionId}/videos",
          {
            params: { companyId, productionId },
            body: {
              name: text(data, "name"),
              ...(canSelectCategory && categoryId !== CATEGORY_NONE ? { categoryId } : {}),
            },
          },
        )

        const outcome = await video.run()
        const patch = video.patch(outcome.uploaded)
        if (patch !== undefined) {
          await apiTyped(
            "PATCH /companies/{companyId}/productions/{productionId}/videos/{videoId}",
            {
              params: { companyId, productionId, videoId: created.id },
              body: patch,
            },
          )
        }
      }}
    >
      {(state) => (
        <Fields
          state={state}
          video={video}
          categories={categories}
          canSelectCategory={canSelectCategory}
        />
      )}
    </FormDialog>
  )
}

function EditVideo({
  companyId,
  productionId,
  item,
  categories,
  canSelectCategory,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  item: VideoRow
  categories: readonly { id: string; name: string }[]
  canSelectCategory: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.videos")
  const video = useSingleVideo(companyId, item.videoUrl)
  const { restore } = video

  useEffect(() => {
    if (open) restore()
  }, [open, restore])

  return (
    <FormDialog
      title={t("editTitle", { name: item.name })}
      submitLabel={t("save")}
      open={open}
      onOpenChange={onOpenChange}
      action={async (data) => {
        const categoryId = text(data, "categoryId")

        await apiTyped("PATCH /companies/{companyId}/productions/{productionId}/videos/{videoId}", {
          params: { companyId, productionId, videoId: item.id },
          body: {
            name: text(data, "name"),
            ...(canSelectCategory
              ? { categoryId: categoryId === CATEGORY_NONE ? null : categoryId }
              : {}),
          },
        })

        const outcome = await video.run()
        const patch = video.patch(outcome.uploaded)
        if (patch !== undefined) {
          await apiTyped(
            "PATCH /companies/{companyId}/productions/{productionId}/videos/{videoId}",
            {
              params: { companyId, productionId, videoId: item.id },
              body: patch,
            },
          )
        }
      }}
    >
      {(state) => (
        <Fields
          state={state}
          item={item}
          video={video}
          categories={categories}
          canSelectCategory={canSelectCategory}
        />
      )}
    </FormDialog>
  )
}

export function VideoRowActions({
  companyId,
  productionId,
  item,
  categories,
  canEdit,
  canSelectCategory,
  canDelete,
}: {
  companyId: string
  productionId: string
  item: VideoRow
  categories: readonly { id: string; name: string }[]
  canEdit: boolean
  canSelectCategory: boolean
  canDelete: boolean
}) {
  const t = useTranslations("productions.videos")
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: t("edit"),
      dialog: (control) => (
        <EditVideo
          companyId={companyId}
          productionId={productionId}
          item={item}
          categories={categories}
          canSelectCategory={canSelectCategory}
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
          entity={item.name}
          cascade={[t("deleteCascade")]}
          confirmLabel={t("delete")}
          action={() =>
            apiTyped("DELETE /companies/{companyId}/productions/{productionId}/videos/{videoId}", {
              params: { companyId, productionId, videoId: item.id },
            })
          }
        />
      ),
    })
  }

  return <ItemActions label={t("actions", { name: item.name })} actions={actions} />
}

function Fields({
  state,
  item,
  video,
  categories,
  canSelectCategory,
}: {
  state: { fieldErrors: ReadonlyMap<string, string> }
  item?: VideoRow
  video: SingleVideo
  categories: readonly { id: string; name: string }[]
  canSelectCategory: boolean
}) {
  const t = useTranslations("productions.videos")

  return (
    <>
      <Field label={t("name")} error={state.fieldErrors.get("name")} required>
        {(ids) => (
          <Input {...ids} name="name" autoFocus maxLength={250} defaultValue={item?.name} />
        )}
      </Field>

      {canSelectCategory && categories.length > 0 ? (
        <Field label={t("category")} hint={t("categoryHint")}>
          {(ids) => (
            <Select {...ids} name="categoryId" defaultValue={item?.categoryId ?? CATEGORY_NONE}>
              <option value={CATEGORY_NONE}>{t("noCategory")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}

      <SingleVideoField video={video} label={t("videoFile")} />
    </>
  )
}
