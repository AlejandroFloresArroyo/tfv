"use client"

import { Boxes, MapPinned, Warehouse } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

export function WarehouseNav({
  companyId,
  warehouseId,
  canViewWarehouses,
  canViewProducts,
  canViewStorages,
}: {
  companyId: string
  warehouseId: string
  canViewWarehouses: boolean
  canViewProducts: boolean
  canViewStorages: boolean
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
