import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { ItemsEnvelope, ProductionRow, ScriptRow } from "../../../../production.ts"
import { ProductionNav } from "../../../production-nav.tsx"
import { ScriptNav } from "../../script-nav.tsx"
import { ChapterSceneBrowser } from "../chapter-scene-browser.tsx"
import { loadBreakdownLevels } from "../chapter-scene-loader.ts"

/**
 * Un capítulo o una escena concretos del árbol, situados: es lo que hace que se puedan compartir
 * por enlace. `nodeId` es uno de los dos porque `resolveBreakdownLevels` no distingue por la forma
 * del identificador — lo busca primero entre los capítulos y, si no está, entre las escenas de cada
 * uno —, igual que la pantalla de una categoría concreta no distingue por profundidad.
 */
export default async function ProductionChapterOrScenePage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; nodeId: string }>
}) {
  const t = await getTranslations()
  const { companyId, productionId, nodeId } = await params
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/script/chapters/${nodeId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewProductions = can(company, "productions.productions.view")
  const canViewChapters = can(company, "productions.chapters.view")
  const canViewScripts = can(company, "productions.pdfs.view")

  const [productionResult, levels, scriptsResult] = await Promise.all([
    canViewProductions
      ? apiGet<ProductionRow>(`/companies/${companyId}/productions/${productionId}`)
      : Promise.resolve(null),
    loadBreakdownLevels(companyId, productionId, nodeId),
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

  const selected = levels.path.at(-1)

  if (levels.failure || !selected) {
    return (
      <PageShell title={t("productions.chapters.title")}>
        {nav}
        <ApiFailure
          result={
            levels.failure ?? {
              ok: false,
              status: 404,
              message: t("productions.chapters.notFound"),
            }
          }
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title={selected.kind === "scene" ? selected.label : selected.name}
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
        path={levels.path}
        childNodes={levels.children}
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
