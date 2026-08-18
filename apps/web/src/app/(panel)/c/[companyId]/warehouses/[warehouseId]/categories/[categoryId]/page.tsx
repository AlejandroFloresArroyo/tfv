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
import type { ProductRow, WarehouseRow } from "../../../warehouse.ts"
import { WarehouseNav } from "../../warehouse-nav.tsx"
import { CategoryBrowser } from "../category-browser.tsx"
import { CATEGORY_NOT_FOUND, loadCategoryLevels } from "../category-data.ts"

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; warehouseId: string; categoryId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const { companyId, warehouseId, categoryId } = await params
  const query = toSearchParams(await searchParams)
  const productQuery = new URLSearchParams(query)
  productQuery.set("categoryId", categoryId)
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/warehouses/${warehouseId}/categories/${categoryId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)
  const canViewWarehouses = can(company, "warehouses.warehouses.view")
  const canViewProducts = can(company, "warehouses.products.view")

  const [warehouseResult, levels, productsResult] = await Promise.all([
    canViewWarehouses
      ? apiGet<WarehouseRow>(`/companies/${companyId}/warehouses/${warehouseId}`)
      : Promise.resolve(null),
    loadCategoryLevels(companyId, warehouseId, categoryId),
    canViewProducts
      ? apiGet<PageEnvelope<ProductRow>>(
          `/companies/${companyId}/warehouses/${warehouseId}/products?${toApiQuery(productQuery)}`,
        )
      : Promise.resolve(null),
  ])

  const nav = (
    <WarehouseNav
      companyId={companyId}
      warehouseId={warehouseId}
      canViewWarehouses={canViewWarehouses}
      canViewProducts={canViewProducts}
      canViewCategories={can(company, "warehouses.categories.view")}
      canViewStorages={can(company, "warehouses.storages.view")}
      canViewQuotes={can(company, "warehouses.quotes.view")}
      canViewOrders={can(company, "warehouses.orders.view")}
      canViewPrices={can(company, "warehouses.prices.view")}
    />
  )

  // Sin camino, la categoría no está en este almacén: `loadCategoryLevels` lo devuelve ya como el
  // `404` que la pantalla de ubicaciones recibe de su API. Un árbol vacío diría otra cosa.
  const selected = levels.path.at(-1)

  if (levels.failure || !selected) {
    return (
      <PageShell title={t("warehouses.categories.title")}>
        {nav}
        <ApiFailure result={levels.failure ?? CATEGORY_NOT_FOUND} />
      </PageShell>
    )
  }

  return (
    <PageShell
      title={selected.name}
      {...(warehouseResult?.ok
        ? {
            subtitle: t("warehouses.categories.subtitle", { warehouse: warehouseResult.data.name }),
          }
        : {})}
    >
      {nav}

      <CategoryBrowser
        companyId={companyId}
        warehouseId={warehouseId}
        roots={levels.roots}
        path={levels.path}
        directChildren={levels.children}
        canCreate={can(company, "warehouses.categories.create")}
        canEdit={can(company, "warehouses.categories.edit")}
        canDelete={can(company, "warehouses.categories.delete")}
        canCountProducts={canViewProducts}
      />

      {productsResult ? (
        <section aria-labelledby="category-products-heading" className="mt-7">
          <h2 id="category-products-heading" className="mb-1 text-title2 font-bold text-content">
            {t("warehouses.categories.classified")}
          </h2>
          {/* La regla que hace útil el árbol: filtrar por una categoría alcanza a sus
              descendientes. Dicho aquí, porque el recuento no cuadra con el de la ficha si no. */}
          <p className="mb-3 text-body3 text-content-faint">
            {t("warehouses.categories.classifiedHint")}
          </p>
          <Collection
            params={query}
            result={productsResult}
            searchPlaceholder={t("warehouses.products.searchPlaceholder")}
            emptyTitle={t("warehouses.categories.noProducts")}
            emptyBody={t("warehouses.categories.noProductsBody")}
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
