import { Panel } from "@tfv/ui"
import { Boxes, ClipboardList, FileText, PackageCheck, Truck, Wrench } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import type { PageEnvelope } from "~/components/collection/collection.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { type ApiResult, apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { OrderRow, ProductRow, QuoteRow, WarehouseRow } from "../../warehouse.ts"
import { OrderStatusBadge } from "../orders/order-badges.tsx"
import { QuoteStatusBadge, QuoteTypeBadge } from "../quotes/quote-badges.tsx"
import { WarehouseNav } from "../warehouse-nav.tsx"
import { canViewPanel } from "./access.ts"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.panel.title") }
}

/**
 * El panel del almacén: qué hay dentro y qué está esperando a alguien.
 *
 * ## Qué es y qué no
 *
 * No es un tablero de indicadores. Es la respuesta a las dos preguntas con las que se entra a una
 * nave por la mañana —**qué tengo** y **qué tengo que atender hoy**—, y de ahí salen las dos
 * mitades: unos recuentos que se leen de un vistazo y dos listas cortas de trabajo pendiente, cada
 * una a un clic de la bandeja que la contiene entera.
 *
 * Las cifras **son enlaces al listado que las produce**. Un panel que dice «7 esperando respuesta»
 * y obliga a ir a buscarlas a mano convierte cada consulta en una reconstrucción del filtro; el
 * estado de exploración vive en la dirección precisamente para que esto sea un enlace.
 *
 * ## Es una pestaña, no la portada
 *
 * La portada del almacén sigue siendo el catálogo. Ver el porqué en el mensaje del commit y en
 * `warehouse-nav.tsx`: la dirección del almacén ya identifica su catálogo filtrado en enlaces
 * compartidos, y el papel más acotado del almacén entra a trabajar sobre el catálogo, no sobre un
 * resumen que sus permisos dejarían medio vacío.
 *
 * ## Lo que no se puede enseñar todavía
 *
 * **Las unidades de existencia y sus estados.** El resumen natural de una nave —cuántas piezas hay
 * y cuántas están libres, apartadas, fuera o dañadas— no se puede componer con la API de hoy: las
 * unidades sólo se listan **por medida** (`…/measurements/{id}/units`), así que contarlas en un
 * almacén costaría una petición por medida del catálogo entero. No se ha inventado una cifra
 * aproximada ni se han pedido rutas nuevas: queda fuera y anotado en `openspec/HALLAZGOS.md`
 * (H-58).
 *
 * ## Por qué cada bloque pide su cuenta por separado
 *
 * Porque cada uno es una pregunta distinta y no hay ruta que las conteste juntas. Se piden en
 * paralelo, con `limit=1` cuando lo único que se quiere es el `totalItems` del sobre de paginación,
 * y con `limit=5` cuando además hay que enseñar las filas. Lo que **no** se hace es traerse la
 * colección entera para contarla en memoria.
 */
export default async function WarehousePanelPage({
  params,
}: {
  params: Promise<{ companyId: string; warehouseId: string }>
}) {
  const t = await getTranslations("warehouses.panel")
  const format = await getFormatter()
  const { companyId, warehouseId } = await params
  const path =
    (await headers()).get("x-pathname") ?? `/c/${companyId}/warehouses/${warehouseId}/panel`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewWarehouses = can(company, "warehouses.warehouses.view")
  const canViewProducts = can(company, "warehouses.products.view")
  const canViewQuotes = can(company, "warehouses.quotes.view")
  const canViewOrders = can(company, "warehouses.orders.view")

  const base = `/companies/${companyId}/warehouses/${warehouseId}`
  const screen = `/c/${companyId}/warehouses/${warehouseId}`

  const [warehouseResult, products, provisional, waiting, inProgress, inRent, orders] =
    await Promise.all([
      canViewWarehouses ? apiGet<WarehouseRow>(base) : Promise.resolve(null),
      count<ProductRow>(canViewProducts, `${base}/products?limit=1`),
      count<ProductRow>(canViewProducts, `${base}/products?isProvisional=true&limit=1`),
      count<QuoteRow>(canViewQuotes, `${base}/quotes?status=pre_quote,pending&limit=5`),
      count<QuoteRow>(canViewQuotes, `${base}/quotes?status=in_progress&limit=1`),
      count<QuoteRow>(canViewQuotes, `${base}/quotes?status=in_rent&limit=1`),
      count<OrderRow>(canViewOrders, `${base}/orders?status=pending&limit=5`),
    ])

  const waitingFailure = failure(waiting)
  const waitingQuotes = items(waiting)
  const ordersFailure = failure(orders)
  const pendingOrders = items(orders)

  const nav = (
    <WarehouseNav
      companyId={companyId}
      warehouseId={warehouseId}
      canViewPanel={canViewPanel(company)}
      canViewWarehouses={canViewWarehouses}
      canViewProducts={canViewProducts}
      canViewCategories={can(company, "warehouses.categories.view")}
      canViewStorages={can(company, "warehouses.storages.view")}
      canViewQuotes={canViewQuotes}
      canViewOrders={canViewOrders}
      canViewPrices={can(company, "warehouses.prices.view")}
    />
  )

  return (
    <PageShell
      title={warehouseResult?.ok ? warehouseResult.data.name : t("title")}
      subtitle={t("subtitle")}
    >
      {nav}

      {canViewProducts || canViewQuotes || canViewOrders ? null : (
        <Panel className="p-6">
          <p className="text-title2 font-bold text-content">{t("nothing")}</p>
          <p className="mt-1.5 max-w-prose text-body1 text-content-muted">{t("nothingBody")}</p>
        </Panel>
      )}

      <div className="grid gap-3 tablet:grid-cols-2 laptop:grid-cols-3">
        {canViewProducts ? (
          <>
            <Stat
              icon={Boxes}
              label={t("products")}
              value={total(products)}
              href={screen}
              hint={t("productsHint")}
            />
            <Stat
              icon={Wrench}
              label={t("provisional")}
              value={total(provisional)}
              href={`${screen}?isProvisional=true`}
              hint={t("provisionalHint")}
              alert={(total(provisional) ?? 0) > 0}
            />
          </>
        ) : null}

        {canViewQuotes ? (
          <>
            <Stat
              icon={FileText}
              label={t("waiting")}
              value={total(waiting)}
              href={`${screen}/quotes?status=pre_quote,pending`}
              hint={t("waitingHint")}
              alert={(total(waiting) ?? 0) > 0}
            />
            <Stat
              icon={PackageCheck}
              label={t("inProgress")}
              value={total(inProgress)}
              href={`${screen}/quotes?status=in_progress`}
              hint={t("inProgressHint")}
            />
            <Stat
              icon={Truck}
              label={t("out")}
              value={total(inRent)}
              href={`${screen}/quotes?status=in_rent`}
              hint={t("outHint")}
              alert={(total(inRent) ?? 0) > 0}
            />
          </>
        ) : null}

        {canViewOrders ? (
          <Stat
            icon={ClipboardList}
            label={t("orders")}
            value={total(orders)}
            href={`${screen}/orders?status=pending`}
            hint={t("ordersHint")}
            alert={(total(orders) ?? 0) > 0}
          />
        ) : null}
      </div>

      {canViewQuotes ? (
        <section aria-labelledby="panel-quotes" className="mt-6 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="panel-quotes" className="text-title2 font-bold text-content">
              {t("attention")}
            </h2>
            <Link
              href={`${screen}/quotes`}
              className="rounded-xs text-body3 font-semibold text-content-muted hover:underline"
            >
              {t("seeAll")}
            </Link>
          </div>

          {waitingFailure ? (
            <ApiFailure result={waitingFailure} />
          ) : waitingQuotes.length > 0 ? (
            <ul className="grid gap-2">
              {waitingQuotes.map((quote) => (
                <li key={quote.id}>
                  <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <Link
                        href={`${screen}/quotes/${quote.id}`}
                        className="rounded-xs text-body1 font-bold text-content hover:underline"
                      >
                        {quote.name || quote.folio}
                      </Link>
                      <p className="truncate text-body3 text-content-faint">
                        {quote.folio}
                        {quote.startsOn && quote.endsOn
                          ? ` · ${format.dateTime(new Date(quote.startsOn), { dateStyle: "medium" })} – ${format.dateTime(new Date(quote.endsOn), { dateStyle: "medium" })}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <QuoteTypeBadge type={quote.type} />
                      <QuoteStatusBadge status={quote.status} />
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          ) : (
            <Panel className="p-5 text-body1 text-content-muted">{t("noAttention")}</Panel>
          )}
        </section>
      ) : null}

      {canViewOrders ? (
        <section aria-labelledby="panel-orders" className="mt-6 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="panel-orders" className="text-title2 font-bold text-content">
              {t("decisions")}
            </h2>
            <Link
              href={`${screen}/orders`}
              className="rounded-xs text-body3 font-semibold text-content-muted hover:underline"
            >
              {t("seeAll")}
            </Link>
          </div>

          {ordersFailure ? (
            <ApiFailure result={ordersFailure} />
          ) : pendingOrders.length > 0 ? (
            <ul className="grid gap-2">
              {pendingOrders.map((order) => (
                <li key={order.id}>
                  <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <Link
                        href={`${screen}/orders/${order.id}`}
                        className="rounded-xs text-body1 font-bold text-content hover:underline"
                      >
                        {order.name || order.code}
                      </Link>
                      <p className="truncate text-body3 text-content-faint">
                        {order.code} ·{" "}
                        {format.dateTime(new Date(order.createdAt), { dateStyle: "medium" })}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          ) : (
            <Panel className="p-5 text-body1 text-content-muted">{t("noDecisions")}</Panel>
          )}
        </section>
      ) : null}
    </PageShell>
  )
}

/**
 * Una cifra del panel, que es también el enlace al listado que la produce.
 *
 * `alert` no pinta «malo»: pinta **«esto espera a alguien»**. Un almacén con cero pedidos por
 * decidir está bien; con cuatro, hay cuatro personas esperando respuesta.
 *
 * El color va con la pareja cruda de la paleta, la misma que usa `Badge` en su tono de aviso, y no
 * con `text-warning`: ese nombre no existe en los tokens. Ver H-57.
 */
function Stat({
  icon: Icon,
  label,
  value,
  hint,
  href,
  alert,
}: {
  icon: typeof Boxes
  label: string
  value: number | null
  hint: string
  href: string
  alert?: boolean
}) {
  return (
    <Link href={href} className="group block rounded-md">
      <Panel className="flex h-full flex-col gap-2 p-5 transition-colors group-hover:border-edge-control group-hover:bg-panel-hover">
        <span className="flex items-center gap-2 text-body3 font-semibold text-content-faint">
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </span>
        <p
          className={
            alert
              ? "text-h3 font-bold tabular-nums text-warning"
              : "text-h3 font-bold tabular-nums text-content"
          }
        >
          {value === null ? "—" : value}
        </p>
        <p className="text-body3 text-content-faint">{hint}</p>
      </Panel>
    </Link>
  )
}

/**
 * Una colección pedida sólo por su recuento, o nada si quien mira no puede verla.
 *
 * `null` y «falló» son cosas distintas y se distinguen: sin permiso no se pinta el bloque, y con
 * permiso pero con la API caída se pinta el fallo. Enseñar un cero en los dos casos diría que el
 * almacén está vacío.
 */
function count<T>(allowed: boolean, path: string): Promise<ApiResult<PageEnvelope<T>>> | null {
  return allowed ? apiGet<PageEnvelope<T>>(path) : null
}

function total<T>(result: ApiResult<PageEnvelope<T>> | null): number | null {
  return result?.ok ? result.data.totalItems : null
}

/** El fallo de una colección, si lo hubo y si quien mira podía pedirla. */
function failure<T>(
  result: ApiResult<PageEnvelope<T>> | null,
): Extract<ApiResult<unknown>, { ok: false }> | null {
  return result && !result.ok ? result : null
}

function items<T>(result: ApiResult<PageEnvelope<T>> | null): readonly T[] {
  return result?.ok ? result.data.items : []
}
