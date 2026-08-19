/**
 * Arranque del servicio.
 *
 * Dos garantías que la pila anterior no daba:
 *
 * - **No arranca sin configuración válida.** Importar `env` la valida y lanza si falta algo.
 * - **No arranca si la base no responde.** La conexión anterior se lanzaba sin esperarla y sin
 *   manejar su fallo, así que el servidor se levantaba con la base caída y devolvía errores
 *   incomprensibles hasta que alguien miraba (`DEFECTS.md` O-01).
 */

import { serve } from "@hono/node-server"
import { closeConnection, ping } from "@tfv/db"
import { localProvider, usePaymentProvider } from "./billing/provider.ts"
import { env } from "./env.ts"
import { type RunningDispatcher, startDispatcher } from "./jobs/dispatcher.ts"
import { registerBuiltinJobs } from "./jobs/handlers.ts"
import { routes } from "./routes/index.ts"
import { createApp } from "./runtime/app.ts"
import { rootLogger } from "./runtime/logger.ts"
import { describeRoutes, publicRoutes } from "./runtime/route.ts"

async function main() {
  // La base primero: sin ella no tiene sentido aceptar tráfico.
  try {
    await ping()
  } catch (error) {
    // Los errores del controlador de base traen el detalle útil en `code` y `errno`, no siempre en
    // el mensaje: sin ellos, el registro dice que falló pero no por qué.
    const detail = error as { message?: string; code?: string; errno?: string; address?: string }

    rootLogger.error("no se pudo conectar con la base de datos; el servicio no arranca", {
      causa: detail.message || detail.code || String(error),
      code: detail.code,
      direccion: detail.address,
      pista:
        detail.code === "ECONNREFUSED"
          ? "¿Está la base levantada? `pnpm db:up`"
          : "Revisa DATABASE_URL",
    })
    process.exit(1)
  }

  /**
   * Qué procesador de pagos hay puesto.
   *
   * Sin esta línea queda el de fábrica, que **falla en toda operación de cobro** diciendo qué falta.
   * El suplente se pide de forma explícita y se anuncia en el registro, para que nadie tenga que
   * averiguar por qué una suscripción se activó sin que nadie pagara nada.
   */
  if (env.PAYMENTS_PROVIDER === "local") {
    usePaymentProvider(localProvider())
    rootLogger.warn(
      "procesador de pagos SUPLENTE: no mueve dinero y las suscripciones se activan sin cobrar",
    )
  }

  const app = createApp(routes)

  const server = serve({ fetch: app.fetch, port: env.API_PORT, hostname: env.API_HOST }, (info) => {
    rootLogger.info("servicio escuchando", {
      url: `http://${env.API_HOST}:${info.port}`,
      entorno: env.NODE_ENV,
      rutas: routes.length,
      publicas: publicRoutes(routes).length,
    })

    if (env.NODE_ENV === "development") {
      for (const route of describeRoutes(routes)) {
        rootLogger.info(`  ${route.method.padEnd(6)} ${route.path.padEnd(28)} ${route.access}`)
      }
    }
  })

  /**
   * El despachador de trabajos, si esta instancia lo atiende.
   *
   * Arranca **después** del servidor: encolar no depende de él —las mutaciones dejan sus avisos en
   * la cola pase lo que pase—, así que si tarda o falla la primera vuelta, el servicio ya está
   * atendiendo peticiones.
   */
  let dispatcher: RunningDispatcher | null = null

  if (env.JOBS_ENABLED) {
    registerBuiltinJobs()
    dispatcher = startDispatcher({
      intervalMs: env.JOBS_INTERVAL_MS,
      stuckAfterMs: env.JOBS_STUCK_AFTER_MS,
      backoffMs: env.JOBS_BACKOFF_MS,
      maxBackoffMs: env.JOBS_MAX_BACKOFF_MS,
    })
    rootLogger.info("despachador de trabajos en marcha", { cada: env.JOBS_INTERVAL_MS })
  } else {
    rootLogger.warn("despachador de trabajos apagado: los trabajos se encolan y nadie los atiende")
  }

  // Apagado ordenado: dejar de aceptar peticiones, terminar las en curso, soltar la base.
  const shutdown = (signal: string) => {
    rootLogger.info("apagando", { signal })
    dispatcher?.stop()
    server.close(async () => {
      await closeConnection()
      process.exit(0)
    })
  }

  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch((error) => {
  rootLogger.error("fallo durante el arranque", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  process.exit(1)
})
