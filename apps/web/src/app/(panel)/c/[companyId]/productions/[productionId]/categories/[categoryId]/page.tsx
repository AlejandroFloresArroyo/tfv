import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import type { PageEnvelope } from "~/components/collection/collection.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { ProductionRow, RoleRow } from "../../../production.ts"
import { ProductionNav } from "../../production-nav.tsx"
import { CategoryBrowser } from "../category-browser.tsx"
import { CATEGORY_NOT_FOUND, loadCategoryLevels } from "../category-data.ts"

/**
 * Una categoría concreta del árbol de la producción.
 *
 * La misma pantalla que la del nivel principal, situada: es lo que hace que un departamento se
 * pueda compartir por enlace. Lo clasificado —artículos, tareas, videos— no se lista todavía: son
 * de las rebanadas 21 y 22, y hasta que existan sus pantallas un listado aquí no llevaría a
 * ninguna parte. El recuento sí se enseña al borrar, que es donde importa.
 */
export default async function ProductionCategoryPage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; categoryId: string }>
}) {
  const t = await getTranslations()
  const { companyId, productionId, categoryId } = await params
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/categories/${categoryId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewProductions = can(company, "productions.productions.view")
  const canViewRoles = can(company, "companies.roles.view")

  const [productionResult, rolesResult, levels] = await Promise.all([
    canViewProductions
      ? apiGet<ProductionRow>(`/companies/${companyId}/productions/${productionId}`)
      : Promise.resolve(null),
    canViewRoles
      ? apiGet<PageEnvelope<RoleRow>>(`/companies/${companyId}/roles?limit=96`)
      : Promise.resolve(null),
    loadCategoryLevels(companyId, productionId, categoryId),
  ])

  const nav = (
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
  )

  // Sin camino, la categoría no está en esta producción. Un árbol vacío diría otra cosa.
  const selected = levels.path.at(-1)

  if (levels.failure || !selected) {
    return (
      <PageShell title={t("productions.categories.title")}>
        {nav}
        <ApiFailure result={levels.failure ?? CATEGORY_NOT_FOUND} />
      </PageShell>
    )
  }

  return (
    <PageShell
      title={selected.name}
      {...(productionResult?.ok
        ? {
            subtitle: t("productions.categories.subtitle", {
              production: productionResult.data.name,
            }),
          }
        : {})}
    >
      {nav}

      <CategoryBrowser
        companyId={companyId}
        productionId={productionId}
        roots={levels.roots}
        path={levels.path}
        directChildren={levels.children}
        roles={rolesResult?.ok ? rolesResult.data.items : []}
        canCreate={can(company, "productions.categories.create")}
        canEdit={can(company, "productions.categories.edit")}
        canDelete={can(company, "productions.categories.delete")}
      />
    </PageShell>
  )
}
