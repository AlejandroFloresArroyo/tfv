import { Badge, Panel } from "@tfv/ui"
import { CalendarDays, Clapperboard, Film, Layers, Wallet } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { Photo } from "~/components/photo.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import {
  type ProductionPanelData,
  type ProductionRow,
  RECORDING_STATUSES,
  WORKFLOW_STATUSES,
} from "../production.ts"
import { ProductionNav } from "./production-nav.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.panel.title") }
}

/**
 * La producción: su ficha y su panel.
 *
 * ## Por qué las dos cosas en la misma pantalla
 *
 * Porque son la misma pregunta hecha dos veces. «Qué es esto» —el nombre, las fechas, si está
 * publicada— y «cómo va» —cuánto guion hay, cuántas jornadas, cuántos planes, cuánto queda de
 * presupuesto— es lo que alguien necesita al abrir una producción, y separarlas en dos pestañas
 * obliga a ir y volver para responder a una sola cosa.
 *
 * La cabecera está siempre; el resumen depende de un permiso. Quien no pueda verlo entra igual y ve
 * la ficha, en lugar de una página vacía o una redirección que le quita el sitio donde estaba.
 *
 * ## Qué resume y qué no
 *
 * Exactamente lo que `production-management` enumera: capítulos y escenas, jornadas por estado,
 * planes por estado, y lo previsto contra lo gastado. Ni un indicador inventado.
 *
 * **Capítulos, escenas y planes de trabajo son enlace**; jornadas y presupuesto todavía no, porque
 * son de las rebanadas 21 y 22 y sus pantallas no existen — enlazar ahí sería peor que no enlazar.
 * Capítulos y escenas llegan a la misma pantalla —`script/chapters`—, que es donde vive la
 * estructura completa; separarlos habría sido dos enlaces a un solo sitio.
 */
export default async function ProductionPage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string }>
}) {
  const t = await getTranslations("productions")
  const format = await getFormatter()
  const { companyId, productionId } = await params
  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/productions/${productionId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewProductions = can(company, "productions.productions.view")
  const canViewWorkflows = can(company, "productions.workflows.view")
  const canViewPanel = can(company, "productions.budgets.view")
  const canViewChapters = can(company, "productions.chapters.view")
  const canViewRodaje = can(company, "productions.recordings.view")

  const base = `/companies/${companyId}/productions/${productionId}`
  const screen = `/c/${companyId}/productions/${productionId}`

  const [productionResult, panelResult] = await Promise.all([
    canViewProductions ? apiGet<ProductionRow>(base) : Promise.resolve(null),
    canViewPanel ? apiGet<ProductionPanelData>(`${base}/panel`) : Promise.resolve(null),
  ])

  const production = productionResult?.ok ? productionResult.data : null
  const panel = panelResult?.ok ? panelResult.data : null

  const nav = (
    <ProductionNav
      companyId={companyId}
      productionId={productionId}
      canViewProductions={canViewProductions}
      canViewCategories={can(company, "productions.categories.view")}
      canViewItems={can(company, "productions.products.view")}
      canViewDeliveries={can(company, "productions.deliveries.view")}
      canViewWorkflows={canViewWorkflows}
      canViewBudget={can(company, "productions.budgets.view")}
      canViewAnchors={can(company, "productions.anchors.view")}
      canViewShoppings={can(company, "productions.shoppings.view")}
      canViewScript={canViewChapters}
      canViewRodaje={canViewRodaje}
    />
  )

  if (productionResult && !productionResult.ok) {
    return (
      <PageShell title={t("panel.title")}>
        {nav}
        <ApiFailure result={productionResult} />
      </PageShell>
    )
  }

  const dates =
    production?.startsOn || production?.endsOn
      ? [
          production.startsOn
            ? format.dateTime(new Date(production.startsOn), { dateStyle: "medium" })
            : "—",
          production.endsOn
            ? format.dateTime(new Date(production.endsOn), { dateStyle: "medium" })
            : "—",
        ].join(" – ")
      : t("noDates")

  return (
    <PageShell title={production?.name ?? t("panel.title")} subtitle={t("panel.subtitle")}>
      {nav}

      {production ? (
        <Panel className="mb-6 flex flex-wrap items-start gap-4 p-5">
          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-sm bg-panel-hover text-content-muted">
            {(production.imageThumbnailUrl ?? production.imageUrl) ? (
              <Photo
                src={(production.imageThumbnailUrl ?? production.imageUrl) as string}
                className="size-full object-cover"
              />
            ) : (
              <Clapperboard className="size-5" aria-hidden="true" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={production.isPublished ? "success" : "neutral"}>
                {production.isPublished ? t("published") : t("unpublished")}
              </Badge>
              <span className="inline-flex items-center gap-1.5 text-body3 text-content-faint">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {dates}
              </span>
            </div>

            {production.description ? (
              <p className="mt-2 max-w-prose text-body1 text-content-muted">
                {production.description}
              </p>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {canViewPanel ? null : (
        <Panel className="p-6">
          <p className="text-title2 font-bold text-content">{t("panel.nothing")}</p>
          <p className="mt-1.5 max-w-prose text-body1 text-content-muted">
            {t("panel.nothingBody")}
          </p>
        </Panel>
      )}

      {panelResult && !panelResult.ok ? <ApiFailure result={panelResult} /> : null}

      {panel ? (
        <>
          <div className="grid gap-3 tablet:grid-cols-2 laptop:grid-cols-4">
            <Stat
              icon={Film}
              label={t("panel.chapters")}
              value={panel.chapters}
              href={canViewChapters ? `${screen}/script/chapters` : undefined}
            />
            <Stat
              icon={Layers}
              label={t("panel.scenes")}
              value={panel.scenes}
              href={canViewChapters ? `${screen}/script/chapters` : undefined}
            />
            <Stat
              icon={CalendarDays}
              label={t("panel.recordings")}
              value={total(panel.recordings)}
              href={canViewRodaje ? `${screen}/rodaje` : undefined}
            />
            <Stat
              icon={CalendarDays}
              label={t("panel.workflows")}
              value={total(panel.workflows)}
              href={canViewWorkflows ? `${screen}/workflows` : undefined}
            />
          </div>

          <section aria-labelledby="panel-desglose" className="mt-6 grid gap-3 laptop:grid-cols-2">
            <Panel className="p-5">
              <h2 id="panel-desglose" className="text-title2 font-bold text-content">
                {t("panel.recordingsByStatus")}
              </h2>
              <dl className="mt-3 grid gap-2">
                {RECORDING_STATUSES.map((status) => (
                  <div key={status} className="flex items-baseline justify-between gap-3">
                    <dt className="text-body2 text-content-muted">
                      {t(`recordingStatus.${status}`)}
                    </dt>
                    <dd className="text-body1 font-bold tabular-nums text-content">
                      {panel.recordings[status]}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <Panel className="p-5">
              <h2 className="text-title2 font-bold text-content">{t("panel.workflowsByStatus")}</h2>
              <dl className="mt-3 grid gap-2">
                {WORKFLOW_STATUSES.map((status) => (
                  <div key={status} className="flex items-baseline justify-between gap-3">
                    <dt className="text-body2 text-content-muted">
                      {t(`workflowStatus.${status}`)}
                    </dt>
                    <dd className="text-body1 font-bold tabular-nums text-content">
                      {panel.workflows[status]}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </section>

          <section aria-labelledby="panel-presupuesto" className="mt-6">
            <Panel className="p-5">
              <h2
                id="panel-presupuesto"
                className="flex items-center gap-2 text-title2 font-bold text-content"
              >
                <Wallet className="size-4 text-content-faint" aria-hidden="true" />
                {t("panel.budget")}
              </h2>
              <p className="mt-1 text-body3 text-content-faint">{t("panel.budgetHint")}</p>

              <dl className="mt-4 grid gap-4 tablet:grid-cols-3">
                <Amount label={t("panel.anchored")} value={panel.budget.anchored} />
                <Amount label={t("panel.spent")} value={panel.budget.spent} />
                <Amount
                  label={t("panel.difference")}
                  value={panel.budget.difference}
                  alert={panel.budget.difference.startsWith("-")}
                />
              </dl>
            </Panel>
          </section>
        </>
      ) : null}
    </PageShell>
  )
}

function total(breakdown: Record<string, number>): number {
  return Object.values(breakdown).reduce((sum, value) => sum + value, 0)
}

/** Una cifra del panel. Con `href` es además el enlace al listado que la produce. */
function Stat({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Film
  label: string
  value: number
  href?: string | undefined
}) {
  const body = (
    <Panel className="flex h-full flex-col gap-2 p-5 transition-colors group-hover:border-edge-control group-hover:bg-panel-hover">
      <span className="flex items-center gap-2 text-body3 font-semibold text-content-faint">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </span>
      <p className="text-h3 font-bold tabular-nums text-content">{value}</p>
    </Panel>
  )

  return href ? (
    <Link href={href} className="group block rounded-md">
      {body}
    </Link>
  ) : (
    <div className="group">{body}</div>
  )
}

/**
 * Un importe del presupuesto.
 *
 * Se pinta **la cadena que llegó**, sin convertirla a número: el importe es decimal exacto y
 * pasarlo por `Number` para formatearlo es exactamente lo que la regla del proyecto prohíbe.
 */
function Amount({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div>
      <dt className="text-body3 font-semibold text-content-faint">{label}</dt>
      <dd
        className={
          alert
            ? "mt-1 text-title1 font-bold tabular-nums text-tinta-cuida"
            : "mt-1 text-title1 font-bold tabular-nums text-content"
        }
      >
        {value}
      </dd>
    </div>
  )
}
