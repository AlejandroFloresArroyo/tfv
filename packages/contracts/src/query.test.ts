/**
 * Casos transcritos de los escenarios de `openspec/specs/query-and-pagination/spec.md`.
 */

import { describe, expect, it } from "vitest"
import { ValidationError } from "./errors.ts"
import { buildPage } from "./pagination.ts"
import { DEFAULT_LIMIT, parseQuery, type QuerySchema } from "./query.ts"

const productSchema: QuerySchema = {
  filters: {
    categoryId: { type: "id", set: true },
    price: { type: "number", range: true },
    createdAt: { type: "date", range: true },
    published: { type: "boolean" },
    status: { type: "enum", values: ["available", "sold", "rented"], set: true },
  },
  searchable: ["name", "description", "slug", "code"],
  sortable: ["name", "price", "createdAt", "priority"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
}

/** Unidades de stock: la spec declara explícitamente que no admiten búsqueda por texto. */
const stockSchema: QuerySchema = {
  filters: { status: { type: "enum", values: ["available", "sold"] } },
  searchable: [],
  sortable: ["createdAt"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
}

function parse(raw: Record<string, string | string[]>, schema = productSchema) {
  return parseQuery(schema, raw)
}

describe("paginación", () => {
  it("aplica los valores por defecto", () => {
    const query = parse({})
    expect(query.page).toBe(1)
    expect(query.limit).toBe(DEFAULT_LIMIT)
  })

  it("acota un límite excesivo en lugar de rechazarlo", () => {
    const query = parse({ limit: "5000" })
    expect(query.limit).toBe(96)
  })

  it("admite desplazamiento explícito", () => {
    expect(parse({ offset: "40" }).offset).toBe(40)
    expect(parse({}).offset).toBeUndefined()
  })

  it("rechaza una página que no es entera", () => {
    expect(() => parse({ page: "dos" })).toThrow(ValidationError)
  })

  it("rechaza una página menor que uno", () => {
    expect(() => parse({ page: "0" })).toThrow(ValidationError)
  })
})

describe("envolvente", () => {
  it("la primera página no tiene anterior", () => {
    const page = buildPage([1, 2, 3], 50, 1, 24)
    expect(page.hasPrevious).toBe(false)
    expect(page.previousPage).toBeNull()
    expect(page.hasNext).toBe(true)
    expect(page.nextPage).toBe(2)
    expect(page.totalPages).toBe(3)
  })

  it("una página más allá del final va vacía pero conserva los totales", () => {
    const page = buildPage([], 50, 9, 24)
    expect(page.items).toEqual([])
    expect(page.totalItems).toBe(50)
    expect(page.totalPages).toBe(3)
    expect(page.hasNext).toBe(false)
  })
})

describe("orden", () => {
  it("aplica el orden por defecto cuando no se pide ninguno", () => {
    expect(parse({}).sort).toEqual([{ field: "createdAt", direction: "desc" }])
  })

  it("combina dos criterios en el orden declarado", () => {
    const query = parse({ sort_price: "-1", sort_name: "1" })
    expect(query.sort).toEqual([
      { field: "price", direction: "desc" },
      { field: "name", direction: "asc" },
    ])
  })

  it("rechaza ordenar por un campo no declarado", () => {
    expect(() => parse({ sort_cost: "1" })).toThrow(ValidationError)
  })

  it("rechaza una dirección que no es 1 ni -1", () => {
    expect(() => parse({ sort_name: "asc" })).toThrow(ValidationError)
  })
})

describe("filtros", () => {
  it("rechaza un filtro sobre un campo no declarado", () => {
    try {
      parse({ cost: "100" })
      expect.unreachable("debería haber lanzado")
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).issues[0]?.key).toBe("cost")
    }
  })

  it("no permite inyectar un operador: se trata como texto", () => {
    // El valor parece un operador de base de datos; debe quedar en un filtro de igualdad literal.
    const query = parse({ categoryId: '{"$ne":null}' })
    expect(query.filters.categoryId).toEqual({ kind: "eq", value: '{"$ne":null}' })
  })

  it("forma un intervalo con dos valores repetidos", () => {
    const query = parse({ price: ["100", "500"] })
    expect(query.filters.price).toEqual({ kind: "range", from: 100, to: 500 })
  })

  it("rechaza un intervalo en un campo que no lo admite", () => {
    expect(() => parse({ published: ["true", "false"] })).toThrow(ValidationError)
  })

  it("rechaza texto en un campo numérico", () => {
    expect(() => parse({ price: "barato" })).toThrow(ValidationError)
  })

  it("coacciona booleanos", () => {
    expect(parse({ published: "true" }).filters.published).toEqual({ kind: "eq", value: true })
    expect(parse({ published: "false" }).filters.published).toEqual({ kind: "eq", value: false })
  })

  it("rechaza un booleano mal escrito", () => {
    expect(() => parse({ published: "si" })).toThrow(ValidationError)
  })

  it("interpreta null como filtro de ausencia", () => {
    expect(parse({ categoryId: "null" }).filters.categoryId).toEqual({ kind: "null" })
  })

  it("admite conjuntos separados por comas cuando el campo lo declara", () => {
    const query = parse({ status: "available,sold" })
    expect(query.filters.status).toEqual({ kind: "in", values: ["available", "sold"] })
  })

  it("rechaza un valor fuera del enumerado", () => {
    expect(() => parse({ status: "perdido" })).toThrow(ValidationError)
  })

  it("descarta las claves internas sin producir error", () => {
    const query = parse({ _cache: "1", published: "true" })
    expect(query.filters._cache).toBeUndefined()
    expect(query.filters.published).toEqual({ kind: "eq", value: true })
  })

  it("acumula un problema por cada campo inválido", () => {
    try {
      parse({ price: "barato", status: "perdido" })
      expect.unreachable("debería haber lanzado")
    } catch (error) {
      expect((error as ValidationError).issues).toHaveLength(2)
    }
  })
})

describe("búsqueda", () => {
  it("recoge el término cuando el recurso declara campos de búsqueda", () => {
    expect(parse({ search: "cámara" }).search).toBe("cámara")
  })

  it("ignora el término en un recurso sin campos de búsqueda declarados", () => {
    // Escenario: unidades de stock no admiten búsqueda por texto
    expect(parse({ search: "algo" }, stockSchema).search).toBeUndefined()
  })

  it("trata una búsqueda vacía como ausente", () => {
    expect(parse({ search: "   " }).search).toBeUndefined()
  })
})
