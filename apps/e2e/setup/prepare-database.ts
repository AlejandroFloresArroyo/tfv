/**
 * Crea, migra y siembra la base propia de la suite.
 *
 * ## Por qué es un guion aparte y no la preparación global
 *
 * Playwright levanta los servidores **antes** de correr `globalSetup`. La API valida su
 * configuración y abre su conexión al arrancar, así que para cuando la preparación global tuviera
 * la palabra la base ya tendría que existir y estar migrada. De ahí que esto sea el primer eslabón
 * del propio comando que arranca la API: `prepare-database && api start`.
 *
 * Corre con el entorno que le pasa `playwright.config.ts`, donde `DATABASE_URL` ya apunta a la base
 * de pruebas. No lee ningún `.env` — no hay `--env-file` en el comando — para que no exista la
 * pregunta de qué manda sobre qué justo en la variable que decide a quién se le borran los datos.
 */

import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { prepareTestDatabase } from "@tfv/db/testing"

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))

const url = process.env.DATABASE_URL
if (!url) throw new Error("La configuración de Playwright no dejó DATABASE_URL puesta")

// El segundo cerrojo. El primero está en `environment.ts`, que compara con la de desarrollo; éste
// no la conoce, así que se planta ante el nombre con el que la levanta Supabase. Dos cerrojos para
// lo mismo es barato al lado de sembrar sobre el trabajo de otra persona.
const name = new URL(url).pathname.slice(1)
if (name === "postgres" || name === "") {
  throw new Error(
    `La suite no siembra sobre "${name || "(sin nombre)"}": es la base de desarrollo. ` +
      "Fija E2E_DATABASE_URL o TFV_TEST_DATABASE_URL.",
  )
}

// biome-ignore lint/suspicious/noConsole: es la preparación de una suite; decir a qué base escribe es su trabajo.
console.log(`[e2e] base de pruebas: ${name}`)

await prepareTestDatabase()

/**
 * La siembra, con el entorno explícito y sin pasar por `pnpm db:seed`.
 *
 * El guion de `package.json` arranca con `--env-file-if-exists=../../.env`, y aunque el entorno
 * gana sobre el archivo, la variable que decide **a qué base se escribe** no es el sitio donde uno
 * quiere depender de un orden de precedencia. Se invoca el guion directo, sin archivo de entorno.
 */
execFileSync("node", ["--experimental-strip-types", "apps/api/src/scripts/seed.ts"], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
})

// biome-ignore lint/suspicious/noConsole: cierra el paso más lento del arranque; sin la línea parece colgado.
console.log("[e2e] base preparada y sembrada")
