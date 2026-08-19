/**
 * El cliente tipado no se queda desfasado.
 *
 * Ver `openspec/changes/add-hono-api-runtime/tasks.md`, «Comprobación de desfase en integración
 * continua», y la misma tarea en la rebanada 01.
 *
 * ## Qué defecto existe para impedir
 *
 * La pila anterior tenía ochenta y dos archivos de cliente escritos a mano y **nada los ataba al
 * servidor**. Cambiar un campo dejaba al cliente afirmando un tipo que ya no existía, y el desfase
 * sólo se notaba al abrir la pantalla que lo usaba — a veces meses después, y siempre delante de
 * alguien.
 *
 * Generarlo no basta: un archivo generado que nadie regenera es un archivo escrito a mano con peor
 * letra. Lo que cierra el hueco es esta comprobación.
 *
 * ## Es un candado, como el de la superficie pública
 *
 * Si falla, **no se arregla tocando esta prueba**: se regenera el cliente. Que falle significa que
 * el contrato cambió, que es exactamente lo que se quería saber.
 */

import { readFileSync } from "node:fs"
import { closeConnection } from "@tfv/db"
import { afterAll, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { CLIENT_PATH, generateClient, publishedContract } from "../scripts/emit-contract.ts"

afterAll(async () => {
  await closeConnection()
})

describe("el cliente tipado", () => {
  it("coincide con el contrato que el servicio publica ahora mismo", async () => {
    const esperado = await generateClient()
    const guardado = readFileSync(CLIENT_PATH, "utf8")

    expect(
      guardado === esperado,
      "El cliente tipado está desfasado del contrato. Regenéralo:\n\n" +
        "    pnpm --filter @tfv/api contract\n\n" +
        "No edites esta prueba: que falle significa que una ruta cambió y el navegador todavía no " +
        "lo sabe.",
    ).toBe(true)
  })

  it("cubre todas las rutas declaradas", async () => {
    const generado = await generateClient()

    for (const route of routes) {
      const clave = `"${route.config.method.toUpperCase()} ${route.config.path}"`
      expect(generado, `falta ${clave} en el cliente`).toContain(clave)
    }
  })

  it("el contrato publicado se deriva de los esquemas de ejecución", async () => {
    const doc = await publishedContract()

    expect(doc.openapi).toBe("3.1.0")
    expect(Object.keys(doc.paths).length).toBeGreaterThan(0)
  })
})
