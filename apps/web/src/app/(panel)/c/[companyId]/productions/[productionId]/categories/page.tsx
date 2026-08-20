import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import type { PageEnvelope } from "~/components/collection/collection.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { ProductionRow, RoleRow } from "../../production.ts"
import { ProductionNav } from "../production-nav.tsx"
import { CategoryBrowser } from "./category-browser.tsx"
import { loadCategoryLevels } from "./category-data.ts"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.categories.title") }
}

export default async function ProductionCategoriesPage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string }>
}) {
  const t = await getTranslations()
  const { companyId, productionId } = await params
  const path =
    (await headers()).get("x-pathname") ?? `/c/${companyId}/productions/${productionId}/categories`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewProductions = can(company, "productions.productions.view")
  // Sin la clave de roles el desplegable de equipo no se ofrece: pedirlos devolvería `403` y
  // enseñar la lista vacía diría que la empresa no tiene roles, que es otra cosa.
  const canViewRoles = can(company, "companies.roles.view")

  const [productionResult, rolesResult, levels] = await Promise.all([
    canViewProductions
      ? apiGet<ProductionRow>(`/companies/${companyId}/productions/${productionId}`)
      : Promise.resolve(null),
    canViewRoles
      ? apiGet<PageEnvelope<RoleRow>>(`/companies/${companyId}/roles?limit=96`)
      : Promise.resolve(null),
    loadCategoryLevels(companyId, productionId),
  ])

  return (
    <PageShell
      title={t("productions.categories.title")}
      {...(productionResult?.ok
        ? {
            subtitle: t("productions.categories.subtitle", {
              production: productionResult.data.name,
            }),
          }
        : {})}
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
      />

      {levels.failure ? (
        <ApiFailure result={levels.failure} />
      ) : (
        <CategoryBrowser
          companyId={companyId}
          productionId={productionId}
          roots={levels.roots}
          roles={rolesResult?.ok ? rolesResult.data.items : []}
          canCreate={can(company, "productions.categories.create")}
          canEdit={can(company, "productions.categories.edit")}
          canDelete={can(company, "productions.categories.delete")}
        />
      )}
    </PageShell>
  )
}
