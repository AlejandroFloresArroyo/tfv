/**
 * Traducción del contrato publicado a tipos.
 *
 * Ver `openspec/specs/api-conventions/spec.md`, requisito «La API publica su propia descripción», y
 * las tareas «Generación del cliente tipado a partir de esa descripción» de las rebanadas 01 y 03.
 *
 * Se prueba con documentos pequeños y escritos a mano en lugar de con el contrato real: lo que hay
 * que fijar es **cómo se traduce cada forma**, y un documento de ciento veintinueve caminos no deja
 * ver cuál de ellas falló. Que la traducción del contrato real compile lo comprueba `pnpm check`, y
 * que no se quede desfasado, la prueba de desfase del motor.
 */

import { describe, expect, it } from "vitest"
import { emitClientTypes, type OpenApiDocument, toTypeScript } from "./openapi-types.ts"

function doc(paths: OpenApiDocument["paths"]): OpenApiDocument {
  return { openapi: "3.1.0", info: { title: "t", version: "0" }, paths }
}

describe("traducción de esquemas", () => {
  it("los tipos primitivos", () => {
    expect(toTypeScript({ type: "string" })).toBe("string")
    expect(toTypeScript({ type: "number" })).toBe("number")
    expect(toTypeScript({ type: "integer" })).toBe("number")
    expect(toTypeScript({ type: "boolean" })).toBe("boolean")
  })

  it("un anulable de 3.1 es una unión con nulo, no un campo opcional", () => {
    // Son cosas distintas y la diferencia importa: `email: null` se envía a propósito para
    // borrarlo, y `email` ausente es no tocarlo. Tratarlos igual pierde esa distinción.
    expect(toTypeScript({ type: ["string", "null"] })).toBe("string | null")
  })

  it("una enumeración se traduce a la unión de sus literales", () => {
    // No a `string`: es lo que hace que escribir un estado que no existe no compile.
    expect(toTypeScript({ type: "string", enum: ["draft", "sent"] })).toBe('"draft" | "sent"')
  })

  it("un objeto distingue lo obligatorio de lo opcional", () => {
    const emitido = toTypeScript({
      type: "object",
      properties: { id: { type: "string" }, note: { type: "string" } },
      required: ["id"],
    })

    expect(emitido).toContain("id: string")
    expect(emitido).toContain("note?: string")
  })

  it("una clave que no es un identificador válido se entrecomilla", () => {
    const emitido = toTypeScript({
      type: "object",
      properties: { "idempotency-key": { type: "string" } },
      required: [],
    })

    expect(emitido).toContain('"idempotency-key"?: string')
  })

  it("las listas y las uniones", () => {
    expect(toTypeScript({ type: "array", items: { type: "string" } })).toBe("Array<string>")
    expect(toTypeScript({ anyOf: [{ type: "string" }, { type: "number" }] })).toBe(
      "string | number",
    )
  })

  it("un objeto sin propiedades declaradas es un diccionario", () => {
    expect(toTypeScript({ type: "object", additionalProperties: { type: "string" } })).toBe(
      "Record<string, string>",
    )
  })

  it("un esquema sin tipo es desconocido, no cualquiera", () => {
    // `unknown` obliga a comprobar antes de usar; `any` apaga el comprobador justo donde el
    // contrato no dijo nada, que es donde más falta hace.
    expect(toTypeScript({})).toBe("unknown")
  })

  it("un objeto vacío no emite un tipo vacío ilegible", () => {
    expect(toTypeScript({ type: "object", properties: {}, required: [] })).toBe(
      "Record<string, never>",
    )
  })
})

describe("emisión del cliente", () => {
  const contrato = doc({
    "/companies": {
      post: {
        summary: "Crear una empresa",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { name: { type: "string" } },
                required: ["name"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Creada",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { id: { type: "string" } },
                  required: ["id"],
                },
              },
            },
          },
        },
      },
    },
    "/companies/{companyId}": {
      get: {
        summary: "Leer una empresa",
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string" } },
          { name: "expand", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "La empresa",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { id: { type: "string" } },
                  required: ["id"],
                },
              },
            },
          },
        },
      },
    },
  })

  const emitido = emitClientTypes(contrato)

  it("la clave de cada endpoint es su verbo y su camino", () => {
    expect(emitido).toContain('"POST /companies"')
    expect(emitido).toContain('"GET /companies/{companyId}"')
  })

  it("los parámetros del camino salen del propio camino", () => {
    expect(emitido).toContain("companyId: string")
  })

  it("un camino sin parámetros no exige ninguno", () => {
    // `never` no basta: obligaría a pasar algo imposible. Lo que hace falta es que la clave no exista.
    const companies = emitido.slice(emitido.indexOf('"POST /companies"'))
    const bloque = companies.slice(0, companies.indexOf("}\n  "))

    expect(bloque).not.toContain("params:")
  })

  it("el cuerpo y la respuesta viajan con su forma", () => {
    expect(emitido).toContain("body: {")
    expect(emitido).toContain("response: {")
  })

  it("es el mismo texto cada vez que se emite", () => {
    // La comprobación de desfase compara textos: si la emisión dependiera del orden de las claves
    // de un objeto, fallaría sola de vez en cuando y nadie volvería a creerla.
    expect(emitClientTypes(contrato)).toBe(emitido)
  })

  it("lleva el aviso de que no se edita a mano", () => {
    expect(emitido).toMatch(/generad/i)
  })

  it("una respuesta sin cuerpo se declara como tal", () => {
    const sinCuerpo = emitClientTypes(
      doc({
        "/sessions": {
          delete: { summary: "Cerrar sesión", responses: { "204": { description: "Cerrada" } } },
        },
      }),
    )

    expect(sinCuerpo).toContain("response: undefined")
  })

  it("se elige la respuesta correcta cuando hay varias", () => {
    // La de éxito, no la de error: es la que el consumidor recibe cuando todo va bien, y la de
    // error ya tiene su forma común en `errors.ts`.
    const varias = emitClientTypes(
      doc({
        "/things": {
          post: {
            summary: "Crear",
            responses: {
              "201": {
                description: "Creada",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { id: { type: "string" } },
                      required: ["id"],
                    },
                  },
                },
              },
              "409": { description: "Ya existe" },
            },
          },
        },
      }),
    )

    expect(varias).toContain("id: string")
    expect(varias).not.toContain("response: undefined")
  })
})
