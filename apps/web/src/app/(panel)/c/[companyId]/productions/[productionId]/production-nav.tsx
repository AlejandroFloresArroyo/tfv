"use client"

import { CalendarDays, Clapperboard, FolderTree, Gauge } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

/**
 * La barra de secciones de una producción.
 *
 * **Ninguna propiedad es opcional**, por lo aprendido en la del almacén: con valor por omisión, una
 * pantalla que se olvide de pasar un permiso pierde la pestaña en silencio y la navegación deja de
 * ser la misma según por dónde se haya entrado, sin que nada falle. Obligatorias, olvidarse no
 * compila.
 *
 * ## Aquí el panel **sí** es la portada, al revés que en el almacén
 *
 * En el almacén la portada es el catálogo, y hay tres razones escritas para ello: la dirección ya
 * significa algo para quien la comparte, el panel se apaga con los permisos y hay costumbre. Ninguna
 * de las tres se da aquí. Una producción **no tiene catálogo**: lo primero que se pregunta al
 * abrirla es cómo va, que es exactamente lo que el panel contesta. Y la dirección es nueva, así que
 * no hay enlaces compartidos que reinterpretar.
 *
 * Lo que sí se hereda es la cautela: quien no pueda ver el resumen entra igual y ve la ficha —el
 * nombre, las fechas y la publicación—, no una página vacía.
 */
export function ProductionNav({
  companyId,
  productionId,
  canViewProductions,
  canViewCategories,
  canViewWorkflows,
}: {
  companyId: string
  productionId: string
  canViewProductions: boolean
  canViewCategories: boolean
  canViewWorkflows: boolean
}) {
  const t = useTranslations("productions")
  const pathname = usePathname()
  const base = `/c/${companyId}/productions/${productionId}`

  const entries = [
    { href: base, label: t("panel.tab"), icon: Gauge, active: pathname === base },
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
    ...(canViewWorkflows
      ? [
          {
            href: `${base}/workflows`,
            label: t("workflows.title"),
            icon: CalendarDays,
            active: pathname.startsWith(`${base}/workflows`),
          },
        ]
      : []),
  ]

  return (
    <nav aria-label={t("sections")} className="mb-5 flex flex-wrap items-center gap-2">
      {canViewProductions ? (
        <>
          <Link
            href={`/c/${companyId}/productions`}
            className="inline-flex h-9 items-center gap-2 rounded-sm border border-edge-control bg-panel px-3 text-body2 font-semibold text-content-muted transition-colors hover:bg-panel-hover hover:text-content"
          >
            <Clapperboard className="size-4" aria-hidden="true" />
            {t("all")}
          </Link>

          <span className="h-6 border-l border-edge" aria-hidden="true" />
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
