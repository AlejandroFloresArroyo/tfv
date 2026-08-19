/**
 * La cola de trabajos en segundo plano.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md` y la rebanada 09. El modelo y el motivo de
 * que la tabla no lleve empresa están en `packages/db/src/schema/jobs.ts` y en la migración `0017`.
 *
 * Este módulo es **sólo la cola**: encolar, tomar el siguiente, dar por bueno y dar por fallido. El
 * despachador —quién ejecuta qué, cuándo se reintenta y cuándo se rinde— vive al lado, en
 * `dispatcher.ts`. Separarlos es lo que permite probar la cola sin ejecutar nada y el despachador
 * sin inventarse una base.
 *
 * ## Todo pasa por la vía de sistema
 *
 * Ninguna sesión de usuario alcanza esta tabla, y eso lo hace cumplir el motor. Aquí se usa
 * `withSystem`, que declara la operación y **no elude las políticas**: si alguien quitara la
 * política de sistema, esto dejaría de funcionar en lugar de seguir funcionando por su cuenta.
 *
 * El alcance de empresas va vacío a propósito: un trabajo no es de ninguna. Los que sí tocan datos
 * de una empresa la declaran al hacerlo, dentro de su propio manejador.
 */

import { newId } from "@tfv/contracts"
import { withSystem } from "@tfv/db"
import { backgroundJobs } from "@tfv/db/schema"
import { and, asc, eq, lt, lte, sql } from "drizzle-orm"

/** El nombre con el que la cola se presenta ante el motor. Aparece en los claims. */
const OPERATION = "trabajos.despachador"

export type JobStatus = "queued" | "running" | "done" | "failed"

export interface JobRecord {
  readonly id: string
  readonly kind: string
  readonly payload: Record<string, unknown>
  readonly status: JobStatus
  readonly runAt: Date
  readonly attempts: number
  readonly maxAttempts: number
  readonly lastError: string | null
  readonly startedAt: Date | null
  readonly finishedAt: Date | null
  readonly dedupeKey: string | null
  readonly createdAt: Date
}

export interface EnqueueInput {
  readonly kind: string
  readonly payload?: Record<string, unknown> | undefined
  /** Cuándo toca. Ausente, ya. */
  readonly runAt?: Date | undefined
  readonly maxAttempts?: number | undefined
  /**
   * Clave de unicidad de lo pendiente.
   *
   * Con ella, encolar un trabajo que ya está esperando o corriendo **no crea otro**: devuelve nulo.
   * Es lo que evita que dos instancias del servicio —o un reinicio— dejen dos recolectores
   * compitiendo por las mismas filas.
   */
  readonly dedupeKey?: string | undefined
}

/**
 * Encola un trabajo. Devuelve nulo si su clave ya tenía uno vivo.
 *
 * La unicidad la garantiza el índice, no una consulta previa: comprobar y luego insertar deja una
 * ventana por la que caben las dos peticiones simultáneas, que es el mismo razonamiento por el que
 * un evento de pago se reclama insertando.
 */
export async function enqueue(input: EnqueueInput): Promise<JobRecord | null> {
  return withSystem(OPERATION, [], async (tx) => {
    const [row] = await tx
      .insert(backgroundJobs)
      .values({
        id: newId(),
        kind: input.kind,
        payload: input.payload ?? {},
        ...(input.runAt ? { runAt: input.runAt } : {}),
        ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
        dedupeKey: input.dedupeKey ?? null,
      })
      .onConflictDoNothing()
      .returning()

    return row ? toRecord(row) : null
  })
}

/**
 * Toma el siguiente trabajo vencido y lo marca como en curso.
 *
 * `for update skip locked` es lo que permite que haya más de un despachador sin que dos tomen el
 * mismo trabajo: el segundo **se salta** la fila bloqueada en lugar de esperarla. Sin `skip locked`
 * dos procesos se serializarían, y con una comprobación en la aplicación en vez del bloqueo los dos
 * ejecutarían el mismo trabajo.
 *
 * El intento se cuenta **al tomarlo**, no al terminar: un proceso que muera a mitad tiene que dejar
 * constancia de que lo intentó, o el trabajo que revienta el servicio lo reintentaría para siempre.
 */
export async function claimNext(now: Date = new Date()): Promise<JobRecord | null> {
  return withSystem(OPERATION, [], async (tx) => {
    // El instante viaja como texto con su conversión escrita: el controlador serializa una fecha de
    // JavaScript en una consulta escrita a mano de otra forma que en una del constructor, y la
    // diferencia sólo se ve al ejecutarla.
    const instante = now.toISOString()

    const rows = await tx.execute<Record<string, unknown>>(sql`
      update background_jobs
         set status = 'running',
             started_at = ${instante}::timestamptz,
             attempts = attempts + 1,
             updated_at = ${instante}::timestamptz
       where id = (
             select id from background_jobs
              where status = 'queued' and run_at <= ${instante}::timestamptz
              order by run_at asc, created_at asc
              limit 1
                for update skip locked
       )
      returning *
    `)

    const row = [...rows][0]
    return row ? fromColumns(row) : null
  })
}

/** El trabajo salió bien. */
export async function markDone(id: string, now: Date = new Date()): Promise<void> {
  await withSystem(OPERATION, [], async (tx) => {
    await tx
      .update(backgroundJobs)
      .set({ status: "done", finishedAt: now, lastError: null, updatedAt: now })
      .where(eq(backgroundJobs.id, id))
  })
}

/**
 * El trabajo falló: o vuelve a la cola con su espera, o se rinde.
 *
 * «Se rindió» es un estado y no un contador agotado escondido en otro sitio, porque es lo único que
 * hay que mirar: una lista de fallos transitorios no la mira nadie.
 */
export async function markFailed(
  id: string,
  error: string,
  retryAt: Date | null,
  now: Date = new Date(),
): Promise<JobRecord | null> {
  return withSystem(OPERATION, [], async (tx) => {
    const [row] = await tx
      .update(backgroundJobs)
      .set(
        retryAt
          ? { status: "queued", runAt: retryAt, lastError: error, updatedAt: now }
          : { status: "failed", finishedAt: now, lastError: error, updatedAt: now },
      )
      .where(eq(backgroundJobs.id, id))
      .returning()

    return row ? toRecord(row) : null
  })
}

/**
 * Devuelve a la cola los trabajos que llevan demasiado tiempo en curso.
 *
 * Un proceso que se cae a mitad deja su trabajo en `running` para siempre, y con clave de unicidad
 * eso además impide que se vuelva a encolar: el recolector dejaría de ejecutarse y nadie lo notaría,
 * porque no hay ningún fallo que mirar. El intento ya está contado, así que un trabajo que revienta
 * el proceso una y otra vez acaba rindiéndose igual.
 */
export async function reclaimStuck(olderThan: Date, now: Date = new Date()): Promise<number> {
  return withSystem(OPERATION, [], async (tx) => {
    const rows = await tx
      .update(backgroundJobs)
      .set({
        status: "queued",
        runAt: now,
        lastError: "Se recuperó de un despachador que no terminó",
        updatedAt: now,
      })
      .where(and(eq(backgroundJobs.status, "running"), lt(backgroundJobs.startedAt, olderThan)))
      .returning({ id: backgroundJobs.id })

    return rows.length
  })
}

/** Los trabajos de un tipo, del más reciente al más antiguo. Para mirar qué ha pasado. */
export async function listJobs(kind?: string, limit = 50): Promise<readonly JobRecord[]> {
  return withSystem(OPERATION, [], async (tx) => {
    const rows = await tx
      .select()
      .from(backgroundJobs)
      .where(kind ? eq(backgroundJobs.kind, kind) : undefined)
      .orderBy(asc(backgroundJobs.runAt))
      .limit(limit)

    return rows.map(toRecord)
  })
}

/** Cuántos hay pendientes y vencidos. Lo usa la comprobación de salud del despachador. */
export async function countDue(now: Date = new Date()): Promise<number> {
  return withSystem(OPERATION, [], async (tx) => {
    const rows = await tx
      .select({ id: backgroundJobs.id })
      .from(backgroundJobs)
      .where(and(eq(backgroundJobs.status, "queued"), lte(backgroundJobs.runAt, now)))

    return rows.length
  })
}

function toRecord(row: typeof backgroundJobs.$inferSelect): JobRecord {
  return {
    id: row.id,
    kind: row.kind,
    payload: row.payload,
    status: row.status,
    runAt: row.runAt,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastError: row.lastError,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    dedupeKey: row.dedupeKey,
    createdAt: row.createdAt,
  }
}

/**
 * La misma fila, cuando viene de SQL escrito a mano.
 *
 * El `update … returning` de arriba no pasa por el constructor de consultas, así que sus columnas
 * vuelven **como las nombra la base**. Mezclar las dos formas deja campos en `undefined` que sólo se
 * notan al serializar, que es el mismo tropiezo que dio la consulta recursiva de las ubicaciones.
 */
function fromColumns(row: Record<string, unknown>): JobRecord {
  return {
    id: String(row.id),
    kind: String(row.kind),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status as JobStatus,
    runAt: new Date(row.run_at as string),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    lastError: (row.last_error as string | null) ?? null,
    startedAt: row.started_at ? new Date(row.started_at as string) : null,
    finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
    dedupeKey: (row.dedupe_key as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
  }
}
