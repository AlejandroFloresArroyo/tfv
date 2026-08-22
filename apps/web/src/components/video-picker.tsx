"use client"

/**
 * El selector de video único de la biblioteca de una producción.
 *
 * Hermano de `photo-picker.tsx` y no una edición suya: comparte el motor de subida —
 * `usePhotoUploads` es genérico de verdad, pese al nombre, y `packages/ui/src/components/
 * file-picker.tsx` ya sabe previsualizar un video sacándole un fotograma— pero **no** sus textos.
 * `media.picker.*` y `media.single.*` dicen «foto» en los dos idiomas: «Elegir fotos», «aquí sólo
 * se admiten imágenes», «Imagen actual». Reusarlos tal cual en la biblioteca de videos sería
 * mentir en la propia etiqueta del campo. Las claves de aquí viven bajo `productions.videos.picker`
 * y `productions.videos.single`, en el espacio de nombres de quien las pide — la misma regla que
 * seguía el asistente al pedir prestado un campo de otro paso.
 *
 * ## Un video por entrada de la biblioteca, no una galería
 *
 * `videoUploadId` es una sola referencia, igual que `imageUploadId` en una imagen única. Por eso el
 * patrón es el de `useSinglePhoto`/`SinglePhotoField` y no el de `PhotoPicker` a secas: sustituir
 * el video reemplaza al anterior, no lo añade a una lista.
 */

import { FilePicker, type Rejection, type SelectionPolicy } from "@tfv/ui"
import { Trash2 } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useCallback, useMemo, useState } from "react"
import { type PhotoUploads, usePhotoUploads } from "./photo-picker.tsx"

/**
 * Lo que admite la biblioteca: video, y no minúsculo.
 *
 * 300 MB y no los 20 de una foto: es referencia de continuidad —cómo iba vestido un personaje, no
 * metraje de cámara—, así que un clip corto de teléfono ya pesa más que cualquier foto y hay que
 * dejarle sitio.
 */
export const VIDEO_POLICY: SelectionPolicy = {
  accept: ["video"],
  maxBytes: 300 * 1024 * 1024,
  maxFiles: 1,
}

export interface SingleVideo extends PhotoUploads {
  /** La dirección de la que ya tiene el video la entidad. Nula si no tiene ninguno. */
  readonly current: string | null
  readonly removed: boolean
  setRemoved: (removed: boolean) => void
  /** Lo que hay que mandar en `videoUploadId` tras subir: el nuevo, `null`, o nada. */
  patch: (uploaded: readonly string[]) => { readonly videoUploadId: string | null } | undefined
  /** Vuelve al estado guardado. Se llama al abrir el diálogo. */
  restore: () => void
}

/**
 * Qué mandar tras subir.
 *
 * La misma forma que `imagePatch` de `~/lib/uploads.ts`, con la clave que le toca a un video: omitir
 * el campo deja el video como está, `null` lo retira, y el nuevo identificador lo sustituye.
 */
function videoPatch(
  uploaded: readonly string[],
  removed: boolean,
  hadVideo: boolean,
): { readonly videoUploadId: string | null } | undefined {
  const fresh = uploaded[0]
  if (fresh !== undefined) return { videoUploadId: fresh }
  if (removed && hadVideo) return { videoUploadId: null }
  return undefined
}

export function useSingleVideo(companyId: string, current: string | null): SingleVideo {
  const uploads = usePhotoUploads(companyId)
  const [removed, setRemoved] = useState(false)
  const { reset } = uploads

  const restore = useCallback(() => {
    setRemoved(false)
    reset()
  }, [reset])

  return {
    ...uploads,
    current: removed ? null : current,
    removed,
    setRemoved,
    patch: (uploaded) => videoPatch(uploaded, removed, current !== null),
    restore,
  }
}

export function SingleVideoField({ video, label }: { video: SingleVideo; label: string }) {
  const t = useTranslations("productions.videos")
  const common = useTranslations("common")
  const format = useFormatter()

  const labels = useMemo(
    () => ({
      label: t("picker.label"),
      browse: t("picker.browse"),
      hint: t("picker.hint"),
      remove: (fileName: string) => t("picker.remove", { fileName }),
      retry: (fileName: string) => t("picker.retry", { fileName }),
      progress: (done: number, total: number) => t("picker.progress", { done, total }),
      rejected: (rejection: Rejection) =>
        t(`picker.rejected.${rejection.reason}`, { fileName: rejection.fileName }),
      dismiss: common("close"),
      size: (bytes: number) =>
        `${format.number(Math.max(1, Math.round(bytes / (1024 * 1024))))} MB`,
      noPreview: t("picker.noPreview"),
      noDerivatives: t("picker.noDerivatives"),
      waiting: t("picker.waiting"),
      working: t("picker.working"),
      done: t("picker.done"),
      failed: t("picker.failed"),
    }),
    [t, format, common],
  )

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body3 font-semibold text-content">{label}</p>

      {video.current === null ? null : (
        <div className="flex items-start gap-3 rounded-lg border border-edge bg-panel-raised p-2">
          <video
            src={video.current}
            controls
            muted
            className="h-24 w-40 shrink-0 rounded-md bg-panel-sunken object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
            <span className="text-body3 text-content-muted">{t("single.current")}</span>
          </div>
          <button
            type="button"
            onClick={() => video.setRemoved(true)}
            aria-label={t("single.remove")}
            className="grid size-7 shrink-0 place-items-center rounded-md text-content-faint hover:bg-panel-hover hover:text-content"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}

      <FilePicker
        files={video.files}
        onFilesChange={video.setFiles}
        labels={labels}
        policy={VIDEO_POLICY}
        uploads={video.uploads}
        onRetry={video.retry}
        onAbandon={video.abandon}
      />
    </div>
  )
}
