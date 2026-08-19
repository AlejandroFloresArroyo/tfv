/**
 * Producciones, su taxonomía y sus planes de trabajo, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/production-management/spec.md`,
 * `category-trees/spec.md` —requisito «Alcance de la taxonomía de producción»— y
 * `production-workflows/spec.md`.
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
  productionAnchors,
  productionChapters,
  productionPurchaseOrders,
  productionRecordings,
  productionScenes,
  productionShoppings,
  productions,
  productionTasks,
  roles,
  services,
  sessions,
  uploads,
  users,
  warehouseOrders,
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
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${warehouseOrders}, ${warehouses}, ${productions}, ${uploads}, ${services}, ${companies} cascade`,
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

interface Production {
  id: string
  name: string
  description: string
  slug: string | null
  isPublished: boolean
  startsOn: string | null
  endsOn: string | null
}

interface Category {
  id: string
  parentId: string | null
  roleId: string | null
  roleName: string | null
  name: string
  childCount: number
}

interface Workflow {
  id: string
  code: string
  status: string
  scheduledFor: string
  observations: string
  responsibleId: string | null
  taskCount: number
  tasksByStatus?: Record<string, number>
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

/** Una empresa con el servicio de producciones contratado, que es lo que exige crear una. */
async function newCompany(session: Session, name = "Estudios Mariposa", withService = true) {
  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name }, session.cookie),
  )

  if (withService) await enableService(company.id, "productions")
  return company
}

async function enableService(companyId: string, keycode: string) {
  const [existing] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.keycode, keycode))

  const serviceId = existing?.id ?? newId()
  if (!existing) {
    await db.insert(services).values({ id: serviceId, keycode, name: keycode })
  }

  await db
    .insert(companyServices)
    .values({ id: newId(), companyId, serviceId })
    .onConflictDoNothing()
}

async function newProduction(
  session: Session,
  companyId: string,
  body: Record<string, unknown> = { name: "Serie Piloto" },
) {
  const response = await request(
    "POST",
    `/companies/${companyId}/productions`,
    body,
    session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Production>(response)
}

async function newCategory(
  session: Session,
  companyId: string,
  productionId: string,
  body: Record<string, unknown>,
) {
  const response = await request(
    "POST",
    `/companies/${companyId}/productions/${productionId}/categories`,
    body,
    session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Category>(response)
}

async function newWorkflow(
  session: Session,
  companyId: string,
  productionId: string,
  body: Record<string, unknown> = { scheduledFor: "2026-09-01T08:00:00.000Z" },
) {
  const response = await request(
    "POST",
    `/companies/${companyId}/productions/${productionId}/workflows`,
    body,
    session.cookie,
  )
  expect(response.status).toBe(201)
  return json<Workflow>(response)
}

let scopedAccounts = 0

/** Una cuenta de la misma empresa con un rol acotado a las claves que se le pasen. */
async function memberWith(companyId: string, permissions: string[]): Promise<string> {
  scopedAccounts += 1
  const email = `acotada-${scopedAccounts}@ejemplo.mx`
  await request("POST", "/auth/register", { email, password: PASSWORD, name: "Acotada" })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  const roleId = newId()
  await db
    .insert(roles)
    .values({ id: roleId, companyId, name: `Rol acotado ${scopedAccounts}`, permissions })
  await db
    .insert(companyMembers)
    .values({ id: newId(), companyId, userId: user?.id ?? "", roleId, isOwner: false })

  const login = await request("POST", "/auth/login", { email, password: PASSWORD })
  return (
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""
  )
}

// ─── La producción como entidad ──────────────────────────────────────────────

describe("una producción pertenece a una empresa", () => {
  it("sin el servicio contratado no se crea", async () => {
    // Escenario: «Sin el servicio no se crea». La propiedad concede todos los permisos, así que
    // aquí no falla el permiso: falla la habilitación, que es otra compuerta y responde distinto.
    const session = await signUp("sin-servicio@ejemplo.mx")
    const company = await newCompany(session, "Sin Producciones", false)

    const response = await request(
      "POST",
      `/companies/${company.id}/productions`,
      { name: "Serie" },
      session.cookie,
    )

    expect(response.status).toBe(403)
    expect(await response.text()).toContain("service_not_enabled")
  })

  it("con el servicio contratado se crea con su identificador legible", async () => {
    const session = await signUp("con-servicio@ejemplo.mx")
    const company = await newCompany(session)

    const production = await newProduction(session, company.id, { name: "La Casa de Enfrente" })

    expect(production.slug).toBe("la-casa-de-enfrente")
    expect(production.isPublished).toBe(false)
  })

  it("la fecha de fin no precede al inicio", async () => {
    // Escenario de frontera: «La fecha de fin no precede al inicio».
    const session = await signUp("fechas@ejemplo.mx")
    const company = await newCompany(session)

    const response = await request(
      "POST",
      `/companies/${company.id}/productions`,
      {
        name: "Rodaje imposible",
        startsOn: "2026-09-01T00:00:00.000Z",
        endsOn: "2026-08-01T00:00:00.000Z",
      },
      session.cookie,
    )

    expect(response.status).toBe(422)
  })

  it("editar sólo el fin se compara con el inicio guardado", async () => {
    // Corregir una fecha de una en una tiene que ser posible: la comprobación mira el estado
    // resultante, no lo que llegó en el cuerpo.
    const session = await signUp("fecha-suelta@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id, {
      name: "Serie",
      startsOn: "2026-09-01T00:00:00.000Z",
      endsOn: "2026-10-01T00:00:00.000Z",
    })

    const rejected = await request(
      "PATCH",
      `/companies/${company.id}/productions/${production.id}`,
      { endsOn: "2026-08-01T00:00:00.000Z" },
      session.cookie,
    )
    expect(rejected.status).toBe(422)

    const accepted = await request(
      "PATCH",
      `/companies/${company.id}/productions/${production.id}`,
      { endsOn: "2026-11-01T00:00:00.000Z" },
      session.cookie,
    )
    expect(accepted.status).toBe(200)
  })

  it("una empresa ajena responde que no", async () => {
    const session = await signUp("ajena@ejemplo.mx")
    const otherId = newId()
    await db.insert(companies).values({ id: otherId, name: "Ajena" })

    const response = await request(
      "GET",
      `/companies/${otherId}/productions`,
      undefined,
      session.cookie,
    )

    expect(response.status).toBe(404)
  })
})

describe("consulta de las producciones de una empresa", () => {
  it("se buscan por parte del nombre", async () => {
    // Escenario: «Se buscan producciones por nombre».
    const session = await signUp("busqueda@ejemplo.mx")
    const company = await newCompany(session)
    await newProduction(session, company.id, { name: "Cielo Partido" })
    await newProduction(session, company.id, { name: "Documental del Bajío" })

    const page = await json<{ items: Production[]; totalItems: number }>(
      await request(
        "GET",
        `/companies/${company.id}/productions?search=cielo`,
        undefined,
        session.cookie,
      ),
    )

    expect(page.totalItems).toBe(1)
    expect(page.items[0]?.name).toBe("Cielo Partido")
  })

  it("se filtran por estado de publicación", async () => {
    const session = await signUp("publicadas@ejemplo.mx")
    const company = await newCompany(session)
    const visible = await newProduction(session, company.id, { name: "Publicada" })
    await newProduction(session, company.id, { name: "Reservada" })

    await request(
      "PATCH",
      `/companies/${company.id}/productions/${visible.id}`,
      { isPublished: true },
      session.cookie,
    )

    const page = await json<{ items: Production[] }>(
      await request(
        "GET",
        `/companies/${company.id}/productions?isPublished=true`,
        undefined,
        session.cookie,
      ),
    )

    expect(page.items.map((row) => row.name)).toEqual(["Publicada"])
  })
})

// ─── Baja ────────────────────────────────────────────────────────────────────

describe("eliminación de una producción", () => {
  it("se advierte del alcance antes de confirmar", async () => {
    // Escenario: «Se advierte del alcance». La producción es la mayor cascada del sistema, así que
    // la confirmación tiene que poder decir qué se lleva por delante y no sólo que se lleva algo.
    const session = await signUp("alcance@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const chapterId = newId()
    await db
      .insert(productionChapters)
      .values({ id: chapterId, productionId: production.id, name: "Capítulo 1", index: 1 })
    await db.insert(productionScenes).values({ id: newId(), chapterId, name: "Escena 1", index: 1 })
    await db
      .insert(productionRecordings)
      .values({ id: newId(), productionId: production.id, name: "Jornada 1" })
    await newWorkflow(session, company.id, production.id)

    const scope = await json<Record<string, number>>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/scope`,
        undefined,
        session.cookie,
      ),
    )

    expect(scope.chapters).toBe(1)
    expect(scope.scenes).toBe(1)
    expect(scope.recordings).toBe(1)
    expect(scope.workflows).toBe(1)
    expect(scope.openPurchaseOrders).toBe(0)
  })

  it("no se elimina con equipo rentado sin devolver", async () => {
    // Escenario: «No se elimina con equipo fuera». El pedido de almacén es de **otra empresa**, y
    // se alcanza porque la política admite la vía de la orden de compra. Es exactamente el dato que
    // dejaría de ser accesible al dar de baja la producción — y con él, cómo reclamar el equipo.
    const session = await signUp("equipo-fuera@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const purchaseOrderId = newId()
    await db.insert(productionPurchaseOrders).values({
      id: purchaseOrderId,
      productionId: production.id,
      code: `OC-${newId().slice(0, 8)}`,
      status: "settled",
    })

    const warehouseCompanyId = newId()
    const warehouseId = newId()
    await db.insert(companies).values({ id: warehouseCompanyId, name: "Casa de Renta" })
    await db
      .insert(warehouses)
      .values({ id: warehouseId, companyId: warehouseCompanyId, name: "Nave" })
    await db.insert(warehouseOrders).values({
      id: newId(),
      warehouseId,
      code: `PED-${newId().slice(0, 8)}`,
      origin: "production",
      status: "delivered",
      purchaseOrderId,
    })

    const scope = await json<Record<string, number>>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/scope`,
        undefined,
        session.cookie,
      ),
    )
    expect(scope.unreturnedOrders).toBe(1)

    const response = await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}`,
      undefined,
      session.cookie,
    )

    expect(response.status).toBe(409)
    expect(await response.text()).toContain("sin devolver")
  })

  it("no se elimina con una orden de compra en curso", async () => {
    const session = await signUp("orden-abierta@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    await db.insert(productionPurchaseOrders).values({
      id: newId(),
      productionId: production.id,
      code: `OC-${newId().slice(0, 8)}`,
      status: "open",
    })

    const response = await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}`,
      undefined,
      session.cookie,
    )

    expect(response.status).toBe(409)
  })

  it("la eliminación no toca a la empresa ni a sus otras producciones", async () => {
    // Escenario: «La eliminación no toca a la empresa». Es la corrección de C-08: la pila anterior
    // borraba de la tabla de empresas usando el identificador de otra entidad.
    const session = await signUp("cascada@ejemplo.mx")
    const company = await newCompany(session)
    const doomed = await newProduction(session, company.id, { name: "La que se va" })
    const survivor = await newProduction(session, company.id, { name: "La que se queda" })

    const response = await request(
      "DELETE",
      `/companies/${company.id}/productions/${doomed.id}`,
      undefined,
      session.cookie,
    )
    expect(response.status).toBe(204)

    const [stillThere] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, company.id))
    expect(stillThere).toBeDefined()

    const page = await json<{ items: Production[] }>(
      await request("GET", `/companies/${company.id}/productions`, undefined, session.cookie),
    )
    expect(page.items.map((row) => row.id)).toEqual([survivor.id])

    const gone = await request(
      "GET",
      `/companies/${company.id}/productions/${doomed.id}`,
      undefined,
      session.cookie,
    )
    expect(gone.status).toBe(404)
  })
})

// ─── Taxonomía: el trabajo llega a su equipo ─────────────────────────────────

describe("la taxonomía de una producción apunta a un rol", () => {
  it("una categoría se asocia al equipo que hará el trabajo", async () => {
    // Escenario de `category-trees`: «Una categoría de producción apunta a un rol».
    const session = await signUp("equipo@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const roleId = newId()
    await db
      .insert(roles)
      .values({ id: roleId, companyId: company.id, name: "Vestuario", permissions: [] })

    const category = await newCategory(session, company.id, production.id, {
      name: "Vestuario",
      roleId,
    })

    expect(category.roleId).toBe(roleId)
    expect(category.roleName).toBe("Vestuario")
  })

  it("un rol de otra empresa no se puede asignar", async () => {
    // La clave foránea no lo impediría: se comprueba con los permisos del dueño de la tabla y se
    // salta las políticas de fila. Sin esta comprobación quedaría escrita una referencia cruzada
    // entre arrendatarios.
    const session = await signUp("rol-ajeno@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const otherCompanyId = newId()
    const foreignRoleId = newId()
    await db.insert(companies).values({ id: otherCompanyId, name: "Otra Productora" })
    await db
      .insert(roles)
      .values({ id: foreignRoleId, companyId: otherCompanyId, name: "Ajeno", permissions: [] })

    const response = await request(
      "POST",
      `/companies/${company.id}/productions/${production.id}/categories`,
      { name: "Infiltrada", roleId: foreignRoleId },
      session.cookie,
    )

    expect(response.status).toBe(404)
  })

  it("el listado sin padre devuelve las raíces y no aplana el árbol", async () => {
    const session = await signUp("arbol@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const root = await newCategory(session, company.id, production.id, { name: "Arte" })
    await newCategory(session, company.id, production.id, {
      name: "Utilería",
      parentId: root.id,
    })

    const roots = await json<{ items: Category[] }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/categories`,
        undefined,
        session.cookie,
      ),
    )

    expect(roots.items.map((row) => row.name)).toEqual(["Arte"])
    expect(roots.items[0]?.childCount).toBe(1)
  })

  it("una categoría no puede colgar de una de sus descendientes", async () => {
    const session = await signUp("ciclo@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const a = await newCategory(session, company.id, production.id, { name: "A" })
    const b = await newCategory(session, company.id, production.id, {
      name: "B",
      parentId: a.id,
    })
    const c = await newCategory(session, company.id, production.id, {
      name: "C",
      parentId: b.id,
    })

    const response = await request(
      "PATCH",
      `/companies/${company.id}/productions/${production.id}/categories/${a.id}`,
      { parentId: c.id },
      session.cookie,
    )

    expect(response.status).toBe(422)
  })

  it("eliminar una categoría se lleva su subárbol y deja lo clasificado sin categoría", async () => {
    const session = await signUp("subarbol@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const root = await newCategory(session, company.id, production.id, { name: "Arte" })
    await newCategory(session, company.id, production.id, { name: "Utilería", parentId: root.id })

    const workflow = await newWorkflow(session, company.id, production.id)
    const taskId = newId()
    await db.insert(productionTasks).values({
      id: taskId,
      workflowId: workflow.id,
      categoryId: root.id,
      title: "Comprar sombreros",
    })

    const scope = await json<Record<string, number>>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/categories/${root.id}/scope`,
        undefined,
        session.cookie,
      ),
    )
    expect(scope.categories).toBe(2)
    expect(scope.tasks).toBe(1)

    const removed = await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}/categories/${root.id}`,
      undefined,
      session.cookie,
    )
    expect(removed.status).toBe(204)

    const remaining = await json<{ items: Category[] }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/categories`,
        undefined,
        session.cookie,
      ),
    )
    expect(remaining.items).toEqual([])

    const [task] = await db
      .select({ categoryId: productionTasks.categoryId })
      .from(productionTasks)
      .where(eq(productionTasks.id, taskId))
    expect(task?.categoryId).toBeNull()
  })
})

// ─── Planes de trabajo ───────────────────────────────────────────────────────

describe("planes de trabajo de una producción", () => {
  it("un plan nace pendiente", async () => {
    // Escenario: «Un plan nace pendiente». El estado no se recibe en el alta a propósito.
    const session = await signUp("plan@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const workflow = await newWorkflow(session, company.id, production.id)

    expect(workflow.status).toBe("pending")
    expect(workflow.code.startsWith("PLAN-")).toBe(true)
    expect(workflow.taskCount).toBe(0)
  })

  it("reprogramarlo conserva sus tareas", async () => {
    // Escenario: «Un plan se reprograma → conserva sus tareas». La fecha y el estado viajan juntos:
    // partirlo en dos peticiones dejaría una ventana con la jornada movida y el estado sin mover.
    const session = await signUp("reprograma@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const workflow = await newWorkflow(session, company.id, production.id)

    await db.insert(productionTasks).values([
      { id: newId(), workflowId: workflow.id, title: "Montar set" },
      { id: newId(), workflowId: workflow.id, title: "Probar luces", status: "completed" },
    ])

    const moved = await json<Workflow>(
      await request(
        "PATCH",
        `/companies/${company.id}/productions/${production.id}/workflows/${workflow.id}`,
        { scheduledFor: "2026-09-08T08:00:00.000Z", status: "rescheduled" },
        session.cookie,
      ),
    )

    expect(moved.status).toBe("rescheduled")
    expect(moved.scheduledFor).toBe("2026-09-08T08:00:00.000Z")
    expect(moved.taskCount).toBe(2)
  })

  it("el desglose por estado sólo llega cuando se pide", async () => {
    // `computed-fields`: «se lista sin solicitar sus agregados → la respuesta no incluye el
    // desglose». Y el recuento, que no es un agregado costoso, sí va siempre.
    const session = await signUp("agregados@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const workflow = await newWorkflow(session, company.id, production.id)

    await db.insert(productionTasks).values([
      { id: newId(), workflowId: workflow.id, title: "Uno" },
      { id: newId(), workflowId: workflow.id, title: "Dos" },
      { id: newId(), workflowId: workflow.id, title: "Tres", status: "completed" },
    ])

    const plain = await json<{ items: Workflow[] }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/workflows`,
        undefined,
        session.cookie,
      ),
    )
    expect(plain.items[0]?.taskCount).toBe(3)
    expect(plain.items[0]?.tasksByStatus).toBeUndefined()

    const detailed = await json<Workflow>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/workflows/${workflow.id}?aggregates=true`,
        undefined,
        session.cookie,
      ),
    )
    expect(detailed.tasksByStatus).toEqual({
      pending: 2,
      in_progress: 0,
      completed: 1,
      incomplete: 0,
    })
  })

  it("cambiar el estado exige su propia clave", async () => {
    // `productions.workflows.status` está en el catálogo separada de `edit`. Colapsarlas ampliaría
    // en silencio la autoridad de quien sólo podía corregir observaciones.
    const session = await signUp("clave-estado@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const workflow = await newWorkflow(session, company.id, production.id)

    const scoped = await memberWith(company.id, [
      "productions.productions.view",
      "productions.workflows.view",
      "productions.workflows.edit",
    ])

    const edited = await request(
      "PATCH",
      `/companies/${company.id}/productions/${production.id}/workflows/${workflow.id}`,
      { observations: "Llamado a las seis" },
      scoped,
    )
    expect(edited.status).toBe(200)

    const closed = await request(
      "PATCH",
      `/companies/${company.id}/productions/${production.id}/workflows/${workflow.id}`,
      { status: "completed" },
      scoped,
    )
    expect(closed.status).toBe(403)
  })

  it("el alcance de la baja enumera sus tareas", async () => {
    const session = await signUp("baja-plan@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)
    const workflow = await newWorkflow(session, company.id, production.id)

    await db.insert(productionTasks).values([
      { id: newId(), workflowId: workflow.id, title: "Uno" },
      { id: newId(), workflowId: workflow.id, title: "Dos" },
    ])

    const scope = await json<{ tasks: number }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/workflows/${workflow.id}/scope`,
        undefined,
        session.cookie,
      ),
    )
    expect(scope.tasks).toBe(2)

    const removed = await request(
      "DELETE",
      `/companies/${company.id}/productions/${production.id}/workflows/${workflow.id}`,
      undefined,
      session.cookie,
    )
    expect(removed.status).toBe(204)

    const page = await json<{ totalItems: number }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/workflows`,
        undefined,
        session.cookie,
      ),
    )
    expect(page.totalItems).toBe(0)
  })
})

// ─── Panel ───────────────────────────────────────────────────────────────────

describe("panel de la producción", () => {
  it("resume el desglose y la situación presupuestaria de un vistazo", async () => {
    // Escenario: «El panel resume la producción». Las cuatro cifras que la spec enumera, y ninguna
    // más. El presupuesto sale de la fórmula que `production-budget` transcribe.
    const session = await signUp("panel@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const chapterId = newId()
    await db
      .insert(productionChapters)
      .values({ id: chapterId, productionId: production.id, name: "Capítulo 1", index: 1 })
    await db.insert(productionScenes).values([
      { id: newId(), chapterId, name: "Escena 1", index: 1 },
      { id: newId(), chapterId, name: "Escena 2", index: 2 },
    ])
    await db.insert(productionRecordings).values([
      { id: newId(), productionId: production.id, name: "Jornada 1", status: "ongoing" },
      { id: newId(), productionId: production.id, name: "Jornada 2", status: "completed" },
    ])
    await db.insert(productionAnchors).values({
      id: newId(),
      productionId: production.id,
      name: "Vestuario",
      amount: "12000.00",
    })
    await db.insert(productionShoppings).values({
      id: newId(),
      productionId: production.id,
      name: "Telas",
      amount: "3500.50",
    })

    await newWorkflow(session, company.id, production.id)

    const panel = await json<{
      chapters: number
      scenes: number
      recordings: Record<string, number>
      workflows: Record<string, number>
      budget: { anchored: string; spent: string; difference: string }
    }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/panel`,
        undefined,
        session.cookie,
      ),
    )

    expect(panel.chapters).toBe(1)
    expect(panel.scenes).toBe(2)
    expect(panel.recordings).toEqual({ draft: 0, ongoing: 1, completed: 1 })
    expect(panel.workflows).toEqual({
      pending: 1,
      in_progress: 0,
      rescheduled: 0,
      completed: 0,
      cancelled: 0,
    })
    expect(panel.budget).toEqual({
      anchored: "12000.00",
      spent: "3500.50",
      difference: "8499.50",
    })
  })

  it("una producción recién creada devuelve ceros, no huecos", async () => {
    const session = await signUp("panel-vacio@ejemplo.mx")
    const company = await newCompany(session)
    const production = await newProduction(session, company.id)

    const panel = await json<{
      chapters: number
      budget: { anchored: string; difference: string }
    }>(
      await request(
        "GET",
        `/companies/${company.id}/productions/${production.id}/panel`,
        undefined,
        session.cookie,
      ),
    )

    expect(panel.chapters).toBe(0)
    expect(panel.budget.anchored).toBe("0.00")
    expect(panel.budget.difference).toBe("0.00")
  })
})
