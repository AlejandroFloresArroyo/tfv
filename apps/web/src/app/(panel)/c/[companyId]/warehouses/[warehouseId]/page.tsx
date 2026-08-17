import { Badge, ItemCard } from "@tfv/ui"
import { Box } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { CategorySummary, ItemsEnvelope, ProductRow, WarehouseRow } from "../warehouse.ts"
import { WarehouseNav } from "./warehouse-nav.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.catalog") }
}

export default async function WarehouseCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; warehouseId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const { companyId, warehouseId } = await params
  const query = toSearchParams(await searchParams)
  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/warehouses/${warehouseId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)
  const canViewWarehouses = can(company, "warehouses.warehouses.view")
  const canViewProducts = can(company, "warehouses.products.view")
  const canViewCategories = can(company, "warehouses.categories.view")
  const canViewStorages = can(company, "warehouses.storages.view")

  const [warehouseResult, productsResult, categoriesResult, globalCategoriesResult] =
    await Promise.all([
      canViewWarehouses
        ? apiGet<WarehouseRow>(`/companies/${companyId}/warehouses/${warehouseId}`)
        : Promise.resolve(null),
      apiGet<PageEnvelope<ProductRow>>(
        `/companies/${companyId}/warehouses/${warehouseId}/products?${toApiQuery(query)}`,
      ),
      canViewCategories
        ? apiGet<ItemsEnvelope<CategorySummary>>(
            `/companies/${companyId}/warehouses/${warehouseId}/categories`,
          )
        : Promise.resolve(null),
      apiGet<ItemsEnvelope<CategorySummary>>("/categories?service=warehouses"),
    ])

  const filters: FilterSpec[] = [
    {
      kind: "boolean",
      key: "isPublished",
      label: t("warehouses.published"),
      trueLabel: t("warehouses.published"),
      falseLabel: t("warehouses.unpublished"),
    },
    {
      kind: "boolean",
      key: "availableForRent",
      label: t("warehouses.rent"),
      trueLabel: t("warehouses.forRent"),
      falseLabel: t("warehouses.notForRent"),
    },
    {
      kind: "boolean",
      key: "availableForSale",
      label: t("warehouses.sale"),
      trueLabel: t("warehouses.forSale"),
      falseLabel: t("warehouses.notForSale"),
    },
    ...(categoriesResult?.ok && categoriesResult.data.items.length > 0
      ? [
          {
            kind: "select" as const,
            key: "categoryId",
            label: t("warehouses.category"),
            options: categoriesResult.data.items.map((category) => ({
              value: category.id,
              label: category.name,
            })),
          },
        ]
      : []),
    ...(globalCategoriesResult.ok && globalCategoriesResult.data.items.length > 0
      ? [
          {
            kind: "select" as const,
            key: "globalCategoryId",
            label: t("warehouses.globalCategory"),
            options: globalCategoriesResult.data.items.map((category) => ({
              value: category.id,
              label: category.name,
            })),
          },
        ]
      : []),
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("warehouses.added"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  return (
    <PageShell
      title={warehouseResult?.ok ? warehouseResult.data.name : t("warehouses.catalog")}
      subtitle={
        warehouseResult?.ok && warehouseResult.data.description
          ? warehouseResult.data.description
          : t("warehouses.catalogSubtitle")
      }
    >
      <WarehouseNav
        companyId={companyId}
        warehouseId={warehouseId}
        canViewWarehouses={canViewWarehouses}
        canViewProducts={canViewProducts}
        canViewStorages={canViewStorages}
      />

      <Collection
        params={query}
        result={productsResult}
        filters={filters}
        searchPlaceholder={t("warehouses.products.searchPlaceholder")}
        emptyTitle={t("warehouses.products.empty")}
        emptyBody={t("warehouses.products.emptyBody")}
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
                <>
                  {product.availableForRent ? (
                    <Badge tone="accent">{t("warehouses.rent")}</Badge>
                  ) : null}
                  {product.availableForSale ? (
                    <Badge tone="success">{t("warehouses.sale")}</Badge>
                  ) : null}
                  {!product.isPublished ? <Badge>{t("warehouses.unpublished")}</Badge> : null}
                </>
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
