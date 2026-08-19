/**
 * Los dos límites del armazón: tamaño del cuerpo y frecuencia.
 *
 * Ver `openspec/specs/api-conventions/spec.md`, requisito «El tamaño de las peticiones está
 * acotado», y `add-hono-api-runtime` — «Límite de tamaño de cuerpo por endpoint» y «Limitación de
 * frecuencia, por credencial y por origen».
 *
 * Los dos son **del armazón y no de cada manejador**, por el mismo motivo que el guardián: una
 * protección que hay que acordarse de poner en cada ruta es una protección que falta en la mitad
 * de ellas, y en la mitad que falta nadie lo nota hasta que alguien la busca.
 */

import { PayloadTooLargeError, RateLimitedError } from "@tfv/contracts"
import type { MiddlewareHandler } from "hono"
import { bodyLimit } from "hono/body-limit"
import { readAccessToken } from "../auth/middleware.ts"
import { clientIp } from "./request.ts"
import type { RegisteredRoute } from "./route.ts"

// ─── Tamaño del cuerpo ───────────────────────────────────────────────────────

/**
 * Acota lo que una ruta acepta.
 *
 * El límite general es el techo y cada ruta puede apretarlo —«acorde a lo que cada endpoint
 * necesita»—. **Ninguna necesita aceptar cargas grandes**: los archivos se suben directamente al
 * almacenamiento y no atraviesan la API (ver `media-storage`), así que un cuerpo de un mega ya es
 * enorme para lo que aquí viaja, que es JSON.
 *
 * El error se traduce al contrato: Hono responde por su cuenta `Payload Too Large` en **texto
 * plano**, y un cliente que sabe leer el contrato de error se encontraría con algo que no es JSON
 * justo cuando algo va mal.
 */
export function bodyLimitFor(fallback: number): (route: RegisteredRoute) => MiddlewareHandler {
  return (route) =>
    bodyLimit({
      maxSize: route.maxBodyBytes ?? fallback,
      onError: () => {
        throw new PayloadTooLargeError()
      },
    })
}

// ─── Frecuencia ──────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  /** Peticiones admitidas por ventana y por consumidor. */
  readonly max: number
  readonly windowMs: number
  /** Inyectable para poder probarlo sin esperar a que pase un minuto de verdad. */
  readonly now?: () => number
}

interface Counter {
  count: number
  resetAt: number
}

/**
 * Limitador genérico, por credencial **y** por origen.
 *
 * ## Los dos ejes, y por qué son dos
 *
 * Contar sólo por dirección mete en el mismo cupo a toda una oficina detrás del mismo NAT. Contar
 * sólo por credencial deja sin frenar a quien no ha entrado, que es justo quien más conviene
 * frenar. Se cuentan los dos y basta con superar uno para recibir `429`.
 *
 * ## Lo que no identifica a nadie no agrupa a nadie
 *
 * Una petición sin dirección y sin credencial **no se limita**. Es la lección del limitador de
 * acceso: guardar la cadena `"unknown"` hizo que todas las peticiones sin dirección compartieran
 * casilla, y ocho fallos con correos inventados dejaron a **la plataforma entera** sin admitir
 * inicios de sesión durante quince minutos. Frenar de menos es el error correcto aquí.
 *
 * ## Es por proceso, y eso es una decisión
 *
 * El contador vive en memoria. Con varias instancias, el límite efectivo se multiplica por cuantas
 * haya. Se acepta porque esto es un **guardarraíl de recursos**, no un control de credenciales: el
 * de intentos de acceso —que sí lo es— vive en la base precisamente por eso. Llevar éste a la base
 * costaría una escritura por petición en el camino de todas ellas, que es un precio alto por una
 * exactitud que aquí no cambia ninguna decisión. Queda anotado como `HALLAZGOS.md` H-130.
 */
export function createRateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const now = options.now ?? Date.now
  const counters = new Map<string, Counter>()

  return async (c, next) => {
    const instant = now()
    const keys = consumerKeys(c)

    // Sin nada que identifique al solicitante no hay a quién contar. Ver arriba.
    if (keys.length === 0) return next()

    prune(counters, instant)

    let retryAfterMs = 0

    for (const key of keys) {
      const counter = counters.get(key)

      if (!counter || counter.resetAt <= instant) {
        counters.set(key, { count: 1, resetAt: instant + options.windowMs })
        continue
      }

      counter.count += 1
      if (counter.count > options.max) {
        retryAfterMs = Math.max(retryAfterMs, counter.resetAt - instant)
      }
    }

    if (retryAfterMs > 0) {
      const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
      // El encabezado convencional, para que un cliente educado sepa cuándo volver en lugar de
      // reintentar en bucle y empeorar justo lo que se está tratando de contener.
      c.header("retry-after", String(seconds))
      throw new RateLimitedError(seconds)
    }

    await next()
  }
}

/**
 * Contra qué se cuenta esta petición.
 *
 * La credencial se acorta a un prefijo: **no hace falta la entera para distinguir consumidores**, y
 * un token completo guardado en un mapa de memoria es un token más en un sitio más.
 */
function consumerKeys(c: Parameters<MiddlewareHandler>[0]): string[] {
  const keys: string[] = []

  const token = readAccessToken(c)
  if (token) keys.push(`cred:${token.slice(0, 24)}`)

  const ip = clientIp(c)
  if (ip) keys.push(`ip:${ip}`)

  return keys
}

/**
 * Retira lo vencido cuando el mapa crece.
 *
 * Sin esto, una avalancha de direcciones distintas deja tantas entradas como direcciones y no las
 * suelta nunca: el limitador que existe para proteger el proceso sería la forma de tumbarlo.
 */
const PRUNE_ABOVE = 10_000

function prune(counters: Map<string, Counter>, instant: number): void {
  if (counters.size < PRUNE_ABOVE) return

  for (const [key, counter] of counters) {
    if (counter.resetAt <= instant) counters.delete(key)
  }
}
