/**
 * Comprobaciones del esquema contra una base real.
 *
 * Verifican las propiedades que **el motor** debe garantizar por sí mismo, no la aplicación: si
 * dependieran del código de la aplicación no probarían nada, porque justo lo que se quiere saber
 * es que la base las sostiene aunque la aplicación falle.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { and, eq, isNull, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { closeConnection, db } from "../index.ts"
import { companies, companyMembers, roles, users } from "./identity.ts"

async function reset() {
  await db.execute(
    sql`truncate table ${companyMembers}, ${roles}, ${companies}, ${users} restart identity cascade`,
  )
}

function makeUser(email: string, username: string) {
  return { id: newId(), email, username }
}

/**
 * Comprueba que una escritura choca contra una restricción de unicidad concreta.
 *
 * Se inspecciona la causa y no el mensaje: Drizzle envuelve el error del controlador y su texto no
 * nombra la restricción, así que afirmar sobre el mensaje daría un falso positivo ante cualquier
 * otro fallo de la consulta.
 */
async function expectUniqueViolation(work: Promise<unknown>, constraint: string) {
  let raised: unknown
  try {
    await work
  } catch (error) {
    raised = error
  }

  expect(raised, "se esperaba una violación de unicidad").toBeDefined()

  const cause = (raised as { cause?: { code?: string; constraint_name?: string } }).cause
  expect(cause?.code, "código de error de PostgreSQL").toBe("23505")
  expect(cause?.constraint_name).toBe(constraint)
}

beforeEach(reset)
afterAll(async () => {
  await reset()
  await closeConnection()
})

describe("borrado lógico de usuarios", () => {
  it("rechaza un correo duplicado mientras la cuenta está vigente", async () => {
    await db.insert(users).values(makeUser("ana@ejemplo.mx", "ana"))

    await expectUniqueViolation(
      db.insert(users).values(makeUser("ana@ejemplo.mx", "ana_2")),
      "users_email_unique",
    )
  })

  it("libera el correo tras la baja lógica", async () => {
    // Escenario de `user-accounts`: «El correo se libera».
    const original = makeUser("ana@ejemplo.mx", "ana")
    await db.insert(users).values(original)
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, original.id))

    await db.insert(users).values(makeUser("ana@ejemplo.mx", "ana_3"))

    const vigentes = await db
      .select()
      .from(users)
      .where(and(eq(users.email, "ana@ejemplo.mx"), isNull(users.deletedAt)))

    expect(vigentes).toHaveLength(1)
    expect(vigentes[0]?.username).toBe("ana_3")
  })

  it("conserva la cuenta dada de baja como historial", async () => {
    // Escenario: «El historial sobrevive a la baja».
    const original = makeUser("ana@ejemplo.mx", "ana")
    await db.insert(users).values(original)
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, original.id))

    const todas = await db.select().from(users)
    expect(todas).toHaveLength(1)
    expect(todas[0]?.deletedAt).toBeInstanceOf(Date)
  })
})

describe("membresías", () => {
  it("no admite dos membresías del mismo usuario en la misma empresa", async () => {
    const user = makeUser("ana@ejemplo.mx", "ana")
    const company = { id: newId(), name: "Empresa A" }
    await db.insert(users).values(user)
    await db.insert(companies).values(company)

    await db.insert(companyMembers).values({ id: newId(), companyId: company.id, userId: user.id })

    await expectUniqueViolation(
      db.insert(companyMembers).values({ id: newId(), companyId: company.id, userId: user.id }),
      "company_members_unique",
    )
  })

  it("propaga la baja de la empresa a sus membresías y roles", async () => {
    const user = makeUser("ana@ejemplo.mx", "ana")
    const company = { id: newId(), name: "Empresa A" }
    const role = { id: newId(), companyId: company.id, name: "Operación" }

    await db.insert(users).values(user)
    await db.insert(companies).values(company)
    await db.insert(roles).values(role)
    await db
      .insert(companyMembers)
      .values({ id: newId(), companyId: company.id, userId: user.id, roleId: role.id })

    await db.delete(companies).where(eq(companies.id, company.id))

    expect(await db.select().from(companyMembers)).toHaveLength(0)
    expect(await db.select().from(roles)).toHaveLength(0)
    // La cuenta del miembro sobrevive: es de otra empresa, no de ésta.
    expect(await db.select().from(users)).toHaveLength(1)
  })

  it("deja al miembro sin rol al eliminar el rol, conservando la pertenencia", async () => {
    // Escenario de `access-control`: «El miembro conserva la pertenencia y pierde la escritura».
    const user = makeUser("ana@ejemplo.mx", "ana")
    const company = { id: newId(), name: "Empresa A" }
    const role = { id: newId(), companyId: company.id, name: "Operación" }

    await db.insert(users).values(user)
    await db.insert(companies).values(company)
    await db.insert(roles).values(role)
    await db
      .insert(companyMembers)
      .values({ id: newId(), companyId: company.id, userId: user.id, roleId: role.id })

    await db.delete(roles).where(eq(roles.id, role.id))

    const [membership] = await db.select().from(companyMembers)
    expect(membership).toBeDefined()
    expect(membership?.roleId).toBeNull()
  })
})

describe("marcas de tiempo", () => {
  it("las asigna al crear y actualiza la de modificación al escribir", async () => {
    const user = makeUser("ana@ejemplo.mx", "ana")
    await db.insert(users).values(user)

    const [creado] = await db.select().from(users).where(eq(users.id, user.id))
    expect(creado?.createdAt).toBeInstanceOf(Date)
    expect(creado?.updatedAt).toBeInstanceOf(Date)
    expect(creado?.deletedAt).toBeNull()

    await new Promise((resolve) => setTimeout(resolve, 5))
    await db.update(users).set({ name: "Ana" }).where(eq(users.id, user.id))

    const [actualizado] = await db.select().from(users).where(eq(users.id, user.id))
    expect(actualizado?.updatedAt.getTime()).toBeGreaterThan(creado?.updatedAt.getTime() ?? 0)
    expect(actualizado?.createdAt.getTime()).toBe(creado?.createdAt.getTime())
  })
})
