"use client"

/**
 * El archivo único de un guion: el mismo patrón que `SinglePhotoField`
 * (`~/components/photo-picker.tsx`), pero para un documento y no para una imagen.
 *
 * ## Por qué esto no usa `PhotoPicker`
 *
 * `PhotoPicker` construye sus textos una sola vez, dentro de sí mismo, con `media.picker.*` — y esa
 * familia de claves habla **de fotos** sin condición: «Elegir fotos», «Arrastra las fotos aquí», y
 * el rechazo por tipo dice «aquí sólo se admiten imágenes» aunque la política admita documentos.
 * Nada de eso se puede corregir desde fuera: `labels` no es una propiedad de `PhotoPicker`, así que
 * un guion —que es justo lo que **no** es una foto— terminaría con un selector que miente sobre lo
 * que está pidiendo. Se anota en `HALLAZGOS.md`, H-241: afecta también a `Attachments`, que
 * comparte la misma pieza para adjuntar documentos.
 *
 * La solución no es tocar `photo-picker.tsx` —lo usan ya la ficha de almacén, las ubicaciones y los
 * adjuntos de tareas y de anclas, y otra rama está construyendo sobre él en paralelo— sino bajar un
 * nivel: `FilePicker`, el primitivo de `@tfv/ui`, sí recibe `labels` como propiedad. Aquí se le dan
 * las propias, en español y en inglés, y se conserva `usePhotoUploads` —la máquina de subida es
 * genérica de verdad; lo que no lo era es el texto de encima—.
 *
 * ## El resto es exactamente `SinglePhotoField`
 *
 * `patch` tiene la misma forma que `imagePatch`: tres respuestas y no dos. Omitir el campo deja el
 * archivo como está; mandar `null` lo retira. Confundirlos dejaría que renombrar un guion le
 * borrara el archivo.
 *
 * ## Subir va después de guardar, y aquí importa más que en una foto
 *
 * Es la regla de `forms-and-wizards`, pero sustituir o quitar el archivo de un guion tiene además
 * un efecto que una foto no tiene: `script-breakdown` lo devuelve a `not_extracted`. El servidor lo
 * hace solo al recibir `documentUploadId`, así que aquí no hay nada que replicar — sólo hay que
 * mandar el campo cuando de verdad cambió, y no en cada guardado.
 */

import { Button, FilePicker, type Rejection, type SelectionPolicy } from "@tfv/ui"
import { FileText, Trash2 } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useCallback, useMemo, useState } from "react"
import { type PhotoUploads, usePhotoUploads } from "~/components/photo-picker.tsx"

/** Un guion es un PDF y nada más: es lo único que la API clasifica como `document`. */
export const SCRIPT_DOCUMENT_POLICY: SelectionPolicy = {
  accept: ["document"],
  maxBytes: 50 * 1024 * 1024,
  maxFiles: 1,
}

export interface SingleDocument extends PhotoUploads {
  /** El nombre del archivo que ya tiene el guion. Nulo si no tiene ninguno. */
  readonly current: string | null
  readonly removed: boolean
  setRemoved: (removed: boolean) => void
  /** Lo que hay que mandar en `documentUploadId` tras subir: el nuevo, `null`, o nada. */
  patch: (uploaded: readonly string[]) => { readonly documentUploadId: string | null } | undefined
  /** Vuelve al estado guardado. Se llama al abrir el diálogo. */
  restore: () => void
}

/**
 * Qué mandar en `documentUploadId` después de subir.
 *
 * Misma forma que `imagePatch` (`~/lib/uploads.ts`), y no la misma función: comparten la idea y no
 * el nombre del campo, y `~/lib/uploads.ts` es compartido por toda la aplicación — cambiarlo para
 * un solo consumidor no es sitio para esta clave.
 */
export function documentPatch(
  uploaded: readonly string[],
  removed: boolean,
  hadDocument: boolean,
): { readonly documentUploadId: string | null } | undefined {
  const fresh = uploaded[0]
  if (fresh !== undefined) return { documentUploadId: fresh }
  if (removed && hadDocument) return { documentUploadId: null }
  return undefined
}

/** El estado del archivo único de un guion. `currentName` es su nombre actual, o nulo si no tiene. */
export function useSingleDocument(companyId: string, currentName: string | null): SingleDocument {
  const uploads = usePhotoUploads(companyId)
  const [removed, setRemoved] = useState(false)
  const { reset } = uploads

  const restore = useCallback(() => {
    setRemoved(false)
    reset()
  }, [reset])

  return {
    ...uploads,
    current: removed ? null : currentName,
    removed,
    setRemoved,
    patch: (uploaded) => documentPatch(uploaded, removed, currentName !== null),
    restore,
  }
}

export function SingleDocumentField({ document }: { document: SingleDocument }) {
  const t = useTranslations("productions.script")
  const common = useTranslations("common")
  const format = useFormatter()

  const labels = useMemo(
    () => ({
      label: t("document"),
      browse: t("pickerBrowse"),
      hint: t("pickerHint"),
      remove: (fileName: string) => t("pickerRemoveFile", { fileName }),
      retry: (fileName: string) => t("pickerRetryFile", { fileName }),
      progress: (done: number, total: number) => t("pickerProgress", { done, total }),
      rejected: (rejection: Rejection) =>
        t(`pickerRejected.${rejection.reason}`, { fileName: rejection.fileName }),
      dismiss: common("close"),
      size: (bytes: number) => `${format.number(Math.max(1, Math.round(bytes / 1024)))} kB`,
      noPreview: t("pickerNoPreview"),
      noDerivatives: t("pickerNoDerivatives"),
      waiting: t("pickerWaiting"),
      working: t("pickerWorking"),
      done: t("pickerDone"),
      failed: t("pickerFailed"),
    }),
    [t, common, format],
  )

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body3 font-semibold text-content">{t("document")}</p>

      {document.current !== null ? (
        <div className="flex items-center gap-3 rounded-lg border border-edge bg-panel-raised p-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-panel-sunken text-content-muted">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-body3 text-content-muted">
            {document.current}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => document.setRemoved(true)}
            aria-label={t("removeDocument")}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ) : null}

      {/* Elegir un archivo nuevo sustituye al que hubiera: es un documento único, no una galería. */}
      <FilePicker
        files={document.files}
        onFilesChange={document.setFiles}
        labels={labels}
        policy={SCRIPT_DOCUMENT_POLICY}
        uploads={document.uploads}
        onRetry={document.retry}
        onAbandon={document.abandon}
      />
    </div>
  )
}
