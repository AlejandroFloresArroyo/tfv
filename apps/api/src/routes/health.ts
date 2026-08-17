/**
 * Comprobación de salud.
 *
 * Sustituye a la página de bienvenida y a los endpoints de prueba de la pila anterior, que eran
 * andamiaje de la plantilla original (`openspec/project.md` D-09).
 *
 * Comprueba la base de datos de verdad, no sólo que el proceso responda: un servicio que contesta
 * pero no puede leer nada no está sano, y el orquestador tiene que poder distinguirlo.
 */

import { z } from "@hono/zod-openapi"
import { ping } from "@tfv/db"
import { defineRoute, PUBLIC } from "../runtime/route.ts"

const healthResponse = z.object({
  status: z.enum(["ok", "degraded"]),
  database: z.enum(["up", "down"]),
  at: z.string(),
})

export const health = defineRoute({
  access: PUBLIC("Lo consulta el orquestador antes de enrutar tráfico, sin credenciales"),
  config: {
    method: "get",
    path: "/health",
    summary: "Comprobación de salud",
    tags: ["Sistema"],
    responses: {
      200: {
        description: "El servicio atiende y la base responde",
        content: { "application/json": { schema: healthResponse } },
      },
      503: {
        description: "El servicio atiende pero la base no responde",
        content: { "application/json": { schema: healthResponse } },
      },
    },
  },
  handler: async (c) => {
    const at = new Date().toISOString()

    try {
      await ping()
      return c.json({ status: "ok" as const, database: "up" as const, at }, 200)
    } catch (error) {
      c.get("logger")?.error("la base no responde", {
        error: error instanceof Error ? error.message : String(error),
      })
      return c.json({ status: "degraded" as const, database: "down" as const, at }, 503)
    }
  },
})
