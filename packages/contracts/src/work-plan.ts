/**
 * El documento del plan de trabajo.
 *
 * Ver `openspec/specs/pdf-documents/spec.md` y el requisito «Documento y enlace del plan» de
 * `production-workflows`: el plan se genera como documento **con sus tareas agrupadas por semana y
 * por día**, y se comparte por enlace público de sólo lectura.
 *
 * Es la segunda familia de documentos que se compone de verdad, y sigue el reparto de la primera:
 * el servidor lee de la base, esto dispone, y el navegador dibuja. La composición vive aquí —y no
 * en la API— porque la produce el servidor y la consume el navegador; declararla dos veces es como
 * acaban divergiendo lo que se calcula y lo que se imprime.
 *
 * ## Por qué semana y día, y no una lista
 *
 * Una hoja de llamado se lee por bloques de tiempo. La semana es la unidad con la que un equipo de
 * producción se organiza —«la semana que viene rodamos interiores»— y el día es la unidad con la
 * que trabaja. Una lista plana de cuarenta tareas ordenadas por fecha tiene la misma información y
 * no se puede leer en el set.
 *
 * ## Las tareas sin fecha van aparte, y van
 *
 * No caben en ninguna semana. Descartarlas imprimiría un plan al que le faltan cosas sin decirlo,
 * que es peor que un bloque al final titulado «sin fecha».
 */

import { dayOf, weekStart } from "./calendar.ts"
import { TASK_STATUSES } from "./computed.ts"
import type { DocumentParty } from "./document.ts"

export type WorkPlanTaskStatus = (typeof TASK_STATUSES)[number]

/** Los cinco estados de un plan, tal y como los enumera `production-workflows`. */
export const WORK_PLAN_STATUSES = [
  "pending",
  "in_progress",
  "rescheduled",
  "completed",
  "cancelled",
] as const

export type WorkPlanStatus = (typeof WORK_PLAN_STATUSES)[number]

// ─── Entrada ─────────────────────────────────────────────────────────────────

/** Una tarea, tal y como se lee de la base para componer el documento. */
export interface WorkPlanTaskInput {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly status: WorkPlanTaskStatus
  /** Instante, o nulo. El día civil lo resuelve esta composición. */
  readonly scheduledFor: string | null
  readonly endsAt: string | null
  readonly responsibleName: string | null
  readonly categoryName: string | null
  readonly characterName: string | null
  readonly activityCount: number
  readonly completedActivities: number
}

/** La identidad del plan en la hoja: de qué plan y de qué momento se trata. */
export interface WorkPlanIdentity {
  readonly code: string
  readonly status: WorkPlanStatus
  readonly observations: string
  readonly scheduledFor: string
  readonly endsAt: string | null
  /** Cuándo se compuso **este** documento. Con la fecha del plan, es la trazabilidad de la hoja. */
  readonly generatedAt: string
}

/** La escena a la que el plan está asociado, si lo está. */
export interface WorkPlanScene {
  readonly id: string
  readonly name: string
  /** La etiqueta que identifica la escena dentro de la producción entera, `capítulo.escena`. */
  readonly label: string
  readonly chapterName: string
}

export interface WorkPlanDocumentInput {
  readonly identity: WorkPlanIdentity
  readonly issuer: DocumentParty
  readonly production: { readonly id: string; readonly name: string }
  readonly scene: WorkPlanScene | null
  readonly responsibleName: string | null
  readonly tasks: readonly WorkPlanTaskInput[]
}

// ─── Salida ──────────────────────────────────────────────────────────────────

/** Una tarea ya dispuesta, con su día civil resuelto. */
export interface WorkPlanTask extends WorkPlanTaskInput {
  /** Día civil `AAAA-MM-DD`, o nulo cuando la tarea no lleva fecha. */
  readonly day: string | null
}

export interface WorkPlanDay {
  readonly day: string
  readonly tasks: readonly WorkPlanTask[]
}

export interface WorkPlanWeek {
  /** Lunes de la semana. */
  readonly from: string
  /** Domingo de la semana. */
  readonly to: string
  readonly days: readonly WorkPlanDay[]
}

export interface WorkPlanTotals {
  readonly tasks: number
  readonly byStatus: Readonly<Record<WorkPlanTaskStatus, number>>
}

export interface WorkPlanDocument {
  readonly kind: "work-plan"
  readonly identity: WorkPlanIdentity
  readonly issuer: DocumentParty
  readonly production: { readonly id: string; readonly name: string }
  readonly scene: WorkPlanScene | null
  readonly responsibleName: string | null
  readonly weeks: readonly WorkPlanWeek[]
  /** Las que no caben en ninguna semana. Van al final, y van. */
  readonly undated: readonly WorkPlanTask[]
  readonly totals: WorkPlanTotals
}

/**
 * Compone el documento de un plan de trabajo.
 *
 * **No decide qué tareas entran** —eso lo hizo la consulta— sino cómo se disponen: cada tarea cae
 * en su día, cada día en su semana, y las semanas salen en orden. Los recuentos del pie cuentan
 * **todas** las tareas, incluidas las sin fecha, porque el pie resume el plan y no la rejilla.
 */
export function composeWorkPlanDocument(input: WorkPlanDocumentInput): WorkPlanDocument {
  const dated: WorkPlanTask[] = []
  const undated: WorkPlanTask[] = []

  for (const task of input.tasks) {
    const day = task.scheduledFor === null ? null : dayOf(new Date(task.scheduledFor))
    const resolved: WorkPlanTask = { ...task, day }
    if (day === null) undated.push(resolved)
    else dated.push(resolved)
  }

  return {
    kind: "work-plan",
    identity: input.identity,
    issuer: input.issuer,
    production: input.production,
    scene: input.scene,
    responsibleName: input.responsibleName,
    weeks: intoWeeks(dated),
    undated,
    totals: {
      tasks: input.tasks.length,
      byStatus: countByStatus(input.tasks),
    },
  }
}

/**
 * Reparte las tareas fechadas en semanas y días.
 *
 * Se agrupa con mapas y se ordena al final en lugar de ordenar la entrada: el orden de las tareas
 * dentro de un día es el que traía la consulta —que es el que la ficha enseña—, y sólo las semanas
 * y los días necesitan orden propio.
 */
function intoWeeks(tasks: readonly WorkPlanTask[]): WorkPlanWeek[] {
  const byDay = new Map<string, WorkPlanTask[]>()

  for (const task of tasks) {
    const day = task.day as string
    const bucket = byDay.get(day)
    if (bucket) bucket.push(task)
    else byDay.set(day, [task])
  }

  const byWeek = new Map<string, WorkPlanDay[]>()
  for (const day of [...byDay.keys()].sort()) {
    const from = weekStart(day)
    const week = byWeek.get(from)
    const entry: WorkPlanDay = { day, tasks: byDay.get(day) as WorkPlanTask[] }
    if (week) week.push(entry)
    else byWeek.set(from, [entry])
  }

  return [...byWeek.keys()].sort().map((from) => ({
    from,
    to: lastDayOfWeek(from),
    days: byWeek.get(from) as WorkPlanDay[],
  }))
}

function lastDayOfWeek(monday: string): string {
  const date = new Date(`${monday}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 6)
  return dayOf(date)
}

function countByStatus(
  tasks: readonly WorkPlanTaskInput[],
): Readonly<Record<WorkPlanTaskStatus, number>> {
  const counts = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) as Record<
    WorkPlanTaskStatus,
    number
  >

  for (const task of tasks) {
    if (task.status in counts) counts[task.status] += 1
  }

  return counts
}
