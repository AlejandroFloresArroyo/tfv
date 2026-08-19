import { Callout } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type {
  CategorySummary,
  ItemsEnvelope,
  StorageRow,
  WarehouseRow,
} from "../../../warehouse.ts"
import { canViewPanel } from "../../panel/access.ts"
import { WarehouseNav } from "../../warehouse-nav.tsx"
import { ProductWizard } from "./product-wizard.tsx"

interface MemberRow {
  id: string
  userId: string
  email: string
  name: string
  lastname: string
  isActive: boolean
}

interface PageEnvelope<T> {
  items: T[]
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.wizard.title") }
}

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ companyId: string; warehouseId: string }>
}) {
  const t = await getTranslations()
  const { companyId, warehouseId } = await params
  const path =
    (await headers()).get("x-pathname") ?? `/c/${companyId}/warehouses/${warehouseId}/products/new`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canCreate = can(company, "warehouses.products.create")
  const canSelectCategory = can(company, "warehouses.products.select_category")
  const canEditLocation = can(company, "warehouses.products.edit_location")

  const [warehouseResult, categoriesResult, globalResult, storagesResult, membersResult] =
    await Promise.all([
      can(company, "warehouses.warehouses.view")
        ? apiGet<WarehouseRow>(`/companies/${companyId}/warehouses/${warehouseId}`)
        : Promise.resolve(null),
      canSelectCategory && can(company, "warehouses.categories.view")
        ? apiGet<ItemsEnvelope<CategorySummary>>(
            `/companies/${companyId}/warehouses/${warehouseId}/categories`,
          )
        : Promise.resolve(null),
      canSelectCategory
        ? apiGet<ItemsEnvelope<CategorySummary>>("/categories?service=warehouses")
        : Promise.resolve(null),
      canEditLocation && can(company, "warehouses.storages.view")
        ? apiGet<ItemsEnvelope<StorageRow>>(
            `/companies/${companyId}/warehouses/${warehouseId}/storages`,
          )
        : Promise.resolve(null),
      apiGet<PageEnvelope<MemberRow>>(`/companies/${companyId}/members?limit=100`),
    ])

  const title = warehouseResult?.ok ? warehouseResult.data.name : t("warehouses.wizard.title")

  /**
   * Sin el permiso de alta no se enseña el formulario.
   *
   * Se llega aquí escribiendo la dirección o siguiendo un enlace viejo: el botón que trae hasta
   * aquí ya no se pinta. Un formulario que sólo puede terminar en `403` es peor que decirlo antes.
   */
  if (!canCreate) {
    return (
      <PageShell title={title}>
        <WarehouseNav
          companyId={companyId}
          warehouseId={warehouseId}
          canViewPanel={canViewPanel(company)}
          canViewWarehouses={can(company, "warehouses.warehouses.view")}
          canViewProducts={can(company, "warehouses.products.view")}
          canViewCategories={can(company, "warehouses.categories.view")}
          canViewStorages={can(company, "warehouses.storages.view")}
          canViewQuotes={can(company, "warehouses.quotes.view")}
          canViewOrders={can(company, "warehouses.orders.view")}
          canViewPrices={can(company, "warehouses.prices.view")}
        />
        <Callout tone="warning">{t("warehouses.wizard.forbidden")}</Callout>
      </PageShell>
    )
  }

  return (
    <PageShell title={title} subtitle={t("warehouses.wizard.subtitle")}>
      <WarehouseNav
        companyId={companyId}
        warehouseId={warehouseId}
        canViewPanel={canViewPanel(company)}
        canViewWarehouses={can(company, "warehouses.warehouses.view")}
        canViewProducts={can(company, "warehouses.products.view")}
        canViewCategories={can(company, "warehouses.categories.view")}
        canViewStorages={can(company, "warehouses.storages.view")}
        canViewQuotes={can(company, "warehouses.quotes.view")}
        canViewOrders={can(company, "warehouses.orders.view")}
        canViewPrices={can(company, "warehouses.prices.view")}
      />

      <ProductWizard
        companyId={companyId}
        warehouseId={warehouseId}
        categories={
          categoriesResult?.ok
            ? categoriesResult.data.items.map((row) => ({ value: row.id, label: row.name }))
            : []
        }
        globalCategories={
          globalResult?.ok
            ? globalResult.data.items.map((row) => ({ value: row.id, label: row.name }))
            : []
        }
        storages={
          storagesResult?.ok
            ? storagesResult.data.items.map((row) => ({
                value: row.id,
                label: row.name,
                ...(row.code ? { hint: row.code } : {}),
              }))
            : []
        }
        members={
          membersResult.ok
            ? membersResult.data.items
                .filter((row) => row.isActive)
                .map((row) => ({
                  value: row.userId,
                  label: `${row.name} ${row.lastname}`.trim() || row.email,
                  hint: row.email,
                }))
            : []
        }
        permissions={{
          canEditPayment: can(company, "warehouses.products.edit_payment"),
          canSelectCategory,
          canEditLocation,
          canPublish: can(company, "warehouses.products.website"),
          // Las fotos van con la información del producto: es la clave más cercana del catálogo
          // cerrado de 255. Ver `HALLAZGOS.md` H-69.
          canEditPhotos: can(company, "warehouses.products.edit_info"),
        }}
      />
    </PageShell>
  )
}
