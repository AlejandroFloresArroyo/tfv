import { documentStamp } from "@tfv/contracts/document"
import type { WorkPlanDocument } from "@tfv/contracts/work-plan"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { DocumentActions } from "~/components/documents/document-actions.tsx"
import { WorkPlanSheet } from "~/components/documents/work-plan-sheet.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { publicDocumentUrl } from "~/lib/document.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("documents.workPlanDocument") }
}

/**
 * El documento de un plan de trabajo, desde el panel.
 *
 * Misma forma que la del documento de una cotización, y a propósito: lo que se ve **es** la hoja, y
 * alrededor sólo hay lo que no se imprime —la vuelta al plan, las acciones y el enlace público—.
 * Que las dos familias se miren igual es lo que hace que quien ya imprimió una cotización sepa
 * imprimir un plan sin que nadie se lo explique.
 */
export default async function WorkPlanDocumentPage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; workflowId: string }>
}) {
  const t = await getTranslations("documents")
  const { companyId, productionId, workflowId } = await params

  const incoming = await headers()
  const path =
    incoming.get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/workflows/${workflowId}/document`

  const profile = await requireProfile(path)
  requireCompany(profile, companyId)

  const result = await apiGet<{ document: WorkPlanDocument; reference: string }>(
    `/companies/${companyId}/productions/${productionId}/workflows/${workflowId}/document`,
  )

  const back = `/c/${companyId}/productions/${productionId}/workflows/${workflowId}`

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
          {t("backToWorkPlan")}
        </Link>

        <DocumentActions
          label={t("workPlan")}
          reference={document.identity.code}
          shareUrl={publicDocumentUrl(origin, reference)}
        />
      </div>

      <WorkPlanSheet
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
