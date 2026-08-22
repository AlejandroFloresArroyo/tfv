import { ItemCard } from "@tfv/ui"
import { Armchair } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Collection } from "~/components/collection/collection.tsx"
import {
  type FilterSpec,
  toApiQueryRecord,
  toSearchParams,
} from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { Photo } from "~/components/photo.tsx"
import { apiCall } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import { ProductionNav } from "../../production-nav.tsx"
import { RodajeNav } from "../rodaje-nav.tsx"
import { CreateSet, SetRowActions } from "./set-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.sets.title") }
}

/**
 * Los sets (decorados) de la producción.
 *
 * Cada tarjeta lleva a su ficha, donde vive la composición: **un set es una lista de artículos**, y
 * la lista se compone ahí, no aquí — un artículo puede estar en varios sets a la vez, así que
 * componerlo desde la tarjeta obligaría a traer el inventario entero a este listado para nada.
 */
export default async function SetsPage({
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
    (await headers()).get("x-pathname") ?? `/c/${companyId}/productions/${productionId}/rodaje/sets`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canCreate = can(company, "productions.sets.create")

  const setsResult = await apiCall("GET /companies/{companyId}/productions/{productionId}/sets", {
    params: { companyId, productionId },
    query: toApiQueryRecord(query),
  })

  const nav = (
    <>
      <ProductionNav
        companyId={companyId}
        productionId={productionId}
        canViewProductions={can(company, "productions.productions.view")}
        canViewCategories={can(company, "productions.categories.view")}
        canViewItems={can(company, "productions.products.view")}
        canViewDeliveries={can(company, "productions.deliveries.view")}
        canViewWorkflows={can(company, "productions.workflows.view")}
        canViewBudget={can(company, "productions.budgets.view")}
        canViewAnchors={can(company, "productions.anchors.view")}
        canViewShoppings={can(company, "productions.shoppings.view")}
      />
      <RodajeNav
        companyId={companyId}
        productionId={productionId}
        canViewRecordings={can(company, "productions.recordings.view")}
        canViewCharacters={can(company, "productions.characters.view")}
        canViewSets={can(company, "productions.sets.view")}
        canViewVideos={can(company, "productions.videos.view")}
      />
    </>
  )

  const filters: FilterSpec[] = [
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("productions.sets.createdAt"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  const create = canCreate ? (
    <CreateSet companyId={companyId} productionId={productionId} />
  ) : undefined

  return (
    <PageShell title={t("productions.sets.title")} actions={create}>
      {nav}

      <Collection
        params={query}
        result={setsResult}
        filters={filters}
        searchPlaceholder={t("productions.sets.searchPlaceholder")}
        emptyTitle={t("productions.sets.empty")}
        emptyBody={t("productions.sets.emptyBody")}
        {...(create === undefined ? {} : { emptyAction: create })}
      >
        {(sets, view) =>
          sets.map((set) => (
            <ItemCard
              key={set.id}
              view={view}
              media={
                set.imageUrl ? (
                  <Photo
                    src={set.imageThumbnailUrl ?? set.imageUrl}
                    className="size-9 shrink-0 rounded-sm object-cover"
                  />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                    <Armchair className="size-4" aria-hidden="true" />
                  </span>
                )
              }
              title={
                <Link
                  href={`/c/${companyId}/productions/${productionId}/rodaje/sets/${set.id}`}
                  className="hover:underline"
                >
                  {set.name}
                </Link>
              }
              subtitle={t("productions.sets.itemCount", { count: set.itemCount })}
              actions={
                <SetRowActions
                  companyId={companyId}
                  productionId={productionId}
                  set={set}
                  canEdit={can(company, "productions.sets.edit")}
                  canDelete={can(company, "productions.sets.delete")}
                />
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
