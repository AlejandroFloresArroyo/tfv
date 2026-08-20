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

// ─── Inventario de utilería ──────────────────────────────────────────────────

/**
 * Los ocho estados de un artículo, en el orden del enumerado del motor.
 *
 * `delivered` está en la lista porque un artículo puede estarlo, y **no se ofrece nunca como
 * destino** en el selector de cambio de estado: se llega ahí cerrando una nota de entrega
 * verificada. Quien lo quiera poner a mano tiene que hacer la nota, que es el punto.
 */
export const ITEM_STATUSES = [
  "available",
  "stored",
  "delivered",
  "returned",
  "damaged",
  "incomplete",
  "lost",
  "robbed",
] as const

export type ItemStatus = (typeof ITEM_STATUSES)[number]

export interface ItemImageRow {
  uploadId: string
  url: string
  thumbnailUrl: string | null
  position: number
}

export interface ItemRow {
  id: string
  productionId: string
  categoryId: string | null
  categoryName: string | null
  shoppingId: string | null
  name: string
  description: string
  /** Doce caracteres del alfabeto de Crockford. Va en mono: se dicta por teléfono. */
  code: string
  status: ItemStatus
  isInventoriable: boolean
  /** A dónde puede ir desde donde está. Lo decide el servidor con su tabla de transiciones. */
  allowedStatuses: ItemStatus[]
  images: ItemImageRow[]
  createdAt: string
  updatedAt: string
}

/** Lo que va impreso en la etiqueta de un artículo. `payload` es lo que codifica el símbolo. */
export interface ItemLabelRow {
  itemId: string
  code: string
  payload: string
  name: string
  status: ItemStatus
  productionId: string
}

export const ITEM_EVENT_REASONS = ["manual", "delivery", "return", "created"] as const
export type ItemEventReason = (typeof ITEM_EVENT_REASONS)[number]

/** Un paso en la vida de un objeto físico. Del más reciente al más antiguo. */
export interface ItemEventRow {
  id: string
  itemId: string
  fromStatus: ItemStatus | null
  toStatus: ItemStatus
  reason: ItemEventReason
  actorId: string | null
  actorName: string | null
  causeId: string | null
  note: string | null
  occurredAt: string
}

/** Dónde se está usando un artículo: los tres sitios que la spec nombra. */
export interface ItemUsageRow {
  deliveries: { id: string; name: string; status: DeliveryStatus; direction: DeliveryDirection }[]
  sets: { id: string; name: string }[]
  recordings: { id: string; name: string; continuityId: string }[]
}

// ─── Notas de entrega ────────────────────────────────────────────────────────

export const DELIVERY_STATUSES = ["pending", "in_progress", "completed", "canceled"] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

/** Salida o devolución. Se fija al abrir la nota y no cambia. */
export const DELIVERY_DIRECTIONS = ["outbound", "inbound"] as const
export type DeliveryDirection = (typeof DELIVERY_DIRECTIONS)[number]

/**
 * En qué estado vuelve una pieza por una nota de devolución.
 *
 * Cinco de los ocho del artículo: una devolución dice de qué manera volvió la cosa, no dónde se
 * guarda después.
 */
export const RETURN_CONDITIONS = [
  "returned",
  "damaged",
  "incomplete",
  "lost",
  "robbed",
] as const satisfies readonly ItemStatus[]

export type ReturnCondition = (typeof RETURN_CONDITIONS)[number]

export interface DeliveryLineRow {
  id: string
  deliveryId: string
  itemId: string
  itemName: string
  itemCode: string
  itemStatus: ItemStatus
  isVerified: boolean
  verifiedById: string | null
  verifiedByName: string | null
  verifiedAt: string | null
  returnCondition: ReturnCondition | null
}

export interface DeliveryRow {
  id: string
  productionId: string
  name: string
  description: string
  status: DeliveryStatus
  direction: DeliveryDirection
  responsibleId: string | null
  responsibleName: string | null
  signedById: string | null
  signedByName: string | null
  signatureUploadId: string | null
  receiverName: string | null
  receiverSignatureUploadId: string | null
  signedAt: string | null
  /** Si lleva firma. Lo calcula el servidor para no obligar a mirar tres campos. */
  isSigned: boolean
  counts: { total: number; verified: number; pending: number }
  lines: DeliveryLineRow[]
  createdAt: string
  updatedAt: string
}
