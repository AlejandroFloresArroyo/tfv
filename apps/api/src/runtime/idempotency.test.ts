/**
 * Idempotencia, de extremo a extremo.
 *
 * Transcritas de los dos escenarios de `openspec/specs/api-conventions/spec.md`, requisito «Las
 * mutaciones de dinero son idempotentes», más lo que los escenarios dan por supuesto y no dicen:
 * que la clave es **de quien la puso**, que dos peticiones simultáneas no se cuelan las dos, y que
 * una operación que falló se puede volver a intentar.
 *
 * La ruta de prueba existe por lo mismo que la de `authorization.test.ts`: lo que se comprueba es
 * el mecanismo del motor, y atarlo a una ruta de dominio lo dejaría a merced de lo que esa ruta
 * haga. El efecto observable es un contador — sin él, «responde lo mismo» no distingue entre «no se
 * ejecutó» y «se ejecutó dos veces y devolvió lo mismo por casualidad».
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { z } from "@hono/zod-openapi"
import { IDEMPOTENCY_IN_FLIGHT, IDEMPOTENCY_MISMATCH, newId } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  idempotencyKeys,
  loginAttempts,
  notificationDeliveries,
  roles,
  sessions,
  users,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createApp } from "./app.ts"
import { sweepIdempotencyKeys } from "./idempotency.ts"
import { AUTHENTICATED, defineRoute, PUBLIC } from "./route.ts"

// ─── Ruta de prueba ──────────────────────────────────────────────────────────

/** Cuántas veces corrió el manejador de verdad. Es el «no se ha creado un segundo pedido». */
let ejecuciones = 0

/**
 * Barrera para detener el manejador dentro de la petición.
 *
 * Es lo que hace **determinista** la prueba de concurrencia: sin ella, la segunda petición puede
 * llegar antes o después de que la primera termine, y la prueba comprobaría a veces la repetición y
 * a veces el «todavía en curso». Aquí se elige cuál.
 */
let barrera: { promesa: Promise<void>; abrir: () => void } | null = null

function levantarBarrera() {
  let abrir = () => {}
  const promesa = new Promise<void>((resolve) => {
    abrir = resolve
  })
  barrera = { promesa, abrir }
  return barrera
}

const cobrar = defineRoute({
  access: AUTHENTICATED,
  idempotent: true,
  config: {
    method: "post",
    path: "/probe/cobros",
    summary: "Ruta de prueba de idempotencia",
    tags: ["Prueba"],
    request: {
      body: {
        content: { "application/json": { schema: z.object({ amount: z.string() }) } },
      },
    },
    responses: {
      201: {
        description: "Cobrado",
        content: {
          "application/json": {
            schema: z.object({ id: z.string(), amount: z.string() }),
          },
        },
      },
      422: {
        description: "No se pudo cobrar",
        content: { "application/json": { schema: z.object({ statusCode: z.number() }) } },
      },
    },
  },
  handler: async (c) => {
    ejecuciones += 1
    const { amount } = c.req.valid("json")

    // Un fallo de dominio, para comprobar que un error **no** se guarda como resultado.
    if (amount === "0.00") return c.json({ statusCode: 422 }, 422)

    if (barrera) await barrera.promesa

    return c.json({ id: newId() as string, amount }, 201)
  },
})

/** La misma operación colgando de una empresa: sirve para comprobar el alcance de la clave. */
const cobrarEnEmpresa = defineRoute({
  access: AUTHENTICATED,
  idempotent: true,
  config: {
    method: "post",
    path: "/probe/companies/{companyId}/cobros",
    summary: "Ruta de prueba de idempotencia con empresa",
    tags: ["Prueba"],
    request: {
      params: z.object({ companyId: z.string() }),
      body: { content: { "application/json": { schema: z.object({ amount: z.string() }) } } },
    },
    responses: {
      201: {
        description: "Cobrado",
        content: {
          "application/json": { schema: z.object({ id: z.string(), amount: z.string() }) },
        },
      },
    },
  },
  handler: (c) => {
    ejecuciones += 1
    return c.json({ id: newId() as string, amount: c.req.valid("json").amount }, 201)
  },
})

/** Otro endpoint dentro del mismo alcance: la misma clave aquí tiene que leerse como otra petición. */
const reembolsarEnEmpresa = defineRoute({
  access: AUTHENTICATED,
  idempotent: true,
  config: {
    method: "post",
    path: "/probe/companies/{companyId}/reembolsos",
    summary: "Otra ruta de prueba dentro del mismo alcance",
    tags: ["Prueba"],
    request: {
      params: z.object({ companyId: z.string() }),
      body: { content: { "application/json": { schema: z.object({ amount: z.string() }) } } },
    },
    responses: {
      201: {
        description: "Reembolsado",
        content: {
          "application/json": { schema: z.object({ id: z.string(), amount: z.string() }) },
        },
      },
    },
  },
  handler: (c) => {
    ejecuciones += 1
    return c.json({ id: newId() as string, amount: c.req.valid("json").amount }, 201)
  },
})

const app = createApp([cobrar, cobrarEnEmpresa, reembolsarEnEmpresa])

// ─── Andamiaje ───────────────────────────────────────────────────────────────

const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  ejecuciones = 0
  barrera = null
  await db.execute(
    sql`truncate table ${idempotencyKeys}, ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companies} cascade`,
  )
}

beforeEach(reset)
afterAll(async () => {
  await reset()
  await closeConnection()
})

const fullApp = await (async () => {
  const { routes } = await import("../routes/index.ts")
  return createApp(routes)
})()

async function signIn(email: string): Promise<string> {
  await fullApp.request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, name: "Prueba" }),
  })

  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const response = await fullApp.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  })

  const cookie = response.headers.getSetCookie().find((raw) => raw.startsWith("tfv_session="))
  if (!cookie) throw new Error("no se abrió sesión")
  return cookie.split(";")[0] ?? ""
}

interface Peticion {
  readonly cookie: string
  readonly key?: string | undefined
  readonly body?: unknown
  readonly path?: string | undefined
}

function cobro({ cookie, key, body = { amount: "100.00" }, path = "/probe/cobros" }: Peticion) {
  return app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
  })
}

async function leer<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

/** La columna lleva clave foránea, así que la empresa del alcance tiene que existir de verdad. */
async function empresa(): Promise<string> {
  const id = newId() as string
  await db.insert(companies).values({ id, name: `Empresa ${id.slice(0, 8)}` })
  return id
}

// ─── Los dos escenarios de la spec ───────────────────────────────────────────

describe("las mutaciones son idempotentes", () => {
  it("«Un reintento no duplica el efecto»", async () => {
    const cookie = await signIn("reintento@ejemplo.mx")
    const key = `clave-${newId()}`

    const primera = await cobro({ cookie, key })
    const segunda = await cobro({ cookie, key })

    expect(primera.status).toBe(201)
    expect(segunda.status).toBe(201)
    expect(await leer(segunda)).toEqual(await leer(primera))
    expect(ejecuciones).toBe(1)
  })

  it("«La misma clave con otro cuerpo se rechaza»", async () => {
    const cookie = await signIn("otrocuerpo@ejemplo.mx")
    const key = `clave-${newId()}`

    await cobro({ cookie, key })
    const segunda = await cobro({ cookie, key, body: { amount: "999.00" } })

    expect(segunda.status).toBe(409)
    expect(await leer<{ error: string }>(segunda)).toMatchObject({ error: IDEMPOTENCY_MISMATCH })
    expect(ejecuciones).toBe(1)
  })
})

// ─── Lo que los escenarios dan por supuesto ──────────────────────────────────

describe("la clave es de quien la puso", () => {
  /**
   * La comprobación que justifica que la tabla lleve actor y empresa.
   *
   * Se guarda un **cuerpo de respuesta ya calculado**. Con una clave global, quien acertara la de
   * otro recibiría su respuesta: importes y datos de otra empresa servidos por el mecanismo que
   * existe para que nadie pague dos veces.
   */
  it("repetir la clave de otro no devuelve su resultado", async () => {
    const ana = await signIn("ana@ejemplo.mx")
    const beto = await signIn("beto@ejemplo.mx")
    const key = `clave-${newId()}`

    const suya = await leer<{ id: string }>(await cobro({ cookie: ana, key }))
    const mia = await leer<{ id: string }>(await cobro({ cookie: beto, key }))

    // No es que le devuelva otra cosa: es que para Beto esa clave no existe y su petición corre.
    expect(mia.id).not.toBe(suya.id)
    expect(ejecuciones).toBe(2)
  })

  it("la misma clave en dos empresas son dos claves", async () => {
    const cookie = await signIn("dosempresas@ejemplo.mx")
    const key = `clave-${newId()}`
    const unaEmpresa = await empresa()
    const otraEmpresa = await empresa()

    const una = await leer<{ id: string }>(
      await cobro({ cookie, key, path: `/probe/companies/${unaEmpresa}/cobros` }),
    )
    const otra = await leer<{ id: string }>(
      await cobro({ cookie, key, path: `/probe/companies/${otraEmpresa}/cobros` }),
    )

    expect(otra.id).not.toBe(una.id)
    expect(ejecuciones).toBe(2)
  })

  it("la misma clave en el mismo camino y la misma empresa sí es la misma", async () => {
    const cookie = await signIn("mismaempresa@ejemplo.mx")
    const key = `clave-${newId()}`
    const path = `/probe/companies/${await empresa()}/cobros`

    const una = await leer<{ id: string }>(await cobro({ cookie, key, path }))
    const otra = await leer<{ id: string }>(await cobro({ cookie, key, path }))

    expect(otra.id).toBe(una.id)
    expect(ejecuciones).toBe(1)
  })

  it("la misma clave en dos endpoints del mismo alcance se rechaza", async () => {
    // El camino va dentro de la huella. Sin eso, la respuesta de un endpoint se serviría a quien
    // llamó a otro — que es la misma fuga, cometida por el mismo actor sin querer.
    const cookie = await signIn("dosrutas@ejemplo.mx")
    const key = `clave-${newId()}`
    const laEmpresa = await empresa()

    await cobro({ cookie, key, path: `/probe/companies/${laEmpresa}/cobros` })
    const otra = await cobro({ cookie, key, path: `/probe/companies/${laEmpresa}/reembolsos` })

    expect(otra.status).toBe(409)
    expect(await leer<{ error: string }>(otra)).toMatchObject({ error: IDEMPOTENCY_MISMATCH })
    expect(ejecuciones).toBe(1)
  })
})

describe("qué se guarda y qué no", () => {
  it("una operación que falló se puede volver a intentar", async () => {
    // Guardar el error y repetirlo para siempre convertiría un fallo pasajero en uno permanente:
    // la clave quedaría quemada y el cliente sin forma de completar lo que quería hacer.
    const cookie = await signIn("fallo@ejemplo.mx")
    const key = `clave-${newId()}`

    const primera = await cobro({ cookie, key, body: { amount: "0.00" } })
    expect(primera.status).toBe(422)

    const segunda = await cobro({ cookie, key, body: { amount: "0.00" } })
    expect(segunda.status).toBe(422)
    expect(ejecuciones).toBe(2)
  })

  it("del cuerpo de entrada sólo se guarda la huella", async () => {
    const cookie = await signIn("huella@ejemplo.mx")
    const key = `clave-${newId()}`
    await cobro({ cookie, key, body: { amount: "100.00", tarjeta: "4111111111111111" } })

    const [fila] = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key))

    expect(fila).toBeDefined()
    expect(JSON.stringify(fila)).not.toContain("4111111111111111")
    expect(fila?.fingerprint).toHaveLength(64)
  })

  it("sin clave, el mecanismo no se mete en medio", async () => {
    const cookie = await signIn("sinclave@ejemplo.mx")

    await cobro({ cookie })
    await cobro({ cookie })

    expect(ejecuciones).toBe(2)
    expect(await db.select().from(idempotencyKeys)).toHaveLength(0)
  })
})

describe("la retención", () => {
  it("una clave vencida deja de repetir la respuesta", async () => {
    const cookie = await signIn("vencida@ejemplo.mx")
    const key = `clave-${newId()}`

    const primera = await leer<{ id: string }>(await cobro({ cookie, key }))

    await db
      .update(idempotencyKeys)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(idempotencyKeys.key, key))

    const segunda = await leer<{ id: string }>(await cobro({ cookie, key }))

    // Vencida es inexistente: la clave se puede volver a usar y la petición corre de nuevo.
    expect(segunda.id).not.toBe(primera.id)
    expect(ejecuciones).toBe(2)
  })

  it("el barrido se lleva lo vencido y lo que quedó reclamado sin terminar", async () => {
    const cookie = await signIn("barrido@ejemplo.mx")

    // Una terminada y vencida.
    await cobro({ cookie, key: `vencida-${newId()}` })
    // Otra terminada y vigente.
    await cobro({ cookie, key: `vigente-${newId()}` })

    const [vencida, vigente] = await db
      .select()
      .from(idempotencyKeys)
      .orderBy(idempotencyKeys.createdAt)

    await db
      .update(idempotencyKeys)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(idempotencyKeys.id, vencida?.id as string))

    // Y una reclamada que nadie terminó, con la edad de un proceso que se cayó.
    const abandonada = newId() as string
    await db.insert(idempotencyKeys).values({
      id: abandonada,
      key: `abandonada-${newId()}`,
      actorId: vigente?.actorId as string,
      companyId: null,
      endpoint: "POST /probe/cobros",
      fingerprint: "0".repeat(64),
      expiresAt: new Date(Date.now() + 3_600_000),
      createdAt: new Date(Date.now() - 600_000),
    })

    const borradas = await sweepIdempotencyKeys(300_000)

    expect(borradas).toBe(2)
    const quedan = await db.select({ id: idempotencyKeys.id }).from(idempotencyKeys)
    expect(quedan.map((fila) => fila.id)).toEqual([vigente?.id])
  })
})

describe("la concurrencia", () => {
  it("la repetición que llega antes de que la primera termine no se ejecuta", async () => {
    // La unicidad la garantiza el índice de la base, no una comprobación previa: entre mirar y
    // escribir cabe la otra petición, y las dos cobrarían.
    const cookie = await signIn("carrera@ejemplo.mx")
    const key = `clave-${newId()}`
    const puerta = levantarBarrera()

    const primera = cobro({ cookie, key })
    await vi.waitUntil(() => ejecuciones === 1)

    const segunda = await cobro({ cookie, key })

    expect(segunda.status).toBe(409)
    expect(await leer<{ error: string }>(segunda)).toMatchObject({ error: IDEMPOTENCY_IN_FLIGHT })

    puerta.abrir()
    expect((await primera).status).toBe(201)
    expect(ejecuciones).toBe(1)
  })

  it("dos peticiones a la vez producen un solo efecto", async () => {
    // Sin barrera: la carrera se resuelve como se resuelva —repetición o «en curso»—, lo que no
    // puede pasar es que el manejador corra dos veces.
    const cookie = await signIn("carrera2@ejemplo.mx")
    const key = `clave-${newId()}`

    const [una, otra] = await Promise.all([cobro({ cookie, key }), cobro({ cookie, key })])

    expect(ejecuciones).toBe(1)
    expect([una.status, otra.status].sort()).toEqual(expect.arrayContaining([201]))
    expect([201, 409]).toContain(una.status)
    expect([201, 409]).toContain(otra.status)
  })
})

describe("la clave que llega mal", () => {
  it("una clave demasiado corta se rechaza con 400 y sin efecto", async () => {
    const cookie = await signIn("corta@ejemplo.mx")

    const response = await cobro({ cookie, key: "abc" })

    expect(response.status).toBe(400)
    expect(ejecuciones).toBe(0)
  })
})

describe("sobre una ruta de verdad", () => {
  /**
   * `POST /companies`, que es donde se enchufó primero.
   *
   * Con la sonda se comprueba el mecanismo; con esto, que el mecanismo llega hasta una ruta que
   * escribe de verdad — que es lo que no se puede dar por hecho.
   */
  it("crear una empresa dos veces con la misma clave crea una", async () => {
    const cookie = await signIn("empresa@ejemplo.mx")
    const key = `clave-${newId()}`

    const cuerpo = JSON.stringify({ name: "Renta Fílmica del Norte" })
    const enviar = () =>
      fullApp.request("/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          "Idempotency-Key": key,
        },
        body: cuerpo,
      })

    const primera = await leer<{ id: string }>(await enviar())
    const segunda = await leer<{ id: string }>(await enviar())

    expect(segunda.id).toBe(primera.id)
    expect(await db.select({ id: companies.id }).from(companies)).toHaveLength(1)
  })

  it("y el contrato publicado dice que acepta la clave", async () => {
    const response = await fullApp.request("/openapi.json")
    const doc = await leer<{
      paths: Record<string, Record<string, { parameters?: { name: string; in: string }[] }>>
    }>(response)

    const parametros = doc.paths["/companies"]?.post?.parameters ?? []

    expect(parametros.some((p) => p.in === "header" && p.name === "idempotency-key")).toBe(true)
  })
})

describe("declararla es una decisión que se comprueba al cargar", () => {
  /**
   * Una ruta pública no tiene actor, así que su clave no se podría acotar a nadie y volvería a ser
   * un espacio de nombres global. Falla al **cargar el módulo**, como `assertScopedByCompany`: una
   * ruta mal declarada rompe el arranque, no la petición número mil.
   */
  it("una ruta pública no puede declararse idempotente", () => {
    expect(() =>
      defineRoute({
        access: PUBLIC("Sonda: no se monta"),
        idempotent: true,
        config: {
          method: "post",
          path: "/probe/publica",
          summary: "No debería poder declararse",
          responses: { 200: { description: "ok" } },
        },
        handler: (c) => c.json({ ok: true }),
      }),
    ).toThrow(/idempotencia/i)
  })
})
