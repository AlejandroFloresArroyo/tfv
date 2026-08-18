import { Badge, Panel, Separator } from "@tfv/ui"
import { Box, PackageCheck, Ruler } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type {
  ItemsEnvelope,
  MeasurementRow,
  ProductDetail,
  ProductRow,
  StorageRow,
  WarehouseRow,
} from "../../../warehouse.ts"
import { STOCK_STATUSES } from "../../../warehouse.ts"
import { WarehouseNav } from "../../warehouse-nav.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.products.detail") }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ companyId: string; warehouseId: string; productId: string }>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId, warehouseId, productId } = await params
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/warehouses/${warehouseId}/products/${productId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)
  const canViewWarehouses = can(company, "warehouses.warehouses.view")
  const canViewStorages = can(company, "warehouses.storages.view")
  const canViewCost = can(company, "warehouses.products.edit_payment")
  const canViewPriceLists = can(company, "warehouses.prices.view")

  const [warehouseResult, productResult] = await Promise.all([
    canViewWarehouses
      ? apiGet<WarehouseRow>(`/companies/${companyId}/warehouses/${warehouseId}`)
      : Promise.resolve(null),
    apiGet<ProductDetail>(
      `/companies/${companyId}/warehouses/${warehouseId}/products/${productId}`,
    ),
  ])

  if (!productResult.ok) {
    return (
      <PageShell
        title={warehouseResult?.ok ? warehouseResult.data.name : t("warehouses.products.detail")}
      >
        <WarehouseNav
          companyId={companyId}
          warehouseId={warehouseId}
          canViewWarehouses={canViewWarehouses}
          canViewProducts={can(company, "warehouses.products.view")}
          canViewCategories={can(company, "warehouses.categories.view")}
          canViewStorages={canViewStorages}
          canViewQuotes={can(company, "warehouses.quotes.view")}
          canViewOrders={can(company, "warehouses.orders.view")}
          canViewPrices={can(company, "warehouses.prices.view")}
        />
        <ApiFailure result={productResult} />
      </PageShell>
    )
  }

  const product = productResult.data
  const storagePath =
    canViewStorages && product.storageId
      ? await apiGet<ItemsEnvelope<StorageRow>>(
          `/companies/${companyId}/warehouses/${warehouseId}/storages/${product.storageId}/path`,
        )
      : null
  const location = storagePath?.ok ? storagePath.data.items.at(-1) : undefined

  return (
    <PageShell title={product.name} subtitle={product.description || product.code}>
      <WarehouseNav
        companyId={companyId}
        warehouseId={warehouseId}
        canViewWarehouses={canViewWarehouses}
        canViewProducts={can(company, "warehouses.products.view")}
        canViewCategories={can(company, "warehouses.categories.view")}
        canViewStorages={canViewStorages}
        canViewQuotes={can(company, "warehouses.quotes.view")}
        canViewOrders={can(company, "warehouses.orders.view")}
        canViewPrices={can(company, "warehouses.prices.view")}
      />

      <div className="grid gap-4 laptop:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <Panel className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <Box className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-body2 font-semibold text-content">{product.code}</p>
                  {product.internalCode ? (
                    <p className="truncate text-body3 text-content-faint">
                      {t("warehouses.products.internalCode")}: {product.internalCode}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Badge tone={product.isPublished ? "success" : "neutral"}>
                  {product.isPublished ? t("warehouses.published") : t("warehouses.unpublished")}
                </Badge>
                {product.availableForRent ? (
                  <Badge tone="accent">{t("warehouses.forRent")}</Badge>
                ) : null}
                {product.availableForSale ? (
                  <Badge tone="success">{t("warehouses.forSale")}</Badge>
                ) : null}
              </div>
            </div>

            {location ? (
              <>
                <Separator className="my-4" />
                <dl className="grid gap-1">
                  <dt className="text-body3 font-semibold text-content-faint">
                    {t("warehouses.storage")}
                  </dt>
                  <dd className="text-body2 text-content-muted">
                    <Link
                      href={`/c/${companyId}/warehouses/${warehouseId}/storages/${location.id}`}
                      className="font-semibold text-content underline decoration-line-strong underline-offset-2 hover:decoration-content"
                    >
                      {location.code} · {location.name}
                    </Link>
                  </dd>
                </dl>
              </>
            ) : null}
          </Panel>

          <section aria-labelledby="measurements-heading">
            <div className="mb-3 flex items-center gap-2">
              <Ruler className="size-5 text-content-faint" aria-hidden="true" />
              <h2 id="measurements-heading" className="text-title2 font-bold text-content">
                {t("warehouses.measurements.title")}
              </h2>
            </div>

            {product.measurements.length > 0 ? (
              <div className="grid gap-3 tablet:grid-cols-2">
                {product.measurements.map((measurement) => (
                  <MeasurementCard
                    key={measurement.id}
                    measurement={measurement}
                    href={`/c/${companyId}/warehouses/${warehouseId}/products/${productId}/measurements/${measurement.id}`}
                  />
                ))}
              </div>
            ) : (
              <Panel className="p-5 text-body1 text-content-muted">
                {t("warehouses.measurements.empty")}
              </Panel>
            )}
          </section>

          <RelatedProducts
            companyId={companyId}
            warehouseId={warehouseId}
            title={t("warehouses.products.variants")}
            empty={t("warehouses.products.noVariants")}
            products={product.variants}
          />

          <RelatedProducts
            companyId={companyId}
            warehouseId={warehouseId}
            title={t("warehouses.products.accessories")}
            empty={t("warehouses.products.noAccessories")}
            products={product.accessories}
          />
        </div>

        <aside className="space-y-4">
          <Panel className="p-5">
            <h2 className="text-title2 font-bold text-content">
              {t("warehouses.products.summary")}
            </h2>
            <dl className="mt-4 grid gap-3">
              <SummaryRow label={t("warehouses.products.code")} value={product.code} />
              <SummaryRow
                label={t("warehouses.products.measurements")}
                value={format.number(product.measurements.length)}
              />
              <SummaryRow
                label={t("warehouses.products.availableUnits")}
                value={format.number(
                  product.measurements.reduce(
                    (total, measurement) => total + (measurement.units.available ?? 0),
                    0,
                  ),
                )}
              />
            </dl>
          </Panel>

          <Panel className="p-5">
            <h2 className="text-title2 font-bold text-content">
              {t("warehouses.products.pricing")}
            </h2>
            <dl className="mt-4 grid gap-3">
              <SummaryRow
                label={t("warehouses.products.basePrice")}
                value={format.number(Number(product.price), {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              />
              {canViewCost ? (
                <SummaryRow
                  label={t("warehouses.products.cost")}
                  value={format.number(Number(product.cost), {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                />
              ) : null}
              {canViewPriceLists ? (
                <SummaryRow
                  label={t("warehouses.products.priceLists")}
                  value={
                    product.usesPriceLists
                      ? t("warehouses.products.yes")
                      : t("warehouses.products.no")
                  }
                />
              ) : null}
            </dl>
          </Panel>
        </aside>
      </div>
    </PageShell>
  )
}

async function MeasurementCard({
  measurement,
  href,
}: {
  measurement: MeasurementRow
  /** A sus unidades: la medida es el recuento, y las unidades son los objetos que lo componen. */
  href: string
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const available = measurement.units.available ?? 0
  const total = STOCK_STATUSES.reduce((sum, status) => sum + (measurement.units[status] ?? 0), 0)
  const dimensions = [
    {
      key: "height",
      label: t("warehouses.measurements.height"),
      value: measurement.dimensions.height,
      unit: measurement.lengthUnit,
    },
    {
      key: "width",
      label: t("warehouses.measurements.width"),
      value: measurement.dimensions.width,
      unit: measurement.lengthUnit,
    },
    {
      key: "length",
      label: t("warehouses.measurements.length"),
      value: measurement.dimensions.length,
      unit: measurement.lengthUnit,
    },
    {
      key: "weight",
      label: t("warehouses.measurements.weight"),
      value: measurement.dimensions.weight,
      unit: measurement.massUnit,
    },
  ].filter((entry) => entry.value !== undefined)
  const clothingMeasurements = Object.entries(measurement.clothing?.measurements ?? {})

  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-body1 font-bold text-content">
            <Link
              href={href}
              className="rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-focus/40"
            >
              {measurement.name}
            </Link>
          </h3>
          <p className="text-body3 text-content-faint">
            {t(`warehouses.measurements.kind.${measurement.kind}`)}
          </p>
        </div>
        <Badge tone={available > 0 ? "success" : "warning"}>
          {t("warehouses.measurements.available", { count: available })}
        </Badge>
      </div>

      {dimensions.length > 0 || measurement.clothing ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-body3">
          {dimensions.map((entry) => (
            <div key={entry.key}>
              <dt className="text-content-faint">{entry.label}</dt>
              <dd className="font-semibold text-content">
                {format.number(entry.value ?? 0)} {entry.unit}
              </dd>
            </div>
          ))}
          {measurement.clothing?.garment ? (
            <div>
              <dt className="text-content-faint">{t("warehouses.measurements.garment")}</dt>
              <dd className="font-semibold text-content">{measurement.clothing.garment}</dd>
            </div>
          ) : null}
          {measurement.clothing?.size ? (
            <div>
              <dt className="text-content-faint">{t("warehouses.measurements.size")}</dt>
              <dd className="font-semibold text-content">{measurement.clothing.size}</dd>
            </div>
          ) : null}
          {clothingMeasurements.map(([name, value]) => (
            <div key={name}>
              <dt className="text-content-faint">{name}</dt>
              <dd className="font-semibold text-content">{format.number(value)}</dd>
            </div>
          ))}
          {measurement.clothing?.custom ? (
            <div className="col-span-2">
              <dt className="text-content-faint">{t("warehouses.measurements.notes")}</dt>
              <dd className="font-semibold text-content">{measurement.clothing.custom}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <Separator className="my-3" />
      <div className="flex items-center gap-2 text-body3 text-content-muted">
        <PackageCheck className="size-4 text-content-faint" aria-hidden="true" />
        {t("warehouses.measurements.registered", { count: total })}
      </div>

      <dl className="mt-3 flex flex-wrap gap-1.5">
        {STOCK_STATUSES.map((status) => {
          const count = measurement.units[status] ?? 0
          if (count === 0) return null
          return (
            <div key={status} className="rounded-xs bg-panel-hover px-2 py-1 text-body3">
              <dt className="inline text-content-faint">{t(`warehouses.status.${status}`)}: </dt>
              <dd className="inline font-semibold text-content">{format.number(count)}</dd>
            </div>
          )
        })}
      </dl>
    </Panel>
  )
}

async function RelatedProducts({
  companyId,
  warehouseId,
  title,
  empty,
  products,
}: {
  companyId: string
  warehouseId: string
  title: string
  empty: string
  products: readonly ProductRow[]
}) {
  return (
    <section>
      <h2 className="mb-3 text-title2 font-bold text-content">{title}</h2>
      {products.length > 0 ? (
        <ul className="grid gap-2 tablet:grid-cols-2">
          {products.map((product) => (
            <li key={product.id}>
              <Link
                href={`/c/${companyId}/warehouses/${warehouseId}/products/${product.id}`}
                className="flex items-center gap-3 rounded-md border border-line bg-panel p-3 transition-colors hover:bg-panel-hover"
              >
                <Box className="size-4 shrink-0 text-content-faint" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-body2 font-semibold text-content">
                    {product.name}
                  </span>
                  <span className="block font-mono text-body3 text-content-faint">
                    {product.code}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body2 text-content-faint">{empty}</p>
      )}
    </section>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-body3 font-semibold text-content-faint">{label}</dt>
      <dd className="mt-0.5 text-body1 font-semibold text-content">{value}</dd>
    </div>
  )
}
