/**
 * La verificación del trasvase: recuentos origen contra destino, cuadre de importes en centavos,
 * y el andamiaje del muestreo manual.
 *
 * El invariante de población es la columna vertebral: **cada fila del origen acaba migrada o en
 * cuarentena**, y el que cuadre no se afirma a ojo sino contando las tres patas. El cuadre de
 * dinero se hace en centavos enteros por las dos puntas, para que ninguna resta pase por coma
 * flotante.
 */

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { escribirVolcado } from "../accesorios/construir.ts"
import { type Ensayo, ensayo } from "../accesorios/ensayo.ts"
import { trasvasarArchivos } from "../trasvase/archivos.ts"
import { abrirContexto, type Contexto } from "../trasvase/contexto.ts"
import { trasvasarFacturacion } from "../trasvase/facturacion.ts"
import { trasvasarNucleo } from "../trasvase/nucleo.ts"
import { abrirVolcado } from "../volcado/leer.ts"
import { cuadrarImportes, informeCuarentena, muestrear, verificarRecuentos } from "./verificar.ts"

const sql = postgres(process.env.DATABASE_URL as string, { max: 2 })
const raiz = mkdtempSync(join(tmpdir(), "trasvase-verificacion-"))

let escenario: Ensayo
let contexto: Contexto

beforeAll(async () => {
  await sql`truncate table
    subscription_payments, company_subscriptions, subscription_plans,
    company_services, counterparties, global_categories, services,
    user_addresses, company_addresses, company_members, roles, companies, users, uploads
    cascade`
  await sql`drop schema if exists trasvase cascade`
  escenario = ensayo()
  const dir = join(raiz, "volcado")
  escribirVolcado(dir, escenario.colecciones)
  contexto = await abrirContexto(sql, abrirVolcado(dir))
  await trasvasarArchivos(contexto)
  await trasvasarNucleo(contexto)
  await trasvasarFacturacion(contexto)
})

afterAll(async () => {
  await sql.end()
  rmSync(raiz, { recursive: true, force: true })
})

describe("verificarRecuentos", () => {
  it("cada colección trasvasada cuadra: origen = migradas + cuarentena", async () => {
    const { colecciones: recuentos } = await verificarRecuentos(contexto)

    for (const fila of recuentos) {
      expect(fila.cuadra, `${fila.coleccion} no cuadra`).toBe(true)
    }

    const usuarios = recuentos.find((fila) => fila.coleccion === "core_user")
    expect(usuarios).toMatchObject({ origen: 6, migradas: 4, cuarentena: 2 })

    // La meta se absorbe en uploads: no tiene tabla propia, y se dice, no se esconde.
    const metas = recuentos.find((fila) => fila.coleccion === "core_meta")
    expect(metas).toMatchObject({ tabla: null, origen: 2 })
  })

  it("las tablas destino tienen exactamente las filas que la correspondencia predice", async () => {
    const { destinos } = await verificarRecuentos(contexto)

    for (const fila of destinos) {
      expect(fila.cuadra, `${fila.tabla} no cuadra`).toBe(true)
    }
    const contrapartes = destinos.find((fila) => fila.tabla === "counterparties")
    expect(contrapartes).toMatchObject({ filas: 2, esperadas: 2 })
  })
})

describe("cuadrarImportes", () => {
  it("los cobros migrados cuadran centavo a centavo por las dos puntas", async () => {
    const cuadres = await cuadrarImportes(contexto)

    const exitosos = cuadres.find((fila) => fila.concepto.includes("exitosos"))
    expect(exitosos).toMatchObject({
      origenCentavos: 119700n,
      destinoCentavos: 119700n,
      diferenciaCentavos: 0n,
      cuadra: true,
    })

    const fallidos = cuadres.find((fila) => fila.concepto.includes("fallidos"))
    expect(fallidos).toMatchObject({
      origenCentavos: 49900n,
      destinoCentavos: 49900n,
      cuadra: true,
    })
  })
})

describe("muestrear", () => {
  it("entrega pares documento viejo ↔ fila nueva para revisión a ojo, deterministas", async () => {
    const primera = await muestrear(contexto, { porColeccion: 2, semilla: 7 })
    const segunda = await muestrear(contexto, { porColeccion: 2, semilla: 7 })

    expect(primera.map((muestra) => muestra.idViejo)).toEqual(
      segunda.map((muestra) => muestra.idViejo),
    )

    const usuarios = primera.filter((muestra) => muestra.coleccion === "core_user")
    expect(usuarios.length).toBeGreaterThan(0)
    for (const muestra of usuarios) {
      expect(muestra.fila).toBeDefined()
      expect((muestra.fila as { email?: string }).email).toBe(
        String((muestra.documento as { email?: string }).email).toLowerCase(),
      )
    }
  })
})

describe("informeCuarentena", () => {
  it("lo descartado sale legible para negocio: colección, regla, cuántas y por qué", async () => {
    const informe = await informeCuarentena(contexto)

    expect(informe).toContain("core_user")
    expect(informe).toContain("correo-duplicado")
    expect(informe).toContain("users_email_unique")
    expect(informe).toMatch(/vigente-repetida/)
  })
})
