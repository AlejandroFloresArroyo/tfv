import { Callout, ItemCard } from "@tfv/ui"
import { ExternalLink, FileText } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { ProductionRow, ScriptRow } from "../../production.ts"
import { ProductionNav } from "../production-nav.tsx"
import { CreateScript, ScriptActions } from "./script-actions.tsx"
import { SyncStatusBadge } from "./script-badges.tsx"
import { ScriptNav } from "./script-nav.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.script.scripts") }
}

/**
 * Los guiones de una producción: su archivo, y el estado de su extracción.
 *
 * ## Qué es «extracción» aquí, y qué no
 *
 * La extracción por inteligencia artificial es `script-ai-sync`, la rebanada 21, y **no existe
 * todavía**. Esta pantalla no la construye: enseña lo que el modelo ya tiene hoy —el archivo, y si
 * `syncStatus` está vigente o volvió a `not_extracted` porque el archivo se sustituyó—. Es el hueco
 * a propósito que pide el encargo: un estado con su nombre al lado, no una función a medias ni un
 * error.
 *
 * ## En tarjetas y no en tabla
 *
 * Un guion no se compara por importe como un ancla; se reconoce por nombre y se abre por su
 * archivo. La comparación en columna que exige una tabla no es el trabajo que se hace aquí.
 */
export default async function ProductionScriptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; productionId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId, productionId } = await params
  const query = toSearchParams(await searchParams)

  const path =
    (await headers()).get("x-pathname") ?? `/c/${companyId}/productions/${productionId}/script`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewProductions = can(company, "productions.productions.view")
  const canViewChapters = can(company, "productions.chapters.view")
  const canCreate = can(company, "productions.pdfs.create")
  const canEdit = can(company, "productions.pdfs.edit")
  const canDelete = can(company, "productions.pdfs.delete")

  const [productionResult, scriptsResult] = await Promise.all([
    canViewProductions
      ? apiGet<ProductionRow>(`/companies/${companyId}/productions/${productionId}`)
      : Promise.resolve(null),
    apiGet<PageEnvelope<ScriptRow>>(
      `/companies/${companyId}/productions/${productionId}/scripts?${toApiQuery(query)}`,
    ),
  ])

  const create = canCreate ? (
    <CreateScript companyId={companyId} productionId={productionId} />
  ) : undefined

  return (
    <PageShell
      title={t("productions.script.scripts")}
      {...(productionResult?.ok ? { subtitle: productionResult.data.name } : {})}
      actions={create}
    >
      <ProductionNav
        companyId={companyId}
        productionId={productionId}
        canViewProductions={canViewProductions}
        canViewCategories={can(company, "productions.categories.view")}
        canViewItems={can(company, "productions.products.view")}
        canViewDeliveries={can(company, "productions.deliveries.view")}
        canViewWorkflows={can(company, "productions.workflows.view")}
        canViewBudget={can(company, "productions.budgets.view")}
        canViewAnchors={can(company, "productions.anchors.view")}
        canViewShoppings={can(company, "productions.shoppings.view")}
        canViewScript={canViewChapters}
        canViewRodaje={can(company, "productions.recordings.view")}
      />
      <ScriptNav
        companyId={companyId}
        productionId={productionId}
        canViewScripts={can(company, "productions.pdfs.view")}
        canViewChapters={canViewChapters}
      />

      <Callout tone="info" className="mb-5">
        {t("productions.script.extractionHint")}
      </Callout>

      <Collection
        params={query}
        result={scriptsResult}
        searchPlaceholder={t("productions.script.searchPlaceholder")}
        emptyTitle={t("productions.script.empty")}
        emptyBody={t("productions.script.emptyBody")}
        {...(create === undefined ? {} : { emptyAction: create })}
      >
        {(items, view) =>
          items.map((script) => (
            <ItemCard
              key={script.id}
              view={view}
              media={
                <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <FileText className="size-4" aria-hidden="true" />
                </span>
              }
              title={script.name}
              subtitle={[
                script.documentFileName ?? t("productions.script.noDocument"),
                script.responsibleName ?? t("productions.script.noResponsible"),
              ].join(" · ")}
              meta={
                <>
                  <SyncStatusBadge status={script.syncStatus} />
                  {script.chapterCount > 0 ? (
                    <span className="text-body3 text-content-faint">
                      {t("productions.script.chapters", { count: script.chapterCount })}
                    </span>
                  ) : null}
                  {script.scenesWithoutBody > 0 ? (
                    <span className="text-body3 text-content-faint">
                      {t("productions.script.scenesWithoutBody", {
                        count: script.scenesWithoutBody,
                      })}
                    </span>
                  ) : null}
                  {script.syncedAt !== null ? (
                    <span className="text-body3 text-content-faint">
                      {t("productions.script.syncedAt", {
                        date: format.dateTime(new Date(script.syncedAt), { dateStyle: "medium" }),
                      })}
                    </span>
                  ) : null}
                  {script.documentUrl !== null ? (
                    <a
                      href={script.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-body3 text-content underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      {t("productions.script.viewDocument")}
                    </a>
                  ) : null}
                </>
              }
              actions={
                <ScriptActions
                  companyId={companyId}
                  productionId={productionId}
                  script={script}
                  canEdit={canEdit}
                  canDelete={canDelete}
                />
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
