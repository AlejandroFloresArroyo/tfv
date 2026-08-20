import { Button, ItemCard } from "@tfv/ui"
import { CalendarDays } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import { type ProductionRow, WORKFLOW_STATUSES, type WorkflowRow } from "../../production.ts"
import { ProductionNav } from "../production-nav.tsx"
import { CreateWorkflow, WorkflowActions, WorkflowStatusBadge } from "./workflow-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.workflows.title") }
}

/**
 * Los planes de trabajo de una producción.
 *
 * ## Es un listado, y todavía no un calendario
 *
 * `production-workflows` pide además una vista de calendario por año, mes, semana y día, con la
 * fecha en la dirección. No está: el calendario es de la rebanada 22, junto con las tareas que le
 * dan contenido —un calendario de planes vacíos enseña rectángulos—. Lo que sí se cumple ya es que
 * **el estado de exploración vive en la dirección**, así que un listado filtrado por estado o por
 * fecha se comparte por enlace tal cual.
 *
 * El recuento de tareas de cada plan sí se enseña: es un campo calculado que llega siempre. El
 * desglose por estado no se pide aquí —`?aggregates=true`— porque en una lista de veinticuatro
 * planes serían cuatro cifras por fila, y lo que se lee de un vistazo es cuántas quedan.
 */
export default async function WorkflowsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; productionId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId, productionId } = await params
  const query = toSearchParams(await searchParams)
  const path =
    (await headers()).get("x-pathname") ?? `/c/${companyId}/productions/${productionId}/workflows`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewProductions = can(company, "productions.productions.view")
  const canCreate = can(company, "productions.workflows.create")
  const canEdit = can(company, "productions.workflows.edit")
  const canChangeStatus = can(company, "productions.workflows.status")
  const canDelete = can(company, "productions.workflows.delete")

  const [productionResult, result] = await Promise.all([
    canViewProductions
      ? apiGet<ProductionRow>(`/companies/${companyId}/productions/${productionId}`)
      : Promise.resolve(null),
    apiGet<PageEnvelope<WorkflowRow>>(
      `/companies/${companyId}/productions/${productionId}/workflows?${toApiQuery(query)}`,
    ),
  ])

  const filters: FilterSpec[] = [
    {
      kind: "multi",
      key: "status",
      label: t("productions.workflows.status"),
      options: WORKFLOW_STATUSES.map((status) => ({
        value: status,
        label: t(`productions.workflowStatus.${status}`),
      })),
    },
    {
      kind: "dateRange",
      key: "scheduledFor",
      label: t("productions.workflows.scheduledFor"),
      fromLabel: t("productions.from"),
      toLabel: t("productions.to"),
    },
  ]

  const create = canCreate ? (
    <CreateWorkflow companyId={companyId} productionId={productionId} />
  ) : undefined

  /**
   * La entrada al calendario, que es la otra vista de esto mismo.
   *
   * Va aquí y no en la navegación de la producción: el calendario **es** la presentación natural de
   * los planes, no una sección aparte, y la pestaña que ya existe lleva su icono desde el principio.
   */
  const toCalendar = (
    <Button variant="secondary" size="sm" asChild>
      <Link href={`/c/${companyId}/productions/${productionId}/workflows/calendar`}>
        <CalendarDays className="size-4" aria-hidden="true" />
        {t("productions.calendar.open")}
      </Link>
    </Button>
  )

  return (
    <PageShell
      title={t("productions.workflows.title")}
      {...(productionResult?.ok
        ? {
            subtitle: t("productions.workflows.subtitle", {
              production: productionResult.data.name,
            }),
          }
        : {})}
      actions={
        <>
          {toCalendar}
          {create}
        </>
      }
    >
      <ProductionNav
        companyId={companyId}
        productionId={productionId}
        canViewProductions={canViewProductions}
        canViewCategories={can(company, "productions.categories.view")}
        canViewItems={can(company, "productions.products.view")}
        canViewDeliveries={can(company, "productions.deliveries.view")}
        canViewWorkflows={can(company, "productions.workflows.view")}
        canViewBudget={can(company, "productions.budgets.view")}
        canViewAnchors={can(company, "productions.anchors.view")}
        canViewShoppings={can(company, "productions.shoppings.view")}
      />

      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("productions.workflows.searchPlaceholder")}
        emptyTitle={t("productions.workflows.empty")}
        emptyBody={t("productions.workflows.emptyBody")}
        emptyAction={create}
      >
        {(items, view) =>
          items.map((workflow) => (
            <ItemCard
              key={workflow.id}
              view={view}
              media={
                <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <CalendarDays className="size-4" aria-hidden="true" />
                </span>
              }
              title={
                <Link
                  href={`/c/${companyId}/productions/${productionId}/workflows/${workflow.id}`}
                  className="rounded-xs underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {format.dateTime(new Date(workflow.scheduledFor), { dateStyle: "full" })}
                </Link>
              }
              subtitle={workflow.observations || undefined}
              meta={
                <>
                  <WorkflowStatusBadge status={workflow.status} />
                  <span className="font-mono text-body3 text-content-faint">{workflow.code}</span>
                  <span className="text-body3 text-content-faint">
                    {t("productions.workflows.taskCount", { count: workflow.taskCount })}
                  </span>
                  {workflow.responsibleName ? (
                    <span className="text-body3 text-content-faint">
                      {workflow.responsibleName}
                    </span>
                  ) : null}
                </>
              }
              actions={
                <WorkflowActions
                  companyId={companyId}
                  productionId={productionId}
                  workflow={workflow}
                  canEdit={canEdit}
                  canChangeStatus={canChangeStatus}
                  canDelete={canDelete}
                />
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
