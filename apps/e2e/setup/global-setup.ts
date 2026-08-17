/**
 * Preparación de la suite.
 *
 * Hace dos cosas, en este orden:
 *
 * 1. **Siembra la base.** Las pruebas necesitan las cuatro cuentas y las dos empresas con
 *    servicios distintos. La siembra es idempotente, así que correrla siempre sale más barato que
 *    averiguar si hace falta.
 * 2. **Abre una sesión por papel y la guarda.** Cuatro inicios de sesión en total, no uno por
 *    prueba.
 *
 * No borra la base. Correr las pruebas de extremo a extremo **no debe destruir** con lo que se está
 * mirando la aplicación: las pruebas de la API ya hacen eso, y es justamente lo que estorba. Cada
 * prueba de aquí crea lo suyo con un nombre irrepetible y limpia lo que ensucia.
 */

import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { type FullConfig, request } from "@playwright/test"
import { FIXTURE_PATH, type Fixture, PASSWORD, ROLES, type Role, stateFor } from "./roles.ts"

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL
  if (!baseURL) throw new Error("falta baseURL en la configuración")

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true })

  execFileSync("pnpm", ["db:seed"], { cwd: repoRoot, stdio: "ignore" })

  const companies: Record<string, string> = {}

  for (const [role, email] of Object.entries(ROLES) as [Role, string][]) {
    const context = await request.newContext({ baseURL })

    const response = await context.post("/api/auth/login", {
      data: { email, password: PASSWORD },
    })

    if (!response.ok()) {
      throw new Error(
        `no se pudo entrar como ${email}: ${response.status()} ${await response.text()}`,
      )
    }

    // El identificador de cada empresa lo genera la siembra, así que se resuelve por nombre una
    // vez y se pasa a las pruebas. Fijarlo en el código lo rompería en cada resiembra.
    if (role === "admin") {
      const profile = (await (await context.get("/api/auth/me")).json()) as {
        companies: { id: string; name: string }[]
      }
      for (const company of profile.companies) companies[company.name] = company.id
    }

    await context.storageState({ path: stateFor(role) })
    await context.dispose()
  }

  const fixture: Fixture = { companies }
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2))
}
