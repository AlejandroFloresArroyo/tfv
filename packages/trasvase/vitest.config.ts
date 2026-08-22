import { useTestDatabase } from "@tfv/db/testing"
import { defineConfig } from "vitest/config"

/**
 * Las pruebas de este paquete hablan con una base real: `pnpm db:up` antes de ejecutarlas.
 *
 * Contra la **base de pruebas**, nunca la de desarrollo. Las rutinas de trasvase escriben en las
 * tablas destino de verdad —eso es lo que se está probando— y truncan lo suyo entre casos.
 */
useTestDatabase(import.meta.dirname)

export default defineConfig({
  test: {
    globalSetup: ["./pruebas-preparar.ts"],
    // Comparten una base: si corren en paralelo se pisan al truncar.
    fileParallelism: false,
    // Cada caso monta un volcado y lo trasvasa entero; con la máquina cargada, 5 s no alcanzan.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
