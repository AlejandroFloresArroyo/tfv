"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

/**
 * La barra de dentro del presupuesto: resumen, anclas y compras.
 *
 * Tres pantallas de la misma sección, y por eso una segunda barra en lugar de tres pestañas más en
 * la de la producción: allí serían ocho, y una barra de ocho deja de leerse de un vistazo. Aquí son
 * tres y siempre las mismas.
 *
 * **Ninguna propiedad es opcional**, por lo mismo que en la de arriba: olvidarse de pasar un
 * permiso haría desaparecer una pestaña en silencio, y el compilador lo impide.
 *
 * El resumen va primero porque es el que contesta la pregunta —cuánto queda—; las dos colecciones
 * van después porque son de dónde sale.
 */
export function BudgetNav({
  companyId,
  productionId,
  canViewBudget,
  canViewAnchors,
  canViewShoppings,
}: {
  companyId: string
  productionId: string
  canViewBudget: boolean
  canViewAnchors: boolean
  canViewShoppings: boolean
}) {
  const t = useTranslations("productions.budget")
  const pathname = usePathname()
  const base = `/c/${companyId}/productions/${productionId}/budget`

  const entries = [
    ...(canViewBudget ? [{ href: base, label: t("summary"), active: pathname === base }] : []),
    ...(canViewAnchors
      ? [
          {
            href: `${base}/anchors`,
            label: t("anchors"),
            active: pathname.startsWith(`${base}/anchors`),
          },
        ]
      : []),
    ...(canViewShoppings
      ? [
          {
            href: `${base}/shoppings`,
            label: t("shoppings"),
            active: pathname.startsWith(`${base}/shoppings`),
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
