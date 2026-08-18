import { defineConfig } from "vitest/config"
import { useTestDatabase } from "./testing.ts"

/**
 * Las pruebas de este paquete hablan con una base real: `pnpm db:up` antes de ejecutarlas.
 *
 * Contra la **base de pruebas**, no la de desarrollo. Truncan tablas, y hacerlo sobre la de
 * desarrollo borraba los datos con los que se está mirando la aplicación.
 */
useTestDatabase(import.meta.dirname)

export default defineConfig({
  test: {
    globalSetup: ["./testing-setup.ts"],
    // Comparten una base: si corren en paralelo se pisan al truncar.
    fileParallelism: false,
  },
})
