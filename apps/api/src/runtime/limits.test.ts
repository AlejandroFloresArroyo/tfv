/**
 * Límite de cuerpo y limitación de frecuencia.
 *
 * Transcritas de `openspec/specs/api-conventions/spec.md` —«El tamaño de las peticiones está
 * acotado»— y de las dos tareas de verificación de `add-hono-api-runtime`: «un cuerpo que excede el
 * límite responde `413`» y «superar la frecuencia responde `429`».
 *
 * El reloj del limitador se inyecta. Una prueba que esperase a que pase la ventana de verdad
 * tardaría un minuto y sería la primera que alguien se salta.
 */

import { z } from "@hono/zod-openapi"
import { describe, expect, it } from "vitest"
import { createApp } from "./app.ts"
import { clientIp } from "./request.ts"
import { AUTHENTICATED, defineRoute, PUBLIC } from "./route.ts"

// ─── Rutas de prueba ─────────────────────────────────────────────────────────

const eco = defineRoute({
  access: PUBLIC("Sonda de prueba, no se monta en la aplicación real"),
  config: {
    method: "post",
    path: "/probe/eco",
    summary: "Devuelve lo que le mandan",
    tags: ["Prueba"],
    request: {
      body: { content: { "application/json": { schema: z.object({ texto: z.string() }) } } },
    },
    responses: {
      200: {
        description: "ok",
        content: { "application/json": { schema: z.object({ largo: z.number() }) } },
      },
    },
  },
  handler: (c) => c.json({ largo: c.req.valid("json").texto.length }, 200),
})

/** Con su propio límite, más apretado que el general. */
const apretada = defineRoute({
  access: PUBLIC("Sonda de prueba, no se monta en la aplicación real"),
  maxBodyBytes: 64,
  config: {
    method: "post",
    path: "/probe/apretada",
    summary: "Acepta muy poco",
    tags: ["Prueba"],
    request: {
      body: { content: { "application/json": { schema: z.object({ texto: z.string() }) } } },
    },
    responses: {
      200: {
        description: "ok",
        content: { "application/json": { schema: z.object({ largo: z.number() }) } },
      },
    },
  },
  handler: (c) => c.json({ largo: c.req.valid("json").texto.length }, 200),
})

const saludo = defineRoute({
  access: PUBLIC("Sonda de prueba, no se monta en la aplicación real"),
  config: {
    method: "get",
    path: "/probe/saludo",
    summary: "Una lectura barata",
    tags: ["Prueba"],
    responses: {
      200: {
        description: "ok",
        content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
      },
    },
  },
  handler: (c) => c.json({ ok: true }, 200),
})

function cuerpoDe(bytes: number): string {
  return JSON.stringify({ texto: "a".repeat(bytes) })
}

interface ErrorBody {
  statusCode: number
  error: string
  message: string
}

// ─── Tamaño del cuerpo ───────────────────────────────────────────────────────

describe("el tamaño de las peticiones está acotado", () => {
  const app = createApp([eco, apretada], { rateLimit: null, maxBodyBytes: 1024 })

  async function enviar(path: string, bytes: number, conLongitud = true) {
    const body = cuerpoDe(bytes)
    return app.request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(conLongitud ? {} : { "transfer-encoding": "chunked" }),
      },
      body,
    })
  }

  it("un cuerpo dentro del límite se atiende", async () => {
    const response = await enviar("/probe/eco", 100)

    expect(response.status).toBe(200)
  })

  it("«Un cuerpo desproporcionado se rechaza pronto»", async () => {
    const response = await enviar("/probe/eco", 4000)

    expect(response.status).toBe(413)
  })

  it("y lo hace con la forma del contrato de error, no con texto suelto", async () => {
    // Hono responde `Payload Too Large` en texto plano por su cuenta. Un cliente que sabe leer el
    // contrato de error se encontraría con algo que no es JSON justo cuando algo va mal.
    const response = await enviar("/probe/eco", 4000)
    const body = (await response.json()) as ErrorBody

    expect(body).toMatchObject({ statusCode: 413, error: "payload_too_large" })
    expect(body.message).toMatch(/grande/i)
  })

  it("cada endpoint puede acotarlo más que el general", async () => {
    // «acorde a lo que cada endpoint necesita»: el general es el techo, no la única palabra.
    expect((await enviar("/probe/apretada", 200)).status).toBe(413)
    expect((await enviar("/probe/eco", 200)).status).toBe(200)
  })

  it("sin declarar la longitud, el límite se aplica igual", async () => {
    // Es el caso que importa: declarar `content-length: 10` y mandar diez megas es la forma obvia
    // de saltarse una comprobación que sólo mire el encabezado.
    const response = await enviar("/probe/apretada", 4000, false)

    expect(response.status).toBe(413)
  })

  it("una lectura sin cuerpo no se ve afectada", async () => {
    const app = createApp([saludo], { rateLimit: null, maxBodyBytes: 8 })

    expect((await app.request("/probe/saludo")).status).toBe(200)
  })
})

// ─── Frecuencia ──────────────────────────────────────────────────────────────

describe("limitación de frecuencia", () => {
  function appConLimite(max: number) {
    let ahora = 1_000_000
    const app = createApp([saludo], {
      maxBodyBytes: 1024,
      rateLimit: { max, windowMs: 60_000, now: () => ahora },
    })

    return { app, avanzar: (ms: number) => (ahora += ms) }
  }

  const desde = (ip: string) => ({ headers: { "x-forwarded-for": ip } })

  it("«Superar la frecuencia responde 429»", async () => {
    const { app } = appConLimite(3)

    for (let intento = 0; intento < 3; intento += 1) {
      expect((await app.request("/probe/saludo", desde("10.0.0.1"))).status).toBe(200)
    }

    const rechazada = await app.request("/probe/saludo", desde("10.0.0.1"))
    expect(rechazada.status).toBe(429)
  })

  it("dice cuándo volver a intentarlo", async () => {
    const { app } = appConLimite(1)

    await app.request("/probe/saludo", desde("10.0.0.2"))
    const rechazada = await app.request("/probe/saludo", desde("10.0.0.2"))

    expect(rechazada.headers.get("retry-after")).toBe("60")
    expect((await rechazada.json()) as ErrorBody).toMatchObject({
      statusCode: 429,
      error: "rate_limited",
    })
  })

  it("al pasar la ventana se vuelve a poder", async () => {
    const { app, avanzar } = appConLimite(1)

    await app.request("/probe/saludo", desde("10.0.0.3"))
    expect((await app.request("/probe/saludo", desde("10.0.0.3"))).status).toBe(429)

    avanzar(60_001)
    expect((await app.request("/probe/saludo", desde("10.0.0.3"))).status).toBe(200)
  })

  it("un origen no frena a otro", async () => {
    // Es el defecto que el limitador de acceso ya cometió una vez: agrupar a quien no tiene nada
    // en común dejó al sistema entero sin admitir inicios de sesión durante quince minutos.
    const { app } = appConLimite(1)

    await app.request("/probe/saludo", desde("10.0.0.4"))
    expect((await app.request("/probe/saludo", desde("10.0.0.4"))).status).toBe(429)
    expect((await app.request("/probe/saludo", desde("10.0.0.5"))).status).toBe(200)
  })

  it("la credencial cuenta aparte del origen", async () => {
    // «por credencial y por origen». Dos personas tras el mismo NAT comparten dirección y no deben
    // compartir cupo; la misma credencial desde dos redes sí es el mismo consumidor.
    const { app } = appConLimite(1)
    const conCredencial = (token: string) => ({
      headers: { "x-forwarded-for": "10.0.0.6", authorization: `Bearer ${token}` },
    })

    expect((await app.request("/probe/saludo", conCredencial("aaa"))).status).toBe(200)
    // La segunda con otra credencial ya agota el cupo **del origen**, que comparten.
    expect((await app.request("/probe/saludo", conCredencial("bbb"))).status).toBe(429)
  })

  it("una petición sin origen ni credencial no se agrupa con nadie", async () => {
    // Un valor desconocido no identifica a nadie, así que no puede agrupar a nadie. Frenar de menos
    // es el error correcto aquí; frenar de más es negar el servicio a todo el mundo.
    const { app } = appConLimite(1)

    expect((await app.request("/probe/saludo")).status).toBe(200)
    expect((await app.request("/probe/saludo")).status).toBe(200)
  })

  it("apagada, no se mete en medio", async () => {
    const app = createApp([saludo], { rateLimit: null, maxBodyBytes: 1024 })

    for (let intento = 0; intento < 20; intento += 1) {
      expect((await app.request("/probe/saludo", desde("10.0.0.7"))).status).toBe(200)
    }
  })
})

describe("la dirección del solicitante", () => {
  const con = (headers: Record<string, string>) =>
    ({ req: { header: (name: string) => headers[name] } }) as never

  it("sale del primer salto del encabezado reenviado", () => {
    expect(clientIp(con({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" }))).toBe("203.0.113.1")
  })

  it("cae al encabezado alternativo", () => {
    expect(clientIp(con({ "x-real-ip": "203.0.113.2" }))).toBe("203.0.113.2")
  })

  it("sin ninguno, no inventa una cadena centinela", () => {
    // `"unknown"` se compara como si fuera una dirección real, y agrupa a todo el que llegue sin
    // ella. Es el defecto que ya frenó a media plataforma una vez.
    expect(clientIp(con({}))).toBeUndefined()
  })
})

describe("una ruta autenticada también está acotada", () => {
  it("el límite de cuerpo se aplica antes que el guardián", async () => {
    // Rechazar por tamaño antes de resolver la sesión es lo que impide que una petición enorme
    // cueste una consulta a la base antes de que nadie la mire.
    const protegida = defineRoute({
      access: AUTHENTICATED,
      maxBodyBytes: 32,
      config: {
        method: "post",
        path: "/probe/protegida",
        summary: "Protegida y acotada",
        tags: ["Prueba"],
        request: {
          body: { content: { "application/json": { schema: z.object({ texto: z.string() }) } } },
        },
        responses: { 200: { description: "ok" } },
      },
      handler: (c) => c.json({ ok: true }),
    })

    const app = createApp([protegida], { rateLimit: null, maxBodyBytes: 1024 })
    const response = await app.request("/probe/protegida", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: cuerpoDe(2000),
    })

    expect(response.status).toBe(413)
  })
})
