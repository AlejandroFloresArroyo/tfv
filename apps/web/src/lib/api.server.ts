import {
  type ApiArgs,
  type ApiEndpoint,
  type ApiOutput,
  resolveRequest,
} from "@tfv/contracts/api-client"
import { cookies, headers } from "next/headers"

/**
 * Llamadas a la API **desde el servidor**.
 *
 * Van al origen real, sin pasar por el proxy: el proxy existe para el navegador, y hacer que el
 * proceso se llame a sí mismo para reenviarse una petición sólo añadiría un salto.
 *
 * Las cookies de la petición entrante se reenvían a mano. No se heredan solas: `fetch` en el
 * servidor no tiene navegador detrás ni almacén de cookies del que tirar.
 */

const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:5000"

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly message: string }

/**
 * Llamada **tipada** desde el servidor.
 *
 * El endpoint es una clave del contrato publicado, no una cadena: `"GET /auth/sessions"` compila y
 * `"GET /auth/sesions"` no, y el tipo de lo que devuelve sale del mismo esquema que valida en el
 * servidor. Ver `packages/contracts/src/api-client.ts`.
 *
 * Convive con `apiGet` a propósito: pasar las cuarenta y ocho pantallas es una ronda entera y
 * hacerlo mientras otros las están escribiendo sólo produciría conflictos. Ver `HALLAZGOS.md`
 * H-128.
 */
export async function apiCall<E extends ApiEndpoint>(
  endpoint: E,
  ...args: ApiArgs<E>
): Promise<ApiResult<ApiOutput<E>>> {
  const request = resolveRequest(endpoint, args[0] as Parameters<typeof resolveRequest>[1])

  return send(request.path, {
    method: request.method,
    ...(request.body === undefined ? {} : { body: request.body }),
  }) as Promise<ApiResult<ApiOutput<E>>>
}

/** La forma sin tipar, que siguen usando las pantallas que aún no se han pasado. */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  return send(path, { method: "GET" }) as Promise<ApiResult<T>>
}

async function send(
  path: string,
  options: { method: string; body?: unknown },
): Promise<ApiResult<unknown>> {
  const store = await cookies()
  const cookieHeader = store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ")

  let response: Response
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method: options.method,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      headers: {
        cookie: cookieHeader,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        // La correlación atraviesa el salto: un fallo en la API se puede encontrar partiendo de la
        // página que lo provocó, que es la mitad del trabajo de diagnosticar en producción.
        "x-request-id": (await headers()).get("x-request-id") ?? crypto.randomUUID(),
      },
      // El panel muestra datos por usuario. Guardarlos en caché serviría la sesión de alguien a
      // otra persona, así que aquí no hay caché que valga.
      cache: "no-store",
    })
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "no se pudo contactar con la API",
    }
  }

  if (!response.ok) {
    const message = await readMessage(response)
    return { ok: false, status: response.status, message }
  }

  if (response.status === 204) return { ok: true, data: undefined }

  return { ok: true, data: await response.json() }
}

/**
 * El mensaje del error, leído según el contrato.
 *
 * `message` es una **lista** cuando el error es de validación, y una cadena en todos los demás
 * casos. Tratarla siempre como cadena la convierte en `[object Object]`.
 */
async function readMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      message?: string | { key: string; message: string }[]
    }

    if (Array.isArray(body.message)) {
      return body.message.map((issue) => issue.message).join(" · ")
    }

    return body.message ?? response.statusText
  } catch {
    return response.statusText
  }
}
