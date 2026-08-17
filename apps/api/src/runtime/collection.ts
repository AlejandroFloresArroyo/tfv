/**
 * Del lenguaje de consulta a SQL.
 *
 * Ver `openspec/specs/query-and-pagination/spec.md`.
 *
 * `parseQuery` —en `@tfv/contracts`— convierte la cadena de consulta en una estructura acotada.
 * Este módulo traduce esa estructura a las cláusulas del motor. La separación importa: el análisis
 * no toca la base y se prueba solo, y **la traducción no ve texto de la URL**, sólo valores ya
 * validados contra el tipo declarado del campo.
 *
 * De ahí sale la propiedad que la spec exige: no se puede expresar un operador arbitrario desde la
 * barra de direcciones. El conjunto de operadores es este archivo, y son cuatro.
 *
 * ## Lo que este módulo deliberadamente no hace
 *
 * **No sabe de arrendatarios.** Ninguna condición de aquí acota el alcance; eso lo hacen las
 * políticas del motor y el `where` de empresa que pone cada manejador. Si un filtro pudiera ampliar
 * el alcance, el fallo estaría en quien construyó la consulta, no aquí — y aun así el motor
 * devolvería cero filas, que es para lo que están las dos capas.
 */

import type { ParsedQuery } from "@tfv/contracts"
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, type SQL, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

/** Una columna, o una expresión que se comporta como una. */
export type Field = PgColumn | SQL

export interface CollectionMapping {
  /**
   * Campo lógico → columna. Gobierna filtros y orden.
   *
   * El nombre lógico es el que aparece en la URL; la columna es un detalle interno. Que sean cosas
   * distintas es lo que permite renombrar una columna sin romper los enlaces que alguien guardó.
   */
  readonly fields: Readonly<Record<string, Field>>
  /** Columnas sobre las que actúa `search`. Vacío o ausente: el recurso no admite búsqueda. */
  readonly searchable?: readonly Field[]
  /**
   * Desempate final del orden.
   *
   * **Obligatorio.** Sin él, dos filas que empatan en todos los criterios pedidos pueden salir en
   * orden distinto en cada consulta, y entonces paginar repite elementos en una página y se salta
   * otros en la siguiente. Es el requisito de orden estable de la spec, y no es opcional porque el
   * síntoma —una fila que falta— no se parece en nada a la causa.
   */
  readonly tiebreak: Field
}

// ─── Ventana ─────────────────────────────────────────────────────────────────

export interface Window {
  readonly limit: number
  readonly offset: number
  /** Página que se informará en el sobre, derivada del desplazamiento cuando venga explícito. */
  readonly page: number
}

/**
 * Traduce paginación a ventana.
 *
 * `offset` tiene precedencia sobre `page`, como exige la spec. Cuando llega, la página del sobre se
 * deriva de él: informar la página pedida junto a un desplazamiento que no le corresponde haría que
 * los botones de «anterior» y «siguiente» saltaran a sitios que no siguen.
 */
export function windowOf(query: ParsedQuery): Window {
  if (query.offset !== undefined) {
    return {
      limit: query.limit,
      offset: query.offset,
      page: Math.floor(query.offset / query.limit) + 1,
    }
  }

  return { limit: query.limit, offset: (query.page - 1) * query.limit, page: query.page }
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

/**
 * Las condiciones que se derivan de los filtros y de la búsqueda.
 *
 * Devuelve una lista, no una sola condición, para que quien llama la combine con sus propias
 * condiciones de alcance —empresa, borrado lógico— en un único `and`.
 */
export function collectionConditions(
  query: ParsedQuery,
  mapping: CollectionMapping,
): (SQL | undefined)[] {
  const conditions: (SQL | undefined)[] = []

  for (const [key, value] of Object.entries(query.filters)) {
    const field = mapping.fields[key]
    // El análisis ya rechazó los campos no declarados; si falta aquí, es que la declaración del
    // recurso y su mapa no coinciden. Se ignora en lugar de filtrar por nada, que devolvería la
    // colección entera haciendo creer que el filtro se aplicó.
    if (!field) {
      throw new Error(`El recurso declara filtrable «${key}» pero no lo mapea a ninguna columna`)
    }
    conditions.push(conditionFor(field, value))
  }

  const search = searchCondition(query, mapping)
  if (search) conditions.push(search)

  return conditions
}

/**
 * El campo, tal cual, para los comparadores.
 *
 * **La conversión es de tipos y no de valor: la columna llega entera.** Y tiene que llegar entera,
 * porque Drizzle usa el lado izquierdo de una comparación para saber **cómo codificar el derecho**.
 * Con una columna sabe que una fecha va como marca de tiempo; envuelta en una expresión pierde esa
 * información y el conductor recibe un objeto `Date` que no sabe serializar. Falla en ejecución, y
 * sólo para los tipos que no son texto — que es lo que lo hace fácil de no ver.
 *
 * La conversión existe porque los comparadores tienen una sobrecarga para columnas y otra para
 * expresiones, y se excluyen mutuamente: la unión de las dos no encaja en ninguna aunque en
 * ejecución las dos funcionen, porque la distinción la hace Drizzle mirando el valor.
 */
function operand(field: Field): PgColumn {
  return field as PgColumn
}

function conditionFor(field: Field, value: ParsedQuery["filters"][string]): SQL | undefined {
  const target = operand(field)

  switch (value.kind) {
    case "eq":
      return eq(target, value.value)
    case "range":
      return and(gte(target, value.from), lte(target, value.to))
    case "in":
      return inArray(target, [...value.values])
    case "null":
      return isNull(target)
  }
}

// ─── Búsqueda ────────────────────────────────────────────────────────────────

/**
 * Coincidencia parcial, insensible a mayúsculas y a acentos, sobre cualquiera de los campos
 * declarados.
 *
 * Normaliza **los dos lados** con `app.norm` (ver `drizzle/0009_search_normalization.sql`).
 * Normalizar sólo el término buscado no serviría de nada: quien escriba «camara» seguiría sin
 * encontrar «Cámara», porque lo que hay que comparar en igualdad de condiciones son las mil filas,
 * no la palabra.
 *
 * Usa `strpos` y no `like`: con `like` habría que interpolar comodines alrededor del término, y
 * entonces un `%` escrito por el usuario dejaría de ser una letra y pasaría a ser sintaxis. No es
 * una inyección de SQL —el valor sigue siendo un parámetro—, pero sí un resultado que nadie pidió.
 */
function searchCondition(query: ParsedQuery, mapping: CollectionMapping): SQL | undefined {
  const term = query.search
  const fields = mapping.searchable
  if (!term || !fields || fields.length === 0) return undefined

  const matches = fields.map((field) => sql`strpos(app.norm(${field}), app.norm(${term})) > 0`)
  return matches.length === 1 ? matches[0] : or(...matches)
}

// ─── Orden ───────────────────────────────────────────────────────────────────

/**
 * Los criterios de orden, en el orden en que llegaron, más el desempate.
 *
 * El desempate va **siempre** al final, incluso cuando ya se ordena por un campo único: cuesta nada
 * y quita la necesidad de razonar caso por caso sobre si el criterio pedido es único.
 */
export function collectionOrder(query: ParsedQuery, mapping: CollectionMapping): SQL[] {
  const terms: SQL[] = []

  for (const term of query.sort) {
    const field = mapping.fields[term.field]
    if (!field) {
      throw new Error(
        `El recurso declara ordenable «${term.field}» pero no lo mapea a ninguna columna`,
      )
    }
    terms.push(term.direction === "desc" ? desc(field) : asc(field))
  }

  terms.push(asc(mapping.tiebreak))
  return terms
}
