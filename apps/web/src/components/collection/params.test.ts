/**
 * El estado de exploración.
 *
 * Escenarios de `openspec/specs/collection-browsing/spec.md`. Se prueban aquí y no en el navegador
 * porque son transformaciones puras: lo que el navegador aporta —historia, foco, retardo— se prueba
 * en `apps/e2e`, y lo que se decide sobre los parámetros se prueba donde se decide.
 */

import { describe, expect, it } from "vitest"
import {
  activeFilters,
  clearFilters,
  type FilterSpec,
  hasActiveFilters,
  readLimit,
  readSearch,
  readView,
  toApiQuery,
  toApiQueryRecord,
  toSearchParams,
  withParam,
} from "./params.ts"

const SPECS: FilterSpec[] = [
  {
    kind: "select",
    key: "roleId",
    label: "Rol",
    options: [
      { value: "r1", label: "Almacén" },
      { value: "r2", label: "Ventas" },
    ],
  },
  {
    kind: "multi",
    key: "tagId",
    label: "Etiqueta",
    options: [
      { value: "t1", label: "Urgente" },
      { value: "t2", label: "Revisado" },
    ],
  },
  {
    kind: "boolean",
    key: "isActive",
    label: "Estado",
    trueLabel: "Activo",
    falseLabel: "Inactivo",
  },
  { kind: "text", key: "city", label: "Ciudad" },
  { kind: "dateRange", key: "createdAt", label: "Alta", fromLabel: "Desde", toLabel: "Hasta" },
]

function params(query: string): URLSearchParams {
  return new URLSearchParams(query)
}

describe("lectura", () => {
  it("convierte los parámetros de la página, con claves repetidas", () => {
    const result = toSearchParams({ createdAt: ["2026-01-01", "2026-12-31"], search: "cámara" })

    expect(result.getAll("createdAt")).toEqual(["2026-01-01", "2026-12-31"])
    expect(readSearch(result)).toBe("cámara")
  })

  it("un tamaño de página fuera de las opciones cae en el de por omisión", () => {
    // Llega por la barra de direcciones, así que puede ser cualquier cosa.
    expect(readLimit(params("limit=1000"))).toBe(24)
    expect(readLimit(params("limit=48"))).toBe(48)
    expect(readLimit(params(""))).toBe(24)
  })

  it("la disposición por omisión es la lista", () => {
    expect(readView(params(""))).toBe("list")
    expect(readView(params("_view=grid"))).toBe("grid")
  })

  it("permite que una colección elija rejilla por omisión sin ocultar una elección explícita", () => {
    expect(readView(params(""), "grid")).toBe("grid")
    expect(readView(params("_view=list"), "grid")).toBe("list")
  })
})

describe("lo que se le manda a la API", () => {
  it("reenvía filtros y paginación", () => {
    const query = toApiQuery(params("search=nunez&isActive=false&page=3&limit=48"))

    expect(new URLSearchParams(query).get("search")).toBe("nunez")
    expect(new URLSearchParams(query).get("page")).toBe("3")
  })

  it("no reenvía las claves internas de la interfaz", () => {
    // La API las descartaría igual, pero mandarlas sería mandar lo que ya se sabe que no significa
    // nada. La regla es de descarte y no de lista permitida: así no se puede olvidar un filtro.
    const query = toApiQuery(params("_view=grid&search=x"))

    expect(query).toBe("search=x")
  })

  it("conserva las claves repetidas de un intervalo", () => {
    const query = toApiQuery(params("createdAt=2026-01-01&createdAt=2026-12-31"))

    expect(new URLSearchParams(query).getAll("createdAt")).toEqual(["2026-01-01", "2026-12-31"])
  })
})

describe("lo que se le manda al cliente tipado", () => {
  it("es la misma regla de descarte, como objeto y no como cadena", () => {
    const query = toApiQueryRecord(params("_view=grid&search=nunez&page=3"))

    expect(query).toEqual({ search: "nunez", page: "3" })
  })

  it("una clave repetida viaja como lista, y una sola como cadena suelta", () => {
    const query = toApiQueryRecord(params("status=lost&status=robbed&search=x"))

    expect(query.status).toEqual(["lost", "robbed"])
    expect(query.search).toBe("x")
  })

  it("sin parámetros no hay nada que mandar", () => {
    expect(toApiQueryRecord(params(""))).toEqual({})
  })
})

describe("escritura", () => {
  it("cambiar la búsqueda vuelve a la primera página", () => {
    // Escenario: «Buscar reinicia la página».
    const next = withParam(params("page=4&search=viejo"), "search", "nuevo")

    expect(next.get("search")).toBe("nuevo")
    expect(next.get("page")).toBeNull()
  })

  it("cambiar el tamaño de página vuelve a la primera", () => {
    // Escenario: «Cambiar el tamaño reinicia la página».
    const next = withParam(params("page=3&limit=12"), "limit", "48")

    expect(next.get("limit")).toBe("48")
    expect(next.get("page")).toBeNull()
  })

  it("cambiar de página no reinicia la página", () => {
    const next = withParam(params("search=x&page=2"), "page", "5")

    expect(next.get("page")).toBe("5")
    expect(next.get("search")).toBe("x")
  })

  it("un valor vacío quita el parámetro en lugar de dejarlo en blanco", () => {
    const next = withParam(params("search=algo"), "search", "")

    expect(next.has("search")).toBe(false)
  })

  it("una lista escribe una clave repetida", () => {
    const next = withParam(params(""), "createdAt", ["2026-01-01", "2026-12-31"])

    expect(next.getAll("createdAt")).toEqual(["2026-01-01", "2026-12-31"])
  })

  it("limpiar se lleva filtros y búsqueda, y conserva la vista y el tamaño", () => {
    // Escenario: «Limpiar todo devuelve el listado completo», y «la búsqueda también se limpia».
    const next = clearFilters(
      params("search=x&isActive=false&roleId=r1&limit=48&_view=grid&page=7"),
    )

    expect(next.toString()).toBe("limit=48&_view=grid")
  })
})

describe("indicadores de filtro aplicado", () => {
  it("muestran el nombre de la opción, no su identificador", () => {
    const active = activeFilters(params("roleId=r1"), SPECS)

    expect(active).toEqual([{ key: "roleId", field: "Rol", value: "Almacén", remaining: [] }])
  })

  it("un booleano se lee como su etiqueta", () => {
    expect(activeFilters(params("isActive=false"), SPECS)[0]?.value).toBe("Inactivo")
    expect(activeFilters(params("isActive=true"), SPECS)[0]?.value).toBe("Activo")
  })

  it("una selección múltiple da un indicador por valor, y quitar uno deja los demás", () => {
    // Escenario: «Se quita un filtro desde su indicador»: desaparece uno y el otro permanece.
    const active = activeFilters(params("tagId=t1,t2"), SPECS)

    expect(active.map((entry) => entry.value)).toEqual(["Urgente", "Revisado"])
    expect(active[0]?.remaining).toEqual(["t2"])
    expect(active[1]?.remaining).toEqual(["t1"])
  })

  it("un intervalo de fechas es un solo indicador", () => {
    // Quitar la mitad de un intervalo dejaría un filtro que el servidor ya no reconoce como tal.
    const active = activeFilters(params("createdAt=2026-01-01&createdAt=2026-12-31"), SPECS)

    expect(active).toHaveLength(1)
    expect(active[0]?.value).toBe("2026-01-01 – 2026-12-31")
  })

  it("un valor desconocido se muestra tal cual en lugar de desaparecer", () => {
    // Llega por enlace con un identificador que ya no existe. Ocultarlo dejaría un listado
    // filtrado sin nada que explique por qué.
    const active = activeFilters(params("roleId=borrado"), SPECS)

    expect(active[0]?.value).toBe("borrado")
  })

  it("los parámetros que ninguna pantalla declara no producen indicador", () => {
    expect(activeFilters(params("page=3&limit=12&_view=grid"), SPECS)).toEqual([])
  })

  it("sabe si hay algo que limpiar", () => {
    expect(hasActiveFilters(params("page=3"), SPECS)).toBe(false)
    expect(hasActiveFilters(params("search=x"), SPECS)).toBe(true)
    expect(hasActiveFilters(params("isActive=true"), SPECS)).toBe(true)
  })
})
