import { Badge, ItemCard } from "@tfv/ui"
import { Tags } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { PriceListRow, WarehouseRow } from "../../warehouse.ts"
import { canViewPanel } from "../panel/access.ts"
import { WarehouseNav } from "../warehouse-nav.tsx"
import { CreatePriceList, PriceListActions } from "./price-list-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.priceLists.title") }
}

/**
 * Las listas de precios de un almacén.
 *
 * Rebanada 29b. Ver `openspec/specs/warehouse-catalog/spec.md`, «Listas de precios por almacén».
 *
 * ## El recuento va delante
 *
 * Cada lista enseña **cuántos productos tienen tarifa en ella**, que es el dato que el servicio ya
 * devuelve y el único que distingue una lista viva de una recién creada. Sin él, dos listas con
 * nombres parecidos son indistinguibles hasta abrirlas, y una de ellas puede ser la que gobierna
 * lo que se está cotizando hoy.
 *
 * Es además lo que la confirmación de baja necesita para decir qué se lleva por delante: eliminar
 * una lista **no borra los productos**, borra el precio que les daba.
 */
export default async function PriceListsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; warehouseId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const { companyId, warehouseId } = await params
  const query = toSearchParams(await searchParams)
  const path =
    (await headers()).get("x-pathname") ?? `/c/${companyId}/warehouses/${warehouseId}/price-lists`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewWarehouses = can(company, "warehouses.warehouses.view")
  const canCreate = can(company, "warehouses.prices.create")
  const canEdit = can(company, "warehouses.prices.edit")
  const canDelete = can(company, "warehouses.prices.delete")
  const base = `/c/${companyId}/warehouses/${warehouseId}`

  const [warehouseResult, listsResult] = await Promise.all([
    canViewWarehouses
      ? apiGet<WarehouseRow>(`/companies/${companyId}/warehouses/${warehouseId}`)
      : Promise.resolve(null),
    apiGet<PageEnvelope<PriceListRow>>(
      `/companies/${companyId}/warehouses/${warehouseId}/price-lists?${toApiQuery(query)}`,
    ),
  ])

  return (
    <PageShell
      title={t("warehouses.priceLists.title")}
      {...(warehouseResult?.ok
        ? {
            subtitle: t("warehouses.priceLists.subtitle", { warehouse: warehouseResult.data.name }),
          }
        : {})}
      actions={
        canCreate ? <CreatePriceList companyId={companyId} warehouseId={warehouseId} /> : undefined
      }
    >
      <WarehouseNav
        companyId={companyId}
        warehouseId={warehouseId}
        canViewPanel={canViewPanel(company)}
        canViewWarehouses={canViewWarehouses}
        canViewProducts={can(company, "warehouses.products.view")}
        canViewCategories={can(company, "warehouses.categories.view")}
        canViewStorages={can(company, "warehouses.storages.view")}
        canViewQuotes={can(company, "warehouses.quotes.view")}
        canViewOrders={can(company, "warehouses.orders.view")}
        canViewPrices={can(company, "warehouses.prices.view")}
      />

      <Collection
        params={query}
        result={listsResult}
        searchPlaceholder={t("warehouses.priceLists.searchPlaceholder")}
        emptyTitle={t("warehouses.priceLists.empty")}
        emptyBody={t("warehouses.priceLists.emptyBody")}
      >
        {(items, view) =>
          items.map((list) => (
            <ItemCard
              key={list.id}
              view={view}
              media={
                <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <Tags className="size-4" aria-hidden="true" />
                </span>
              }
              title={
                <Link
                  href={`${base}/price-lists/${list.id}`}
                  className="rounded-xs hover:underline"
                >
                  {list.name}
                </Link>
              }
              subtitle={list.description}
              meta={
                <Badge tone={list.productCount > 0 ? "accent" : "neutral"}>
                  {t("warehouses.priceLists.priced", { count: list.productCount })}
                </Badge>
              }
              actions={
                <PriceListActions
                  companyId={companyId}
                  warehouseId={warehouseId}
                  list={list}
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
