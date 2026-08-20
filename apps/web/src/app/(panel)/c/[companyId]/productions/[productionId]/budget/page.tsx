import { Badge, BarChart, barRatios, type ChartRow, Panel, StatCard, shareOf } from "@tfv/ui"
import { FileText } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { formatAmount } from "~/lib/amount.ts"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { BudgetData, ProductionCategoryRow, ProductionRow } from "../../production.ts"
import { ProductionNav } from "../production-nav.tsx"
import { BudgetNav } from "./budget-nav.tsx"
import { CategoryFilter } from "./category-filter.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.budget.title") }
}

/**
 * El presupuesto de una producción: lo previsto contra lo ejecutado.
 *
 * ## La cifra primero, la gráfica después
 *
 * Arriba las tres cifras —presupuestado, gastado, diferencia—, porque son la respuesta a la
 * pregunta con la que se abre esta pantalla. Las gráficas van debajo y son **comparación**, no
 * dato: sirven para ver de un golpe si una categoría se comió el presupuesto, y para eso hace falta
 * verlas juntas, cosa que una tabla de veinte filas no consigue.
 *
 * ## Una diferencia negativa se dice con la palabra
 *
 * `DESIGN.md`: el color nunca viaja solo. Un sobrecoste no se señala pintando la cifra de rojo —eso
 * no llega a quien no distingue los tonos ni al papel— sino con una marca que **dice**
 * «desfavorable» al lado. El color acompaña; la palabra es lo que informa.
 *
 * ## El filtro por categoría enseña el peso sin perder el conjunto
 *
 * Es literalmente lo que la spec pide. Con una categoría puesta, las tres cifras pasan a ser las de
 * esa categoría y **debajo se sigue leyendo el total de la producción**. Sin la segunda mitad,
 * filtrar contestaría «se gastaron 30.000» sin decir de cuánto, que es la mitad de la respuesta.
 */
export default async function ProductionBudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; productionId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations("productions.budget")
  const format = await getFormatter()
  const { companyId, productionId } = await params
  const { categoryId } = await searchParams

  const path =
    (await headers()).get("x-pathname") ?? `/c/${companyId}/productions/${productionId}/budget`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const chosen = typeof categoryId === "string" && categoryId !== "" ? categoryId : null
  const canViewProductions = can(company, "productions.productions.view")
  const canViewCategories = can(company, "productions.categories.view")

  // Los dos filtros se mandan con el prefijo de su colección: son dos gramáticas sobre el mismo
  // camino, y el servidor las analiza por separado.
  const filter = chosen === null ? "" : `?anchor_categoryId=${chosen}&shopping_categoryId=${chosen}`

  const [productionResult, budgetResult, categoriesResult] = await Promise.all([
    canViewProductions
      ? apiGet<ProductionRow>(`/companies/${companyId}/productions/${productionId}`)
      : Promise.resolve(null),
    apiGet<BudgetData>(`/companies/${companyId}/productions/${productionId}/budget${filter}`),
    canViewCategories
      ? apiGet<{ items: ProductionCategoryRow[] }>(
          `/companies/${companyId}/productions/${productionId}/categories?limit=96`,
        )
      : Promise.resolve(null),
  ])

  const nav = (
    <>
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
      />
      <BudgetNav
        companyId={companyId}
        productionId={productionId}
        canViewBudget={can(company, "productions.budgets.view")}
        canViewAnchors={can(company, "productions.anchors.view")}
        canViewShoppings={can(company, "productions.shoppings.view")}
      />
    </>
  )

  if (!budgetResult.ok) {
    return (
      <PageShell title={t("title")}>
        {nav}
        <ApiFailure result={budgetResult} />
      </PageShell>
    )
  }

  const budget = budgetResult.data
  const amount = (value: string) => formatAmount(value, format)

  // Las dos barras de la comparación se escalan contra el mismo máximo: si cada una fuera contra sí
  // misma, saldrían las dos llenas y no dirían nada.
  const [budgeted, spent] = barRatios([
    budget.filtered.totalPresupuestado,
    budget.filtered.totalGastado,
  ])

  const comparison: ChartRow[] = [
    {
      key: "comparison",
      label: t("plannedVsSpent"),
      bars: [
        {
          label: t("budgeted"),
          value: amount(budget.filtered.totalPresupuestado),
          ratio: budgeted ?? 0,
          tint: "curso",
        },
        {
          label: t("spent"),
          value: amount(budget.filtered.totalGastado),
          ratio: spent ?? 0,
          tint: budget.filtered.isUnfavorable ? "alto" : "firme",
        },
      ],
    },
  ]

  /**
   * El desglose por categoría, con todas las barras contra el mismo máximo.
   *
   * Se escalan **las de las dos colecciones juntas**: si lo presupuestado se escalara contra su
   * máximo y lo gastado contra el suyo, una categoría con mil presupuestados y diez gastados
   * enseñaría dos barras del mismo largo.
   */
  const scale = barRatios([
    ...budget.categories.map((row) => row.budgeted),
    ...budget.categories.map((row) => row.spent),
  ])

  const breakdown: ChartRow[] = budget.categories.map((row, index) => ({
    key: row.categoryId ?? "sin-categoria",
    label: row.categoryName ?? t("unclassified"),
    note: t("share", {
      percent: format.number(shareOf(row.budgeted, budget.filtered.totalPresupuestado)),
    }),
    bars: [
      {
        label: t("budgeted"),
        value: amount(row.budgeted),
        ratio: scale[index] ?? 0,
        tint: "curso",
      },
      {
        label: t("spent"),
        value: amount(row.spent),
        ratio: scale[budget.categories.length + index] ?? 0,
        tint: row.isUnfavorable ? "alto" : "firme",
      },
    ],
  }))

  const documentLink = can(company, "productions.budgets.view") ? (
    <Link
      href={`/c/${companyId}/productions/${productionId}/budget/document`}
      className="inline-flex h-9 items-center gap-2 rounded-sm border border-edge-control bg-panel px-3 text-body2 font-semibold text-content-muted transition-colors hover:bg-panel-hover hover:text-content"
    >
      <FileText className="size-4" aria-hidden="true" />
      {t("document")}
    </Link>
  ) : undefined

  return (
    <PageShell
      title={t("title")}
      {...(productionResult?.ok ? { subtitle: productionResult.data.name } : {})}
      {...(documentLink === undefined ? {} : { actions: documentLink })}
    >
      {nav}

      {categoriesResult?.ok ? (
        <CategoryFilter
          label={t("byCategory")}
          allLabel={t("allCategories")}
          categories={categoriesResult.data.items.map((category) => ({
            id: category.id,
            name: category.name,
          }))}
          value={chosen}
        />
      ) : null}

      <section className="mt-4 grid gap-3 tablet:grid-cols-3">
        <StatCard
          label={t("budgeted")}
          value={amount(budget.filtered.totalPresupuestado)}
          tint="curso"
        />
        <StatCard label={t("spent")} value={amount(budget.filtered.totalGastado)} tint="reposo" />
        <StatCard
          label={t("difference")}
          value={amount(budget.filtered.diferencia)}
          tint={budget.filtered.isUnfavorable ? "alto" : "firme"}
          trend={budget.filtered.isUnfavorable ? t("unfavorable") : t("favorable")}
        />
      </section>

      {/* Con filtro puesto, el conjunto sigue a la vista. Es la mitad que falta de la respuesta. */}
      {chosen === null ? null : (
        <Panel className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 p-4">
          <span className="legend text-content-faint">{t("wholeProduction")}</span>
          <span className="text-body2 text-content tabular-nums">
            {t("budgeted")}: {amount(budget.overall.totalPresupuestado)}
          </span>
          <span className="text-body2 text-content tabular-nums">
            {t("spent")}: {amount(budget.overall.totalGastado)}
          </span>
          <span className="inline-flex items-center gap-2 text-body2 text-content tabular-nums">
            {t("difference")}: {amount(budget.overall.diferencia)}
            {budget.overall.isUnfavorable ? <Badge tone="alto">{t("unfavorable")}</Badge> : null}
          </span>
        </Panel>
      )}

      <section className="mt-6 grid gap-4 desktop:grid-cols-2">
        <Panel className="p-5">
          <h2 className="text-body1 font-bold text-content">{t("comparisonTitle")}</h2>
          <p className="mt-0.5 mb-4 text-body3 text-content-muted">{t("comparisonBody")}</p>
          <BarChart rows={comparison} empty={t("noMovements")} />
        </Panel>

        <Panel className="p-5">
          <h2 className="text-body1 font-bold text-content">{t("breakdownTitle")}</h2>
          <p className="mt-0.5 mb-4 text-body3 text-content-muted">{t("breakdownBody")}</p>
          <BarChart rows={breakdown} empty={t("noCategories")} />
        </Panel>
      </section>
    </PageShell>
  )
}
