/**
 * Lenguaje de consulta de colecciones.
 *
 * Ver `openspec/specs/query-and-pagination/spec.md`.
 *
 * La propiedad que gobierna este módulo: **la gramática es cerrada**. Cada recurso declara qué
 * campos admiten filtro y de qué tipo, y el resultado del análisis es una estructura acotada
 * —igual, rango, conjunto o nulo— que la capa de datos traduce a SQL.
 *
 * En ningún punto un valor de la URL puede alterar la forma de la consulta ejecutada. La
 * implementación anterior no validaba nada, así que se podían inyectar operadores de base de datos
 * arbitrarios desde la barra de direcciones.
 */

import { type FieldIssue, ValidationError } from "./errors.ts"

// ─── Declaración del recurso ─────────────────────────────────────────────────

export type FilterType = "string" | "number" | "boolean" | "date" | "id" | "enum"

export interface FilterDefinition {
  readonly type: FilterType
  /** Admite dos valores repetidos, que se interpretan como intervalo cerrado. */
  readonly range?: boolean
  /** Admite una lista separada por comas. */
  readonly set?: boolean
  /** Valores permitidos. Obligatorio cuando el tipo es `enum`. */
  readonly values?: readonly string[]
  /** Nombre visible en los mensajes de error. Por defecto, la clave. */
  readonly label?: string
}

export interface SortTerm {
  readonly field: string
  readonly direction: "asc" | "desc"
}

export interface QuerySchema {
  /** Campos filtrables. Cualquier otro produce `400`. */
  readonly filters: Readonly<Record<string, FilterDefinition>>
  /**
   * Campos sobre los que actúa la búsqueda por texto.
   *
   * Un recurso con la lista vacía **no admite búsqueda**: el parámetro se ignora sin error, tal y
   * como exige la spec para unidades de stock, ubicaciones, ventas y sesiones.
   */
  readonly searchable: readonly string[]
  /** Campos por los que se puede ordenar. */
  readonly sortable: readonly string[]
  /** Orden por defecto cuando la petición no indica ninguno. */
  readonly defaultSort: readonly SortTerm[]
  readonly defaultLimit?: number
  readonly maxLimit?: number
}

// ─── Resultado del análisis ──────────────────────────────────────────────────

export type ScalarValue = string | number | boolean | Date

export type FilterValue =
  | { readonly kind: "eq"; readonly value: ScalarValue }
  | { readonly kind: "range"; readonly from: ScalarValue; readonly to: ScalarValue }
  | { readonly kind: "in"; readonly values: readonly ScalarValue[] }
  | { readonly kind: "null" }

export interface ParsedQuery {
  readonly page: number
  readonly limit: number
  readonly offset: number | undefined
  readonly search: string | undefined
  readonly sort: readonly SortTerm[]
  readonly filters: Readonly<Record<string, FilterValue>>
}

export const DEFAULT_PAGE = 1
export const DEFAULT_LIMIT = 24
export const MAX_LIMIT = 96

const RESERVED = new Set(["page", "limit", "offset", "search"])
const SORT_PREFIX = "sort_"

// ─── Entrada ─────────────────────────────────────────────────────────────────

export type RawQuery = URLSearchParams | Readonly<Record<string, string | readonly string[]>>

function collect(raw: RawQuery): Map<string, string[]> {
  const collected = new Map<string, string[]>()

  if (raw instanceof URLSearchParams) {
    for (const [key, value] of raw.entries()) {
      const existing = collected.get(key)
      if (existing) existing.push(value)
      else collected.set(key, [value])
    }
    return collected
  }

  for (const [key, value] of Object.entries(raw)) {
    collected.set(key, Array.isArray(value) ? [...value] : [value as string])
  }
  return collected
}

// ─── Coerción ────────────────────────────────────────────────────────────────

const INTEGER_PATTERN = /^-?\d+$/
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/

function coerce(
  value: string,
  definition: FilterDefinition,
  key: string,
  issues: FieldIssue[],
): ScalarValue | undefined {
  const label = definition.label ?? key

  switch (definition.type) {
    case "boolean": {
      if (value === "true") return true
      if (value === "false") return false
      issues.push({ key, message: `${label} debe ser verdadero o falso` })
      return undefined
    }

    case "number": {
      if (!NUMBER_PATTERN.test(value)) {
        issues.push({ key, message: `${label} debe ser un número` })
        return undefined
      }
      return Number(value)
    }

    case "date": {
      const parsed = new Date(value)
      if (Number.isNaN(parsed.getTime())) {
        issues.push({ key, message: `${label} debe ser una fecha válida` })
        return undefined
      }
      return parsed
    }

    case "enum": {
      if (!definition.values?.includes(value)) {
        const allowed = definition.values?.join(", ") ?? ""
        issues.push({ key, message: `${label} debe ser uno de: ${allowed}` })
        return undefined
      }
      return value
    }

    case "id":
    case "string":
      return value
  }
}

// ─── Análisis ────────────────────────────────────────────────────────────────

/**
 * Analiza y valida la cadena de consulta contra la declaración del recurso.
 *
 * Lanza `ValidationError` cuando algo no cumple, con una entrada por cada campo problemático.
 *
 * Nota de alcance: este análisis **no sabe nada de arrendatarios**. Que un filtro no pueda ampliar
 * el alcance del solicitante lo garantiza la capa de datos, no esta función.
 */
export function parseQuery(schema: QuerySchema, raw: RawQuery): ParsedQuery {
  const collected = collect(raw)
  const issues: FieldIssue[] = []

  const maxLimit = schema.maxLimit ?? MAX_LIMIT
  const defaultLimit = schema.defaultLimit ?? DEFAULT_LIMIT

  const page = parsePositiveInteger(collected.get("page"), DEFAULT_PAGE, "page", issues)
  const rawLimit = parsePositiveInteger(collected.get("limit"), defaultLimit, "limit", issues)
  const limit = Math.min(rawLimit, maxLimit)

  const offsetValues = collected.get("offset")
  const offset =
    offsetValues === undefined
      ? undefined
      : parsePositiveInteger(offsetValues, 0, "offset", issues, true)

  const searchRaw = collected.get("search")?.[0]?.trim()
  // Un recurso sin campos de búsqueda declarados ignora el parámetro, sin error.
  const search =
    searchRaw && searchRaw.length > 0 && schema.searchable.length > 0 ? searchRaw : undefined

  const sort = parseSort(collected, schema, issues)
  const filters = parseFilters(collected, schema, issues)

  if (issues.length > 0) throw new ValidationError(issues)

  return { page, limit, offset, search, sort, filters }
}

function parsePositiveInteger(
  values: readonly string[] | undefined,
  fallback: number,
  key: string,
  issues: FieldIssue[],
  allowZero = false,
): number {
  const raw = values?.[0]
  if (raw === undefined || raw.trim() === "") return fallback

  if (!INTEGER_PATTERN.test(raw.trim())) {
    issues.push({ key, message: `${key} debe ser un número entero` })
    return fallback
  }

  const parsed = Number(raw)
  const minimum = allowZero ? 0 : 1
  if (parsed < minimum) {
    issues.push({ key, message: `${key} debe ser al menos ${minimum}` })
    return fallback
  }

  return parsed
}

function parseSort(
  collected: Map<string, string[]>,
  schema: QuerySchema,
  issues: FieldIssue[],
): readonly SortTerm[] {
  const terms: SortTerm[] = []

  // El orden de declaración en la cadena de consulta es el orden de aplicación.
  for (const [key, values] of collected) {
    if (!key.startsWith(SORT_PREFIX)) continue

    const field = key.slice(SORT_PREFIX.length)
    if (!schema.sortable.includes(field)) {
      issues.push({ key, message: `No se puede ordenar por ${field}` })
      continue
    }

    const raw = values[0]?.trim() ?? "1"
    if (raw !== "1" && raw !== "-1") {
      issues.push({ key, message: `${key} debe ser 1 o -1` })
      continue
    }

    terms.push({ field, direction: raw === "-1" ? "desc" : "asc" })
  }

  return terms.length > 0 ? terms : schema.defaultSort
}

function parseFilters(
  collected: Map<string, string[]>,
  schema: QuerySchema,
  issues: FieldIssue[],
): Readonly<Record<string, FilterValue>> {
  const filters: Record<string, FilterValue> = {}

  for (const [key, values] of collected) {
    // Claves internas de la interfaz: se descartan sin error.
    if (key.startsWith("_")) continue
    if (RESERVED.has(key) || key.startsWith(SORT_PREFIX)) continue

    const definition = schema.filters[key]
    if (!definition) {
      issues.push({ key, message: `No se puede filtrar por ${key}` })
      continue
    }

    const parsed = parseFilterValue(key, values, definition, issues)
    if (parsed) filters[key] = parsed
  }

  return filters
}

function parseFilterValue(
  key: string,
  values: readonly string[],
  definition: FilterDefinition,
  issues: FieldIssue[],
): FilterValue | undefined {
  const label = definition.label ?? key

  // Dos valores repetidos forman un intervalo cerrado, cuando el campo lo admite.
  if (values.length === 2) {
    if (!definition.range) {
      issues.push({ key, message: `${label} no admite intervalos` })
      return undefined
    }
    const from = coerce(values[0] as string, definition, key, issues)
    const to = coerce(values[1] as string, definition, key, issues)
    if (from === undefined || to === undefined) return undefined
    return { kind: "range", from, to }
  }

  if (values.length > 2) {
    issues.push({ key, message: `${label} recibió demasiados valores` })
    return undefined
  }

  const single = (values[0] ?? "").trim()

  if (single === "null") return { kind: "null" }

  // Lista separada por comas, cuando el campo declara que admite conjuntos.
  if (definition.set && single.includes(",")) {
    const parts = single
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)

    if (parts.length === 0) {
      issues.push({ key, message: `${label} recibió una lista vacía` })
      return undefined
    }

    const coerced: ScalarValue[] = []
    for (const part of parts) {
      const value = coerce(part, definition, key, issues)
      if (value !== undefined) coerced.push(value)
    }
    if (coerced.length !== parts.length) return undefined
    return { kind: "in", values: coerced }
  }

  const value = coerce(single, definition, key, issues)
  if (value === undefined) return undefined
  return { kind: "eq", value }
}
