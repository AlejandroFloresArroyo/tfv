import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import type { PageEnvelope } from "~/components/collection/collection.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import {
  CALENDAR_VIEWS,
  type CalendarData,
  type CalendarView,
  type CharacterRow,
  type ProductionCategoryRow,
  type ProductionRow,
} from "../../../production.ts"
import { ProductionNav } from "../../production-nav.tsx"
import { ProductionCalendar } from "./calendar-view.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.calendar.title") }
}

/**
 * El calendario de la producción.
 *
 * ## Vive bajo los planes, y no en una pestaña propia
 *
 * Es la presentación natural de lo que la pestaña de planes ya lista —de hecho esa pestaña ya usa
 * el icono de calendario—, así que entra como su otra vista y no como una sección nueva. La
 * navegación de la producción no se toca.
 *
 * ## La fecha no se inventa aquí
 *
 * Sin `date` en la dirección, **es el servidor quien decide dónde aterrizar** y dice por qué. Esta
 * página no tiene forma de saberlo antes de preguntar: no sabe dónde están los sucesos. Lo único
 * que aporta al viaje es el día de quien mira —`today`—, porque «hoy» a las once de la noche en
 * México ya es mañana en tiempo universal, y el aterrizaje se resuelve contra hoy.
 *
 * ## Los filtros se piden aparte, y sólo si se pueden ver
 *
 * Personajes y categorías son de otros recursos con su propia clave. Sin permiso para verlos no se
 * piden y el filtro no se pinta: un desplegable vacío es peor que ninguno.
 */
export default async function ProductionCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; productionId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const { companyId, productionId } = await params
  const query = await searchParams
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/workflows/calendar`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewProductions = can(company, "productions.productions.view")
  const canViewCharacters = can(company, "productions.characters.view")
  const canViewCategories = can(company, "productions.categories.view")

  const view = viewOf(query.view)
  const requestedDate = dayOf(query.date)
  const characterId = single(query.characterId)
  const categoryId = single(query.categoryId)

  // El día de quien mira. El servidor de la aplicación y el de la API pueden estar en husos
  // distintos, así que se manda explícitamente en vez de dejar que cada uno suponga el suyo.
  const today = new Date().toISOString().slice(0, 10)

  const search = new URLSearchParams({ view, today })
  if (requestedDate !== null) search.set("date", requestedDate)
  if (characterId !== null) search.set("characterId", characterId)
  if (categoryId !== null) search.set("categoryId", categoryId)

  const [productionResult, calendarResult, charactersResult, categoriesResult] = await Promise.all([
    canViewProductions
      ? apiGet<ProductionRow>(`/companies/${companyId}/productions/${productionId}`)
      : Promise.resolve(null),
    apiGet<CalendarData>(
      `/companies/${companyId}/productions/${productionId}/calendar?${search.toString()}`,
    ),
    canViewCharacters
      ? apiGet<PageEnvelope<CharacterRow>>(
          `/companies/${companyId}/productions/${productionId}/characters?limit=96`,
        )
      : Promise.resolve(null),
    canViewCategories
      ? apiGet<PageEnvelope<ProductionCategoryRow>>(
          `/companies/${companyId}/productions/${productionId}/categories?limit=96`,
        )
      : Promise.resolve(null),
  ])

  const nav = (
    <ProductionNav
      companyId={companyId}
      productionId={productionId}
      canViewProductions={canViewProductions}
      canViewCategories={canViewCategories}
      canViewItems={can(company, "productions.products.view")}
      canViewDeliveries={can(company, "productions.deliveries.view")}
      canViewWorkflows={can(company, "productions.workflows.view")}
      canViewBudget={can(company, "productions.budgets.view")}
      canViewAnchors={can(company, "productions.anchors.view")}
      canViewShoppings={can(company, "productions.shoppings.view")}
      canViewScript={can(company, "productions.chapters.view")}
      canViewRodaje={can(company, "productions.recordings.view")}
    />
  )

  if (!calendarResult.ok) {
    return (
      <PageShell title={t("productions.calendar.title")}>
        {nav}
        <ApiFailure result={calendarResult} />
      </PageShell>
    )
  }

  return (
    <PageShell
      title={t("productions.calendar.title")}
      {...(productionResult?.ok
        ? {
            subtitle: t("productions.calendar.subtitle", {
              production: productionResult.data.name,
            }),
          }
        : {})}
    >
      {nav}

      <ProductionCalendar
        companyId={companyId}
        productionId={productionId}
        data={calendarResult.data}
        characters={charactersResult?.ok ? charactersResult.data.items : []}
        categories={categoriesResult?.ok ? categoriesResult.data.items : []}
        requestedDate={requestedDate}
        today={today}
      />
    </PageShell>
  )
}

function single(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value === undefined || value === "" ? null : value
}

function viewOf(value: string | string[] | undefined): CalendarView {
  const raw = single(value)
  return (CALENDAR_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as CalendarView) : "month"
}

/** Sólo un día civil bien formado viaja. Cualquier otra cosa se ignora y decide el servidor. */
function dayOf(value: string | string[] | undefined): string | null {
  const raw = single(value)
  return raw !== null && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}
