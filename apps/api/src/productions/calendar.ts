/**
 * El calendario de la producción.
 *
 * Ver `openspec/specs/production-workflows/spec.md`, requisitos «Vista de calendario» y «Filtrado de
 * tareas dentro de los planes».
 *
 * ## Qué pinta, y por qué no sólo planes
 *
 * Tres tipos de suceso: **jornadas de rodaje**, **planes de trabajo** y **tareas**. La spec sólo
 * nombra los planes; el calendario los lleva los tres por una razón de oficio, y es la que decide
 * si esta pantalla se usa: un calendario de producción sin los días de rodaje no es el calendario
 * de la producción, es la lista de pendientes del equipo de arte. Quien abre esto quiere ver
 * cuándo se rueda y qué hay que tener listo antes.
 *
 * Por eso la respuesta es **un solo flujo de sucesos fechados, cada uno con su tipo**, y no tres
 * listas que la pantalla tenga que entrelazar. Entrelazar por fecha en el cliente es la vía por la
 * que un día acaba enseñando sus tareas encima de su jornada.
 *
 * ## La fecha la resuelve el servidor, siempre
 *
 * Es la regla que gobierna la superficie, y viene del dueño del producto: **nunca una rejilla
 * vacía**. Sin fecha en la petición, el servidor mira dónde está la acción y responde con la fecha
 * de aterrizaje y **el motivo** —antes del periodo, dentro, después, o sin nada—. El cliente no
 * puede resolverlo solo porque no sabe dónde están los sucesos sin preguntar, y para cuando lo sabe
 * ya pintó el mes equivocado.
 *
 * La resolución en sí es pura y vive en `@tfv/contracts`: aquí sólo se le entregan los días en los
 * que hay algo.
 *
 * ## Los días de aterrizaje se calculan **con los filtros puestos**
 *
 * Si se filtra por un personaje y se resolviera la fecha con todos los sucesos, el calendario
 * aterrizaría en un día donde ese personaje no aparece — una rejilla vacía por otro camino. Los dos
 * recorridos, el de los extremos y el del rango, comparten condiciones a propósito.
 *
 * ## Qué hace cada filtro, y sobre qué
 *
 * Un filtro **actúa sobre los tipos que llevan ese concepto y deja pasar el resto**. El personaje
 * lo llevan las jornadas —por su continuidad— y las tareas; la categoría, sólo las tareas. Un plan
 * de trabajo no tiene ni una cosa ni la otra, así que sigue apareciendo: esconderlo escondería la
 * jornada de trabajo entera por filtrar un departamento.
 *
 * ## La jornada de rodaje no tiene fecha propia, y eso se nota
 *
 * `production_recordings` **no tiene columna de fecha programada**: sólo `created_at`. Así que en el
 * calendario una jornada cae en el día en que se dio de alta, que es lo único que hay. No es lo que
 * la pantalla promete y está anotado (`HALLAZGOS.md` H-220); cerrarlo es una migración.
 */

import {
  type CalendarLanding,
  type CalendarView,
  calendarRange,
  dayOf,
  endOfDay,
  landingOf,
  sceneLabel,
  startOfDay,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import {
  productionCategories,
  productionChapters,
  productionCharacters,
  productionContinuities,
  productionRecordings,
  productionScenes,
  productionTasks,
  productionWorkflows,
  users,
} from "@tfv/db/schema"
import { and, asc, eq, exists, gte, inArray, isNull, lte, type SQL } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { loadProduction } from "./productions.ts"

/** Los tres tipos de suceso que caben en el calendario de una producción. */
export const CALENDAR_KINDS = ["recording", "workflow", "task"] as const

export type CalendarKind = (typeof CALENDAR_KINDS)[number]

/**
 * Un suceso fechado del calendario.
 *
 * Los campos que no aplican a un tipo llegan nulos en lugar de ausentes: la pantalla pinta una sola
 * clase de tarjeta con lo que tenga, y un campo que a veces no está obliga a escribir tres.
 */
export interface CalendarEvent {
  readonly kind: CalendarKind
  readonly id: string
  /** Día civil `AAAA-MM-DD`, en tiempo universal. Es por el que se agrupa la rejilla. */
  readonly day: string
  readonly startsAt: Date | null
  readonly endsAt: Date | null
  readonly title: string
  /** El estado propio de su tipo. Cada uno tiene los suyos y no se mezclan. */
  readonly status: string
  /** El plan al que pertenece una tarea. Nulo en los otros dos tipos. */
  readonly workflowId: string | null
  readonly sceneId: string | null
  /** `capítulo.escena`, la etiqueta que identifica la escena en la producción entera. */
  readonly sceneLabel: string | null
  readonly categoryId: string | null
  readonly categoryName: string | null
  readonly characterId: string | null
  readonly characterName: string | null
  readonly responsibleName: string | null
}

export interface CalendarFilters {
  /** Actúa sobre las jornadas y las tareas. Los planes pasan. */
  readonly characterId?: string | undefined
  /** Actúa sobre las tareas. Las jornadas y los planes pasan. */
  readonly categoryId?: string | undefined
  /** Qué tipos se piden. Ausente son los tres. */
  readonly kinds?: readonly CalendarKind[] | undefined
}

export interface CalendarRequest extends CalendarFilters {
  readonly view: CalendarView
  /** Día civil pedido. Ausente: lo resuelve el servidor. */
  readonly date?: string | undefined
  /** Hoy, para resolver el aterrizaje. Se inyecta para que la prueba pueda fijarlo. */
  readonly today?: string | undefined
}

export interface CalendarResult {
  readonly view: CalendarView
  readonly landing: CalendarLanding
  readonly range: { readonly from: string; readonly to: string }
  readonly events: readonly CalendarEvent[]
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function productionCalendar(
  actor: Actor,
  companyId: string,
  productionId: string,
  request: CalendarRequest,
): Promise<CalendarResult> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const today = request.today ?? dayOf(new Date())

    /**
     * Con fecha pedida no se busca dónde aterrizar, pero **sí se dice qué se encontró**.
     *
     * El motivo viaja igual: una semana compartida por enlace que cae fuera del rodaje tiene que
     * poder decir «esto es después de todo lo programado» en vez de enseñar siete casillas vacías.
     */
    const days = await eventDays(tx, productionId, request)
    const landing =
      request.date === undefined
        ? landingOf(days, today)
        : { ...landingOf(days, request.date), date: request.date }

    const range = calendarRange(request.view, landing.date)
    const events = await eventsIn(tx, productionId, range, request)

    return { view: request.view, landing, range, events }
  })
}

/**
 * Los días en los que hay algo, con los filtros puestos.
 *
 * Se traen los días y no los sucesos: para decidir dónde aterrizar hacen falta los extremos y el
 * más cercano, y eso es una lista de fechas. Traerse la producción entera para quedarse con tres
 * valores es lo que hace lenta una pantalla que se abre todos los días.
 */
async function eventDays(
  tx: Transaction,
  productionId: string,
  filters: CalendarFilters,
): Promise<string[]> {
  const kinds = filters.kinds ?? CALENDAR_KINDS
  const days: string[] = []

  if (kinds.includes("recording")) {
    const rows = await tx
      .selectDistinct({ at: productionRecordings.createdAt })
      .from(productionRecordings)
      .where(and(recordingScope(productionId), characterOfRecording(tx, filters)))

    for (const row of rows) days.push(dayOf(row.at))
  }

  if (kinds.includes("workflow")) {
    const rows = await tx
      .selectDistinct({ at: productionWorkflows.scheduledFor })
      .from(productionWorkflows)
      .where(workflowScopeOf(productionId))

    for (const row of rows) if (row.at !== null) days.push(dayOf(row.at))
  }

  if (kinds.includes("task")) {
    const rows = await tx
      .selectDistinct({ at: productionTasks.scheduledFor })
      .from(productionTasks)
      .innerJoin(productionWorkflows, eq(productionWorkflows.id, productionTasks.workflowId))
      .where(and(taskScopeOf(productionId), taskFilters(filters)))

    for (const row of rows) if (row.at !== null) days.push(dayOf(row.at))
  }

  return days
}

/** Los sucesos que caen dentro del rango, ya mezclados y ordenados por día. */
async function eventsIn(
  tx: Transaction,
  productionId: string,
  range: { from: string; to: string },
  filters: CalendarFilters,
): Promise<CalendarEvent[]> {
  const kinds = filters.kinds ?? CALENDAR_KINDS
  const from = startOfDay(range.from)
  const to = endOfDay(range.to)
  const events: CalendarEvent[] = []

  if (kinds.includes("recording")) {
    const rows = await tx
      .select({
        id: productionRecordings.id,
        name: productionRecordings.name,
        status: productionRecordings.status,
        at: productionRecordings.createdAt,
        sceneId: productionRecordings.sceneId,
        sceneIndex: productionScenes.index,
        chapterIndex: productionChapters.index,
        responsibleName: users.name,
        responsibleLastname: users.lastname,
      })
      .from(productionRecordings)
      .leftJoin(productionScenes, eq(productionScenes.id, productionRecordings.sceneId))
      .leftJoin(productionChapters, eq(productionChapters.id, productionScenes.chapterId))
      .leftJoin(users, eq(users.id, productionRecordings.responsibleId))
      .where(
        and(
          recordingScope(productionId),
          gte(productionRecordings.createdAt, from),
          lte(productionRecordings.createdAt, to),
          characterOfRecording(tx, filters),
        ),
      )
      .orderBy(asc(productionRecordings.createdAt))

    for (const row of rows) {
      events.push({
        kind: "recording",
        id: row.id,
        day: dayOf(row.at),
        startsAt: row.at,
        endsAt: null,
        title: row.name,
        status: row.status,
        workflowId: null,
        sceneId: row.sceneId,
        sceneLabel: labelOf(row.chapterIndex, row.sceneIndex),
        categoryId: null,
        categoryName: null,
        characterId: null,
        characterName: null,
        responsibleName: nameOf(row.responsibleName, row.responsibleLastname),
      })
    }
  }

  if (kinds.includes("workflow")) {
    const rows = await tx
      .select({
        id: productionWorkflows.id,
        code: productionWorkflows.code,
        observations: productionWorkflows.observations,
        status: productionWorkflows.status,
        at: productionWorkflows.scheduledFor,
        endsAt: productionWorkflows.endsAt,
        sceneId: productionWorkflows.sceneId,
        sceneIndex: productionScenes.index,
        chapterIndex: productionChapters.index,
        responsibleName: users.name,
        responsibleLastname: users.lastname,
      })
      .from(productionWorkflows)
      .leftJoin(productionScenes, eq(productionScenes.id, productionWorkflows.sceneId))
      .leftJoin(productionChapters, eq(productionChapters.id, productionScenes.chapterId))
      .leftJoin(users, eq(users.id, productionWorkflows.responsibleId))
      .where(
        and(
          workflowScopeOf(productionId),
          gte(productionWorkflows.scheduledFor, from),
          lte(productionWorkflows.scheduledFor, to),
        ),
      )
      .orderBy(asc(productionWorkflows.scheduledFor))

    for (const row of rows) {
      if (row.at === null) continue
      events.push({
        kind: "workflow",
        id: row.id,
        day: dayOf(row.at),
        startsAt: row.at,
        endsAt: row.endsAt,
        // El plan no tiene nombre en el modelo (`HALLAZGOS.md` H-110): lo identifica su código, y
        // las observaciones son lo único escrito a mano que puede acompañarlo.
        title: row.observations.trim() === "" ? row.code : row.observations,
        status: row.status,
        workflowId: row.id,
        sceneId: row.sceneId,
        sceneLabel: labelOf(row.chapterIndex, row.sceneIndex),
        categoryId: null,
        categoryName: null,
        characterId: null,
        characterName: null,
        responsibleName: nameOf(row.responsibleName, row.responsibleLastname),
      })
    }
  }

  if (kinds.includes("task")) {
    const rows = await tx
      .select({
        id: productionTasks.id,
        workflowId: productionTasks.workflowId,
        title: productionTasks.title,
        status: productionTasks.status,
        at: productionTasks.scheduledFor,
        endsAt: productionTasks.endsAt,
        categoryId: productionTasks.categoryId,
        categoryName: productionCategories.name,
        characterId: productionTasks.characterId,
        characterName: productionCharacters.name,
        responsibleName: users.name,
        responsibleLastname: users.lastname,
      })
      .from(productionTasks)
      .innerJoin(productionWorkflows, eq(productionWorkflows.id, productionTasks.workflowId))
      .leftJoin(productionCategories, eq(productionCategories.id, productionTasks.categoryId))
      .leftJoin(productionCharacters, eq(productionCharacters.id, productionTasks.characterId))
      .leftJoin(users, eq(users.id, productionTasks.responsibleId))
      .where(
        and(
          taskScopeOf(productionId),
          gte(productionTasks.scheduledFor, from),
          lte(productionTasks.scheduledFor, to),
          taskFilters(filters),
        ),
      )
      .orderBy(asc(productionTasks.scheduledFor))

    for (const row of rows) {
      if (row.at === null) continue
      events.push({
        kind: "task",
        id: row.id,
        day: dayOf(row.at),
        startsAt: row.at,
        endsAt: row.endsAt,
        title: row.title,
        status: row.status,
        workflowId: row.workflowId,
        sceneId: null,
        sceneLabel: null,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        characterId: row.characterId,
        characterName: row.characterName,
        responsibleName: nameOf(row.responsibleName, row.responsibleLastname),
      })
    }
  }

  /**
   * Un solo orden para los tres tipos.
   *
   * Por día, y dentro del día **jornada, plan y tarea**: es el orden del oficio —qué se rueda, qué
   * plan lo sostiene, qué hay que hacer— y no el alfabético del tipo, que pondría la tarea primero.
   */
  const rank: Record<CalendarKind, number> = { recording: 0, workflow: 1, task: 2 }
  return events.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      rank[a.kind] - rank[b.kind] ||
      (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  )
}

// ─── Planes con sus tareas filtradas ─────────────────────────────────────────

export interface PlanWithTasks {
  readonly id: string
  readonly code: string
  readonly observations: string
  readonly status: string
  readonly scheduledFor: Date | null
  readonly sceneId: string | null
  readonly tasks: readonly {
    readonly id: string
    readonly title: string
    readonly status: string
    readonly categoryId: string | null
    readonly characterId: string | null
    readonly scheduledFor: Date | null
  }[]
}

/**
 * Los planes de una producción, **cada uno sólo con las tareas que cumplen el filtro**.
 *
 * Es el requisito «Filtrado de tareas dentro de los planes» al pie de la letra, incluido el remate
 * que lo hace útil: **los planes sin tareas coincidentes no aparecen**. Filtrar por «Vestuario» y
 * seguir viendo doce planes vacíos es no haber filtrado.
 *
 * Es otra pregunta que la del calendario, y por eso es otra función. Allí un filtro deja pasar lo
 * que no lleva el concepto, porque se está mirando el día entero; aquí se está preguntando
 * exactamente «qué planes tocan a este departamento», y la respuesta correcta es una lista corta.
 */
export async function plansWithTasks(
  actor: Actor,
  companyId: string,
  productionId: string,
  filters: { readonly categoryId?: string | undefined; readonly characterId?: string | undefined },
): Promise<readonly PlanWithTasks[]> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const rows = await tx
      .select({
        id: productionTasks.id,
        workflowId: productionTasks.workflowId,
        title: productionTasks.title,
        status: productionTasks.status,
        categoryId: productionTasks.categoryId,
        characterId: productionTasks.characterId,
        scheduledFor: productionTasks.scheduledFor,
      })
      .from(productionTasks)
      .innerJoin(productionWorkflows, eq(productionWorkflows.id, productionTasks.workflowId))
      .where(and(taskScopeOf(productionId), taskFilters(filters)))
      .orderBy(asc(productionTasks.scheduledFor), asc(productionTasks.id))

    const byWorkflow = new Map<string, PlanWithTasks["tasks"][number][]>()
    for (const row of rows) {
      const bucket = byWorkflow.get(row.workflowId)
      const task = {
        id: row.id,
        title: row.title,
        status: row.status,
        categoryId: row.categoryId,
        characterId: row.characterId,
        scheduledFor: row.scheduledFor,
      }
      if (bucket) bucket.push(task)
      else byWorkflow.set(row.workflowId, [task])
    }

    // Sin tareas coincidentes no hay planes que devolver, y tampoco consulta que hacer.
    const workflowIds = [...byWorkflow.keys()]
    if (workflowIds.length === 0) return []

    const plans = await tx
      .select()
      .from(productionWorkflows)
      .where(and(workflowScopeOf(productionId), inArray(productionWorkflows.id, workflowIds)))
      .orderBy(asc(productionWorkflows.scheduledFor), asc(productionWorkflows.id))

    return plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      observations: plan.observations,
      status: plan.status,
      scheduledFor: plan.scheduledFor,
      sceneId: plan.sceneId,
      tasks: byWorkflow.get(plan.id) ?? [],
    }))
  })
}

// ─── Condiciones compartidas ─────────────────────────────────────────────────

function recordingScope(productionId: string): SQL | undefined {
  return and(
    eq(productionRecordings.productionId, productionId),
    isNull(productionRecordings.deletedAt),
  )
}

function workflowScopeOf(productionId: string): SQL | undefined {
  return and(
    eq(productionWorkflows.productionId, productionId),
    isNull(productionWorkflows.deletedAt),
  )
}

/**
 * Una tarea pertenece a la producción **a través de su plan**.
 *
 * Y el plan tiene que estar vivo: las tareas de un plan dado de baja no aparecen en el calendario
 * aunque su propia fila siga sin marcar. Es lo que hace que eliminar un plan se lleve por delante
 * lo que cuelga sin recorrer nada.
 */
function taskScopeOf(productionId: string): SQL | undefined {
  return and(
    eq(productionWorkflows.productionId, productionId),
    isNull(productionWorkflows.deletedAt),
    isNull(productionTasks.deletedAt),
  )
}

/** Categoría y personaje, los dos que una tarea sí lleva. */
function taskFilters(filters: {
  readonly categoryId?: string | undefined
  readonly characterId?: string | undefined
}): SQL | undefined {
  const conditions: (SQL | undefined)[] = []
  if (filters.categoryId !== undefined) {
    conditions.push(eq(productionTasks.categoryId, filters.categoryId))
  }
  if (filters.characterId !== undefined) {
    conditions.push(eq(productionTasks.characterId, filters.characterId))
  }
  return conditions.length === 0 ? undefined : and(...conditions)
}

/**
 * El personaje de una jornada, que es el de alguna de sus continuidades.
 *
 * Un `exists` y no un `join`: una jornada con tres continuidades del mismo personaje aparecería
 * tres veces en la rejilla, y el calendario acabaría enseñando el mismo día de rodaje repetido.
 *
 * Recibe la transacción porque la subconsulta se **construye** con el mismo constructor que la
 * ejecuta: la que lleva el actor y sus políticas.
 */
function characterOfRecording(tx: Transaction, filters: CalendarFilters): SQL | undefined {
  if (filters.characterId === undefined) return undefined

  return exists(
    tx
      .select({ one: productionContinuities.id })
      .from(productionContinuities)
      .where(
        and(
          eq(productionContinuities.recordingId, productionRecordings.id),
          eq(productionContinuities.characterId, filters.characterId),
        ),
      ),
  )
}

function labelOf(chapterIndex: number | null, sceneIndex: number | null): string | null {
  if (chapterIndex === null || sceneIndex === null) return null
  return sceneLabel(chapterIndex, sceneIndex)
}

function nameOf(name: string | null, lastname: string | null): string | null {
  if (name === null && lastname === null) return null
  const full = [name ?? "", lastname ?? ""].join(" ").trim()
  return full === "" ? null : full
}
