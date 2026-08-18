/**
 * La colección, vista desde el transporte.
 *
 * Ver `openspec/specs/query-and-pagination/spec.md`.
 *
 * Dos piezas: cómo se documenta lo que una colección acepta, y cómo se serializa lo que devuelve.
 * Las dos salen de la **misma** declaración del recurso, así que el contrato publicado no puede
 * quedar diciendo que se filtra por un campo que el recurso ya no admite.
 */

import { z } from "@hono/zod-openapi"
import { type Page, type ParsedQuery, parseQuery, type QuerySchema } from "@tfv/contracts"
import type { Context } from "hono"

/**
 * El sobre de paginación, para el contrato publicado.
 *
 * Es el **mismo** para toda colección, sin excepción: es lo que permite a la interfaz tratarlas
 * todas con un solo componente en lugar de aprenderse la forma de cada una.
 */
// biome-ignore lint/suspicious/noExplicitAny: el esquema del elemento es distinto en cada recurso.
export function pageSchema<T extends z.ZodType<any>>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    limit: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
    hasPrevious: z.boolean(),
    hasNext: z.boolean(),
    previousPage: z.number().int().nullable(),
    nextPage: z.number().int().nullable(),
  })
}

/**
 * Un parámetro de consulta, tal y como el contrato lo publica.
 *
 * Admite **valor suelto o repetido**, y no es cosmético. El validador del transporte corre antes
 * que el análisis, así que lo que este esquema rechace no llega nunca a `parseQuery` — y un
 * intervalo es, por definición de la gramática, la misma clave dos veces. Declarándolo como cadena
 * a secas, `?alta=2026-01-01&alta=2026-12-31` moría con «se esperaba una cadena, llegó una lista»:
 * un mensaje del transporte sobre una petición perfectamente válida.
 *
 * Aquí se deja pasar la forma y se valida el contenido donde están las reglas.
 */
function queryParam(description: string) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .openapi({ description })
}

/**
 * Los parámetros de consulta que el recurso acepta, derivados de su declaración.
 *
 * Se escriben para que aparezcan en el contrato publicado: sin esto, quien lea la documentación no
 * sabría que puede filtrar, y la gramática cerrada sería un secreto en lugar de un contrato.
 *
 * **La validación de verdad no ocurre aquí.** Ocurre en `parseQuery`, contra la misma declaración.
 * Este esquema sólo documenta y deja pasar: un filtro no admitido lo rechaza el análisis, con el
 * mensaje que nombra el campo.
 */
export function collectionQuery(schema: QuerySchema) {
  const shape: Record<string, z.ZodType> = {
    page: queryParam("Página solicitada, base 1"),
    limit: queryParam("Elementos por página"),
    offset: queryParam("Desplazamiento explícito; tiene precedencia sobre «page»"),
  }

  if (schema.searchable.length > 0) {
    shape.search = queryParam(`Búsqueda sobre: ${schema.searchable.join(", ")}`)
  }

  for (const field of schema.sortable) {
    shape[`sort_${field}`] = queryParam(`Orden por ${field}: 1 ascendente, -1 descendente`)
  }

  for (const [key, definition] of Object.entries(schema.filters)) {
    shape[key] = queryParam(describeFilter(definition))
  }

  return z.object(shape)
}

function describeFilter(definition: QuerySchema["filters"][string]): string {
  const parts = [`Filtro ${definition.type}`]
  if (definition.range) parts.push("admite intervalo (dos valores repetidos)")
  if (definition.set) parts.push("admite lista separada por comas")
  if (definition.values) parts.push(`valores: ${definition.values.join(", ")}`)
  return parts.join("; ")
}

/**
 * La consulta de la petición, analizada contra la declaración del recurso.
 *
 * Lee `c.req.queries()` y no `c.req.valid("query")` a propósito: el validado conserva sólo las
 * claves declaradas y **una sola vez cada una**, y la gramática necesita las dos apariciones de un
 * campo para reconocer un intervalo. Un filtro no admitido no llega hasta aquí sin ser visto —
 * `parseQuery` lo rechaza con `400`.
 *
 * `except` deja fuera los parámetros que **no son del lenguaje de colección**: los que el manejador
 * lee por su cuenta porque no filtran ni ordenan nada. Hay que nombrarlos aquí porque el análisis
 * rechaza lo que no reconoce, y esa severidad es deseable — es lo que hace que un filtro mal
 * escrito devuelva `400` en vez de la colección entera.
 */
export function queryOf(
  c: Context,
  schema: QuerySchema,
  except: readonly string[] = [],
): ParsedQuery {
  if (except.length === 0) return parseQuery(schema, c.req.queries())

  const queries = { ...c.req.queries() }
  for (const key of except) delete queries[key]

  return parseQuery(schema, queries)
}

/** Serializa una página aplicando la conversión de cada elemento. */
export function serializePage<T, U>(page: Page<T>, item: (value: T) => U) {
  return { ...page, items: page.items.map(item) }
}
