/**
 * El comprobador del volcado: el «análisis previo» de la rebanada 30.
 *
 * Se prueba contra el volcado de ensayo, que trae los defectos del origen real representados y
 * citados. Lo que se afirma es que el comprobador los **encuentra y los cuantifica**: cuántas
 * filas fallarían cada restricción del esquema nuevo, qué referencias están rotas de verdad, y
 * qué filas quedaron huérfanas de las cascadas defectuosas.
 */

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { escribirVolcado } from "../accesorios/construir.ts"
import { type Ensayo, ensayo } from "../accesorios/ensayo.ts"
import { abrirVolcado } from "../volcado/leer.ts"
import { type Analisis, comprobarVolcado, informeAnalisis } from "./comprobar.ts"

const raiz = mkdtempSync(join(tmpdir(), "trasvase-analisis-"))
let escenario: Ensayo
let analisis: Analisis

beforeAll(async () => {
  escenario = ensayo()
  const dir = join(raiz, "volcado")
  escribirVolcado(dir, escenario.colecciones)
  analisis = await comprobarVolcado(abrirVolcado(dir))
})

afterAll(() => {
  rmSync(raiz, { recursive: true, force: true })
})

function violacion(coleccion: string, regla: string) {
  return analisis.violaciones.find(
    (entrada) => entrada.coleccion === coleccion && entrada.regla === regla,
  )
}

function rota(coleccion: string, campo: string) {
  return analisis.referenciasRotas.find(
    (entrada) => entrada.coleccion === coleccion && entrada.campo === campo,
  )
}

describe("comprobarVolcado", () => {
  it("inventaría las colecciones con sus recuentos", () => {
    const usuarios = analisis.colecciones.find((entrada) => entrada.nombre === "core_user")
    expect(usuarios).toMatchObject({ filas: 6, conocida: true })
    expect(analisis.ausentes).toEqual([])
  })

  it("señala las colecciones del alcance que faltan en el volcado", async () => {
    const dir = join(raiz, "incompleto")
    escribirVolcado(dir, { core_user: [] })

    const parcial = await comprobarVolcado(abrirVolcado(dir))

    expect(parcial.ausentes).toContain("core_companies")
    expect(parcial.ausentes).not.toContain("core_user")
  })

  it("encuentra las referencias rotas reales, resolviendo contra los _id del volcado", () => {
    expect(rota("core_companies", "ownerId")).toMatchObject({
      destino: "core_user",
      filas: 1,
      ejemplos: [escenario.ids.sinDueño],
    })
    expect(rota("core_companies_user", "userId")).toMatchObject({
      filas: 1,
      ejemplos: [escenario.ids.membresiaRota],
    })
    expect(rota("core_companies_service", "serviceId")).toMatchObject({ filas: 1 })
    expect(rota("core_categories", "parentId")).toMatchObject({
      filas: 1,
      ejemplos: [escenario.ids.catPadreRoto],
    })
    expect(rota("core_upload", "metaId")).toMatchObject({
      filas: 1,
      ejemplos: [escenario.ids.subidaSinMeta],
    })
    // `DEFECTS.md` M-08: los cobros de la suscripción que el pago fallido eliminó.
    expect(rota("core_companies_subscriptions_payment", "companySubscriptionId")).toMatchObject({
      filas: 1,
      ejemplos: [escenario.ids.pagoColgado],
    })
  })

  it("separa las filas huérfanas: su dueño no existe, no les falta un adorno", () => {
    const huerfanosPorColeccion = Object.fromEntries(
      analisis.huerfanos.map((entrada) => [entrada.coleccion, entrada]),
    )
    expect(huerfanosPorColeccion.core_role).toMatchObject({
      filas: 1,
      ejemplos: [escenario.ids.rolHuerfano],
    })
    expect(huerfanosPorColeccion.core_addresses).toMatchObject({
      filas: 1,
      ejemplos: [escenario.ids.dirHuerfana],
    })
    expect(huerfanosPorColeccion.core_companies_user).toMatchObject({
      filas: 1,
      ejemplos: [escenario.ids.membresiaRota],
    })
  })

  it("cuantifica las filas que fallarían cada restricción única del esquema nuevo", () => {
    expect(violacion("core_user", "correo-duplicado")).toMatchObject({
      restriccion: "users_email_unique",
      filas: 1,
      ejemplos: [escenario.ids.duplicadoNuevo],
    })
    expect(violacion("core_companies_user", "membresia-repetida")).toMatchObject({
      restriccion: "company_members_unique",
      filas: 1,
      ejemplos: [escenario.ids.membresiaRepetida],
    })
    expect(violacion("core_client", "pareja-repetida")).toMatchObject({
      restriccion: "counterparties_user_pair_unique",
      filas: 1,
      ejemplos: [escenario.ids.clienteRepetido],
    })
    expect(violacion("core_categories", "slug-duplicado")).toMatchObject({
      restriccion: "global_categories_slug_unique",
      filas: 1,
      ejemplos: [escenario.ids.catSlugRepetido],
    })
    expect(violacion("core_companies_subscription", "vigente-repetida")).toMatchObject({
      restriccion: "company_subscriptions_company_unique",
      filas: 1,
      ejemplos: [escenario.ids.suscripcionDoble],
    })
  })

  it("cuantifica lo que fallaría una columna obligatoria o una regla de forma", () => {
    expect(violacion("core_user", "correo-ausente")).toMatchObject({
      restriccion: "users.email not null",
      filas: 1,
      ejemplos: [escenario.ids.sinCorreo],
    })
    expect(violacion("core_addresses", "primaria-repetida")).toMatchObject({
      restriccion: "user_addresses_primary_unique",
      filas: 1,
      ejemplos: [escenario.ids.dirBenitoSegunda],
    })
  })

  it("no acusa nada en las colecciones sanas", () => {
    expect(analisis.violaciones.filter((entrada) => entrada.coleccion === "core_provider")).toEqual(
      [],
    )
    expect(rota("core_role", "companyId")).toMatchObject({ filas: 1 })
    expect(rota("core_service", "imageId")).toBeUndefined()
  })

  it("el informe es legible: nombra colecciones, restricciones y recuentos", () => {
    const informe = informeAnalisis(analisis)

    expect(informe).toContain("core_user")
    expect(informe).toContain("users_email_unique")
    expect(informe).toContain("Referencias rotas")
    expect(informe).toContain("Huérfanas")
    // Los recuentos aparecen medidos, no como prosa.
    expect(informe).toMatch(/core_user\s*\|\s*6/)
  })
})
