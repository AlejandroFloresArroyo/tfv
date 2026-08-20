import { Badge, ItemCard } from "@tfv/ui"
import { Receipt } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { formatAmount } from "~/lib/amount.ts"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import {
  type ProductionCategoryRow,
  type ProductionRow,
  type ProviderRow,
  SHOPPING_KINDS,
  SHOPPING_METHODS,
  type ShoppingRow,
} from "../../../production.ts"
import { ProductionNav } from "../../production-nav.tsx"
import { BudgetNav } from "../budget-nav.tsx"
import { CreateShopping } from "./shopping-form.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.budget.shoppings") }
}

/**
 * Los gastos de una producción.
 *
 * ## En tarjetas y no en tabla, al revés que las anclas
 *
 * Una compra lleva ocho datos —tipo, método, proveedor, fecha, si es deducible, qué artículos
 * trajo— y ocho columnas no caben en una tableta sin desplazamiento horizontal, que es lo que
 * `DESIGN.md` prohíbe para las tablas. Un ancla lleva tres y sí cabe. La diferencia de forma sale de
 * la diferencia de contenido, no de gusto.
 *
 * ## El orden lo pone el servidor: por fecha del gasto, del más reciente al más viejo
 *
 * Lo que se está registrando hoy es lo que se acaba de gastar. Un gasto sin fecha va al final: no
 * se puede situar en el tiempo, y ponerlo arriba lo haría pasar por el más reciente.
 */
export default async function ProductionShoppingsPage({
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
    `/c/${companyId}/productions/${productionId}/budget/shoppings`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewProductions = can(company, "productions.productions.view")
  const canViewCategories = can(company, "productions.categories.view")
  const canViewProviders = can(company, "companies.providers.view")
  const canCreate = can(company, "productions.shoppings.create")

  const [productionResult, shoppingsResult, categoriesResult, providersResult] = await Promise.all([
    canViewProductions
      ? apiGet<ProductionRow>(`/companies/${companyId}/productions/${productionId}`)
      : Promise.resolve(null),
    apiGet<PageEnvelope<ShoppingRow>>(
      `/companies/${companyId}/productions/${productionId}/shoppings?${toApiQuery(query)}`,
    ),
    canViewCategories
      ? apiGet<{ items: ProductionCategoryRow[] }>(
          `/companies/${companyId}/productions/${productionId}/categories?limit=96`,
        )
      : Promise.resolve(null),
    // Sin la clave de proveedores no se pide: devolvería `403`, y una lista vacía diría que la
    // empresa no tiene ninguno.
    canViewProviders
      ? apiGet<PageEnvelope<ProviderRow>>(`/companies/${companyId}/providers?limit=96`)
      : Promise.resolve(null),
  ])

  const categories = categoriesResult?.ok ? categoriesResult.data.items : []
  const providers = providersResult?.ok ? providersResult.data.items : []

  const filters: FilterSpec[] = [
    {
      kind: "multi",
      key: "kind",
      label: t("productions.budget.kind"),
      options: SHOPPING_KINDS.map((kind) => ({
        value: kind,
        label: t(`productions.budget.kinds.${kind}`),
      })),
    },
    {
      kind: "multi",
      key: "method",
      label: t("productions.budget.method"),
      options: SHOPPING_METHODS.map((method) => ({
        value: method,
        label: t(`productions.budget.methods.${method}`),
      })),
    },
    {
      kind: "select",
      key: "isDeductible",
      label: t("productions.budget.deductible"),
      options: [
        { value: "true", label: t("productions.budget.yes") },
        { value: "false", label: t("productions.budget.no") },
      ],
    },
    ...(categories.length > 0
      ? [
          {
            kind: "select" as const,
            key: "categoryId",
            label: t("productions.budget.category"),
            options: categories.map((category) => ({ value: category.id, label: category.name })),
          },
        ]
      : []),
    ...(providers.length > 0
      ? [
          {
            kind: "select" as const,
            key: "providerId",
            label: t("productions.budget.provider"),
            options: providers.map((provider) => ({ value: provider.id, label: provider.alias })),
          },
        ]
      : []),
    {
      kind: "dateRange",
      key: "occurredOn",
      label: t("productions.budget.occurredOn"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  const create = canCreate ? (
    <CreateShopping
      companyId={companyId}
      productionId={productionId}
      categories={categories}
      providers={providers}
      canSelectCategory={can(company, "productions.shoppings.select_category")}
    />
  ) : undefined

  return (
    <PageShell
      title={t("productions.budget.shoppings")}
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
        result={shoppingsResult}
        filters={filters}
        searchPlaceholder={t("productions.budget.searchShoppings")}
        emptyTitle={t("productions.budget.noShoppings")}
        emptyBody={t("productions.budget.noShoppingsBody")}
        {...(create === undefined ? {} : { emptyAction: create })}
      >
        {(items, view) =>
          items.map((shopping) => (
            <ItemCard
              key={shopping.id}
              view={view}
              media={
                <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <Receipt className="size-4" aria-hidden="true" />
                </span>
              }
              title={
                <Link
                  href={`/c/${companyId}/productions/${productionId}/budget/shoppings/${shopping.id}`}
                  className="rounded-xs hover:underline"
                >
                  {shopping.name}
                </Link>
              }
              subtitle={[
                formatAmount(shopping.amount, format),
                shopping.occurredOn === null
                  ? t("productions.budget.noDate")
                  : format.dateTime(new Date(shopping.occurredOn), { dateStyle: "medium" }),
                shopping.providerName,
              ]
                .filter((part) => part !== null)
                .join(" · ")}
              meta={
                <>
                  <Badge tone="reposo">{t(`productions.budget.kinds.${shopping.kind}`)}</Badge>
                  <Badge tone="curso">
                    {shopping.method === "card" && shopping.cardLast4 !== null
                      ? t("productions.budget.cardEndingIn", { last4: shopping.cardLast4 })
                      : t(`productions.budget.methods.${shopping.method}`)}
                  </Badge>
                  {shopping.isDeductible ? (
                    <Badge tone="firme">{t("productions.budget.deductible")}</Badge>
                  ) : null}
                  {shopping.items.length > 0 ? (
                    <Badge tone="aparta">
                      {t("productions.budget.itemCount", { count: shopping.items.length })}
                    </Badge>
                  ) : null}
                </>
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
