"use client"

import { documentFileName } from "@tfv/contracts/document"
import { Button } from "@tfv/ui"
import { Check, Download, Link2, Printer } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { browserTarget, printDocument } from "~/lib/document.ts"

/**
 * Las tres acciones del documento.
 *
 * Ver `openspec/specs/pdf-documents/spec.md`, requisito «Previsualizar, imprimir y descargar».
 *
 * Previsualizar no es un botón: **es la pantalla**. Imprimir y descargar son el mismo diálogo del
 * navegador con distinto destino —la impresora o «Guardar como PDF»—, así que las dos mandan lo
 * mismo y por eso no pueden diferir en nada.
 *
 * El nombre del archivo se compone **al pulsar**, no al pintar: el instante que lleva es el de la
 * descarga, que es lo que distingue dos copias del mismo folio bajadas con una semana de
 * diferencia.
 *
 * El componente sólo cablea el evento; la mecánica —poner el título, devolverlo al terminar— vive
 * en `~/lib/document.ts` y tiene sus pruebas.
 */
export function DocumentActions({
  label,
  reference,
  shareUrl,
}: {
  /** Cómo se llama esta familia de documentos, ya traducida. Va en el nombre del archivo. */
  label: string
  /** El folio, para reconocer el archivo entre los demás. */
  reference: string
  /** El enlace público. Ausente cuando ya se está mirando por él. */
  shareUrl?: string
}) {
  const t = useTranslations("documents")
  const [copied, setCopied] = useState(false)

  const print = () => {
    printDocument(browserTarget(), documentFileName({ label, reference, at: new Date() }))
  }

  const copy = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="documento-fuera-de-la-hoja flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" onClick={print}>
        <Printer className="size-4" aria-hidden="true" />
        {t("print")}
      </Button>

      {/*
        Descargar es el mismo diálogo con el destino «Guardar como PDF». Se ofrece aparte porque es
        como la gente lo busca, y el aviso de al lado dice qué elegir: sin él, quien viene a
        descargar se encuentra una impresora seleccionada y cree que se equivocó de botón.
      */}
      <Button variant="secondary" size="sm" onClick={print}>
        <Download className="size-4" aria-hidden="true" />
        {t("download")}
      </Button>

      {shareUrl ? (
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Link2 className="size-4" aria-hidden="true" />
          )}
          {copied ? t("copied") : t("copyLink")}
        </Button>
      ) : null}
    </div>
  )
}
