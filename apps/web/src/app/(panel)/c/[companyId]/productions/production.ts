/**
 * Lo que la API de producciones devuelve, visto desde la pantalla.
 *
 * Rebanada 20. Los tipos se declaran aquí y no en cada pantalla por lo mismo que en el almacén: dos
 * pantallas que describen la misma forma acaban describiéndola distinto, y la que se quede vieja no
 * falla — pinta un hueco.
 *
 * ## Personajes, sets, videos y continuidad: derivados del contrato, no transcritos
 *
 * `account/sessions` (`HALLAZGOS.md` H-128) es la única pantalla que consume el cliente tipado
 * hasta la 29c, y demuestra por qué: una interfaz escrita a mano se desincroniza del servidor sin
 * que nada lo note. Los tipos de esta sección salen de `ApiOutput`, sobre las claves del contrato
 * publicado, así que un campo que cambie de nombre en el servidor deja de compilar aquí en vez de
 * pintar un hueco en producción.
 */

import type { ApiOutput } from "@tfv/contracts/api-client"

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

// ─── El desglose del guion ────────────────────────────────────────────────────

/**
 * Los cinco estados de la extracción, en el orden en que el modelo los enumera.
 *
 * Rebanada 20: este módulo no extrae, sólo enseña el estado. `not_extracted` es el único que se
 * alcanza hoy escribiendo desde la pantalla — los otros cuatro los escribe `script-ai-sync`,
 * rebanada 21, que todavía no existe. Se declaran los cinco de todos modos: la pantalla tiene que
 * saber leerlos el día que la extracción llegue, y ese día no debería tocar esta lista.
 */
export const SYNC_STATUSES = ["not_extracted", "queued", "running", "completed", "failed"] as const

export type SyncStatus = (typeof SYNC_STATUSES)[number]

/** Un guion de la producción: su archivo, y el estado de su extracción. */
export interface ScriptRow {
  id: string
  productionId: string
  name: string
  index: number
  documentUploadId: string | null
  documentUrl: string | null
  documentFileName: string | null
  responsibleId: string | null
  responsibleName: string | null
  syncStatus: SyncStatus
  syncError: string | null
  syncedAt: string | null
  scenesWithoutBody: number
  chapterCount: number
  createdAt: string
  updatedAt: string
}

/** Lo que se queda sin guion al dar de baja uno. Los capítulos sobreviven, no se llevan. */
export interface ScriptScope {
  chapters: number
}

/** Un capítulo: índice único en la producción, y cuántas escenas tiene dentro. */
export interface ChapterRow {
  id: string
  productionId: string
  scriptId: string | null
  name: string
  synopsis: string
  index: number
  responsibleId: string | null
  responsibleName: string | null
  sceneCount: number
  createdAt: string
  updatedAt: string
}

/** Lo que se lleva por delante dar de baja un capítulo. Las jornadas y los planes sobreviven. */
export interface ChapterScope {
  scenes: number
  recordings: number
  workflows: number
}

/** Una escena: índice único en su capítulo, y la etiqueta compuesta que sale de los dos números. */
export interface SceneRow {
  id: string
  chapterId: string
  chapterIndex: number
  name: string
  synopsis: string
  index: number
  /** `{capítulo}.{escena}`, compuesta por el servidor. No se recalcula aquí. */
  label: string
  workflowCount: number
  synopsisEditedAt: string | null
  /** Existía en una extracción anterior y la última ya no la encontró. No la borra: la marca. */
  missingFromLastSync: boolean
  createdAt: string
  updatedAt: string
}

/** Lo que se lleva por delante dar de baja una escena. Jornadas y planes sobreviven, sin escena. */
export interface SceneScope {
  recordings: number
  workflows: number
}

/** La estructura completa de la producción: capítulos por índice, cada uno con sus escenas. */
export interface ProductionBreakdown {
  chapters: (ChapterRow & { scenes: SceneRow[] })[]
}

/** El último índice usado y el que se propone. Los huecos que deja borrar no se rellenan solos. */
export interface IndexHint {
  lastIndex: number | null
  nextIndex: number
  available: boolean | null
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

/**
 * Un personaje de la producción.
 *
 * Era `{id, name}`, sólo lo que pedía el filtro del calendario. Ensancharlo aquí no rompe a quien
 * ya lo usaba así —lee dos campos de un objeto que ahora trae más— y evita una segunda interfaz
 * para la misma fila el día que un personaje necesita pantalla propia, que es lo que pasa en la
 * 29c.
 */
export type CharacterRow =
  ApiOutput<"GET /companies/{companyId}/productions/{productionId}/characters/{characterId}">

// ─── Rodaje: sets, videos y continuidad ───────────────────────────────────────

/** Un artículo del inventario dentro de la composición de un set. */
export type SetItemRow = NonNullable<
  ApiOutput<"GET /companies/{companyId}/productions/{productionId}/sets/{setId}">["items"]
>[number]

/** Un set (decorado). `items` sólo viaja en la ficha; el listado sólo trae el recuento. */
export type SetRow = ApiOutput<"GET /companies/{companyId}/productions/{productionId}/sets/{setId}">

/** Un video de referencia de la biblioteca. */
export type VideoRow =
  ApiOutput<"GET /companies/{companyId}/productions/{productionId}/videos/{videoId}">

/** Los dos tipos de jornada, en el orden del enumerado del motor. */
export const RECORDING_KINDS = ["record", "re_record"] as const
export type RecordingKind = (typeof RECORDING_KINDS)[number]

/** Una jornada de rodaje, tal y como la trae el listado. */
export type RecordingRow =
  ApiOutput<"GET /companies/{companyId}/productions/{productionId}/recordings">["items"][number]

/** La misma jornada, con su reparto, su utilería y sus notas. */
export type RecordingDetailRow =
  ApiOutput<"GET /companies/{companyId}/productions/{productionId}/recordings/{recordingId}">

/** La escena de la que cuelga una jornada, tal y como viaja dentro de su ficha. */
export type RecordingSceneRow = NonNullable<RecordingDetailRow["scene"]>

/** Una continuidad: un personaje —o ninguno— con su utilería. */
export type ContinuityRow = RecordingDetailRow["continuities"][number]

/**
 * Una pieza de utilería.
 *
 * `kind` dice de cuál de las dos rutas salió — `item` de colgar un artículo, `video` de colgar un
 * video—. Nunca las dos referencias a la vez: es la forma que `productions/continuity.ts` no deja
 * escribir de otra manera.
 */
export type PropRow = ContinuityRow["props"][number]

/** Una nota de jornada: el cuaderno del script. */
export type RecordingNoteRow = RecordingDetailRow["notes"][number]

/** Cómo apareció un personaje a lo largo del rodaje: sus jornadas, con la utilería de cada una. */
export type CharacterHistoryRow =
  ApiOutput<"GET /companies/{companyId}/productions/{productionId}/characters/{characterId}/continuity">

export type CharacterHistoryEntryRow = CharacterHistoryRow["recordings"][number]

/**
 * Una escena, para elegirla al programar una jornada.
 *
 * No es la pantalla de escenas —eso es de quien construye el desglose—, es sólo la opción de un
 * selector: a qué escena pertenece el día que se está programando. `label` es la numeración
 * compuesta («1.1») con la que un set nombra una escena, y es lo único que hace falta para
 * reconocerla en una lista sin repetir el nombre del capítulo al lado de cada una.
 */
export type SceneOptionRow =
  ApiOutput<"GET /companies/{companyId}/productions/{productionId}/scenes">["items"][number]

// ─── Presupuesto ─────────────────────────────────────────────────────────────

/** Los cinco tipos de gasto, en el orden en que el enumerado del motor los declara. */
export const SHOPPING_KINDS = ["shopping", "expense", "payment", "rent", "transfer"] as const
export type ShoppingKind = (typeof SHOPPING_KINDS)[number]

/** Cómo se pagó. */
export const SHOPPING_METHODS = ["cash", "card", "transfer"] as const
export type ShoppingMethod = (typeof SHOPPING_METHODS)[number]

/** Un archivo colgado de una partida o de un gasto: su comprobante, su factura. */
export interface BudgetAttachmentRow {
  id: string
  uploadId: string
  name: string
  url: string
  kind: string
  createdAt: string
}

/** Una partida presupuestada: lo previsto. */
export interface AnchorRow {
  id: string
  productionId: string
  name: string
  description: string
  /** Cadena decimal. El dinero no pasa por `Number` en esta aplicación. */
  amount: string
  categoryId: string | null
  categoryName: string | null
  responsibleId: string | null
  responsibleName: string | null
  attachments: BudgetAttachmentRow[]
  createdAt: string
  updatedAt: string
}

/** Un artículo del inventario que entró con una compra. */
export interface ShoppingItemRow {
  id: string
  name: string
  code: string
}

/** Un gasto realizado: lo ejecutado. */
export interface ShoppingRow {
  id: string
  productionId: string
  name: string
  observations: string
  amount: string
  kind: ShoppingKind
  method: ShoppingMethod
  /** Identificación **parcial** de la tarjeta. El número completo no existe en ninguna capa. */
  cardLast4: string | null
  isDeductible: boolean
  occurredOn: string | null
  providerId: string | null
  providerName: string | null
  categoryId: string | null
  categoryName: string | null
  responsibleId: string | null
  responsibleName: string | null
  /** El pedido de almacén que la originó. Lo escribe la 23. */
  warehouseOrderId: string | null
  items: ShoppingItemRow[]
  attachments: BudgetAttachmentRow[]
  createdAt: string
  updatedAt: string
}

/** Los tres importes del presupuesto, y si la diferencia es desfavorable. */
export interface BudgetAmounts {
  totalPresupuestado: string
  totalGastado: string
  diferencia: string
  isUnfavorable: boolean
}

export interface BudgetCategoryRow {
  categoryId: string | null
  categoryName: string | null
  budgeted: string
  spent: string
  difference: string
  isUnfavorable: boolean
}

/**
 * El presupuesto tal y como llega: derivado, nunca almacenado.
 *
 * `filtered` es lo que se está mirando; `overall`, la producción entera. Los dos vienen en la misma
 * respuesta para que el peso de una categoría se pueda leer sin perder de vista el conjunto.
 */
export interface BudgetData {
  anchors: AnchorRow[]
  shoppings: ShoppingRow[]
  filtered: BudgetAmounts
  overall: BudgetAmounts
  categories: BudgetCategoryRow[]
}

/** Un proveedor de la empresa, para elegirlo en una compra. */
export interface ProviderRow {
  id: string
  alias: string
}
