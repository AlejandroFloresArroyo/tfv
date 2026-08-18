import { ItemCard } from "@tfv/ui"
import { FileText } from "lucide-react"
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
import { QUOTE_STATUSES, type QuoteRow, type WarehouseRow } from "../../warehouse.ts"
import { canViewPanel } from "../panel/access.ts"
import { WarehouseNav } from "../warehouse-nav.tsx"
import { QuoteStatusBadge, QuoteTypeBadge } from "./quote-badges.tsx"
import { CreateQuote } from "./quote-create.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.quotes.title") }
}

/**
 * La bandeja de trabajo.
 *
 * El orden por defecto es el del servidor —prioridad descendente—, así que lo que hay que atender
 * antes sale antes sin que la pantalla decida nada. Cambiarlo aquí desharía la prioridad derivada
 * del estado, que es justo lo que la hace fiable.
 */
export default async function QuotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; warehouseId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId, warehouseId } = await params
  const query = toSearchParams(await searchParams)
  const path =
    (await headers()).get("x-pathname") ?? `/c/${companyId}/warehouses/${warehouseId}/quotes`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)
  const canViewWarehouses = can(company, "warehouses.warehouses.view")
  const canCreate = can(company, "warehouses.quotes.create")

  const [warehouseResult, quotesResult] = await Promise.all([
    canViewWarehouses
      ? apiGet<WarehouseRow>(`/companies/${companyId}/warehouses/${warehouseId}`)
      : Promise.resolve(null),
    apiGet<PageEnvelope<QuoteRow>>(
      `/companies/${companyId}/warehouses/${warehouseId}/quotes?${toApiQuery(query)}`,
    ),
  ])

  const filters: FilterSpec[] = [
    {
      kind: "multi",
      key: "status",
      label: t("warehouses.quotes.status"),
      options: QUOTE_STATUSES.map((status) => ({
        value: status,
        label: t(`warehouses.quotes.state.${status}`),
      })),
    },
    {
      kind: "select",
      key: "type",
      label: t("warehouses.quotes.type"),
      options: [
        { value: "rent", label: t("warehouses.quotes.kind.rent") },
        { value: "sale", label: t("warehouses.quotes.kind.sale") },
      ],
    },
    {
      kind: "dateRange",
      key: "startsOn",
      label: t("warehouses.quotes.window"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("warehouses.quotes.createdAt"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  return (
    <PageShell
      title={warehouseResult?.ok ? warehouseResult.data.name : t("warehouses.quotes.title")}
      subtitle={t("warehouses.quotes.subtitle")}
      actions={
        canCreate ? <CreateQuote companyId={companyId} warehouseId={warehouseId} /> : undefined
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
        result={quotesResult}
        filters={filters}
        searchPlaceholder={t("warehouses.quotes.searchPlaceholder")}
        emptyTitle={t("warehouses.quotes.empty")}
        emptyBody={t("warehouses.quotes.emptyBody")}
        emptyAction={
          canCreate ? <CreateQuote companyId={companyId} warehouseId={warehouseId} /> : undefined
        }
      >
        {(items, view) =>
          items.map((quote) => (
            <ItemCard
              key={quote.id}
              view={view}
              media={
                <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <FileText className="size-4" aria-hidden="true" />
                </span>
              }
              title={
                <Link
                  href={`/c/${companyId}/warehouses/${warehouseId}/quotes/${quote.id}`}
                  className="rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-focus/40"
                >
                  {quote.name || quote.folio}
                </Link>
              }
              subtitle={
                quote.startsOn && quote.endsOn
                  ? `${quote.folio} · ${format.dateTime(new Date(quote.startsOn), { dateStyle: "medium" })} – ${format.dateTime(new Date(quote.endsOn), { dateStyle: "medium" })}`
                  : quote.folio
              }
              meta={
                <>
                  <QuoteTypeBadge type={quote.type} />
                  <QuoteStatusBadge status={quote.status} />
                </>
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
