import { ItemCard } from "@tfv/ui"
import { Armchair } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { Photo } from "~/components/photo.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import {
  ITEM_STATUSES,
  type ItemRow,
  type ProductionCategoryRow,
  type ProductionRow,
} from "../../production.ts"
import { ProductionNav } from "../production-nav.tsx"
import { CreateItem, ItemRowActions } from "./item-actions.tsx"
import { ItemStatusBadge } from "./item-badges.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.items.title") }
}

/**
 * El inventario de utilería.
 *
 * Una fila es **un objeto físico**: una silla concreta, con su etiqueta pegada. Eso decide la
 * pantalla entera.
 *
 * ## El código va en mono y en el subtítulo, no escondido en la ficha
 *
 * Es lo que se dicta por teléfono desde una bodega y lo que se escanea al verificar una entrega.
 * Confundir `0` con `O` en un código de doce caracteres es un error de operación, y por eso la
 * familia mono existe en este sistema (`DESIGN.md`, la regla de la mono).
 *
 * ## El estado se filtra en múltiple, no en simple
 *
 * La pregunta que trae a alguien aquí casi nunca es «enséñame los perdidos». Es «enséñame lo que
 * no está bien», que son cuatro estados a la vez. Un desplegable de uno obligaría a mirar cuatro
 * veces y a sumar de memoria.
 */
export default async function ProductionItemsPage({
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
    (await headers()).get("x-pathname") ?? `/c/${companyId}/productions/${productionId}/items`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewProductions = can(company, "productions.productions.view")
  const canViewCategories = can(company, "productions.categories.view")
  const canCreate = can(company, "productions.products.create")

  const [productionResult, itemsResult, categoriesResult] = await Promise.all([
    canViewProductions
      ? apiGet<ProductionRow>(`/companies/${companyId}/productions/${productionId}`)
      : Promise.resolve(null),
    apiGet<PageEnvelope<ItemRow>>(
      `/companies/${companyId}/productions/${productionId}/items?${toApiQuery(query)}`,
    ),
    // Sin la clave de categorías el desplegable no se ofrece: pedirlas devolvería `403`, y enseñar
    // la lista vacía diría que la producción no tiene categorías, que es otra cosa.
    canViewCategories
      ? apiGet<PageEnvelope<ProductionCategoryRow>>(
          `/companies/${companyId}/productions/${productionId}/categories?limit=96`,
        )
      : Promise.resolve(null),
  ])

  const categories = categoriesResult?.ok
    ? categoriesResult.data.items.map((one) => ({ id: one.id, name: one.name }))
    : []

  const filters: FilterSpec[] = [
    {
      kind: "multi",
      key: "status",
      label: t("productions.items.status"),
      options: ITEM_STATUSES.map((status) => ({
        value: status,
        label: t(`productions.items.state.${status}`),
      })),
    },
    ...(categories.length > 0
      ? ([
          {
            kind: "select",
            key: "categoryId",
            label: t("productions.items.category"),
            options: categories.map((one) => ({ value: one.id, label: one.name })),
          },
        ] as const)
      : []),
    {
      kind: "boolean",
      key: "isInventoriable",
      label: t("productions.items.inventoriable"),
      trueLabel: t("productions.items.inventoriableYes"),
      falseLabel: t("productions.items.inventoriableNo"),
    },
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("productions.items.createdAt"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  const create = canCreate ? (
    <CreateItem companyId={companyId} productionId={productionId} categories={categories} />
  ) : undefined

  return (
    <PageShell
      title={t("productions.items.title")}
      {...(productionResult?.ok
        ? { subtitle: t("productions.items.subtitle", { production: productionResult.data.name }) }
        : {})}
      actions={create}
    >
      <ProductionNav
        companyId={companyId}
        productionId={productionId}
        canViewProductions={canViewProductions}
        canViewCategories={canViewCategories}
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
        result={itemsResult}
        filters={filters}
        searchPlaceholder={t("productions.items.searchPlaceholder")}
        emptyTitle={t("productions.items.empty")}
        emptyBody={t("productions.items.emptyBody")}
        {...(create === undefined ? {} : { emptyAction: create })}
      >
        {(items, view) =>
          items.map((item) => (
            <ItemCard
              key={item.id}
              view={view}
              media={
                item.images[0] ? (
                  <Photo
                    src={item.images[0].thumbnailUrl ?? item.images[0].url}
                    className="size-9 shrink-0 rounded-sm object-cover"
                  />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                    <Armchair className="size-4" aria-hidden="true" />
                  </span>
                )
              }
              title={item.name}
              subtitle={
                <span className="font-mono">
                  {item.code}
                  {item.categoryName ? (
                    <span className="font-sans text-content-faint"> · {item.categoryName}</span>
                  ) : null}
                </span>
              }
              meta={<ItemStatusBadge status={item.status} />}
              actions={
                <ItemRowActions
                  companyId={companyId}
                  productionId={productionId}
                  item={item}
                  categories={categories}
                  canEdit={can(company, "productions.products.edit")}
                  canChangeStatus={can(company, "productions.products.status")}
                  canDelete={can(company, "productions.products.delete")}
                />
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
