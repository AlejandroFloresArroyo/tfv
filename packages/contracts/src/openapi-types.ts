/**
 * Del contrato publicado a tipos de TypeScript.
 *
 * Ver `openspec/specs/api-conventions/spec.md`, requisito «La API publica su propia descripción», y
 * las tareas «Generación del cliente tipado a partir de esa descripción» de las rebanadas 01 y 03.
 *
 * ## Por qué se genera y no se escribe
 *
 * La pila anterior tenía **ochenta y dos archivos de cliente escritos a mano**. El problema no era
 * el tamaño: era que nada los ataba al servidor. Cambiar un campo en la API dejaba al cliente
 * afirmando un tipo que ya no existía, y el desfase sólo se notaba al ejecutar la pantalla que lo
 * usaba — a veces meses después.
 *
 * Aquí los tipos salen del **mismo documento que se deriva de los esquemas de ejecución**, así que
 * un cambio en el servidor rompe la compilación del navegador. Es la propiedad que se busca: que el
 * desfase sea un error de compilación y no un fallo en producción.
 *
 * ## Por qué la traducción vive aquí y no en una herramienta de terceros
 *
 * Porque el subconjunto de JSON Schema que este contrato usa es pequeño y cerrado: lo emite
 * `zod-openapi` a partir de los esquemas de ejecución, sin referencias ni componentes. Traducirlo
 * son doscientas líneas comprobables, y a cambio no hay una dependencia más entre el contrato y su
 * consumidor — que es justo el sitio donde una dependencia desalineada duele.
 *
 * Lo que **no** se traduce se emite como `unknown`, nunca como `any`: un tipo que el contrato no
 * declaró tiene que obligar a comprobar, no apagar el comprobador.
 */

// ─── El documento, tal y como esta traducción necesita verlo ─────────────────

export interface JsonSchema {
  readonly type?: string | readonly string[]
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly required?: readonly string[]
  readonly items?: JsonSchema
  readonly enum?: readonly (string | number | boolean | null)[]
  readonly anyOf?: readonly JsonSchema[]
  readonly oneOf?: readonly JsonSchema[]
  readonly allOf?: readonly JsonSchema[]
  readonly additionalProperties?: JsonSchema | boolean
  readonly const?: string | number | boolean | null
}

export interface OpenApiParameter {
  readonly name: string
  readonly in: "path" | "query" | "header" | "cookie"
  readonly required?: boolean
  readonly schema?: JsonSchema
}

interface Body {
  readonly content?: Readonly<Record<string, { readonly schema?: JsonSchema }>>
}

export interface OpenApiOperation {
  readonly summary?: string
  readonly parameters?: readonly OpenApiParameter[]
  readonly requestBody?: Body
  readonly responses?: Readonly<Record<string, Body & { readonly description?: string }>>
}

export interface OpenApiDocument {
  readonly openapi: string
  readonly info: { readonly title: string; readonly version: string }
  readonly paths: Readonly<Record<string, Readonly<Record<string, OpenApiOperation>>>>
}

// ─── Traducción de un esquema ────────────────────────────────────────────────

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * Traduce un esquema a la expresión de tipo equivalente.
 *
 * `indent` es la sangría del bloque que lo contiene, para que los objetos anidados salgan legibles.
 */
export function toTypeScript(schema: JsonSchema, indent = ""): string {
  if (schema.const !== undefined) return JSON.stringify(schema.const)

  if (schema.enum) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ")
  }

  const union = schema.anyOf ?? schema.oneOf
  if (union) return union.map((member) => toTypeScript(member, indent)).join(" | ")

  if (schema.allOf) {
    return schema.allOf.map((member) => toTypeScript(member, indent)).join(" & ")
  }

  // En OpenAPI 3.1 lo anulable es una lista de tipos: `["string", "null"]`. No es lo mismo que un
  // campo opcional, y confundirlos pierde la distinción entre «bórralo» y «no lo toques».
  if (Array.isArray(schema.type)) {
    return schema.type.map((one) => toTypeScript({ ...schema, type: one }, indent)).join(" | ")
  }

  switch (schema.type) {
    case "string":
      return "string"
    case "number":
    case "integer":
      return "number"
    case "boolean":
      return "boolean"
    case "null":
      return "null"
    case "array":
      return `Array<${schema.items ? toTypeScript(schema.items, indent) : "unknown"}>`
    case "object":
      return objectType(schema, indent)
    default:
      return "unknown"
  }
}

function objectType(schema: JsonSchema, indent: string): string {
  const properties = Object.entries(schema.properties ?? {})

  if (properties.length === 0) {
    const extra = schema.additionalProperties
    if (extra && typeof extra === "object") return `Record<string, ${toTypeScript(extra, indent)}>`

    // Un objeto sin propiedades declaradas no es `{}` —que en TypeScript admite casi todo— sino un
    // objeto del que el contrato no declara ninguna clave.
    return "Record<string, never>"
  }

  const required = new Set(schema.required ?? [])
  const inner = `${indent}  `

  const lines = properties
    .map(([name, property]) => {
      const key = IDENTIFIER.test(name) ? name : JSON.stringify(name)
      const mark = required.has(name) ? "" : "?"
      return `${inner}${key}${mark}: ${toTypeScript(property, inner)}`
    })
    .join("\n")

  return `{\n${lines}\n${indent}}`
}

// ─── Emisión del mapa de endpoints ───────────────────────────────────────────

const METHODS = ["get", "post", "put", "patch", "delete"] as const

const HEADER = `/**
 * Cliente tipado del contrato publicado. **Generado: no se edita a mano.**
 *
 * Se emite con \`pnpm --filter @tfv/api contract\` a partir de \`/openapi.json\`, que a su vez se
 * deriva de los esquemas que validan en ejecución. Una prueba comprueba que este archivo coincide
 * con lo que el registro de rutas produce ahora mismo: si alguien cambia una ruta y no lo regenera,
 * falla ahí y no en la pantalla que lo usaba.
 *
 * Ver \`packages/contracts/src/openapi-types.ts\` y \`api-client.ts\`.
 */
`

/**
 * Emite el mapa de endpoints del contrato.
 *
 * La clave es `"VERBO /camino"` —con el camino tal y como lo declara el contrato, con sus llaves—
 * porque es lo que identifica un endpoint sin ambigüedad: el mismo camino con dos verbos son dos
 * endpoints con cuerpos y respuestas distintas.
 *
 * **La emisión es determinista.** Los caminos y los verbos se ordenan, y las propiedades salen en el
 * orden del documento. La comprobación de desfase compara textos: si el resultado dependiera del
 * orden de iteración de un objeto, fallaría sola de vez en cuando y nadie volvería a creerla.
 */
export function emitClientTypes(doc: OpenApiDocument): string {
  const entries: string[] = []

  for (const path of Object.keys(doc.paths).sort()) {
    const operations = doc.paths[path] ?? {}

    for (const method of METHODS) {
      const operation = operations[method]
      if (!operation) continue

      entries.push(endpointEntry(method.toUpperCase(), path, operation))
    }
  }

  return `${HEADER}
export interface ApiEndpoints {
${entries.join("\n")}}

/** Todo endpoint del contrato, como \`"POST /companies"\`. */
export type ApiEndpoint = keyof ApiEndpoints

/** Lo que hay que aportar para llamar a un endpoint. */
export type ApiInput<E extends ApiEndpoint> = Omit<ApiEndpoints[E], "response">

/** Lo que devuelve. */
export type ApiOutput<E extends ApiEndpoint> = ApiEndpoints[E] extends { response: infer R }
  ? R
  : undefined
`
}

function endpointEntry(method: string, path: string, operation: OpenApiOperation): string {
  const lines: string[] = []
  const indent = "    "

  if (operation.summary) lines.push(`    /** ${operation.summary} */`)

  const params = pathParams(path)
  if (params.length > 0) {
    const fields = params.map((name) => `      ${name}: string`).join("\n")
    lines.push(`    params: {\n${fields}\n    }`)
  }

  const query = declared(operation, "query")
  if (query) lines.push(`    query?: ${objectType(query, indent)}`)

  const headers = declared(operation, "header")
  if (headers) lines.push(`    headers?: ${objectType(headers, indent)}`)

  const body = schemaOf(operation.requestBody)
  if (body) lines.push(`    body: ${toTypeScript(body, indent)}`)

  lines.push(`    response: ${responseType(operation, indent)}`)

  return `  "${method} ${path}": {\n${lines.join("\n")}\n  }\n`
}

/** Los parámetros del camino salen del camino, no de la lista: ahí es donde son obligatorios. */
function pathParams(path: string): string[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string)
}

/** Reúne los parámetros de un sitio —consulta, encabezado— en un solo objeto. */
function declared(operation: OpenApiOperation, where: "query" | "header"): JsonSchema | null {
  const relevant = (operation.parameters ?? []).filter((parameter) => parameter.in === where)
  if (relevant.length === 0) return null

  return {
    type: "object",
    properties: Object.fromEntries(
      relevant.map((parameter) => [parameter.name, parameter.schema ?? {}]),
    ),
    required: relevant.filter((parameter) => parameter.required).map((parameter) => parameter.name),
  }
}

function schemaOf(body: Body | undefined): JsonSchema | null {
  return body?.content?.["application/json"]?.schema ?? null
}

/**
 * El tipo de la respuesta correcta.
 *
 * Se toma la primera respuesta de éxito con cuerpo declarado, en orden de código. Las de error no
 * entran: su forma es común y está en `errors.ts`, y el transporte las convierte en excepción antes
 * de que nadie mire este tipo.
 */
function responseType(operation: OpenApiOperation, indent: string): string {
  const successes = Object.keys(operation.responses ?? {})
    .filter((code) => code.startsWith("2"))
    .sort()

  for (const code of successes) {
    const schema = schemaOf(operation.responses?.[code])
    if (schema) return toTypeScript(schema, indent)
  }

  // `undefined` y no `void`: en posición de tipo, `void` significa «no mires esto», y aquí lo que
  // el contrato dice es que la respuesta **no tiene cuerpo**, que es un valor concreto.
  return "undefined"
}
