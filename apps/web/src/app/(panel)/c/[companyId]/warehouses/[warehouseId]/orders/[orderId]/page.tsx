import { Badge, Callout, Panel, Separator } from "@tfv/ui"
import { ClipboardList, FileText, Package } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { ItemsEnvelope, OrderLineRow, OrderRow } from "../../../warehouse.ts"
import { QuoteTypeBadge } from "../../quotes/quote-badges.tsx"
import { WarehouseNav } from "../../warehouse-nav.tsx"
import { OrderStatusBadge } from "../order-badges.tsx"
import { OrderActions } from "./order-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.orders.detail") }
}

/**
 * La ficha de un pedido.
 *
 * Enseña lo que hace falta para decidir: qué se pide y **qué hay**. Cada línea trae la existencia
 * libre de su medida, así que la falta se ve antes de aceptar en lugar de descubrirse cuando la
 * reserva falla — que es cuando el operador ya le dijo que sí al cliente.
 *
 * Aceptado, el pedido enlaza con su cotización, que es donde vive el dinero.
 */
export default async function OrderPage({
  params,
}: {
  params: Promise<{ companyId: string; warehouseId: string; orderId: string }>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId, warehouseId, orderId } = await params
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/warehouses/${warehouseId}/orders/${orderId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const nav = (
    <WarehouseNav
      companyId={companyId}
      warehouseId={warehouseId}
      canViewWarehouses={can(company, "warehouses.warehouses.view")}
      canViewProducts={can(company, "warehouses.products.view")}
      canViewCategories={can(company, "warehouses.categories.view")}
      canViewStorages={can(company, "warehouses.storages.view")}
      canViewQuotes={can(company, "warehouses.quotes.view")}
      canViewOrders={can(company, "warehouses.orders.view")}
      canViewPrices={can(company, "warehouses.prices.view")}
    />
  )

  const base = `/companies/${companyId}/warehouses/${warehouseId}/orders/${orderId}`
  const [orderResult, linesResult] = await Promise.all([
    apiGet<OrderRow>(base),
    apiGet<ItemsEnvelope<OrderLineRow>>(`${base}/lines`),
  ])

  if (!orderResult.ok) {
    return (
      <PageShell title={t("warehouses.orders.detail")}>
        {nav}
        <ApiFailure result={orderResult} />
      </PageShell>
    )
  }

  const order = orderResult.data
  const lines = linesResult.ok ? linesResult.data.items : []
  const open = order.status === "pending"

  return (
    <PageShell title={order.name || order.code} subtitle={order.observations || order.code}>
      {nav}

      {order.status === "canceled" && order.cancelReason ? (
        <Callout tone="danger" className="mb-4">
          {t("warehouses.orders.canceledWith", { reason: order.cancelReason })}
        </Callout>
      ) : null}

      <div className="grid gap-4 laptop:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Panel className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <ClipboardList className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-body2 font-semibold text-content">{order.code}</p>
                  <p className="truncate text-body3 text-content-faint">
                    {t(`warehouses.orders.originOf.${order.origin}`)} ·{" "}
                    {format.dateTime(new Date(order.createdAt), { dateStyle: "medium" })}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <QuoteTypeBadge type={order.type} />
                <OrderStatusBadge status={order.status} />
              </div>
            </div>

            {order.quoteId ? (
              <>
                <Separator className="my-4" />
                <Link
                  href={`/c/${companyId}/warehouses/${warehouseId}/quotes/${order.quoteId}`}
                  className="inline-flex items-center gap-2 rounded-xs text-body2 font-semibold text-content hover:underline focus-visible:outline-2 focus-visible:outline-focus/40"
                >
                  <FileText className="size-4 text-content-faint" aria-hidden="true" />
                  {t("warehouses.orders.goToQuote")}
                </Link>
              </>
            ) : null}
          </Panel>

          <section aria-labelledby="order-lines">
            <div className="mb-3 flex items-center gap-2">
              <Package className="size-5 text-content-faint" aria-hidden="true" />
              <h2 id="order-lines" className="text-title2 font-bold text-content">
                {t("warehouses.orders.lines")}
              </h2>
            </div>

            {lines.length > 0 ? (
              <ul className="grid gap-3">
                {lines.map((line) => {
                  const short = line.available < line.quantity
                  return (
                    <li key={line.id}>
                      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <h3 className="truncate text-body1 font-bold text-content">
                            <Link
                              href={`/c/${companyId}/warehouses/${warehouseId}/products/${line.productId}`}
                              className="rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-focus/40"
                            >
                              {line.productName}
                            </Link>
                          </h3>
                          <p className="truncate text-body3 text-content-faint">
                            {line.measurementName} · {line.productCode}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge>{t("warehouses.orders.asked", { count: line.quantity })}</Badge>
                          <Badge tone={short ? "danger" : "success"}>
                            {t("warehouses.quotes.freeUnits", { count: line.available })}
                          </Badge>
                        </div>
                      </Panel>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Panel className="p-5 text-body1 text-content-muted">
                {t("warehouses.orders.noLines")}
              </Panel>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {open ? (
            <OrderActions
              companyId={companyId}
              warehouseId={warehouseId}
              orderId={orderId}
              lines={lines}
              canAccept={can(company, "warehouses.orders.accept")}
              canReject={can(company, "warehouses.orders.reject")}
            />
          ) : null}
        </aside>
      </div>
    </PageShell>
  )
}
