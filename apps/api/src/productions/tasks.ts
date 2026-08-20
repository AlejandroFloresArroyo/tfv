/**
 * Tareas, actividades, comentarios y adjuntos de un plan de trabajo.
 *
 * Ver `openspec/specs/production-workflows/spec.md`. Rebanada 22, lo que la 20 dejó a la vista y no
 * escribió: el plan ya sabía **contar** sus tareas, y aquí empiezan a existir.
 *
 * ```
 * Plan de trabajo   →  workflows.ts, la rebanada 20
 *    Tarea          →  aquí
 *       Actividad   →  aquí
 * ```
 *
 * ## Una sola tabla de comentarios, y por qué no se parte
 *
 * `production_comments` cuelga **o** de un plan **o** de una tarea, discriminada por cuál de las dos
 * columnas viene llena. No son dos tablas porque no son dos cosas: es el mismo comentario, con el
 * mismo autor y la misma edición, escrito en dos sitios distintos de la misma jerarquía. Lo que sí
 * se comprueba aquí es que **nunca cuelgue de las dos ni de ninguna** — el modelo no lo ata con una
 * restricción de comprobación, al contrario que la utilería (`HALLAZGOS.md` H-222), así que lo ata
 * este módulo teniendo un camino por tipo: no hay una función que reciba las dos referencias y
 * alguien tenga que acordarse de comprobar.
 *
 * ## El creador es quien crea, y no un campo de entrada
 *
 * «El creador de una tarea SHALL ser siempre quien la creó, y no SHALL poder modificarse». Aquí eso
 * significa dos cosas concretas: `createdById` sale del actor y no del cuerpo, y **no aparece en
 * ninguna entrada de edición**. Una tarea firmada por otro no es una tarea, es una atribución falsa.
 *
 * ## Los estados no tienen tabla de transiciones, y no se inventa
 *
 * Igual que el plan y la jornada (`HALLAZGOS.md` H-111 y H-186): la spec enumera los cuatro estados
 * de tarea y los dos de actividad, dice que una tarea incompleta «cuenta como cerrada en los
 * recuentos», y **no declara qué transiciones son legales**. Se admite cualquiera, y queda anotado.
 */

import {
  ACTIVITY_STATUSES,
  buildPage,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
  TASK_STATUSES,
  UnprocessableError,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import {
  productionAttachments,
  productionCategories,
  productionCharacters,
  productionComments,
  productionTaskActivities,
  productionTasks,
  uploads,
  users,
} from "@tfv/db/schema"
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { assertUsableFiles, releaseUploads, sweepObjects } from "../media/collections.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { loadProduction } from "./productions.ts"
import { loadWorkflow } from "./workflows.ts"

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

export { ACTIVITY_STATUSES, TASK_STATUSES }

// ─── Registros ───────────────────────────────────────────────────────────────

/** Un archivo colgado de una tarea o de una actividad, con lo que hace falta para enseñarlo. */
export interface AttachmentRecord {
  readonly id: string
  readonly uploadId: string
  readonly name: string
  readonly url: string
  readonly kind: string
  readonly createdAt: Date
}

export interface ActivityRecord {
  readonly id: string
  readonly taskId: string
  readonly title: string
  readonly description: string
  readonly status: ActivityStatus
  readonly scheduledFor: Date | null
  readonly endsAt: Date | null
  readonly responsibleId: string | null
  readonly responsibleName: string | null
  /** Quién la creó. Inmutable, como el de la tarea. */
  readonly createdById: string | null
  readonly createdByName: string | null
  readonly attachments: readonly AttachmentRecord[]
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CommentRecord {
  readonly id: string
  readonly workflowId: string | null
  readonly taskId: string | null
  readonly body: string
  readonly authorId: string | null
  readonly authorName: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface TaskRecord {
  readonly id: string
  readonly workflowId: string
  readonly categoryId: string | null
  readonly categoryName: string | null
  readonly characterId: string | null
  readonly characterName: string | null
  readonly title: string
  readonly description: string
  readonly status: TaskStatus
  readonly scheduledFor: Date | null
  readonly endsAt: Date | null
  readonly responsibleId: string | null
  readonly responsibleName: string | null
  readonly createdById: string | null
  readonly createdByName: string | null
  /** Siempre presente, y `0` sin actividades. Es un recuento, no un agregado costoso. */
  readonly activityCount: number
  /**
   * Desglose por estado, **sólo cuando se pide**.
   *
   * Lo mismo que en el plan: `computed-fields` exige que listar sin pedir agregados **no recorra**
   * las actividades de cada tarea. La propiedad no es que el campo se omita, es que no se pague.
   */
  readonly activitiesByStatus?: Readonly<Record<ActivityStatus, number>> | undefined
  readonly attachmentCount: number
  readonly commentCount: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** La tarea abierta: con todo lo que cuelga de ella. */
export interface TaskDetail extends TaskRecord {
  readonly activities: readonly ActivityRecord[]
  readonly comments: readonly CommentRecord[]
  readonly attachments: readonly AttachmentRecord[]
}

// ─── Consulta ────────────────────────────────────────────────────────────────

/**
 * Qué se puede pedir de las tareas de un plan.
 *
 * Los filtros son los que la spec nombra —responsable, y las dos clasificaciones que dirigen el
 * trabajo: categoría y personaje—. La búsqueda va sobre título y descripción, literalmente lo que
 * pide «las tareas y actividades por título y descripción».
 */
export const taskQuery: QuerySchema = {
  filters: {
    status: { type: "enum", values: TASK_STATUSES, set: true, label: "Estado" },
    responsibleId: { type: "id", label: "Responsable" },
    categoryId: { type: "id", label: "Categoría" },
    characterId: { type: "id", label: "Personaje" },
    scheduledFor: { type: "date", range: true, label: "Fecha" },
  },
  searchable: ["title", "description"],
  sortable: ["scheduledFor", "title", "createdAt"],
  defaultSort: [
    { field: "scheduledFor", direction: "asc" },
    { field: "createdAt", direction: "asc" },
  ],
}

const taskMapping = {
  fields: {
    status: productionTasks.status,
    responsibleId: productionTasks.responsibleId,
    categoryId: productionTasks.categoryId,
    characterId: productionTasks.characterId,
    scheduledFor: productionTasks.scheduledFor,
    title: productionTasks.title,
    createdAt: productionTasks.createdAt,
  },
  searchable: [productionTasks.title, productionTasks.description],
  tiebreak: productionTasks.id,
}

export interface ReadOptions {
  readonly aggregates?: boolean | undefined
}

// ─── Tareas: lectura ─────────────────────────────────────────────────────────

export async function listTasks(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  query: ParsedQuery,
  options: ReadOptions = {},
): Promise<Page<TaskRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)

    const where = and(
      eq(productionTasks.workflowId, workflowId),
      isNull(productionTasks.deletedAt),
      ...collectionConditions(query, taskMapping),
    )

    const [total] = await tx.select({ value: count() }).from(productionTasks).where(where)

    const rows = await tx
      .select()
      .from(productionTasks)
      .where(where)
      .orderBy(...collectionOrder(query, taskMapping))
      .limit(limit)
      .offset(offset)

    return buildPage(await decorateTasks(tx, rows, options), total?.value ?? 0, page, limit)
  })
}

export async function getTask(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
): Promise<TaskDetail> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    const row = await loadTask(tx, workflowId, taskId)

    const [record] = await decorateTasks(tx, [row], { aggregates: true })
    if (!record) throw new NotFoundError("La tarea no existe")

    const [activities, comments, attachments] = await Promise.all([
      activitiesOf(tx, taskId),
      commentsOfTask(tx, taskId),
      attachmentsOfTasks(tx, [taskId]),
    ])

    return { ...record, activities, comments, attachments: attachments.get(taskId) ?? [] }
  })
}

// ─── Tareas: escritura ───────────────────────────────────────────────────────

export interface CreateTaskInput {
  readonly title: string
  readonly description?: string | undefined
  readonly categoryId?: string | null | undefined
  readonly characterId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
  readonly scheduledFor?: string | null | undefined
  readonly endsAt?: string | null | undefined
}

export async function createTask(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  input: CreateTaskInput,
): Promise<TaskRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)

    const title = input.title.trim()
    if (title === "") throw new UnprocessableError("La tarea necesita un título")

    const categoryId = await resolveCategory(tx, productionId, input.categoryId ?? null)
    const characterId = await resolveCharacter(tx, productionId, input.characterId ?? null)

    const scheduledFor = optionalDate(input.scheduledFor)
    const endsAt = optionalDate(input.endsAt)
    assertOrdered(scheduledFor, endsAt)

    const [created] = await tx
      .insert(productionTasks)
      .values({
        id: newId(),
        workflowId,
        title,
        description: input.description?.trim() ?? "",
        categoryId,
        characterId,
        responsibleId: input.responsibleId ?? null,
        scheduledFor,
        endsAt,
        // Quien la crea, y **sólo** de aquí. No es un campo de entrada.
        createdById: actor.userId,
        // El estado tampoco se recibe: la spec dice que las actividades nacen incompletas y la
        // tarea pendiente. Admitirlo en el alta convierte un invariante en un valor por omisión.
      })
      .returning()

    if (!created) throw new Error("la inserción de la tarea no devolvió fila")
    return (await decorateTasks(tx, [created], {}))[0] as TaskRecord
  })
}

export interface UpdateTaskInput {
  readonly title?: string | undefined
  readonly description?: string | undefined
  readonly categoryId?: string | null | undefined
  readonly characterId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
  readonly scheduledFor?: string | null | undefined
  readonly endsAt?: string | null | undefined
  readonly status?: TaskStatus | undefined
}

export async function updateTask(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    const current = await loadTask(tx, workflowId, taskId)

    const patch: Record<string, unknown> = {}

    if (input.title !== undefined) {
      const title = input.title.trim()
      if (title === "") throw new UnprocessableError("La tarea necesita un título")
      patch.title = title
    }
    if (input.description !== undefined) patch.description = input.description.trim()
    if (input.responsibleId !== undefined) patch.responsibleId = input.responsibleId
    if (input.status !== undefined) patch.status = input.status

    if (input.categoryId !== undefined) {
      patch.categoryId = await resolveCategory(tx, productionId, input.categoryId)
    }
    if (input.characterId !== undefined) {
      patch.characterId = await resolveCharacter(tx, productionId, input.characterId)
    }

    const scheduledFor =
      input.scheduledFor === undefined ? current.scheduledFor : optionalDate(input.scheduledFor)
    const endsAt = input.endsAt === undefined ? current.endsAt : optionalDate(input.endsAt)
    assertOrdered(scheduledFor, endsAt)
    if (input.scheduledFor !== undefined) patch.scheduledFor = scheduledFor
    if (input.endsAt !== undefined) patch.endsAt = endsAt

    if (Object.keys(patch).length === 0) {
      return (await decorateTasks(tx, [current], {}))[0] as TaskRecord
    }

    patch.updatedAt = new Date()

    const [updated] = await tx
      .update(productionTasks)
      .set(patch)
      .where(eq(productionTasks.id, taskId))
      .returning()

    if (!updated) throw new NotFoundError("La tarea no existe")
    return (await decorateTasks(tx, [updated], {}))[0] as TaskRecord
  })
}

/**
 * Lo que se lleva por delante eliminar una tarea.
 *
 * «Eliminar una tarea SHALL eliminar sus actividades y sus comentarios», y «la confirmación SHALL
 * enumerar previamente lo que se perderá». Se cuentan las tres cosas que cuelgan, incluidos los
 * adjuntos: un archivo que desaparece sin avisar es lo que hace que alguien lo vuelva a subir.
 */
export interface TaskScope {
  readonly activities: number
  readonly comments: number
  readonly attachments: number
}

export async function taskScope(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
): Promise<TaskScope> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadTask(tx, workflowId, taskId)

    return scopeOfTask(tx, taskId)
  })
}

/**
 * Da de baja una tarea.
 *
 * Lógica, porque el modelo le da columna. Sus actividades y sus comentarios dejan de existir para
 * quien mira sin recorrer nada: toda lectura de ellos parte de la tarea. La cascada física está en
 * las claves foráneas y actúa el día que la fila se retire de verdad.
 *
 * Los adjuntos **sí** se recorren, y no por gusto: un archivo suelto ocupa espacio en el almacén de
 * objetos y no lo libera nadie. Se retira la referencia y se barre lo que quedó sin dueño.
 */
export async function deleteTask(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
): Promise<void> {
  const released = await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadTask(tx, workflowId, taskId)

    const attachments = await tx
      .select({ uploadId: productionAttachments.uploadId })
      .from(productionAttachments)
      .where(eq(productionAttachments.taskId, taskId))

    await tx.delete(productionAttachments).where(eq(productionAttachments.taskId, taskId))

    await tx
      .update(productionTasks)
      .set({ deletedAt: new Date() })
      .where(eq(productionTasks.id, taskId))

    return releaseUploads(
      tx,
      attachments.map((row) => row.uploadId),
    )
  })

  await sweepObjects(released)
}

// ─── Actividades ─────────────────────────────────────────────────────────────

export interface CreateActivityInput {
  readonly title: string
  readonly description?: string | undefined
  readonly responsibleId?: string | null | undefined
  readonly scheduledFor?: string | null | undefined
  readonly endsAt?: string | null | undefined
}

export async function createActivity(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
  input: CreateActivityInput,
): Promise<ActivityRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadTask(tx, workflowId, taskId)

    const title = input.title.trim()
    if (title === "") throw new UnprocessableError("La actividad necesita un título")

    const scheduledFor = optionalDate(input.scheduledFor)
    const endsAt = optionalDate(input.endsAt)
    assertOrdered(scheduledFor, endsAt)

    const [created] = await tx
      .insert(productionTaskActivities)
      .values({
        id: newId(),
        taskId,
        title,
        description: input.description?.trim() ?? "",
        responsibleId: input.responsibleId ?? null,
        scheduledFor,
        endsAt,
        createdById: actor.userId,
        // Nace incompleta: «se añaden tres actividades a una tarea → las tres quedan registradas
        // con estado incompleto».
      })
      .returning()

    if (!created) throw new Error("la inserción de la actividad no devolvió fila")
    return (await decorateActivities(tx, [created]))[0] as ActivityRecord
  })
}

export interface UpdateActivityInput {
  readonly title?: string | undefined
  readonly description?: string | undefined
  readonly responsibleId?: string | null | undefined
  readonly scheduledFor?: string | null | undefined
  readonly endsAt?: string | null | undefined
  readonly status?: ActivityStatus | undefined
}

export async function updateActivity(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
  activityId: string,
  input: UpdateActivityInput,
): Promise<ActivityRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadTask(tx, workflowId, taskId)
    const current = await loadActivity(tx, taskId, activityId)

    const patch: Record<string, unknown> = {}

    if (input.title !== undefined) {
      const title = input.title.trim()
      if (title === "") throw new UnprocessableError("La actividad necesita un título")
      patch.title = title
    }
    if (input.description !== undefined) patch.description = input.description.trim()
    if (input.responsibleId !== undefined) patch.responsibleId = input.responsibleId
    if (input.status !== undefined) patch.status = input.status

    const scheduledFor =
      input.scheduledFor === undefined ? current.scheduledFor : optionalDate(input.scheduledFor)
    const endsAt = input.endsAt === undefined ? current.endsAt : optionalDate(input.endsAt)
    assertOrdered(scheduledFor, endsAt)
    if (input.scheduledFor !== undefined) patch.scheduledFor = scheduledFor
    if (input.endsAt !== undefined) patch.endsAt = endsAt

    if (Object.keys(patch).length === 0) {
      return (await decorateActivities(tx, [current]))[0] as ActivityRecord
    }

    patch.updatedAt = new Date()

    const [updated] = await tx
      .update(productionTaskActivities)
      .set(patch)
      .where(eq(productionTaskActivities.id, activityId))
      .returning()

    if (!updated) throw new NotFoundError("La actividad no existe")
    return (await decorateActivities(tx, [updated]))[0] as ActivityRecord
  })
}

export async function deleteActivity(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
  activityId: string,
): Promise<void> {
  const released = await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadTask(tx, workflowId, taskId)
    await loadActivity(tx, taskId, activityId)

    const attachments = await tx
      .select({ uploadId: productionAttachments.uploadId })
      .from(productionAttachments)
      .where(eq(productionAttachments.activityId, activityId))

    await tx.delete(productionAttachments).where(eq(productionAttachments.activityId, activityId))

    await tx
      .update(productionTaskActivities)
      .set({ deletedAt: new Date() })
      .where(eq(productionTaskActivities.id, activityId))

    return releaseUploads(
      tx,
      attachments.map((row) => row.uploadId),
    )
  })

  await sweepObjects(released)
}

// ─── Comentarios ─────────────────────────────────────────────────────────────

/**
 * Comenta un plan.
 *
 * El autor es **quien escribe**, no un dato de entrada, igual que en las notas de jornada. La marca
 * de tiempo la pone la base.
 */
export async function addWorkflowComment(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  body: string,
): Promise<CommentRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)

    return insertComment(tx, actor, { workflowId, taskId: null }, body)
  })
}

export async function addTaskComment(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
  body: string,
): Promise<CommentRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadTask(tx, workflowId, taskId)

    return insertComment(tx, actor, { workflowId: null, taskId }, body)
  })
}

export async function listWorkflowComments(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
): Promise<readonly CommentRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)

    return commentsOfWorkflow(tx, workflowId)
  })
}

export async function updateWorkflowComment(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  commentId: string,
  body: string,
): Promise<CommentRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadComment(tx, { workflowId, taskId: null }, commentId)

    return patchComment(tx, commentId, body)
  })
}

export async function updateTaskComment(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
  commentId: string,
  body: string,
): Promise<CommentRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadTask(tx, workflowId, taskId)
    await loadComment(tx, { workflowId: null, taskId }, commentId)

    return patchComment(tx, commentId, body)
  })
}

export async function deleteWorkflowComment(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  commentId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadComment(tx, { workflowId, taskId: null }, commentId)

    await tx
      .update(productionComments)
      .set({ deletedAt: new Date() })
      .where(eq(productionComments.id, commentId))
  })
}

export async function deleteTaskComment(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
  commentId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadTask(tx, workflowId, taskId)
    await loadComment(tx, { workflowId: null, taskId }, commentId)

    await tx
      .update(productionComments)
      .set({ deletedAt: new Date() })
      .where(eq(productionComments.id, commentId))
  })
}

// ─── Adjuntos ────────────────────────────────────────────────────────────────

/**
 * Cuelga un archivo de una tarea.
 *
 * Repetir el mismo archivo devuelve **el que ya estaba** en lugar de fallar: los adjuntos de una
 * tarea son un conjunto, no una cuenta. Es la misma decisión que en la utilería de una continuidad.
 */
export async function attachToTask(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
  uploadId: string,
): Promise<AttachmentRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadTask(tx, workflowId, taskId)
    await assertUsableFiles(tx, companyId, [uploadId])

    const [existing] = await tx
      .select()
      .from(productionAttachments)
      .where(
        and(eq(productionAttachments.taskId, taskId), eq(productionAttachments.uploadId, uploadId)),
      )
      .limit(1)

    const row =
      existing ??
      (
        await tx.insert(productionAttachments).values({ id: newId(), taskId, uploadId }).returning()
      )[0]

    if (!row) throw new Error("la inserción del adjunto no devolvió fila")
    return (await decorateAttachments(tx, [row]))[0] as AttachmentRecord
  })
}

export async function attachToActivity(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
  activityId: string,
  uploadId: string,
): Promise<AttachmentRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadTask(tx, workflowId, taskId)
    await loadActivity(tx, taskId, activityId)
    await assertUsableFiles(tx, companyId, [uploadId])

    const [existing] = await tx
      .select()
      .from(productionAttachments)
      .where(
        and(
          eq(productionAttachments.activityId, activityId),
          eq(productionAttachments.uploadId, uploadId),
        ),
      )
      .limit(1)

    const row =
      existing ??
      (
        await tx
          .insert(productionAttachments)
          .values({ id: newId(), activityId, uploadId })
          .returning()
      )[0]

    if (!row) throw new Error("la inserción del adjunto no devolvió fila")
    return (await decorateAttachments(tx, [row]))[0] as AttachmentRecord
  })
}

/**
 * Retira un adjunto.
 *
 * La fila se borra de verdad —no tiene columna de baja lógica— y **después** se barre el archivo si
 * quedó sin referencias. El barrido va fuera de la transacción porque habla con el almacén de
 * objetos, que no participa de ella: dentro, un fallo del almacén desharía una baja que la base ya
 * dio por buena.
 */
export async function detachFromTask(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
  attachmentId: string,
): Promise<void> {
  const released = await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadTask(tx, workflowId, taskId)

    const [row] = await tx
      .select()
      .from(productionAttachments)
      .where(
        and(eq(productionAttachments.id, attachmentId), eq(productionAttachments.taskId, taskId)),
      )
      .limit(1)

    if (!row) throw new NotFoundError("El adjunto no existe")

    await tx.delete(productionAttachments).where(eq(productionAttachments.id, attachmentId))
    return releaseUploads(tx, [row.uploadId])
  })

  await sweepObjects(released)
}

export async function detachFromActivity(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  taskId: string,
  activityId: string,
  attachmentId: string,
): Promise<void> {
  const released = await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)
    await loadTask(tx, workflowId, taskId)
    await loadActivity(tx, taskId, activityId)

    const [row] = await tx
      .select()
      .from(productionAttachments)
      .where(
        and(
          eq(productionAttachments.id, attachmentId),
          eq(productionAttachments.activityId, activityId),
        ),
      )
      .limit(1)

    if (!row) throw new NotFoundError("El adjunto no existe")

    await tx.delete(productionAttachments).where(eq(productionAttachments.id, attachmentId))
    return releaseUploads(tx, [row.uploadId])
  })

  await sweepObjects(released)
}

// ─── Lecturas compartidas ────────────────────────────────────────────────────

/**
 * Actividades por tarea y por estado, en **una sola consulta** para todo el lote.
 *
 * Agrupada por las dos columnas: el total sale de sumar el desglose, así que pedirlo aparte sería
 * una segunda consulta que puede discrepar de la primera.
 */
async function activityCounts(
  tx: Transaction,
  taskIds: readonly string[],
): Promise<Map<string, { total: number; byStatus: Record<ActivityStatus, number> }>> {
  const counts = new Map<string, { total: number; byStatus: Record<ActivityStatus, number> }>()
  if (taskIds.length === 0) return counts

  const rows = await tx
    .select({
      taskId: productionTaskActivities.taskId,
      status: productionTaskActivities.status,
      value: count(),
    })
    .from(productionTaskActivities)
    .where(
      and(
        inArray(productionTaskActivities.taskId, taskIds),
        isNull(productionTaskActivities.deletedAt),
      ),
    )
    .groupBy(productionTaskActivities.taskId, productionTaskActivities.status)

  for (const row of rows) {
    const current = counts.get(row.taskId) ?? { total: 0, byStatus: emptyActivityBreakdown() }
    counts.set(row.taskId, {
      total: current.total + row.value,
      byStatus: { ...current.byStatus, [row.status]: row.value },
    })
  }

  return counts
}

function emptyActivityBreakdown(): Record<ActivityStatus, number> {
  return { incomplete: 0, completed: 0 }
}

async function decorateTasks(
  tx: Transaction,
  rows: readonly (typeof productionTasks.$inferSelect)[],
  options: ReadOptions,
): Promise<TaskRecord[]> {
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)

  const [counts, names, categories, characters, attachmentTally, commentTally] = await Promise.all([
    activityCounts(tx, ids),
    userNames(
      tx,
      rows.flatMap((row) => [row.responsibleId, row.createdById]),
    ),
    labelsOf(
      tx,
      productionCategories,
      rows.map((row) => row.categoryId),
    ),
    labelsOf(
      tx,
      productionCharacters,
      rows.map((row) => row.characterId),
    ),
    tallyBy(tx, productionAttachments, productionAttachments.taskId, ids, false),
    tallyBy(tx, productionComments, productionComments.taskId, ids, true),
  ])

  return rows.map((row) => {
    const tally = counts.get(row.id)

    return {
      id: row.id,
      workflowId: row.workflowId,
      categoryId: row.categoryId,
      categoryName: row.categoryId === null ? null : (categories.get(row.categoryId) ?? null),
      characterId: row.characterId,
      characterName: row.characterId === null ? null : (characters.get(row.characterId) ?? null),
      title: row.title,
      description: row.description,
      status: row.status,
      scheduledFor: row.scheduledFor,
      endsAt: row.endsAt,
      responsibleId: row.responsibleId,
      responsibleName: row.responsibleId === null ? null : (names.get(row.responsibleId) ?? null),
      createdById: row.createdById,
      createdByName: row.createdById === null ? null : (names.get(row.createdById) ?? null),
      activityCount: tally?.total ?? 0,
      ...(options.aggregates === true
        ? { activitiesByStatus: tally?.byStatus ?? emptyActivityBreakdown() }
        : {}),
      attachmentCount: attachmentTally.get(row.id) ?? 0,
      commentCount: commentTally.get(row.id) ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  })
}

async function decorateActivities(
  tx: Transaction,
  rows: readonly (typeof productionTaskActivities.$inferSelect)[],
): Promise<ActivityRecord[]> {
  if (rows.length === 0) return []

  const [names, attachments] = await Promise.all([
    userNames(
      tx,
      rows.flatMap((row) => [row.responsibleId, row.createdById]),
    ),
    attachmentsOfActivities(
      tx,
      rows.map((row) => row.id),
    ),
  ])

  return rows.map((row) => ({
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    description: row.description,
    status: row.status,
    scheduledFor: row.scheduledFor,
    endsAt: row.endsAt,
    responsibleId: row.responsibleId,
    responsibleName: row.responsibleId === null ? null : (names.get(row.responsibleId) ?? null),
    createdById: row.createdById,
    createdByName: row.createdById === null ? null : (names.get(row.createdById) ?? null),
    attachments: attachments.get(row.id) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

async function decorateComments(
  tx: Transaction,
  rows: readonly (typeof productionComments.$inferSelect)[],
): Promise<CommentRecord[]> {
  if (rows.length === 0) return []

  const names = await userNames(
    tx,
    rows.map((row) => row.authorId),
  )

  return rows.map((row) => ({
    id: row.id,
    workflowId: row.workflowId,
    taskId: row.taskId,
    body: row.body,
    authorId: row.authorId,
    authorName: row.authorId === null ? null : (names.get(row.authorId) ?? null),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

async function decorateAttachments(
  tx: Transaction,
  rows: readonly (typeof productionAttachments.$inferSelect)[],
): Promise<AttachmentRecord[]> {
  if (rows.length === 0) return []

  const files = await tx
    .select({ id: uploads.id, url: uploads.url, fileName: uploads.fileName, kind: uploads.kind })
    .from(uploads)
    .where(
      inArray(
        uploads.id,
        rows.map((row) => row.uploadId),
      ),
    )

  const byId = new Map(files.map((file) => [file.id, file]))

  return rows.map((row) => {
    const file = byId.get(row.uploadId)
    return {
      id: row.id,
      uploadId: row.uploadId,
      name: file?.fileName ?? "",
      url: file?.url ?? "",
      kind: file?.kind ?? "file",
      createdAt: row.createdAt,
    }
  })
}

export async function activitiesOf(
  tx: Transaction,
  taskId: string,
): Promise<readonly ActivityRecord[]> {
  const rows = await tx
    .select()
    .from(productionTaskActivities)
    .where(
      and(eq(productionTaskActivities.taskId, taskId), isNull(productionTaskActivities.deletedAt)),
    )
    .orderBy(asc(productionTaskActivities.createdAt), asc(productionTaskActivities.id))

  return decorateActivities(tx, rows)
}

async function commentsOfTask(tx: Transaction, taskId: string): Promise<readonly CommentRecord[]> {
  const rows = await tx
    .select()
    .from(productionComments)
    .where(and(eq(productionComments.taskId, taskId), isNull(productionComments.deletedAt)))
    .orderBy(asc(productionComments.createdAt), asc(productionComments.id))

  return decorateComments(tx, rows)
}

async function commentsOfWorkflow(
  tx: Transaction,
  workflowId: string,
): Promise<readonly CommentRecord[]> {
  const rows = await tx
    .select()
    .from(productionComments)
    .where(and(eq(productionComments.workflowId, workflowId), isNull(productionComments.deletedAt)))
    .orderBy(asc(productionComments.createdAt), asc(productionComments.id))

  return decorateComments(tx, rows)
}

async function attachmentsOfTasks(
  tx: Transaction,
  taskIds: readonly string[],
): Promise<Map<string, AttachmentRecord[]>> {
  const grouped = new Map<string, AttachmentRecord[]>()
  if (taskIds.length === 0) return grouped

  const rows = await tx
    .select()
    .from(productionAttachments)
    .where(inArray(productionAttachments.taskId, taskIds))
    .orderBy(asc(productionAttachments.createdAt))

  for (const record of await decorateAttachments(tx, rows)) {
    const owner = rows.find((row) => row.id === record.id)?.taskId
    if (!owner) continue
    const bucket = grouped.get(owner)
    if (bucket) bucket.push(record)
    else grouped.set(owner, [record])
  }

  return grouped
}

async function attachmentsOfActivities(
  tx: Transaction,
  activityIds: readonly string[],
): Promise<Map<string, AttachmentRecord[]>> {
  const grouped = new Map<string, AttachmentRecord[]>()
  if (activityIds.length === 0) return grouped

  const rows = await tx
    .select()
    .from(productionAttachments)
    .where(inArray(productionAttachments.activityId, activityIds))
    .orderBy(asc(productionAttachments.createdAt))

  for (const record of await decorateAttachments(tx, rows)) {
    const owner = rows.find((row) => row.id === record.id)?.activityId
    if (!owner) continue
    const bucket = grouped.get(owner)
    if (bucket) bucket.push(record)
    else grouped.set(owner, [record])
  }

  return grouped
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/** Los nombres de un puñado de personas, en una consulta. */
async function userNames(
  tx: Transaction,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))]
  if (wanted.length === 0) return new Map()

  const rows = await tx
    .select({ id: users.id, name: users.name, lastname: users.lastname })
    .from(users)
    .where(inArray(users.id, wanted))

  return new Map(rows.map((row) => [row.id, [row.name, row.lastname].join(" ").trim()]))
}

/** El nombre de un puñado de categorías o personajes, en una consulta. */
async function labelsOf(
  tx: Transaction,
  table: typeof productionCategories | typeof productionCharacters,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))]
  if (wanted.length === 0) return new Map()

  const rows = await tx
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(inArray(table.id, wanted))

  return new Map(rows.map((row) => [row.id, row.name]))
}

/**
 * Cuántas filas cuelgan de cada dueño, en una consulta.
 *
 * `soft` decide si se descuentan las bajas lógicas. **No es un detalle**: en la tanda anterior una
 * mutación deliberada no la cazó ninguna prueba porque los ayudantes de recuento contaban filas ya
 * borradas, y un comentario eliminado seguía sumando en la ficha.
 */
async function tallyBy(
  tx: Transaction,
  table: typeof productionAttachments | typeof productionComments,
  column: typeof productionAttachments.taskId | typeof productionComments.taskId,
  ids: readonly string[],
  soft: boolean,
): Promise<Map<string, number>> {
  const tally = new Map<string, number>()
  if (ids.length === 0) return tally

  const where =
    soft && "deletedAt" in table
      ? and(inArray(column, ids), isNull(productionComments.deletedAt))
      : inArray(column, ids)

  const rows = await tx
    .select({ owner: column, value: count() })
    .from(table)
    .where(where)
    .groupBy(column)

  for (const row of rows) {
    if (row.owner !== null) tally.set(row.owner, row.value)
  }

  return tally
}

async function scopeOfTask(tx: Transaction, taskId: string): Promise<TaskScope> {
  const [activities, comments, attachments] = await Promise.all([
    tx
      .select({ value: count() })
      .from(productionTaskActivities)
      .where(
        and(
          eq(productionTaskActivities.taskId, taskId),
          isNull(productionTaskActivities.deletedAt),
        ),
      ),
    tx
      .select({ value: count() })
      .from(productionComments)
      .where(and(eq(productionComments.taskId, taskId), isNull(productionComments.deletedAt))),
    tx
      .select({ value: count() })
      .from(productionAttachments)
      .where(eq(productionAttachments.taskId, taskId)),
  ])

  return {
    activities: activities[0]?.value ?? 0,
    comments: comments[0]?.value ?? 0,
    attachments: attachments[0]?.value ?? 0,
  }
}

/** A qué cuelga un comentario. Exactamente una de las dos, nunca las dos ni ninguna. */
type CommentOwner =
  | { readonly workflowId: string; readonly taskId: null }
  | { readonly workflowId: null; readonly taskId: string }

async function insertComment(
  tx: Transaction,
  actor: Actor,
  owner: CommentOwner,
  body: string,
): Promise<CommentRecord> {
  const text = body.trim()
  if (text === "") throw new UnprocessableError("El comentario no puede estar vacío")

  const [created] = await tx
    .insert(productionComments)
    .values({
      id: newId(),
      workflowId: owner.workflowId,
      taskId: owner.taskId,
      body: text,
      authorId: actor.userId,
    })
    .returning()

  if (!created) throw new Error("la inserción del comentario no devolvió fila")
  return (await decorateComments(tx, [created]))[0] as CommentRecord
}

async function patchComment(
  tx: Transaction,
  commentId: string,
  body: string,
): Promise<CommentRecord> {
  const text = body.trim()
  if (text === "") throw new UnprocessableError("El comentario no puede estar vacío")

  const [updated] = await tx
    .update(productionComments)
    .set({ body: text, updatedAt: new Date() })
    .where(eq(productionComments.id, commentId))
    .returning()

  if (!updated) throw new NotFoundError("El comentario no existe")
  return (await decorateComments(tx, [updated]))[0] as CommentRecord
}

/**
 * Que la categoría sea **de esta producción**.
 *
 * Resolver por identificador a secas dejaría clasificar una tarea con la taxonomía de otra empresa,
 * que es la misma familia de fallo que la jornada rodando la escena ajena (`HALLAZGOS.md` H-188).
 */
async function resolveCategory(
  tx: Transaction,
  productionId: string,
  categoryId: string | null,
): Promise<string | null> {
  if (categoryId === null) return null

  const [row] = await tx
    .select({ id: productionCategories.id })
    .from(productionCategories)
    .where(
      and(
        eq(productionCategories.id, categoryId),
        eq(productionCategories.productionId, productionId),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La categoría no existe")
  return row.id
}

async function resolveCharacter(
  tx: Transaction,
  productionId: string,
  characterId: string | null,
): Promise<string | null> {
  if (characterId === null) return null

  const [row] = await tx
    .select({ id: productionCharacters.id })
    .from(productionCharacters)
    .where(
      and(
        eq(productionCharacters.id, characterId),
        eq(productionCharacters.productionId, productionId),
        isNull(productionCharacters.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El personaje no existe")
  return row.id
}

function optionalDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null || value === "") return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new UnprocessableError("La fecha no es válida")
  return parsed
}

/** Nada termina antes de empezar. Sin una de las dos fechas no hay nada que ordenar. */
function assertOrdered(scheduledFor: Date | null, endsAt: Date | null): void {
  if (scheduledFor === null || endsAt === null) return
  if (endsAt.getTime() < scheduledFor.getTime()) {
    throw new UnprocessableError("No puede terminar antes de empezar")
  }
}

export async function loadTask(tx: Transaction, workflowId: string, taskId: string) {
  const [row] = await tx
    .select()
    .from(productionTasks)
    .where(
      and(
        eq(productionTasks.id, taskId),
        eq(productionTasks.workflowId, workflowId),
        isNull(productionTasks.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La tarea no existe")
  return row
}

async function loadActivity(tx: Transaction, taskId: string, activityId: string) {
  const [row] = await tx
    .select()
    .from(productionTaskActivities)
    .where(
      and(
        eq(productionTaskActivities.id, activityId),
        eq(productionTaskActivities.taskId, taskId),
        isNull(productionTaskActivities.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La actividad no existe")
  return row
}

/**
 * El comentario, comprobando **de qué cuelga**.
 *
 * No basta con el identificador: sin comprobar el dueño, el comentario de un plan se podría editar
 * por el camino de una tarea de otro plan de la misma producción.
 */
async function loadComment(tx: Transaction, owner: CommentOwner, commentId: string) {
  const belongs =
    owner.workflowId === null
      ? eq(productionComments.taskId, owner.taskId)
      : eq(productionComments.workflowId, owner.workflowId)

  const [row] = await tx
    .select()
    .from(productionComments)
    .where(and(eq(productionComments.id, commentId), belongs, isNull(productionComments.deletedAt)))
    .limit(1)

  if (!row) throw new NotFoundError("El comentario no existe")
  return row
}

/** Lo que el plan necesita saber de sus tareas para enumerar su baja. Lo usa `workflows.ts`. */
export async function taskIdsOf(tx: Transaction, workflowId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: productionTasks.id })
    .from(productionTasks)
    .where(and(eq(productionTasks.workflowId, workflowId), isNull(productionTasks.deletedAt)))

  return rows.map((row) => row.id)
}
