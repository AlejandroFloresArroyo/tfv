/**
 * Preparación de la suite.
 *
 * **Abre una sesión por papel y la guarda.** Cuatro inicios de sesión en total, no uno por prueba.
 *
 * La base ya está creada, migrada y sembrada cuando esto corre: lo hace `setup/prepare-database.ts`
 * como primer eslabón del comando que arranca la API, porque Playwright levanta los servidores
 * **antes** que esta preparación y la API abre su conexión al arrancar.
 *
 * No borra nada. La siembra es idempotente y cada prueba retira lo suyo **al empezar**, que es la
 * única limpieza que sobrevive a un tiempo agotado.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { type FullConfig, request } from "@playwright/test"
import { ENTORNO } from "./environment.ts"
import { FIXTURE_PATH, type Fixture, PASSWORD, ROLES, type Role, stateFor } from "./roles.ts"

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL
  if (!baseURL) throw new Error("falta baseURL en la configuración")

  // Dicho en voz alta: cuando dos árboles de trabajo caen en la misma casilla de puerto, o cuando
  // alguien se pregunta a qué base se está escribiendo, esto es lo que responde.
  // biome-ignore lint/suspicious/noConsole: es lo que responde «¿a qué base y a qué puerto?» sin abrir un archivo.
  console.log(
    `[e2e] web ${baseURL} · api :${ENTORNO.apiPort} · base ${new URL(ENTORNO.databaseUrl).pathname.slice(1)}`,
  )

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true })

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
