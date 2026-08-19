/**
 * Cola de trabajos en segundo plano.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md`, requisito «La entrega no bloquea ni hace
 * fallar la mutación», y la rebanada 09.
 *
 * ## Por qué existe una tabla y no un temporizador
 *
 * Hasta ahora había dos cosas escritas y probadas que **nadie ejecutaba**: el recolector de subidas
 * abandonadas (rebanada 08) y la verificación de coherencia de existencias (rebanada 13, hallazgo
 * H-11). Un `setInterval` las llamaría, pero no sabría decir cuándo corrió la última vez, no
 * sobreviviría a un reinicio a mitad de un trabajo, y un fallo se lo llevaría por delante en
 * silencio. La cola es lo que convierte «se ejecuta cada tanto» en algo que se puede mirar.
 *
 * ## Estados, y por qué son cuatro
 *
 * ```
 *   queued ──tomado──> running ──bien──> done
 *      ^                  │
 *      └──quedan intentos─┴──agotados──> failed
 * ```
 *
 * Un trabajo que espera reintento vuelve a `queued`, con `attempts` mayor que cero, `lastError`
 * escrito y `runAt` en el futuro. Es un quinto estado que no hace falta nombrar: la espera se lee
 * en las columnas, y un estado más sería un sitio más donde equivocarse al consultarlo.
 *
 * `failed` significa **se rindió**, no «falló una vez». La diferencia importa porque es lo que hay
 * que mirar: una lista de fallos transitorios no se mira nunca.
 *
 * ## Vía hasta la empresa: ninguna, a propósito
 *
 * Un trabajo no es dato de arrendatario: es infraestructura del servicio. El recolector de archivos
 * abandonados recorre todas las empresas, y la verificación de coherencia nombra un almacén en su
 * carga útil pero no pertenece a nadie. Por eso la tabla no lleva `company_id` y su política **no
 * es de arrendatario sino de sistema**: sólo la alcanzan las transacciones que declaran una
 * operación (`withSystem`) y la administración de plataforma. Ver `drizzle/0017_*.sql`, donde está
 * escrito por qué —igual que `0015` explica por qué la de archivos es `true`—.
 *
 * Que un usuario no pueda escribir aquí no es cosmético: encolar
 * `archivos.recoger-abandonados` con un plazo de cero horas borraría las subidas en curso de todo
 * el mundo.
 */

import { sql } from "drizzle-orm"
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps } from "./_shared.ts"

export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed"])

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: primaryId(),

    /** Qué hay que hacer. El despachador lo resuelve contra su registro de manejadores. */
    kind: varchar("kind", { length: 80 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),

    status: jobStatus("status").notNull().default("queued"),

    /**
     * Cuándo toca.
     *
     * Es lo que hace de esta tabla también un calendario: un trabajo periódico se vuelve a encolar
     * con su siguiente instante, y un reintento con su espera ya sumada.
     */
    runAt: timestamp("run_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),

    attempts: integer("attempts").notNull().default(0),
    /** Reintentos acotados: agotarlos deja el trabajo en `failed` para que alguien lo mire. */
    maxAttempts: integer("max_attempts").notNull().default(5),
    lastError: text("last_error"),

    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),

    /**
     * Clave de unicidad de lo pendiente.
     *
     * Con ella, encolar dos veces el mismo trabajo periódico no crea dos: el índice único parcial
     * convierte la carrera en un conflicto, y el conflicto se ignora. Sin ella, dos instancias del
     * servicio —o un reinicio— dejarían dos recolectores compitiendo por las mismas filas.
     *
     * Nula para los trabajos que sí se piden a mano varias veces.
     */
    dedupeKey: varchar("dedupe_key", { length: 120 }),

    ...timestamps,
  },
  (table) => [
    // Por donde el despachador busca el siguiente: lo pendiente que ya venció.
    index("background_jobs_due_idx").on(table.runAt).where(sql`status = 'queued'`),
    index("background_jobs_kind_idx").on(table.kind, table.createdAt),
    // Un solo trabajo vivo por clave. `running` cuenta: reencolar mientras uno corre lo duplicaría.
    uniqueIndex("background_jobs_dedupe_unique")
      .on(table.dedupeKey)
      .where(sql`dedupe_key is not null and status in ('queued', 'running')`),
  ],
)
