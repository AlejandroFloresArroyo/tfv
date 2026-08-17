/**
 * El transporte del navegador.
 *
 * Estas viven aquí y no en las de extremo a extremo por un motivo concreto: el invariante que
 * comprueban es **cuántas veces** se pide la renovación, y provocar tres peticiones simultáneas con
 * la credencial recién caducada desde una pantalla real es difícil de orquestar y fácil de que
 * salga distinto cada vez. Aquí el reloj y la red los pone la prueba.
 *
 * Lo que sí es de extremo a extremo —que una pantalla siga funcionando tras caducar la credencial—
 * está en `apps/e2e`. Son las dos caras: aquí el mecanismo, allí el efecto.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, api, SessionExpiredError } from "./api.client.ts"

/** Lo que cada llamada a `fetch` recibió, en orden. */
let calls: string[] = []

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Una red de mentira.
 *
 * `respond` decide qué devuelve cada camino. Se registra toda llamada para poder contar
 * renovaciones, que es lo único que estas pruebas miran de verdad.
 */
function stubFetch(respond: (path: string, attempt: number) => Response | Promise<Response>) {
  const attempts = new Map<string, number>()

  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const path = String(input)
    calls.push(`${init?.method ?? "GET"} ${path}`)

    const attempt = (attempts.get(path) ?? 0) + 1
    attempts.set(path, attempt)

    return respond(path, attempt)
  })
}

describe("renovación ante un 401", () => {
  it("renueva y reintenta, de forma transparente", async () => {
    stubFetch((path, attempt) => {
      if (path.endsWith("/auth/refresh")) return jsonResponse(200)
      // La primera vez la credencial ya caducó; tras renovar, la segunda funciona.
      return attempt === 1 ? jsonResponse(401) : jsonResponse(200, { ok: true })
    })

    await expect(api("/companies")).resolves.toEqual({ ok: true })

    expect(calls).toEqual(["GET /api/companies", "POST /api/auth/refresh", "GET /api/companies"])
  })

  it("**una sola renovación** aunque caduquen tres peticiones a la vez", async () => {
    /**
     * El invariante que sostiene el diseño.
     *
     * La credencial de renovación rota en cada uso, y presentar una consumida es indicio de robo:
     * la API corta la cadena entera. Con tres peticiones en vuelo al caducar el acceso, las tres
     * reciben `401`; si las tres renovaran, la segunda dispararía la detección de robo **contra el
     * usuario legítimo**, que se vería expulsado sin haber hecho nada.
     *
     * Lo que se cuenta es exactamente eso: que sea una y no tres.
     */
    let refreshes = 0

    stubFetch(async (path, attempt) => {
      if (path.endsWith("/auth/refresh")) {
        refreshes++
        // Una renovación real tarda: sin la espera, la primera terminaría antes de que la segunda
        // llegara a pedirla y la prueba pasaría por casualidad.
        await new Promise((resolve) => setTimeout(resolve, 20))
        return jsonResponse(200)
      }
      return attempt === 1 ? jsonResponse(401) : jsonResponse(200, { ok: true })
    })

    const results = await Promise.all([
      api("/companies"),
      api("/auth/sessions"),
      api("/permissions"),
    ])

    expect(refreshes).toBe(1)
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }])
  })

  it("si la renovación falla, la sesión se da por terminada", async () => {
    stubFetch((path) => (path.endsWith("/auth/refresh") ? jsonResponse(401) : jsonResponse(401)))

    await expect(api("/companies")).rejects.toBeInstanceOf(SessionExpiredError)
  })

  it("no renueva donde un 401 significa otra cosa", async () => {
    // En `login`, un `401` es «contraseña incorrecta». Renovar ahí enmascararía el mensaje real
    // con un fallo de sesión que no ha ocurrido.
    stubFetch(() =>
      jsonResponse(401, {
        statusCode: 401,
        error: "unauthenticated",
        message: "Correo o contraseña incorrectos",
      }),
    )

    await expect(
      api("/auth/login", { method: "POST", body: {}, withoutRefresh: true }),
    ).rejects.toThrow("Correo o contraseña incorrectos")

    expect(calls.some((call) => call.includes("refresh"))).toBe(false)
  })

  it("una renovación posterior vuelve a intentarse", async () => {
    // La promesa compartida se suelta al terminar. Si no lo hiciera, la sesión sólo podría
    // renovarse una vez en toda la vida de la pestaña.
    let refreshes = 0

    stubFetch((path, attempt) => {
      if (path.endsWith("/auth/refresh")) {
        refreshes++
        return jsonResponse(200)
      }
      return attempt % 2 === 1 ? jsonResponse(401) : jsonResponse(200, { ok: true })
    })

    await api("/companies")
    await api("/companies")

    expect(refreshes).toBe(2)
  })
})

describe("contrato de error", () => {
  it("sitúa los errores por campo", async () => {
    /**
     * **La forma importa, y estas pruebas la tenían mal.**
     *
     * El contrato pone los problemas por campo en `message`, como lista. La primera versión de
     * estas pruebas inventó `{ error: { message, fields } }` —que es la forma de otras APIs— y por
     * eso pasaban en verde mientras la aplicación pintaba `[object Object]` y no situaba ni un solo
     * error en su campo. Lo descubrió una prueba de extremo a extremo contra el servidor real.
     *
     * La moraleja queda escrita aquí: una prueba con una respuesta inventada comprueba la
     * invención, no el contrato.
     */
    stubFetch(() =>
      jsonResponse(400, {
        statusCode: 400,
        error: "validation_failed",
        message: [
          { key: "email", message: "Ese correo no parece válido" },
          { key: "name", message: "El nombre es obligatorio" },
        ],
      }),
    )

    const failure: unknown = await api("/companies", { method: "POST", body: {} }).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(ApiError)
    if (!(failure instanceof ApiError)) throw new Error("debería ser un ApiError")

    expect(failure.fields.get("email")).toBe("Ese correo no parece válido")
    expect(failure.fields.get("name")).toBe("El nombre es obligatorio")

    // Y nada se pierde: el mensaje general los recoge, por si algún campo no se dibuja.
    expect(failure.message).toBe("Ese correo no parece válido · El nombre es obligatorio")
  })

  it("un error que no es de validación trae su mensaje como cadena", async () => {
    stubFetch(() =>
      jsonResponse(403, {
        statusCode: 403,
        error: "missing_permission",
        message: "Falta el permiso companies.roles.create",
      }),
    )

    await expect(api("/companies")).rejects.toThrow("Falta el permiso companies.roles.create")
  })

  it("un cuerpo que no es JSON no rompe el manejo del error", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>502</html>", { status: 502 }))

    await expect(api("/companies")).rejects.toBeInstanceOf(ApiError)
  })

  it("una respuesta sin contenido no intenta interpretarse", async () => {
    stubFetch(() => new Response(null, { status: 204 }))

    await expect(api("/companies", { method: "DELETE" })).resolves.toBeUndefined()
  })
})
