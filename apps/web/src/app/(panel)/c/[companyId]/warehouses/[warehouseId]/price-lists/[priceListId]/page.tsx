import { isZero, money } from "@tfv/contracts/money"
import { Badge, Panel, Separator } from "@tfv/ui"
import { ChevronLeft, Tags } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { Collection } from "~/components/collection/collection.tsx"
import { readLimit, readSearch, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { formatAmount } from "~/lib/amount.ts"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { ItemsEnvelope, ProductPriceRow, RateSchedule } from "../../../warehouse.ts"
import { WarehouseNav } from "../../warehouse-nav.tsx"
import { PriceListActions } from "../price-list-actions.tsx"
import { findPriceList, fold, loadCatalog, type ProductOption, pageOf } from "../price-lists.ts"
import { RateActions, type RateRow } from "./rate-actions.tsx"

/** Las tres periodicidades, en el orden en que se cotizan. */
const FREQUENCIES = ["daily", "weekly", "monthly"] as const

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.priceLists.title") }
}

/**
 * La ficha de una lista de precios: qué productos tienen tarifa y cuál.
 *
 * Rebanada 29b. Ver `openspec/specs/warehouse-catalog/spec.md`, «Tarifa de un producto en una
 * lista».
 *
 * ## El cero no se enseña como precio
 *
 * Un producto a cero casi siempre es un producto **sin tarifa**, no un regalo, y así lo devuelve el
 * servicio: marcado como ausencia. Aquí se pinta con esas palabras —«sin precio»— y se cuenta
 * arriba cuántos hay, porque una lista con doscientas tarifas de las que ochenta están vacías
 * parece llena hasta que alguien cotiza con ella.
 *
 * ## Por qué la colección se pagina aquí
 *
 * El servicio devuelve **todas** las tarifas de la lista de una vez, sin sobre de paginación. Aun
 * así la pantalla las pagina y las busca, para que se comporte como las demás colecciones: el
 * estado de exploración vive en la dirección, y doscientas filas de tres importes no se recorren.
 */
export default async function PriceListPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; warehouseId: string; priceListId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const { companyId, warehouseId, priceListId } = await params
  const query = toSearchParams(await searchParams)
  const base = `/c/${companyId}/warehouses/${warehouseId}`
  const path = (await headers()).get("x-pathname") ?? `${base}/price-lists/${priceListId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canEdit = can(company, "warehouses.prices.edit")
  const canDelete = can(company, "warehouses.prices.delete")

  const [listResult, pricesResult, catalogResult] = await Promise.all([
    findPriceList(companyId, warehouseId, priceListId),
    apiGet<ItemsEnvelope<ProductPriceRow>>(
      `/companies/${companyId}/warehouses/${warehouseId}/price-lists/${priceListId}/prices`,
    ),
    loadCatalog(companyId, warehouseId),
  ])

  const nav = (
    <WarehouseNav
      companyId={companyId}
      warehouseId={warehouseId}
      canViewWarehouses={can(company, "warehouses.warehouses.view")}
      canViewProducts={can(company, "warehouses.products.view")}
      canViewStorages={can(company, "warehouses.storages.view")}
      canViewQuotes={can(company, "warehouses.quotes.view")}
      canViewOrders={can(company, "warehouses.orders.view")}
      canViewPrices={can(company, "warehouses.prices.view")}
    />
  )

  // El fallo de la lista se enseña antes que nada: sin ella no hay ficha que pintar, y las tarifas
  // que hubieran llegado no se pueden atribuir a nada.
  if (!listResult.ok) {
    return (
      <PageShell title={t("warehouses.priceLists.title")}>
        {nav}
        <ApiFailure result={listResult} />
      </PageShell>
    )
  }

  const list = listResult.data

  if (list === null) {
    return (
      <PageShell title={t("warehouses.priceLists.title")}>
        {nav}
        <Panel className="p-6">
          <p className="text-title2 font-bold text-content">
            {t("warehouses.priceLists.notFound")}
          </p>
          <p className="mt-1.5 max-w-prose text-body1 text-content-muted">
            {t("warehouses.priceLists.notFoundBody")}
          </p>
          <p className="mt-3">
            <Link
              href={`${base}/price-lists`}
              className="text-body2 font-semibold text-accent hover:underline"
            >
              {t("warehouses.priceLists.allLists")}
            </Link>
          </p>
        </Panel>
      </PageShell>
    )
  }

  const catalog = catalogResult.ok ? catalogResult.data.products : []
  const names = new Map<string, ProductOption>(catalog.map((product) => [product.id, product]))

  const rows: RateRow[] = pricesResult.ok
    ? pricesResult.data.items
        .map((price) => toRow(price, names.get(price.productId)))
        .sort((left, right) => left.productName.localeCompare(right.productName))
    : []

  const unpriced = rows.filter(
    (row) => blank(row.sale) && scheduleBlank(row.rent) && scheduleBlank(row.penalty),
  ).length

  const term = fold(readSearch(query))
  const matching =
    term === ""
      ? rows
      : rows.filter((row) => fold(`${row.productName} ${row.productCode}`).includes(term))

  const page = Number(query.get("page") ?? "1")
  const envelope = pageOf(matching, Number.isFinite(page) ? page : 1, readLimit(query))
  const apiBase = `/companies/${companyId}/warehouses/${warehouseId}/price-lists/${list.id}`

  return (
    <PageShell
      title={list.name}
      {...(list.description ? { subtitle: list.description } : {})}
      actions={
        <PriceListActions
          companyId={companyId}
          warehouseId={warehouseId}
          list={list}
          canEdit={canEdit}
          canDelete={canDelete}
          redirectOnDelete={`${base}/price-lists`}
          label={t("warehouses.priceLists.listActions")}
        />
      }
    >
      {nav}

      <nav aria-label={t("warehouses.priceLists.title")} className="mb-3">
        <Link
          href={`${base}/price-lists`}
          className="inline-flex items-center gap-1 rounded-xs text-body3 text-content-muted hover:text-content hover:underline"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          {t("warehouses.priceLists.allLists")}
        </Link>
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={list.productCount > 0 ? "accent" : "neutral"}>
          {t("warehouses.priceLists.priced", { count: list.productCount })}
        </Badge>
        {unpriced > 0 ? (
          <Badge tone="warning">{t("warehouses.priceLists.unpriced", { count: unpriced })}</Badge>
        ) : null}
        {catalogResult.ok && catalogResult.data.truncated ? (
          <Badge tone="warning">
            {t("warehouses.priceLists.partialCatalog", { total: catalogResult.data.total })}
          </Badge>
        ) : null}
      </div>

      {pricesResult.ok ? (
        <Collection
          params={query}
          result={{ ok: true, data: envelope }}
          views={false}
          searchPlaceholder={t("warehouses.priceLists.searchProductPlaceholder")}
          emptyTitle={t("warehouses.priceLists.noRates")}
          emptyBody={t("warehouses.priceLists.noRatesBody")}
        >
          {(items) =>
            items.map((row) => (
              <li key={row.productId} className="min-w-0">
                <Panel className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                        <Tags className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-body1 font-semibold text-content">
                          {row.productName}
                        </h2>
                        <p className="truncate font-mono text-body3 text-content-faint">
                          {row.productCode}
                        </p>
                      </div>
                    </div>

                    <RateActions base={apiBase} row={row} canEdit={canEdit} canDelete={canDelete} />
                  </div>

                  <Separator className="my-3" />

                  <dl className="grid gap-4 tablet:grid-cols-3">
                    <SaleCell amount={row.sale} />
                    <RateCell label={t("warehouses.priceLists.rent")} schedule={row.rent} />
                    <RateCell label={t("warehouses.priceLists.penalty")} schedule={row.penalty} />
                  </dl>
                </Panel>
              </li>
            ))
          }
        </Collection>
      ) : (
        <ApiFailure result={pricesResult} />
      )}
    </PageShell>
  )
}

/** El precio de venta, o que no lo hay. */
async function SaleCell({ amount }: { amount: string }) {
  const t = await getTranslations("warehouses.priceLists")
  const format = await getFormatter()

  return (
    <div className="min-w-0">
      <dt className="text-body3 font-semibold text-content-faint">{t("sale")}</dt>
      <dd className="mt-1 text-body2">
        {blank(amount) ? (
          <span className="text-content-faint">{t("noPrice")}</span>
        ) : (
          <span className="font-semibold text-content tabular-nums">
            {formatAmount(amount, format)}
          </span>
        )}
      </dd>
    </div>
  )
}

/**
 * Una tarifa de renta o de penalización.
 *
 * **Una tarifa fija no enseña las periodicidades**: se cobra igual con cualquier frecuencia, así
 * que enseñar tres importes que no se usan sería contar tres precios donde hay uno. Lo dice con
 * palabras, que es lo que la spec pide y lo que evita la llamada de «me está cobrando otro
 * número».
 */
async function RateCell({ label, schedule }: { label: string; schedule: RateSchedule }) {
  const t = await getTranslations("warehouses.priceLists")
  const format = await getFormatter()

  const entries = schedule.isFixed
    ? entryOf("fixed", null, schedule.fixed)
    : FREQUENCIES.flatMap((frequency) =>
        entryOf(frequency, t(`frequencyOf.${frequency}`), schedule[frequency]),
      )

  return (
    <div className="min-w-0">
      <dt className="flex flex-wrap items-center gap-1.5 text-body3 font-semibold text-content-faint">
        {label}
        {schedule.isFixed ? <Badge>{t("fixedRate")}</Badge> : null}
      </dt>
      <dd className="mt-1 text-body2">
        {entries.length === 0 ? (
          <span className="text-content-faint">{t("noPrice")}</span>
        ) : (
          <ul className="grid gap-0.5">
            {entries.map((entry) => (
              <li key={entry.key} className="flex items-baseline justify-between gap-3">
                {entry.label ? <span className="text-content-muted">{entry.label}</span> : null}
                <span className="ml-auto font-semibold text-content tabular-nums">
                  {formatAmount(entry.amount, format)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  )
}

/** Un importe que se enseña, o nada. Un cero no llega a ser una fila: es la ausencia de una. */
function entryOf(
  key: string,
  label: string | null,
  amount: string | undefined,
): { key: string; label: string | null; amount: string }[] {
  return blank(amount) ? [] : [{ key, label, amount: amount as string }]
}

/**
 * La tarifa, cruzada con el catálogo.
 *
 * Sin nombre —el producto no cabe en las páginas que se pudieron traer— la fila se queda con su
 * identificador y se puede seguir editando: lo que falta es cómo se llama, no qué es.
 */
function toRow(price: ProductPriceRow, product: ProductOption | undefined): RateRow {
  return {
    productId: price.productId,
    productName: product?.name ?? price.productId,
    productCode: product?.code ?? "",
    sale: price.sale,
    rent: price.rent,
    penalty: price.penalty,
  }
}

/**
 * Si un importe del servidor es la ausencia de un precio.
 *
 * Cero no es un precio. La comparación va por la aritmética exacta del paquete compartido, que es
 * la misma con la que el motor decide, y no por `Number`.
 */
function blank(amount: string | undefined): boolean {
  return amount === undefined || isZero(money(amount))
}

/** Si una tarifa entera está vacía, mirando sólo lo que su modo hace valer. */
function scheduleBlank(schedule: RateSchedule): boolean {
  if (schedule.isFixed) return blank(schedule.fixed)
  return FREQUENCIES.every((frequency) => blank(schedule[frequency]))
}
