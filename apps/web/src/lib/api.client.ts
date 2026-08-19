"use client"

/**
 * Llamadas a la API **desde el navegador**.
 *
 * Ver `openspec/changes/rebuild-ui-foundation` (28f): «Renovación ante `401` con reintento
 * transparente».
 *
 * Todo va contra `/api/*` del propio origen, que el servidor de Next reenvía. Las credenciales son
 * cookies no accesibles por script, así que aquí no hay ningún token que manejar: sólo hay que
 * pedir que las cookies viajen.
 *
 * ## Por qué la renovación está serializada
 *
 * Es la parte que no se puede improvisar. La credencial de renovación **rota en cada uso**, y
 * presentar una ya consumida es indicio de robo: la API corta la cadena entera y cierra la sesión
 * (ver `apps/api/src/auth/sessions.ts`).
 *
 * Si la credencial de acceso caduca mientras hay tres peticiones en vuelo, las tres reciben `401` y
 * las tres intentan renovar. La primera consume la credencial; la segunda presenta esa misma, ya
 * consumida, y **la API cierra la sesión del usuario legítimo por sospecha de robo**. El usuario
 * ve, sin haber hecho nada raro, que se le expulsa.
 *
 * Por eso hay una sola renovación en curso: las demás esperan su resultado en lugar de lanzar la
 * suya. La detección de reutilización no se relaja —está bien como está—; lo que se arregla es que
 * el cliente deje de dispararla solo.
 */

import { createApiClient } from "@tfv/contracts/api-client"

export class ApiError extends Error {
  readonly status: number
  /** Errores por campo, cuando la API los devuelve con la forma del contrato. */
  readonly fields: ReadonlyMap<string, string>

  constructor(status: number, message: string, fields: ReadonlyMap<string, string> = new Map()) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.fields = fields
  }
}

/** Se lanza cuando la sesión ya no se puede recuperar y hay que volver a la pantalla de acceso. */
export class SessionExpiredError extends ApiError {
  constructor() {
    super(401, "La sesión terminó")
    this.name = "SessionExpiredError"
  }
}

interface RequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  readonly body?: unknown
  readonly signal?: AbortSignal
  /**
   * No intentar renovar ante un `401`.
   *
   * Lo usan las rutas de acceso: un `401` de `login` significa «contraseña incorrecta», no «sesión
   * caducada», y renovar ahí sería absurdo — además de que la propia renovación devolvería `401` y
   * enmascararía el mensaje real.
   */
  readonly withoutRefresh?: boolean
  /**
   * Cabeceras propias de la petición.
   *
   * Existe por la **clave de idempotencia** de `api-conventions`, que viaja en cabecera y no en el
   * cuerpo. Y viajan también en el reintento tras renovar la sesión, que es la mitad que importa:
   * un reintento con otra clave sería una segunda compra.
   */
  readonly headers?: Readonly<Record<string, string>>
}

/** Renovación en curso, si la hay. Es el punto de serialización. */
let refreshing: Promise<boolean> | null = null

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options)

  if (response.status !== 401 || options.withoutRefresh) {
    return unwrap<T>(response)
  }

  const renewed = await renew()
  if (!renewed) throw new SessionExpiredError()

  return unwrap<T>(await send(path, options))
}

function send(path: string, options: RequestOptions): Promise<Response> {
  const { method = "GET", body, signal, headers } = options

  const own = {
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(headers ?? {}),
  }

  return fetch(`/api${path}`, {
    method,
    // Sin esto las cookies no viajan y toda petición autenticada responde 401.
    credentials: "same-origin",
    // Las claves ausentes se omiten en lugar de pasarse como `undefined`: con
    // `exactOptionalPropertyTypes` no es lo mismo «sin cuerpo» que «cuerpo indefinido».
    ...(Object.keys(own).length === 0 ? {} : { headers: own }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  })
}

/**
 * Renueva la sesión, una sola vez aunque la pidan varios.
 *
 * Quien llega mientras hay una en curso espera la misma promesa. Es lo que impide que dos
 * peticiones presenten la misma credencial de renovación.
 */
function renew(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })

  return refreshing
}

async function unwrap<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  throw await toError(response)
}

/**
 * Traduce la respuesta al error del contrato.
 *
 * Ver `openspec/specs/api-conventions/spec.md`. La forma es:
 *
 * ```
 * { statusCode, error: "<código>", message: string | { key, message }[] }
 * ```
 *
 * **`message` es una lista cuando el error es de validación**, y una cadena en todos los demás
 * casos. Esa es la parte que hay que leer con cuidado: tratarla siempre como cadena la pinta como
 * `[object Object]`, y deja los errores por campo sin llegar nunca a su campo.
 *
 * Los errores por campo se conservan aparte para que el formulario pueda situarlos, y **además**
 * se unen en el mensaje general. Repetir una línea es preferible a perderla: si un problema apunta
 * a un campo que esta pantalla no dibuja, sin el mensaje general no se vería en ninguna parte.
 */
async function toError(response: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return new ApiError(response.status, response.statusText)
  }

  const payload = body as {
    error?: string
    message?: string | { key: string; message: string }[]
  }

  const fields = new Map<string, string>()

  if (Array.isArray(payload.message)) {
    for (const issue of payload.message) {
      // El primero por campo: los siguientes suelen ser consecuencia del mismo dato.
      if (!fields.has(issue.key)) fields.set(issue.key, issue.message)
    }

    const joined = payload.message.map((issue) => issue.message).join(" · ")
    return new ApiError(response.status, joined || response.statusText, fields)
  }

  return new ApiError(response.status, payload.message ?? response.statusText, fields)
}

/**
 * El mismo transporte, con el contrato publicado delante.
 *
 * `api()` sigue siendo lo que habla con la red —con su renovación serializada, que es la parte que
 * no se puede improvisar—. Esto sólo pone tipos encima: el endpoint es una clave del contrato, los
 * parámetros del camino se sustituyen escapados, y el cuerpo y la respuesta llevan la forma que el
 * servidor declara.
 *
 * ```ts
 * await apiTyped("POST /auth/logout-all")
 * ```
 *
 * Convive con `api()` a propósito. Pasar las cuarenta y ocho pantallas es una ronda entera y
 * hacerlo mientras otros las están escribiendo sólo produciría conflictos: ver `HALLAZGOS.md` H-128.
 */
export const apiTyped = typedClient()

/**
 * El mismo, sin intentar renovar ante un `401`.
 *
 * Lo necesitan las rutas de acceso y las de cierre de sesión, donde un `401` **no** significa
 * «sesión caducada»: en `login` significa contraseña incorrecta, y en `logout-all` que ya no queda
 * nada que cerrar. Renovar ahí enmascara el mensaje real y, en el cierre, rota una credencial que
 * se está tratando de invalidar.
 *
 * Es opción del **transporte**, no del contrato: qué hacer ante un `401` no es algo que la API
 * declare, así que no cabe en el mapa generado y se elige aquí, al atar el cliente a su transporte.
 */
export const apiTypedWithoutRefresh = typedClient({ withoutRefresh: true })

function typedClient(options: { withoutRefresh?: boolean } = {}) {
  return createApiClient((request) =>
    api(request.path, {
      method: request.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      ...(request.body === undefined ? {} : { body: request.body }),
      ...(options.withoutRefresh ? { withoutRefresh: true } : {}),
    }),
  )
}
