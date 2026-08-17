/**
 * Almacenes y ubicaciones, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/warehouses-and-storage/spec.md`.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  companyServices,
  loginAttempts,
  notificationDeliveries,
  roles,
  services,
  sessions,
  users,
  warehouseProducts,
  warehouseStorages,
  warehouses,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${warehouseProducts}, ${warehouseStorages}, ${warehouses}, ${services}, ${companies} cascade`,
  )
}

beforeEach(reset)
afterAll(async () => {
  await reset()
  await closeConnection()
})

// ─── Andamiaje ───────────────────────────────────────────────────────────────

interface Session {
  readonly cookie: string
  readonly userId: string
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

async function signUp(email: string): Promise<Session> {
  await request("POST", "/auth/register", { email, password: PASSWORD, name: email.split("@")[0] })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const response = await request("POST", "/auth/login", { email, password: PASSWORD })
  const cookie = response.headers
    .getSetCookie()
    .find((raw) => raw.startsWith("tfv_session="))
    ?.split(";")[0]

  if (!cookie) throw new Error("no se abrió sesión")

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (!user) throw new Error("la cuenta debería existir")

  return { cookie, userId: user.id }
}

/** Una empresa con el servicio de almacenes contratado, que es lo que exige crear uno. */
async function newCompany(session: Session, name = "Casa de Renta", withService = true) {
  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name }, session.cookie),
  )

  if (withService) {
    const serviceId = newId()
    await db.insert(services).values({ id: serviceId, keycode: "warehouses", name: "Almacenes" })
    await db
      .insert(companyServices)
      .values({ id: newId(), companyId: company.id, serviceId })
      .onConflictDoNothing()
  }

  return company
}

interface Warehouse {
  id: string
  name: string
  slug: string | null
  priority: string
  isPublished: boolean
}

interface Storage {
  id: string
  code: string
  kind: string
  name: string
  parentId: string | null
  childCount: number
  productCount: number
}

async function newWarehouse(session: Session, companyId: string, name = "Nave Norte") {
  const response = await request(
    "POST",
    `/companies/${companyId}/warehouses`,
    { name },
    session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Warehouse>(response)
}

async function newStorage(
  session: Session,
  companyId: string,
  warehouseId: string,
  body: Record<string, unknown>,
) {
  const response = await request(
    "POST",
    `/companies/${companyId}/warehouses/${warehouseId}/storages`,
    body,
    session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Storage>(response)
}

// ─── Almacén ─────────────────────────────────────────────────────────────────

describe("un almacén pertenece a una empresa", () => {
  it("sin el servicio contratado no se crea", async () => {
    // Escenario: «Sin el servicio no se crea». La propiedad concede todos los permisos de la
    // empresa, así que aquí no falla el permiso: falla la habilitación, que es otra cosa.
    const session = await signUp("sin-servicio@ejemplo.mx")
    const company = await newCompany(session, "Sin Almacenes", false)

    const response = await request(
      "POST",
      `/companies/${company.id}/warehouses`,
      { name: "Nave" },
      session.cookie,
    )

    expect(response.status).toBe(422)
    expect(await response.text()).toContain("servicio de almacenes")
  })

  it("con el servicio contratado se crea con su identificador legible", async () => {
    const session = await signUp("con-servicio@ejemplo.mx")
    const company = await newCompany(session)

    const warehouse = await newWarehouse(session, company.id, "Nave Fílmica del Norte")

    expect(warehouse.slug).toBe("nave-filmica-del-norte")
  })

  it("una empresa ajena responde que no", async () => {
    const session = await signUp("ajeno@ejemplo.mx")
    const otherId = newId()
    await db.insert(companies).values({ id: otherId, name: "Ajena" })

    const response = await request(
      "GET",
      `/companies/${otherId}/warehouses`,
      undefined,
      session.cookie,
    )

    expect(response.status).toBe(403)
  })
})

describe("orden y publicación", () => {
  it("la prioridad manda sobre la fecha", async () => {
    // Escenario: «La prioridad manda sobre la fecha». El más antiguo tiene la prioridad más alta.
    const session = await signUp("orden@ejemplo.mx")
    const company = await newCompany(session)

    const antiguo = await newWarehouse(session, company.id, "Antiguo")
    await newWarehouse(session, company.id, "Reciente")

    await request(
      "PATCH",
      `/companies/${company.id}/warehouses/${antiguo.id}`,
      { priority: "10" },
      session.cookie,
    )

    const page = await json<{ items: Warehouse[] }>(
      await request("GET", `/companies/${company.id}/warehouses`, undefined, session.cookie),
    )

    expect(page.items.map((row) => row.name)).toEqual(["Antiguo", "Reciente"])
  })

  it("un identificador legible ocupado se rechaza", async () => {
    // Escenario: «Un identificador ocupado se rechaza». Al crear se añade sufijo porque nadie lo
    // eligió; al cambiarlo a mano, alguien escribió uno concreto y darle otro sería ignorarlo.
    const session = await signUp("slug@ejemplo.mx")
    const company = await newCompany(session)

    await newWarehouse(session, company.id, "Nave Uno")
    const segunda = await newWarehouse(session, company.id, "Nave Dos")

    const response = await request(
      "PATCH",
      `/companies/${company.id}/warehouses/${segunda.id}`,
      { slug: "nave-uno" },
      session.cookie,
    )

    expect(response.status).toBe(409)
  })

  it("dos almacenes con el mismo nombre reciben identificadores distintos", async () => {
    const session = await signUp("homonimos@ejemplo.mx")
    const company = await newCompany(session)

    const uno = await newWarehouse(session, company.id, "Bodega")
    const dos = await newWarehouse(session, company.id, "Bodega")

    expect(uno.slug).toBe("bodega")
    expect(dos.slug).toBe("bodega-2")
  })
})

describe("baja de un almacén", () => {
  it("enumera el alcance antes, y no cuenta las variantes aparte", async () => {
    const session = await signUp("alcance@ejemplo.mx")
    const company = await newCompany(session)
    const warehouse = await newWarehouse(session, company.id)

    await newStorage(session, company.id, warehouse.id, { name: "Rack", kind: "rack" })

    const padre = newId()
    await db.insert(warehouseProducts).values([
      { id: padre, warehouseId: warehouse.id, name: "Cámara", code: "P-1" },
      {
        id: newId(),
        warehouseId: warehouse.id,
        name: "Cámara negra",
        code: "P-2",
        parentId: padre,
        relationToParent: "variant",
      },
    ])

    const scope = await json<{ storages: number; products: number }>(
      await request(
        "GET",
        `/companies/${company.id}/warehouses/${warehouse.id}/scope`,
        undefined,
        session.cookie,
      ),
    )

    expect(scope.storages).toBe(1)
    expect(scope.products).toBe(1)
  })

  it("la baja conserva la fila y retira el acceso", async () => {
    const session = await signUp("baja@ejemplo.mx")
    const company = await newCompany(session)
    const warehouse = await newWarehouse(session, company.id)

    const deleted = await request(
      "DELETE",
      `/companies/${company.id}/warehouses/${warehouse.id}`,
      undefined,
      session.cookie,
    )
    expect(deleted.status).toBe(204)

    const gone = await request(
      "GET",
      `/companies/${company.id}/warehouses/${warehouse.id}`,
      undefined,
      session.cookie,
    )
    expect(gone.status).toBe(404)

    // La fila sobrevive con su fecha: el borrado es lógico y el historial se conserva.
    const [row] = await db.select().from(warehouses).where(eq(warehouses.id, warehouse.id))
    expect(row?.deletedAt).not.toBeNull()
  })
})

// ─── Ubicaciones ─────────────────────────────────────────────────────────────

describe("código legible autogenerado", () => {
  it("el correlativo cuenta por tipo", async () => {
    // Escenario: «El correlativo cuenta por tipo y por almacén».
    const session = await signUp("codigos@ejemplo.mx")
    const company = await newCompany(session)
    const warehouse = await newWarehouse(session, company.id)

    await newStorage(session, company.id, warehouse.id, { name: "Caja A", kind: "box" })
    await newStorage(session, company.id, warehouse.id, { name: "Caja B", kind: "box" })

    const caja = await newStorage(session, company.id, warehouse.id, {
      name: "Caja C",
      kind: "box",
    })
    const rack = await newStorage(session, company.id, warehouse.id, { name: "Rack", kind: "rack" })

    expect(caja.code).toBe("BOX3")
    expect(rack.code).toBe("RCK1")
  })

  it("los códigos no se cruzan entre almacenes", async () => {
    // Escenario: «Los códigos no se cruzan entre almacenes».
    const session = await signUp("cruzados@ejemplo.mx")
    const company = await newCompany(session)

    const uno = await newWarehouse(session, company.id, "Nave Uno")
    const dos = await newWarehouse(session, company.id, "Nave Dos")

    const cajaUno = await newStorage(session, company.id, uno.id, { name: "Caja", kind: "box" })
    const cajaDos = await newStorage(session, company.id, dos.id, { name: "Caja", kind: "box" })

    expect(cajaUno.code).toBe("BOX1")
    expect(cajaDos.code).toBe("BOX1")
    expect(cajaUno.id).not.toBe(cajaDos.id)
  })

  it("renombrar no cambia el código, y cambiar el tipo sí", async () => {
    // Escenarios: «Renombrar no cambia el código» y «Cambiar el tipo sí lo cambia». El código está
    // impreso en etiquetas pegadas a estantes.
    const session = await signUp("regenerar@ejemplo.mx")
    const company = await newCompany(session)
    const warehouse = await newWarehouse(session, company.id)

    const caja = await newStorage(session, company.id, warehouse.id, { name: "Caja", kind: "box" })
    const base = `/companies/${company.id}/warehouses/${warehouse.id}/storages/${caja.id}`

    const renombrada = await json<Storage>(
      await request("PATCH", base, { name: "Caja de lentes" }, session.cookie),
    )
    expect(renombrada.code).toBe(caja.code)

    const reconvertida = await json<Storage>(
      await request("PATCH", base, { kind: "rack" }, session.cookie),
    )
    expect(reconvertida.code).toBe("RCK1")
  })
})

describe("árbol de ubicaciones", () => {
  it("el listado muestra las raíces, y las hijas se piden por su padre", async () => {
    // Escenario: «El listado del almacén muestra las raíces».
    const session = await signUp("arbol@ejemplo.mx")
    const company = await newCompany(session)
    const warehouse = await newWarehouse(session, company.id)
    const base = `/companies/${company.id}/warehouses/${warehouse.id}/storages`

    const rack = await newStorage(session, company.id, warehouse.id, {
      name: "Rack",
      kind: "rack",
    })
    await newStorage(session, company.id, warehouse.id, {
      name: "Estante",
      kind: "shelf",
      parentId: rack.id,
    })

    const raices = await json<{ items: Storage[] }>(
      await request("GET", base, undefined, session.cookie),
    )
    expect(raices.items.map((row) => row.name)).toEqual(["Rack"])
    expect(raices.items[0]?.childCount).toBe(1)

    const hijas = await json<{ items: Storage[] }>(
      await request("GET", `${base}?parentId=${rack.id}`, undefined, session.cookie),
    )
    expect(hijas.items.map((row) => row.name)).toEqual(["Estante"])
  })

  it("una ubicación no puede colgar de su propia hija", async () => {
    // Escenario: «Una ubicación no puede colgar de su propia hija». Es lo único de este árbol que
    // el motor no puede impedir por sí solo: la consulta que lo detecta es recursiva.
    const session = await signUp("ciclo@ejemplo.mx")
    const company = await newCompany(session)
    const warehouse = await newWarehouse(session, company.id)

    const rack = await newStorage(session, company.id, warehouse.id, { name: "Rack", kind: "rack" })
    const estante = await newStorage(session, company.id, warehouse.id, {
      name: "Estante",
      kind: "shelf",
      parentId: rack.id,
    })

    const response = await request(
      "PATCH",
      `/companies/${company.id}/warehouses/${warehouse.id}/storages/${rack.id}`,
      { parentId: estante.id },
      session.cookie,
    )

    expect(response.status).toBe(422)
    expect(await response.text()).toContain("descendientes")
  })

  it("el camino va de la raíz a la ubicación", async () => {
    const session = await signUp("camino@ejemplo.mx")
    const company = await newCompany(session)
    const warehouse = await newWarehouse(session, company.id)

    const piso = await newStorage(session, company.id, warehouse.id, {
      name: "Piso 1",
      kind: "floor",
    })
    const rack = await newStorage(session, company.id, warehouse.id, {
      name: "Rack",
      kind: "rack",
      parentId: piso.id,
    })
    const caja = await newStorage(session, company.id, warehouse.id, {
      name: "Caja",
      kind: "box",
      parentId: rack.id,
    })

    const path = await json<{ items: Storage[] }>(
      await request(
        "GET",
        `/companies/${company.id}/warehouses/${warehouse.id}/storages/${caja.id}/path`,
        undefined,
        session.cookie,
      ),
    )

    expect(path.items.map((row) => row.name)).toEqual(["Piso 1", "Rack", "Caja"])
  })
})

describe("eliminar una ubicación libera sus productos", () => {
  it("recorre el subárbol y deja los productos sin ubicación", async () => {
    // Escenarios: «La eliminación recorre el subárbol» y «Los productos sobreviven a la ubicación».
    // Las dos consecuencias las hace el motor: la cascada y la clave foránea a nulo.
    const session = await signUp("liberar@ejemplo.mx")
    const company = await newCompany(session)
    const warehouse = await newWarehouse(session, company.id)

    const rack = await newStorage(session, company.id, warehouse.id, { name: "Rack", kind: "rack" })
    const estante = await newStorage(session, company.id, warehouse.id, {
      name: "Estante",
      kind: "shelf",
      parentId: rack.id,
    })

    const productId = newId()
    await db.insert(warehouseProducts).values({
      id: productId,
      warehouseId: warehouse.id,
      name: "Tripié",
      code: "P-10",
      storageId: estante.id,
    })

    const scope = await json<{ storages: number; products: number }>(
      await request(
        "GET",
        `/companies/${company.id}/warehouses/${warehouse.id}/storages/${rack.id}/scope`,
        undefined,
        session.cookie,
      ),
    )
    expect(scope).toEqual({ storages: 2, products: 1 })

    const deleted = await request(
      "DELETE",
      `/companies/${company.id}/warehouses/${warehouse.id}/storages/${rack.id}`,
      undefined,
      session.cookie,
    )
    expect(deleted.status).toBe(204)

    const quedan = await db
      .select()
      .from(warehouseStorages)
      .where(eq(warehouseStorages.warehouseId, warehouse.id))
    expect(quedan).toHaveLength(0)

    const [product] = await db
      .select()
      .from(warehouseProducts)
      .where(eq(warehouseProducts.id, productId))
    expect(product?.storageId).toBeNull()
  })

  it("el recuento de productos no cuenta las variantes", async () => {
    // Escenario: «El recuento no cuenta las variantes». Heredan la ubicación de su padre.
    const session = await signUp("recuento@ejemplo.mx")
    const company = await newCompany(session)
    const warehouse = await newWarehouse(session, company.id)
    const caja = await newStorage(session, company.id, warehouse.id, { name: "Caja", kind: "box" })

    const padre = newId()
    await db.insert(warehouseProducts).values([
      { id: padre, warehouseId: warehouse.id, name: "Cámara", code: "C-1", storageId: caja.id },
      ...["negra", "gris", "blanca"].map((color, index) => ({
        id: newId(),
        warehouseId: warehouse.id,
        name: `Cámara ${color}`,
        code: `C-${index + 2}`,
        storageId: caja.id,
        parentId: padre,
        relationToParent: "variant" as const,
      })),
    ])

    const listed = await json<{ items: Storage[] }>(
      await request(
        "GET",
        `/companies/${company.id}/warehouses/${warehouse.id}/storages`,
        undefined,
        session.cookie,
      ),
    )

    expect(listed.items[0]?.productCount).toBe(1)
  })
})
