/**
 * Accesorios compartidos.
 *
 * `as(papel)` es lo que hace legibles las pruebas: en lugar de repetir el correo y la contraseña,
 * se dice quién actúa. Y el navegador arranca con la sesión ya abierta, porque la preparación la
 * guardó.
 */

import { readFileSync } from "node:fs"
import { type BrowserContext, test as base, expect } from "@playwright/test"
import { FIXTURE_PATH, type Fixture, PASSWORD, ROLES, type Role, stateFor } from "./roles.ts"

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture

export const test = base.extend<{
  /**
   * Abre un contexto con la sesión de un papel ya iniciada, **compartida** entre pruebas.
   *
   * Barato y suficiente para leer y escribir. Lo que **no** vale es para una prueba que cierre
   * sesión: en este sistema las sesiones son revocables de verdad, así que cerrar la compartida
   * expulsa a todas las pruebas que corran en paralelo. Para eso está `fresh`.
   */
  as: (role: Role) => Promise<BrowserContext>
  /**
   * Abre una sesión **nueva y propia** para el papel.
   *
   * Cuesta un inicio de sesión —que es lento a propósito, porque de eso se trata—, y a cambio la
   * prueba puede revocarla sin afectar a nadie. Sólo para las que cierran sesión.
   */
  fresh: (role: Role) => Promise<BrowserContext>
  /** Las empresas de la siembra, por nombre. Sus identificadores los genera la siembra. */
  companies: Record<string, string>
}>({
  as: async ({ browser }, use) => {
    const opened: BrowserContext[] = []

    await use(async (role) => {
      const context = await browser.newContext({ storageState: stateFor(role) })
      opened.push(context)
      return context
    })

    for (const context of opened) await context.close()
  },

  fresh: async ({ browser, baseURL }, use) => {
    const opened: BrowserContext[] = []

    await use(async (role) => {
      const context = await browser.newContext()
      opened.push(context)

      const response = await context.request.post(`${baseURL}/api/auth/login`, {
        data: { email: ROLES[role], password: PASSWORD },
      })
      expect(response.ok(), `no se pudo abrir sesión como ${ROLES[role]}`).toBe(true)

      return context
    })

    for (const context of opened) await context.close()
  },

  // biome-ignore lint/correctness/noEmptyPattern: es la forma que `test.extend` exige para declarar un accesorio sin dependencias.
  companies: async ({}, use) => {
    await use(fixture.companies)
  },
})

export { expect }

/** La empresa con almacenes, sitios y locaciones. Es la que tiene los cuatro miembros. */
export const WAREHOUSE_COMPANY = "Renta Fílmica del Norte"
/** La otra, con producciones y Pixit. Sirve para comprobar el alcance entre arrendatarios. */
export const PRODUCTION_COMPANY = "Estudios Mariposa"
