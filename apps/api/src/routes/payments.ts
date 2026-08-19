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
import { NotFoundError } from "@tfv/contracts"
import { paymentProvider } from "../billing/provider.ts"
import { env } from "../env.ts"
import {
  localCheckoutView,
  payLocalCheckout,
  renderCheckoutPage,
} from "../payments/local-processor.ts"
import { receiveEvent, verifySignature, webhookSecret } from "../payments/webhooks.ts"
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
      secret: webhookSecret(),
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

// ─── La página de cobro del suplente ─────────────────────────────────────────

/**
 * Las dos rutas del procesador **suplente**.
 *
 * Ver `payments/local-processor.ts`, que explica por qué el suplente tiene página propia en vez de
 * devolver directamente a la aplicación. En dos líneas: la suscripción tiene que nacer del evento
 * firmado, que es el camino que recorrerá el procesador de verdad, y hace falta un disparador
 * explícito para que «abandonar el pago no deja suscripción» siga siendo un recorrido posible.
 *
 * **Son públicas porque el procesador no tiene sesión**, y el suplente tampoco la finge: quien llega
 * aquí viene redirigido desde la aplicación y su credencial no viaja —va acotada al camino bajo el
 * que el navegador ve la API, y esto no cuelga de la aplicación—. Lo que protege la activación no es
 * quién abre esta página, sino la firma del evento que se emite al pagar.
 *
 * Y **no existen si no hay suplente puesto**: sin él la sesión no está en ningún registro y la
 * respuesta es `404`, la misma que cualquier dirección que no lleva a nada.
 */
const standInParams = z.object({
  session: z
    .string()
    .min(1)
    .openapi({ param: { name: "session", in: "path" }, example: "local_cs_…" }),
})

/** Sin suplente puesto no hay página que servir; con él, sólo la de una sesión que exista. */
function standInAvailable(): void {
  if (paymentProvider().name !== "local") {
    throw new NotFoundError("La ruta solicitada no existe")
  }
}

export const localCheckoutPageRoute = defineRoute({
  access: PUBLIC(
    "Es la página del procesador suplente: quien llega viene redirigido y sin credencial",
  ),
  config: {
    method: "get",
    path: "/payments/local/checkouts/{session}",
    summary: "Página de cobro del procesador suplente",
    tags: ["Pagos"],
    request: { params: standInParams },
    responses: {
      200: {
        description: "La página en la que se paga o se abandona",
        content: { "text/html": { schema: z.string() } },
      },
      404: { description: "No hay suplente puesto, o la sesión no existe" },
    },
  },
  handler: async (c) => {
    standInAvailable()

    const view = await localCheckoutView(c.req.valid("param").session)
    if (!view) throw new NotFoundError("Esa sesión de pago no existe")

    return c.html(renderCheckoutPage(view))
  },
})

export const localCheckoutPayRoute = defineRoute({
  access: PUBLIC(
    "Es el botón de pagar del procesador suplente, en su propia página y sin credencial",
  ),
  config: {
    method: "post",
    path: "/payments/local/checkouts/{session}/pay",
    summary: "Pagar en el procesador suplente y emitir su evento firmado",
    tags: ["Pagos"],
    request: { params: standInParams },
    responses: {
      303: { description: "Pagado. Se devuelve al navegador a la aplicación." },
      404: { description: "No hay suplente puesto, o la sesión no existe" },
    },
  },
  handler: async (c) => {
    standInAvailable()

    const { session } = c.req.valid("param")
    if (!(await localCheckoutView(session))) throw new NotFoundError("Esa sesión de pago no existe")

    // Se espera a que el evento esté entregado y atendido **antes** de devolver al navegador. El
    // procesador de verdad no lo garantiza —su aviso y el retorno son dos carreras distintas—, pero
    // aquí sí se puede, y hacerlo es lo que permite que la pantalla de vuelta enseñe el resultado
    // sin recargar ni esperar. Si la entrega falla, se responde error en vez de fingir que se pagó.
    const backTo = await payLocalCheckout(session)

    // `303` y no `302`: lo que sigue es una lectura, y el navegador no debe repetir el `POST` si
    // alguien recarga la página de vuelta.
    return c.redirect(backTo, 303)
  },
})
