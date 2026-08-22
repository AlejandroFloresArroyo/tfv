"use client"

import { Button, DialogTrigger, Field, Input, Select, Textarea } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { TreeDeleteDialog } from "~/components/tree/tree-delete-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import type { ChapterRow, ChapterScope, ScriptRow } from "../../../production.ts"

/**
 * Alta, edición y baja de un capítulo.
 *
 * A diferencia de las categorías, un capítulo no tiene padre que elegir: cuelga directamente de la
 * producción, así que no hay ni «crear dentro» ni «mover». Lo que sí comparte con ellas es todo lo
 * demás — el alcance contado por el servidor antes de borrar, y el mismo `TreeDeleteDialog`.
 */

function chaptersPath(companyId: string, productionId: string): string {
  return `/companies/${companyId}/productions/${productionId}/chapters`
}

function ChapterFields({
  chapter,
  scripts,
  nextIndex,
  fieldErrors,
}: {
  chapter?: ChapterRow
  scripts: readonly ScriptRow[]
  /** El índice propuesto para un capítulo nuevo. Ausente al editar: el índice ya existe. */
  nextIndex?: number
  fieldErrors: ReadonlyMap<string, string>
}) {
  const t = useTranslations("productions.chapters")
  const common = useTranslations("common")

  return (
    <>
      <Field label={common("name")} error={fieldErrors.get("name")} required>
        {(ids) => <Input {...ids} name="name" defaultValue={chapter?.name} autoFocus />}
      </Field>

      <Field label={t("index")} hint={t("indexHint")} error={fieldErrors.get("index")} required>
        {(ids) => (
          <Input
            {...ids}
            name="index"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={chapter?.index ?? nextIndex ?? 0}
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
            defaultValue={chapter?.synopsis}
          />
        )}
      </Field>

      {scripts.length > 0 ? (
        <Field label={t("script")} hint={t("scriptHint")} error={fieldErrors.get("scriptId")}>
          {(ids) => (
            <Select {...ids} name="scriptId" defaultValue={chapter?.scriptId ?? ""}>
              <option value="">{t("noScript")}</option>
              {scripts.map((script) => (
                <option key={script.id} value={script.id}>
                  {script.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
    </>
  )
}

export function CreateChapter({
  companyId,
  productionId,
  scripts,
  nextIndex,
}: {
  companyId: string
  productionId: string
  scripts: readonly ScriptRow[]
  nextIndex: number
}) {
  const t = useTranslations("productions.chapters")
  const common = useTranslations("common")

  return (
    <FormDialog
      title={t("createTitle")}
      submitLabel={common("create")}
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            {t("createRoot")}
          </Button>
        </DialogTrigger>
      }
      action={(data) =>
        api(chaptersPath(companyId, productionId), {
          method: "POST",
          body: {
            name: text(data, "name"),
            index: Number(text(data, "index") || "0"),
            synopsis: optional(data, "synopsis"),
            scriptId: optional(data, "scriptId") ?? null,
          },
        })
      }
    >
      {(state) => (
        <ChapterFields scripts={scripts} nextIndex={nextIndex} fieldErrors={state.fieldErrors} />
      )}
    </FormDialog>
  )
}

function EditChapter({
  companyId,
  productionId,
  chapter,
  scripts,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  chapter: ChapterRow
  scripts: readonly ScriptRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.chapters")
  const common = useTranslations("common")

  return (
    <FormDialog
      title={t("editTitle", { name: chapter.name })}
      submitLabel={common("save")}
      open={open}
      onOpenChange={onOpenChange}
      action={(data) =>
        api(`${chaptersPath(companyId, productionId)}/${chapter.id}`, {
          method: "PATCH",
          body: {
            name: text(data, "name"),
            index: Number(text(data, "index") || "0"),
            synopsis: optional(data, "synopsis") ?? "",
            scriptId: optional(data, "scriptId") ?? null,
          },
        })
      }
    >
      {(state) => (
        <ChapterFields chapter={chapter} scripts={scripts} fieldErrors={state.fieldErrors} />
      )}
    </FormDialog>
  )
}

function DeleteChapter({
  companyId,
  productionId,
  chapter,
  after,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  chapter: ChapterRow
  after?: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.chapters")
  const common = useTranslations("common")

  return (
    <TreeDeleteDialog
      title={t("deleteTitle")}
      entity={chapter.name}
      confirmLabel={common("delete")}
      countingLabel={t("counting")}
      countFailedLabel={t("countFailed")}
      load={async () => {
        const scope = await api<ChapterScope>(
          `${chaptersPath(companyId, productionId)}/${chapter.id}/scope`,
        )

        return (
          [
            ["deleteScenes", scope.scenes],
            ["deleteRecordings", scope.recordings],
            ["deleteWorkflows", scope.workflows],
          ] as const
        )
          .filter(([, count]) => count > 0)
          .map(([key, count]) => t(key, { count }))
      }}
      remove={() =>
        api(`${chaptersPath(companyId, productionId)}/${chapter.id}`, { method: "DELETE" })
      }
      after={after}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

export function ChapterActions({
  companyId,
  productionId,
  chapter,
  scripts,
  canEdit,
  canDelete,
  after,
}: {
  companyId: string
  productionId: string
  chapter: ChapterRow
  scripts: readonly ScriptRow[]
  canEdit: boolean
  canDelete: boolean
  /** A dónde ir tras borrar, cuando éste es el capítulo que la pantalla está enseñando. */
  after?: string | undefined
}) {
  const common = useTranslations("common")
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: common("edit"),
      dialog: (control) => (
        <EditChapter
          key="edit"
          companyId={companyId}
          productionId={productionId}
          chapter={chapter}
          scripts={scripts}
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
        <DeleteChapter
          key="delete"
          companyId={companyId}
          productionId={productionId}
          chapter={chapter}
          after={after}
          {...control}
        />
      ),
    })
  }

  return <ItemActions label={common("actions")} actions={actions} />
}
