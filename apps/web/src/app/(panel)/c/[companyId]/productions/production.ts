/**
 * Lo que la API de producciones devuelve, visto desde la pantalla.
 *
 * Rebanada 20. Los tipos se declaran aquí y no en cada pantalla por lo mismo que en el almacén: dos
 * pantallas que describen la misma forma acaban describiéndola distinto, y la que se quede vieja no
 * falla — pinta un hueco.
 */

/** La imagen única de una entidad, tal y como llega de la API. */
export interface ImageFields {
  imageUploadId: string | null
  imageUrl: string | null
  /** El derivado de celda. Nulo si el navegador que la subió no supo producirlo. */
  imageThumbnailUrl: string | null
}

export interface ProductionRow extends ImageFields {
  id: string
  companyId: string
  name: string
  description: string
  /** Único en toda la plataforma: es lo que iría en la dirección del directorio público. */
  slug: string | null
  isPublished: boolean
  startsOn: string | null
  endsOn: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Lo que se lleva por delante dar de baja una producción. Lo cuenta el servidor.
 *
 * `openPurchaseOrders` y `unreturnedOrders` son cifras aparte del resto: las demás enumeran lo que
 * deja de estar accesible, y estas dos **impiden** la baja. Enseñarlas juntas convertiría una
 * advertencia en un listado.
 */
export interface ProductionScope {
  scripts: number
  chapters: number
  scenes: number
  characters: number
  sets: number
  videos: number
  items: number
  recordings: number
  workflows: number
  purchaseOrders: number
  openPurchaseOrders: number
  unreturnedOrders: number
}

/**
 * Una categoría de la producción.
 *
 * Es el árbol que organiza el rodaje por departamentos, y por eso trae **el rol**: clasificar una
 * tarea en «Vestuario» es dirigirla al equipo de vestuario.
 */
export interface ProductionCategoryRow {
  id: string
  productionId: string
  parentId: string | null
  roleId: string | null
  roleName: string | null
  name: string
  description: string
  /** Único **dentro de su producción**, no del mundo. */
  slug: string | null
  color: string | null
  icon: string | null
  childCount: number
  createdAt: string
  updatedAt: string
}

/** Los cinco estados de un plan de trabajo, en el orden en que la spec los enumera. */
export const WORKFLOW_STATUSES = [
  "pending",
  "in_progress",
  "rescheduled",
  "completed",
  "cancelled",
] as const

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number]

/** Los cuatro estados de una tarea. Los enumera el desglose, incluidos los que valen cero. */
export const TASK_STATUSES = ["pending", "in_progress", "completed", "incomplete"] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Los tres estados de una jornada de rodaje. */
export const RECORDING_STATUSES = ["draft", "ongoing", "completed"] as const

export type RecordingStatus = (typeof RECORDING_STATUSES)[number]

export interface WorkflowRow {
  id: string
  productionId: string
  sceneId: string | null
  code: string
  observations: string
  status: WorkflowStatus
  scheduledFor: string
  endsAt: string | null
  responsibleId: string | null
  responsibleName: string | null
  /** Siempre llega. El desglose sólo cuando se pide con `?aggregates=true`. */
  taskCount: number
  tasksByStatus?: Record<TaskStatus, number>
  createdAt: string
  updatedAt: string
}

/**
 * El resumen de la producción.
 *
 * Las cuatro cifras que `production-management` enumera y ninguna más. El presupuesto viaja como
 * **cadena decimal**, igual que todo el dinero del sistema, y aquí se queda como tal.
 */
export interface ProductionPanelData {
  chapters: number
  scenes: number
  recordings: Record<RecordingStatus, number>
  workflows: Record<WorkflowStatus, number>
  budget: { anchored: string; spent: string; difference: string }
}

export interface ItemsEnvelope<T> {
  items: T[]
}

/** El rol de una empresa, tal y como lo devuelve el listado de roles. */
export interface RoleRow {
  id: string
  name: string
}

// ─── El tiempo de la producción: tareas y calendario ─────────────────────────

/** Los dos estados de una actividad. */
export const ACTIVITY_STATUSES = ["incomplete", "completed"] as const

export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

export interface AttachmentRow {
  id: string
  uploadId: string
  name: string
  url: string
  kind: string
  createdAt: string
}

export interface CommentRow {
  id: string
  workflowId: string | null
  taskId: string | null
  body: string
  authorId: string | null
  authorName: string | null
  createdAt: string
  updatedAt: string
}

export interface ActivityRow {
  id: string
  taskId: string
  title: string
  description: string
  status: ActivityStatus
  scheduledFor: string | null
  endsAt: string | null
  responsibleId: string | null
  responsibleName: string | null
  createdById: string | null
  createdByName: string | null
  attachments: AttachmentRow[]
  createdAt: string
  updatedAt: string
}

export interface TaskRow {
  id: string
  workflowId: string
  categoryId: string | null
  categoryName: string | null
  characterId: string | null
  characterName: string | null
  title: string
  description: string
  status: TaskStatus
  scheduledFor: string | null
  endsAt: string | null
  responsibleId: string | null
  responsibleName: string | null
  /** Quién la creó. Inmutable: no aparece en ningún formulario de edición. */
  createdById: string | null
  createdByName: string | null
  activityCount: number
  activitiesByStatus?: Record<ActivityStatus, number>
  attachmentCount: number
  commentCount: number
  createdAt: string
  updatedAt: string
}

export interface TaskDetailRow extends TaskRow {
  activities: ActivityRow[]
  comments: CommentRow[]
  attachments: AttachmentRow[]
}

/** Lo que se pierde al eliminar una tarea. Lo cuenta el servidor. */
export interface TaskScope {
  activities: number
  comments: number
  attachments: number
}

/** Lo que se pierde al eliminar un plan. Cuatro cifras, no una. */
export interface WorkflowScope {
  tasks: number
  activities: number
  comments: number
  attachments: number
}

/** Las cuatro vistas del calendario, de la más amplia a la más estrecha. */
export const CALENDAR_VIEWS = ["year", "month", "week", "day"] as const

export type CalendarView = (typeof CALENDAR_VIEWS)[number]

/** Los tres tipos de suceso que caben en el calendario. */
export const CALENDAR_KINDS = ["recording", "workflow", "task"] as const

export type CalendarKind = (typeof CALENDAR_KINDS)[number]

/**
 * Por qué el calendario aterrizó donde aterrizó.
 *
 * Los cuatro son cuatro frases distintas en pantalla. El cuarto es el que evita la rejilla en
 * blanco: cuando no hay nada programado se dice con palabras, no se dibuja un mes desierto.
 */
export const LANDING_REASONS = ["before", "during", "after", "empty"] as const

export type LandingReason = (typeof LANDING_REASONS)[number]

export interface CalendarEventRow {
  kind: CalendarKind
  id: string
  /** Día civil `AAAA-MM-DD`. Es por el que se agrupa la rejilla. */
  day: string
  startsAt: string | null
  endsAt: string | null
  title: string
  /** El estado propio de su tipo. Cada uno tiene los suyos y no se mezclan. */
  status: string
  workflowId: string | null
  sceneId: string | null
  sceneLabel: string | null
  categoryId: string | null
  categoryName: string | null
  characterId: string | null
  characterName: string | null
  responsibleName: string | null
}

export interface CalendarData {
  view: CalendarView
  landing: { date: string; reason: LandingReason }
  range: { from: string; to: string }
  events: CalendarEventRow[]
}

/** Un personaje de la producción, para el filtro del calendario. */
export interface CharacterRow {
  id: string
  name: string
}
