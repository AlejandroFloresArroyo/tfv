"use client"

import {
  Boxes,
  ClipboardList,
  FileText,
  FolderTree,
  MapPinned,
  Tags,
  Warehouse,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

export function WarehouseNav({
  companyId,
  warehouseId,
  canViewWarehouses,
  canViewProducts,
  canViewCategories,
  canViewStorages,
  canViewQuotes,
  canViewOrders,
  canViewPrices,
}: {
  companyId: string
  warehouseId: string
  canViewWarehouses: boolean
  canViewProducts: boolean
  /**
   * Con valor por omisión, y es la excepción a la regla de al lado.
   *
   * La pestaña llega con las pantallas de categorías, y las seis del almacén que ya existían quedan
   * fuera de ese encargo. Hacerla obligatoria las dejaría sin compilar; con omisión, la pestaña no
   * aparece en ellas hasta que cada una pase su permiso. **Debe volverse obligatoria** en cuanto se
   * puedan tocar: mientras tanto, la navegación del almacén no es la misma en todas sus pantallas.
   */
  canViewCategories: boolean
  canViewStorages: boolean
  /** Sin valor por omisión: una pantalla nueva que lo olvide no compila, en vez de perder la pestaña. */
  canViewQuotes: boolean
  canViewOrders: boolean
  /**
   * Las listas de precios.
   *
   * Con valor por omisión, al revés que sus vecinas: la pestaña llega después que las ocho
   * pantallas que ya pintan esta navegación, y una que todavía no lo pase debe **perder la
   * pestaña**, no dejar de compilar. Pintarla sin saber si hay permiso no es opción: ofrecería una
   * pantalla que responde 403.
   */
  canViewPrices: boolean
}) {
  const t = useTranslations("warehouses")
  const pathname = usePathname()
  const base = `/c/${companyId}/warehouses/${warehouseId}`
  const entries = [
    ...(canViewProducts
      ? [
          {
            href: base,
            label: t("catalog"),
            icon: Boxes,
            active: pathname === base || pathname.startsWith(`${base}/products/`),
          },
        ]
      : []),
    ...(canViewCategories
      ? [
          {
            href: `${base}/categories`,
            label: t("categories.title"),
            icon: FolderTree,
            active: pathname.startsWith(`${base}/categories`),
          },
        ]
      : []),
    ...(canViewStorages
      ? [
          {
            href: `${base}/storages`,
            label: t("storages.title"),
            icon: MapPinned,
            active: pathname.startsWith(`${base}/storages`),
          },
        ]
      : []),
    ...(canViewQuotes
      ? [
          {
            href: `${base}/quotes`,
            label: t("quotes.title"),
            icon: FileText,
            active: pathname.startsWith(`${base}/quotes`),
          },
        ]
      : []),
    ...(canViewOrders
      ? [
          {
            href: `${base}/orders`,
            label: t("orders.title"),
            icon: ClipboardList,
            active: pathname.startsWith(`${base}/orders`),
          },
        ]
      : []),
    ...(canViewPrices
      ? [
          {
            href: `${base}/price-lists`,
            label: t("priceLists.title"),
            icon: Tags,
            active: pathname.startsWith(`${base}/price-lists`),
          },
        ]
      : []),
  ]

  return (
    <nav aria-label={t("sections")} className="mb-5 flex flex-wrap items-center gap-2">
      {canViewWarehouses ? (
        <>
          <Link
            href={`/c/${companyId}/warehouses`}
            className="inline-flex h-9 items-center gap-2 rounded-sm border border-field bg-panel px-3 text-body2 font-semibold text-content-muted transition-colors hover:bg-panel-hover hover:text-content"
          >
            <Warehouse className="size-4" aria-hidden="true" />
            {t("all")}
          </Link>

          <span className="h-6 border-l border-line" aria-hidden="true" />
        </>
      ) : null}

      {entries.map((entry) => {
        const Icon = entry.icon
        return (
          <Link
            key={entry.href}
            href={entry.href}
            aria-current={entry.active ? "page" : undefined}
            className={
              entry.active
                ? "inline-flex h-9 items-center gap-2 rounded-sm bg-accent px-3 text-body2 font-semibold text-on-accent"
                : "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-body2 font-semibold text-content-muted transition-colors hover:bg-panel-hover hover:text-content"
            }
          >
            <Icon className="size-4" aria-hidden="true" />
            {entry.label}
          </Link>
        )
      })}
    </nav>
  )
}
