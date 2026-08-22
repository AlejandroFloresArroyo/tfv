import { Badge, Fact, Panel, Separator } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import type { PageEnvelope } from "~/components/collection/collection.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { formatAmount } from "~/lib/amount.ts"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type {
  ItemRow,
  ProductionCategoryRow,
  ProviderRow,
  ShoppingRow,
} from "../../../../production.ts"
import { ProductionNav } from "../../../production-nav.tsx"
import { BudgetNav } from "../../budget-nav.tsx"
import {
  ComposeShopping,
  DeleteShopping,
  EditShopping,
  ShoppingInvoices,
} from "./shopping-actions.tsx"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; shoppingId: string }>
}): Promise<Metadata> {
  const t = await getTranslations()
  const { companyId, productionId, shoppingId } = await params

  const result = await apiGet<ShoppingRow>(
    `/companies/${companyId}/productions/${productionId}/shoppings/${shoppingId}`,
  )

  return { title: result.ok ? result.data.name : t("productions.budget.shoppings") }
}

/**
 * Un gasto.
 *
 * Tres bloques en el orden en que se consultan: **qué fue** —importe, tipo, método, proveedor,
 * fecha—, **qué trajo** —los artículos que entraron al inventario con él— y **con qué se
 * comprueba** —las facturas—.
 *
 * ## De la tarjeta sólo se enseñan cuatro dígitos porque sólo hay cuatro
 *
 * No es que se oculten: **no existen los demás en ninguna capa**. El tipo del dominio no sabe
 * convertir un número completo, el esquema de entrada lo rechaza y la columna mide cuatro. Aquí se
 * dicen como los dice un recibo: «termina en 4242».
 */
export default async function ShoppingPage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; shoppingId: string }>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId, productionId, shoppingId } = await params

  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/budget/shoppings/${shoppingId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canEdit = can(company, "productions.shoppings.edit")
  const canCompose = can(company, "productions.shoppings.products")
  const canDelete = can(company, "productions.shoppings.delete")
  const canViewCategories = can(company, "productions.categories.view")
  const canViewProviders = can(company, "companies.providers.view")
  // Componer exige elegir de entre el inventario. Sin la clave de artículos no se pide: devolvería
  // `403`, y una lista vacía diría que la producción no tiene utilería.
  const canViewItems = can(company, "productions.products.view")

  const [shoppingResult, itemsResult, categoriesResult, providersResult] = await Promise.all([
    apiGet<ShoppingRow>(
      `/companies/${companyId}/productions/${productionId}/shoppings/${shoppingId}`,
    ),
    canCompose && canViewItems
      ? apiGet<PageEnvelope<ItemRow>>(
          `/companies/${companyId}/productions/${productionId}/items?limit=96`,
        )
      : Promise.resolve(null),
    canEdit && canViewCategories
      ? apiGet<{ items: ProductionCategoryRow[] }>(
          `/companies/${companyId}/productions/${productionId}/categories?limit=96`,
        )
      : Promise.resolve(null),
    canEdit && canViewProviders
      ? apiGet<PageEnvelope<ProviderRow>>(`/companies/${companyId}/providers?limit=96`)
      : Promise.resolve(null),
  ])

  const nav = (
    <>
      <ProductionNav
        companyId={companyId}
        productionId={productionId}
        canViewProductions={can(company, "productions.productions.view")}
        canViewCategories={canViewCategories}
        canViewItems={canViewItems}
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
    </>
  )

  if (!shoppingResult.ok) {
    return (
      <PageShell title={t("productions.budget.shoppings")}>
        {nav}
        <ApiFailure result={shoppingResult} />
      </PageShell>
    )
  }

  const shopping = shoppingResult.data
  const categories = categoriesResult?.ok ? categoriesResult.data.items : []
  const providers = providersResult?.ok ? providersResult.data.items : []

  return (
    <PageShell
      title={shopping.name}
      subtitle={formatAmount(shopping.amount, format)}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <EditShopping
              companyId={companyId}
              productionId={productionId}
              shopping={shopping}
              categories={categories}
              providers={providers}
              canSelectCategory={can(company, "productions.shoppings.select_category")}
            />
          ) : null}
          {canCompose ? (
            <ComposeShopping
              companyId={companyId}
              productionId={productionId}
              shopping={shopping}
              items={itemsResult?.ok ? itemsResult.data.items : []}
            />
          ) : null}
          {canDelete ? (
            <DeleteShopping companyId={companyId} productionId={productionId} shopping={shopping} />
          ) : null}
        </div>
      }
    >
      {nav}

      <Panel className="p-5">
        <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          <Fact
            label={t("productions.budget.kind")}
            value={t(`productions.budget.kinds.${shopping.kind}`)}
          />
          <Fact
            label={t("productions.budget.method")}
            value={
              shopping.method === "card" && shopping.cardLast4 !== null
                ? t("productions.budget.cardEndingIn", { last4: shopping.cardLast4 })
                : t(`productions.budget.methods.${shopping.method}`)
            }
          />
          <Fact
            label={t("productions.budget.occurredOn")}
            value={
              shopping.occurredOn === null
                ? t("productions.budget.noDate")
                : format.dateTime(new Date(shopping.occurredOn), { dateStyle: "long" })
            }
          />
          <Fact
            label={t("productions.budget.provider")}
            value={shopping.providerName ?? t("productions.budget.noProvider")}
          />
          <Fact
            label={t("productions.budget.category")}
            value={shopping.categoryName ?? t("productions.budget.unclassified")}
          />
          <Fact
            label={t("productions.budget.responsible")}
            value={shopping.responsibleName ?? "—"}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone={shopping.isDeductible ? "firme" : "reposo"}>
            {shopping.isDeductible
              ? t("productions.budget.deductible")
              : t("productions.budget.notDeductible")}
          </Badge>
          {/* La trazabilidad hasta el pedido de almacén que lo originó. La escribe la 23; hasta
              entonces esta marca no aparece nunca, y aparecerá sola el día que exista. */}
          {shopping.warehouseOrderId === null ? null : (
            <Badge tone="curso">{t("productions.budget.fromWarehouseOrder")}</Badge>
          )}
        </div>

        {shopping.observations.trim() === "" ? null : (
          <p className="mt-4 max-w-prose whitespace-pre-wrap text-body2 text-content-muted">
            {shopping.observations}
          </p>
        )}
      </Panel>

      <Panel className="mt-4 p-5">
        <h2 className="text-body1 font-bold text-content">
          {t("productions.budget.itemsBrought")}
        </h2>
        <p className="mt-0.5 text-body3 text-content-muted">
          {t("productions.budget.itemsBroughtBody")}
        </p>

        {shopping.items.length === 0 ? (
          <p className="mt-3 text-body2 text-content-faint">{t("productions.budget.noItems")}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {shopping.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <Link
                  href={`/c/${companyId}/productions/${productionId}/items/${item.id}`}
                  className="min-w-0 flex-1 truncate text-body2 text-content underline-offset-2 hover:underline"
                >
                  {item.name}
                </Link>
                <span className="shrink-0 font-mono text-body3 text-content-faint">
                  {item.code}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="mt-4 p-5">
        <h2 className="text-body1 font-bold text-content">{t("productions.budget.invoices")}</h2>
        <Separator className="my-3" />
        <ShoppingInvoices
          companyId={companyId}
          productionId={productionId}
          shopping={shopping}
          canManage={canEdit}
        />
      </Panel>
    </PageShell>
  )
}
