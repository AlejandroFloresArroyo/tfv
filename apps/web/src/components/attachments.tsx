"use client"

import { Button, Spinner } from "@tfv/ui"
import { Paperclip, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { PhotoPicker, usePhotoUploads } from "~/components/photo-picker.tsx"
import { api } from "~/lib/api.client.ts"

/**
 * Los archivos que cuelgan de algo: los de una tarea, los comprobantes de un ancla, las facturas de
 * una compra.
 *
 * Vive aquí y no dentro de una pantalla porque **hay más de una entidad con adjuntos**, y todas
 * cuelgan igual: se sube el archivo, se le dice a la entidad que existe, y se retira por su
 * identificador. Dos copias de esto son dos copias que alguien corrige por separado hasta que una
 * de las dos deja de barrer el archivo que quedó suelto.
 *
 * Lo único que cambia entre entidades es **el camino**, y por eso es una propiedad.
 */

/** Lo que se puede adjuntar: documentos y fotos, no sólo imágenes. Una factura es un PDF. */
const ATTACHMENT_POLICY = {
  accept: ["image", "document", "file"] as const,
  maxBytes: 25 * 1024 * 1024,
  maxFiles: 10,
}

export function Attachments({
  companyId,
  base,
  attachments,
  canManage,
  onChanged,
}: {
  companyId: string
  /** El camino de la colección de adjuntos de esta entidad. Es lo único que cambia entre ellas. */
  base: string
  attachments: readonly { id: string; name: string; url: string }[]
  canManage: boolean
  onChanged: () => Promise<void>
}) {
  const t = useTranslations("productions.attachments")
  const common = useTranslations("common")
  const uploads = usePhotoUploads(companyId)
  const [busy, setBusy] = useState(false)

  /**
   * Subir y luego colgar, en dos pasos y en ese orden.
   *
   * El archivo llega antes al almacenamiento y **después** se le dice a la tarea que existe. Al
   * revés dejaría filas apuntando a archivos que nunca terminaron de subir, que es exactamente el
   * hueco roto que la spec de archivos prohíbe enseñar.
   */
  async function attach() {
    setBusy(true)
    try {
      const outcome = await uploads.run()
      for (const uploadId of outcome.uploaded) {
        await api(base, { method: "POST", body: { uploadId } })
      }
      uploads.reset()
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function detach(attachmentId: string) {
    setBusy(true)
    try {
      await api(`${base}/${attachmentId}`, { method: "DELETE" })
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h4 className="legend text-content-muted">{t("title")}</h4>

      {attachments.length === 0 ? (
        <p className="mt-2 text-body3 text-content-faint">{t("empty")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-2">
              <Paperclip className="size-3.5 shrink-0 text-content-faint" aria-hidden="true" />
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-body3 text-content underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
              >
                {attachment.name}
              </a>
              {canManage ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void detach(attachment.id)}
                  aria-label={t("remove", { name: attachment.name })}
                  className="rounded-md p-1 text-content-faint transition-colors hover:text-tinta-alto focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className="mt-3 flex flex-col gap-2">
          <PhotoPicker uploads={uploads} policy={ATTACHMENT_POLICY} disabled={busy} />
          {uploads.files.length > 0 ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void attach()}>
              {busy ? <Spinner /> : null}
              {common("add")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
