import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { ItemsEnvelope, StorageRow, WarehouseRow } from "../../warehouse.ts"
import { WarehouseNav } from "../warehouse-nav.tsx"
import { StorageBrowser } from "./storage-browser.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.storages.title") }
}

export default async function StoragesPage({
  params,
}: {
  params: Promise<{ companyId: string; warehouseId: string }>
}) {
  const t = await getTranslations()
  const { companyId, warehouseId } = await params
  const path =
    (await headers()).get("x-pathname") ?? `/c/${companyId}/warehouses/${warehouseId}/storages`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)
  const canViewWarehouses = can(company, "warehouses.warehouses.view")
  const canViewStorages = can(company, "warehouses.storages.view")
  const [warehouseResult, rootsResult] = await Promise.all([
    canViewWarehouses
      ? apiGet<WarehouseRow>(`/companies/${companyId}/warehouses/${warehouseId}`)
      : Promise.resolve(null),
    apiGet<ItemsEnvelope<StorageRow>>(`/companies/${companyId}/warehouses/${warehouseId}/storages`),
  ])

  return (
    <PageShell
      title={t("warehouses.storages.title")}
      {...(warehouseResult?.ok
        ? {
            subtitle: t("warehouses.storages.subtitle", {
              warehouse: warehouseResult.data.name,
            }),
          }
        : {})}
    >
      <WarehouseNav
        companyId={companyId}
        warehouseId={warehouseId}
        canViewWarehouses={canViewWarehouses}
        canViewProducts={can(company, "warehouses.products.view")}
        canViewCategories={can(company, "warehouses.categories.view")}
        canViewStorages={canViewStorages}
        canViewQuotes={can(company, "warehouses.quotes.view")}
        canViewOrders={can(company, "warehouses.orders.view")}
        canViewPrices={can(company, "warehouses.prices.view")}
      />
      {rootsResult.ok ? (
        <StorageBrowser
          companyId={companyId}
          warehouseId={warehouseId}
          roots={rootsResult.data.items}
          canCreate={can(company, "warehouses.storages.create")}
          canEdit={can(company, "warehouses.storages.edit")}
          canDelete={can(company, "warehouses.storages.delete")}
        />
      ) : (
        <ApiFailure result={rootsResult} />
      )}
    </PageShell>
  )
}
