import { useTestDatabase } from "@tfv/db/testing"
import { defineConfig } from "vitest/config"

/**
 * Estas pruebas levantan la aplicación real, que valida su configuración al cargarse.
 *
 * Hablan con la **base de pruebas**, no con la de desarrollo. Truncan sus tablas en cada suite, y
 * hacerlo sobre la de desarrollo obligaba a volver a sembrar después de cada ejecución
 * (`HALLAZGOS.md` H-12).
 */
useTestDatabase(import.meta.dirname)

export default defineConfig({
  test: {
    globalSetup: ["@tfv/db/testing-setup"],
    fileParallelism: false,
  },
})
