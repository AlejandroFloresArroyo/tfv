import { ItemCard } from "@tfv/ui"
import { Clapperboard } from "lucide-react"
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
import { apiCall } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import { RECORDING_KINDS, RECORDING_STATUSES } from "../../production.ts"
import { ProductionNav } from "../production-nav.tsx"
import { CreateRecording } from "./recording-actions.tsx"
import { RecordingKindBadge, RecordingStatusBadge } from "./recording-badges.tsx"
import { RodajeNav } from "./rodaje-nav.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.rodaje.title") }
}

/**
 * Rodaje: las jornadas.
 *
 * Aterrizaje de la pestaña que añade `production-nav.tsx` — esa base exacta, `${base}/rodaje` con
 * `active = startsWith`, la construye el encargo del guion en paralelo—. Personajes, sets y videos
 * son sus catálogos; esto es el trabajo del día: una jornada es un día de rodaje de una escena, y
 * asignarle reparto —dentro de la ficha, `[recordingId]/page.tsx`— abre una continuidad por
 * personaje y pone la jornada en curso.
 */
export default async function RodajePage({
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
    (await headers()).get("x-pathname") ?? `/c/${companyId}/productions/${productionId}/rodaje`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canCreate = can(company, "productions.recordings.create")
  const canViewScenes = can(company, "productions.scenes.view")

  const [recordingsResult, scenesResult] = await Promise.all([
    apiCall("GET /companies/{companyId}/productions/{productionId}/recordings", {
      params: { companyId, productionId },
      query: toApiQueryRecord(query),
    }),
    canCreate && canViewScenes
      ? apiCall("GET /companies/{companyId}/productions/{productionId}/scenes", {
          params: { companyId, productionId },
          query: { limit: "200" },
        })
      : Promise.resolve(null),
  ])

  const nav = (
    <>
      <ProductionNav
        companyId={companyId}
        productionId={productionId}
        canViewProductions={can(company, "productions.productions.view")}
        canViewScript={can(company, "productions.chapters.view")}
        canViewRodaje={can(company, "productions.recordings.view")}
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
      kind: "multi",
      key: "status",
      label: t("productions.recordings.status"),
      options: RECORDING_STATUSES.map((status) => ({
        value: status,
        label: t(`productions.recordingStatus.${status}`),
      })),
    },
    {
      kind: "multi",
      key: "kind",
      label: t("productions.recordings.kind.label"),
      options: RECORDING_KINDS.map((kind) => ({
        value: kind,
        label: t(`productions.recordings.kind.${kind}`),
      })),
    },
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("productions.recordings.createdAt"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  const create = canCreate ? (
    <CreateRecording
      companyId={companyId}
      productionId={productionId}
      scenes={scenesResult?.ok ? scenesResult.data.items : []}
    />
  ) : undefined

  return (
    <PageShell title={t("productions.rodaje.title")} actions={create}>
      {nav}

      <Collection
        params={query}
        result={recordingsResult}
        filters={filters}
        searchPlaceholder={t("productions.recordings.searchPlaceholder")}
        emptyTitle={t("productions.recordings.empty")}
        emptyBody={t("productions.recordings.emptyBody")}
        {...(create === undefined ? {} : { emptyAction: create })}
      >
        {(recordings, view) =>
          recordings.map((recording) => (
            <ItemCard
              key={recording.id}
              view={view}
              media={
                <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <Clapperboard className="size-4" aria-hidden="true" />
                </span>
              }
              title={
                <Link
                  href={`/c/${companyId}/productions/${productionId}/rodaje/${recording.id}`}
                  className="hover:underline"
                >
                  {recording.name}
                </Link>
              }
              subtitle={recording.responsibleName ?? t("productions.recordings.noResponsible")}
              meta={
                <div className="flex flex-wrap items-center gap-2">
                  <RecordingStatusBadge status={recording.status} />
                  <RecordingKindBadge kind={recording.kind} />
                </div>
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
