"use client"

import { Badge, Button, DialogTrigger, Field, Input, Select, Textarea } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import { WORKFLOW_STATUSES, type WorkflowRow, type WorkflowStatus } from "../../production.ts"

/**
 * Alta, edición y baja de un plan de trabajo.
 *
 * ## Reprogramar es un solo diálogo
 *
 * La fecha y el estado se guardan juntos, porque el escenario de la spec los junta: «se cambia la
 * fecha de un plan y se marca como reprogramado». Dos formularios dejarían una ventana en la que la
 * jornada ya se movió y el estado todavía dice pendiente, y quien mire el calendario en ese momento
 * ve una jornada movida sin motivo aparente.
 *
 * El desplegable de estado sólo se ofrece a quien tiene `productions.workflows.status`. No se pinta
 * apagado: se omite. Si alguien lo envía igual, el servidor responde `403` — ocultar no es
 * proteger, y esto es lo primero.
 */

function basePath(companyId: string, productionId: string) {
  return `/companies/${companyId}/productions/${productionId}/workflows`
}

/** El día de un instante, en la zona de quien mira, como lo quiere un campo `date`. */
function toDayValue(instant: string | null): string {
  if (instant === null) return ""
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return ""

  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** El instante del comienzo de ese día, en la zona de quien escribe. Vacío es «sin fecha». */
function toInstant(day: string): string | null {
  if (day === "") return null
  const date = new Date(`${day}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  const t = useTranslations("productions.workflowStatus")

  const tone =
    status === "completed"
      ? "success"
      : status === "cancelled"
        ? "danger"
        : status === "in_progress"
          ? "accent"
          : status === "rescheduled"
            ? "warning"
            : "neutral"

  return <Badge tone={tone}>{t(status)}</Badge>
}

function WorkflowFields({
  workflow,
  canChangeStatus,
  fieldErrors,
}: {
  workflow?: WorkflowRow
  canChangeStatus: boolean
  fieldErrors: ReadonlyMap<string, string>
}) {
  const t = useTranslations("productions.workflows")

  return (
    <>
      <div className="grid gap-4 tablet:grid-cols-2">
        <Field label={t("scheduledFor")} error={fieldErrors.get("scheduledFor")} required>
          {(ids) => (
            <Input
              {...ids}
              type="date"
              name="scheduledFor"
              autoFocus
              defaultValue={toDayValue(workflow?.scheduledFor ?? null)}
            />
          )}
        </Field>

        <Field label={t("endsAt")} hint={t("endsAtHint")} error={fieldErrors.get("endsAt")}>
          {(ids) => (
            <Input
              {...ids}
              type="date"
              name="endsAt"
              defaultValue={toDayValue(workflow?.endsAt ?? null)}
            />
          )}
        </Field>
      </div>

      {workflow && canChangeStatus ? (
        <Field label={t("status")} hint={t("statusHint")} error={fieldErrors.get("status")}>
          {(ids) => (
            <Select {...ids} name="status" defaultValue={workflow.status}>
              {WORKFLOW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`option.${status}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}

      <Field label={t("observations")} error={fieldErrors.get("observations")}>
        {(ids) => (
          <Textarea
            {...ids}
            name="observations"
            rows={3}
            maxLength={4000}
            defaultValue={workflow?.observations ?? ""}
            placeholder={t("observationsPlaceholder")}
          />
        )}
      </Field>
    </>
  )
}

export function CreateWorkflow({
  companyId,
  productionId,
}: {
  companyId: string
  productionId: string
}) {
  const t = useTranslations("productions.workflows")
  const common = useTranslations("common")

  return (
    <FormDialog
      title={t("createTitle")}
      description={t("createBody")}
      submitLabel={common("create")}
      size="sm"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            {t("create")}
          </Button>
        </DialogTrigger>
      }
      action={(data) =>
        api(basePath(companyId, productionId), {
          method: "POST",
          body: {
            scheduledFor: toInstant(text(data, "scheduledFor")),
            endsAt: toInstant(text(data, "endsAt")),
            ...(optional(data, "observations") ? { observations: text(data, "observations") } : {}),
          },
        })
      }
    >
      {(state) => <WorkflowFields canChangeStatus={false} fieldErrors={state.fieldErrors} />}
    </FormDialog>
  )
}

function EditWorkflow({
  companyId,
  productionId,
  workflow,
  canChangeStatus,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  workflow: WorkflowRow
  canChangeStatus: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.workflows")
  const common = useTranslations("common")

  return (
    <FormDialog
      title={t("editTitle", { code: workflow.code })}
      submitLabel={common("save")}
      size="sm"
      open={open}
      onOpenChange={onOpenChange}
      action={(data) =>
        api(`${basePath(companyId, productionId)}/${workflow.id}`, {
          method: "PATCH",
          body: {
            scheduledFor: toInstant(text(data, "scheduledFor")),
            endsAt: toInstant(text(data, "endsAt")),
            observations: text(data, "observations"),
            // Sólo se envía cuando de verdad se pudo elegir: mandarlo siempre haría que el
            // servidor exigiese la clave de estado a quien sólo venía a corregir una nota.
            ...(canChangeStatus ? { status: text(data, "status") } : {}),
          },
        })
      }
    >
      {(state) => (
        <WorkflowFields
          workflow={workflow}
          canChangeStatus={canChangeStatus}
          fieldErrors={state.fieldErrors}
        />
      )}
    </FormDialog>
  )
}

/**
 * La baja, con sus tareas enumeradas antes de confirmar.
 *
 * «La confirmación SHALL enumerar previamente lo que se perderá». Aquí no hace falta preguntar al
 * servidor al abrir, como en la baja de una producción: el recuento de tareas **ya viaja con el
 * plan** —es un campo calculado, no un agregado costoso—, así que la cascada está delante desde el
 * primer instante y no hay ventana en la que no se pueda confirmar.
 *
 * La consulta de alcance existe igual, para quien la necesite sin el listado a mano.
 */
function DeleteWorkflow({
  companyId,
  productionId,
  workflow,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  workflow: WorkflowRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.workflows")
  const common = useTranslations("common")

  return (
    <ConfirmDestructive
      title={t("deleteTitle")}
      entity={workflow.code}
      // El recuento ya viaja con el plan, así que aquí no hay nada que esperar: enumerarlo con lo
      // que la lista ya sabe evita una consulta y una ventana en la que no se puede confirmar.
      cascade={workflow.taskCount > 0 ? [t("deleteTasks", { count: workflow.taskCount })] : []}
      confirmLabel={common("delete")}
      open={open}
      onOpenChange={onOpenChange}
      action={() =>
        api(`${basePath(companyId, productionId)}/${workflow.id}`, { method: "DELETE" })
      }
    />
  )
}

export function WorkflowActions({
  companyId,
  productionId,
  workflow,
  canEdit,
  canChangeStatus,
  canDelete,
}: {
  companyId: string
  productionId: string
  workflow: WorkflowRow
  canEdit: boolean
  canChangeStatus: boolean
  canDelete: boolean
}) {
  const common = useTranslations("common")
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: common("edit"),
      dialog: (control) => (
        <EditWorkflow
          key="edit"
          companyId={companyId}
          productionId={productionId}
          workflow={workflow}
          canChangeStatus={canChangeStatus}
          {...control}
        />
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: common("delete"),
      danger: true,
      dialog: (control) => (
        <DeleteWorkflow
          key="delete"
          companyId={companyId}
          productionId={productionId}
          workflow={workflow}
          {...control}
        />
      ),
    })
  }

  return <ItemActions label={common("actions")} actions={actions} />
}
