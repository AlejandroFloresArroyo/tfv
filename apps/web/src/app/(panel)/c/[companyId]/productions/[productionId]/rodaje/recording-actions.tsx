"use client"

import { Button, DialogTrigger, Field, Input, Select } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { apiTyped } from "~/lib/api.client.ts"
import { RECORDING_KINDS, type RecordingRow, type SceneOptionRow } from "../../production.ts"

const SCENE_NONE = ""

/**
 * Programar una jornada.
 *
 * ## La escena es opcional, y el modelo lo permite
 *
 * `sceneId` acepta nulo tanto en el alta como en la edición (`production-catalog... continuity.ts`,
 * el cuerpo de `createRecordingRoute`). Una jornada sin escena es legítima —una prueba de cámara,
 * un día de repaso— y no un dato que falte, así que el selector lleva una opción explícita para
 * «ninguna» en vez de exigir una.
 *
 * ## Al crear se entra directo a la ficha
 *
 * Igual que al abrir una nota de entrega o dar de alta un set: lo siguiente que hay que hacer con
 * una jornada recién programada es asignarle el reparto, y eso sólo se hace dentro.
 */
export function CreateRecording({
  companyId,
  productionId,
  scenes,
}: {
  companyId: string
  productionId: string
  scenes: readonly SceneOptionRow[]
}) {
  const t = useTranslations("productions.recordings")
  const router = useRouter()

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
      action={async (data) => {
        const sceneId = text(data, "sceneId")

        const created: RecordingRow = await apiTyped(
          "POST /companies/{companyId}/productions/{productionId}/recordings",
          {
            params: { companyId, productionId },
            body: {
              name: text(data, "name"),
              ...(sceneId === SCENE_NONE ? {} : { sceneId }),
              ...(optional(data, "kind") === undefined
                ? {}
                : { kind: text(data, "kind") as (typeof RECORDING_KINDS)[number] }),
            },
          },
        )

        router.push(`/c/${companyId}/productions/${productionId}/rodaje/${created.id}`)
      }}
    >
      {(state) => (
        <>
          <Field label={t("name")} error={state.fieldErrors.get("name")} required>
            {(ids) => (
              <Input
                {...ids}
                name="name"
                autoFocus
                maxLength={250}
                placeholder={t("namePlaceholder")}
              />
            )}
          </Field>

          <Field label={t("kind.label")}>
            {(ids) => (
              <Select {...ids} name="kind" defaultValue={RECORDING_KINDS[0]}>
                {RECORDING_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`kind.${kind}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {scenes.length > 0 ? (
            <Field label={t("scene")} hint={t("sceneHint")}>
              {(ids) => (
                <Select {...ids} name="sceneId" defaultValue={SCENE_NONE}>
                  <option value={SCENE_NONE}>{t("noScene")}</option>
                  {scenes.map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.label} · {scene.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
        </>
      )}
    </FormDialog>
  )
}
