import type { BudgetDocument } from "@tfv/contracts/budget"
import {
  type DeliveryNoteDocument,
  documentStamp,
  type QuoteDocument,
} from "@tfv/contracts/document"
import type { WorkPlanDocument } from "@tfv/contracts/work-plan"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { BudgetSheet } from "~/components/documents/budget-sheet.tsx"
import { DeliveryNoteSheet } from "~/components/documents/delivery-note-sheet.tsx"
import { DocumentActions } from "~/components/documents/document-actions.tsx"
import { QuoteSheet } from "~/components/documents/quote-sheet.tsx"
import { WorkPlanSheet } from "~/components/documents/work-plan-sheet.tsx"
import { Logo } from "~/components/logo.tsx"
import { apiGet } from "~/lib/api.server.ts"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("documents.quoteDocument") }
}

/** Las cuatro familias que hoy se sirven por enlace público, discriminadas por `kind`. */
type PublicDocument = QuoteDocument | WorkPlanDocument | DeliveryNoteDocument | BudgetDocument

/**
 * El documento por su enlace público.
 *
 * Ver `openspec/specs/pdf-documents/spec.md`, requisito «Enlace público de sólo lectura».
 *
 * **La única pantalla de esta aplicación que se sirve sin sesión y con datos de una empresa.** Por
 * eso no tiene nada alrededor: ni navegación, ni selector de empresa, ni menú de usuario. Quien
 * abre el enlace ve la hoja, la imprime o la guarda, y nada más — que es literalmente lo que la
 * spec pide con «no ve navegación ni datos de la empresa ajenos al documento».
 *
 * No se pide sesión ni se redirige a entrar: quien recibe el enlace **no tiene cuenta**, y mandarle
 * a un formulario de acceso es la forma de que la cotización acabe pidiéndose por teléfono.
 */
export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ reference: string }>
}) {
  const t = await getTranslations("documents")
  const { reference } = await params

  /**
   * Lo que llega puede ser de **cualquier familia**, y `kind` es lo que lo dice.
   *
   * Se discrimina por ese campo y no por la forma: adivinar por la forma es como una cotización
   * acaba dibujada con la plantilla de un plan el día que las dos coinciden en un par de campos.
   */
  const result = await apiGet<{ document: PublicDocument }>(`/public/documents/${reference}`)

  if (!result.ok) {
    // Un enlace roto no es un error del sistema: es un enlace que ya no lleva a ninguna parte, y a
    // quien lo abrió hay que decírselo sin ofrecerle el panel al que no puede entrar.
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-5 text-center">
        <Logo />
        <p className="text-h5 font-bold text-content">{t("linkGone")}</p>
        <p className="max-w-prose text-body1 text-content-muted">{t("linkGoneBody")}</p>
      </main>
    )
  }

  const { document } = result.data
  const incoming = await headers()
  const host = incoming.get("host") ?? "localhost:3000"
  const protocol =
    incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  const address = `${protocol}://${host}/d/${reference}`
  const stamp = documentStamp("TFV", address, new Date())

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 tablet:px-6 tablet:py-8">
      <div className="documento-fuera-de-la-hoja mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <Logo />
        <DocumentActions label={labelOf(document, t)} reference={referenceOf(document)} />
      </div>

      {/* Un caso por familia, con el mismo reparto que el `switch` del servidor: la unión se lee
          entera y se ve exactamente qué se sabe dibujar. */}
      {document.kind === "work-plan" ? (
        <WorkPlanSheet document={document} stamp={stamp} />
      ) : document.kind === "delivery-note" ? (
        <DeliveryNoteSheet document={document} stamp={stamp} />
      ) : document.kind === "budget" ? (
        <BudgetSheet document={document} stamp={stamp} />
      ) : (
        <QuoteSheet document={document} stamp={stamp} />
      )}

      <p className="documento-fuera-de-la-hoja mx-auto mt-3 max-w-[210mm] text-body3 text-content-faint">
        {t("downloadHint")}
      </p>
    </main>
  )
}

/** Cómo se llama el documento en el nombre del archivo descargado. */
function labelOf(document: PublicDocument, t: (key: string) => string): string {
  switch (document.kind) {
    case "work-plan":
      return t("workPlan")
    case "delivery-note":
      return t("deliveryNote")
    case "budget":
      return t("budget")
    default:
      return t("quote")
  }
}

/**
 * Qué identifica a este documento entre los de su familia.
 *
 * El presupuesto no tiene folio ni código —no es una entidad— así que lo identifica **la
 * producción**, que es de lo que es el presupuesto.
 */
function referenceOf(document: PublicDocument): string {
  switch (document.kind) {
    case "work-plan":
      return document.identity.code
    case "delivery-note":
      return document.identity.name
    case "budget":
      return document.production.name
    default:
      return document.identity.folio
  }
}
