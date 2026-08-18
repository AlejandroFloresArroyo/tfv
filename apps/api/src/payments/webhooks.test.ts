/**
 * Verificación de los eventos de pago.
 *
 * Transcritas de `openspec/specs/payment-webhooks/spec.md`. Rebanada 07, **bloque crítico**: es el
 * defecto más grave del levantamiento —el manejador anterior fabricaba la firma que después
 * verificaba (`DEFECTS.md` S-01)—, así que estas pruebas no comprueban una función, comprueban que
 * un tercero no pueda activar suscripciones ni materializar pedidos.
 */

import { createHmac } from "node:crypto"
import { closeConnection, db } from "@tfv/db"
import { paymentEvents } from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"
import { verifySignature } from "./webhooks.ts"

const app = createApp(routes)
const SECRET = "un-secreto-compartido-de-prueba"
const OPTIONS = { secret: SECRET, toleranceSeconds: 300 } as const

/** La firma tal y como la manda el procesador: `t=<segundos>,v1=<hexadecimal>`. */
function sign(body: string, secret = SECRET, at: Date = new Date()): string {
  const timestamp = Math.floor(at.getTime() / 1000)
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
  return `t=${timestamp},v1=${signature}`
}

function post(body: string, signature?: string) {
  return app.request("/payments/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
    body,
  })
}

function eventBody(id: string, type = "checkout.session.completed"): string {
  return JSON.stringify({ id, type, data: { object: { id: "cs_test" } } })
}

beforeEach(async () => {
  await db.execute(sql`truncate table ${paymentEvents} cascade`)
})

afterAll(async () => {
  await db.execute(sql`truncate table ${paymentEvents} cascade`)
  await closeConnection()
})

describe("la firma del remitente se verifica", () => {
  it("un evento sin firma se rechaza", async () => {
    // Escenario: «Un evento sin firma se rechaza».
    const response = await post(eventBody("evt_sin_firma"))

    expect(response.status).toBe(400)
    expect(await db.select().from(paymentEvents)).toHaveLength(0)
  })

  it("un cuerpo alterado tras firmarse se rechaza", async () => {
    // Escenario: «Una firma que no corresponde se rechaza». Es la comprobación que la
    // implementación anterior no hacía: firmaba lo recibido y verificaba su propia firma.
    const original = eventBody("evt_original")
    const signature = sign(original)

    const response = await post(eventBody("evt_alterado"), signature)

    expect(response.status).toBe(400)
    expect(await db.select().from(paymentEvents)).toHaveLength(0)
  })

  it("un evento falsificado por un tercero no llega a procesarse", async () => {
    // Escenario: «Un evento falsificado no activa una suscripción». Quien no tiene el secreto no
    // puede producir una firma que valga, por mucho que conozca el formato.
    const body = eventBody("evt_falso")
    const response = await post(body, sign(body, "un-secreto-que-no-es-el-nuestro"))

    expect(response.status).toBe(400)
    expect(await db.select().from(paymentEvents)).toHaveLength(0)
  })

  it("sin secreto configurado se rechaza todo", async () => {
    // No verificar **no es aceptar**. El endpoint queda cerrado, que es la única postura defendible
    // cuando falta la clave — al contrario de la implementación anterior, cuyo secreto por defecto
    // era la palabra «secret» (`DEFECTS.md` S-13).
    const body = eventBody("evt_sin_secreto")

    expect(verifySignature(body, sign(body), { secret: undefined, toleranceSeconds: 300 }).ok).toBe(
      false,
    )
  })

  it("una firma bien formada y correcta se acepta", async () => {
    const body = eventBody("evt_bueno")
    const response = await post(body, sign(body))

    expect(response.status).toBe(200)
    const [stored] = await db.select().from(paymentEvents)
    expect(stored?.externalEventId).toBe("evt_bueno")
    expect(stored?.signatureVerified).toBe(true)
  })
})

describe("la firma tiene ventana temporal", () => {
  it("un evento reproducido pasado el margen se rechaza", async () => {
    // Escenario: «Un evento reproducido tiempo después se rechaza». La firma sigue siendo válida:
    // lo que lo delata es la marca de tiempo, y por eso se comprueba antes que la firma.
    const body = eventBody("evt_viejo")
    const old = new Date(Date.now() - 3600_000)

    const response = await post(body, sign(body, SECRET, old))

    expect(response.status).toBe(400)
    expect(await db.select().from(paymentEvents)).toHaveLength(0)
  })

  it("dentro del margen se acepta", async () => {
    const body = eventBody("evt_reciente")
    const recent = new Date(Date.now() - 30_000)

    expect((await post(body, sign(body, SECRET, recent))).status).toBe(200)
  })
})

describe("cada evento se procesa una sola vez", () => {
  it("un reintento no duplica nada", async () => {
    // Escenario: «Un reintento no duplica el efecto». El procesador reintenta ante cualquier
    // respuesta que no sea de éxito; sin esto, un reintento duplicaría pedidos y pagos (M-03).
    const body = eventBody("evt_repetido")
    const signature = sign(body)

    expect((await post(body, signature)).status).toBe(200)
    // Y el reintento responde **éxito**: responder error provocaría reintentos indefinidos.
    expect((await post(body, signature)).status).toBe(200)

    const rows = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.externalEventId, "evt_repetido"))
    expect(rows).toHaveLength(1)
  })

  it("dos entregas simultáneas dejan una sola fila", async () => {
    // Escenario: «Dos entregas simultáneas producen un solo efecto». Se reclama **insertando**: el
    // índice único convierte la carrera en un conflicto. Comprobar y luego insertar dejaría una
    // ventana entre las dos cosas por la que caben las dos entregas.
    const body = eventBody("evt_a_la_vez")
    const signature = sign(body)

    const [first, second] = await Promise.all([post(body, signature), post(body, signature)])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const rows = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.externalEventId, "evt_a_la_vez"))
    expect(rows).toHaveLength(1)
  })
})

describe("un evento desconocido se acepta sin actuar", () => {
  it("responde éxito y deja constancia", async () => {
    // Escenario: «Un tipo no atendido no provoca reintentos». Responder error acabaría con el
    // procesador desactivando el endpoint.
    const body = eventBody("evt_desconocido", "algo.que.no.atendemos")
    const response = await post(body, sign(body))

    expect(response.status).toBe(200)
    const [stored] = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.externalEventId, "evt_desconocido"))
    expect(stored?.type).toBe("algo.que.no.atendemos")
    // Marcado como atendido: no hay nada pendiente que hacer con él.
    expect(stored?.processedAt).not.toBeNull()
  })
})

describe("la verificación no filtra por dónde falla", () => {
  it("una firma de longitud distinta no se compara byte a byte", () => {
    // `===` sobre cadenas termina en el primer byte distinto, y esa diferencia de tiempo permite
    // adivinar una firma. La comparación exige longitudes iguales y es de tiempo constante.
    const body = eventBody("evt_corta")
    const timestamp = Math.floor(Date.now() / 1000)

    expect(verifySignature(body, `t=${timestamp},v1=ab`, OPTIONS).ok).toBe(false)
    expect(verifySignature(body, `t=${timestamp},v1=no-es-hexadecimal`, OPTIONS).ok).toBe(false)
  })

  it("admite varias firmas, para poder rotar el secreto", () => {
    // Durante una rotación el procesador manda la firma con los dos secretos. Basta con que **una**
    // case; exigir la primera obligaría a una ventana de caída en cada rotación.
    const body = eventBody("evt_rotacion")
    const timestamp = Math.floor(Date.now() / 1000)
    const good = createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex")

    const header = `t=${timestamp},v1=${"0".repeat(64)},v1=${good}`
    expect(verifySignature(body, header, OPTIONS).ok).toBe(true)
  })
})
