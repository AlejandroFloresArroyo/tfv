import { Badge, Button, Panel } from "@tfv/ui"
import { FileText } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import type { PageEnvelope } from "~/components/collection/collection.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type {
  CharacterRow,
  CommentRow,
  ProductionCategoryRow,
  TaskRow,
  WorkflowRow,
} from "../../../production.ts"
import { ProductionNav } from "../../production-nav.tsx"
import { CreateTask, TaskCard, type TaskPermissions, WorkflowComments } from "./task-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.tasks.title") }
}

/** Los cinco estados de un plan, cada uno con su temperatura de set. */
const WORKFLOW_TONE = {
  pending: "reposo",
  in_progress: "curso",
  rescheduled: "cuida",
  completed: "firme",
  cancelled: "alto",
} as const

/**
 * Un plan de trabajo abierto: la orden del día con todo lo que cuelga de ella.
 *
 * ## Las tareas se listan aquí, y lo suyo se abre por dentro
 *
 * La lista pide el desglose por estado —`?aggregates=true`— porque en una sola jornada de trabajo
 * saber cuántas van completadas **es** la razón de abrir esta pantalla. Lo que cuelga de cada tarea
 * se pide al desplegarla: treinta peticiones al cargar para enseñar tres cifras que ya vienen en el
 * resumen sería pagar por lo que nadie ha pedido todavía.
 *
 * ## El documento sale de aquí
 *
 * El plan se genera como hoja con sus tareas agrupadas por semana y por día, y se comparte por
 * enlace público. El enlace lo emite el servidor al componer el documento, y es estable.
 */
export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; workflowId: string }>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId, productionId, workflowId } = await params
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/workflows/${workflowId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canViewCategories = can(company, "productions.categories.view")
  const canViewCharacters = can(company, "productions.characters.view")

  const permissions: TaskPermissions = {
    canEdit: can(company, "productions.workflows.task_edit"),
    canChangeStatus: can(company, "productions.workflows.task_status"),
    canSelectCategory: can(company, "productions.workflows.task_select_category"),
    canDelete: can(company, "productions.workflows.task_delete"),
    canComment: can(company, "productions.workflows.task_comments"),
    canAddActivity: can(company, "productions.workflows.task_activity_create"),
    canEditActivity: can(company, "productions.workflows.task_activity_edit"),
    canChangeActivityStatus: can(company, "productions.workflows.task_activity_status"),
    canDeleteActivity: can(company, "productions.workflows.task_activity_delete"),
  }

  const base = `/companies/${companyId}/productions/${productionId}/workflows/${workflowId}`

  const [workflowResult, tasksResult, commentsResult, categoriesResult, charactersResult] =
    await Promise.all([
      apiGet<WorkflowRow>(`${base}?aggregates=true`),
      apiGet<PageEnvelope<TaskRow>>(`${base}/tasks?aggregates=true&limit=96`),
      apiGet<{ items: CommentRow[] }>(`${base}/comments`),
      canViewCategories
        ? apiGet<PageEnvelope<ProductionCategoryRow>>(
            `/companies/${companyId}/productions/${productionId}/categories?limit=96`,
          )
        : Promise.resolve(null),
      canViewCharacters
        ? apiGet<PageEnvelope<CharacterRow>>(
            `/companies/${companyId}/productions/${productionId}/characters?limit=96`,
          )
        : Promise.resolve(null),
    ])

  const nav = (
    <ProductionNav
      companyId={companyId}
      productionId={productionId}
      canViewProductions={can(company, "productions.productions.view")}
      canViewCategories={canViewCategories}
      canViewItems={can(company, "productions.products.view")}
      canViewDeliveries={can(company, "productions.deliveries.view")}
      canViewWorkflows={can(company, "productions.workflows.view")}
      canViewBudget={can(company, "productions.budgets.view")}
      canViewAnchors={can(company, "productions.anchors.view")}
      canViewShoppings={can(company, "productions.shoppings.view")}
    />
  )

  if (!workflowResult.ok) {
    return (
      <PageShell title={t("productions.tasks.title")}>
        {nav}
        <ApiFailure result={workflowResult} />
      </PageShell>
    )
  }

  const workflow = workflowResult.data
  const categories = categoriesResult?.ok ? categoriesResult.data.items : []
  const characters = charactersResult?.ok ? charactersResult.data.items : []

  return (
    <PageShell
      title={format.dateTime(new Date(workflow.scheduledFor), { dateStyle: "full" })}
      {...(workflow.observations === "" ? {} : { subtitle: workflow.observations })}
      actions={
        <Button variant="secondary" size="sm" asChild>
          <Link
            href={`/c/${companyId}/productions/${productionId}/workflows/${workflowId}/document`}
          >
            <FileText className="size-4" aria-hidden="true" />
            {t("productions.tasks.document")}
          </Link>
        </Button>
      }
    >
      {nav}

      <div className="flex flex-col gap-6">
        <Panel className="flex flex-wrap items-center gap-3 p-4">
          {/* El color nunca viaja solo: la insignia lleva el punto y la palabra. */}
          <Badge tone={WORKFLOW_TONE[workflow.status]}>
            {t(`productions.workflowStatus.${workflow.status}`)}
          </Badge>
          <span className="font-mono text-body3 text-content-faint">{workflow.code}</span>
          {workflow.responsibleName ? (
            <span className="text-body3 text-content-faint">{workflow.responsibleName}</span>
          ) : null}
          <span className="text-body3 text-content-faint">
            {t("productions.workflows.taskCount", { count: workflow.taskCount })}
          </span>

          <Link
            href={`/c/${companyId}/productions/${productionId}/workflows/calendar?view=day&date=${workflow.scheduledFor.slice(0, 10)}`}
            className="ml-auto text-body3 text-content-muted underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
          >
            {t("productions.calendar.seeInCalendar")}
          </Link>
        </Panel>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-title2 font-bold text-content">{t("productions.tasks.title")}</h2>
            {can(company, "productions.workflows.task_create") ? (
              <CreateTask
                companyId={companyId}
                productionId={productionId}
                workflowId={workflowId}
                categories={categories}
                characters={characters}
                canSelectCategory={permissions.canSelectCategory}
              />
            ) : null}
          </div>

          {!tasksResult.ok ? (
            <ApiFailure result={tasksResult} />
          ) : tasksResult.data.items.length === 0 ? (
            <p className="rounded-lg border border-edge border-dashed bg-panel px-4 py-10 text-center text-body2 text-content-muted">
              {t("productions.tasks.empty")}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {tasksResult.data.items.map((task) => (
                <TaskCard
                  key={task.id}
                  companyId={companyId}
                  productionId={productionId}
                  workflowId={workflowId}
                  task={task}
                  categories={categories}
                  characters={characters}
                  permissions={permissions}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-title2 font-bold text-content">
            {t("productions.comments.planTitle")}
          </h2>
          <Panel className="p-4">
            <WorkflowComments
              companyId={companyId}
              productionId={productionId}
              workflowId={workflowId}
              initial={commentsResult.ok ? commentsResult.data.items : []}
              canComment={can(company, "productions.workflows.comments")}
            />
          </Panel>
        </section>
      </div>
    </PageShell>
  )
}
