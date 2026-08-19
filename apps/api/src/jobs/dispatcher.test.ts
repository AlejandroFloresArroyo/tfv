/**
 * El despachador de trabajos, contra la cola real.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md` y la rebanada 09.
 *
 * Lo que se comprueba aquí no es que un trabajo se ejecute —eso lo haría cualquier temporizador—,
 * sino **cómo falla**: que reintenta con espera, que se rinde, que un trabajo que revienta no se
 * lleva por delante a los que van detrás, y que dos despachadores no toman el mismo. Una cola que
 * nadie vio fallar no es una cola.
 *
 * El reloj lo pone la prueba. Esperar de verdad a que venza una espera creciente sería una suite de
 * varios minutos que además falla de vez en cuando.
 */

import { closeConnection, db } from "@tfv/db"
import { backgroundJobs } from "@tfv/db/schema"
import { sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import {
  drain,
  ensureScheduled,
  registerJob,
  resetRegistry,
  runNext,
  scheduleJob,
  startDispatcher,
} from "./dispatcher.ts"
import { claimNext, enqueue, listJobs, reclaimStuck } from "./queue.ts"

/**
 * El reloj de la prueba va un minuto por delante del de la base.
 *
 * Un trabajo encolado sin instante vence **cuando la base dice `now()`**, así que un instante fijo
 * escrito a mano lo dejaría siempre en el futuro o siempre en el pasado según el día. Adelantarlo un
 * minuto hace que lo recién encolado esté vencido y que `luego(-…)` siga siendo pasado.
 */
const AHORA = new Date(Date.now() + 60_000)
const luego = (ms: number) => new Date(AHORA.getTime() + ms)

async function reset() {
  await db.execute(sql`truncate table ${backgroundJobs} cascade`)
}

beforeEach(async () => {
  await reset()
  resetRegistry()
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

const jobsDe = async (kind: string) => (await listJobs(kind)).map((job) => job)

describe("encolar", () => {
  it("ejecuta el trabajo y lo deja por hecho, con su resumen", async () => {
    let visto: unknown
    registerJob("prueba.saluda", async (payload) => {
      visto = payload
      return "3 archivos recogidos"
    })

    await enqueue({ kind: "prueba.saluda", payload: { horas: 24 } })
    const result = await runNext({ now: AHORA })

    expect(result?.outcome).toBe("done")
    expect(result?.detail).toBe("3 archivos recogidos")
    expect(visto).toEqual({ horas: 24 })

    const [job] = await jobsDe("prueba.saluda")
    expect(job?.status).toBe("done")
    expect(job?.attempts).toBe(1)
  })

  it("no duplica lo que ya está esperando, cuando lleva clave", async () => {
    // Dos instancias del servicio, o un reinicio, encolarían el mismo periódico dos veces. La
    // unicidad la garantiza el índice, no una consulta previa: comprobar y luego insertar deja una
    // ventana por la que caben las dos.
    const primero = await enqueue({ kind: "prueba.periodico", dedupeKey: "prueba.periodico" })
    const segundo = await enqueue({ kind: "prueba.periodico", dedupeKey: "prueba.periodico" })

    expect(primero).not.toBeNull()
    expect(segundo).toBeNull()
    expect(await jobsDe("prueba.periodico")).toHaveLength(1)
  })

  it("no toma el que todavía no ha vencido", async () => {
    registerJob("prueba.tarde", async () => "no debería correr")
    await enqueue({ kind: "prueba.tarde", runAt: luego(60_000) })

    expect(await runNext({ now: AHORA })).toBeNull()
    expect((await runNext({ now: luego(61_000) }))?.outcome).toBe("done")
  })

  it("dos despachadores no se llevan el mismo trabajo", async () => {
    // `for update skip locked`: el segundo se salta la fila bloqueada en lugar de esperarla.
    await enqueue({ kind: "prueba.uno" })

    const [a, b] = await Promise.all([claimNext(AHORA), claimNext(AHORA)])
    const tomados = [a, b].filter((job) => job !== null)

    expect(tomados).toHaveLength(1)
  })
})

describe("cuando falla", () => {
  it("reintenta con espera y cuenta el intento", async () => {
    let intentos = 0
    registerJob("prueba.frágil", async () => {
      intentos++
      throw new Error("el proveedor no responde")
    })

    await enqueue({ kind: "prueba.frágil", maxAttempts: 3 })

    const primero = await runNext({ now: AHORA, backoffMs: 1_000 })
    expect(primero?.outcome).toBe("retry")
    expect(primero?.detail).toBe("el proveedor no responde")

    const [enEspera] = await jobsDe("prueba.frágil")
    expect(enEspera?.status).toBe("queued")
    expect(enEspera?.attempts).toBe(1)
    expect(enEspera?.lastError).toBe("el proveedor no responde")
    // La espera es lo que separa un reintento de un bucle: el mismo instante no vale.
    expect(enEspera?.runAt.getTime()).toBe(luego(1_000).getTime())

    // Y antes de que venza, no se vuelve a tomar.
    expect(await runNext({ now: luego(500) })).toBeNull()
    expect(intentos).toBe(1)
  })

  it("se rinde al agotar los intentos, y queda dicho por qué", async () => {
    registerJob("prueba.rota", async () => {
      throw new Error("sigue sin responder")
    })

    await enqueue({ kind: "prueba.rota", maxAttempts: 2 })

    expect((await runNext({ now: AHORA, backoffMs: 1 }))?.outcome).toBe("retry")
    const rendido = await runNext({ now: luego(10), backoffMs: 1 })

    expect(rendido?.outcome).toBe("failed")

    const [job] = await jobsDe("prueba.rota")
    expect(job?.status).toBe("failed")
    expect(job?.attempts).toBe(2)
    expect(job?.lastError).toBe("sigue sin responder")
    expect(job?.finishedAt).not.toBeNull()

    // Y ya no se vuelve a tomar: rendirse es un final.
    expect(await runNext({ now: luego(10_000) })).toBeNull()
  })

  it("un trabajo que revienta no se lleva por delante a los demás", async () => {
    const hechos: string[] = []
    registerJob("prueba.revienta", async () => {
      throw new Error("boom")
    })
    registerJob("prueba.sigue", async () => {
      hechos.push("sigue")
      return "bien"
    })

    await enqueue({ kind: "prueba.revienta", runAt: luego(-2_000) })
    await enqueue({ kind: "prueba.sigue", runAt: luego(-1_000) })

    const resultados = await drain(10, { now: AHORA, backoffMs: 60_000 })

    expect(resultados.map((r) => r.outcome)).toEqual(["retry", "done"])
    expect(hechos).toEqual(["sigue"])
  })

  it("un trabajo sin manejador se rinde a la primera", async () => {
    // No es un fallo transitorio: es que alguien encoló algo que este servicio no sabe hacer.
    await enqueue({ kind: "prueba.inventada", maxAttempts: 5 })

    const result = await runNext({ now: AHORA })

    expect(result?.outcome).toBe("unhandled")
    const [job] = await jobsDe("prueba.inventada")
    expect(job?.status).toBe("failed")
    expect(job?.lastError).toContain("No hay manejador")
  })

  it("recupera el que se quedó en curso porque el proceso se cayó", async () => {
    // Con clave de unicidad, un trabajo eternamente «en curso» impide además que se vuelva a
    // encolar: el periódico dejaría de ejecutarse sin que hubiera ningún fallo que mirar.
    registerJob("prueba.colgada", async () => "por fin")
    await enqueue({ kind: "prueba.colgada" })
    await claimNext(AHORA)

    expect(await runNext({ now: luego(60_000) })).toBeNull()

    const recuperados = await reclaimStuck(luego(30_000), luego(60_000))
    expect(recuperados).toBe(1)
    expect((await runNext({ now: luego(60_000) }))?.outcome).toBe("done")

    const [job] = await jobsDe("prueba.colgada")
    // El intento perdido sigue contado: un trabajo que tumba el proceso acaba rindiéndose igual.
    expect(job?.attempts).toBe(2)
  })
})

describe("los periódicos", () => {
  it("se encolan una vez y dejan la siguiente vuelta puesta al terminar", async () => {
    registerJob("prueba.cada.rato", async () => "vuelta")
    scheduleJob({ kind: "prueba.cada.rato", everyMs: 3_600_000 })

    expect(await ensureScheduled(AHORA)).toBe(1)
    // Ya está puesto: la segunda llamada no encola otro.
    expect(await ensureScheduled(AHORA)).toBe(0)

    expect((await runNext({ now: AHORA }))?.outcome).toBe("done")

    const jobs = await jobsDe("prueba.cada.rato")
    expect(jobs).toHaveLength(2)
    const siguiente = jobs.find((job) => job.status === "queued")
    expect(siguiente?.runAt.getTime()).toBe(luego(3_600_000).getTime())
  })

  it("el que se rinde no deja de ser periódico", async () => {
    registerJob("prueba.periodica.rota", async () => {
      throw new Error("no")
    })
    scheduleJob({ kind: "prueba.periodica.rota", everyMs: 60_000, maxAttempts: 1 })

    await ensureScheduled(AHORA)
    expect((await runNext({ now: AHORA }))?.outcome).toBe("failed")

    const jobs = await jobsDe("prueba.periodica.rota")
    expect(jobs.filter((job) => job.status === "failed")).toHaveLength(1)
    expect(jobs.filter((job) => job.status === "queued")).toHaveLength(1)
  })
})

describe("el despachador en marcha", () => {
  it("una vuelta encola los periódicos y ejecuta lo vencido", async () => {
    const hechos: string[] = []
    registerJob("prueba.marcha", async () => {
      hechos.push("una")
      return "hecho"
    })
    scheduleJob({ kind: "prueba.marcha", everyMs: 3_600_000 })

    // Un intervalo largo: la vuelta se provoca a mano, para no depender del reloj.
    const dispatcher = startDispatcher({ intervalMs: 3_600_000, stuckAfterMs: 300_000 })
    try {
      await dispatcher.ready
      expect(hechos).toEqual(["una"])

      // La segunda vuelta no repite: la siguiente está encolada para dentro de una hora.
      await dispatcher.tick()
      expect(hechos).toEqual(["una"])
    } finally {
      dispatcher.stop()
    }
  })
})
