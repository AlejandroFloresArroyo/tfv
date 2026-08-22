"use client"

import { Button, DialogTrigger, Field, Input, Textarea } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { TreeDeleteDialog } from "~/components/tree/tree-delete-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import type { SceneRow, SceneScope } from "../../../production.ts"

/**
 * Alta, edición y baja de una escena.
 *
 * Cuelga siempre de un capítulo concreto, así que el camino lleva su identificador y no hay «mover
 * a otro capítulo»: la API no lo ofrece — una escena que cambiara de capítulo dejaría su etiqueta
 * compuesta hablando de un capítulo que ya no es el suyo.
 */

function scenesPath(companyId: string, productionId: string, chapterId: string): string {
  return `/companies/${companyId}/productions/${productionId}/chapters/${chapterId}/scenes`
}

function SceneFields({
  scene,
  nextIndex,
  fieldErrors,
}: {
  scene?: SceneRow
  /** El índice propuesto para una escena nueva. Ausente al editar: el índice ya existe. */
  nextIndex?: number
  fieldErrors: ReadonlyMap<string, string>
}) {
  const t = useTranslations("productions.scenes")
  const common = useTranslations("common")

  return (
    <>
      <Field label={common("name")} error={fieldErrors.get("name")} required>
        {(ids) => <Input {...ids} name="name" defaultValue={scene?.name} autoFocus />}
      </Field>

      <Field label={t("index")} hint={t("indexHint")} error={fieldErrors.get("index")} required>
        {(ids) => (
          <Input
            {...ids}
            name="index"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={scene?.index ?? nextIndex ?? 0}
          />
        )}
      </Field>

      <Field label={t("synopsis")} error={fieldErrors.get("synopsis")}>
        {(ids) => (
          <Textarea
            {...ids}
            name="synopsis"
            rows={3}
            maxLength={4000}
            defaultValue={scene?.synopsis}
          />
        )}
      </Field>
    </>
  )
}

export function CreateScene({
  companyId,
  productionId,
  chapterId,
  nextIndex,
}: {
  companyId: string
  productionId: string
  chapterId: string
  nextIndex: number
}) {
  const t = useTranslations("productions.scenes")
  const common = useTranslations("common")

  return (
    <FormDialog
      title={t("createTitle")}
      submitLabel={common("create")}
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            {t("createIn")}
          </Button>
        </DialogTrigger>
      }
      action={(data) =>
        api(scenesPath(companyId, productionId, chapterId), {
          method: "POST",
          body: {
            name: text(data, "name"),
            index: Number(text(data, "index") || "0"),
            synopsis: optional(data, "synopsis"),
          },
        })
      }
    >
      {(state) => <SceneFields nextIndex={nextIndex} fieldErrors={state.fieldErrors} />}
    </FormDialog>
  )
}

function EditScene({
  companyId,
  productionId,
  scene,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  scene: SceneRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.scenes")
  const common = useTranslations("common")

  return (
    <FormDialog
      title={t("editTitle", { name: scene.name })}
      submitLabel={common("save")}
      open={open}
      onOpenChange={onOpenChange}
      action={(data) =>
        api(`${scenesPath(companyId, productionId, scene.chapterId)}/${scene.id}`, {
          method: "PATCH",
          body: {
            name: text(data, "name"),
            index: Number(text(data, "index") || "0"),
            synopsis: optional(data, "synopsis") ?? "",
          },
        })
      }
    >
      {(state) => <SceneFields scene={scene} fieldErrors={state.fieldErrors} />}
    </FormDialog>
  )
}

function DeleteScene({
  companyId,
  productionId,
  scene,
  after,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  scene: SceneRow
  after?: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.scenes")
  const common = useTranslations("common")

  return (
    <TreeDeleteDialog
      title={t("deleteTitle")}
      entity={scene.label}
      confirmLabel={common("delete")}
      countingLabel={t("counting")}
      countFailedLabel={t("countFailed")}
      load={async () => {
        const scope = await api<SceneScope>(
          `${scenesPath(companyId, productionId, scene.chapterId)}/${scene.id}/scope`,
        )

        return (
          [
            ["deleteRecordings", scope.recordings],
            ["deleteWorkflows", scope.workflows],
          ] as const
        )
          .filter(([, count]) => count > 0)
          .map(([key, count]) => t(key, { count }))
      }}
      remove={() =>
        api(`${scenesPath(companyId, productionId, scene.chapterId)}/${scene.id}`, {
          method: "DELETE",
        })
      }
      after={after}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

export function SceneActions({
  companyId,
  productionId,
  scene,
  canEdit,
  canDelete,
  after,
}: {
  companyId: string
  productionId: string
  scene: SceneRow
  canEdit: boolean
  canDelete: boolean
  /** A dónde ir tras borrar, cuando ésta es la escena que la pantalla está enseñando. */
  after?: string | undefined
}) {
  const common = useTranslations("common")
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: common("edit"),
      dialog: (control) => (
        <EditScene
          key="edit"
          companyId={companyId}
          productionId={productionId}
          scene={scene}
          {...control}
        />
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: common("delete"),
      danger: true,
      dialog: (control) => (
        <DeleteScene
          key="delete"
          companyId={companyId}
          productionId={productionId}
          scene={scene}
          after={after}
          {...control}
        />
      ),
    })
  }

  return <ItemActions label={common("actions")} actions={actions} />
}
