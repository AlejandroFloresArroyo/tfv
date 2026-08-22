import { Badge, Button, ItemCard } from "@tfv/ui"
import { Box, Plus } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { Photo } from "~/components/photo.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { CategorySummary, ItemsEnvelope, ProductRow, WarehouseRow } from "../warehouse.ts"
import { canViewPanel } from "./panel/access.ts"
import { WarehouseNav } from "./warehouse-nav.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.catalog") }
}

export default async function WarehouseCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; warehouseId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const { companyId, warehouseId } = await params
  const query = toSearchParams(await searchParams)
  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/warehouses/${warehouseId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)
  const canViewWarehouses = can(company, "warehouses.warehouses.view")
  const canViewProducts = can(company, "warehouses.products.view")
  const canViewCategories = can(company, "warehouses.categories.view")
  const canViewStorages = can(company, "warehouses.storages.view")
  const canCreateProducts = can(company, "warehouses.products.create")

  const [warehouseResult, productsResult, categoriesResult, globalCategoriesResult] =
    await Promise.all([
      canViewWarehouses
        ? apiGet<WarehouseRow>(`/companies/${companyId}/warehouses/${warehouseId}`)
        : Promise.resolve(null),
      apiGet<PageEnvelope<ProductRow>>(
        `/companies/${companyId}/warehouses/${warehouseId}/products?${toApiQuery(query)}`,
      ),
      canViewCategories
        ? apiGet<ItemsEnvelope<CategorySummary>>(
            `/companies/${companyId}/warehouses/${warehouseId}/categories`,
          )
        : Promise.resolve(null),
      apiGet<ItemsEnvelope<CategorySummary>>("/categories?service=warehouses"),
    ])

  const filters: FilterSpec[] = [
    {
      kind: "boolean",
      key: "isPublished",
      label: t("warehouses.published"),
      trueLabel: t("warehouses.published"),
      falseLabel: t("warehouses.unpublished"),
    },
    {
      // La bandeja: lo que se dio de alta cotizando y nadie ha vuelto a mirar.
      kind: "boolean",
      key: "isProvisional",
      label: t("warehouses.quotes.provisional"),
      trueLabel: t("warehouses.quotes.provisionalFilter"),
      falseLabel: t("warehouses.completeOnly"),
    },
    {
      kind: "boolean",
      key: "availableForRent",
      label: t("warehouses.rent"),
      trueLabel: t("warehouses.forRent"),
      falseLabel: t("warehouses.notForRent"),
    },
    {
      kind: "boolean",
      key: "availableForSale",
      label: t("warehouses.sale"),
      trueLabel: t("warehouses.forSale"),
      falseLabel: t("warehouses.notForSale"),
    },
    ...(categoriesResult?.ok && categoriesResult.data.items.length > 0
      ? [
          {
            kind: "select" as const,
            key: "categoryId",
            label: t("warehouses.category"),
            options: categoriesResult.data.items.map((category) => ({
              value: category.id,
              label: category.name,
            })),
          },
        ]
      : []),
    ...(globalCategoriesResult.ok && globalCategoriesResult.data.items.length > 0
      ? [
          {
            kind: "select" as const,
            key: "globalCategoryId",
            label: t("warehouses.globalCategory"),
            options: globalCategoriesResult.data.items.map((category) => ({
              value: category.id,
              label: category.name,
            })),
          },
        ]
      : []),
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("warehouses.added"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  return (
    <PageShell
      title={warehouseResult?.ok ? warehouseResult.data.name : t("warehouses.catalog")}
      subtitle={
        warehouseResult?.ok && warehouseResult.data.description
          ? warehouseResult.data.description
          : t("warehouses.catalogSubtitle")
      }
      // La entrada al asistente de alta. Hasta ahora sólo se llegaba escribiendo la dirección a
      // mano: la pantalla existía y no la enlazaba nadie (`HALLAZGOS.md` H-70).
      actions={
        canCreateProducts ? (
          <Button asChild>
            <Link href={`/c/${companyId}/warehouses/${warehouseId}/products/new`}>
              <Plus className="size-4" aria-hidden="true" />
              {t("warehouses.products.create")}
            </Link>
          </Button>
        ) : undefined
      }
    >
      <WarehouseNav
        companyId={companyId}
        warehouseId={warehouseId}
        canViewPanel={canViewPanel(company)}
        canViewWarehouses={canViewWarehouses}
        canViewProducts={canViewProducts}
        canViewCategories={can(company, "warehouses.categories.view")}
        canViewStorages={canViewStorages}
        canViewQuotes={can(company, "warehouses.quotes.view")}
        canViewOrders={can(company, "warehouses.orders.view")}
        canViewPrices={can(company, "warehouses.prices.view")}
      />

      <Collection
        params={query}
        result={productsResult}
        filters={filters}
        searchPlaceholder={t("warehouses.products.searchPlaceholder")}
        emptyTitle={t("warehouses.products.empty")}
        emptyBody={t("warehouses.products.emptyBody")}
        // Aquí la celda es la fotografía del equipo, no un nombre con metadato: cabe una columna
        // más y la página deja de medir dos veces y media lo que enseña.
        grid="cover"
        // Un almacén recién hecho enseñaba «Todavía no hay productos» y ningún camino desde ahí.
        // La entrada al asistente existe arriba, pero el panel vacío es donde se está mirando.
        {...(canCreateProducts
          ? {
              emptyAction: (
                <Button asChild>
                  <Link href={`/c/${companyId}/warehouses/${warehouseId}/products/new`}>
                    <Plus className="size-4" aria-hidden="true" />
                    {t("warehouses.products.create")}
                  </Link>
                </Button>
              ),
            }
          : {})}
        defaultView="grid"
      >
        {(items, view) =>
          items.map((product) => {
            /*
             * Renta y venta **no son estados**: son lo que el producto siempre ha sido, y en un
             * almacén de renta «disponible para renta» es cierto de casi todo el catálogo. Como
             * insignias costaban el oro de marca y el verde —las dos temperaturas que en el resto
             * del sistema significan «unidad comprometida» y «entregado»— para no decir nada, y
             * dejaban toda tarjeta normal vestida de dos marcas de color. Un producto corriente
             * pasa a no llevar ninguna insignia, que es lo que hace que llevar una signifique algo.
             */
            const canales = [
              product.availableForRent ? t("warehouses.rent") : null,
              product.availableForSale ? t("warehouses.sale") : null,
            ].filter((canal): canal is string => canal !== null)

            return (
              <ItemCard
                key={product.id}
                view={view}
                /*
                 * Lo único que de verdad está pasando en un producto del catálogo es que se dio de
                 * alta a la carrera y sigue sin completarse. Es el único que tiñe su tarjeta, así
                 * que en una página de veinticuatro la temperatura vuelve a señalar.
                 */
                tint={product.isProvisional ? "curso" : "neutral"}
                cover={
                  product.coverUrl ? (
                    /* El nombre va debajo en texto: repetirlo en el `alt` lo diría dos veces. */
                    <Photo src={product.coverUrl} className="size-full object-cover" />
                  ) : (
                    /*
                     * Un hueco de fotografía vacío se ve como lo que es, y calla.
                     *
                     * Se probó llenarlo con el código en grande, para que las tarjetas sin foto no
                     * fueran veinticuatro cuadros idénticos. Con datos reales salió peor: el código
                     * le ganaba en tamaño al nombre del producto, que es la jerarquía al revés, y
                     * repetía en la casilla lo que ya está dos renglones más abajo. Lo que resolvía
                     * de verdad el problema original —«veinticuatro cuadros que devuelven cero»— no
                     * era decorar el hueco, sino que el código de abajo pasara a monoespaciada
                     * tabular y el nombre a dos renglones. La identificación vive en el texto.
                     */
                    <Box className={view === "grid" ? "size-7" : "size-5"} aria-hidden="true" />
                  )
                }
                title={
                  <Link
                    href={`/c/${companyId}/warehouses/${warehouseId}/products/${product.id}`}
                    className="rounded-xs hover:underline"
                  >
                    {product.name}
                  </Link>
                }
                subtitle={
                  /*
                   * El código en monoespaciada y tabular, como en la referencia del sistema: se lee
                   * de una etiqueta impresa, y confundir `0` con `O` es un error de operación.
                   */
                  <>
                    <span className="font-mono text-content-muted tnum">{product.code}</span>
                    {canales.length > 0 ? ` · ${canales.join(" · ")}` : null}
                  </>
                }
                meta={
                  <>
                    {product.isProvisional ? (
                      <Badge tone="curso">{t("warehouses.quotes.provisional")}</Badge>
                    ) : null}
                    {!product.isPublished ? <Badge>{t("warehouses.unpublished")}</Badge> : null}
                  </>
                }
              />
            )
          })
        }
      </Collection>
    </PageShell>
  )
}
