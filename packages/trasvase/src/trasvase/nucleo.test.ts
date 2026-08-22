/**
 * La rutina del núcleo: cuentas, empresas, membresías, roles, direcciones, contrapartes y
 * taxonomías, contra el volcado de ensayo con sus defectos.
 *
 * Lo que se afirma es la política, no la mecánica: quién gana un correo duplicado, qué pasa con la
 * membresía repetida que Mongo dejó entrar, cómo se conserva la empresa cuyo dueño se borró, y que
 * cada fila del origen acaba migrada o en cuarentena con su motivo. La idempotencia se prueba
 * corriendo dos veces y afirmando que la segunda no duplica nada.
 */

import {
  companies,
  companyMembers,
  companyServices,
  counterparties,
  globalCategories,
  roles,
  services,
  userAddresses,
  users,
} from "@tfv/db/schema"
import { eq } from "drizzle-orm"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import postgres from "postgres"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { escribirVolcado } from "../accesorios/construir.ts"
import { type Ensayo, ensayo } from "../accesorios/ensayo.ts"
import { abrirVolcado } from "../volcado/leer.ts"
import { trasvasarArchivos } from "./archivos.ts"
import { abrirContexto, type Contexto } from "./contexto.ts"
import { trasvasarNucleo } from "./nucleo.ts"

const sql = postgres(process.env.DATABASE_URL as string, { max: 2 })
const raiz = mkdtempSync(join(tmpdir(), "trasvase-nucleo-"))

let escenario: Ensayo
let contexto: Contexto

afterAll(async () => {
  await sql.end()
  rmSync(raiz, { recursive: true, force: true })
})

beforeEach(async () => {
  await sql`truncate table
    company_services, counterparties, global_categories, services,
    user_addresses, company_addresses, company_members, roles, companies, users, uploads
    cascade`
  await sql`drop schema if exists trasvase cascade`
  escenario = ensayo()
  const dir = join(raiz, `caso-${Math.random().toString(36).slice(2)}`)
  escribirVolcado(dir, escenario.colecciones)
  contexto = await abrirContexto(sql, abrirVolcado(dir))
  await trasvasarArchivos(contexto)
  await trasvasarNucleo(contexto)
})

function idNuevo(coleccion: string, idViejo: string): string {
  const id = contexto.registro.idExistente(coleccion, idViejo)
  if (!id) throw new Error(`Sin correspondencia para ${coleccion}/${idViejo}`)
  return id
}

async function cuarentenaDe(coleccion: string) {
  return await sql<{ id_viejo: string; regla: string }[]>`
    select id_viejo, regla from trasvase.cuarentena where coleccion = ${coleccion}
  `
}

describe("trasvasarNucleo", () => {
  it("migra la cuenta entera: correo, verificación decidida, bcrypt tal cual y avatar", async () => {
    const [ana] = await contexto.db
      .select()
      .from(users)
      .where(eq(users.id, idNuevo("core_user", escenario.ids.ana)))

    expect(ana).toMatchObject({
      email: "ana@ejemplo.mx",
      username: "ana_torres",
      name: "Ana",
      lastname: "Torres",
      dialCode: "+52",
      isActive: true,
      isPlatformAdmin: false,
    })
    // Decisión 2026-08-19: las verificadas sin verificación real (S-15) migran verificadas.
    expect(ana?.emailVerifiedAt).toEqual(ana?.createdAt)
    // Supuesto de la decisión de credenciales: el hash bcrypt viaja tal cual.
    expect(ana?.passwordHash).toMatch(/^\$2a\$10\$/)
    expect(ana?.avatarUploadId).toBe(idNuevo("core_upload", escenario.ids.subidaAvatar))
    expect(ana?.lastLoginAt).toEqual(new Date("2026-08-01T09:00:00.000Z"))
  })

  it("un correo duplicado lo gana quien entró más recientemente; el resto, a cuarentena", async () => {
    expect(contexto.registro.idExistente("core_user", escenario.ids.duplicadoNuevo)).toBeDefined()

    const filas = await cuarentenaDe("core_user")
    const reglas = Object.fromEntries(filas.map((fila) => [fila.id_viejo, fila.regla]))
    expect(reglas[escenario.ids.duplicadoViejo]).toBe("correo-duplicado")
    expect(reglas[escenario.ids.sinCorreo]).toBe("correo-ausente")

    const total = await contexto.db.select().from(users)
    expect(total).toHaveLength(4) // ana, benito, carla y el ganador del duplicado
  })

  it("la empresa conserva su identidad vieja y su comisión; sin dueño migra con incidencia", async () => {
    const [filmadora] = await contexto.db
      .select()
      .from(companies)
      .where(eq(companies.id, idNuevo("core_companies", escenario.ids.filmadora)))

    expect(filmadora).toMatchObject({
      name: "Filmadora del Valle",
      legacyId: escenario.ids.filmadora,
      commissionRate: "12.5000",
      priority: "1.5000",
    })

    // La empresa cuyo dueño se borró migra igual, y el hueco queda escrito.
    expect(contexto.registro.idExistente("core_companies", escenario.ids.sinDueño)).toBeDefined()
    const incidencias = await sql<{ campo: string }[]>`
      select campo from trasvase.incidencias
      where coleccion = 'core_companies' and id_viejo = ${escenario.ids.sinDueño}
    `
    expect(incidencias.map((fila) => fila.campo)).toContain("ownerId")
  })

  it("membresías: la repetida y la rota van a cuarentena; la dueña queda como dueña", async () => {
    const migradas = await contexto.db
      .select()
      .from(companyMembers)
      .where(eq(companyMembers.companyId, idNuevo("core_companies", escenario.ids.filmadora)))

    expect(migradas).toHaveLength(2) // ana y benito; ni la repetida ni la rota

    const deAna = migradas.find(
      (fila) => fila.userId === idNuevo("core_user", escenario.ids.ana),
    )
    expect(deAna?.isOwner).toBe(true)

    const deBenito = migradas.find(
      (fila) => fila.userId === idNuevo("core_user", escenario.ids.benito),
    )
    expect(deBenito?.roleId).toBe(idNuevo("core_role", escenario.ids.rolVentas))

    const filas = await cuarentenaDe("core_companies_user")
    const reglas = Object.fromEntries(filas.map((fila) => [fila.id_viejo, fila.regla]))
    expect(reglas[escenario.ids.membresiaRepetida]).toBe("membresia-repetida")
    expect(reglas[escenario.ids.membresiaRota]).toBe("usuario-inexistente")
  })

  it("el rol convierte su objeto de permisos en claves concedidas; el huérfano, a cuarentena", async () => {
    const [rolVentas] = await contexto.db
      .select()
      .from(roles)
      .where(eq(roles.id, idNuevo("core_role", escenario.ids.rolVentas)))

    expect(rolVentas?.permissions?.slice().sort()).toEqual([
      "warehouses.quotes.read",
      "warehouses.quotes.write",
    ])

    const filas = await cuarentenaDe("core_role")
    expect(filas).toEqual([
      { id_viejo: escenario.ids.rolHuerfano, regla: "empresa-inexistente" },
    ])
  })

  it("direcciones: queda exactamente una primaria por libreta, y la huérfana en cuarentena", async () => {
    const deBenito = await contexto.db
      .select()
      .from(userAddresses)
      .where(eq(userAddresses.userId, idNuevo("core_user", escenario.ids.benito)))

    expect(deBenito).toHaveLength(2)
    expect(deBenito.filter((fila) => fila.isPrimary)).toHaveLength(1)

    const filas = await cuarentenaDe("core_addresses")
    expect(filas).toEqual([{ id_viejo: escenario.ids.dirHuerfana, regla: "usuario-inexistente" }])
  })

  it("contrapartes: la pareja repetida cae; el proveedor externo vive en su copia", async () => {
    const todas = await contexto.db.select().from(counterparties)
    expect(todas).toHaveLength(2)

    const cliente = todas.find((fila) => fila.role === "client")
    expect(cliente?.userId).toBe(idNuevo("core_user", escenario.ids.carla))
    expect(cliente?.snapshot.email).toBe("carla@ejemplo.mx")

    const proveedor = todas.find((fila) => fila.role === "provider")
    expect(proveedor?.userId).toBeNull()
    expect(proveedor?.snapshot.companyName).toBe("Luz y Sonido SA")
    expect(proveedor?.snapshot.address).toContain("Insurgentes")

    const filas = await cuarentenaDe("core_client")
    expect(filas).toEqual([{ id_viejo: escenario.ids.clienteRepetido, regla: "pareja-repetida" }])
  })

  it("taxonomía: el árbol se conserva, el slug repetido se suelta y el padre roto queda raíz", async () => {
    const todas = await contexto.db.select().from(globalCategories)
    expect(todas).toHaveLength(4)

    const cine = todas.find((fila) => fila.id === idNuevo("core_categories", escenario.ids.catCine))
    expect(cine?.parentId).toBe(idNuevo("core_categories", escenario.ids.catSectores))
    expect(cine?.slug).toBe("cine")
    expect(cine?.serviceId).toBe(idNuevo("core_service", escenario.ids.servicioAlmacenes))

    const repetida = todas.find(
      (fila) => fila.id === idNuevo("core_categories", escenario.ids.catSlugRepetido),
    )
    expect(repetida?.slug).toBeNull()

    const descolgada = todas.find(
      (fila) => fila.id === idNuevo("core_categories", escenario.ids.catPadreRoto),
    )
    expect(descolgada?.parentId).toBeNull()
  })

  it("servicios y habilitaciones: la habilitación rota de L-06 queda en cuarentena", async () => {
    const [almacenes] = await contexto.db
      .select()
      .from(services)
      .where(eq(services.id, idNuevo("core_service", escenario.ids.servicioAlmacenes)))
    expect(almacenes?.keycode).toBe("warehouses")

    const habilitaciones = await contexto.db.select().from(companyServices)
    expect(habilitaciones).toHaveLength(1)

    const filas = await cuarentenaDe("core_companies_service")
    expect(filas).toEqual([
      { id_viejo: escenario.ids.habilitacionRota, regla: "servicio-inexistente" },
    ])
  })

  it("cada colección del núcleo cuadra: origen = migradas + cuarentena", async () => {
    const casos: Array<[string, string]> = [
      ["core_user", "users"],
      ["core_companies", "companies"],
      ["core_companies_user", "company_members"],
      ["core_role", "roles"],
      ["core_addresses", "user_addresses"],
      ["core_companies_address", "company_addresses"],
      ["core_categories", "global_categories"],
      ["core_service", "services"],
      ["core_companies_service", "company_services"],
    ]
    for (const [coleccion, tabla] of casos) {
      const origen = escenario.colecciones[coleccion]?.length ?? 0
      const [destino] = await sql.unsafe<{ total: string }[]>(
        `select count(*)::text as total from ${tabla}`,
      )
      const cuarentena = await cuarentenaDe(coleccion)
      expect(
        Number(destino?.total) + cuarentena.length,
        `${coleccion} no cuadra`,
      ).toBe(origen)
    }
    // Las contrapartes suman de dos colecciones hacia una tabla.
    const contrapartes = await contexto.db.select().from(counterparties)
    const enCuarentena =
      (await cuarentenaDe("core_client")).length + (await cuarentenaDe("core_provider")).length
    expect(contrapartes.length + enCuarentena).toBe(
      (escenario.colecciones.core_client?.length ?? 0) +
        (escenario.colecciones.core_provider?.length ?? 0),
    )
  })

  it("correr dos veces no duplica nada: mismos recuentos y mismos identificadores", async () => {
    const antes = {
      usuarios: (await contexto.db.select().from(users)).length,
      membresias: (await contexto.db.select().from(companyMembers)).length,
      contrapartes: (await contexto.db.select().from(counterparties)).length,
      categorias: (await contexto.db.select().from(globalCategories)).length,
      idAna: idNuevo("core_user", escenario.ids.ana),
    }

    const segundo = await abrirContexto(sql, contexto.volcado)
    await trasvasarArchivos(segundo)
    await trasvasarNucleo(segundo)

    expect((await contexto.db.select().from(users)).length).toBe(antes.usuarios)
    expect((await contexto.db.select().from(companyMembers)).length).toBe(antes.membresias)
    expect((await contexto.db.select().from(counterparties)).length).toBe(antes.contrapartes)
    expect((await contexto.db.select().from(globalCategories)).length).toBe(antes.categorias)
    expect(segundo.registro.idExistente("core_user", escenario.ids.ana)).toBe(antes.idAna)

    const [cuarentena] = await sql<{ total: string }[]>`
      select count(*)::text as total from trasvase.cuarentena where coleccion = 'core_user'
    `
    expect(cuarentena?.total).toBe("2")
  })
})
