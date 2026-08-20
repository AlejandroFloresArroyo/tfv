import type { BudgetDocument } from "@tfv/contracts/budget"
import { documentStamp } from "@tfv/contracts/document"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { BudgetSheet } from "~/components/documents/budget-sheet.tsx"
import { DocumentActions } from "~/components/documents/document-actions.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { publicDocumentUrl } from "~/lib/document.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("documents.budgetDocument") }
}

/**
 * El documento del presupuesto, desde el panel.
 *
 * Misma forma que la del plan de trabajo y la de la cotización, y a propósito: lo que se ve **es**
 * la hoja, y alrededor sólo hay lo que no se imprime —la vuelta al presupuesto, las acciones y el
 * enlace público—. Que las familias se miren igual es lo que hace que quien ya imprimió una sepa
 * imprimir las demás sin que nadie se lo explique.
 *
 * La hoja **no lleva los filtros** de la pantalla anterior. Quien recibe el enlace no ve la barra de
 * filtros ni sabe cuál se aplicó, y unos totales que dependen de un parámetro invisible son unos
 * totales de los que no se puede uno fiar. Se imprime la producción entera.
 */
export default async function BudgetDocumentPage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string }>
}) {
  const t = await getTranslations("documents")
  const { companyId, productionId } = await params

  const incoming = await headers()
  const path =
    incoming.get("x-pathname") ?? `/c/${companyId}/productions/${productionId}/budget/document`

  const profile = await requireProfile(path)
  requireCompany(profile, companyId)

  const result = await apiGet<{ document: BudgetDocument; reference: string }>(
    `/companies/${companyId}/productions/${productionId}/budget/document`,
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
          href={`/c/${companyId}/productions/${productionId}/budget`}
          className="inline-flex items-center gap-1.5 rounded-xs text-body2 text-content-muted hover:text-content"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("backToBudget")}
        </Link>

        <DocumentActions
          label={t("budget")}
          reference={document.production.name}
          shareUrl={publicDocumentUrl(origin, reference)}
        />
      </div>

      <BudgetSheet
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
