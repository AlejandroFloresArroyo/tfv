import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "drizzle-kit"

// `drizzle-kit` es un binario y no admite `--env-file`, así que el entorno se carga aquí.
// `loadEnvFile` no pisa lo que ya venga del entorno real, que es lo que hace falta en integración
// continua.
//
// Se busca hacia arriba desde el directorio de trabajo y no desde `import.meta.dirname`: esta
// herramienta compila el archivo antes de ejecutarlo y `import.meta` no sobrevive a esa conversión.
for (const candidate of [".env", "../.env", "../../.env"]) {
  const envPath = resolve(process.cwd(), candidate)
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath)
    break
  }
}

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error("Falta DATABASE_URL. Levanta la base local con `pnpm db:up` y carga el entorno.")
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  casing: "snake_case",
  verbose: true,
  strict: true,
})
