import { defineConfig } from "vitest/config"

// Estas pruebas no tocan la base ni el navegador: comprueban el transporte del cliente con una red
// de mentira. Las que necesitan un navegador viven en `apps/e2e`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
