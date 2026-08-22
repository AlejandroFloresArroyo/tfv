"use client"

import { Button, DialogTrigger, Field, Input, Select } from "@tfv/ui"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { text } from "~/components/use-submit.ts"
import { apiTyped } from "~/lib/api.client.ts"
import {
  RECORDING_KINDS,
  type RecordingDetailRow,
  type SceneOptionRow,
} from "../../../production.ts"

const SCENE_NONE = ""

/**
 * Editar, cerrar, reabrir y dar de baja una jornada.
 *
 * ## Cerrar no exige continuidad completa, y el diálogo no lo insinúa
 *
 * `closeRecordingRoute` lo dice en su propia cabecera del servidor: el día se acaba cuando se
 * acaba, no cuando todo el reparto tiene su utilería colgada. El texto de confirmación no pide
 * completar nada porque no hay nada que completar para poder cerrar.
 */
export function EditRecording({
  companyId,
  productionId,
  recording,
  scenes,
}: {
  companyId: string
  productionId: string
  recording: RecordingDetailRow
  scenes: readonly SceneOptionRow[]
}) {
  const t = useTranslations("productions.recordings")

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button variant="secondary">{t("edit")}</Button>
        </DialogTrigger>
      }
      title={t("editTitle", { name: recording.name })}
      submitLabel={t("save")}
      action={async (data) => {
        const sceneId = text(data, "sceneId")

        await apiTyped(
          "PATCH /companies/{companyId}/productions/{productionId}/recordings/{recordingId}",
          {
            params: { companyId, productionId, recordingId: recording.id },
            body: {
              name: text(data, "name"),
              kind: text(data, "kind") as (typeof RECORDING_KINDS)[number],
              sceneId: sceneId === SCENE_NONE ? null : sceneId,
            },
          },
        )
      }}
    >
      {(state) => (
        <>
          <Field label={t("name")} error={state.fieldErrors.get("name")} required>
            {(ids) => (
              <Input {...ids} name="name" autoFocus maxLength={250} defaultValue={recording.name} />
            )}
          </Field>

          <Field label={t("kind.label")}>
            {(ids) => (
              <Select {...ids} name="kind" defaultValue={recording.kind}>
                {RECORDING_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`kind.${kind}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t("scene")}>
            {(ids) => (
              <Select {...ids} name="sceneId" defaultValue={recording.scene?.id ?? SCENE_NONE}>
                <option value={SCENE_NONE}>{t("noScene")}</option>
                {scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.label} · {scene.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </>
      )}
    </FormDialog>
  )
}

export function CloseRecording({
  companyId,
  productionId,
  recording,
}: {
  companyId: string
  productionId: string
  recording: RecordingDetailRow
}) {
  const t = useTranslations("productions.recordings")

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button variant="secondary">{t("close")}</Button>
        </DialogTrigger>
      }
      title={t("closeTitle")}
      description={t("closeBody")}
      submitLabel={t("closeConfirm")}
      action={async () => {
        await apiTyped(
          "POST /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/close",
          { params: { companyId, productionId, recordingId: recording.id } },
        )
      }}
    >
      {() => null}
    </FormDialog>
  )
}

export function OpenRecording({
  companyId,
  productionId,
  recording,
}: {
  companyId: string
  productionId: string
  recording: RecordingDetailRow
}) {
  const t = useTranslations("productions.recordings")

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button variant="secondary">{t("reopen")}</Button>
        </DialogTrigger>
      }
      title={t("reopenTitle")}
      description={t("reopenBody")}
      submitLabel={t("reopenConfirm")}
      action={async () => {
        await apiTyped(
          "POST /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/open",
          { params: { companyId, productionId, recordingId: recording.id } },
        )
      }}
    >
      {() => null}
    </FormDialog>
  )
}

export function DeleteRecording({
  companyId,
  productionId,
  recording,
}: {
  companyId: string
  productionId: string
  recording: RecordingDetailRow
}) {
  const t = useTranslations("productions.recordings")
  const router = useRouter()

  return (
    <ConfirmDestructive
      trigger={
        <DialogTrigger asChild>
          <Button variant="ghost" className="text-tinta-alto">
            {t("delete")}
          </Button>
        </DialogTrigger>
      }
      title={t("deleteTitle")}
      entity={recording.name}
      cascade={[t("deleteCascade", { count: recording.continuityCount })]}
      confirmLabel={t("delete")}
      action={async () => {
        await apiTyped(
          "DELETE /companies/{companyId}/productions/{productionId}/recordings/{recordingId}",
          { params: { companyId, productionId, recordingId: recording.id } },
        )
        router.push(`/c/${companyId}/productions/${productionId}/rodaje`)
      }}
    />
  )
}
