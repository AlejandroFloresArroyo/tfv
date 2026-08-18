"use client"

import {
  Boxes,
  ClipboardList,
  FileText,
  FolderTree,
  Gauge,
  MapPinned,
  Tags,
  Warehouse,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

/**
 * La barra de secciones del almacén.
 *
 * **Ninguna de estas propiedades es opcional, y no se volverán a declarar así.** Con valor por
 * omisión, una pantalla que se olvide de pasar un permiso pierde la pestaña en silencio: la
 * navegación del almacén deja de ser la misma según por dónde se haya entrado, y nada falla. Con
 * ellas obligatorias, olvidarse no compila. La deuda de las dos que nacieron opcionales ya se pagó
 * una vez —repasando las catorce pantallas—, y la del panel se pagó al nacer.
 *
 * ## El panel es la primera pestaña y no la portada
 *
 * La portada del almacén sigue siendo el catálogo, en `…/warehouses/{id}`. Tres razones:
 *
 * 1. **Esa dirección ya significa algo para quien la comparte.** El estado de exploración del
 *    catálogo vive en la dirección —`?search=`, `?categoryId=`, `?page=`—, así que hay enlaces
 *    guardados y enviados que apuntan al catálogo filtrado. Convertirla en el panel no los rompería
 *    con un error: los llevaría a una página que ignora esos parámetros en silencio, que es peor.
 * 2. **El panel se apaga con los permisos y el catálogo no.** Un papel acotado que sólo tenga
 *    `warehouses.products.view` entra a trabajar sobre el catálogo; darle como puerta un resumen
 *    del que sólo puede ver un bloque es cambiarle la portada por una cifra.
 * 3. **Hay gente acostumbrada al catálogo.** Cambiar dónde cae el clic de «entrar al almacén» se
 *    hace cuando hay algo que ganar en la primera pantalla, no a la vez que se estrena.
 *
 * Va la primera porque el orden de la barra es el del recorrido, no el de la antigüedad: se mira el
 * resumen y de ahí se baja al detalle. Promoverla a portada es cambiar dos rutas y añadir una
 * redirección de la vieja, el día que se decida.
 */
export function WarehouseNav({
  companyId,
  warehouseId,
  canViewPanel,
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
  /**
   * El resumen del almacén.
   *
   * No tiene clave propia —el catálogo de permisos está cerrado— y no se inventa una: la regla vive
   * en `panel/access.ts`, que la deriva de los tres recursos que el panel resume.
   */
  canViewPanel: boolean
  canViewWarehouses: boolean
  canViewProducts: boolean
  canViewCategories: boolean
  canViewStorages: boolean
  canViewQuotes: boolean
  canViewOrders: boolean
  canViewPrices: boolean
}) {
  const t = useTranslations("warehouses")
  const pathname = usePathname()
  const base = `/c/${companyId}/warehouses/${warehouseId}`
  const entries = [
    ...(canViewPanel
      ? [
          {
            href: `${base}/panel`,
            label: t("panel.tab"),
            icon: Gauge,
            active: pathname.startsWith(`${base}/panel`),
          },
        ]
      : []),
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
