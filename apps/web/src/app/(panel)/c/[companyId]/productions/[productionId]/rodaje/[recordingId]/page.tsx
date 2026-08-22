import { Panel } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiCall } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import { ProductionNav } from "../../production-nav.tsx"
import { RecordingKindBadge, RecordingStatusBadge } from "../recording-badges.tsx"
import { RodajeNav } from "../rodaje-nav.tsx"
import { AddLooseContinuity, AssignCast } from "./cast-assign.tsx"
import { ContinuityPanel } from "./continuity-panel.tsx"
import {
  CloseRecording,
  DeleteRecording,
  EditRecording,
  OpenRecording,
} from "./recording-detail-actions.tsx"
import { RecordingNotes } from "./recording-notes.tsx"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; recordingId: string }>
}): Promise<Metadata> {
  const t = await getTranslations()
  const { companyId, productionId, recordingId } = await params

  const result = await apiCall(
    "GET /companies/{companyId}/productions/{productionId}/recordings/{recordingId}",
    { params: { companyId, productionId, recordingId } },
  )

  return { title: result.ok ? result.data.name : t("productions.recordings.title") }
}

/**
 * La ficha de una jornada: reparto, continuidad y el cuaderno del script.
 *
 * Es el aterrizaje de todo lo que `rodaje-recorrido.test.ts` recorre después de programar el día:
 * asignar reparto abre una continuidad por personaje y pone la jornada en curso; colgar utilería en
 * una continuidad es donde el catálogo y la continuidad se tocan; y **cerrar no exige que el
 * reparto tenga su utilería completa** — el día se acaba cuando se acaba, escrito en la cabecera de
 * `closeRecordingRoute`.
 */
export default async function RecordingDetailPage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; recordingId: string }>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId, productionId, recordingId } = await params
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/rodaje/${recordingId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canEdit = can(company, "productions.recordings.edit")
  const canAssignCast = can(company, "productions.recordings.characters")
  const canClose = can(company, "productions.recordings.close")
  const canOpen = can(company, "productions.recordings.open")
  const canDelete = can(company, "productions.recordings.delete")
  const canWriteNotes = can(company, "productions.recordings.notes")
  const canCreateContinuity = can(company, "productions.continuities.create")
  const canDeleteContinuity = can(company, "productions.continuities.delete")
  const canEditItems = can(company, "productions.continuities.products")
  const canEditVideos = can(company, "productions.continuities.videos")
  const canSetCharacter = can(company, "productions.continuities.character")
  const canViewCharacters = can(company, "productions.characters.view")
  const canViewItems = can(company, "productions.products.view")
  const canViewVideos = can(company, "productions.videos.view")
  const canViewScenes = can(company, "productions.scenes.view")

  const [recordingResult, charactersResult, itemsResult, videosResult, scenesResult] =
    await Promise.all([
      apiCall("GET /companies/{companyId}/productions/{productionId}/recordings/{recordingId}", {
        params: { companyId, productionId, recordingId },
      }),
      canAssignCast && canViewCharacters
        ? apiCall("GET /companies/{companyId}/productions/{productionId}/characters", {
            params: { companyId, productionId },
            query: { limit: "200" },
          })
        : Promise.resolve(null),
      canEditItems && canViewItems
        ? apiCall("GET /companies/{companyId}/productions/{productionId}/items", {
            params: { companyId, productionId },
            query: { limit: "96" },
          })
        : Promise.resolve(null),
      canEditVideos && canViewVideos
        ? apiCall("GET /companies/{companyId}/productions/{productionId}/videos", {
            params: { companyId, productionId },
            query: { limit: "96" },
          })
        : Promise.resolve(null),
      canEdit && canViewScenes
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
        canViewItems={canViewItems}
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
        canViewCharacters={canViewCharacters}
        canViewSets={can(company, "productions.sets.view")}
        canViewVideos={canViewVideos}
      />
    </>
  )

  if (!recordingResult.ok) {
    return (
      <PageShell title={t("productions.recordings.title")}>
        {nav}
        <ApiFailure result={recordingResult} />
      </PageShell>
    )
  }

  const recording = recordingResult.data
  const characters = charactersResult?.ok ? charactersResult.data.items : []
  const items = itemsResult?.ok ? itemsResult.data.items : []
  const videos = videosResult?.ok ? videosResult.data.items : []
  const scenes = scenesResult?.ok ? scenesResult.data.items : []
  const open = recording.status !== "completed"

  return (
    <PageShell
      title={recording.name}
      subtitle={t("productions.recordings.detailSubtitle")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <EditRecording
              companyId={companyId}
              productionId={productionId}
              recording={recording}
              scenes={scenes}
            />
          ) : null}

          {recording.status !== "completed" && canClose ? (
            <CloseRecording
              companyId={companyId}
              productionId={productionId}
              recording={recording}
            />
          ) : null}

          {recording.status === "completed" && canOpen ? (
            <OpenRecording
              companyId={companyId}
              productionId={productionId}
              recording={recording}
            />
          ) : null}

          {canDelete ? (
            <DeleteRecording
              companyId={companyId}
              productionId={productionId}
              recording={recording}
            />
          ) : null}
        </div>
      }
    >
      {nav}

      <div className="flex flex-col gap-6">
        <Panel className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <RecordingStatusBadge status={recording.status} />
            <RecordingKindBadge kind={recording.kind} />
          </div>

          <dl className="grid gap-x-6 gap-y-3 tablet:grid-cols-3">
            <div>
              <dt className="legend text-content-faint">{t("productions.recordings.scene")}</dt>
              <dd className="text-body2 text-content">
                {recording.scene
                  ? `${recording.scene.chapter.name} · ${recording.scene.name}`
                  : t("productions.recordings.noScene")}
              </dd>
            </div>

            <div>
              <dt className="legend text-content-faint">
                {t("productions.recordings.responsible")}
              </dt>
              <dd className="text-body2 text-content">
                {recording.responsibleName ?? t("productions.recordings.noResponsible")}
              </dd>
            </div>

            <div>
              <dt className="legend text-content-faint">{t("productions.recordings.createdAt")}</dt>
              <dd className="text-body2 text-content tabular-nums">
                {format.dateTime(new Date(recording.createdAt), { dateStyle: "medium" })}
              </dd>
            </div>
          </dl>
        </Panel>

        <section className="flex flex-col gap-3" aria-labelledby="reparto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="reparto" className="text-h4 font-semibold text-content">
              {t("productions.rodaje.cast")}
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              {canAssignCast && canViewCharacters ? (
                <AssignCast
                  companyId={companyId}
                  productionId={productionId}
                  recordingId={recordingId}
                  characters={characters}
                  continuities={recording.continuities}
                  isClosed={!open}
                />
              ) : null}

              {canCreateContinuity ? (
                <AddLooseContinuity
                  companyId={companyId}
                  productionId={productionId}
                  recordingId={recordingId}
                />
              ) : null}
            </div>
          </div>

          {recording.continuities.length === 0 ? (
            <Panel className="p-6 text-body1 text-content-muted">
              {t("productions.rodaje.noContinuities")}
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {recording.continuities.map((continuity) => (
                <ContinuityPanel
                  key={continuity.id}
                  companyId={companyId}
                  productionId={productionId}
                  recordingId={recordingId}
                  continuity={continuity}
                  items={items}
                  videos={videos}
                  characters={characters}
                  canEditItems={canEditItems}
                  canEditVideos={canEditVideos}
                  canSetCharacter={canSetCharacter}
                  canDelete={canDeleteContinuity}
                />
              ))}
            </div>
          )}
        </section>

        <RecordingNotes
          companyId={companyId}
          productionId={productionId}
          recordingId={recordingId}
          notes={recording.notes}
          canWrite={canWriteNotes}
        />
      </div>
    </PageShell>
  )
}
