/**
 * Propagación de identidad y aislamiento en el motor.
 *
 * Ver `openspec/specs/access-control/spec.md`.
 *
 * **La prueba que importa es la del modo de fallo.** No basta con comprobar que la aplicación
 * filtra: hay que comprobar que **con el filtro de la aplicación desactivado** el motor sigue sin
 * devolver filas ajenas. Si esta prueba desaparece, el aislamiento se queda en una sola capa sin
 * que nadie lo note.
 *
 * Requiere la pila local de Supabase: `npx supabase start`.
 */

import { newId } from "@tfv/contracts"
import { sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { closeConnection, db, withRequester, withSystem } from "./index.ts"
import { companies, companyMembers, users } from "./schema/identity.ts"
import { warehouses } from "./schema/warehouses.ts"

/** Una tabla de prueba con política, para no depender de que el dominio ya las tenga. */
const PROBE = "prueba_aislamiento"

async function reset() {
  await db.execute(
    sql`truncate table ${warehouses}, ${companyMembers}, ${companies}, ${users} cascade`,
  )
  await db.execute(sql.raw(`drop table if exists ${PROBE}`))
  await db.execute(
    sql.raw(`
      create table ${PROBE} (
        id uuid primary key,
        company_id uuid not null references companies(id) on delete cascade,
        label text not null
      );
      alter table ${PROBE} enable row level security;
      create policy aislamiento on ${PROBE}
        using (company_id = any(app.current_companies()));
      grant select, insert, update, delete on ${PROBE} to authenticated;
    `),
  )
}

/** Monta dos empresas con un miembro cada una y una fila de prueba por empresa. */
async function seedTwoTenants() {
  const alice = { id: newId(), email: "ana@a.mx", username: "ana" }
  const bob = { id: newId(), email: "beto@b.mx", username: "beto" }
  const companyA = { id: newId(), name: "Empresa A" }
  const companyB = { id: newId(), name: "Empresa B" }

  await db.insert(users).values([alice, bob])
  await db.insert(companies).values([companyA, companyB])
  await db.insert(companyMembers).values([
    { id: newId(), companyId: companyA.id, userId: alice.id },
    { id: newId(), companyId: companyB.id, userId: bob.id },
  ])

  await db.execute(
    sql.raw(`
      insert into ${PROBE} (id, company_id, label) values
        ('${newId()}', '${companyA.id}', 'de A'),
        ('${newId()}', '${companyB.id}', 'de B')
    `),
  )

  await openSession(alice.id)
  await openSession(bob.id)

  return { alice, bob, companyA, companyB }
}

/**
 * Abre una sesión y devuelve el solicitante.
 *
 * El motor comprueba que la sesión sigue viva en cada transacción, así que un solicitante sin ella
 * resuelve identidad nula. Ver `drizzle/0006_session_revocation.sql`.
 */
async function openSession(userId: string) {
  const sessionId = newId()
  await db.execute(
    sql.raw(`insert into sessions
             (id, user_id, chain_id, access_token_hash, refresh_token_hash,
              access_expires_at, expires_at)
             values ('${sessionId}', '${userId}', '${newId()}', '${sessionId}', '${sessionId}',
                     now() + interval '1 hour', now() + interval '1 day')`),
  )
  sessions[userId] = sessionId
  return sessionId
}

const sessions: Record<string, string> = {}

/** Quién opera, con su sesión viva. */
function as(userId: string) {
  return { userId, sessionId: sessions[userId] as string }
}

/** Cuenta **sin filtro de aplicación**: lo que devuelva sale sólo de las políticas. */
async function countWithoutAppFilter(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  const rows = await tx.execute(sql.raw(`select count(*)::int as total from ${PROBE}`))
  return Number((rows as unknown as { total: number }[])[0]?.total ?? -1)
}

beforeEach(reset)
afterAll(async () => {
  await db.execute(sql.raw(`drop table if exists ${PROBE}`))
  await closeConnection()
})

describe("aislamiento en el motor", () => {
  it("un miembro sólo ve las filas de su empresa", async () => {
    const { alice } = await seedTwoTenants()

    const visible = await withRequester(as(alice.id), (tx) => countWithoutAppFilter(tx))

    // Sin ninguna cláusula de la aplicación: la política es lo único que filtra.
    expect(visible).toBe(1)
  })

  it("cada miembro ve la suya, no la del otro", async () => {
    const { alice, bob } = await seedTwoTenants()

    const forAlice = await withRequester(as(alice.id), (tx) =>
      tx.execute(sql.raw(`select label from ${PROBE}`)),
    )
    const forBob = await withRequester(as(bob.id), (tx) =>
      tx.execute(sql.raw(`select label from ${PROBE}`)),
    )

    expect((forAlice as unknown as { label: string }[]).map((r) => r.label)).toEqual(["de A"])
    expect((forBob as unknown as { label: string }[]).map((r) => r.label)).toEqual(["de B"])
  })

  it("una membresía desactivada deja de ver", async () => {
    const { alice } = await seedTwoTenants()
    await db.update(companyMembers).set({ isActive: false })

    const visible = await withRequester(as(alice.id), (tx) => countWithoutAppFilter(tx))

    expect(visible).toBe(0)
  })

  it("un usuario sin membresías no ve nada", async () => {
    await seedTwoTenants()
    const stranger = { id: newId(), email: "ajeno@c.mx", username: "ajeno" }
    await db.insert(users).values(stranger)
    // Con sesión viva: lo que le falta es la membresía, y eso es lo que esta prueba mide.
    await openSession(stranger.id)

    const visible = await withRequester(as(stranger.id), (tx) => countWithoutAppFilter(tx))

    expect(visible).toBe(0)
  })

  it("no puede escribir en una empresa ajena", async () => {
    const { alice, companyB } = await seedTwoTenants()

    await expect(
      withRequester(as(alice.id), (tx) =>
        tx.execute(
          sql.raw(
            `insert into ${PROBE} (id, company_id, label) values ('${newId()}','${companyB.id}','intruso')`,
          ),
        ),
      ),
    ).rejects.toThrow()
  })
})

describe("modo de fallo", () => {
  it("sin identidad propagada no se devuelve ninguna fila", async () => {
    // **La prueba más importante del archivo.**
    //
    // Simula el olvido: rol `authenticated` sin claims. Si el aislamiento dependiera sólo de la
    // aplicación, aquí saldrían las dos filas.
    await seedTwoTenants()

    const visible = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role authenticated`)
      return countWithoutAppFilter(tx)
    })

    expect(visible).toBe(0)
  })

  it("los claims no sobreviven a la transacción", async () => {
    // Sin esto, la siguiente petición que reutilizara la conexión heredaría la identidad anterior.
    const { alice } = await seedTwoTenants()

    await withRequester(as(alice.id), (tx) => countWithoutAppFilter(tx))

    const rows = await db.execute(
      sql`select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') as claims`,
    )

    expect((rows as unknown as { claims: string }[])[0]?.claims).toBe("")
  })
})

describe("contexto de sistema", () => {
  it("alcanza las empresas que declara", async () => {
    const { companyA, companyB } = await seedTwoTenants()

    const visible = await withSystem("prueba", [companyA.id, companyB.id], (tx) =>
      countWithoutAppFilter(tx),
    )

    expect(visible).toBe(2)
  })

  it("no alcanza las que no declara", async () => {
    // El alcance se **hace cumplir**, no es un comentario: escribir fuera de él falla.
    const { companyA } = await seedTwoTenants()

    const visible = await withSystem("prueba", [companyA.id], (tx) => countWithoutAppFilter(tx))

    expect(visible).toBe(1)
  })

  it("con alcance vacío no ve nada", async () => {
    await seedTwoTenants()

    const visible = await withSystem("prueba", [], (tx) => countWithoutAppFilter(tx))

    expect(visible).toBe(0)
  })
})
