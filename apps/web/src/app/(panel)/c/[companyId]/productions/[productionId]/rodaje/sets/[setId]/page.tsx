import { Panel } from "@tfv/ui"
import { Armchair } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { Photo } from "~/components/photo.tsx"
import { apiCall } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { ItemStatus } from "../../../../production.ts"
import { ItemStatusBadge } from "../../../items/item-badges.tsx"
import { ProductionNav } from "../../../production-nav.tsx"
import { RodajeNav } from "../../rodaje-nav.tsx"
import { SetRowActions } from "../set-actions.tsx"
import { ComposeSet } from "./set-compose.tsx"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; setId: string }>
}): Promise<Metadata> {
  const t = await getTranslations()
  const { companyId, productionId, setId } = await params

  const result = await apiCall(
    "GET /companies/{companyId}/productions/{productionId}/sets/{setId}",
    {
      params: { companyId, productionId, setId },
    },
  )

  return { title: result.ok ? result.data.name : t("productions.sets.title") }
}

/**
 * La ficha de un set: quién es y qué lleva.
 *
 * **Un set es una lista de artículos.** Sin ella la ficha sólo diría el nombre y la foto de un
 * decorado del que nadie sabría qué contiene, que es la mitad de lo que la spec pide de un set.
 */
export default async function SetDetailPage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; setId: string }>
}) {
  const t = await getTranslations()
  const { companyId, productionId, setId } = await params
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/rodaje/sets/${setId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canCompose = can(company, "productions.sets.products")
  // Componer exige elegir de entre el inventario. Sin la clave de artículos no se pide: devolvería
  // `403`, y una lista vacía diría que la producción no tiene utilería. Mismo razonamiento que
  // `deliveries/[deliveryId]/page.tsx`.
  const canViewItems = can(company, "productions.products.view")

  const [setResult, itemsResult] = await Promise.all([
    apiCall("GET /companies/{companyId}/productions/{productionId}/sets/{setId}", {
      params: { companyId, productionId, setId },
    }),
    canCompose && canViewItems
      ? apiCall("GET /companies/{companyId}/productions/{productionId}/items", {
          params: { companyId, productionId },
          query: { limit: "96" },
        })
      : Promise.resolve(null),
  ])

  const nav = (
    <>
      <ProductionNav
        companyId={companyId}
        productionId={productionId}
        canViewProductions={can(company, "productions.productions.view")}
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
        canViewCharacters={can(company, "productions.characters.view")}
        canViewSets={can(company, "productions.sets.view")}
        canViewVideos={can(company, "productions.videos.view")}
      />
    </>
  )

  if (!setResult.ok) {
    return (
      <PageShell title={t("productions.sets.title")}>
        {nav}
        <ApiFailure result={setResult} />
      </PageShell>
    )
  }

  const set = setResult.data
  const items = set.items ?? []

  return (
    <PageShell
      title={set.name}
      subtitle={t("productions.sets.detailSubtitle")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canCompose && canViewItems ? (
            <ComposeSet
              companyId={companyId}
              productionId={productionId}
              set={set}
              items={itemsResult?.ok ? itemsResult.data.items : []}
            />
          ) : null}
          <SetRowActions
            companyId={companyId}
            productionId={productionId}
            set={set}
            canEdit={can(company, "productions.sets.edit")}
            canDelete={can(company, "productions.sets.delete")}
          />
        </div>
      }
    >
      {nav}

      <div className="flex flex-col gap-6">
        <Panel className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-4">
            {set.imageUrl ? (
              <Photo
                src={set.imageThumbnailUrl ?? set.imageUrl}
                className="size-16 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-panel-hover text-content-muted">
                <Armchair className="size-6" aria-hidden="true" />
              </span>
            )}
            {set.description ? (
              <p className="text-body1 text-content-muted">{set.description}</p>
            ) : null}
          </div>
        </Panel>

        <section className="flex flex-col gap-3" aria-labelledby="composicion">
          <h2 id="composicion" className="text-h4 font-semibold text-content">
            {t("productions.sets.composition")}
          </h2>

          {items.length === 0 ? (
            <Panel className="p-6 text-body1 text-content-muted">
              {t("productions.sets.emptyComposition")}
            </Panel>
          ) : (
            <Panel className="overflow-hidden">
              <ul>
                {items.map((item) => (
                  <li
                    key={item.itemId}
                    className="flex items-center gap-3 px-4 py-3 not-last:border-edge not-last:border-b"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body1 text-content">{item.name}</p>
                      <p className="truncate font-mono text-body3 text-content-faint">
                        {item.code}
                      </p>
                    </div>
                    {/* El estado llega como cadena suelta del contrato de la ficha del set —no del
                        esquema del artículo—, así que se afirma aquí lo que el servidor ya
                        garantiza: es uno de los ocho estados del inventario. */}
                    <ItemStatusBadge status={item.status as ItemStatus} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </section>
      </div>
    </PageShell>
  )
}
