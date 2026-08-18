import { Callout } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { ProductDetail } from "../../../../../warehouse.ts"
import { WarehouseNav } from "../../../../warehouse-nav.tsx"
import { ChildWizard } from "./child-wizard.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.wizard.childTitle") }
}

export default async function NewChildPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; warehouseId: string; productId: string }>
  searchParams: Promise<{ tipo?: string }>
}) {
  const t = await getTranslations()
  const { companyId, warehouseId, productId } = await params
  const { tipo } = await searchParams
  const relation = tipo === "accessory" ? "accessory" : "variant"

  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/warehouses/${warehouseId}/products/${productId}/children/new`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const nav = (
    <WarehouseNav
      companyId={companyId}
      warehouseId={warehouseId}
      canViewWarehouses={can(company, "warehouses.warehouses.view")}
      canViewProducts={can(company, "warehouses.products.view")}
      canViewCategories={can(company, "warehouses.categories.view")}
      canViewStorages={can(company, "warehouses.storages.view")}
      canViewQuotes={can(company, "warehouses.quotes.view")}
      canViewOrders={can(company, "warehouses.orders.view")}
      canViewPrices={can(company, "warehouses.prices.view")}
    />
  )

  const title = t(
    relation === "variant" ? "warehouses.wizard.newVariant" : "warehouses.wizard.newAccessory",
  )

  if (!can(company, "warehouses.products.create")) {
    return (
      <PageShell title={title}>
        {nav}
        <Callout tone="warning">{t("warehouses.wizard.forbidden")}</Callout>
      </PageShell>
    )
  }

  const parent = await apiGet<ProductDetail>(
    `/companies/${companyId}/warehouses/${warehouseId}/products/${productId}`,
  )

  if (!parent.ok) {
    return (
      <PageShell title={title}>
        {nav}
        <ApiFailure result={parent} />
      </PageShell>
    )
  }

  return (
    <PageShell title={title} subtitle={t("warehouses.wizard.childOf", { name: parent.data.name })}>
      {nav}

      <ChildWizard
        companyId={companyId}
        warehouseId={warehouseId}
        productId={productId}
        parentName={parent.data.name}
        relation={relation}
        canEditPayment={can(company, "warehouses.products.edit_payment")}
      />
    </PageShell>
  )
}
