"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

/**
 * La barra de dentro del guion: guiones, y capítulos y escenas.
 *
 * Dos pantallas de la misma sección, igual que el presupuesto lleva resumen, anclas y compras
 * dentro de una segunda barra en lugar de subir las tres a la de la producción. Aquí sólo son dos,
 * pero por el mismo motivo no comparten pestaña: un guion es un archivo con su estado de
 * extracción, y un capítulo con sus escenas es la estructura que ese archivo desglosa. Confundirlas
 * en una sola pantalla mezclaría «qué documento hay» con «cómo está repartido».
 *
 * **Ninguna propiedad es opcional**, por lo mismo que en `ProductionNav` y en `BudgetNav`:
 * olvidarse de pasar un permiso haría desaparecer una pestaña en silencio.
 */
export function ScriptNav({
  companyId,
  productionId,
  canViewScripts,
  canViewChapters,
}: {
  companyId: string
  productionId: string
  canViewScripts: boolean
  canViewChapters: boolean
}) {
  const t = useTranslations("productions.script")
  const pathname = usePathname()
  const base = `/c/${companyId}/productions/${productionId}/script`

  const entries = [
    ...(canViewScripts ? [{ href: base, label: t("scripts"), active: pathname === base }] : []),
    ...(canViewChapters
      ? [
          {
            href: `${base}/chapters`,
            label: t("chaptersTab"),
            active: pathname.startsWith(`${base}/chapters`),
          },
        ]
      : []),
  ]

  // Con una sola pestaña la barra no navega a ninguna parte: es un rótulo con borde.
  if (entries.length < 2) return null

  return (
    <nav aria-label={t("sections")} className="mb-5 flex flex-wrap items-center gap-1">
      {entries.map((entry) => (
        <Link
          key={entry.href}
          href={entry.href}
          aria-current={entry.active ? "page" : undefined}
          className={
            entry.active
              ? "inline-flex h-8 items-center rounded-sm bg-panel-hover px-3 text-body2 font-semibold text-content"
              : "inline-flex h-8 items-center rounded-sm px-3 text-body2 text-content-muted transition-colors hover:bg-panel-hover hover:text-content"
          }
        >
          {entry.label}
        </Link>
      ))}
    </nav>
  )
}
