"use client"

/**
 * El selector de fotos de la aplicación: el del sistema de diseño, con sus textos y su subida.
 *
 * `packages/ui/src/components/file-picker.tsx` no sube nada y no sabe de idiomas — recibe el
 * progreso y unas etiquetas—. Aquí se le dan las dos cosas, y se le da **una vez**: sin esto, cada
 * pantalla con fotos volvería a escribir las quince etiquetas y su propio recorrido de subida, que
 * es como acaban difiriendo.
 *
 * **La subida se lanza desde fuera, después de guardar.** Es la regla de `forms-and-wizards`: la
 * escritura va directa al almacenamiento y puede fallar por su cuenta, así que perder el formulario
 * entero por una foto es justo lo que no debe pasar. Por eso `usePhotoUploads` devuelve `run` en
 * vez de dispararse solo.
 */

import type { UploadState } from "@tfv/ui"
import {
  Button,
  FilePicker,
  fileUpload,
  type PickedFile,
  type Rejection,
  type SelectionPolicy,
} from "@tfv/ui"
import { Trash2 } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useCallback, useMemo, useRef, useState } from "react"
import { abandonUpload, imagePatch, uploadedIds, uploadPorts } from "~/lib/uploads.ts"
import { Photo } from "./photo.tsx"

/** Lo que admite una galería de producto o la imagen de un almacén: imágenes, y no muy grandes. */
export const PHOTO_POLICY: SelectionPolicy = {
  accept: ["image"],
  maxBytes: 20 * 1024 * 1024,
  maxFiles: 20,
}

export const SINGLE_PHOTO_POLICY: SelectionPolicy = { ...PHOTO_POLICY, maxFiles: 1 }

/**
 * Cómo terminó una tanda.
 *
 * `failed` viaja con el resultado y no se lee del estado: `setState` no ha surtido efecto cuando
 * `run` devuelve, así que consultarlo ahí daría el recuento de **antes** de subir — y una tanda con
 * fallos se daría por buena.
 */
export interface UploadOutcome {
  readonly uploaded: readonly string[]
  readonly failed: number
}

export interface PhotoUploads {
  readonly files: readonly PickedFile[]
  readonly uploads: UploadState | undefined
  readonly pending: boolean
  setFiles: (files: readonly PickedFile[]) => void
  /** Sube lo elegido y dice cómo fue. Se llama **después** de guardar la entidad. */
  run: () => Promise<UploadOutcome>
  retry: (id: string) => void
  abandon: (uploadId: string) => void
  reset: () => void
}

export function usePhotoUploads(companyId: string): PhotoUploads {
  const [files, setFiles] = useState<readonly PickedFile[]>([])
  const [uploads, setUploads] = useState<UploadState | undefined>(undefined)
  const [pending, setPending] = useState(false)
  // La selección se lee dentro del recorrido, que dura varios segundos: leerla de la variable de
  // cierre daría la de cuando se pulsó, y quitar una foto a mitad dejaría un puerto buscando un
  // archivo que ya no está.
  const current = useRef<readonly PickedFile[]>([])
  current.current = files

  const run = useCallback(async (): Promise<UploadOutcome> => {
    if (current.current.length === 0) return { uploaded: [], failed: 0 }

    setPending(true)
    try {
      const queued = fileUpload.enqueue(
        uploads ?? fileUpload.idle,
        current.current.map((picked) => ({ id: picked.id, kind: picked.kind })),
      )
      setUploads(queued)

      const finished = await fileUpload.runUploads(
        queued,
        uploadPorts(companyId, current.current),
        { onChange: setUploads },
      )

      setUploads(finished)
      return {
        uploaded: uploadedIds(finished),
        failed: finished.files.filter((file) => file.phase === "failed").length,
      }
    } finally {
      setPending(false)
    }
  }, [companyId, uploads])

  const retry = useCallback((id: string) => {
    setUploads((state) =>
      state === undefined ? state : fileUpload.reduce(state, { type: "retry", id }),
    )
  }, [])

  const abandon = useCallback(
    (uploadId: string) => {
      abandonUpload(companyId, uploadId)
    },
    [companyId],
  )

  const reset = useCallback(() => {
    setFiles([])
    setUploads(undefined)
  }, [])

  return { files, uploads, pending, setFiles, run, retry, abandon, reset }
}

export function PhotoPicker({
  uploads,
  policy = PHOTO_POLICY,
  disabled,
  className,
}: {
  uploads: PhotoUploads
  policy?: SelectionPolicy | undefined
  disabled?: boolean | undefined
  className?: string | undefined
}) {
  const t = useTranslations()
  const format = useFormatter()

  const labels = useMemo(
    () => ({
      label: t("media.picker.label"),
      browse: t("media.picker.browse"),
      hint: t("media.picker.hint"),
      remove: (fileName: string) => t("media.picker.remove", { fileName }),
      retry: (fileName: string) => t("media.picker.retry", { fileName }),
      progress: (done: number, total: number) => t("media.picker.progress", { done, total }),
      rejected: (rejection: Rejection) =>
        t(`media.picker.rejected.${rejection.reason}`, { fileName: rejection.fileName }),
      dismiss: t("common.close"),
      size: (bytes: number) => `${format.number(Math.max(1, Math.round(bytes / 1024)))} kB`,
      noPreview: t("media.picker.noPreview"),
      noDerivatives: t("media.picker.noDerivatives"),
      waiting: t("media.picker.waiting"),
      working: t("media.picker.working"),
      done: t("media.picker.done"),
      failed: t("media.picker.failed"),
    }),
    [t, format],
  )

  return (
    <FilePicker
      files={uploads.files}
      onFilesChange={uploads.setFiles}
      labels={labels}
      policy={policy}
      uploads={uploads.uploads}
      onRetry={uploads.retry}
      onAbandon={uploads.abandon}
      disabled={disabled ?? false}
      className={className}
    />
  )
}

// ─── Imagen única ────────────────────────────────────────────────────────────

export interface SinglePhoto extends PhotoUploads {
  /** La dirección de la que ya tiene la entidad. Nula si no tiene ninguna. */
  readonly current: string | null
  readonly removed: boolean
  setRemoved: (removed: boolean) => void
  /** Lo que hay que mandar en `imageUploadId` tras subir: el nuevo, `null`, o nada. */
  patch: (uploaded: readonly string[]) => { readonly imageUploadId: string | null } | undefined
  /** Vuelve al estado guardado. Se llama al abrir el diálogo. */
  restore: () => void
}

/**
 * El estado de la imagen única de una entidad —almacén, ubicación—.
 *
 * Es la galería con un solo hueco, y la diferencia que importa está en `patch`: **quitar y no tocar
 * no son lo mismo**. Ver `imagePatch`.
 */
export function useSinglePhoto(companyId: string, current: string | null): SinglePhoto {
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
    patch: (uploaded) => imagePatch(uploaded, removed, current !== null),
    restore,
  }
}

export function SinglePhotoField({ photo, label }: { photo: SinglePhoto; label: string }) {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body3 font-semibold text-content">{label}</p>

      {photo.current === null ? null : (
        <div className="flex items-center gap-3 rounded-sm border border-line bg-panel p-2">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xs bg-panel-sunken">
            <Photo src={photo.current} className="size-full object-cover" />
          </span>
          <span className="min-w-0 flex-1 text-body3 text-content-muted">
            {t("media.single.current")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => photo.setRemoved(true)}
            aria-label={t("media.single.remove")}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}

      {/* Elegir una nueva sustituye a la que hubiera: es una imagen, no una galería. */}
      <PhotoPicker uploads={photo} policy={SINGLE_PHOTO_POLICY} />
    </div>
  )
}
