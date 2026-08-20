import type { DeliveryNoteDocument } from "@tfv/contracts/document"
import { documentStamp } from "@tfv/contracts/document"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { DeliveryNoteSheet } from "~/components/documents/delivery-note-sheet.tsx"
import { DocumentActions } from "~/components/documents/document-actions.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { publicDocumentUrl } from "~/lib/document.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("documents.deliveryNoteDocument") }
}

/**
 * El documento de una nota de entrega, desde el panel.
 *
 * Cierra `HALLAZGOS.md` **H-201**. El servidor componía esta hoja y firmaba su enlace desde la
 * rebanada 22 —probado de extremo a extremo—, y no existía la pantalla: la ficha de la nota no ponía
 * el enlace para no mandar a un `404`. Ahora lo pone.
 *
 * Misma forma que la del plan de trabajo y la del presupuesto: lo que se ve es la hoja, y alrededor
 * sólo lo que no se imprime.
 */
export default async function DeliveryNoteDocumentPage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; deliveryId: string }>
}) {
  const t = await getTranslations("documents")
  const { companyId, productionId, deliveryId } = await params

  const incoming = await headers()
  const path =
    incoming.get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/deliveries/${deliveryId}/document`

  const profile = await requireProfile(path)
  requireCompany(profile, companyId)

  const result = await apiGet<{ document: DeliveryNoteDocument; reference: string }>(
    `/companies/${companyId}/productions/${productionId}/deliveries/${deliveryId}/document`,
  )

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
          href={`/c/${companyId}/productions/${productionId}/deliveries/${deliveryId}`}
          className="inline-flex items-center gap-1.5 rounded-xs text-body2 text-content-muted hover:text-content"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("backToDeliveryNote")}
        </Link>

        <DocumentActions
          label={t("deliveryNote")}
          reference={document.identity.name}
          shareUrl={publicDocumentUrl(origin, reference)}
        />
      </div>

      <DeliveryNoteSheet
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

/** El origen desde el que se está mirando: el enlace que se copia tiene que ser el que abre quien lo recibe. */
function originOf(incoming: Headers): string {
  const host = incoming.get("host") ?? "localhost:3000"
  const protocol =
    incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${protocol}://${host}`
}
