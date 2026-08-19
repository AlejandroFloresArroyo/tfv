/**
 * Lo que el motor garantiza de una producción, aunque el servicio se equivoque.
 *
 * Ver `openspec/specs/production-management/spec.md` y la migración `0022`. Rebanada 20.
 *
 * Son las dos reglas que la spec enuncia como propiedades de la entidad y no como validación de un
 * formulario. Comprobarlas sólo por la API las dejaría valiendo mientras nadie escriba por otra
 * vía, y las otras vías —siembra, trasvase, corrección a mano— son justo donde entra la fila
 * incoherente.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { closeConnection, db } from "../index.ts"
import { companies } from "./identity.ts"
import { productions } from "./productions.ts"

async function reset() {
  await db.execute(sql.raw("truncate table productions, companies cascade"))
}

/** Comprueba que una escritura choca contra una restricción concreta del motor. */
async function expectConstraint(work: Promise<unknown>, constraint: string) {
  let raised: unknown
  try {
    await work
  } catch (error) {
    raised = error
  }

  expect(raised, `se esperaba una violación de ${constraint}`).toBeDefined()
  const cause = (raised as { cause?: { constraint_name?: string } }).cause
  expect(cause?.constraint_name).toBe(constraint)
}

async function seedCompany() {
  const company = { id: newId(), name: "Estudios" }
  await db.insert(companies).values(company)
  return company
}

beforeEach(reset)
afterAll(async () => {
  await reset()
  await closeConnection()
})

describe("fechas de una producción", () => {
  it("rechaza una que termina antes de empezar", async () => {
    const company = await seedCompany()

    await expectConstraint(
      db.insert(productions).values({
        id: newId(),
        companyId: company.id,
        name: "Rodaje imposible",
        startsOn: new Date("2026-09-01T00:00:00Z"),
        endsOn: new Date("2026-08-01T00:00:00Z"),
      }),
      "productions_dates_ordered",
    )
  })

  it("admite que empiece y termine el mismo día", async () => {
    const company = await seedCompany()
    const day = new Date("2026-09-01T00:00:00Z")

    await db
      .insert(productions)
      .values({ id: newId(), companyId: company.id, name: "Spot", startsOn: day, endsOn: day })

    expect(await db.select().from(productions)).toHaveLength(1)
  })

  it("admite una producción todavía sin fechas", async () => {
    const company = await seedCompany()

    await db.insert(productions).values({ id: newId(), companyId: company.id, name: "En estudio" })

    expect(await db.select().from(productions)).toHaveLength(1)
  })
})

describe("publicación de una producción", () => {
  it("rechaza publicarla sin identificador legible", async () => {
    const company = await seedCompany()

    await expectConstraint(
      db.insert(productions).values({
        id: newId(),
        companyId: company.id,
        name: "Sin dirección",
        isPublished: true,
      }),
      "productions_published_needs_slug",
    )
  })

  it("admite una sin publicar y sin identificador legible", async () => {
    const company = await seedCompany()

    await db.insert(productions).values({ id: newId(), companyId: company.id, name: "Borrador" })

    expect(await db.select().from(productions)).toHaveLength(1)
  })
})
