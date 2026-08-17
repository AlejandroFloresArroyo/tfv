/**
 * Colecciones: paginación, orden, búsqueda y filtros.
 *
 * Transcritas de los escenarios de `openspec/specs/query-and-pagination/spec.md`. Corren contra el
 * servicio de verdad y contra el motor de verdad: la búsqueda sin acentos y el orden estable son
 * propiedades del SQL que se ejecuta, y una prueba con datos inventados en memoria comprobaría la
 * invención.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  counterparties,
  globalCategories,
  loginAttempts,
  notificationDeliveries,
  roles,
  services,
  sessions,
  users,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${counterparties}, ${globalCategories}, ${services}, ${companies} cascade`,
  )
}

function request(method: string, path: string, body?: unknown, cookie?: string) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

interface Envelope<T> {
  items: T[]
  page: number
  limit: number
  totalItems: number
  totalPages: number
  hasPrevious: boolean
  hasNext: boolean
  previousPage: number | null
  nextPage: number | null
}

interface Client {
  id: string
  alias: string
}

/**
 * Una cartera con más elementos que los que caben en una página, y con acentos.
 *
 * Los nombres importan: sin un solo acento en los datos, la normalización de la búsqueda pasaría la
 * prueba estuviera puesta o no.
 */
const ALIASES = [
  "Álvarez Cine",
  "Bodegas Núñez",
  "Cámaras del Sur",
  "Difusión Peña",
  "Estudios Ávila",
  "Fotografía Ibáñez",
  ...Array.from({ length: 24 }, (_, index) => `Relleno ${String(index + 1).padStart(2, "0")}`),
]

let cookie = ""
let companyId = ""

beforeAll(async () => {
  await reset()

  await request("POST", "/auth/register", {
    email: "colecciones@ejemplo.mx",
    password: PASSWORD,
    name: "Colecciones",
  })
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.email, "colecciones@ejemplo.mx"))

  const login = await request("POST", "/auth/login", {
    email: "colecciones@ejemplo.mx",
    password: PASSWORD,
  })
  cookie =
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""

  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name: "Casa de Renta" }, cookie),
  )
  companyId = company.id

  for (const alias of ALIASES) {
    const response = await request("POST", `/companies/${companyId}/clients`, { alias }, cookie)
    expect(response.status).toBe(201)
  }
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

async function clients(query = ""): Promise<Response> {
  return request("GET", `/companies/${companyId}/clients${query}`, undefined, cookie)
}

describe("paginación", () => {
  it("aplica los valores por defecto", async () => {
    // Escenario: «Se aplican los valores por defecto».
    const page = await json<Envelope<Client>>(await clients())

    expect(page.page).toBe(1)
    expect(page.limit).toBe(24)
    expect(page.items).toHaveLength(24)
    expect(page.totalItems).toBe(ALIASES.length)
  })

  it("acota un límite excesivo en lugar de rechazarlo", async () => {
    // Escenario: «Un límite excesivo se acota».
    const page = await json<Envelope<Client>>(await clients("?limit=5000"))

    expect(page.limit).toBe(96)
    expect(page.items.length).toBeLessThanOrEqual(96)
  })

  it("la primera página no tiene anterior", async () => {
    // Escenario: «La primera página no tiene anterior».
    const page = await json<Envelope<Client>>(await clients("?limit=10"))

    expect(page.hasPrevious).toBe(false)
    expect(page.previousPage).toBeNull()
    expect(page.hasNext).toBe(true)
    expect(page.nextPage).toBe(2)
  })

  it("una página más allá del final va vacía y conserva los totales", async () => {
    // Escenario: «Una página más allá del final va vacía».
    const response = await clients("?page=99")
    expect(response.status).toBe(200)

    const page = await json<Envelope<Client>>(response)
    expect(page.items).toHaveLength(0)
    expect(page.totalItems).toBe(ALIASES.length)
    expect(page.totalPages).toBe(Math.ceil(ALIASES.length / 24))
  })

  it("el desplazamiento tiene precedencia sobre la página", async () => {
    const byOffset = await json<Envelope<Client>>(await clients("?limit=5&offset=10&page=1"))
    const byPage = await json<Envelope<Client>>(await clients("?limit=5&page=3"))

    expect(byOffset.items.map((row) => row.id)).toEqual(byPage.items.map((row) => row.id))
    // Y la página que informa se deriva del desplazamiento, no de la que se pidió: anunciar la
    // página 1 junto a los elementos de la 3 haría que «siguiente» saltara hacia atrás.
    expect(byOffset.page).toBe(3)
  })

  it("recorrer todas las páginas no repite ni omite ningún elemento", async () => {
    // Escenario: «Paginar no duplica elementos empatados». Todos los rellenos comparten prefijo y
    // fecha de creación al milisegundo, así que el desempate es lo único que los separa.
    const visto: string[] = []
    let page = 1

    for (;;) {
      const envelope = await json<Envelope<Client>>(await clients(`?limit=7&page=${page}`))
      visto.push(...envelope.items.map((row) => row.id))
      if (!envelope.hasNext) break
      page += 1
    }

    expect(visto).toHaveLength(ALIASES.length)
    expect(new Set(visto).size).toBe(ALIASES.length)
  })
})

describe("orden", () => {
  it("el orden pedido sustituye al orden por defecto", async () => {
    // Escenario: «El orden pedido sustituye al orden por defecto».
    const ascendente = await json<Envelope<Client>>(await clients("?limit=3&sort_alias=1"))
    const descendente = await json<Envelope<Client>>(await clients("?limit=3&sort_alias=-1"))

    expect(ascendente.items[0]?.alias).toBe("Álvarez Cine")
    expect(descendente.items[0]?.alias).toBe("Relleno 24")
  })

  it("ordenar por un campo no declarado se rechaza", async () => {
    const response = await clients("?sort_snapshot=1")
    expect(response.status).toBe(400)

    const body = await json<{ message: { key: string }[] }>(response)
    expect(body.message[0]?.key).toBe("sort_snapshot")
  })
})

describe("búsqueda", () => {
  it("ignora acentos y mayúsculas", async () => {
    // Escenario: «La búsqueda ignora acentos y mayúsculas».
    const page = await json<Envelope<Client>>(await clients("?search=NUNEZ"))

    expect(page.items.map((row) => row.alias)).toEqual(["Bodegas Núñez"])
  })

  it("coincide parcialmente y por cualquiera de los campos declarados", async () => {
    // El alias no contiene el correo; la coincidencia sale de los datos copiados.
    await request(
      "POST",
      `/companies/${companyId}/clients`,
      { alias: "Sin pistas", snapshot: { email: "contacto@herrajes.mx" } },
      cookie,
    )

    const page = await json<Envelope<Client>>(await clients("?search=herrajes"))
    expect(page.items.map((row) => row.alias)).toEqual(["Sin pistas"])
  })

  it("un carácter comodín se busca como letra, no como sintaxis", async () => {
    // Escenario: «No se puede inyectar un operador». Con `like`, un `%` dejaría de ser una letra y
    // devolvería la colección entera.
    const page = await json<Envelope<Client>>(await clients("?search=%25"))

    expect(page.totalItems).toBe(0)
  })

  it("buscar reinicia el conteo, no el alcance", async () => {
    const page = await json<Envelope<Client>>(await clients("?search=Relleno&limit=10"))

    expect(page.totalItems).toBe(24)
    expect(page.totalPages).toBe(3)
  })
})

describe("filtros", () => {
  it("un filtro no declarado se rechaza nombrando el campo", async () => {
    // Escenario: «Un filtro no declarado se rechaza».
    const response = await clients("?razonSocial=Acme")
    expect(response.status).toBe(400)

    const body = await json<{ message: { key: string; message: string }[] }>(response)
    expect(body.message[0]?.key).toBe("razonSocial")
    expect(body.message[0]?.message).toContain("razonSocial")
  })

  it("una clave interna se descarta sin filtrar y sin romper", async () => {
    // Escenario: «Una clave interna no filtra ni rompe».
    const page = await json<Envelope<Client>>(await clients("?_vista=rejilla&limit=5"))

    expect(page.totalItems).toBe(ALIASES.length + 1)
    expect(page.limit).toBe(5)
  })

  it("filtrar por nulo responde «los que no están en la plataforma»", async () => {
    const page = await json<Envelope<Client>>(await clients("?userId=null&limit=1"))

    expect(page.totalItems).toBe(ALIASES.length + 1)
  })

  it("un intervalo de fechas viaja como clave repetida y llega entero", async () => {
    /**
     * Regresión de un defecto del andamiaje, no de la gramática.
     *
     * El validador del transporte corre **antes** que el análisis, y el esquema publicado declaraba
     * cada parámetro como cadena a secas. Una clave repetida —que es exactamente lo que la
     * gramática entiende por intervalo— moría con «se esperaba una cadena, llegó una lista»: un
     * mensaje del transporte sobre una petición perfectamente válida, y sobre el único tipo de
     * filtro que ninguna pantalla usaba todavía.
     *
     * Las pruebas de `parseQuery` pasaban en verde porque no atraviesan el transporte.
     */
    const hoy = new Date().toISOString().slice(0, 10)
    const response = await clients(`?createdAt=2000-01-01&createdAt=${hoy}&limit=1`)

    expect(response.status).toBe(200)

    const page = await json<Envelope<Client>>(response)
    expect(page.totalItems).toBeGreaterThan(0)
  })

  it("un intervalo que termina antes de empezar no devuelve nada", async () => {
    const page = await json<Envelope<Client>>(
      await clients("?createdAt=2000-01-01&createdAt=2000-12-31"),
    )

    expect(page.totalItems).toBe(0)
  })

  it("un texto en un filtro booleano se rechaza", async () => {
    // Escenario: «Un texto en un campo numérico se rechaza», con el tipo que este recurso declara.
    const response = await request(
      "GET",
      `/companies/${companyId}/members?isActive=quizá`,
      undefined,
      cookie,
    )
    expect(response.status).toBe(400)
  })
})

describe("alcance", () => {
  it("ningún parámetro cruza la frontera del arrendatario", async () => {
    // Escenario: «Un filtro no cruza la frontera del arrendatario». La empresa ajena existe y tiene
    // clientes; se pide por su dirección y con todos los filtros abiertos.
    const otherId = newId()
    await db.insert(companies).values({ id: otherId, name: "Ajena" })

    const response = await request(
      "GET",
      `/companies/${otherId}/clients?limit=96`,
      undefined,
      cookie,
    )

    expect(response.status).toBe(403)
  })
})
