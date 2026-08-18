/**
 * Direcciones, contrapartes y taxonomía global, de extremo a extremo.
 *
 * Transcritas de los escenarios de `addresses`, `clients-and-providers` y `category-trees`.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db, withElevated } from "@tfv/db"
import {
  companies,
  companyMembers,
  companyServices,
  counterparties,
  globalCategories,
  loginAttempts,
  notificationDeliveries,
  roles,
  services,
  sessions,
  users,
  warehouseQuotes,
  warehouses,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"
import { provisionBuyer, provisionPair } from "./counterparties.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${warehouseQuotes}, ${warehouses}, ${companyServices}, ${counterparties}, ${globalCategories}, ${services}, ${companies} cascade`,
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
  readonly email: string
}

async function signUp(email: string, { platformAdmin = false } = {}): Promise<Session> {
  await request("POST", "/auth/register", { email, password: PASSWORD, name: email.split("@")[0] })
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), isPlatformAdmin: platformAdmin })
    .where(eq(users.email, email))

  const response = await request("POST", "/auth/login", { email, password: PASSWORD })
  const cookie = response.headers
    .getSetCookie()
    .find((raw) => raw.startsWith("tfv_session="))
    ?.split(";")[0]

  if (!cookie) throw new Error("no se abrió sesión")

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (!user) throw new Error("la cuenta debería existir")

  return { cookie, userId: user.id, email }
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

interface Address {
  id: string
  label: string
  isPrimary: boolean
}
interface Counterparty {
  id: string
  alias: string
  role: string
  userId: string | null
}
interface Category {
  id: string
  name: string
  slug: string | null
  parentId: string | null
}

async function newCompany(session: Session, name = "Empresa"): Promise<{ id: string }> {
  const response = await request("POST", "/companies", { name }, session.cookie)
  expect(response.status).toBe(201)
  return json<{ id: string }>(response)
}

// ─── Direcciones ─────────────────────────────────────────────────────────────

describe("libreta del usuario", () => {
  it("la primera dirección se marca sola como primaria", async () => {
    // Escenario: «La primera dirección se marca sola».
    const session = await signUp("libreta@ejemplo.mx")

    const created = await json<Address>(
      await request("POST", "/me/addresses", { label: "Casa" }, session.cookie),
    )

    expect(created.isPrimary).toBe(true)
  })

  it("marcar una desmarca la anterior", async () => {
    // Escenario: «Marcar una desmarca la anterior».
    const session = await signUp("primaria@ejemplo.mx")

    const a = await json<Address>(
      await request("POST", "/me/addresses", { label: "A" }, session.cookie),
    )
    const b = await json<Address>(
      await request("POST", "/me/addresses", { label: "B" }, session.cookie),
    )

    expect(a.isPrimary).toBe(true)
    expect(b.isPrimary).toBe(false)

    await request("PATCH", `/me/addresses/${b.id}`, { isPrimary: true }, session.cookie)

    const listed = await json<{ items: Address[] }>(
      await request("GET", "/me/addresses", undefined, session.cookie),
    )

    expect(listed.items.filter((address) => address.isPrimary)).toHaveLength(1)
    expect(listed.items.find((address) => address.id === b.id)?.isPrimary).toBe(true)
    expect(listed.items.find((address) => address.id === a.id)?.isPrimary).toBe(false)
  })

  it("eliminar la primaria promueve otra", async () => {
    // Escenario: «Se promueve una sustituta».
    const session = await signUp("promueve@ejemplo.mx")

    const first = await json<Address>(
      await request("POST", "/me/addresses", { label: "A" }, session.cookie),
    )
    await request("POST", "/me/addresses", { label: "B" }, session.cookie)
    await request("POST", "/me/addresses", { label: "C" }, session.cookie)

    await request("DELETE", `/me/addresses/${first.id}`, undefined, session.cookie)

    const listed = await json<{ items: Address[] }>(
      await request("GET", "/me/addresses", undefined, session.cookie),
    )

    expect(listed.items).toHaveLength(2)
    expect(listed.items.filter((address) => address.isPrimary)).toHaveLength(1)
  })

  it("al vaciar la libreta no queda primaria", async () => {
    // Escenario: «Al vaciar la libreta no queda primaria». Es un estado válido, no un error.
    const session = await signUp("vacia@ejemplo.mx")

    const only = await json<Address>(
      await request("POST", "/me/addresses", { label: "Única" }, session.cookie),
    )
    await request("DELETE", `/me/addresses/${only.id}`, undefined, session.cookie)

    const listed = await json<{ items: Address[] }>(
      await request("GET", "/me/addresses", undefined, session.cookie),
    )

    expect(listed.items).toEqual([])
  })

  it("un usuario no ve las direcciones de otro", async () => {
    // Escenario: «Un usuario no ve las direcciones de otro» → `404`, no `403`.
    const owner = await signUp("mia@ejemplo.mx")
    const stranger = await signUp("ajena-libreta@ejemplo.mx")

    const address = await json<Address>(
      await request("POST", "/me/addresses", { label: "Mía" }, owner.cookie),
    )

    const listed = await json<{ items: Address[] }>(
      await request("GET", "/me/addresses", undefined, stranger.cookie),
    )
    expect(listed.items).toEqual([])

    const peek = await request(
      "PATCH",
      `/me/addresses/${address.id}`,
      { label: "Robada" },
      stranger.cookie,
    )
    expect(peek.status).toBe(404)
  })
})

describe("libreta de la empresa", () => {
  it("la ven todos los miembros, no sólo quien la creó", async () => {
    // Escenario: «Las direcciones son de la empresa, no del miembro».
    const founder = await signUp("jefa-dir@ejemplo.mx")
    const worker = await signUp("miembro-dir@ejemplo.mx")
    const company = await newCompany(founder)

    await request(
      "POST",
      `/companies/${company.id}/members`,
      { email: worker.email },
      founder.cookie,
    )
    await request(
      "POST",
      `/companies/${company.id}/addresses`,
      { label: "Bodega norte" },
      founder.cookie,
    )

    // El miembro no tiene permiso de ver direcciones, así que aún no la ve…
    expect(
      (await request("GET", `/companies/${company.id}/addresses`, undefined, worker.cookie)).status,
    ).toBe(403)

    // …y con el permiso, sí. Es de la empresa, no de quien la escribió.
    const role = await json<{ id: string }>(
      await request(
        "POST",
        `/companies/${company.id}/roles`,
        { name: "Ve direcciones", permissions: ["companies.addresses.view"] },
        founder.cookie,
      ),
    )
    const members = await json<{ items: { id: string; userId: string }[] }>(
      await request("GET", `/companies/${company.id}/members`, undefined, founder.cookie),
    )
    const membership = members.items.find((member) => member.userId === worker.userId)

    await request(
      "PATCH",
      `/companies/${company.id}/members/${membership?.id}`,
      { roleId: role.id },
      founder.cookie,
    )

    const listed = await json<{ items: Address[] }>(
      await request("GET", `/companies/${company.id}/addresses`, undefined, worker.cookie),
    )
    expect(listed.items.map((address) => address.label)).toEqual(["Bodega norte"])
  })

  it("las libretas no se cruzan entre empresas", async () => {
    const founder = await signUp("dos-empresas@ejemplo.mx")
    const one = await newCompany(founder, "Una")
    const two = await newCompany(founder, "Otra")

    await request("POST", `/companies/${one.id}/addresses`, { label: "De Una" }, founder.cookie)

    const listed = await json<{ items: Address[] }>(
      await request("GET", `/companies/${two.id}/addresses`, undefined, founder.cookie),
    )

    expect(listed.items).toEqual([])
  })
})

// ─── Contrapartes ────────────────────────────────────────────────────────────

describe("contrapartes", () => {
  it("se dan de alta como externas o atadas a una cuenta", async () => {
    const founder = await signUp("cartera@ejemplo.mx")
    const client = await signUp("cliente-real@ejemplo.mx")
    const company = await newCompany(founder)

    const external = await json<Counterparty>(
      await request(
        "POST",
        `/companies/${company.id}/clients`,
        { alias: "Sin cuenta", snapshot: { phone: "55-0000" } },
        founder.cookie,
      ),
    )
    expect(external.userId).toBeNull()

    const linked = await json<Counterparty>(
      await request(
        "POST",
        `/companies/${company.id}/clients`,
        { alias: "Con cuenta", email: client.email },
        founder.cookie,
      ),
    )
    expect(linked.userId).toBe(client.userId)
  })

  it("clientes y proveedores no comparten permiso", async () => {
    // El catálogo los separa, así que quien lleva las compras no ve por ello la cartera de clientes.
    const founder = await signUp("separados@ejemplo.mx")
    const buyer = await signUp("comprador-rol@ejemplo.mx")
    const company = await newCompany(founder)

    const role = await json<{ id: string }>(
      await request(
        "POST",
        `/companies/${company.id}/roles`,
        { name: "Compras", permissions: ["companies.providers.view"] },
        founder.cookie,
      ),
    )
    await request(
      "POST",
      `/companies/${company.id}/members`,
      { email: buyer.email, roleId: role.id },
      founder.cookie,
    )

    expect(
      (await request("GET", `/companies/${company.id}/providers`, undefined, buyer.cookie)).status,
    ).toBe(200)
    expect(
      (await request("GET", `/companies/${company.id}/clients`, undefined, buyer.cookie)).status,
    ).toBe(403)
  })

  it("la baja es lógica: el documento emitido conserva el nombre", async () => {
    const founder = await signUp("baja-cp@ejemplo.mx")
    const company = await newCompany(founder)

    const client = await json<Counterparty>(
      await request("POST", `/companies/${company.id}/clients`, { alias: "Se va" }, founder.cookie),
    )

    await request(
      "DELETE",
      `/companies/${company.id}/clients/${client.id}`,
      undefined,
      founder.cookie,
    )

    const listed = await json<{ items: Counterparty[] }>(
      await request("GET", `/companies/${company.id}/clients`, undefined, founder.cookie),
    )
    expect(listed.items).toEqual([])

    // La fila sigue ahí: borrarla de verdad dejaría los documentos apuntando al vacío.
    const surviving = await withElevated("comprobación de prueba", (tx) =>
      tx.select().from(counterparties).where(eq(counterparties.id, client.id)),
    )
    expect(surviving).toHaveLength(1)
    expect(surviving[0]?.deletedAt).not.toBeNull()
  })
})

describe("una contraparte con documentos vigentes no se da de baja", () => {
  /** Un almacén con una cotización abierta a nombre del cliente. */
  async function withOpenQuote() {
    const founder = await signUp(`cartera-viva-${Date.now()}@ejemplo.mx`)
    const company = await newCompany(founder)

    const serviceId = newId()
    await db.insert(services).values({ id: serviceId, keycode: "warehouses", name: "Almacenes" })
    await db.insert(companyServices).values({ id: newId(), companyId: company.id, serviceId })

    const client = await json<Counterparty>(
      await request(
        "POST",
        `/companies/${company.id}/clients`,
        { alias: "Producciones Sol" },
        founder.cookie,
      ),
    )

    const warehouse = await json<{ id: string }>(
      await request(
        "POST",
        `/companies/${company.id}/warehouses`,
        { name: "Nave" },
        founder.cookie,
      ),
    )

    const quote = await json<{ id: string }>(
      await request(
        "POST",
        `/companies/${company.id}/warehouses/${warehouse.id}/quotes`,
        { type: "sale", clientId: client.id },
        founder.cookie,
      ),
    )

    return { founder, company, client, warehouse, quote }
  }

  it("se rechaza nombrando lo que la retiene", async () => {
    // La comprobación estuvo declarada pendiente desde la rebanada 10, cuando no había nada que
    // consultar. Fingirla entonces habría sido peor que declararla.
    const { founder, company, client } = await withOpenQuote()

    const response = await request(
      "DELETE",
      `/companies/${company.id}/clients/${client.id}`,
      undefined,
      founder.cookie,
    )

    expect(response.status).toBe(422)
    expect(await response.text()).toContain("cotización abierta")
  })

  it("los documentos cerrados no la retienen", async () => {
    // Una venta de hace dos años no debe impedir limpiar la cartera: su copia de los datos del
    // cliente vive en el propio documento.
    const { founder, company, client, warehouse, quote } = await withOpenQuote()

    await request(
      "PATCH",
      `/companies/${company.id}/warehouses/${warehouse.id}/quotes/${quote.id}/status`,
      { status: "canceled" },
      founder.cookie,
    )

    const response = await request(
      "DELETE",
      `/companies/${company.id}/clients/${client.id}`,
      undefined,
      founder.cookie,
    )
    expect(response.status).toBe(204)
  })
})

describe("aprovisionamiento en pareja", () => {
  it("una compra entre empresas crea las dos contrapartes", async () => {
    // Escenario: «Una compra entre empresas crea las dos contrapartes».
    const founder = await signUp("pareja@ejemplo.mx")
    const seller = await newCompany(founder, "Vendedora")
    const buyer = await newCompany(founder, "Compradora")

    await provisionPair(
      { companyId: seller.id, name: "Vendedora" },
      { companyId: buyer.id, name: "Compradora" },
    )

    const clients = await json<{ items: Counterparty[] }>(
      await request("GET", `/companies/${seller.id}/clients`, undefined, founder.cookie),
    )
    const providers = await json<{ items: Counterparty[] }>(
      await request("GET", `/companies/${buyer.id}/providers`, undefined, founder.cookie),
    )

    expect(clients.items.map((row) => row.alias)).toEqual(["Compradora"])
    expect(providers.items.map((row) => row.alias)).toEqual(["Vendedora"])
  })

  it("una segunda compra no duplica", async () => {
    // Escenario: «Una segunda compra no duplica». La idempotencia la garantiza el índice único, no
    // una comprobación previa — que dejaría una ventana entre comprobar e insertar.
    const founder = await signUp("idempotente@ejemplo.mx")
    const seller = await newCompany(founder, "Vendedora dos")
    const buyer = await newCompany(founder, "Compradora dos")

    const pair = { companyId: seller.id, name: "Vendedora dos" }
    const other = { companyId: buyer.id, name: "Compradora dos" }

    await provisionPair(pair, other)
    await provisionPair(pair, other)
    await provisionPair(pair, other)

    const clients = await json<{ items: Counterparty[] }>(
      await request("GET", `/companies/${seller.id}/clients`, undefined, founder.cookie),
    )
    expect(clients.items).toHaveLength(1)
  })

  it("un comprador de tienda pública queda como cliente, y sólo una vez", async () => {
    const founder = await signUp("tienda@ejemplo.mx")
    const shopper = await signUp("compradora-tienda@ejemplo.mx")
    const company = await newCompany(founder, "Con tienda")

    const buyer = { userId: shopper.userId, alias: "Nadia", email: shopper.email }
    await provisionBuyer(company.id, buyer)
    await provisionBuyer(company.id, buyer)

    const clients = await json<{ items: Counterparty[] }>(
      await request("GET", `/companies/${company.id}/clients`, undefined, founder.cookie),
    )

    expect(clients.items).toHaveLength(1)
    expect(clients.items[0]?.userId).toBe(shopper.userId)
  })
})

// ─── Taxonomía global ────────────────────────────────────────────────────────

describe("taxonomía global", () => {
  async function platform() {
    const admin = await signUp("taxonomia@ejemplo.mx", { platformAdmin: true })
    const company = await newCompany(admin, "Plataforma")
    return { admin, company }
  }

  it("el listado por defecto muestra las raíces", async () => {
    // Escenario del requisito «El listado por defecto muestra las raíces».
    const { admin, company } = await platform()

    const root = await json<Category>(
      await request(
        "POST",
        `/companies/${company.id}/categories`,
        { name: "Iluminación" },
        admin.cookie,
      ),
    )
    await request(
      "POST",
      `/companies/${company.id}/categories`,
      { name: "Tungsteno", parentId: root.id },
      admin.cookie,
    )

    const roots = await json<{ items: Category[] }>(await request("GET", "/categories"))
    expect(roots.items.map((category) => category.name)).toEqual(["Iluminación"])

    const children = await json<{ items: Category[] }>(
      await request("GET", `/categories?parent=${root.id}`),
    )
    expect(children.items.map((category) => category.name)).toEqual(["Tungsteno"])
  })

  it("se lee sin sesión", async () => {
    // La taxonomía aparece en tiendas y en el directorio, que se sirven a quien no ha entrado.
    expect((await request("GET", "/categories")).status).toBe(200)
  })

  it("un miembro no la edita", async () => {
    // Escenario: «Un miembro no edita la taxonomía global» → `403`.
    const member = await signUp("miembro-tax@ejemplo.mx")
    const company = await newCompany(member, "De un miembro")

    const response = await request(
      "POST",
      `/companies/${company.id}/categories`,
      { name: "No debería" },
      member.cookie,
    )

    expect(response.status).toBe(403)
  })

  it("el identificador legible se deriva del nombre y no colisiona", async () => {
    const { admin, company } = await platform()

    const first = await json<Category>(
      await request(
        "POST",
        `/companies/${company.id}/categories`,
        { name: "Iluminación" },
        admin.cookie,
      ),
    )
    const second = await json<Category>(
      await request(
        "POST",
        `/companies/${company.id}/categories`,
        { name: "Iluminación" },
        admin.cookie,
      ),
    )

    // Los diacríticos se retiran, no las letras.
    expect(first.slug).toBe("iluminacion")
    expect(second.slug).toBe("iluminacion-2")
  })

  it("cambiar de padre actualiza los dos lados", async () => {
    // Escenario: «Cambiar de padre actualiza ambos lados».
    const { admin, company } = await platform()

    const a = await json<Category>(
      await request("POST", `/companies/${company.id}/categories`, { name: "A" }, admin.cookie),
    )
    const b = await json<Category>(
      await request("POST", `/companies/${company.id}/categories`, { name: "B" }, admin.cookie),
    )
    const child = await json<Category>(
      await request(
        "POST",
        `/companies/${company.id}/categories`,
        { name: "Hija", parentId: a.id },
        admin.cookie,
      ),
    )

    await request(
      "PATCH",
      `/companies/${company.id}/categories/${child.id}`,
      { parentId: b.id },
      admin.cookie,
    )

    const underA = await json<{ items: Category[] }>(
      await request("GET", `/categories?parent=${a.id}`),
    )
    const underB = await json<{ items: Category[] }>(
      await request("GET", `/categories?parent=${b.id}`),
    )

    expect(underA.items).toEqual([])
    expect(underB.items.map((category) => category.name)).toEqual(["Hija"])
  })

  it("retirarle el padre la promueve a raíz", async () => {
    const { admin, company } = await platform()

    const parent = await json<Category>(
      await request("POST", `/companies/${company.id}/categories`, { name: "Padre" }, admin.cookie),
    )
    const child = await json<Category>(
      await request(
        "POST",
        `/companies/${company.id}/categories`,
        { name: "Ascendida", parentId: parent.id },
        admin.cookie,
      ),
    )

    await request(
      "PATCH",
      `/companies/${company.id}/categories/${child.id}`,
      { parentId: null },
      admin.cookie,
    )

    const roots = await json<{ items: Category[] }>(await request("GET", "/categories"))
    expect(roots.items.map((category) => category.name).sort()).toEqual(["Ascendida", "Padre"])
  })

  it("una categoría no puede ser su propio padre", async () => {
    const { admin, company } = await platform()

    const category = await json<Category>(
      await request("POST", `/companies/${company.id}/categories`, { name: "Sola" }, admin.cookie),
    )

    const response = await request(
      "PATCH",
      `/companies/${company.id}/categories/${category.id}`,
      { parentId: category.id },
      admin.cookie,
    )

    expect(response.status).toBe(422)
  })

  it("una categoría no puede colgar de su propia descendiente", async () => {
    /**
     * Escenario: «Una categoría no puede ser su propia ancestra». A → B → C, y se intenta colgar A
     * de C.
     *
     * Sin esta comprobación, el subárbol quedaría desconectado del árbol y **no aparecería en
     * ningún listado**: ni entre las raíces, porque tiene padre, ni bajo ninguna raíz alcanzable.
     */
    const { admin, company } = await platform()

    const a = await json<Category>(
      await request("POST", `/companies/${company.id}/categories`, { name: "A" }, admin.cookie),
    )
    const b = await json<Category>(
      await request(
        "POST",
        `/companies/${company.id}/categories`,
        { name: "B", parentId: a.id },
        admin.cookie,
      ),
    )
    const c = await json<Category>(
      await request(
        "POST",
        `/companies/${company.id}/categories`,
        { name: "C", parentId: b.id },
        admin.cookie,
      ),
    )

    const response = await request(
      "PATCH",
      `/companies/${company.id}/categories/${a.id}`,
      { parentId: c.id },
      admin.cookie,
    )

    expect(response.status).toBe(422)
  })

  it("eliminar recorre el subárbol entero, y se advierte antes", async () => {
    // Escenarios: «La eliminación recorre todo el subárbol» y «Se advierte del alcance antes».
    const { admin, company } = await platform()

    const root = await json<Category>(
      await request("POST", `/companies/${company.id}/categories`, { name: "Raíz" }, admin.cookie),
    )

    const branches: Category[] = []
    for (const name of ["Rama uno", "Rama dos"]) {
      branches.push(
        await json<Category>(
          await request(
            "POST",
            `/companies/${company.id}/categories`,
            { name, parentId: root.id },
            admin.cookie,
          ),
        ),
      )
    }
    for (const name of ["Nieta uno", "Nieta dos", "Nieta tres"]) {
      await request(
        "POST",
        `/companies/${company.id}/categories`,
        { name, parentId: branches[0]?.id },
        admin.cookie,
      )
    }

    // Seis en total, ella incluida: se advierte antes de confirmar.
    const scope = await json<{ categories: number }>(
      await request(
        "GET",
        `/companies/${company.id}/categories/${root.id}/scope`,
        undefined,
        admin.cookie,
      ),
    )
    expect(scope.categories).toBe(6)

    await request(
      "DELETE",
      `/companies/${company.id}/categories/${root.id}`,
      undefined,
      admin.cookie,
    )

    const remaining = await withElevated("comprobación de prueba", (tx) =>
      tx.select().from(globalCategories),
    )
    expect(remaining).toEqual([])
  })

  it("sólo se ofrecen las categorías del servicio pertinente", async () => {
    // Escenario: «Se ofrecen las categorías del servicio pertinente».
    const { admin, company } = await platform()

    await db.insert(services).values([
      { id: newId(), keycode: "warehouses", name: "Almacenes" },
      { id: newId(), keycode: "locations", name: "Locaciones" },
    ])

    await request(
      "POST",
      `/companies/${company.id}/categories`,
      { name: "De almacén", service: "warehouses" },
      admin.cookie,
    )
    await request(
      "POST",
      `/companies/${company.id}/categories`,
      { name: "De locación", service: "locations" },
      admin.cookie,
    )

    const listed = await json<{ items: Category[] }>(
      await request("GET", "/categories?service=warehouses"),
    )

    expect(listed.items.map((category) => category.name)).toEqual(["De almacén"])
  })
})
