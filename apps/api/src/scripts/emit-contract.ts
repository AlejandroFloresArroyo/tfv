/**
 * Emite el contrato publicado y el cliente tipado que se deriva de él.
 *
 * ```sh
 * pnpm --filter @tfv/api contract
 * ```
 *
 * `package.json` ya declaraba este comando desde la rebanada 03 y **el archivo no existía**: correrlo
 * fallaba con «Cannot find module». Queda anotado como `HALLAZGOS.md` H-126.
 *
 * ## Qué hace
 *
 * Levanta la aplicación en memoria —sin escuchar en ningún puerto— y le pide su propia descripción,
 * que sale de los mismos esquemas que validan en ejecución. De ahí emite
 * `packages/contracts/src/api.generated.ts`, que es lo que el navegador importa.
 *
 * No toca la base de datos. Necesita `DATABASE_URL` puesta porque la configuración se valida al
 * cargar el módulo, pero no llega a abrir ninguna conexión: `/openapi.json` no consulta nada.
 */

import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { emitClientTypes, type OpenApiDocument } from "@tfv/contracts"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"

/** Dónde vive el cliente generado. Lo consumen la aplicación web y la prueba de desfase. */
export const CLIENT_PATH = resolve(
  import.meta.dirname,
  "../../../../packages/contracts/src/api.generated.ts",
)

/** El contrato, tal y como lo publica el servicio. */
export async function publishedContract(): Promise<OpenApiDocument> {
  const response = await createApp(routes).request("/openapi.json")
  return (await response.json()) as OpenApiDocument
}

/** El cliente tipado que corresponde al contrato de ahora mismo. */
export async function generateClient(): Promise<string> {
  return emitClientTypes(await publishedContract())
}

if (import.meta.filename === process.argv[1]) {
  const source = await generateClient()
  writeFileSync(CLIENT_PATH, source)

  const endpoints = source.match(/^ {2}"[A-Z]+ /gm)?.length ?? 0
  console.warn(`Cliente tipado emitido con ${endpoints} endpoints: ${CLIENT_PATH}`)

  process.exit(0)
}
