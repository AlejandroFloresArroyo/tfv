/**
 * El despachador: quién ejecuta los trabajos de la cola, cuándo se reintenta y cuándo se rinde.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md`, requisito «La entrega no bloquea ni hace
 * fallar la mutación», y la rebanada 09. La cola en sí está en `queue.ts`.
 *
 * ## Por qué esto existe
 *
 * Había dos piezas escritas, probadas y **sin ejecutar**: el recolector de subidas abandonadas
 * (rebanada 08) y la verificación de coherencia de existencias (rebanada 13, `HALLAZGOS.md` H-11).
 * Las dos son de la clase de trabajo que nadie recuerda pedir a mano, y las dos dejan de servir
 * exactamente por eso: una comprobación que se ejecuta cuando alguien se acuerda no comprueba nada.
 *
 * ## Las tres propiedades que sostienen esto
 *
 * 1. **Un trabajo que falla no se lleva por delante a los demás.** Cada uno se ejecuta dentro de su
 *    propio `try`, y su fallo se escribe en su fila. La tanda sigue.
 * 2. **Los reintentos son acotados y con espera creciente.** Un proveedor caído no se arregla
 *    reintentando cien veces seguidas; y un trabajo que siempre falla tiene que acabar en `failed`,
 *    que es donde alguien lo mira.
 * 3. **Un trabajo sin manejador se rinde a la primera.** No es un fallo transitorio: es que alguien
 *    encoló algo que este servicio no sabe hacer, y reintentarlo cinco veces sólo retrasa el
 *    momento de enterarse.
 *
 * ## Periódicos
 *
 * Un trabajo periódico se declara con `scheduleJob` y se vuelve a encolar **al terminar el
 * anterior**, no con un temporizador propio: así dos que se solapen no pueden existir, y un
 * reinicio a mitad no deja la periodicidad rota. La clave de unicidad de la cola hace el resto.
 */

import { rootLogger } from "../runtime/logger.ts"
import { claimNext, enqueue, type JobRecord, markDone, markFailed, reclaimStuck } from "./queue.ts"

/**
 * Lo que hace un trabajo.
 *
 * Devuelve un resumen legible —«3 archivos recogidos»— que se registra. Un trabajo que no puede
 * decir qué hizo obliga a ir a mirar a la base para saber si hizo algo.
 */
export type JobHandler = (payload: Record<string, unknown>) => Promise<string | void>

export interface RecurringJob {
  readonly kind: string
  /** Cada cuánto vuelve a encolarse, en milisegundos. */
  readonly everyMs: number
  readonly payload?: Record<string, unknown> | undefined
  readonly maxAttempts?: number | undefined
}

const handlers = new Map<string, JobHandler>()
const recurring = new Map<string, RecurringJob>()

/**
 * Declara quién sabe hacer un tipo de trabajo.
 *
 * El registro es explícito, como la tabla de rutas y por lo mismo: en la pila anterior el trabajo en
 * segundo plano no existía, y en cuanto exista la tentación es descubrirlo recorriendo carpetas.
 */
export function registerJob(kind: string, handler: JobHandler): void {
  handlers.set(kind, handler)
}

/** Declara un trabajo periódico. No lo encola: eso lo hace `ensureScheduled`. */
export function scheduleJob(spec: RecurringJob): void {
  recurring.set(spec.kind, spec)
}

/** Lo registrado, para poder mirarlo sin ejecutar nada. */
export function registeredKinds(): readonly string[] {
  return [...handlers.keys()].sort()
}

export function recurringJobs(): readonly RecurringJob[] {
  return [...recurring.values()]
}

/** Sólo para las pruebas: deja el registro como estaba. */
export function resetRegistry(): void {
  handlers.clear()
  recurring.clear()
}

export interface DispatchOptions {
  readonly now?: Date | undefined
  /** Espera del primer reintento. Se dobla en cada intento hasta el techo. */
  readonly backoffMs?: number | undefined
  readonly maxBackoffMs?: number | undefined
}

export type Outcome = "done" | "retry" | "failed" | "unhandled"

export interface RunResult {
  readonly job: JobRecord
  readonly outcome: Outcome
  readonly detail: string
}

/**
 * Toma el siguiente trabajo vencido y lo ejecuta. Nulo si no había ninguno.
 *
 * No lanza: el resultado de un trabajo es un dato, no una excepción del despachador. Si lanzara,
 * el fallo de un trabajo pararía la tanda —que es justo la propiedad que hay que evitar—.
 */
export async function runNext(options: DispatchOptions = {}): Promise<RunResult | null> {
  const now = options.now ?? new Date()
  const job = await claimNext(now)
  if (!job) return null

  const handler = handlers.get(job.kind)

  if (!handler) {
    const detail = `No hay manejador registrado para «${job.kind}»`
    await markFailed(job.id, detail, null, now)
    rootLogger.error("trabajo sin manejador", { trabajo: job.kind, id: job.id })
    await requeueRecurring(job, now)
    return { job, outcome: "unhandled", detail }
  }

  try {
    const summary = (await handler(job.payload)) || "hecho"
    await markDone(job.id, now)
    rootLogger.info("trabajo terminado", {
      trabajo: job.kind,
      id: job.id,
      intento: job.attempts,
      resumen: summary,
    })
    await requeueRecurring(job, now)
    return { job, outcome: "done", detail: summary }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const quedan = job.attempts < job.maxAttempts
    const retryAt = quedan ? new Date(now.getTime() + backoffFor(job.attempts, options)) : null

    await markFailed(job.id, detail, retryAt, now)

    if (quedan) {
      rootLogger.warn("trabajo fallido, se reintenta", {
        trabajo: job.kind,
        id: job.id,
        intento: job.attempts,
        de: job.maxAttempts,
        reintento: retryAt?.toISOString(),
        causa: detail,
      })
      return { job, outcome: "retry", detail }
    }

    rootLogger.error("trabajo agotado: se rinde", {
      trabajo: job.kind,
      id: job.id,
      intentos: job.attempts,
      causa: detail,
    })
    // Un periódico que se rinde no deja de ser periódico: la próxima vuelta empieza de cero. Lo que
    // queda es la fila en `failed`, que es lo que hay que mirar.
    await requeueRecurring(job, now)
    return { job, outcome: "failed", detail }
  }
}

/**
 * Ejecuta lo que haya vencido, uno detrás de otro.
 *
 * En serie a propósito: son trabajos de mantenimiento sobre la misma base, y hacerlos a la vez sólo
 * añade contención a cambio de terminar antes algo que a nadie le corre prisa.
 */
export async function drain(limit = 25, options: DispatchOptions = {}): Promise<RunResult[]> {
  const results: RunResult[] = []

  for (let i = 0; i < limit; i++) {
    const result = await runNext(options)
    if (!result) break
    results.push(result)
  }

  return results
}

/** Encola los periódicos que no tengan ya uno vivo. */
export async function ensureScheduled(runAt?: Date): Promise<number> {
  let encolados = 0

  for (const spec of recurring.values()) {
    const job = await enqueue({
      kind: spec.kind,
      payload: spec.payload ?? {},
      dedupeKey: spec.kind,
      ...(runAt ? { runAt } : {}),
      ...(spec.maxAttempts === undefined ? {} : { maxAttempts: spec.maxAttempts }),
    })
    if (job) encolados++
  }

  return encolados
}

export interface DispatcherOptions extends DispatchOptions {
  /** Cada cuánto se mira la cola. */
  readonly intervalMs: number
  /** A partir de cuánto se da por caído un trabajo que quedó en curso. */
  readonly stuckAfterMs: number
  readonly batch?: number | undefined
}

export interface RunningDispatcher {
  stop(): void
  /** Una vuelta completa, expuesta para poder provocarla sin esperar al reloj. */
  tick(): Promise<RunResult[]>
  /**
   * La primera vuelta, que arranca sola.
   *
   * Se devuelve en lugar de dejarla suelta porque una vuelta en curso hace que la siguiente no
   * haga nada —es lo que evita que se solapen—, y sin poder esperarla no hay forma de saber cuándo
   * el despachador está al día. Una prueba que provocara la suya se encontraría con que la primera
   * todavía corre.
   */
  readonly ready: Promise<RunResult[]>
}

/**
 * Arranca el despachador.
 *
 * No se solapa consigo mismo: mientras una vuelta está en curso, el reloj que salte no hace nada.
 * Sin eso, una vuelta lenta se pisaría con la siguiente y los dos despachadores competirían por los
 * mismos trabajos —lo cual el bloqueo de la cola resuelve, pero pagando contención por nada—.
 */
export function startDispatcher(options: DispatcherOptions): RunningDispatcher {
  let corriendo = false

  const tick = async (): Promise<RunResult[]> => {
    if (corriendo) return []
    corriendo = true

    try {
      const now = options.now ?? new Date()
      const recuperados = await reclaimStuck(new Date(now.getTime() - options.stuckAfterMs), now)
      if (recuperados > 0) {
        rootLogger.warn("trabajos recuperados de un despachador que no terminó", { recuperados })
      }

      await ensureScheduled()
      return await drain(options.batch ?? 25, options)
    } catch (error) {
      // Que la cola no responda no puede tumbar el servicio: la vuelta siguiente lo intentará.
      rootLogger.error("la vuelta del despachador falló entera", {
        causa: error instanceof Error ? error.message : String(error),
      })
      return []
    } finally {
      corriendo = false
    }
  }

  const timer = setInterval(() => void tick(), options.intervalMs)
  // Un temporizador no debe impedir que el proceso termine.
  timer.unref?.()

  return { stop: () => clearInterval(timer), tick, ready: tick() }
}

/**
 * Espera creciente entre reintentos.
 *
 * Doblar en cada intento reparte cinco intentos entre medio minuto y ocho, en lugar de gastarlos
 * todos en el mismo minuto en que el proveedor está caído.
 */
function backoffFor(attempts: number, options: DispatchOptions): number {
  const base = options.backoffMs ?? 30_000
  const techo = options.maxBackoffMs ?? 3_600_000

  return Math.min(base * 2 ** Math.max(0, attempts - 1), techo)
}

/** Un periódico que termina deja encolada su siguiente vuelta. */
async function requeueRecurring(job: JobRecord, now: Date): Promise<void> {
  const spec = recurring.get(job.kind)
  if (!spec) return

  await enqueue({
    kind: spec.kind,
    payload: spec.payload ?? {},
    dedupeKey: spec.kind,
    runAt: new Date(now.getTime() + spec.everyMs),
    ...(spec.maxAttempts === undefined ? {} : { maxAttempts: spec.maxAttempts }),
  })
}
