/**
 * Transcripción de los dos escenarios de `api-conventions`, requisito «Las mutaciones de dinero
 * son idempotentes».
 *
 * Lo que se comprueba aquí es la parte **pura**: cómo se decide, dado lo que se guardó la primera
 * vez, si una repetición se contesta con lo mismo o se rechaza. El almacén y el enganche HTTP viven
 * en `apps/api/src/runtime/idempotency.ts` y tienen sus propias pruebas contra la base.
 */

import { describe, expect, it } from "vitest"
import {
  canonicalize,
  decideIdempotency,
  IDEMPOTENCY_HEADER,
  type IdempotencyRecord,
  idempotencyKeySchema,
} from "./idempotency.ts"

function completado(fingerprint: string, body: unknown = { id: "abc" }): IdempotencyRecord {
  return { fingerprint, completedAt: new Date(), responseStatus: 201, responseBody: body }
}

function enCurso(fingerprint: string): IdempotencyRecord {
  return { fingerprint, completedAt: null, responseStatus: null, responseBody: null }
}

describe("la huella del cuerpo", () => {
  it("no depende del orden de las claves", () => {
    // El navegador no garantiza el orden en que serializa un objeto, y dos reintentos del mismo
    // formulario pueden salir con las claves en distinto orden. Si el orden contara, el reintento
    // se leería como «otro cuerpo» y respondería 409 justo cuando debe responder lo mismo.
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }))
  })

  it("depende del orden de los elementos de una lista", () => {
    // Una lista sí es información: dos líneas de cotización intercambiadas son otro documento.
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]))
  })

  it("distingue el número de la cadena", () => {
    expect(canonicalize({ total: 100 })).not.toBe(canonicalize({ total: "100" }))
  })

  it("distingue nulo de ausente", () => {
    // `null` es un valor que se envía a propósito —«bórrame este campo»— y ausente es no tocarlo.
    expect(canonicalize({ a: null })).not.toBe(canonicalize({}))
  })

  it("ignora las claves indefinidas, como hace la serialización", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }))
  })

  it("ordena también las claves anidadas", () => {
    expect(canonicalize({ x: { a: 1, b: 2 } })).toBe(canonicalize({ x: { b: 2, a: 1 } }))
  })

  it("un cuerpo ausente tiene huella propia y estable", () => {
    expect(canonicalize(undefined)).toBe(canonicalize(undefined))
    expect(canonicalize(undefined)).not.toBe(canonicalize(null))
  })
})

describe("la clave", () => {
  it("admite un identificador de los que genera un navegador", () => {
    expect(idempotencyKeySchema.safeParse(crypto.randomUUID()).success).toBe(true)
  })

  it("rechaza una clave demasiado corta para no repetirse por azar", () => {
    expect(idempotencyKeySchema.safeParse("abc").success).toBe(false)
  })

  it("rechaza espacios y caracteres de control", () => {
    expect(idempotencyKeySchema.safeParse("clave con espacios").success).toBe(false)
    expect(idempotencyKeySchema.safeParse("clave\ncon\nsalto").success).toBe(false)
  })

  it("se transporta en el encabezado convencional", () => {
    expect(IDEMPOTENCY_HEADER).toBe("idempotency-key")
  })
})

describe("la decisión", () => {
  it("sin registro previo, la petición sigue su curso", () => {
    expect(decideIdempotency(null, "h1")).toEqual({ kind: "proceed" })
  })

  it("«Un reintento no duplica el efecto»: se devuelve lo de la primera vez", () => {
    const decision = decideIdempotency(completado("h1", { id: "pedido-1" }), "h1")

    expect(decision).toEqual({ kind: "replay", status: 201, body: { id: "pedido-1" } })
  })

  it("«La misma clave con otro cuerpo se rechaza»", () => {
    expect(decideIdempotency(completado("h1"), "h2")).toEqual({ kind: "mismatch" })
  })

  it("la huella se compara antes que el estado: una clave reutilizada se rechaza aunque siga en curso", () => {
    // Si se mirara primero el estado, reutilizar la clave de una petición en vuelo respondería
    // «vuelve a intentarlo» y el segundo intento acabaría cobrando lo que no debía.
    expect(decideIdempotency(enCurso("h1"), "h2")).toEqual({ kind: "mismatch" })
  })

  it("la misma clave con el mismo cuerpo, todavía en curso, no se ejecuta dos veces", () => {
    // Dos peticiones simultáneas. La segunda no puede seguir su curso —cobraría otra vez— ni
    // devolver un resultado que aún no existe.
    expect(decideIdempotency(enCurso("h1"), "h1")).toEqual({ kind: "in_flight" })
  })

  it("una respuesta sin cuerpo se repite igual de bien", () => {
    const sinCuerpo: IdempotencyRecord = {
      fingerprint: "h1",
      completedAt: new Date(),
      responseStatus: 204,
      responseBody: null,
    }

    expect(decideIdempotency(sinCuerpo, "h1")).toEqual({ kind: "replay", status: 204, body: null })
  })
})
