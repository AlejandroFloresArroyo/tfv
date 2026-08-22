"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

/**
 * La barra de dentro de Rodaje: jornadas, personajes, sets y videos.
 *
 * Hermana de `BudgetNav`, con la misma razón de ser: cuatro pantallas de la misma pestaña, y una
 * segunda barra en vez de ensanchar la de la producción — ahí serían nueve entradas, y una barra de
 * nueve deja de leerse de un vistazo.
 *
 * Las jornadas van primero porque son el aterrizaje de la pestaña: es lo que la spec llama
 * «rodaje» de verdad —el día que se rueda—, y personajes, sets y videos son los catálogos de los
 * que ese día tira. Es el mismo orden que `PRODUCT.md` describe para el trabajo: primero se monta
 * el catálogo, pero lo que trae aquí es la jornada.
 *
 * **Ninguna propiedad es opcional**, por la misma razón que en `ProductionNav`: olvidarse de pasar
 * un permiso haría desaparecer una pestaña en silencio, y el compilador lo impide.
 */
export function RodajeNav({
  companyId,
  productionId,
  canViewRecordings,
  canViewCharacters,
  canViewSets,
  canViewVideos,
}: {
  companyId: string
  productionId: string
  canViewRecordings: boolean
  canViewCharacters: boolean
  canViewSets: boolean
  canViewVideos: boolean
}) {
  const t = useTranslations("productions.rodaje")
  const pathname = usePathname()
  const base = `/c/${companyId}/productions/${productionId}/rodaje`

  // La ficha de una jornada cuelga directo de la base —`/rodaje/{recordingId}`—, no de una
  // subcarpeta propia: es el aterrizaje de la pestaña. Por eso su actividad no es un simple
  // `startsWith`, que atraparía también `/characters`, `/sets` y `/videos`: se resta lo que ya
  // tiene su propia pestaña.
  const catalogPrefixes = [`${base}/characters`, `${base}/sets`, `${base}/videos`]
  const onRecording =
    pathname === base ||
    (pathname.startsWith(`${base}/`) &&
      !catalogPrefixes.some((prefix) => pathname.startsWith(prefix)))

  const entries = [
    ...(canViewRecordings ? [{ href: base, label: t("recordingsTab"), active: onRecording }] : []),
    ...(canViewCharacters
      ? [
          {
            href: `${base}/characters`,
            label: t("charactersTab"),
            active: pathname.startsWith(`${base}/characters`),
          },
        ]
      : []),
    ...(canViewSets
      ? [
          {
            href: `${base}/sets`,
            label: t("setsTab"),
            active: pathname.startsWith(`${base}/sets`),
          },
        ]
      : []),
    ...(canViewVideos
      ? [
          {
            href: `${base}/videos`,
            label: t("videosTab"),
            active: pathname.startsWith(`${base}/videos`),
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
