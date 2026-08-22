import { ItemCard } from "@tfv/ui"
import { Drama } from "lucide-react"
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
import { CharacterRowActions, CreateCharacter } from "./character-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.characters.title") }
}

/**
 * El reparto de la producción.
 *
 * Cada tarjeta lleva a su historial —`[characterId]`—, que es el cuaderno del script de ese
 * personaje: en qué jornadas apareció y qué llevaba puesto en cada una. Es el extremo del recorrido
 * que `rodaje-recorrido.test.ts` prueba contra el servidor: la pantalla lo deja hacer con clics.
 */
export default async function CharactersPage({
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
    `/c/${companyId}/productions/${productionId}/rodaje/characters`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canCreate = can(company, "productions.characters.create")

  const charactersResult = await apiCall(
    "GET /companies/{companyId}/productions/{productionId}/characters",
    { params: { companyId, productionId }, query: toApiQueryRecord(query) },
  )

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
      kind: "dateRange",
      key: "createdAt",
      label: t("productions.characters.createdAt"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  const create = canCreate ? (
    <CreateCharacter companyId={companyId} productionId={productionId} />
  ) : undefined

  return (
    <PageShell title={t("productions.characters.title")} actions={create}>
      {nav}

      <Collection
        params={query}
        result={charactersResult}
        filters={filters}
        searchPlaceholder={t("productions.characters.searchPlaceholder")}
        emptyTitle={t("productions.characters.empty")}
        emptyBody={t("productions.characters.emptyBody")}
        {...(create === undefined ? {} : { emptyAction: create })}
      >
        {(characters, view) =>
          characters.map((character) => (
            <ItemCard
              key={character.id}
              view={view}
              media={
                character.imageUrl ? (
                  <Photo
                    src={character.imageThumbnailUrl ?? character.imageUrl}
                    className="size-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-panel-hover text-content-muted">
                    <Drama className="size-4" aria-hidden="true" />
                  </span>
                )
              }
              title={
                <Link
                  href={`/c/${companyId}/productions/${productionId}/rodaje/characters/${character.id}`}
                  className="hover:underline"
                >
                  {character.name}
                </Link>
              }
              subtitle={
                character.continuityCount > 0
                  ? t("productions.characters.continuityCount", {
                      count: character.continuityCount,
                    })
                  : t("productions.characters.noContinuity")
              }
              actions={
                <CharacterRowActions
                  companyId={companyId}
                  productionId={productionId}
                  character={character}
                  canEdit={can(company, "productions.characters.edit")}
                  canDelete={can(company, "productions.characters.delete")}
                />
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
