import { ItemCard } from "@tfv/ui"
import { Film } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { Collection } from "~/components/collection/collection.tsx"
import {
  type FilterSpec,
  toApiQueryRecord,
  toSearchParams,
} from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiCall } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import { ProductionNav } from "../../production-nav.tsx"
import { RodajeNav } from "../rodaje-nav.tsx"
import { CreateVideo, PlayVideo, VideoRowActions } from "./video-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.videos.title") }
}

/**
 * La biblioteca de videos de referencia.
 *
 * Cada tarjeta lleva su propio reproductor —`PlayVideo`—, porque es lo que la spec pide y lo que
 * distingue a un video de una foto: no basta con verlo, hay que poder reproducirlo sin salir de la
 * lista.
 */
export default async function VideosPage({
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
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/rodaje/videos`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canCreate = can(company, "productions.videos.create")
  const canViewCategories = can(company, "productions.categories.view")
  const canSelectCategory = can(company, "productions.videos.select_category")

  const [videosResult, categoriesResult] = await Promise.all([
    apiCall("GET /companies/{companyId}/productions/{productionId}/videos", {
      params: { companyId, productionId },
      query: toApiQueryRecord(query),
    }),
    // Es un árbol —«sin parentId, las raíces»—, no una colección paginada: no admite `limit`. El
    // selector de categoría de un video sólo ofrece las raíces, igual que ya hace `items/page.tsx`
    // con el mismo endpoint.
    canViewCategories
      ? apiCall("GET /companies/{companyId}/productions/{productionId}/categories", {
          params: { companyId, productionId },
        })
      : Promise.resolve(null),
  ])

  const categories: { id: string; name: string }[] = categoriesResult?.ok
    ? categoriesResult.data.items.map((one) => ({ id: one.id, name: one.name }))
    : []

  const nav = (
    <>
      <ProductionNav
        companyId={companyId}
        productionId={productionId}
        canViewProductions={can(company, "productions.productions.view")}
        canViewCategories={canViewCategories}
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
    ...(categories.length > 0
      ? ([
          {
            kind: "select",
            key: "categoryId",
            label: t("productions.videos.category"),
            options: categories.map((one) => ({ value: one.id, label: one.name })),
          },
        ] as const)
      : []),
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("productions.videos.createdAt"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  const create = canCreate ? (
    <CreateVideo
      companyId={companyId}
      productionId={productionId}
      categories={categories}
      canSelectCategory={canSelectCategory}
    />
  ) : undefined

  return (
    <PageShell title={t("productions.videos.title")} actions={create}>
      {nav}

      <Collection
        params={query}
        result={videosResult}
        filters={filters}
        searchPlaceholder={t("productions.videos.searchPlaceholder")}
        emptyTitle={t("productions.videos.empty")}
        emptyBody={t("productions.videos.emptyBody")}
        {...(create === undefined ? {} : { emptyAction: create })}
      >
        {(videos, view) =>
          videos.map((item) => (
            <ItemCard
              key={item.id}
              view={view}
              media={
                <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <Film className="size-4" aria-hidden="true" />
                </span>
              }
              title={item.name}
              subtitle={item.categoryName ?? t("productions.videos.noCategory")}
              meta={<PlayVideo video={item} />}
              actions={
                <VideoRowActions
                  companyId={companyId}
                  productionId={productionId}
                  item={item}
                  categories={categories}
                  canEdit={can(company, "productions.videos.edit")}
                  canSelectCategory={canSelectCategory}
                  canDelete={can(company, "productions.videos.delete")}
                />
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
