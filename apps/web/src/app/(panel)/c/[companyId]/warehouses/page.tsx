import { Badge, ItemCard } from "@tfv/ui"
import { Warehouse } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { WarehouseRow } from "./warehouse.ts"
import { CreateWarehouse, WarehouseActions } from "./warehouse-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.title") }
}

export default async function WarehousesPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId } = await params
  const query = toSearchParams(await searchParams)
  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/warehouses`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)
  const canViewProducts = can(company, "warehouses.products.view")
  const canViewStorages = can(company, "warehouses.storages.view")
  const canCreate = can(company, "warehouses.warehouses.create")
  const canEdit = can(company, "warehouses.warehouses.edit")
  const canDelete = can(company, "warehouses.warehouses.delete")
  const result = await apiGet<PageEnvelope<WarehouseRow>>(
    `/companies/${companyId}/warehouses?${toApiQuery(query)}`,
  )

  const filters: FilterSpec[] = [
    {
      kind: "boolean",
      key: "isPublished",
      label: t("warehouses.published"),
      trueLabel: t("warehouses.published"),
      falseLabel: t("warehouses.unpublished"),
    },
  ]

  return (
    <PageShell
      title={t("warehouses.title")}
      subtitle={t("warehouses.subtitle", { company: company.name })}
      actions={canCreate ? <CreateWarehouse companyId={companyId} /> : undefined}
    >
      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("warehouses.searchPlaceholder")}
        emptyTitle={t("warehouses.empty")}
        emptyBody={t("warehouses.emptyBody")}
        emptyAction={canCreate ? <CreateWarehouse companyId={companyId} /> : undefined}
      >
        {(items, view) =>
          items.map((warehouse) => {
            const target = canViewProducts
              ? `/c/${companyId}/warehouses/${warehouse.id}`
              : canViewStorages
                ? `/c/${companyId}/warehouses/${warehouse.id}/storages`
                : null

            return (
              <ItemCard
                key={warehouse.id}
                view={view}
                media={
                  <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                    <Warehouse className="size-4" aria-hidden="true" />
                  </span>
                }
                title={
                  target ? (
                    <Link
                      href={target}
                      className="rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-focus/40"
                    >
                      {warehouse.name}
                    </Link>
                  ) : (
                    warehouse.name
                  )
                }
                subtitle={warehouse.description || undefined}
                meta={
                  <>
                    <Badge tone={warehouse.isPublished ? "success" : "neutral"}>
                      {warehouse.isPublished
                        ? t("warehouses.published")
                        : t("warehouses.unpublished")}
                    </Badge>
                    <span className="text-body3 text-content-faint">
                      {format.dateTime(new Date(warehouse.createdAt), { dateStyle: "medium" })}
                    </span>
                  </>
                }
                actions={
                  <WarehouseActions
                    companyId={companyId}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    warehouse={{
                      id: warehouse.id,
                      name: warehouse.name,
                      description: warehouse.description,
                      slug: warehouse.slug,
                      isPublished: warehouse.isPublished,
                    }}
                  />
                }
              />
            )
          })
        }
      </Collection>
    </PageShell>
  )
}
