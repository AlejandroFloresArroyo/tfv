/**
 * Rutas del tiempo de una producción: tareas, actividades, comentarios, adjuntos y calendario.
 *
 * Rebanada 22. Están aparte de `productions.ts` porque son otra conversación: allí se da de alta la
 * producción y su taxonomía, y aquí se organiza el trabajo de un rodaje. El archivo de rutas es un
 * inventario que se lee de arriba abajo, y treinta rutas más en el de al lado lo dejan de ser.
 *
 * ## Las claves finas se comprueban encima de la gruesa
 *
 * El catálogo cerrado da al recurso `workflows` veintidós claves, y varias son **modificadores** de
 * una acción que ya tiene la suya: cambiar el estado de una tarea, elegirle responsable, elegirle
 * categoría. La ruta declara la gruesa —`task_edit`— y el manejador exige la fina **sólo cuando el
 * cuerpo trae ese campo**. Es el mismo reparto que ya usaba el plan con `workflows.status`.
 *
 * Lo que eso compra: quien puede corregir el título de una tarea no puede darla por completada, y
 * quien no puede reasignar no reasigna aunque mande el campo. Ocultar el control en la pantalla no
 * es proteger; esto sí.
 *
 * ## El calendario no tiene clave propia, y no se inventa ninguna
 *
 * Es una **vista** de tres recursos que ya tienen la suya. Exige `productions.workflows.view`, que
 * es la del recurso que da nombre a la pantalla; las jornadas que se mezclan en el flujo se leen ya
 * acotadas a la producción y no enseñan nada que `productions.recordings.view` no enseñe. Queda
 * anotado (`HALLAZGOS.md` H-223): un permiso que separase «ver el calendario» de «ver los planes»
 * sería decisión de producto, no de implementación.
 */

import { z } from "@hono/zod-openapi"
import {
  ACTIVITY_STATUSES,
  CALENDAR_VIEWS,
  ForbiddenError,
  LANDING_REASONS,
  type PermissionKey,
  TASK_STATUSES,
  toInstant,
  toNullableInstant,
} from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import {
  CALENDAR_KINDS,
  type CalendarEvent,
  type CalendarKind,
  type PlanWithTasks,
  plansWithTasks,
  productionCalendar,
} from "../productions/calendar.ts"
import {
  type ActivityRecord,
  type AttachmentRecord,
  addTaskComment,
  addWorkflowComment,
  attachToActivity,
  attachToTask,
  type CommentRecord,
  createActivity,
  createTask,
  deleteActivity,
  deleteTask,
  deleteTaskComment,
  deleteWorkflowComment,
  detachFromActivity,
  detachFromTask,
  getTask,
  listTasks,
  listWorkflowComments,
  type TaskDetail,
  type TaskRecord,
  taskQuery,
  taskScope,
  updateActivity,
  updateTask,
  updateTaskComment,
  updateWorkflowComment,
} from "../productions/tasks.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const instant = z.string().datetime()

const workflowParams = z.object({
  companyId: z.string(),
  productionId: z.string(),
  workflowId: z.string(),
})

const taskParams = workflowParams.extend({ taskId: z.string() })
const activityParams = taskParams.extend({ activityId: z.string() })
const commentParams = workflowParams.extend({ commentId: z.string() })
const taskCommentParams = taskParams.extend({ commentId: z.string() })
const attachmentParams = taskParams.extend({ attachmentId: z.string() })
const activityAttachmentParams = activityParams.extend({ attachmentId: z.string() })

const attachmentSchema = z.object({
  id: z.string(),
  uploadId: z.string(),
  name: z.string(),
  url: z.string(),
  kind: z.string(),
  createdAt: z.string(),
})

const commentSchema = z.object({
  id: z.string(),
  workflowId: z.string().nullable(),
  taskId: z.string().nullable(),
  body: z.string(),
  authorId: z.string().nullable(),
  authorName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const activitySchema = z.object({
  id: z.string(),
  taskId: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(ACTIVITY_STATUSES),
  scheduledFor: z.string().nullable(),
  endsAt: z.string().nullable(),
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  createdById: z.string().nullable(),
  createdByName: z.string().nullable(),
  attachments: z.array(attachmentSchema).readonly(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const activityBreakdownSchema = z.object(
  Object.fromEntries(ACTIVITY_STATUSES.map((status) => [status, z.number().int()])) as Record<
    (typeof ACTIVITY_STATUSES)[number],
    z.ZodNumber
  >,
)

const taskSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  characterId: z.string().nullable(),
  characterName: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  status: z.enum(TASK_STATUSES),
  scheduledFor: z.string().nullable(),
  endsAt: z.string().nullable(),
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  createdById: z.string().nullable(),
  createdByName: z.string().nullable(),
  activityCount: z.number().int(),
  activitiesByStatus: activityBreakdownSchema.optional(),
  attachmentCount: z.number().int(),
  commentCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const taskDetailSchema = taskSchema.extend({
  activities: z.array(activitySchema).readonly(),
  comments: z.array(commentSchema).readonly(),
  attachments: z.array(attachmentSchema).readonly(),
})

const calendarEventSchema = z.object({
  kind: z.enum(CALENDAR_KINDS),
  id: z.string(),
  day: z.string(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  title: z.string(),
  status: z.string(),
  workflowId: z.string().nullable(),
  sceneId: z.string().nullable(),
  sceneLabel: z.string().nullable(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  characterId: z.string().nullable(),
  characterName: z.string().nullable(),
  responsibleName: z.string().nullable(),
})

const calendarSchema = z.object({
  view: z.enum(CALENDAR_VIEWS),
  /**
   * Dónde se sitúa el calendario y **por qué**.
   *
   * El motivo es lo que la pantalla convierte en una frase cuando no hay nada que enseñar, en lugar
   * de pintar una rejilla en blanco que se lee como un fallo de carga.
   */
  landing: z.object({ date: z.string(), reason: z.enum(LANDING_REASONS) }),
  range: z.object({ from: z.string(), to: z.string() }),
  events: z.array(calendarEventSchema).readonly(),
})

const planWithTasksSchema = z.object({
  id: z.string(),
  code: z.string(),
  observations: z.string(),
  status: z.string(),
  scheduledFor: z.string().nullable(),
  sceneId: z.string().nullable(),
  tasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        categoryId: z.string().nullable(),
        characterId: z.string().nullable(),
        scheduledFor: z.string().nullable(),
      }),
    )
    .readonly(),
})

// ─── Serialización ───────────────────────────────────────────────────────────

function serializeAttachment(attachment: AttachmentRecord) {
  return { ...attachment, createdAt: toInstant(attachment.createdAt) }
}

function serializeComment(comment: CommentRecord) {
  return {
    ...comment,
    createdAt: toInstant(comment.createdAt),
    updatedAt: toInstant(comment.updatedAt),
  }
}

function serializeActivity(activity: ActivityRecord) {
  return {
    ...activity,
    scheduledFor: toNullableInstant(activity.scheduledFor),
    endsAt: toNullableInstant(activity.endsAt),
    attachments: activity.attachments.map(serializeAttachment),
    createdAt: toInstant(activity.createdAt),
    updatedAt: toInstant(activity.updatedAt),
  }
}

function serializeTask(task: TaskRecord) {
  return {
    ...task,
    scheduledFor: toNullableInstant(task.scheduledFor),
    endsAt: toNullableInstant(task.endsAt),
    createdAt: toInstant(task.createdAt),
    updatedAt: toInstant(task.updatedAt),
  }
}

function serializeTaskDetail(task: TaskDetail) {
  return {
    ...serializeTask(task),
    activities: task.activities.map(serializeActivity),
    comments: task.comments.map(serializeComment),
    attachments: task.attachments.map(serializeAttachment),
  }
}

function serializeEvent(event: CalendarEvent) {
  return {
    ...event,
    startsAt: toNullableInstant(event.startsAt),
    endsAt: toNullableInstant(event.endsAt),
  }
}

function serializePlan(plan: PlanWithTasks) {
  return {
    ...plan,
    scheduledFor: toNullableInstant(plan.scheduledFor),
    tasks: plan.tasks.map((task) => ({
      ...task,
      scheduledFor: toNullableInstant(task.scheduledFor),
    })),
  }
}

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

/**
 * Exige una clave **fina** encima de la que la ruta ya declaró.
 *
 * Se comprueba sólo si el cuerpo trae el campo que la exige: mandar el formulario entero no puede
 * costar más permisos de los que hacen falta para lo que de verdad se cambió.
 */
function require(
  c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0],
  permission: PermissionKey,
): void {
  const authorization = c.get("authorization")
  if (authorization.isPlatformAdmin || authorization.isOwner) return
  if (authorization.granted.has(permission)) return

  throw new ForbiddenError(`Falta el permiso «${permission}»`)
}

// ─── Tareas ──────────────────────────────────────────────────────────────────

export const listTasksRoute = defineRoute({
  access: REQUIRES("productions.workflows.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks",
    summary: "Listar las tareas de un plan",
    tags: ["Producciones"],
    request: {
      params: workflowParams,
      query: collectionQuery(taskQuery).extend({
        aggregates: z
          .enum(["true", "false"])
          .optional()
          .describe("Trae el desglose de actividades por estado. Cuesta una consulta más."),
      }),
    },
    responses: {
      200: {
        description: "Las tareas del plan",
        content: { "application/json": { schema: pageSchema(taskSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listTasks(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      queryOf(c, taskQuery, ["aggregates"]),
      { aggregates: c.req.query("aggregates") === "true" },
    )
    return c.json(serializePage(page, serializeTask), 200)
  },
})

export const createTaskRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks",
    summary: "Añadir una tarea a un plan; su creador queda fijado",
    tags: ["Producciones"],
    request: {
      params: workflowParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              title: z.string().min(1).max(250),
              description: z.string().max(4000).optional(),
              categoryId: z.string().nullable().optional(),
              characterId: z.string().nullable().optional(),
              responsibleId: z.string().nullable().optional(),
              scheduledFor: instant.nullable().optional(),
              endsAt: instant.nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Creada, pendiente y con su creador",
        content: { "application/json": { schema: taskSchema } },
      },
      403: { description: "Elegir responsable o categoría exige su propia clave" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const body = c.req.valid("json")

    if (body.responsibleId != null) require(c, "productions.workflows.task_select_responsible")
    if (body.categoryId != null) require(c, "productions.workflows.task_select_category")

    const task = await createTask(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      body,
    )
    return c.json(serializeTask(task), 201)
  },
})

export const getTaskRoute = defineRoute({
  access: REQUIRES("productions.workflows.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}",
    summary: "Consultar una tarea con sus actividades, comentarios y adjuntos",
    tags: ["Producciones"],
    request: { params: taskParams },
    responses: {
      200: {
        description: "La tarea abierta",
        content: { "application/json": { schema: taskDetailSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const task = await getTask(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
    )
    return c.json(serializeTaskDetail(task), 200)
  },
})

export const updateTaskRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}",
    summary: "Editar una tarea; el estado, el responsable y la categoría llevan su propia clave",
    tags: ["Producciones"],
    request: {
      params: taskParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              title: z.string().min(1).max(250).optional(),
              description: z.string().max(4000).optional(),
              categoryId: z.string().nullable().optional(),
              characterId: z.string().nullable().optional(),
              responsibleId: z.string().nullable().optional(),
              scheduledFor: instant.nullable().optional(),
              endsAt: instant.nullable().optional(),
              status: z.enum(TASK_STATUSES).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Actualizada",
        content: { "application/json": { schema: taskSchema } },
      },
      403: { description: "Estado, responsable o categoría exigen su propia clave" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const body = c.req.valid("json")

    if (body.status !== undefined) require(c, "productions.workflows.task_status")
    if (body.responsibleId !== undefined) {
      require(c, "productions.workflows.task_select_responsible")
    }
    if (body.categoryId !== undefined) require(c, "productions.workflows.task_select_category")

    const task = await updateTask(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
      body,
    )
    return c.json(serializeTask(task), 200)
  },
})

export const taskScopeRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_delete"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/scope",
    summary: "Enumerar lo que se pierde al eliminar una tarea",
    tags: ["Producciones"],
    request: { params: taskParams },
    responses: {
      200: {
        description: "Lo que cuelga de la tarea",
        content: {
          "application/json": {
            schema: z.object({
              activities: z.number().int(),
              comments: z.number().int(),
              attachments: z.number().int(),
            }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scope = await taskScope(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
    )
    return c.json(scope, 200)
  },
})

export const deleteTaskRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}",
    summary: "Eliminar una tarea con sus actividades y comentarios",
    tags: ["Producciones"],
    request: { params: taskParams },
    responses: { 204: { description: "Eliminada" } },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteTask(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
    )
    return c.body(null, 204)
  },
})

// ─── Actividades ─────────────────────────────────────────────────────────────

export const createActivityRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_activity_create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/activities",
    summary: "Desglosar una tarea en actividades; nacen incompletas",
    tags: ["Producciones"],
    request: {
      params: taskParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              title: z.string().min(1).max(250),
              description: z.string().max(4000).optional(),
              responsibleId: z.string().nullable().optional(),
              scheduledFor: instant.nullable().optional(),
              endsAt: instant.nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Creada, incompleta",
        content: { "application/json": { schema: activitySchema } },
      },
      403: { description: "Elegir responsable exige «task_activity_responsible»" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const body = c.req.valid("json")

    if (body.responsibleId != null) require(c, "productions.workflows.task_activity_responsible")

    const activity = await createActivity(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
      body,
    )
    return c.json(serializeActivity(activity), 201)
  },
})

export const updateActivityRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_activity_edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/activities/{activityId}",
    summary: "Editar una actividad; el estado y el responsable llevan su propia clave",
    tags: ["Producciones"],
    request: {
      params: activityParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              title: z.string().min(1).max(250).optional(),
              description: z.string().max(4000).optional(),
              responsibleId: z.string().nullable().optional(),
              scheduledFor: instant.nullable().optional(),
              endsAt: instant.nullable().optional(),
              status: z.enum(ACTIVITY_STATUSES).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Actualizada",
        content: { "application/json": { schema: activitySchema } },
      },
      403: { description: "El estado y el responsable exigen su propia clave" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const body = c.req.valid("json")

    if (body.status !== undefined) require(c, "productions.workflows.task_activity_status")
    if (body.responsibleId !== undefined) {
      require(c, "productions.workflows.task_activity_responsible")
    }

    const activity = await updateActivity(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
      params.activityId,
      body,
    )
    return c.json(serializeActivity(activity), 200)
  },
})

export const deleteActivityRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_activity_delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/activities/{activityId}",
    summary: "Eliminar una actividad",
    tags: ["Producciones"],
    request: { params: activityParams },
    responses: { 204: { description: "Eliminada" } },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteActivity(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
      params.activityId,
    )
    return c.body(null, 204)
  },
})

// ─── Comentarios ─────────────────────────────────────────────────────────────

const commentBody = {
  content: { "application/json": { schema: z.object({ body: z.string().min(1).max(4000) }) } },
}

export const listWorkflowCommentsRoute = defineRoute({
  access: REQUIRES("productions.workflows.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/comments",
    summary: "Leer los comentarios de un plan",
    tags: ["Producciones"],
    request: { params: workflowParams },
    responses: {
      200: {
        description: "Los comentarios, del más antiguo al más reciente",
        content: {
          "application/json": { schema: z.object({ items: z.array(commentSchema).readonly() }) },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const comments = await listWorkflowComments(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
    )
    return c.json({ items: comments.map(serializeComment) }, 200)
  },
})

export const createWorkflowCommentRoute = defineRoute({
  access: REQUIRES("productions.workflows.comments"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/comments",
    summary: "Comentar un plan; el autor es quien escribe",
    tags: ["Producciones"],
    request: { params: workflowParams, body: commentBody },
    responses: {
      201: {
        description: "Registrado con su autor y su instante",
        content: { "application/json": { schema: commentSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const comment = await addWorkflowComment(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      c.req.valid("json").body,
    )
    return c.json(serializeComment(comment), 201)
  },
})

export const updateWorkflowCommentRoute = defineRoute({
  access: REQUIRES("productions.workflows.comments"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/comments/{commentId}",
    summary: "Editar un comentario de un plan",
    tags: ["Producciones"],
    request: { params: commentParams, body: commentBody },
    responses: {
      200: {
        description: "Actualizado",
        content: { "application/json": { schema: commentSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const comment = await updateWorkflowComment(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.commentId,
      c.req.valid("json").body,
    )
    return c.json(serializeComment(comment), 200)
  },
})

export const deleteWorkflowCommentRoute = defineRoute({
  access: REQUIRES("productions.workflows.comments"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/comments/{commentId}",
    summary: "Eliminar un comentario de un plan",
    tags: ["Producciones"],
    request: { params: commentParams },
    responses: { 204: { description: "Eliminado" } },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteWorkflowComment(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.commentId,
    )
    return c.body(null, 204)
  },
})

export const createTaskCommentRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_comments"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/comments",
    summary: "Comentar una tarea; el autor es quien escribe",
    tags: ["Producciones"],
    request: { params: taskParams, body: commentBody },
    responses: {
      201: {
        description: "Registrado con su autor y su instante",
        content: { "application/json": { schema: commentSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const comment = await addTaskComment(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
      c.req.valid("json").body,
    )
    return c.json(serializeComment(comment), 201)
  },
})

export const updateTaskCommentRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_comments"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/comments/{commentId}",
    summary: "Editar un comentario de una tarea",
    tags: ["Producciones"],
    request: { params: taskCommentParams, body: commentBody },
    responses: {
      200: {
        description: "Actualizado",
        content: { "application/json": { schema: commentSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const comment = await updateTaskComment(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
      params.commentId,
      c.req.valid("json").body,
    )
    return c.json(serializeComment(comment), 200)
  },
})

export const deleteTaskCommentRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_comments"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/comments/{commentId}",
    summary: "Eliminar un comentario de una tarea",
    tags: ["Producciones"],
    request: { params: taskCommentParams },
    responses: { 204: { description: "Eliminado" } },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteTaskComment(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
      params.commentId,
    )
    return c.body(null, 204)
  },
})

// ─── Adjuntos ────────────────────────────────────────────────────────────────

const attachmentBody = {
  content: { "application/json": { schema: z.object({ uploadId: z.string() }) } },
}

export const attachToTaskRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_edit"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/attachments",
    summary: "Adjuntar un archivo a una tarea",
    tags: ["Producciones"],
    request: { params: taskParams, body: attachmentBody },
    responses: {
      201: {
        description: "Adjuntado. Repetir el mismo archivo devuelve el que ya estaba",
        content: { "application/json": { schema: attachmentSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const attachment = await attachToTask(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
      c.req.valid("json").uploadId,
    )
    return c.json(serializeAttachment(attachment), 201)
  },
})

export const detachFromTaskRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_edit"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/attachments/{attachmentId}",
    summary: "Retirar un adjunto de una tarea",
    tags: ["Producciones"],
    request: { params: attachmentParams },
    responses: { 204: { description: "Retirado" } },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await detachFromTask(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
      params.attachmentId,
    )
    return c.body(null, 204)
  },
})

export const attachToActivityRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_activity_edit"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/activities/{activityId}/attachments",
    summary: "Adjuntar un archivo a una actividad",
    tags: ["Producciones"],
    request: { params: activityParams, body: attachmentBody },
    responses: {
      201: {
        description: "Adjuntado. Repetir el mismo archivo devuelve el que ya estaba",
        content: { "application/json": { schema: attachmentSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const attachment = await attachToActivity(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
      params.activityId,
      c.req.valid("json").uploadId,
    )
    return c.json(serializeAttachment(attachment), 201)
  },
})

export const detachFromActivityRoute = defineRoute({
  access: REQUIRES("productions.workflows.task_activity_edit"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/activities/{activityId}/attachments/{attachmentId}",
    summary: "Retirar un adjunto de una actividad",
    tags: ["Producciones"],
    request: { params: activityAttachmentParams },
    responses: { 204: { description: "Retirado" } },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await detachFromActivity(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      params.taskId,
      params.activityId,
      params.attachmentId,
    )
    return c.body(null, 204)
  },
})

// ─── Calendario ──────────────────────────────────────────────────────────────

export const productionCalendarRoute = defineRoute({
  access: REQUIRES("productions.workflows.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/calendar",
    summary: "El calendario de la producción: jornadas, planes y tareas en un solo flujo",
    tags: ["Producciones"],
    request: {
      params: z.object({ companyId: z.string(), productionId: z.string() }),
      query: z.object({
        view: z
          .enum(CALENDAR_VIEWS)
          .optional()
          .describe("Año, mes, semana o día. Por omisión, mes"),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(
            "Día civil. Ausente: el servidor resuelve dónde está la acción y lo dice en «landing»",
          ),
        /**
         * Qué día es hoy **para quien pregunta**.
         *
         * El aterrizaje se resuelve contra hoy, y «hoy» depende de dónde se esté: a las once de la
         * noche en México ya es el día siguiente en tiempo universal. El cliente conoce su día y lo
         * declara; sin él se usa el universal, que es lo único que el servidor sabe.
         *
         * No cambia lo que se ve cuando la dirección lleva fecha: ahí manda la fecha, que es lo que
         * hace que un enlace compartido enseñe lo mismo a todo el mundo.
         */
        today: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        characterId: z.string().optional(),
        categoryId: z.string().optional(),
        kinds: z.string().optional().describe("Tipos separados por coma. Ausente son los tres"),
      }),
    },
    responses: {
      200: {
        description: "La vista, dónde aterrizó y por qué, su rango y los sucesos",
        content: { "application/json": { schema: calendarSchema } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const query = c.req.valid("query")

    const kinds = query.kinds
      ?.split(",")
      .map((kind) => kind.trim())
      .filter((kind): kind is CalendarKind => (CALENDAR_KINDS as readonly string[]).includes(kind))

    const result = await productionCalendar(actorOf(c), params.companyId, params.productionId, {
      view: query.view ?? "month",
      ...(query.date === undefined ? {} : { date: query.date }),
      ...(query.today === undefined ? {} : { today: query.today }),
      ...(query.characterId === undefined ? {} : { characterId: query.characterId }),
      ...(query.categoryId === undefined ? {} : { categoryId: query.categoryId }),
      ...(kinds === undefined || kinds.length === 0 ? {} : { kinds }),
    })

    return c.json({ ...result, events: result.events.map(serializeEvent) }, 200)
  },
})

export const plansWithTasksRoute = defineRoute({
  access: REQUIRES("productions.workflows.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/calendar/plans",
    summary: "Planes con sus tareas filtradas; los que no tienen ninguna no aparecen",
    tags: ["Producciones"],
    request: {
      params: z.object({ companyId: z.string(), productionId: z.string() }),
      query: z.object({
        categoryId: z.string().optional(),
        characterId: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Los planes con las tareas que cumplen el filtro",
        content: {
          "application/json": {
            schema: z.object({ items: z.array(planWithTasksSchema).readonly() }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const query = c.req.valid("query")

    const plans = await plansWithTasks(actorOf(c), params.companyId, params.productionId, {
      ...(query.categoryId === undefined ? {} : { categoryId: query.categoryId }),
      ...(query.characterId === undefined ? {} : { characterId: query.characterId }),
    })

    return c.json({ items: plans.map(serializePlan) }, 200)
  },
})
