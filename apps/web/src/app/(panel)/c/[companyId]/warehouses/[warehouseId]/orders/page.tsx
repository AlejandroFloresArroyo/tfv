import { Badge, ItemCard } from "@tfv/ui"
import { ClipboardList } from "lucide-react"
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
import { ORDER_STATUSES, type OrderRow, type WarehouseRow } from "../../warehouse.ts"
import { WarehouseNav } from "../warehouse-nav.tsx"
import { OrderStatusBadge } from "./order-badges.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.orders.title") }
}

/**
 * La bandeja del operador.
 *
 * Igual que la de cotizaciones, el orden por defecto lo pone el servidor —prioridad descendente,
 * derivada del estado—, así que lo pendiente sale primero sin que la pantalla decida nada.
 *
 * La diferencia está en lo que se señala: un pedido con mensajes sin leer es un pedido que espera
 * respuesta de este lado del mostrador, y ésa es la razón de que la bandeja exista.
 */
export default async function OrdersPage({
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
    (await headers()).get("x-pathname") ?? `/c/${companyId}/warehouses/${warehouseId}/orders`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)
  const canViewWarehouses = can(company, "warehouses.warehouses.view")

  const [warehouseResult, ordersResult] = await Promise.all([
    canViewWarehouses
      ? apiGet<WarehouseRow>(`/companies/${companyId}/warehouses/${warehouseId}`)
      : Promise.resolve(null),
    apiGet<PageEnvelope<OrderRow>>(
      `/companies/${companyId}/warehouses/${warehouseId}/orders?${toApiQuery(query)}`,
    ),
  ])

  const filters: FilterSpec[] = [
    {
      kind: "multi",
      key: "status",
      label: t("warehouses.orders.status"),
      options: ORDER_STATUSES.map((status) => ({
        value: status,
        label: t(`warehouses.orders.state.${status}`),
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
      kind: "select",
      key: "origin",
      label: t("warehouses.orders.origin"),
      options: [
        { value: "production", label: t("warehouses.orders.originOf.production") },
        { value: "storefront", label: t("warehouses.orders.originOf.storefront") },
      ],
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
      title={warehouseResult?.ok ? warehouseResult.data.name : t("warehouses.orders.title")}
      subtitle={t("warehouses.orders.subtitle")}
    >
      <WarehouseNav
        companyId={companyId}
        warehouseId={warehouseId}
        canViewWarehouses={canViewWarehouses}
        canViewProducts={can(company, "warehouses.products.view")}
        canViewStorages={can(company, "warehouses.storages.view")}
        canViewQuotes={can(company, "warehouses.quotes.view")}
        canViewOrders={can(company, "warehouses.orders.view")}
      />

      <Collection
        params={query}
        result={ordersResult}
        filters={filters}
        searchPlaceholder={t("warehouses.orders.searchPlaceholder")}
        emptyTitle={t("warehouses.orders.empty")}
        emptyBody={t("warehouses.orders.emptyBody")}
      >
        {(items, view) =>
          items.map((order) => (
            <ItemCard
              key={order.id}
              view={view}
              media={
                <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <ClipboardList className="size-4" aria-hidden="true" />
                </span>
              }
              title={
                <Link
                  href={`/c/${companyId}/warehouses/${warehouseId}/orders/${order.id}`}
                  className="rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-focus/40"
                >
                  {order.name || order.code}
                </Link>
              }
              subtitle={`${order.code} · ${format.dateTime(new Date(order.createdAt), { dateStyle: "medium" })}`}
              meta={
                <>
                  <OrderStatusBadge status={order.status} />
                  {order.unread > 0 ? (
                    <Badge tone="accent">
                      {t("warehouses.orders.unread", { count: order.unread })}
                    </Badge>
                  ) : null}
                </>
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
