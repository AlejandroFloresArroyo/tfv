/**
 * El registro del trasvase: correspondencia de identificadores, cuarentena e incidencias.
 *
 * Viven en un esquema Postgres propio, `trasvase`, que estas rutinas crean y del que son dueñas.
 * El esquema de `@tfv/db` no se toca. Lo que se afirma aquí es lo que las rutinas necesitan de
 * verdad: que la correspondencia es **estable entre corridas** —el mismo documento viejo recibe el
 * mismo identificador nuevo siempre—, y que la cuarentena de una colección se reconstruye en cada
 * corrida en lugar de acumular duplicados.
 */

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { prepararEsquemaTrasvase, Registro } from "./registro.ts"

const sql = postgres(process.env.DATABASE_URL as string, { max: 2 })
/** `guardar` habla drizzle: en producción corre dentro de la transacción de la rutina. */
const db = drizzle(sql)

afterAll(async () => {
  await sql.end()
})

beforeEach(async () => {
  await sql`drop schema if exists trasvase cascade`
})

describe("prepararEsquemaTrasvase", () => {
  it("crea el esquema y sus tablas, y es idempotente", async () => {
    await prepararEsquemaTrasvase(sql)
    await prepararEsquemaTrasvase(sql)

    const tablas = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'trasvase'
    `
    const nombres = tablas.map((fila) => fila.table_name).sort()
    expect(nombres).toEqual(["correspondencia", "cuarentena", "incidencias"])
  })
})

describe("Registro", () => {
  it("acuña un identificador nuevo por documento y lo conserva entre corridas", async () => {
    await prepararEsquemaTrasvase(sql)

    const primero = await Registro.abrir(sql)
    const idAna = primero.idPara("core_user", "64a000000000000000000001")
    const idBenito = primero.idPara("core_user", "64a000000000000000000002")
    expect(idAna).not.toBe(idBenito)
    // Dentro de la corrida también es estable.
    expect(primero.idPara("core_user", "64a000000000000000000001")).toBe(idAna)
    await primero.guardar(db)

    const segundo = await Registro.abrir(sql)
    expect(segundo.idPara("core_user", "64a000000000000000000001")).toBe(idAna)
    expect(segundo.idExistente("core_user", "64a000000000000000000099")).toBeUndefined()
  })

  it("la cuarentena de una colección se limpia y reconstruye por corrida, sin acumularse", async () => {
    await prepararEsquemaTrasvase(sql)

    const primero = await Registro.abrir(sql)
    primero.limpiarCuarentena(["core_user"])
    primero.cuarentena("core_user", "64a000000000000000000001", "correo-ausente", "Sin correo", {
      username: "sin_correo",
    })
    await primero.guardar(db)

    // La segunda corrida vuelve a encontrar lo mismo: no debe duplicar la fila.
    const segundo = await Registro.abrir(sql)
    expect(segundo.enCuarentena("core_user", "64a000000000000000000001")).toBe(true)
    segundo.limpiarCuarentena(["core_user"])
    expect(segundo.enCuarentena("core_user", "64a000000000000000000001")).toBe(false)
    segundo.cuarentena("core_user", "64a000000000000000000001", "correo-ausente", "Sin correo", {
      username: "sin_correo",
    })
    await segundo.guardar(db)

    const filas = await sql<{ total: string }[]>`
      select count(*)::text as total from trasvase.cuarentena
    `
    expect(filas[0]?.total).toBe("1")
  })

  it("las incidencias registran la degradación sin poner la fila en cuarentena", async () => {
    await prepararEsquemaTrasvase(sql)

    const registro = await Registro.abrir(sql)
    registro.limpiarCuarentena(["core_user"])
    registro.incidencia(
      "core_user",
      "64a000000000000000000001",
      "imageId",
      "El avatar apuntaba a una subida inexistente; queda sin avatar",
    )
    await registro.guardar(db)

    const filas = await sql<{ campo: string; detalle: string }[]>`
      select campo, detalle from trasvase.incidencias
    `
    expect(filas).toHaveLength(1)
    expect(filas[0]?.campo).toBe("imageId")
    expect(registro.enCuarentena("core_user", "64a000000000000000000001")).toBe(false)
  })
})
