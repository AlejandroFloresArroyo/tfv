/**
 * Planes de trabajo.
 *
 * Ver `openspec/specs/production-workflows/spec.md`. Rebanada 20, la parte del flujo básico que la
 * producción necesita para tener panel.
 *
 * Un plan de trabajo es lo que en producción se llama **una orden del día**: qué se hace en una
 * fecha, quién lo hace y en qué estado va. Es la unidad con la que se programa un rodaje, y por eso
 * el panel de la producción la resume por estado: sin ella, «cómo va esto» no tiene respuesta.
 *
 * ## Qué entra aquí y qué es de la rebanada 22
 *
 * Entra **el plan**: su fecha, su responsable, sus observaciones, su estado, su código y el
 * recuento de sus tareas. No entran las tareas ni sus actividades, ni los comentarios, ni los
 * adjuntos, ni el calendario como documento — son `migrate-productions-operations`, y su modelo
 * vive en `productions-ops.ts`, que esta rebanada no toca.
 *
 * La costura queda a la vista: el recuento y el desglose se **leen** de `production_tasks`, así que
 * el día que la 22 abra las tareas el plan ya sabe contarlas. Lo que no hace es escribirlas.
 *
 * ## Los cinco estados no tienen tabla de transiciones, y no se inventa
 *
 * La spec enumera los cinco —pendiente, en curso, reprogramado, completado, cancelado— y dice que
 * nace pendiente, pero **no declara qué transiciones son legales**, al revés que la cotización y el
 * pedido de almacén, que sí las transcriben. Escribir aquí una tabla plausible sería fijar por
 * nuestra cuenta una regla de negocio que nadie ha decidido, y las consecuencias las pagaría un
 * jefe de producción al que la aplicación le dijera que no puede volver a abrir una jornada. Se
 * admite cualquiera de los cinco, y queda anotado (`HALLAZGOS.md` H-111).
 */

import {
  buildPage,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
  UnprocessableError,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import { productionTasks, productionWorkflows, users } from "@tfv/db/schema"
import { and, count, eq, inArray, isNull } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { loadProduction } from "./productions.ts"

/** Los cinco estados de un plan, en el orden en que la spec los enumera. */
export const WORKFLOW_STATUSES = [
  "pending",
  "in_progress",
  "rescheduled",
  "completed",
  "cancelled",
] as const

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number]

/** Los cuatro estados de una tarea. Se declaran aquí porque el desglose los enumera todos. */
export const TASK_STATUSES = ["pending", "in_progress", "completed", "incomplete"] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface WorkflowRecord {
  readonly id: string
  readonly productionId: string
  readonly sceneId: string | null
  readonly code: string
  readonly observations: string
  readonly status: WorkflowStatus
  readonly scheduledFor: Date
  readonly endsAt: Date | null
  readonly responsibleId: string | null
  readonly responsibleName: string | null
  /** Siempre presente, y `0` cuando no hay tareas. Es un recuento, no un agregado costoso. */
  readonly taskCount: number
  /**
   * Desglose por estado, **sólo cuando se pide**.
   *
   * `computed-fields` lo exige literalmente: «se lista una colección de planes de trabajo sin
   * solicitar sus agregados → la respuesta no incluye el desglose **y la consulta no recorre las
   * tareas de cada plan**». Lo segundo es lo que importa: la propiedad no es que el campo se omita,
   * es que no se pague por él.
   */
  readonly tasksByStatus?: Readonly<Record<TaskStatus, number>> | undefined
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Qué se puede pedir de la colección de planes.
 *
 * Los filtros son los de la spec —«estado, responsable, escena y rango de fechas»—. La búsqueda va
 * sobre el código y las observaciones: la spec dice «por nombre y observaciones» y **un plan no
 * tiene nombre** en el modelo, que es un desajuste anotado (`HALLAZGOS.md` H-110).
 */
export const workflowQuery: QuerySchema = {
  filters: {
    status: { type: "enum", values: WORKFLOW_STATUSES, set: true, label: "Estado" },
    responsibleId: { type: "id", label: "Responsable" },
    sceneId: { type: "id", label: "Escena" },
    scheduledFor: { type: "date", range: true, label: "Fecha" },
  },
  searchable: ["code", "observations"],
  sortable: ["scheduledFor", "code", "createdAt"],
  defaultSort: [
    { field: "scheduledFor", direction: "desc" },
    { field: "createdAt", direction: "desc" },
  ],
}

const mapping = {
  fields: {
    status: productionWorkflows.status,
    responsibleId: productionWorkflows.responsibleId,
    sceneId: productionWorkflows.sceneId,
    scheduledFor: productionWorkflows.scheduledFor,
    code: productionWorkflows.code,
    createdAt: productionWorkflows.createdAt,
  },
  searchable: [productionWorkflows.code, productionWorkflows.observations],
  tiebreak: productionWorkflows.id,
}

export interface ReadOptions {
  /** Trae el desglose por estado. Cuesta una consulta más sobre las tareas. */
  readonly aggregates?: boolean | undefined
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function listWorkflows(
  actor: Actor,
  companyId: string,
  productionId: string,
  query: ParsedQuery,
  options: ReadOptions = {},
): Promise<Page<WorkflowRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const where = and(
      eq(productionWorkflows.productionId, productionId),
      isNull(productionWorkflows.deletedAt),
      ...collectionConditions(query, mapping),
    )

    const [total] = await tx.select({ value: count() }).from(productionWorkflows).where(where)

    const rows = await tx
      .select()
      .from(productionWorkflows)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    return buildPage(await decorate(tx, rows, options), total?.value ?? 0, page, limit)
  })
}

export async function getWorkflow(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  options: ReadOptions = {},
): Promise<WorkflowRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const row = await loadWorkflow(tx, productionId, workflowId)

    return (await decorate(tx, [row], options))[0] as WorkflowRecord
  })
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export interface CreateWorkflowInput {
  readonly scheduledFor: string
  readonly endsAt?: string | null | undefined
  readonly observations?: string | undefined
  readonly responsibleId?: string | null | undefined
}

export async function createWorkflow(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: CreateWorkflowInput,
): Promise<WorkflowRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const scheduledFor = requireDate(input.scheduledFor)
    const endsAt = optionalDate(input.endsAt)
    assertOrdered(scheduledFor, endsAt)

    const [created] = await tx
      .insert(productionWorkflows)
      .values({
        id: newId(),
        productionId,
        code: workflowCode(),
        observations: input.observations?.trim() ?? "",
        scheduledFor,
        endsAt,
        responsibleId: input.responsibleId ?? null,
        // El estado no se recibe: la spec dice «un plan nace pendiente», y admitirlo en el alta
        // convertiría un invariante en un valor por omisión que cualquiera puede sobrescribir.
      })
      .returning()

    if (!created) throw new Error("la inserción del plan no devolvió fila")
    return (await decorate(tx, [created], {}))[0] as WorkflowRecord
  })
}

export interface UpdateWorkflowInput {
  readonly scheduledFor?: string | undefined
  readonly endsAt?: string | null | undefined
  readonly observations?: string | undefined
  readonly responsibleId?: string | null | undefined
  readonly status?: WorkflowStatus | undefined
}

/**
 * Edita un plan.
 *
 * **Reprogramar es un solo movimiento.** El escenario de la spec —«se cambia la fecha de un plan y
 * se marca como reprogramado → conserva sus tareas»— llega aquí como una sola escritura con las
 * dos cosas: partirlo en dos peticiones dejaría una ventana en la que el plan ya cambió de fecha y
 * todavía dice estar pendiente, y quien mirase el calendario en ese instante vería una jornada
 * movida sin motivo aparente.
 *
 * Las tareas no se tocan, y no hay que hacer nada para que sobrevivan: cuelgan del plan, no de su
 * fecha.
 */
export async function updateWorkflow(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
  input: UpdateWorkflowInput,
): Promise<WorkflowRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const current = await loadWorkflow(tx, productionId, workflowId)

    const patch: Record<string, unknown> = {}
    if (input.observations !== undefined) patch.observations = input.observations.trim()
    if (input.responsibleId !== undefined) patch.responsibleId = input.responsibleId
    if (input.status !== undefined) patch.status = input.status

    const scheduledFor =
      input.scheduledFor === undefined ? current.scheduledFor : requireDate(input.scheduledFor)
    const endsAt = input.endsAt === undefined ? current.endsAt : optionalDate(input.endsAt)
    assertOrdered(scheduledFor, endsAt)
    if (input.scheduledFor !== undefined) patch.scheduledFor = scheduledFor
    if (input.endsAt !== undefined) patch.endsAt = endsAt

    if (Object.keys(patch).length === 0) {
      return (await decorate(tx, [current], {}))[0] as WorkflowRecord
    }

    const [updated] = await tx
      .update(productionWorkflows)
      .set(patch)
      .where(eq(productionWorkflows.id, workflowId))
      .returning()

    if (!updated) throw new NotFoundError("El plan de trabajo no existe")
    return (await decorate(tx, [updated], {}))[0] as WorkflowRecord
  })
}

/**
 * Lo que se lleva por delante eliminar un plan.
 *
 * «La confirmación SHALL enumerar previamente lo que se perderá», y lo que se pierde son sus tareas
 * y, con ellas, sus actividades: las dos cascadas las hacen las claves foráneas.
 */
export interface WorkflowScope {
  readonly tasks: number
}

export async function workflowScope(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
): Promise<WorkflowScope> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)

    const counts = await taskCounts(tx, [workflowId])
    return { tasks: counts.get(workflowId)?.total ?? 0 }
  })
}

export async function deleteWorkflow(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadWorkflow(tx, productionId, workflowId)

    /**
     * Borrado lógico, porque el modelo le da columna para ello.
     *
     * «Eliminar un plan SHALL eliminar sus tareas» se cumple sin recorrer nada: las tareas cuelgan
     * del plan y toda lectura parte de él, así que dejan de existir para quien mira. La cascada
     * física está declarada en la clave foránea y actúa el día que la fila se retire de verdad —no
     * la escribe este módulo, que es lo que evitó el C-08 en la producción.
     */
    await tx
      .update(productionWorkflows)
      .set({ deletedAt: new Date() })
      .where(eq(productionWorkflows.id, workflowId))
  })
}

// ─── Recuentos ───────────────────────────────────────────────────────────────

interface TaskCounts {
  readonly total: number
  readonly byStatus: Record<TaskStatus, number>
}

/**
 * Tareas por plan y por estado, en **una sola consulta** para todo el lote.
 *
 * Agrupada por las dos columnas: el total sale de sumar el desglose, así que pedirlo aparte sería
 * una segunda consulta que puede discrepar de la primera si algo cambia entre las dos.
 */
async function taskCounts(
  tx: Transaction,
  workflowIds: readonly string[],
): Promise<Map<string, TaskCounts>> {
  const counts = new Map<string, TaskCounts>()
  if (workflowIds.length === 0) return counts

  const rows = await tx
    .select({
      workflowId: productionTasks.workflowId,
      status: productionTasks.status,
      value: count(),
    })
    .from(productionTasks)
    .where(and(inArray(productionTasks.workflowId, workflowIds), isNull(productionTasks.deletedAt)))
    .groupBy(productionTasks.workflowId, productionTasks.status)

  for (const row of rows) {
    const current = counts.get(row.workflowId) ?? { total: 0, byStatus: emptyBreakdown() }
    counts.set(row.workflowId, {
      total: current.total + row.value,
      byStatus: { ...current.byStatus, [row.status]: row.value },
    })
  }

  return counts
}

/** Los cuatro estados en cero. El desglose incluye los que no tienen ninguna tarea. */
function emptyBreakdown(): Record<TaskStatus, number> {
  return { pending: 0, in_progress: 0, completed: 0, incomplete: 0 }
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

async function decorate(
  tx: Transaction,
  rows: readonly (typeof productionWorkflows.$inferSelect)[],
  options: ReadOptions,
): Promise<WorkflowRecord[]> {
  if (rows.length === 0) return []

  const counts = await taskCounts(
    tx,
    rows.map((row) => row.id),
  )

  const responsibleIds = [
    ...new Set(rows.map((row) => row.responsibleId).filter((id) => id !== null)),
  ]
  const named =
    responsibleIds.length === 0
      ? []
      : await tx
          .select({ id: users.id, name: users.name, lastname: users.lastname })
          .from(users)
          .where(inArray(users.id, responsibleIds))

  const names = new Map(named.map((row) => [row.id, [row.name, row.lastname].join(" ").trim()]))

  return rows.map((row) => {
    const tally = counts.get(row.id)

    return {
      id: row.id,
      productionId: row.productionId,
      sceneId: row.sceneId,
      code: row.code,
      observations: row.observations,
      status: row.status,
      // La columna admite nulo por herencia del trasvase; el servicio siempre la escribe, y el
      // registro la declara obligatoria para que la pantalla no tenga que decidir qué pintar.
      scheduledFor: row.scheduledFor ?? row.createdAt,
      endsAt: row.endsAt,
      responsibleId: row.responsibleId,
      responsibleName: row.responsibleId === null ? null : (names.get(row.responsibleId) ?? null),
      taskCount: tally?.total ?? 0,
      ...(options.aggregates === true
        ? { tasksByStatus: tally?.byStatus ?? emptyBreakdown() }
        : {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  })
}

/** Mismo alfabeto que el resto de códigos: sin caracteres que se confundan al dictarlos. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/**
 * El código del plan. Aleatorio y no correlativo.
 *
 * El índice único de la columna es **de toda la plataforma y no distingue las bajas** —está en
 * `productions-ops.ts`, que esta rebanada no toca—, así que un correlativo por producción chocaría
 * con el de la de al lado. Diez caracteres del alfabeto de Crockford dan margen de sobra; el
 * desajuste queda anotado (`HALLAZGOS.md` H-109).
 */
function workflowCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return `PLAN-${Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("")}`
}

function requireDate(value: string): Date {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new UnprocessableError("La fecha no es válida")
  return parsed
}

function optionalDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null || value === "") return null
  return requireDate(value)
}

/**
 * El plan no termina antes de empezar.
 *
 * `scheduledFor` admite nulo porque la columna lo admite —herencia del trasvase—, aunque el alta lo
 * exija: una fila anterior sin fecha no puede desordenarse con nada, así que se deja pasar en lugar
 * de rechazar una edición que no la toca.
 */
function assertOrdered(scheduledFor: Date | null, endsAt: Date | null): void {
  if (scheduledFor === null || endsAt === null) return
  if (endsAt.getTime() < scheduledFor.getTime()) {
    throw new UnprocessableError("El plan no puede terminar antes de empezar")
  }
}

export async function loadWorkflow(tx: Transaction, productionId: string, workflowId: string) {
  const [row] = await tx
    .select()
    .from(productionWorkflows)
    .where(
      and(
        eq(productionWorkflows.id, workflowId),
        eq(productionWorkflows.productionId, productionId),
        isNull(productionWorkflows.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El plan de trabajo no existe")
  return row
}
