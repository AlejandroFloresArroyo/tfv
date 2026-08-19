import { documentStamp, type QuoteDocument } from "@tfv/contracts/document"
import { Callout } from "@tfv/ui"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { DocumentActions } from "~/components/documents/document-actions.tsx"
import { QuoteSheet } from "~/components/documents/quote-sheet.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { publicDocumentUrl } from "~/lib/document.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("documents.quoteDocument") }
}

/**
 * El documento de una cotización, desde el panel.
 *
 * Ver `openspec/specs/pdf-documents/spec.md`.
 *
 * Lo que se ve es la hoja: previsualizar **es** esta pantalla. Alrededor sólo hay lo que no se
 * imprime —la vuelta a la ficha, las acciones y el enlace público—, y desaparece en el papel.
 */
export default async function QuoteDocumentPage({
  params,
}: {
  params: Promise<{ companyId: string; warehouseId: string; quoteId: string }>
}) {
  const t = await getTranslations("documents")
  const { companyId, warehouseId, quoteId } = await params

  const incoming = await headers()
  const path =
    incoming.get("x-pathname") ??
    `/c/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}/document`

  const profile = await requireProfile(path)
  requireCompany(profile, companyId)

  const result = await apiGet<{ document: QuoteDocument; reference: string }>(
    `/companies/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}/document`,
  )

  const back = `/c/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}`

  if (!result.ok) {
    return (
      <main id="contenido" className="mx-auto w-full max-w-(--breakpoint-desktop) flex-1 px-4 py-6">
        <ApiFailure result={result} />
      </main>
    )
  }

  const { document, reference } = result.data
  const origin = originOf(incoming)

  return (
    <main
      id="contenido"
      className="mx-auto w-full max-w-(--breakpoint-desktop) flex-1 px-4 py-6 tablet:px-6 tablet:py-8"
    >
      <div className="documento-fuera-de-la-hoja mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={back}
          className="inline-flex items-center gap-1.5 rounded-xs text-body2 text-content-muted hover:text-content"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("backToQuote")}
        </Link>

        <DocumentActions
          label={t("quote")}
          reference={document.identity.folio}
          shareUrl={publicDocumentUrl(origin, reference)}
        />
      </div>

      {/*
        Un documento que no cuadra no se esconde: es la cifra con la que el cliente discute, y quien
        lo va a mandar tiene que verlo antes que él. No se imprime, porque es un aviso nuestro.
      */}
      {document.reconciles ? null : (
        <Callout tone="danger" className="documento-fuera-de-la-hoja mb-4">
          {t("doesNotReconcile")}
        </Callout>
      )}

      <QuoteSheet
        document={document}
        stamp={documentStamp("TFV", `${origin}${path}`, new Date())}
      />

      <div className="documento-fuera-de-la-hoja mx-auto mt-3 max-w-[210mm] space-y-1">
        <p className="text-body3 text-content-faint">{t("downloadHint")}</p>
        <p className="text-body3 text-content-faint">
          {t("shareHint")} <span className="break-all">{publicDocumentUrl(origin, reference)}</span>
        </p>
      </div>
    </main>
  )
}

/**
 * El origen desde el que se está mirando.
 *
 * Sale de los encabezados de la petición y no de la configuración: la aplicación se sirve por su
 * propio dominio en producción y por `localhost` aquí, y el enlace que se copia tiene que ser el
 * que abre quien lo recibe.
 */
function originOf(incoming: Headers): string {
  const host = incoming.get("host") ?? "localhost:3000"
  const protocol =
    incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${protocol}://${host}`
}
