import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

// Las pruebas de este paquete hablan con una base real: `pnpm db:up` antes de ejecutarlas.
const envPath = resolve(import.meta.dirname, "../../.env")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (match?.[1] && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2]
    }
  }
}

export default defineConfig({
  test: {
    // Comparten una base: si corren en paralelo se pisan al truncar.
    fileParallelism: false,
  },
})
