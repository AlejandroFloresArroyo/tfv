import { Badge } from "@tfv/ui"
import { Paperclip } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { formatAmount } from "~/lib/amount.ts"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { AnchorRow, ProductionCategoryRow, ProductionRow } from "../../../production.ts"
import { ProductionNav } from "../../production-nav.tsx"
import { BudgetNav } from "../budget-nav.tsx"
import { CreateAnchor, DeleteAnchor, EditAnchor } from "./anchor-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.budget.anchors") }
}

/**
 * Las partidas presupuestadas de una producción.
 *
 * ## Tabla y no tarjetas
 *
 * Lo que se hace aquí es **comparar importes**, y para eso las cifras tienen que estar alineadas en
 * una columna. En tarjetas cada importe cae donde le toca según lo largo que sea el nombre, y la
 * comparación —que es el trabajo— se vuelve imposible sin leer las once.
 *
 * ## El importe va alineado a la derecha y en cifras tabulares
 *
 * Es la única forma de que 9.000 y 90.000 se distingan por su longitud sin leerlos. Es también lo
 * que hace la hoja impresa, y por el mismo motivo.
 */
export default async function ProductionAnchorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; productionId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId, productionId } = await params
  const query = toSearchParams(await searchParams)

  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/budget/anchors`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewProductions = can(company, "productions.productions.view")
  const canViewCategories = can(company, "productions.categories.view")
  const canCreate = can(company, "productions.anchors.create")
  const canEdit = can(company, "productions.anchors.edit")
  const canDelete = can(company, "productions.anchors.delete")

  const [productionResult, anchorsResult, categoriesResult] = await Promise.all([
    canViewProductions
      ? apiGet<ProductionRow>(`/companies/${companyId}/productions/${productionId}`)
      : Promise.resolve(null),
    apiGet<PageEnvelope<AnchorRow>>(
      `/companies/${companyId}/productions/${productionId}/anchors?${toApiQuery(query)}`,
    ),
    canViewCategories
      ? apiGet<{ items: ProductionCategoryRow[] }>(
          `/companies/${companyId}/productions/${productionId}/categories?limit=96`,
        )
      : Promise.resolve(null),
  ])

  const categories = categoriesResult?.ok ? categoriesResult.data.items : []

  const filters: FilterSpec[] = [
    ...(categories.length > 0
      ? [
          {
            kind: "select" as const,
            key: "categoryId",
            label: t("productions.budget.category"),
            options: categories.map((category) => ({
              value: category.id,
              label: category.name,
            })),
          },
        ]
      : []),
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("productions.budget.createdAt"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  const create = canCreate ? (
    <CreateAnchor
      companyId={companyId}
      productionId={productionId}
      categories={categories}
      // El catálogo cerrado no tiene `anchors.select_category`: clasificar un ancla va con la clave
      // de crearla o editarla. Ver `HALLAZGOS.md` H-230.
      canSelectCategory={canViewCategories}
    />
  ) : undefined

  return (
    <PageShell
      title={t("productions.budget.anchors")}
      {...(productionResult?.ok ? { subtitle: productionResult.data.name } : {})}
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
      <BudgetNav
        companyId={companyId}
        productionId={productionId}
        canViewBudget={can(company, "productions.budgets.view")}
        canViewAnchors={can(company, "productions.anchors.view")}
        canViewShoppings={can(company, "productions.shoppings.view")}
      />

      <Collection
        params={query}
        result={anchorsResult}
        filters={filters}
        views={false}
        searchPlaceholder={t("productions.budget.searchAnchors")}
        emptyTitle={t("productions.budget.noAnchors")}
        emptyBody={t("productions.budget.noAnchorsBody")}
        {...(create === undefined ? {} : { emptyAction: create })}
      >
        {(items) => (
          <div className="overflow-x-auto rounded-lg border border-edge">
            <table className="w-full min-w-[40rem] border-collapse">
              <thead>
                <tr className="border-edge border-b bg-panel-sunken">
                  <th className="px-3 py-2 text-left legend text-content-muted">
                    {t("productions.budget.name")}
                  </th>
                  <th className="px-3 py-2 text-left legend text-content-muted">
                    {t("productions.budget.category")}
                  </th>
                  <th className="px-3 py-2 text-left legend text-content-muted">
                    {t("productions.budget.responsible")}
                  </th>
                  <th className="px-3 py-2 text-right legend text-content-muted">
                    {t("productions.budget.amount")}
                  </th>
                  <th className="px-3 py-2 text-right legend text-content-muted">
                    <span className="sr-only">{t("common.actions")}</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {items.map((anchor) => (
                  <tr key={anchor.id} className="not-last:border-edge not-last:border-b">
                    <td className="px-3 py-2.5">
                      <span className="text-body2 font-semibold text-content">{anchor.name}</span>
                      {anchor.description.trim() === "" ? null : (
                        <span className="mt-0.5 block max-w-prose text-body3 text-content-muted">
                          {anchor.description}
                        </span>
                      )}
                      {anchor.attachments.length > 0 ? (
                        <span className="mt-1 inline-flex items-center gap-1 text-body3 text-content-faint">
                          <Paperclip className="size-3.5" aria-hidden="true" />
                          {t("productions.budget.receiptCount", {
                            count: anchor.attachments.length,
                          })}
                        </span>
                      ) : null}
                    </td>

                    <td className="px-3 py-2.5">
                      {anchor.categoryName === null ? (
                        <span className="text-body3 text-content-faint">
                          {t("productions.budget.unclassified")}
                        </span>
                      ) : (
                        <Badge tone="reposo">{anchor.categoryName}</Badge>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-body2 text-content-muted">
                      {anchor.responsibleName ?? "—"}
                    </td>

                    <td className="px-3 py-2.5 text-right text-body2 tabular-nums text-content">
                      {formatAmount(anchor.amount, format)}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit ? (
                          <EditAnchor
                            companyId={companyId}
                            productionId={productionId}
                            anchor={anchor}
                            categories={categories}
                            canSelectCategory={canViewCategories}
                          />
                        ) : null}
                        {canDelete ? (
                          <DeleteAnchor
                            companyId={companyId}
                            productionId={productionId}
                            anchor={anchor}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Collection>
    </PageShell>
  )
}
