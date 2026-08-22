"use client"

import { Badge, Button, Callout, Checkbox, DialogTrigger, Field, Panel, Select } from "@tfv/ui"
import { Shirt, Video } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { FormDialog } from "~/components/form-dialog.tsx"
import { text } from "~/components/use-submit.ts"
import { apiTyped } from "~/lib/api.client.ts"
import type { CharacterRow, ContinuityRow, ItemRow, VideoRow } from "../../../production.ts"
import { partitionProps } from "../rodaje-logic.ts"

/**
 * Una continuidad: un personaje —o ninguno— con su utilería.
 *
 * ## Dos diálogos, uno por tipo, nunca uno que reciba los dos
 *
 * Refleja del lado de la pantalla la misma forma que el servidor no deja escribir de otra manera
 * (`routes/continuity.ts`, la cabecera de «los cuatro caminos de la utilería»): «Editar artículos»
 * llama a `PUT .../items` y «Editar videos» llama a `PUT .../videos`, y no existe un formulario
 * único con las dos listas donde alguien pudiera marcar de las dos a la vez. La exclusión no es una
 * validación que esta pantalla tenga que recordar comprobar: es que aquí no hay manera de
 * expresarla.
 */
export function ContinuityPanel({
  companyId,
  productionId,
  recordingId,
  continuity,
  items,
  videos,
  characters,
  canEditItems,
  canEditVideos,
  canSetCharacter,
  canDelete,
}: {
  companyId: string
  productionId: string
  recordingId: string
  continuity: ContinuityRow
  items: readonly ItemRow[]
  videos: readonly VideoRow[]
  characters: readonly CharacterRow[]
  canEditItems: boolean
  canEditVideos: boolean
  canSetCharacter: boolean
  canDelete: boolean
}) {
  const t = useTranslations("productions.rodaje")
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const partition = partitionProps(continuity.props)

  async function remove() {
    setBusy(true)
    try {
      await apiTyped(
        "DELETE /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}",
        { params: { companyId, productionId, recordingId, continuityId: continuity.id } },
      )
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body1 font-semibold text-content">
          {continuity.characterName ?? t("continuityWithoutCharacter")}
        </p>

        <div className="flex items-center gap-1">
          {canSetCharacter ? (
            <SetCharacter
              companyId={companyId}
              productionId={productionId}
              recordingId={recordingId}
              continuity={continuity}
              characters={characters}
            />
          ) : null}

          {canDelete ? (
            <Button variant="ghost" size="sm" loading={busy} onClick={remove}>
              {t("removeContinuity")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {partition.items.length === 0 ? (
          <span className="text-body3 text-content-faint">{t("noItems")}</span>
        ) : (
          partition.items.map((prop) => (
            <Badge key={prop.id} tone="neutral">
              <Shirt className="size-3" aria-hidden="true" />
              {prop.name}
            </Badge>
          ))
        )}

        {canEditItems ? (
          <EditProps
            title={t("editItemsTitle")}
            description={t("editItemsBody")}
            confirm={t("save")}
            empty={t("noItemsToChoose")}
            current={
              new Set(partition.items.map((prop) => prop.itemId).filter((id) => id !== null))
            }
            options={items.map((item) => ({ id: item.id, name: item.name, code: item.code }))}
            trigger={t("editItems")}
            onSubmit={(itemIds) =>
              apiTyped(
                "PUT /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}/items",
                {
                  params: {
                    companyId,
                    productionId,
                    recordingId,
                    continuityId: continuity.id,
                  },
                  body: { itemIds },
                },
              )
            }
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {partition.videos.length === 0 ? (
          <span className="text-body3 text-content-faint">{t("noVideos")}</span>
        ) : (
          partition.videos.map((prop) => (
            <Badge key={prop.id} tone="neutral">
              <Video className="size-3" aria-hidden="true" />
              {prop.name}
            </Badge>
          ))
        )}

        {canEditVideos ? (
          <EditProps
            title={t("editVideosTitle")}
            description={t("editVideosBody")}
            confirm={t("save")}
            empty={t("noVideosToChoose")}
            current={
              new Set(partition.videos.map((prop) => prop.videoId).filter((id) => id !== null))
            }
            options={videos.map((video) => ({ id: video.id, name: video.name, code: null }))}
            trigger={t("editVideos")}
            onSubmit={(videoIds) =>
              apiTyped(
                "PUT /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}/videos",
                {
                  params: {
                    companyId,
                    productionId,
                    recordingId,
                    continuityId: continuity.id,
                  },
                  body: { videoIds },
                },
              )
            }
          />
        ) : null}
      </div>
    </Panel>
  )
}

/**
 * El selector de utilería, un tipo a la vez.
 *
 * Misma forma que `ComposeDelivery`/`ComposeSet`: el conjunto entero se manda con `PUT`, no altas
 * y bajas sueltas.
 */
function EditProps({
  title,
  description,
  confirm,
  empty,
  current,
  options,
  trigger,
  onSubmit,
}: {
  title: string
  description: string
  confirm: string
  empty: string
  current: ReadonlySet<string>
  options: readonly { id: string; name: string; code: string | null }[]
  trigger: string
  /** El `PUT` ya atado a su ruta: la del artículo, o la del video. Nunca las dos a la vez. */
  onSubmit: (ids: string[]) => Promise<unknown>
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(current)

  function toggle(id: string, on: boolean) {
    setChosen((previous) => {
      const next = new Set(previous)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm">
            {trigger}
          </Button>
        </DialogTrigger>
      }
      title={title}
      description={description}
      submitLabel={confirm}
      size="lg"
      action={() => onSubmit([...chosen])}
    >
      {() =>
        options.length === 0 ? (
          <Callout tone="warning">{empty}</Callout>
        ) : (
          <ul className="max-h-[22rem] overflow-y-auto rounded-lg border border-edge">
            {options.map((option) => (
              <li
                key={option.id}
                className="flex items-center gap-3 px-3 py-2.5 not-last:border-edge not-last:border-b"
              >
                <Checkbox
                  checked={chosen.has(option.id)}
                  onCheckedChange={(checked) => toggle(option.id, checked === true)}
                  aria-label={option.name}
                />
                <span className="min-w-0 flex-1 truncate text-body2 text-content">
                  {option.name}
                </span>
                {option.code ? (
                  <span className="shrink-0 font-mono text-body3 text-content-faint">
                    {option.code}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )
      }
    </FormDialog>
  )
}

const CHARACTER_NONE = ""

/**
 * Poner o retirar el personaje de una continuidad.
 *
 * `productions.continuities.character` es su propia clave, separada de `products` y `videos`: a
 * quién pertenece lo registrado es una decisión distinta de qué se registró
 * (`setContinuityCharacterRoute`, en el servidor). Sirve sobre todo para la utilería suelta —la que
 * se cuelga sin personaje porque es de la escena y no de nadie en concreto—: aquí es donde, si
 * después resulta que sí era de alguien, se le pone.
 */
function SetCharacter({
  companyId,
  productionId,
  recordingId,
  continuity,
  characters,
}: {
  companyId: string
  productionId: string
  recordingId: string
  continuity: ContinuityRow
  characters: readonly CharacterRow[]
}) {
  const t = useTranslations("productions.rodaje")

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            {t("setCharacter")}
          </Button>
        </DialogTrigger>
      }
      title={t("setCharacterTitle")}
      submitLabel={t("save")}
      action={async (data) => {
        const characterId = text(data, "characterId")
        await apiTyped(
          "PUT /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}/character",
          {
            params: { companyId, productionId, recordingId, continuityId: continuity.id },
            body: { characterId: characterId === CHARACTER_NONE ? null : characterId },
          },
        )
      }}
    >
      {() => (
        <Field label={t("character")}>
          {(ids) => (
            <Select
              {...ids}
              name="characterId"
              defaultValue={continuity.characterId ?? CHARACTER_NONE}
            >
              <option value={CHARACTER_NONE}>{t("continuityWithoutCharacter")}</option>
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
    </FormDialog>
  )
}
