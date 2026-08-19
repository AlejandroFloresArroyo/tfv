import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { WarehouseRow } from "../../warehouse.ts"
import { canViewPanel } from "../panel/access.ts"
import { WarehouseNav } from "../warehouse-nav.tsx"
import { CategoryBrowser } from "./category-browser.tsx"
import { loadCategoryLevels } from "./category-data.ts"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.categories.title") }
}

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ companyId: string; warehouseId: string }>
}) {
  const t = await getTranslations()
  const { companyId, warehouseId } = await params
  const path =
    (await headers()).get("x-pathname") ?? `/c/${companyId}/warehouses/${warehouseId}/categories`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)
  const canViewWarehouses = can(company, "warehouses.warehouses.view")
  const canViewProducts = can(company, "warehouses.products.view")

  const [warehouseResult, levels] = await Promise.all([
    canViewWarehouses
      ? apiGet<WarehouseRow>(`/companies/${companyId}/warehouses/${warehouseId}`)
      : Promise.resolve(null),
    loadCategoryLevels(companyId, warehouseId),
  ])

  return (
    <PageShell
      title={t("warehouses.categories.title")}
      {...(warehouseResult?.ok
        ? {
            subtitle: t("warehouses.categories.subtitle", { warehouse: warehouseResult.data.name }),
          }
        : {})}
    >
      <WarehouseNav
        companyId={companyId}
        warehouseId={warehouseId}
        canViewPanel={canViewPanel(company)}
        canViewWarehouses={canViewWarehouses}
        canViewProducts={canViewProducts}
        canViewCategories={can(company, "warehouses.categories.view")}
        canViewStorages={can(company, "warehouses.storages.view")}
        canViewQuotes={can(company, "warehouses.quotes.view")}
        canViewOrders={can(company, "warehouses.orders.view")}
        canViewPrices={can(company, "warehouses.prices.view")}
      />

      {levels.failure ? (
        <ApiFailure result={levels.failure} />
      ) : (
        <CategoryBrowser
          companyId={companyId}
          warehouseId={warehouseId}
          roots={levels.roots}
          canCreate={can(company, "warehouses.categories.create")}
          canEdit={can(company, "warehouses.categories.edit")}
          canDelete={can(company, "warehouses.categories.delete")}
          canCountProducts={canViewProducts}
        />
      )}
    </PageShell>
  )
}
