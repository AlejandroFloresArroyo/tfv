/**
 * Recepción verificada de eventos del procesador de pagos.
 *
 * Ver `openspec/specs/payment-webhooks/spec.md`. Rebanada 07, **bloque crítico**.
 *
 * ## El defecto que esto corrige
 *
 * La implementación anterior **generaba su propia firma y la verificaba** (`DEFECTS.md` S-01):
 * tomaba el cuerpo recibido, lo firmaba con el secreto compartido, y comprobaba esa firma que
 * acababa de fabricar. La comprobación pasaba siempre. Como el endpoint no requiere autenticación
 * —correctamente, porque lo llama un tercero—, cualquiera podía publicar un evento falso y activar
 * una suscripción, cambiar un plan o materializar un pedido que nadie pagó.
 *
 * Es el defecto más grave del levantamiento completo. Lo que sigue es su contrario:
 *
 * - La firma que se verifica es **la que trae la petición**, no una fabricada aquí.
 * - Se verifica sobre el **cuerpo sin procesar**, tal cual llegó. Un cuerpo re-serializado no es el
 *   mismo texto y la firma dejaría de corresponder — o peor, correspondería a algo distinto de lo
 *   que se va a interpretar.
 * - La comparación es de **tiempo constante**: comparar cadenas con `===` filtra, byte a byte,
 *   cuánto acertó quien lo intenta.
 * - Hay **ventana temporal**: una firma legítima capturada y reproducida más tarde no vale.
 *
 * ## Una sola vez
 *
 * El procesador reintenta ante cualquier respuesta que no sea de éxito, así que sin garantía de
 * unicidad un reintento duplicaría pedidos, pagos y movimientos de inventario (`DEFECTS.md` M-03).
 *
 * El evento se **reclama insertando**: el índice único sobre el identificador del proveedor
 * convierte la carrera en un conflicto, y un conflicto significa «ya lo tiene otro». No hay
 * comprobar-y-luego-insertar, que deja una ventana entre las dos cosas por la que caben dos
 * entregas simultáneas.
 *
 * ## Todo o nada
 *
 * La reclamación y los efectos van en la misma transacción. Si algo falla a mitad, se revierte
 * **también la reclamación** —de modo que el reintento del procesador puede volver a intentarlo— y
 * se responde con error para provocarlo.
 */

import { createHmac, timingSafeEqual } from "node:crypto"
import { newId } from "@tfv/contracts"
import { db, type Transaction } from "@tfv/db"
import { paymentEvents } from "@tfv/db/schema"
import { eq } from "drizzle-orm"
import { BILLING_HANDLERS } from "../billing/events.ts"

export type VerificationFailure =
  | "sin_secreto"
  | "sin_firma"
  | "firma_ilegible"
  | "firma_invalida"
  | "fuera_de_ventana"

export type Verification =
  | { readonly ok: true; readonly timestamp: number }
  | { readonly ok: false; readonly reason: VerificationFailure }

/**
 * Comprueba la firma que **acompaña a la petición**.
 *
 * El formato es el del procesador: `t=<segundos>,v1=<hexadecimal>`, y lo firmado es
 * `<segundos>.<cuerpo>`. Puede venir más de un `v1` durante una rotación de secreto, así que se
 * admite que **alguno** case.
 */
export function verifySignature(
  rawBody: string,
  header: string | null | undefined,
  options: {
    /** Ausente significa **sin configurar**, y sin configurar se rechaza todo. */
    readonly secret: string | undefined
    readonly toleranceSeconds: number
    readonly now?: Date | undefined
  },
): Verification {
  const { secret, toleranceSeconds } = options
  const now = options.now ?? new Date()

  // Sin secreto no se verifica nada, y no verificar nada **no es aceptar**: es rechazar. El endpoint
  // queda cerrado en lugar de abierto, que es la única postura defendible cuando falta la clave.
  if (!secret) return { ok: false, reason: "sin_secreto" }
  if (!header) return { ok: false, reason: "sin_firma" }

  const parts = new Map<string, string[]>()
  for (const chunk of header.split(",")) {
    const [key, value] = chunk.split("=", 2)
    if (!key || !value) continue
    parts.set(key.trim(), [...(parts.get(key.trim()) ?? []), value.trim()])
  }

  const timestamp = Number(parts.get("t")?.[0])
  const signatures = parts.get("v1") ?? []
  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    return { ok: false, reason: "firma_ilegible" }
  }

  // La ventana se comprueba **antes** que la firma: un evento reproducido trae una firma válida, y
  // lo que lo delata es la marca de tiempo.
  const age = Math.abs(Math.floor(now.getTime() / 1000) - timestamp)
  if (age > toleranceSeconds) return { ok: false, reason: "fuera_de_ventana" }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest()
  const matches = signatures.some((candidate) => equalInConstantTime(candidate, expected))

  return matches ? { ok: true, timestamp } : { ok: false, reason: "firma_invalida" }
}

/**
 * Compara sin filtrar por el tiempo que tarda.
 *
 * `===` sobre cadenas termina en el primer byte distinto, y esa diferencia de tiempo es medible: se
 * puede adivinar una firma byte a byte. `timingSafeEqual` exige además longitudes iguales, así que
 * la de la firma se comprueba antes y por separado.
 */
function equalInConstantTime(candidateHex: string, expected: Buffer): boolean {
  if (!/^[0-9a-f]+$/i.test(candidateHex)) return false
  const candidate = Buffer.from(candidateHex, "hex")
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export interface PaymentEvent {
  readonly id: string
  readonly type: string
  readonly data: Record<string, unknown>
}

export type Outcome =
  /** Se reclamó y se procesó. */
  | { readonly kind: "procesado"; readonly type: string }
  /** Ya lo tenía otro: se responde con éxito y no se repite nada. */
  | { readonly kind: "duplicado" }
  /** Tipo que no se atiende. Queda constancia y se responde con éxito. */
  | { readonly kind: "sin_manejador"; readonly type: string }

/**
 * Qué hace el sistema con cada tipo de evento.
 *
 * **Estuvo vacío hasta la rebanada 11**, y el comentario de entonces decía por qué: los manejadores
 * actúan sobre suscripciones, que no existían. Ya existen, y viven en `billing/events.ts` —aquí
 * sólo se enchufan— porque lo que este archivo protege es la recepción, no el dominio: la
 * verificación de la firma, la unicidad y la transaccionalidad no dependen de qué se haga después.
 *
 * Sigue faltando el cobro en tienda pública (`payment_intent.*`), que es de la rebanada 18. Lo que
 * no esté en la tabla cae en «sin manejador», que responde éxito y deja constancia — que es lo que
 * la spec pide para un tipo no atendido, y lo que evita que el procesador reintente indefinidamente
 * y acabe desactivando el endpoint.
 */
const HANDLERS: Readonly<Record<string, (tx: Transaction, event: PaymentEvent) => Promise<void>>> =
  BILLING_HANDLERS

/**
 * Recibe un evento ya verificado.
 *
 * Lanza si el manejador falla: quien llama responde con error para que el procesador reintente, y
 * la transacción revierte **también la reclamación**, de modo que el reintento pueda reclamarlo.
 */
export async function receiveEvent(event: PaymentEvent, rawPayload: unknown): Promise<Outcome> {
  const handler = HANDLERS[event.type]

  return db.transaction(async (tx) => {
    // Reclamar insertando. El índice único convierte la carrera en un conflicto, y el conflicto es
    // la respuesta: ya lo tiene otro.
    const claimed = await tx
      .insert(paymentEvents)
      .values({
        id: newId(),
        externalEventId: event.id,
        type: event.type,
        payload: (rawPayload as Record<string, unknown>) ?? {},
        signatureVerified: true,
        ...(handler ? {} : { processedAt: new Date() }),
      })
      .onConflictDoNothing({ target: paymentEvents.externalEventId })
      .returning({ id: paymentEvents.id })

    if (claimed.length === 0) return { kind: "duplicado" }
    if (!handler) return { kind: "sin_manejador", type: event.type }

    await handler(tx, event)

    await tx
      .update(paymentEvents)
      .set({ processedAt: new Date() })
      .where(eq(paymentEvents.id, claimed[0]?.id as string))

    return { kind: "procesado", type: event.type }
  })
}
