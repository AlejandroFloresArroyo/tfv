/**
 * Recepción de eventos del procesador de pagos.
 *
 * Ver `openspec/specs/payment-webhooks/spec.md`. Rebanada 07, bloque crítico.
 *
 * **Es público a propósito**: lo llama un tercero que no tiene sesión. Lo que lo protege no es una
 * credencial de usuario sino la firma del remitente, y por eso la verificación es lo primero que
 * ocurre — antes de mirar el cuerpo, antes de tocar nada.
 *
 * El cuerpo se lee **sin procesar**. No se declara esquema de entrada a propósito: dejar que el
 * validador lo interprete y volver a serializarlo produciría un texto distinto del que se firmó, y
 * la verificación pasaría a hablar de otra cosa que la que luego se interpreta.
 */

import { z } from "@hono/zod-openapi"
import { env } from "../env.ts"
import { receiveEvent, verifySignature } from "../payments/webhooks.ts"
import { rootLogger } from "../runtime/logger.ts"
import { defineRoute, PUBLIC } from "../runtime/route.ts"

/** El encabezado en el que viaja la firma. Es el nombre que usa el procesador. */
const SIGNATURE_HEADER = "stripe-signature"

export const paymentWebhookRoute = defineRoute({
  access: PUBLIC("Lo llama el procesador de pagos, que no tiene sesión. Lo protege su firma"),
  config: {
    method: "post",
    path: "/payments/events",
    summary: "Recibir un evento del procesador de pagos",
    tags: ["Pagos"],
    responses: {
      200: {
        description: "Recibido. También cuando es un duplicado o un tipo que no se atiende.",
        content: { "application/json": { schema: z.object({ received: z.literal(true) }) } },
      },
      400: { description: "La firma falta, no corresponde, o quedó fuera de la ventana" },
      500: { description: "Falló el procesamiento. El procesador debe reintentar." },
    },
  },
  handler: async (c) => {
    const rawBody = await c.req.text()
    const verification = verifySignature(rawBody, c.req.header(SIGNATURE_HEADER), {
      secret: env.PAYMENTS_WEBHOOK_SECRET,
      toleranceSeconds: env.PAYMENTS_WEBHOOK_TOLERANCE,
    })

    if (!verification.ok) {
      // Se registra el motivo, pero **no se devuelve**: decirle a quien lo intenta si falló la
      // firma o la ventana es decirle en qué va bien.
      rootLogger.warn("evento de pago rechazado", { reason: verification.reason })
      return c.json({ statusCode: 400, error: "invalid_signature", message: "Firma inválida" }, 400)
    }

    // Sólo se interpreta lo que ya se verificó. Un cuerpo que no es JSON con firma válida sería
    // cosa del procesador, y se trata como lo que es: una petición mal formada.
    let event: { id?: unknown; type?: unknown; data?: unknown }
    try {
      event = JSON.parse(rawBody) as typeof event
    } catch {
      return c.json({ statusCode: 400, error: "invalid_body", message: "Cuerpo ilegible" }, 400)
    }

    if (typeof event.id !== "string" || typeof event.type !== "string") {
      return c.json({ statusCode: 400, error: "invalid_body", message: "Evento sin tipo" }, 400)
    }

    const outcome = await receiveEvent(
      {
        id: event.id,
        type: event.type,
        data: (event.data as Record<string, unknown>) ?? {},
      },
      event,
    )

    if (outcome.kind === "sin_manejador") {
      // Éxito y constancia. Responder con error provocaría reintentos indefinidos y, con el tiempo,
      // que el procesador desactivara el endpoint.
      rootLogger.info("evento de pago sin manejador", { type: outcome.type })
    }

    return c.json({ received: true } as const, 200)
  },
})
