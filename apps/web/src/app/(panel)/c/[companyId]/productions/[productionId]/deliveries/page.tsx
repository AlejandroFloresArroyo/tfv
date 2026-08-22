import { ItemCard } from "@tfv/ui"
import { PackageCheck } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import {
  DELIVERY_DIRECTIONS,
  DELIVERY_STATUSES,
  type DeliveryRow,
  type ProductionRow,
} from "../../production.ts"
import { ProductionNav } from "../production-nav.tsx"
import { DeliveryDirectionBadge, DeliveryStatusBadge } from "./delivery-badges.tsx"
import { CreateDelivery } from "./delivery-create.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.deliveries.title") }
}

/**
 * Las notas de entrega de una producción.
 *
 * ## El recuento va en el subtítulo, no en una barra de progreso
 *
 * «Faltan 3 de 10» es la cifra con la que se decide si vale la pena abrir la nota, y decirlo en
 * palabras la deja legible sin color y sin interpretar una longitud. Una barra de progreso aquí
 * sería lo que `DESIGN.md` llama un rectángulo con sombra haciéndose pasar por contenido: ocupa el
 * ancho de una columna para decir un número de dos cifras.
 *
 * ## El orden lo pone el servidor
 *
 * De la más reciente a la más antigua, y no por nombre: lo que se está entregando hoy es lo último
 * que se abrió. Al revés que el inventario, que se recorre buscando una cosa concreta.
 */
export default async function ProductionDeliveriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; productionId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const { companyId, productionId } = await params
  const query = toSearchParams(await searchParams)
  const path =
    (await headers()).get("x-pathname") ?? `/c/${companyId}/productions/${productionId}/deliveries`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewProductions = can(company, "productions.productions.view")
  const canCreate = can(company, "productions.deliveries.create")

  const [productionResult, deliveriesResult] = await Promise.all([
    canViewProductions
      ? apiGet<ProductionRow>(`/companies/${companyId}/productions/${productionId}`)
      : Promise.resolve(null),
    apiGet<PageEnvelope<DeliveryRow>>(
      `/companies/${companyId}/productions/${productionId}/deliveries?${toApiQuery(query)}`,
    ),
  ])

  const filters: FilterSpec[] = [
    {
      kind: "multi",
      key: "status",
      label: t("productions.deliveries.status"),
      options: DELIVERY_STATUSES.map((status) => ({
        value: status,
        label: t(`productions.deliveries.state.${status}`),
      })),
    },
    {
      kind: "select",
      key: "direction",
      label: t("productions.deliveries.direction"),
      options: DELIVERY_DIRECTIONS.map((direction) => ({
        value: direction,
        label: t(`productions.deliveries.way.${direction}`),
      })),
    },
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("productions.deliveries.createdAt"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  const create = canCreate ? (
    <CreateDelivery companyId={companyId} productionId={productionId} />
  ) : undefined

  return (
    <PageShell
      title={t("productions.deliveries.title")}
      {...(productionResult?.ok
        ? {
            subtitle: t("productions.deliveries.subtitle", {
              production: productionResult.data.name,
            }),
          }
        : {})}
      actions={create}
    >
      <ProductionNav
        companyId={companyId}
        productionId={productionId}
        canViewProductions={canViewProductions}
        canViewCategories={can(company, "productions.categories.view")}
        canViewItems={can(company, "productions.products.view")}
        canViewDeliveries={can(company, "productions.deliveries.view")}
        canViewWorkflows={can(company, "productions.workflows.view")}
        canViewBudget={can(company, "productions.budgets.view")}
        canViewAnchors={can(company, "productions.anchors.view")}
        canViewShoppings={can(company, "productions.shoppings.view")}
        canViewScript={can(company, "productions.chapters.view")}
        canViewRodaje={can(company, "productions.recordings.view")}
      />

      <Collection
        params={query}
        result={deliveriesResult}
        filters={filters}
        searchPlaceholder={t("productions.deliveries.searchPlaceholder")}
        emptyTitle={t("productions.deliveries.empty")}
        emptyBody={t("productions.deliveries.emptyBody")}
        {...(create === undefined ? {} : { emptyAction: create })}
      >
        {(items, view) =>
          items.map((delivery) => (
            <ItemCard
              key={delivery.id}
              view={view}
              media={
                <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <PackageCheck className="size-4" aria-hidden="true" />
                </span>
              }
              title={
                <Link
                  href={`/c/${companyId}/productions/${productionId}/deliveries/${delivery.id}`}
                  className="rounded-xs hover:underline"
                >
                  {delivery.name}
                </Link>
              }
              subtitle={
                delivery.counts.total === 0
                  ? t("productions.deliveries.noPieces")
                  : t("productions.deliveries.verifiedOf", {
                      verified: delivery.counts.verified,
                      total: delivery.counts.total,
                    })
              }
              meta={
                <>
                  <DeliveryDirectionBadge direction={delivery.direction} />
                  <DeliveryStatusBadge status={delivery.status} />
                </>
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
