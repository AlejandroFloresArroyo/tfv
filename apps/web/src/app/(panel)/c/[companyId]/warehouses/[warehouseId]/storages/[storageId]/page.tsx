import { Badge, ItemCard } from "@tfv/ui"
import { Box } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { ItemsEnvelope, ProductRow, StorageRow, WarehouseRow } from "../../../warehouse.ts"
import { WarehouseNav } from "../../warehouse-nav.tsx"
import { StorageBrowser } from "../storage-browser.tsx"

export default async function StoragePage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; warehouseId: string; storageId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const { companyId, warehouseId, storageId } = await params
  const query = toSearchParams(await searchParams)
  const productQuery = new URLSearchParams(query)
  productQuery.set("storageId", storageId)
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/warehouses/${warehouseId}/storages/${storageId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)
  const canViewWarehouses = can(company, "warehouses.warehouses.view")
  const canViewStorages = can(company, "warehouses.storages.view")
  const canViewProducts = can(company, "warehouses.products.view")

  const [warehouseResult, rootsResult, pathResult, childrenResult, productsResult] =
    await Promise.all([
      canViewWarehouses
        ? apiGet<WarehouseRow>(`/companies/${companyId}/warehouses/${warehouseId}`)
        : Promise.resolve(null),
      apiGet<ItemsEnvelope<StorageRow>>(
        `/companies/${companyId}/warehouses/${warehouseId}/storages`,
      ),
      apiGet<ItemsEnvelope<StorageRow>>(
        `/companies/${companyId}/warehouses/${warehouseId}/storages/${storageId}/path`,
      ),
      apiGet<ItemsEnvelope<StorageRow>>(
        `/companies/${companyId}/warehouses/${warehouseId}/storages?parentId=${encodeURIComponent(storageId)}`,
      ),
      canViewProducts
        ? apiGet<PageEnvelope<ProductRow>>(
            `/companies/${companyId}/warehouses/${warehouseId}/products?${toApiQuery(productQuery)}`,
          )
        : Promise.resolve(null),
    ])

  const failed = [rootsResult, pathResult, childrenResult].find((result) => !result.ok)
  if (failed && !failed.ok) {
    return (
      <PageShell title={t("warehouses.storages.title")}>
        <WarehouseNav
          companyId={companyId}
          warehouseId={warehouseId}
          canViewWarehouses={canViewWarehouses}
          canViewProducts={canViewProducts}
          canViewCategories={can(company, "warehouses.categories.view")}
          canViewStorages={canViewStorages}
          canViewQuotes={can(company, "warehouses.quotes.view")}
          canViewOrders={can(company, "warehouses.orders.view")}
        />
        <ApiFailure result={failed} />
      </PageShell>
    )
  }

  if (!rootsResult.ok || !pathResult.ok || !childrenResult.ok) return null
  const selected = pathResult.data.items.at(-1)

  return (
    <PageShell
      title={selected?.name ?? t("warehouses.storages.title")}
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
        canViewProducts={canViewProducts}
        canViewCategories={can(company, "warehouses.categories.view")}
        canViewStorages={canViewStorages}
        canViewQuotes={can(company, "warehouses.quotes.view")}
        canViewOrders={can(company, "warehouses.orders.view")}
      />

      <StorageBrowser
        companyId={companyId}
        warehouseId={warehouseId}
        roots={rootsResult.data.items}
        path={pathResult.data.items}
        directChildren={childrenResult.data.items}
        canCreate={can(company, "warehouses.storages.create")}
        canEdit={can(company, "warehouses.storages.edit")}
        canDelete={can(company, "warehouses.storages.delete")}
      />

      {productsResult ? (
        <section aria-labelledby="storage-products-heading" className="mt-7">
          <h2 id="storage-products-heading" className="mb-3 text-title2 font-bold text-content">
            {t("warehouses.storages.directProducts")}
          </h2>
          <Collection
            params={query}
            result={productsResult}
            searchPlaceholder={t("warehouses.products.searchPlaceholder")}
            emptyTitle={t("warehouses.storages.noProducts")}
            emptyBody={t("warehouses.storages.noProductsBody")}
            defaultView="grid"
          >
            {(items, view) =>
              items.map((product) => (
                <ItemCard
                  key={product.id}
                  view={view}
                  media={
                    <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                      <Box className="size-4" aria-hidden="true" />
                    </span>
                  }
                  title={
                    <Link
                      href={`/c/${companyId}/warehouses/${warehouseId}/products/${product.id}`}
                      className="rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-focus/40"
                    >
                      {product.name}
                    </Link>
                  }
                  subtitle={product.code}
                  meta={
                    product.availableForRent ? (
                      <Badge tone="accent">{t("warehouses.rent")}</Badge>
                    ) : undefined
                  }
                />
              ))
            }
          </Collection>
        </section>
      ) : null}
    </PageShell>
  )
}
