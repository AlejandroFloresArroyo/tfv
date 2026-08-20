"use client"

import {
  Badge,
  Button,
  DialogTrigger,
  Field,
  Input,
  Panel,
  Select,
  Spinner,
  Textarea,
} from "@tfv/ui"
import { Paperclip, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useCallback, useState, useTransition } from "react"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { PhotoPicker, usePhotoUploads } from "~/components/photo-picker.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import {
  type ActivityRow,
  type CharacterRow,
  type CommentRow,
  type ProductionCategoryRow,
  TASK_STATUSES,
  type TaskDetailRow,
  type TaskRow,
  type TaskScope,
} from "../../../production.ts"

/**
 * Tareas, actividades, comentarios y adjuntos de un plan de trabajo.
 *
 * ## El creador no aparece en ningún formulario
 *
 * «El creador de una tarea SHALL ser siempre quien la creó, y no SHALL poder modificarse». Aquí eso
 * se cumple de la única forma que se cumple de verdad: **no hay campo**. Se enseña, no se edita. El
 * servidor tampoco lo admitiría, pero un campo desactivado enseña que existe una manera.
 *
 * ## Cada estado, con su nombre escrito al lado
 *
 * Los cuatro de tarea y los dos de actividad toman una temperatura de set y **nunca viajan solos**:
 * la insignia lleva el punto de color y la palabra. Es la regla del sistema, y aquí importa el
 * doble porque en una lista de veinte tareas el color es lo único que se mira de lejos.
 *
 * ## Los adjuntos se suben después de que la tarea exista
 *
 * Es la regla de `forms-and-wizards`: la subida va directa al almacenamiento y puede fallar por su
 * cuenta. Encadenarla al guardado haría perder la tarea entera porque un PDF se cortó.
 */

/** Cada uno de los cuatro estados de tarea toma su temperatura. */
const TASK_TONE = {
  pending: "reposo",
  in_progress: "curso",
  completed: "firme",
  // Cerrada sin terminar: pide atención, no está bloqueada.
  incomplete: "cuida",
} as const

/** Lo que se puede adjuntar a una tarea: documentos y fotos, no sólo imágenes. */
const ATTACHMENT_POLICY = {
  accept: ["image", "document", "file"] as const,
  maxBytes: 25 * 1024 * 1024,
  maxFiles: 10,
}

function tasksPath(companyId: string, productionId: string, workflowId: string) {
  return `/companies/${companyId}/productions/${productionId}/workflows/${workflowId}/tasks`
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

export function TaskStatusBadge({ status }: { status: TaskRow["status"] }) {
  const t = useTranslations("productions.taskStatus")
  return <Badge tone={TASK_TONE[status]}>{t(status)}</Badge>
}

export function ActivityStatusBadge({ status }: { status: ActivityRow["status"] }) {
  const t = useTranslations("productions.activityStatus")
  return <Badge tone={status === "completed" ? "firme" : "reposo"}>{t(status)}</Badge>
}

// ─── Alta y edición de tareas ────────────────────────────────────────────────

function TaskFields({
  task,
  categories,
  characters,
  canChangeStatus,
  canSelectCategory,
  fieldErrors,
}: {
  task?: TaskRow
  categories: readonly ProductionCategoryRow[]
  characters: readonly CharacterRow[]
  canChangeStatus: boolean
  canSelectCategory: boolean
  fieldErrors: ReadonlyMap<string, string>
}) {
  const t = useTranslations("productions.tasks")

  return (
    <>
      <Field label={t("title")} error={fieldErrors.get("title")} required>
        {(ids) => (
          <Input {...ids} name="title" autoFocus defaultValue={task?.title ?? ""} maxLength={250} />
        )}
      </Field>

      <Field label={t("description")} error={fieldErrors.get("description")}>
        {(ids) => (
          <Textarea
            {...ids}
            name="description"
            rows={3}
            maxLength={4000}
            defaultValue={task?.description ?? ""}
          />
        )}
      </Field>

      <div className="grid gap-4 tablet:grid-cols-2">
        <Field label={t("scheduledFor")} error={fieldErrors.get("scheduledFor")}>
          {(ids) => (
            <Input
              {...ids}
              type="date"
              name="scheduledFor"
              defaultValue={toDayValue(task?.scheduledFor ?? null)}
            />
          )}
        </Field>

        <Field label={t("endsAt")} error={fieldErrors.get("endsAt")}>
          {(ids) => (
            <Input
              {...ids}
              type="date"
              name="endsAt"
              defaultValue={toDayValue(task?.endsAt ?? null)}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-4 tablet:grid-cols-2">
        {/* Clasificar dirige el trabajo a un departamento, y por eso lleva clave propia. */}
        {canSelectCategory && categories.length > 0 ? (
          <Field label={t("category")} hint={t("categoryHint")}>
            {(ids) => (
              <Select {...ids} name="categoryId" defaultValue={task?.categoryId ?? ""}>
                <option value="">{t("noCategory")}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        {characters.length > 0 ? (
          <Field label={t("character")}>
            {(ids) => (
              <Select {...ids} name="characterId" defaultValue={task?.characterId ?? ""}>
                <option value="">{t("noCharacter")}</option>
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </div>

      {task && canChangeStatus ? (
        <Field label={t("status")}>
          {(ids) => (
            <Select {...ids} name="status" defaultValue={task.status}>
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`option.${status}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
    </>
  )
}

function bodyOf(
  data: FormData,
  options: { canSelectCategory: boolean; canChangeStatus: boolean; withStatus: boolean },
): Record<string, unknown> {
  return {
    title: text(data, "title"),
    description: text(data, "description"),
    scheduledFor: toInstant(text(data, "scheduledFor")),
    endsAt: toInstant(text(data, "endsAt")),
    characterId: optional(data, "characterId") ? text(data, "characterId") : null,
    // Sólo se manda lo que de verdad se pudo elegir: mandarlo siempre haría que el servidor
    // exigiese la clave fina a quien sólo venía a corregir un título.
    ...(options.canSelectCategory
      ? { categoryId: optional(data, "categoryId") ? text(data, "categoryId") : null }
      : {}),
    ...(options.withStatus && options.canChangeStatus ? { status: text(data, "status") } : {}),
  }
}

export function CreateTask({
  companyId,
  productionId,
  workflowId,
  categories,
  characters,
  canSelectCategory,
}: {
  companyId: string
  productionId: string
  workflowId: string
  categories: readonly ProductionCategoryRow[]
  characters: readonly CharacterRow[]
  canSelectCategory: boolean
}) {
  const t = useTranslations("productions.tasks")
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
        api(tasksPath(companyId, productionId, workflowId), {
          method: "POST",
          body: bodyOf(data, {
            canSelectCategory,
            canChangeStatus: false,
            withStatus: false,
          }),
        })
      }
    >
      {(state) => (
        <TaskFields
          categories={categories}
          characters={characters}
          canChangeStatus={false}
          canSelectCategory={canSelectCategory}
          fieldErrors={state.fieldErrors}
        />
      )}
    </FormDialog>
  )
}

function EditTask({
  companyId,
  productionId,
  workflowId,
  task,
  categories,
  characters,
  canChangeStatus,
  canSelectCategory,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  workflowId: string
  task: TaskRow
  categories: readonly ProductionCategoryRow[]
  characters: readonly CharacterRow[]
  canChangeStatus: boolean
  canSelectCategory: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.tasks")
  const common = useTranslations("common")

  return (
    <FormDialog
      title={t("editTitle")}
      submitLabel={common("save")}
      size="sm"
      open={open}
      onOpenChange={onOpenChange}
      action={(data) =>
        api(`${tasksPath(companyId, productionId, workflowId)}/${task.id}`, {
          method: "PATCH",
          body: bodyOf(data, { canSelectCategory, canChangeStatus, withStatus: true }),
        })
      }
    >
      {(state) => (
        <TaskFields
          task={task}
          categories={categories}
          characters={characters}
          canChangeStatus={canChangeStatus}
          canSelectCategory={canSelectCategory}
          fieldErrors={state.fieldErrors}
        />
      )}
    </FormDialog>
  )
}

/**
 * La baja de una tarea, con lo que se lleva por delante enumerado antes.
 *
 * El alcance se pregunta al servidor al abrir: al contrario que en el plan —cuyo recuento de tareas
 * ya viaja en la lista— aquí las cifras de actividades, comentarios y adjuntos no están a mano, y
 * enumerar de memoria sería inventarlas.
 */
function DeleteTask({
  companyId,
  productionId,
  workflowId,
  task,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  workflowId: string
  task: TaskRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.tasks")
  const common = useTranslations("common")
  const [scope, setScope] = useState<TaskScope | null>(null)

  const load = useCallback(async () => {
    try {
      setScope(
        await api<TaskScope>(`${tasksPath(companyId, productionId, workflowId)}/${task.id}/scope`),
      )
    } catch {
      // Sin alcance se confirma igual: la baja no depende de poder enumerarla, y bloquear la
      // acción porque una lectura auxiliar falló sería peor que confirmar sin la lista.
      setScope(null)
    }
  }, [companyId, productionId, workflowId, task.id])

  const cascade = [
    ...(scope && scope.activities > 0 ? [t("deleteActivities", { count: scope.activities })] : []),
    ...(scope && scope.comments > 0 ? [t("deleteComments", { count: scope.comments })] : []),
    ...(scope && scope.attachments > 0
      ? [t("deleteAttachments", { count: scope.attachments })]
      : []),
  ]

  return (
    <ConfirmDestructive
      title={t("deleteTitle")}
      entity={task.title}
      cascade={cascade}
      confirmLabel={common("delete")}
      open={open}
      onOpenChange={(next) => {
        if (next) void load()
        onOpenChange(next)
      }}
      action={() =>
        api(`${tasksPath(companyId, productionId, workflowId)}/${task.id}`, { method: "DELETE" })
      }
    />
  )
}

export function TaskActions({
  companyId,
  productionId,
  workflowId,
  task,
  categories,
  characters,
  canEdit,
  canChangeStatus,
  canSelectCategory,
  canDelete,
}: {
  companyId: string
  productionId: string
  workflowId: string
  task: TaskRow
  categories: readonly ProductionCategoryRow[]
  characters: readonly CharacterRow[]
  canEdit: boolean
  canChangeStatus: boolean
  canSelectCategory: boolean
  canDelete: boolean
}) {
  const common = useTranslations("common")
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: common("edit"),
      dialog: (control) => (
        <EditTask
          key="edit"
          companyId={companyId}
          productionId={productionId}
          workflowId={workflowId}
          task={task}
          categories={categories}
          characters={characters}
          canChangeStatus={canChangeStatus}
          canSelectCategory={canSelectCategory}
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
        <DeleteTask
          key="delete"
          companyId={companyId}
          productionId={productionId}
          workflowId={workflowId}
          task={task}
          {...control}
        />
      ),
    })
  }

  if (actions.length === 0) return null
  return <ItemActions label={common("actions")} actions={actions} />
}

// ─── La tarea abierta ────────────────────────────────────────────────────────

export interface TaskPermissions {
  readonly canEdit: boolean
  readonly canChangeStatus: boolean
  readonly canSelectCategory: boolean
  readonly canDelete: boolean
  readonly canComment: boolean
  readonly canAddActivity: boolean
  readonly canEditActivity: boolean
  readonly canChangeActivityStatus: boolean
  readonly canDeleteActivity: boolean
}

/**
 * Una tarea de la lista, que se abre para enseñar lo que cuelga de ella.
 *
 * El detalle **se pide al abrir**, no al pintar la lista. Un plan con treinta tareas serían treinta
 * peticiones para enseñar tres cifras que ya vienen en el resumen: cuántas actividades, cuántos
 * comentarios y cuántos archivos. Lo que hay dentro se lee cuando alguien quiere leerlo.
 */
export function TaskCard({
  companyId,
  productionId,
  workflowId,
  task,
  categories,
  characters,
  permissions,
}: {
  companyId: string
  productionId: string
  workflowId: string
  task: TaskRow
  categories: readonly ProductionCategoryRow[]
  characters: readonly CharacterRow[]
  permissions: TaskPermissions
}) {
  const t = useTranslations("productions.tasks")
  const format = useFormatter()
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<TaskDetailRow | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setDetail(
        await api<TaskDetailRow>(`${tasksPath(companyId, productionId, workflowId)}/${task.id}`),
      )
    } finally {
      setLoading(false)
    }
  }, [companyId, productionId, workflowId, task.id])

  return (
    <Panel id={`tarea-${task.id}`} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-body1 text-content">{task.title}</h3>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} />

            {task.categoryName ? (
              <span className="text-body3 text-content-faint">{task.categoryName}</span>
            ) : null}
            {task.characterName ? (
              <span className="text-body3 text-content-faint">{task.characterName}</span>
            ) : null}
            {task.scheduledFor ? (
              <span className="text-body3 text-content-faint tabular-nums">
                {format.dateTime(new Date(task.scheduledFor), { dateStyle: "medium" })}
              </span>
            ) : null}
            {task.responsibleName ? (
              <span className="text-body3 text-content-faint">{task.responsibleName}</span>
            ) : null}
          </div>

          {/* El creador se enseña y no se edita: no hay campo en ningún formulario. */}
          {task.createdByName ? (
            <p className="mt-1.5 text-body3 text-content-faint">
              {t("createdBy", { name: task.createdByName })}
            </p>
          ) : null}
        </div>

        <TaskActions
          companyId={companyId}
          productionId={productionId}
          workflowId={workflowId}
          task={task}
          categories={categories}
          characters={characters}
          canEdit={permissions.canEdit}
          canChangeStatus={permissions.canChangeStatus}
          canSelectCategory={permissions.canSelectCategory}
          canDelete={permissions.canDelete}
        />
      </div>

      <button
        type="button"
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next && detail === null) void reload()
        }}
        aria-expanded={open}
        className="mt-3 flex items-center gap-3 text-body3 text-content-muted transition-colors hover:text-content focus-visible:outline-2 focus-visible:outline-focus"
      >
        <span>{t("activityCount", { count: task.activityCount })}</span>
        <span>{t("commentCount", { count: task.commentCount })}</span>
        <span className="flex items-center gap-1">
          <Paperclip className="size-3" aria-hidden="true" />
          {task.attachmentCount}
        </span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>

      {open ? (
        <div className="mt-4 flex flex-col gap-5 border-edge border-t pt-4">
          {loading && detail === null ? (
            <p className="flex items-center gap-2 text-body3 text-content-muted">
              <Spinner /> {t("loading")}
            </p>
          ) : detail === null ? null : (
            <>
              <Activities
                companyId={companyId}
                productionId={productionId}
                workflowId={workflowId}
                taskId={task.id}
                activities={detail.activities}
                permissions={permissions}
                onChanged={reload}
              />

              <Attachments
                companyId={companyId}
                productionId={productionId}
                base={`${tasksPath(companyId, productionId, workflowId)}/${task.id}/attachments`}
                attachments={detail.attachments}
                canManage={permissions.canEdit}
                onChanged={reload}
              />

              <Comments
                base={`${tasksPath(companyId, productionId, workflowId)}/${task.id}/comments`}
                comments={detail.comments}
                canComment={permissions.canComment}
                onChanged={reload}
              />
            </>
          )}
        </div>
      ) : null}
    </Panel>
  )
}

// ─── Actividades ─────────────────────────────────────────────────────────────

function Activities({
  companyId,
  productionId,
  workflowId,
  taskId,
  activities,
  permissions,
  onChanged,
}: {
  companyId: string
  productionId: string
  workflowId: string
  taskId: string
  activities: readonly ActivityRow[]
  permissions: TaskPermissions
  onChanged: () => Promise<void>
}) {
  const t = useTranslations("productions.activities")
  const common = useTranslations("common")
  const [title, setTitle] = useState("")
  const [busy, setBusy] = useState(false)

  const base = `${tasksPath(companyId, productionId, workflowId)}/${taskId}/activities`

  async function add() {
    if (title.trim() === "") return
    setBusy(true)
    try {
      await api(base, { method: "POST", body: { title: title.trim() } })
      setTitle("")
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function toggle(activity: ActivityRow) {
    setBusy(true)
    try {
      await api(`${base}/${activity.id}`, {
        method: "PATCH",
        body: { status: activity.status === "completed" ? "incomplete" : "completed" },
      })
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function remove(activityId: string) {
    setBusy(true)
    try {
      await api(`${base}/${activityId}`, { method: "DELETE" })
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h4 className="legend text-content-muted">{t("title")}</h4>

      {activities.length === 0 ? (
        <p className="mt-2 text-body3 text-content-faint">{t("empty")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {activities.map((activity) => (
            <li key={activity.id} className="flex flex-wrap items-center gap-2">
              {permissions.canChangeActivityStatus ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggle(activity)}
                  className="rounded-md focus-visible:outline-2 focus-visible:outline-focus"
                  aria-label={t(
                    activity.status === "completed" ? "markIncomplete" : "markCompleted",
                    { title: activity.title },
                  )}
                >
                  <ActivityStatusBadge status={activity.status} />
                </button>
              ) : (
                <ActivityStatusBadge status={activity.status} />
              )}

              <span className="min-w-0 flex-1 truncate text-body3 text-content">
                {activity.title}
              </span>

              {activity.attachments.length > 0 ? (
                <span className="flex items-center gap-1 text-body3 text-content-faint">
                  <Paperclip className="size-3" aria-hidden="true" />
                  {activity.attachments.length}
                </span>
              ) : null}

              {permissions.canDeleteActivity ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(activity.id)}
                  aria-label={t("remove", { title: activity.title })}
                  className="rounded-md p-1 text-content-faint transition-colors hover:text-tinta-alto focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {permissions.canAddActivity ? (
        <div className="mt-3 flex gap-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void add()
              }
            }}
            placeholder={t("placeholder")}
            aria-label={t("newLabel")}
            maxLength={250}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || title.trim() === ""}
            onClick={() => void add()}
          >
            {common("add")}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

// ─── Adjuntos ────────────────────────────────────────────────────────────────

export function Attachments({
  companyId,
  base,
  attachments,
  canManage,
  onChanged,
}: {
  companyId: string
  productionId: string
  base: string
  attachments: readonly { id: string; name: string; url: string }[]
  canManage: boolean
  onChanged: () => Promise<void>
}) {
  const t = useTranslations("productions.attachments")
  const common = useTranslations("common")
  const uploads = usePhotoUploads(companyId)
  const [busy, setBusy] = useState(false)

  /**
   * Subir y luego colgar, en dos pasos y en ese orden.
   *
   * El archivo llega antes al almacenamiento y **después** se le dice a la tarea que existe. Al
   * revés dejaría filas apuntando a archivos que nunca terminaron de subir, que es exactamente el
   * hueco roto que la spec de archivos prohíbe enseñar.
   */
  async function attach() {
    setBusy(true)
    try {
      const outcome = await uploads.run()
      for (const uploadId of outcome.uploaded) {
        await api(base, { method: "POST", body: { uploadId } })
      }
      uploads.reset()
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function detach(attachmentId: string) {
    setBusy(true)
    try {
      await api(`${base}/${attachmentId}`, { method: "DELETE" })
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h4 className="legend text-content-muted">{t("title")}</h4>

      {attachments.length === 0 ? (
        <p className="mt-2 text-body3 text-content-faint">{t("empty")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-2">
              <Paperclip className="size-3.5 shrink-0 text-content-faint" aria-hidden="true" />
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-body3 text-content underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
              >
                {attachment.name}
              </a>
              {canManage ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void detach(attachment.id)}
                  aria-label={t("remove", { name: attachment.name })}
                  className="rounded-md p-1 text-content-faint transition-colors hover:text-tinta-alto focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className="mt-3 flex flex-col gap-2">
          <PhotoPicker uploads={uploads} policy={ATTACHMENT_POLICY} disabled={busy} />
          {uploads.files.length > 0 ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void attach()}>
              {busy ? <Spinner /> : null}
              {common("add")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

// ─── Comentarios ─────────────────────────────────────────────────────────────

export function Comments({
  base,
  comments,
  canComment,
  onChanged,
}: {
  base: string
  comments: readonly CommentRow[]
  canComment: boolean
  onChanged: () => Promise<void>
}) {
  const t = useTranslations("productions.comments")
  const common = useTranslations("common")
  const format = useFormatter()
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)

  async function send() {
    if (body.trim() === "") return
    setBusy(true)
    try {
      await api(base, { method: "POST", body: { body: body.trim() } })
      setBody("")
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function remove(commentId: string) {
    setBusy(true)
    try {
      await api(`${base}/${commentId}`, { method: "DELETE" })
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h4 className="legend text-content-muted">{t("title")}</h4>

      {comments.length === 0 ? (
        <p className="mt-2 text-body3 text-content-faint">{t("empty")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-body3 text-content">
                  {comment.authorName ?? t("unknownAuthor")}
                </span>
                <time
                  dateTime={comment.createdAt}
                  className="text-body3 text-content-faint tabular-nums"
                >
                  {format.dateTime(new Date(comment.createdAt), { dateStyle: "medium" })}
                </time>
                {canComment ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(comment.id)}
                    className="ml-auto rounded-md text-body3 text-content-faint transition-colors hover:text-tinta-alto focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    {common("delete")}
                  </button>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap text-body2 text-content-muted">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <div className="mt-3 flex flex-col gap-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={2}
            maxLength={4000}
            placeholder={t("placeholder")}
            aria-label={t("newLabel")}
          />
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            disabled={busy || body.trim() === ""}
            onClick={() => void send()}
          >
            {t("send")}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

/** La conversación del plan. Cuelga del plan, no de ninguna tarea. */
export function WorkflowComments({
  companyId,
  productionId,
  workflowId,
  initial,
  canComment,
}: {
  companyId: string
  productionId: string
  workflowId: string
  initial: readonly CommentRow[]
  canComment: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const base = `/companies/${companyId}/productions/${productionId}/workflows/${workflowId}/comments`

  return (
    <Comments
      base={base}
      comments={initial}
      canComment={canComment}
      onChanged={async () => {
        // El servidor ya tiene la verdad; se le vuelve a pedir la página en lugar de mantener una
        // copia en el cliente que se pueda quedar vieja.
        startTransition(() => router.refresh())
      }}
    />
  )
}
