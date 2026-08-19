import { Badge, Panel, Separator } from "@tfv/ui"
import { Boxes } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import type { PageEnvelope } from "~/components/collection/collection.tsx"
import { Pager } from "~/components/collection/pager.tsx"
import {
  type FilterSpec,
  hasActiveFilters,
  toApiQuery,
  toSearchParams,
} from "~/components/collection/params.ts"
import { CollectionToolbar } from "~/components/collection/toolbar.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type {
  ItemsEnvelope,
  ProductDetail,
  StockUnitRow,
  StorageRow,
} from "../../../../../warehouse.ts"
import { STOCK_STATUSES } from "../../../../../warehouse.ts"
import { canViewPanel } from "../../../../panel/access.ts"
import { WarehouseNav } from "../../../../warehouse-nav.tsx"
import { StockActions } from "./stock-actions.tsx"
import { StockUnits } from "./stock-units.tsx"

/**
 * Lo justo del padrón para poner nombre a quien movió una unidad.
 *
 * Se declara aquí y no en `warehouse.ts` porque un miembro no es cosa del almacén: es la pieza que
 * se toma prestada para que el historial diga «Ana» en lugar de un identificador.
 */
interface MemberSummary {
  userId: string
  name: string
  lastname: string
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.stock.title") }
}

/**
 * Las unidades de una medida.
 *
 * Ver `openspec/specs/stock-units/spec.md`. Es la pantalla donde el inventario deja de ser un
 * número y pasa a ser una lista de objetos con nombre propio: cada fila es una cámara concreta,
 * con su código impreso, su estado y su historia.
 *
 * ## La medida se lee del producto, no de una ruta suya
 *
 * No hay consulta de una medida suelta, y no hace falta: la ficha del producto trae las suyas
 * enteras, con el recuento por estado que la cabecera necesita. Pedir una segunda ruta para
 * releer un objeto que ya viene completo sería una petición más para el mismo dato.
 */
export default async function MeasurementPage({
  params,
  searchParams,
}: {
  params: Promise<{
    companyId: string
    warehouseId: string
    productId: string
    measurementId: string
  }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId, warehouseId, productId, measurementId } = await params
  const query = toSearchParams(await searchParams)
  const screen = `/c/${companyId}/warehouses/${warehouseId}/products/${productId}/measurements/${measurementId}`
  const path = (await headers()).get("x-pathname") ?? screen
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewWarehouses = can(company, "warehouses.warehouses.view")
  const canViewStorages = can(company, "warehouses.storages.view")
  const canCreate = can(company, "warehouses.products.stock_create")
  const canEdit = can(company, "warehouses.products.stock_edit")
  const canDelete = can(company, "warehouses.products.stock_delete")
  const canNameActors = can(company, "companies.users.view")

  // El almacén no se pide: la cabecera de esta pantalla es el producto y su medida, y el nombre de
  // la nave ya está en la navegación de arriba. Una petición más para repetir un dato no es gratis.
  const [productResult, unitsResult, membersResult] = await Promise.all([
    apiGet<ProductDetail>(
      `/companies/${companyId}/warehouses/${warehouseId}/products/${productId}`,
    ),
    apiGet<PageEnvelope<StockUnitRow>>(
      `/companies/${companyId}/warehouses/${warehouseId}/measurements/${measurementId}/units?${toApiQuery(query)}`,
    ),
    canNameActors
      ? apiGet<PageEnvelope<MemberSummary>>(`/companies/${companyId}/members?limit=96`)
      : Promise.resolve(null),
  ])

  const nav = (
    <WarehouseNav
      companyId={companyId}
      warehouseId={warehouseId}
      canViewPanel={canViewPanel(company)}
      canViewWarehouses={canViewWarehouses}
      canViewProducts={can(company, "warehouses.products.view")}
      canViewCategories={can(company, "warehouses.categories.view")}
      canViewStorages={canViewStorages}
      canViewQuotes={can(company, "warehouses.quotes.view")}
      canViewOrders={can(company, "warehouses.orders.view")}
      canViewPrices={can(company, "warehouses.prices.view")}
    />
  )

  if (!productResult.ok) {
    return (
      <PageShell title={t("warehouses.stock.title")}>
        {nav}
        <ApiFailure result={productResult} />
      </PageShell>
    )
  }

  const product = productResult.data
  const measurement = product.measurements.find((entry) => entry.id === measurementId)
  // Una medida que no cuelga de este producto es una dirección inventada, no un fallo del servidor.
  if (!measurement) notFound()

  const storagePath =
    canViewStorages && product.storageId
      ? await apiGet<ItemsEnvelope<StorageRow>>(
          `/companies/${companyId}/warehouses/${warehouseId}/storages/${product.storageId}/path`,
        )
      : null
  const storage = storagePath?.ok ? storagePath.data.items.at(-1) : undefined

  const actors: Record<string, string> = {}
  if (membersResult?.ok) {
    for (const member of membersResult.data.items) {
      actors[member.userId] = `${member.name} ${member.lastname}`.trim()
    }
  }

  const registered = STOCK_STATUSES.reduce(
    (total, status) => total + (measurement.units[status] ?? 0),
    0,
  )

  const filters: FilterSpec[] = [
    {
      kind: "multi",
      key: "status",
      label: t("warehouses.stock.state"),
      options: STOCK_STATUSES.map((status) => ({
        value: status,
        label: t(`warehouses.status.${status}`),
      })),
    },
    {
      // El descuadre auditable: unidades que existen porque una cotización pidió más de las que
      // había. Poder aislarlas es la mitad de por qué se marcan.
      kind: "boolean",
      key: "createdByReservation",
      label: t("warehouses.stock.minted"),
      trueLabel: t("warehouses.stock.mintedFilter"),
      falseLabel: t("warehouses.stock.mintedNo"),
    },
  ]

  return (
    <PageShell
      title={measurement.name}
      subtitle={t("warehouses.stock.subtitle", {
        product: product.name,
        kind: t(`warehouses.measurements.kind.${measurement.kind}`),
      })}
      actions={
        <StockActions
          companyId={companyId}
          warehouseId={warehouseId}
          productId={productId}
          measurementId={measurementId}
          canCreate={canCreate}
          hasUnits={registered > 0}
        />
      }
    >
      {nav}

      <Panel className="mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
              <Boxes className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <Link
                href={`/c/${companyId}/warehouses/${warehouseId}/products/${productId}`}
                className="text-body1 font-semibold text-content underline decoration-edge-control underline-offset-2 hover:decoration-content"
              >
                {product.name}
              </Link>
              <p className="font-mono text-body3 text-content-faint">{product.code}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Badge tone="neutral">{t("warehouses.stock.registered", { count: registered })}</Badge>
            {storage ? (
              <Badge tone="accent">
                {storage.code} · {storage.name}
              </Badge>
            ) : null}
          </div>
        </div>

        {registered > 0 ? (
          <>
            <Separator className="my-4" />
            <dl className="flex flex-wrap gap-1.5">
              {STOCK_STATUSES.map((status) => {
                const count = measurement.units[status] ?? 0
                if (count === 0) return null
                return (
                  <div key={status} className="rounded-xs bg-panel-hover px-2 py-1 text-body3">
                    <dt className="inline text-content-faint">
                      {t(`warehouses.status.${status}`)}:{" "}
                    </dt>
                    <dd className="inline font-semibold text-content">{format.number(count)}</dd>
                  </div>
                )
              })}
            </dl>
          </>
        ) : null}
      </Panel>

      {/* La barra y el paginador son los primitivos de colección; en medio va una tabla y no una
          rejilla de tarjetas, porque lo que se compara aquí son once columnas de la misma forma. */}
      <CollectionToolbar filters={filters} views={false} />

      {unitsResult.ok ? (
        <>
          <StockUnits
            companyId={companyId}
            warehouseId={warehouseId}
            productId={productId}
            measurementId={measurementId}
            units={unitsResult.data.items}
            location={storage ? { id: storage.id, code: storage.code, name: storage.name } : null}
            canViewLocation={canViewStorages}
            actors={actors}
            canEdit={canEdit}
            canDelete={canDelete}
            empty={
              hasActiveFilters(query, filters)
                ? t("warehouses.stock.emptyFiltered")
                : t("warehouses.stock.empty")
            }
          />
          <Pager
            page={unitsResult.data.page}
            totalPages={unitsResult.data.totalPages}
            totalItems={unitsResult.data.totalItems}
          />
        </>
      ) : (
        <ApiFailure result={unitsResult} />
      )}
    </PageShell>
  )
}
