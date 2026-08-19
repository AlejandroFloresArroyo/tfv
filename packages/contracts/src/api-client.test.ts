/**
 * El cliente tipado, ejercitado contra un transporte de mentira.
 *
 * Lo que se comprueba es lo que el cliente añade sobre `fetch`: que el camino se compone con sus
 * parámetros escapados, que la consulta se arma sin colar vacíos, y que una llamada mal formada
 * falla **aquí** y no como un `404` sin explicación.
 *
 * Los tipos no se comprueban en ejecución: los comprueba `pnpm check`. Lo que se prueba aquí es el
 * comportamiento; que `"POST /compnaies"` no compile lo garantiza el mapa generado.
 */

import { describe, expect, it } from "vitest"
import { type ApiRequest, createApiClient, resolveRequest } from "./api-client.ts"

function espia() {
  const vistas: ApiRequest[] = []
  const api = createApiClient(async (request) => {
    vistas.push(request)
    return { ok: true }
  })

  return { api, vistas }
}

describe("composición del camino", () => {
  it("separa el verbo del camino", () => {
    expect(resolveRequest("POST /companies")).toMatchObject({
      method: "POST",
      path: "/companies",
    })
  })

  it("sustituye los parámetros del camino", () => {
    const request = resolveRequest("GET /companies/{companyId}/members", {
      params: { companyId: "c-1" },
    })

    expect(request.path).toBe("/companies/c-1/members")
  })

  it("escapa el valor del parámetro", () => {
    // Un identificador con una barra partiría la ruta y la petición acabaría en otro endpoint.
    const request = resolveRequest("GET /public/documents/{reference}", {
      params: { reference: "a/b?c" },
    })

    expect(request.path).toBe("/public/documents/a%2Fb%3Fc")
  })

  it("un parámetro que falta se ve aquí, no como un 404", () => {
    expect(() => resolveRequest("GET /companies/{companyId}", { params: {} })).toThrow(
      /Falta el parámetro «companyId»/,
    )
  })

  it("un parámetro vacío cuenta como ausente", () => {
    expect(() =>
      resolveRequest("GET /companies/{companyId}", { params: { companyId: "" } }),
    ).toThrow(/companyId/)
  })
})

describe("cadena de consulta", () => {
  it("arma los pares que hay", () => {
    const request = resolveRequest("GET /companies", { query: { page: 2, limit: 20 } })

    expect(request.path).toBe("/companies?page=2&limit=20")
  })

  it("omite lo indefinido y lo nulo", () => {
    // Un filtro sin elegir no es un filtro vacío: mandarlo obliga al servidor a distinguir dos
    // formas de no filtrar, y una de las dos acabará tratándose mal.
    const request = resolveRequest("GET /companies", {
      query: { search: undefined, status: null, page: 1 },
    })

    expect(request.path).toBe("/companies?page=1")
  })

  it("repite la clave para una lista", () => {
    const request = resolveRequest("GET /companies", { query: { id: ["a", "b"] } })

    expect(request.path).toBe("/companies?id=a&id=b")
  })

  it("escapa los valores", () => {
    const request = resolveRequest("GET /companies", { query: { search: "cámara & luz" } })

    expect(request.path).toContain("search=c%C3%A1mara+%26+luz")
  })

  it("sin consulta no queda un interrogante suelto", () => {
    expect(resolveRequest("GET /companies", { query: {} }).path).toBe("/companies")
  })
})

describe("el cliente", () => {
  it("entrega la petición resuelta al transporte", async () => {
    const { api, vistas } = espia()

    await api("POST /auth/login", { body: { email: "a@b.mx", password: "x" } })

    expect(vistas[0]).toEqual({
      method: "POST",
      path: "/auth/login",
      body: { email: "a@b.mx", password: "x" },
    })
  })

  it("devuelve lo que el transporte devuelve", async () => {
    const api = createApiClient(async () => ({ id: "c-1" }))

    await expect(
      api("GET /companies/{companyId}", { params: { companyId: "c-1" } }),
    ).resolves.toEqual({ id: "c-1" })
  })

  it("un endpoint sin entrada se llama sin argumento", async () => {
    const { api, vistas } = espia()

    await api("GET /health")

    expect(vistas[0]?.path).toBe("/health")
  })

  it("las claves ausentes no viajan como indefinidas", async () => {
    // Con `exactOptionalPropertyTypes`, «sin cuerpo» y «cuerpo indefinido» no son lo mismo, y el
    // transporte de la web decide con eso si pone la cabecera de tipo de contenido.
    const { api, vistas } = espia()

    await api("GET /health")

    expect(Object.hasOwn(vistas[0] as object, "body")).toBe(false)
    expect(Object.hasOwn(vistas[0] as object, "headers")).toBe(false)
  })
})
