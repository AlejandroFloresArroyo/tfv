"use client"

import {
  Armchair,
  CalendarDays,
  Clapperboard,
  FolderTree,
  Gauge,
  PackageCheck,
  ScrollText,
  Video,
  Wallet,
} from "lucide-react"
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
 *
 * ## El orden de las pestañas es el del trabajo, no el del catálogo
 *
 * Panel, guion, categorías, rodaje, utilería, entregas, planes, presupuesto. El guion va justo
 * después del panel porque es lo primero que existe: capítulos y escenas son lo que el rodaje, las
 * categorías y los planes acaban referenciando. Categorías y rodaje van seguidos por lo mismo que
 * utilería y entregas: **el mismo trabajo visto dos veces**, cómo se reparte y con quién y qué se
 * graba. Separarlas obligaría a cruzar la barra entera para pasar de un departamento al reparto que
 * lo compone.
 *
 * ## Guion y rodaje llevan **un solo permiso**, no tres como el presupuesto
 *
 * A diferencia del presupuesto, ninguna de las dos pestañas resuelve un aterrizaje entre varias
 * pantallas posibles: la de guion siempre entra por los guiones —`productions.pdfs.*`— y la
 * comprueba con la clave de capítulos porque es la que gobierna la estructura que arrastra a la
 * otra; la de rodaje entra siempre por las jornadas. Quien tenga la vista de guiones pero no la de
 * capítulos entra igual y ve el hueco explicado, no una pestaña que desaparece.
 *
 * ## El presupuesto es **una** pestaña, y por dentro son tres pantallas
 *
 * Anclas y compras no suben a la barra: son las dos colecciones de las que sale la resta, y desde
 * ninguna de las dos por separado se entiende el número. La barra lleva el presupuesto y dentro hay
 * una segunda barra con las tres.
 *
 * Por eso la pestaña recibe **los tres permisos y no uno ya resuelto**: quien no pueda ver el
 * resumen pero sí las compras tiene que entrar igual, y aterrizar donde puede. Resolverlo fuera
 * dejaría a cada pantalla decidiendo a dónde lleva la misma pestaña.
 */
export function ProductionNav({
  companyId,
  productionId,
  canViewProductions,
  canViewScript,
  canViewCategories,
  canViewRodaje,
  canViewItems,
  canViewDeliveries,
  canViewWorkflows,
  canViewBudget,
  canViewAnchors,
  canViewShoppings,
}: {
  companyId: string
  productionId: string
  canViewProductions: boolean
  canViewScript: boolean
  canViewCategories: boolean
  canViewRodaje: boolean
  canViewItems: boolean
  canViewDeliveries: boolean
  canViewWorkflows: boolean
  canViewBudget: boolean
  canViewAnchors: boolean
  canViewShoppings: boolean
}) {
  const t = useTranslations("productions")
  const pathname = usePathname()
  const base = `/c/${companyId}/productions/${productionId}`

  /**
   * A dónde lleva la pestaña del presupuesto, y si lleva a alguna parte.
   *
   * Al resumen cuando se puede ver; si no, a la primera colección que sí. Apuntar siempre al
   * resumen mandaría a un `403` a quien lleva las compras y no ve el conjunto — y un enlace que
   * lleva a una puerta cerrada enseña a desconfiar de los demás.
   */
  const budgetLanding = canViewBudget
    ? `${base}/budget`
    : canViewAnchors
      ? `${base}/budget/anchors`
      : canViewShoppings
        ? `${base}/budget/shoppings`
        : null

  const entries = [
    { href: base, label: t("panel.tab"), icon: Gauge, active: pathname === base },
    ...(canViewScript
      ? [
          {
            href: `${base}/script`,
            label: t("script.tab"),
            icon: ScrollText,
            active: pathname.startsWith(`${base}/script`),
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
    ...(canViewRodaje
      ? [
          {
            href: `${base}/rodaje`,
            label: t("rodaje.tab"),
            icon: Video,
            active: pathname.startsWith(`${base}/rodaje`),
          },
        ]
      : []),
    ...(canViewItems
      ? [
          {
            href: `${base}/items`,
            label: t("items.title"),
            icon: Armchair,
            active: pathname.startsWith(`${base}/items`),
          },
        ]
      : []),
    ...(canViewDeliveries
      ? [
          {
            href: `${base}/deliveries`,
            label: t("deliveries.title"),
            icon: PackageCheck,
            active: pathname.startsWith(`${base}/deliveries`),
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
    ...(budgetLanding === null
      ? []
      : [
          {
            href: budgetLanding,
            label: t("budget.title"),
            icon: Wallet,
            active: pathname.startsWith(`${base}/budget`),
          },
        ]),
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
