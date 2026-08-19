/**
 * Ensamblado de la aplicación.
 *
 * Aquí se enganchan las tres piezas que `openspec/specs/api-conventions/spec.md` exige que sean
 * transversales y no responsabilidad de cada manejador: validación de entrada, contrato de error y
 * publicación del contrato.
 */

import { OpenAPIHono } from "@hono/zod-openapi"
import {
  type FieldIssue,
  NotFoundError,
  statusOf,
  toErrorBody,
  ValidationError,
} from "@tfv/contracts"
import { cors } from "hono/cors"
import type { ZodError } from "zod"
import { guardFor } from "../auth/middleware.ts"
import { env, exposeErrorDetails, rateLimitEnabled } from "../env.ts"
import { idempotencyFor } from "./idempotency.ts"
import { identifierShapeFor } from "./identifiers.ts"
import { bodyLimitFor, createRateLimiter, type RateLimitOptions } from "./limits.ts"
import { createLogger, type Logger } from "./logger.ts"
import { mountRoutes, type RegisteredRoute } from "./route.ts"

declare module "hono" {
  interface ContextVariableMap {
    logger: Logger
  }
}

/** Traduce el error de validación del esquema a la forma del contrato. */
function toFieldIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    key: issue.path.map(String).join(".") || "(raíz)",
    message: issue.message,
  }))
}

/**
 * Lo que se puede cambiar al ensamblar.
 *
 * Existe para las pruebas de los propios límites, que necesitan un cupo pequeño y un reloj que
 * puedan mover. **Todo lo demás sale de la configuración**: una aplicación que se arma distinta
 * según quién la llame acaba probándose en una forma que no es la que corre.
 */
export interface AppOptions {
  /** `null` la apaga. Ausente toma la de la configuración. */
  readonly rateLimit?: RateLimitOptions | null | undefined
  readonly maxBodyBytes?: number | undefined
}

export function createApp(
  routes: readonly RegisteredRoute[],
  options: AppOptions = {},
): OpenAPIHono {
  const app = new OpenAPIHono({
    // Toda entrada que no cumpla su esquema se rechaza aquí, antes de llegar al manejador.
    defaultHook: (result) => {
      if (!result.success) throw new ValidationError(toFieldIssues(result.error))
    },
  })

  // ─── Correlación ───────────────────────────────────────────────────────────

  app.use("*", async (c, next) => {
    const incoming = c.req.header("x-request-id")
    const logger = createLogger(incoming)

    c.set("logger", logger)
    c.header("x-request-id", logger.requestId)

    const startedAt = performance.now()
    await next()

    logger.info("petición atendida", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - startedAt),
    })
  })

  // ─── Orígenes cruzados ─────────────────────────────────────────────────────

  app.use(
    "*",
    cors({
      // Lista explícita, nunca comodín: ver `env.ts` y `DEFECTS.md` S-12.
      origin: env.CORS_ORIGINS,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-Id", "Idempotency-Key"],
      exposeHeaders: ["X-Request-Id"],
      credentials: true,
      maxAge: 600,
    }),
  )

  // ─── Frecuencia ────────────────────────────────────────────────────────────

  // Antes que nada: lo que se rechaza por frecuencia no debe costar ni una consulta.
  const rateLimit =
    options.rateLimit === undefined
      ? rateLimitEnabled
        ? { max: env.RATE_LIMIT_MAX, windowMs: env.RATE_LIMIT_WINDOW_MS }
        : null
      : options.rateLimit

  if (rateLimit) app.use("*", createRateLimiter(rateLimit))

  // ─── Contrato de error ─────────────────────────────────────────────────────

  app.onError((error, c) => {
    const status = statusOf(error)
    const logger = c.get("logger")

    // Un fallo no previsto queda íntegro en el registro aunque el cliente vea un mensaje genérico.
    if (status >= 500) {
      logger?.error("fallo no previsto", {
        method: c.req.method,
        path: c.req.path,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }

    return c.json(toErrorBody(error, exposeErrorDetails), status)
  })

  app.notFound((c) => {
    const body = toErrorBody(new NotFoundError("La ruta solicitada no existe"), exposeErrorDetails)
    return c.json(body, 404)
  })

  // ─── Rutas ─────────────────────────────────────────────────────────────────

  /**
   * El orden de las capas es el contrato, no una casualidad.
   *
   * El límite de cuerpo primero: rechazar por tamaño antes de resolver la sesión es lo que impide
   * que una petición desproporcionada cueste una consulta a la base antes de que nadie la mire.
   *
   * La forma de los identificadores **antes que el guardián**, y no es un detalle de orden: el
   * guardián resuelve la membresía contra la empresa del camino, así que con un `companyId`
   * inválido el fallo ocurría dentro del propio guardián, antes de que corriera ningún manejador.
   *
   * Después el guardián, porque nada debe correr sin credencial. Y por último la idempotencia, que
   * necesita saber quién es el actor para acotarle la clave y sin sesión no lo sabría.
   */
  mountRoutes(app, routes, [
    bodyLimitFor(options.maxBodyBytes ?? env.BODY_LIMIT_BYTES),
    identifierShapeFor,
    (route) => guardFor(route.access),
    idempotencyFor,
  ])

  // ─── Contrato publicado ────────────────────────────────────────────────────

  // Se deriva de los mismos esquemas que validan en ejecución, así que no puede quedar desfasado.
  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "TFV API",
      version: "0.0.0",
      description:
        "Contrato derivado de los esquemas de ejecución. Ver openspec/specs/api-conventions.",
    },
  })

  return app
}
