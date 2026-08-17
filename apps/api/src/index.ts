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
import { env } from "./env.ts"
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

  // Apagado ordenado: dejar de aceptar peticiones, terminar las en curso, soltar la base.
  const shutdown = (signal: string) => {
    rootLogger.info("apagando", { signal })
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
