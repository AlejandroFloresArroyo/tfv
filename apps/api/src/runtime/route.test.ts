/**
 * Comprobaciones del tiempo de ejecución.
 *
 * La más importante es la de la superficie pública: es un candado, no una descripción. Si alguien
 * abre una ruta al mundo, esta prueba falla hasta que la añada a la lista de forma deliberada.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { OpenAPIHono, z } from "@hono/zod-openapi"
import { newId, ValidationError } from "@tfv/contracts"
import { closeConnection } from "@tfv/db"
import { afterAll, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "./app.ts"
import { AUTHENTICATED, defineRoute, describeRoutes, PUBLIC, publicRoutes } from "./route.ts"

const app = createApp(routes)

/** `Response.json()` devuelve `unknown`; estas pruebas saben qué forma esperan. */
async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

interface ErrorBody {
  statusCode: number
  error: string
  message: string | { key: string; message: string }[]
}

afterAll(async () => {
  await closeConnection()
})

describe("superficie pública", () => {
  /**
   * La lista completa de rutas accesibles sin credencial.
   *
   * `openspec/specs/access-control/spec.md` la exige explícita y auditable. Cambiarla debe ser un
   * acto deliberado que se vea en la revisión de código.
   */
  const ESPERADAS = [
    "POST /auth/accept-invitation",
    "POST /auth/forgot-password",
    "POST /auth/login",
    "POST /auth/refresh",
    "POST /auth/register",
    "POST /auth/resend-verification",
    "POST /auth/reset-password",
    "POST /auth/verify-email",
    /**
     * Añadida el 2026-08-17, de forma deliberada.
     *
     * La taxonomía global aparece en las tiendas públicas y en el directorio de locaciones, que se
     * sirven a quien no ha entrado. Es **de sólo lectura**: escribirla exige permiso y, encima,
     * administración de plataforma.
     */
    "GET /categories",
    "GET /health",
    /**
     * Añadida el 2026-08-18, de forma deliberada.
     *
     * La recibe el procesador de pagos, que no tiene sesión. **Lo que la protege es la firma del
     * remitente**, verificada antes de mirar el cuerpo — al contrario que la implementación
     * anterior, que fabricaba la firma que después comprobaba (`DEFECTS.md` S-01) y dejaba a
     * cualquiera activar suscripciones o materializar pedidos no pagados.
     */
    "POST /payments/events",
    /**
     * Añadida el 2026-08-18, de forma deliberada.
     *
     * El formulario de contacto: quien deja sus datos no tiene cuenta, y exigirle una lo dejaría
     * sin sentido. **No escribe sobre ninguna empresa**: un prospecto es una intención de contacto
     * con la plataforma, y ni siquiera devuelve el identificador de lo que creó.
     */
    "POST /prospects",
    /**
     * Añadida el 2026-08-18, de forma deliberada.
     *
     * El documento que se comparte con quien no tiene cuenta —el cliente que recibe la cotización—.
     * **Lo que la protege es la firma de la referencia**, verificada antes de tocar la base: el
     * camino no lleva empresa, así que no hay identificador que sustituir para asomarse a otra, y
     * alterar la referencia responde `404` sin decir por qué. Es de lectura y de un solo documento.
     */
    "GET /public/documents/{reference}",
    /**
     * Las tres de la tienda pública, añadidas el 2026-08-18 de forma deliberada.
     *
     * Son **la razón de ser** de la rebanada 19: una tienda que exigiera cuenta para mirar el
     * catálogo no es una tienda. Lo que las acota no es una credencial sino la forma del camino y
     * lo que se compone al otro lado:
     *
     * - **El camino no lleva empresa.** Lleva el identificador legible del sitio, y la empresa la
     *   resuelve el motor a partir de él (`app.public_website`), sólo si el sitio está publicado.
     *   Cambiar el identificador lleva a otra tienda pública, no a la trastienda de nadie.
     * - **Son de lectura.** No hay un solo verbo de escritura aquí; el formulario de contacto, que
     *   sí escribe, entra por `POST /prospects`, que ya estaba.
     * - **Lo que devuelven se compone campo a campo**, no reutiliza los registros del catálogo
     *   interno: ni costo, ni ubicación, ni existencias, ni el catálogo de quien no publicó. Sus
     *   pruebas lo comprueban desde fuera, sin cookie.
     */
    "GET /public/sites/{slug}",
    "GET /public/sites/{slug}/products",
    "GET /public/sites/{slug}/products/{handle}",
  ]

  it("es exactamente la declarada", () => {
    const actuales = publicRoutes(routes).map((route) => `${route.method} ${route.path}`)
    expect(actuales).toEqual(ESPERADAS)
  })

  it("cada ruta pública explica por qué lo es", () => {
    for (const route of publicRoutes(routes)) {
      expect(route.access, `${route.method} ${route.path}`).toMatch(/^público \(.+\)$/)
    }
  })

  it("ninguna escritura pública toca datos de una empresa", () => {
    /**
     * La spec permite escrituras públicas —registrarse, iniciar sesión, canjear un enlace, dejar
     * los datos de contacto— pero **ninguna sobre datos de una empresa**.
     *
     * La comprobación era «todas cuelgan de `/auth`», que servía de sustituto mientras todas lo
     * hacían. Al llegar el formulario de contacto dejó de servir: un prospecto no es autenticación
     * y tampoco es de nadie. Lo que se comprueba ahora es la frontera de verdad — que el camino no
     * se resuelva contra una empresa—, que es la misma que `assertScopedByCompany` aplica al
     * cargar el módulo. La lista de arriba sigue fijando cuáles son, exactamente.
     */
    const escrituras = publicRoutes(routes).filter((route) => route.method !== "GET")

    expect(escrituras.length).toBeGreaterThan(0)
    for (const ruta of escrituras) {
      expect(ruta.path, `${ruta.method} ${ruta.path}`).not.toMatch(/\{companyId\}|:companyId/)
    }
  })
})

describe("tabla de rutas", () => {
  it("se puede leer sin ejecutar el servicio", () => {
    const tabla = describeRoutes(routes)

    expect(tabla.length).toBe(routes.length)
    for (const entrada of tabla) {
      expect(entrada.method).toMatch(/^[A-Z]+$/)
      expect(entrada.path.startsWith("/")).toBe(true)
      expect(entrada.access).not.toBe("")
      expect(entrada.summary).not.toBe("")
    }
  })

  it("toda ruta declara su régimen de acceso", () => {
    for (const route of routes) {
      expect(["public", "authenticated", "permission"]).toContain(route.access.kind)
    }
  })
})

describe("contrato de error", () => {
  it("una ruta inexistente responde 404 con la forma del contrato", async () => {
    const response = await app.request("/no-existe")
    expect(response.status).toBe(404)

    const body = await readJson<ErrorBody>(response)
    expect(body).toMatchObject({ statusCode: 404, error: "not_found" })
    expect(typeof body.message).toBe("string")
  })

  it("una entrada inválida responde 400 señalando cada campo", async () => {
    // Aplicación desechable: comprueba el enganche de validación sin exponer una ruta de prueba.
    // Pública a propósito: el guardián corre **antes** que la validación, así que una ruta
    // autenticada responderÍa 401 y no llegaría a ejercitar el enganche que se quiere comprobar.
    const probe = defineRoute({
      access: PUBLIC("Sonda de prueba, no se monta en la aplicación real"),
      config: {
        method: "post",
        path: "/probe",
        summary: "Sonda de validación",
        tags: ["Prueba"],
        request: {
          body: {
            content: {
              "application/json": {
                schema: z.object({ name: z.string().min(1), age: z.number().int() }),
              },
            },
          },
        },
        responses: { 200: { description: "ok" } },
      },
      handler: (c) => c.json({ ok: true }),
    })

    const probeApp = createApp([probe])
    const response = await probeApp.request("/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", age: "no soy un número" }),
    })

    expect(response.status).toBe(400)

    const body = await readJson<ErrorBody>(response)
    expect(body.statusCode).toBe(400)
    expect(body.error).toBe("validation_failed")
    expect(Array.isArray(body.message)).toBe(true)

    const keys = (body.message as { key: string }[]).map((issue) => issue.key).sort()
    expect(keys).toEqual(["age", "name"])
  })

  it("el error de validación es el tipo del contrato compartido", () => {
    const error = new ValidationError([{ key: "email", message: "requerido" }])
    expect(error.status).toBe(400)
    expect(error.code).toBe("validation_failed")
  })
})

describe("correlación", () => {
  it("devuelve un identificador de petición", async () => {
    const response = await app.request("/health")
    expect(response.headers.get("x-request-id")).toBeTruthy()
  })

  it("conserva el identificador que llega en la petición", async () => {
    const response = await app.request("/health", {
      headers: { "x-request-id": "abc-123" },
    })
    expect(response.headers.get("x-request-id")).toBe("abc-123")
  })
})

describe("contrato publicado", () => {
  it("se deriva de los esquemas de ejecución", async () => {
    const response = await app.request("/openapi.json")
    expect(response.status).toBe(200)

    const doc = await readJson<{ openapi: string; paths: Record<string, Record<string, unknown>> }>(
      response,
    )
    expect(doc.openapi).toBe("3.1.0")

    // Toda ruta declarada aparece en el contrato: no puede quedar desfasado.
    for (const route of routes) {
      const path = doc.paths?.[route.config.path]
      expect(path, `falta ${route.config.path} en el contrato`).toBeDefined()
      expect(path?.[route.config.method]).toBeDefined()
    }
  })
})

describe("salud", () => {
  it("informa de que la base responde", async () => {
    const response = await app.request("/health")
    expect(response.status).toBe(200)

    const body = await readJson<{ status: string; database: string; at: string }>(response)
    expect(body).toMatchObject({ status: "ok", database: "up" })
    expect(Date.parse(body.at)).not.toBeNaN()
  })
})

describe("aplicación", () => {
  it("se construye sobre el registro, no sobre el sistema de archivos", () => {
    expect(createApp(routes)).toBeInstanceOf(OpenAPIHono)
  })
})

describe("cada capa se queda en su verbo", () => {
  /**
   * Regresión de un defecto **que dependía del orden de la tabla de rutas**.
   *
   * El enrutador no sabe montar middleware por verbo: `use` lo registra para todos los del mismo
   * camino. Y un camino con varios verbos es lo normal —hoy hay cuarenta y siete, y en cuarenta de
   * ellos los regímenes difieren—. Sin acotar la capa a su verbo, cada ruta heredaba los guardianes
   * de sus hermanas, y como el enrutador compone en **orden de registro**, con la ruta estricta
   * declarada primero la laxa quedaba exigiendo lo que nunca declaró.
   *
   * Falla cerrado, así que no abrió nada. Lo que rompía es más sutil y peor de diagnosticar: el
   * permiso que una ruta exige de verdad no era el que declara, y reordenar la tabla cambiaba la
   * autorización sin tocar ninguna declaración. Ver `HALLAZGOS.md` H-127.
   */
  it("una lectura pública no hereda el guardián de la escritura del mismo camino", async () => {
    const escribir = defineRoute({
      access: AUTHENTICATED,
      config: {
        method: "post",
        path: "/probe/compartido",
        summary: "Escritura autenticada",
        responses: {
          200: {
            description: "ok",
            content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
          },
        },
      },
      handler: (c) => c.json({ ok: true }, 200),
    })

    const leer = defineRoute({
      access: PUBLIC("Sonda de prueba, no se monta en la aplicación real"),
      config: {
        method: "get",
        path: "/probe/compartido",
        summary: "Lectura pública",
        responses: {
          200: {
            description: "ok",
            content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
          },
        },
      },
      handler: (c) => c.json({ ok: true }, 200),
    })

    // La estricta **primero**, que es el orden con el que el defecto se manifestaba.
    const probeApp = createApp([escribir, leer])

    expect((await probeApp.request("/probe/compartido")).status).toBe(200)
    expect((await probeApp.request("/probe/compartido", { method: "POST" })).status).toBe(401)
  })
})

describe("el guardián alcanza a las rutas con parámetros", () => {
  /**
   * Regresión de un defecto **silencioso** del propio andamiaje.
   *
   * El contrato nombra sus parámetros `{companyId}` y el enrutador los espera `:companyId`. El
   * manejador se registraba con la conversión hecha y el guardián se montaba sin ella, así que su
   * camino no coincidía con ninguna petición: **la ruta respondía con normalidad, sin guardián**.
   *
   * No fallaba, no avisaba, y no había ninguna ruta con parámetros cuando apareció. La primera
   * —`/companies/{companyId}/…`, rebanada 10— habría nacido abierta. Es la misma forma de S-05,
   * cometida por el andamiaje que existe para impedirla.
   */
  it("una ruta autenticada con parámetro en el camino exige credencial", async () => {
    const guarded = defineRoute({
      access: AUTHENTICATED,
      config: {
        method: "get",
        path: "/probe/{someId}",
        summary: "Ruta con parámetro",
        request: { params: z.object({ someId: z.string() }) },
        responses: {
          200: {
            description: "Nunca debería alcanzarse sin credencial",
            content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
          },
        },
      },
      handler: (c) => c.json({ ok: true }, 200),
    })

    // **Con un identificador bien formado, y no es indiferente.** Desde que el motor comprueba la
    // forma de los identificadores antes del guardián (`HALLAZGOS.md` H-144), una cadena cualquiera
    // se rechaza con `400` sin llegar a él: la prueba seguiría en verde con el guardián desmontado,
    // que es justo lo que existe para detectar. Lo que fija esta prueba es que **el guardián alcanza
    // los caminos con parámetro**, así que la petición tiene que llegar hasta él.
    const response = await createApp([guarded]).request(`/probe/${newId()}`)

    expect(response.status).toBe(401)
  })

  /**
   * Y la otra mitad de la política, escrita porque es un cambio deliberado.
   *
   * Un identificador mal formado se rechaza **antes** de mirar la credencial, así que una petición
   * sin sesión recibe `400` y no `401`. Es la misma categoría que un camino que no existe, que el
   * motor ya contesta con `404` a quien no ha entrado: la petición no direcciona ningún recurso
   * posible, así que la pregunta por la credencial no llega a plantearse.
   *
   * No revela nada: lo que decide el rechazo es la forma de la cadena que envió quien llama —que ya
   * conocía antes de mandarla— y nunca lo que haya en la base.
   */
  it("un identificador mal formado se rechaza antes que la credencial", async () => {
    const guarded = defineRoute({
      access: AUTHENTICATED,
      config: {
        method: "get",
        path: "/probe/anterior/{someId}",
        summary: "Ruta con parámetro",
        request: { params: z.object({ someId: z.string() }) },
        responses: {
          200: {
            description: "Nunca debería alcanzarse",
            content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
          },
        },
      },
      handler: (c) => c.json({ ok: true }, 200),
    })

    const response = await createApp([guarded]).request("/probe/anterior/undefined")

    expect(response.status).toBe(400)
  })
})
