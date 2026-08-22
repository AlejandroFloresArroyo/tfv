import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { ItemsEnvelope, ProductionRow, ScriptRow } from "../../../production.ts"
import { ProductionNav } from "../../production-nav.tsx"
import { ScriptNav } from "../script-nav.tsx"
import { ChapterSceneBrowser } from "./chapter-scene-browser.tsx"
import { loadBreakdownLevels } from "./chapter-scene-loader.ts"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.chapters.title") }
}

/**
 * El nivel principal del árbol de capítulos y escenas: sin nada elegido, sólo la columna de
 * capítulos. Ver `chapter-scene-loader.ts` para de dónde sale la estructura entera, y
 * `chapter-scene-browser.tsx` para cómo se pinta.
 */
export default async function ProductionChaptersPage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string }>
}) {
  const t = await getTranslations()
  const { companyId, productionId } = await params
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/script/chapters`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewProductions = can(company, "productions.productions.view")
  const canViewChapters = can(company, "productions.chapters.view")
  const canViewScripts = can(company, "productions.pdfs.view")

  const [productionResult, levels, scriptsResult] = await Promise.all([
    canViewProductions
      ? apiGet<ProductionRow>(`/companies/${companyId}/productions/${productionId}`)
      : Promise.resolve(null),
    loadBreakdownLevels(companyId, productionId),
    canViewScripts
      ? apiGet<ItemsEnvelope<ScriptRow>>(
          `/companies/${companyId}/productions/${productionId}/scripts?limit=96`,
        )
      : Promise.resolve(null),
  ])

  const scripts = scriptsResult?.ok ? scriptsResult.data.items : []

  const nav = (
    <>
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
        canViewScripts={canViewScripts}
        canViewChapters={canViewChapters}
      />
    </>
  )

  if (levels.failure) {
    return (
      <PageShell title={t("productions.chapters.title")}>
        {nav}
        <ApiFailure result={levels.failure} />
      </PageShell>
    )
  }

  return (
    <PageShell
      title={t("productions.chapters.title")}
      {...(productionResult?.ok
        ? {
            subtitle: t("productions.chapters.subtitle", {
              production: productionResult.data.name,
            }),
          }
        : {})}
    >
      {nav}

      <ChapterSceneBrowser
        companyId={companyId}
        productionId={productionId}
        scripts={scripts}
        roots={levels.roots}
        canCreateChapter={can(company, "productions.chapters.create")}
        canEditChapter={can(company, "productions.chapters.edit")}
        canDeleteChapter={can(company, "productions.chapters.delete")}
        canCreateScene={can(company, "productions.scenes.create")}
        canEditScene={can(company, "productions.scenes.edit")}
        canDeleteScene={can(company, "productions.scenes.delete")}
      />
    </PageShell>
  )
}
