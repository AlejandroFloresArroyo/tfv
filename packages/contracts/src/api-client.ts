/**
 * El cliente tipado, sobre el transporte que le den.
 *
 * Ver `openspec/specs/api-conventions/spec.md` y las tareas «Generación del cliente tipado» de las
 * rebanadas 01 y 03.
 *
 * ## Qué añade sobre `fetch`
 *
 * Tres cosas que hoy se hacen a mano en cada pantalla y a veces mal:
 *
 * 1. **El endpoint es una clave del contrato**, no una cadena. `"POST /companies"` compila;
 *    `"POST /compnaies"` no. Un camino mal escrito deja de ser un `404` en tiempo de ejecución.
 * 2. **Los parámetros del camino se sustituyen**, escapados. Componer la dirección a mano es como
 *    un identificador con una barra acaba partiendo la ruta.
 * 3. **El cuerpo y la respuesta llevan el tipo que el contrato declara.** Cambiar un campo en el
 *    servidor rompe la compilación del navegador, que es donde debe romperse.
 *
 * ## Qué no hace, a propósito
 *
 * **No habla con la red.** El transporte se inyecta, y con él se quedan las decisiones que no son
 * del contrato: cookies, renovación ante `401` con reintento transparente, prefijo del proxy. Esa
 * lógica ya existe y está probada en `apps/web/src/lib/api.client.ts`; duplicarla aquí daría dos
 * comportamientos ante una sesión caducada, que es peor que no tener ninguno.
 *
 * Es también lo que permite probar este módulo sin servidor, y lo que dejará enchufarlo desde el
 * servidor de Next —donde las cookies se leen de otro sitio— sin tocar nada de aquí.
 */

import type { ApiEndpoint, ApiEndpoints } from "./api.generated.ts"

export type { ApiEndpoint, ApiEndpoints } from "./api.generated.ts"

/** Lo que hay que aportar para llamar a un endpoint: camino, consulta, encabezados y cuerpo. */
export type ApiInput<E extends ApiEndpoint> = Omit<ApiEndpoints[E], "response">

/** Lo que devuelve. */
export type ApiOutput<E extends ApiEndpoint> = ApiEndpoints[E] extends { response: infer R }
  ? R
  : undefined

/**
 * El argumento sobra cuando el endpoint no pide nada.
 *
 * Sin esto, leer la salud del servicio sería `call("GET /health", {})`, y ese `{}` es ruido que
 * además invita a pensar que falta algo por rellenar.
 */
export type ApiArgs<E extends ApiEndpoint> = keyof ApiInput<E> extends never
  ? [input?: undefined]
  : [input: ApiInput<E>]

/** Una petición ya resuelta: camino final, verbo y cuerpo. Es lo que el transporte recibe. */
export interface ApiRequest {
  readonly method: string
  readonly path: string
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
}

export type ApiTransport = (request: ApiRequest) => Promise<unknown>

interface RawInput {
  readonly params?: Readonly<Record<string, string>>
  readonly query?: Readonly<Record<string, unknown>>
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: unknown
}

/**
 * Convierte la clave del endpoint y su entrada en una petición concreta.
 *
 * Está separada del cliente para poder comprobarla sin transporte, y porque la necesita quien
 * quiera construir la dirección sin llamar —un enlace, una precarga—.
 *
 * Un parámetro que falte **lanza aquí**, no llega a la red: `/companies/undefined/members` es una
 * petición que el servidor contesta con `404` y que no dice qué pasó de verdad.
 */
export function resolveRequest(endpoint: string, input: RawInput = {}): ApiRequest {
  const separator = endpoint.indexOf(" ")
  const method = endpoint.slice(0, separator)
  const template = endpoint.slice(separator + 1)

  const path = template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = input.params?.[name]
    if (value === undefined || value === null || value === "") {
      throw new Error(`Falta el parámetro «${name}» del camino ${template}`)
    }
    return encodeURIComponent(String(value))
  })

  return {
    method,
    path: path + queryString(input.query),
    ...(input.body === undefined ? {} : { body: input.body }),
    ...(input.headers === undefined ? {} : { headers: input.headers }),
  }
}

/**
 * La cadena de consulta.
 *
 * Los valores indefinidos y nulos **se omiten**: un filtro sin elegir no es un filtro con valor
 * vacío, y mandarlo como `estado=` obliga al servidor a distinguir dos formas de no filtrar.
 * Las listas se repiten, que es la forma que el lenguaje de consulta ya acepta.
 */
function queryString(query: Readonly<Record<string, unknown>> | undefined): string {
  if (!query) return ""

  const parts = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue

    if (Array.isArray(value)) {
      for (const item of value) parts.append(key, String(item))
    } else {
      parts.append(key, String(value))
    }
  }

  const encoded = parts.toString()
  return encoded === "" ? "" : `?${encoded}`
}

/**
 * Ata el contrato a un transporte.
 *
 * ```ts
 * const api = createApiClient(send)
 * const page = await api("GET /companies", { query: { limit: 20 } })
 * ```
 */
export function createApiClient(transport: ApiTransport) {
  return function call<E extends ApiEndpoint>(
    endpoint: E,
    ...args: ApiArgs<E>
  ): Promise<ApiOutput<E>> {
    return transport(resolveRequest(endpoint, args[0] as RawInput)) as Promise<ApiOutput<E>>
  }
}

/** El tipo del cliente, para poder pasarlo y guardarlo sin repetir la firma. */
export type ApiClient = ReturnType<typeof createApiClient>
