import { Badge, Panel } from "@tfv/ui"
import { Drama, Shirt, Video } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { Photo } from "~/components/photo.tsx"
import { apiCall } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import { ProductionNav } from "../../../production-nav.tsx"
import { recordingStatusTone } from "../../recording-badges.tsx"
import { partitionProps } from "../../rodaje-logic.ts"
import { RodajeNav } from "../../rodaje-nav.tsx"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; characterId: string }>
}): Promise<Metadata> {
  const t = await getTranslations()
  const { companyId, productionId, characterId } = await params

  const result = await apiCall(
    "GET /companies/{companyId}/productions/{productionId}/characters/{characterId}",
    { params: { companyId, productionId, characterId } },
  )

  return { title: result.ok ? result.data.name : t("productions.characters.title") }
}

/**
 * El cuaderno del script de un personaje.
 *
 * `characterContinuityRoute` en el servidor —«¿cómo iba Marta en marzo?»— y aquí, en jornadas: en
 * cuáles apareció, con qué escena y qué utilería llevaba encima. Es el extremo de personaje del
 * mismo recorrido que `rodaje-recorrido.test.ts` demuestra desde el artículo: «¿dónde ha estado
 * esta chamarra?» y «¿qué llevaba puesto este personaje?» son la misma pregunta leída al revés.
 *
 * ## Por qué no hay enlace de vuelta hacia el artículo
 *
 * El catálogo de artículos (`productions.products.*`) no es de esta familia de permisos y su
 * pantalla —`items/`— no tiene ficha propia a la que enlazar: es lista con diálogos, sin
 * `[itemId]/page.tsx`. Enlazar ahí sería apuntar a una dirección que no existe. Queda anotado en
 * `HALLAZGOS.md`: el recorrido completo, en las dos direcciones, sólo se cierra el día que el
 * inventario tenga ficha.
 */
export default async function CharacterHistoryPage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; characterId: string }>
}) {
  const t = await getTranslations()
  const { companyId, productionId, characterId } = await params
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/rodaje/characters/${characterId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewCharacter = can(company, "productions.characters.view")

  const [characterResult, historyResult] = await Promise.all([
    canViewCharacter
      ? apiCall("GET /companies/{companyId}/productions/{productionId}/characters/{characterId}", {
          params: { companyId, productionId, characterId },
        })
      : Promise.resolve(null),
    apiCall(
      "GET /companies/{companyId}/productions/{productionId}/characters/{characterId}/continuity",
      { params: { companyId, productionId, characterId } },
    ),
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
        canViewCharacters={canViewCharacter}
        canViewSets={can(company, "productions.sets.view")}
        canViewVideos={can(company, "productions.videos.view")}
      />
    </>
  )

  if (!historyResult.ok) {
    return (
      <PageShell title={t("productions.characters.history.title")}>
        {nav}
        <ApiFailure result={historyResult} />
      </PageShell>
    )
  }

  const history = historyResult.data
  const character = characterResult?.ok ? characterResult.data : null

  return (
    <PageShell
      title={character?.name ?? history.characterName}
      subtitle={t("productions.characters.history.subtitle")}
    >
      {nav}

      <div className="flex flex-col gap-6">
        {character ? (
          <Panel className="flex items-center gap-4 p-5">
            {character.imageUrl ? (
              <Photo
                src={character.imageThumbnailUrl ?? character.imageUrl}
                className="size-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="grid size-16 shrink-0 place-items-center rounded-full bg-panel-hover text-content-muted">
                <Drama className="size-6" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              {character.description ? (
                <p className="text-body2 text-content-muted">{character.description}</p>
              ) : null}
              <p className="mt-1 text-body3 text-content-faint">
                {t("productions.characters.history.recordingCount", {
                  count: history.recordings.length,
                })}
              </p>
            </div>
          </Panel>
        ) : null}

        {history.recordings.length === 0 ? (
          <Panel className="p-6 text-body1 text-content-muted">
            {t("productions.characters.history.empty")}
          </Panel>
        ) : (
          <ul className="flex flex-col gap-3">
            {history.recordings.map((entry) => {
              const partition = partitionProps(entry.props)

              return (
                <li key={entry.continuityId}>
                  <Panel
                    tint={recordingStatusTone(entry.status)}
                    className="flex flex-col gap-3 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/c/${companyId}/productions/${productionId}/rodaje/${entry.recordingId}`}
                          className="text-body1 font-semibold text-content hover:underline"
                        >
                          {entry.recordingName}
                        </Link>
                        <p className="text-body3 text-content-faint">
                          {entry.sceneName
                            ? entry.chapterName
                              ? `${entry.chapterName} · ${entry.sceneName}`
                              : entry.sceneName
                            : t("productions.recordings.noScene")}
                        </p>
                      </div>
                      <Badge tone={recordingStatusTone(entry.status)}>
                        {t(`productions.recordingStatus.${entry.status}`)}
                      </Badge>
                    </div>

                    {partition.items.length === 0 && partition.videos.length === 0 ? (
                      <p className="text-body3 text-content-faint">
                        {t("productions.characters.history.noProps")}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        {partition.items.length > 0 ? (
                          <div className="flex items-start gap-2">
                            <Shirt
                              className="mt-0.5 size-4 shrink-0 text-content-faint"
                              aria-hidden="true"
                            />
                            <p className="text-body3 text-content-muted">
                              {partition.items.map((prop) => prop.name).join(" · ")}
                            </p>
                          </div>
                        ) : null}

                        {partition.videos.length > 0 ? (
                          <div className="flex items-start gap-2">
                            <Video
                              className="mt-0.5 size-4 shrink-0 text-content-faint"
                              aria-hidden="true"
                            />
                            <p className="text-body3 text-content-muted">
                              {partition.videos.map((prop) => prop.name).join(" · ")}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </Panel>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </PageShell>
  )
}
