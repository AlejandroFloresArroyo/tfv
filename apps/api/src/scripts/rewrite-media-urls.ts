/**
 * Lleva las direcciones ya persistidas de un almacenamiento a otro.
 *
 * Ver `openspec/specs/media-storage/spec.md`: «Un cambio de proveedor SHALL contemplar la
 * actualización de las direcciones ya persistidas». Es la mitad de una mudanza que **no** es
 * configuración; la otra mitad es `STORAGE_PROVIDER`, y las dos hacen falta.
 *
 * ```sh
 * # Mirar, que es lo primero: cuántas filas se moverían, y a dónde
 * pnpm --filter @tfv/api rewrite-media-urls --desde http://viejo/storage/v1/object/public/tfv
 *
 * # Y aplicarlo
 * pnpm --filter @tfv/api rewrite-media-urls --desde http://viejo/... --aplicar
 * ```
 *
 * `--hasta` se puede omitir: por omisión es **donde sirve lectura el proveedor que está puesto**,
 * que es a donde se quiere llegar en el único caso que existe. Se acepta a mano para poder
 * reescribir hacia un destino que todavía no está configurado, o para deshacerlo.
 *
 * Los objetos hay que haberlos copiado antes. Este guion mueve direcciones, no bytes: copiar el
 * depósito es trabajo del proveedor de infraestructura —`aws s3 sync` y equivalentes—, y hacerlo
 * desde aquí sería arrastrar gigabytes por un proceso de Node para reimplementar mal lo que esa
 * herramienta hace bien.
 */

import { closeConnection } from "@tfv/db"
import { rewritePersistedUrls } from "../media/rewrite.ts"
import { storageProvider } from "../media/storage.ts"

function argument(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`)
  if (at === -1) return undefined
  return process.argv[at + 1]
}

const from = argument("desde")
const apply = process.argv.includes("--aplicar")

/** Donde el proveedor puesto sirve lectura hoy: `publicUrl` de la clave vacía, sin la barra. */
const to = argument("hasta") ?? storageProvider().publicUrl("").replace(/\/+$/, "")

// biome-ignore lint/suspicious/noConsole: es un guion de línea de órdenes; imprimir es su salida.
const say = console.log

if (from === undefined || from.startsWith("--")) {
  say(
    "Falta --desde, la raíz de las direcciones que hay que mover.\n" +
      "  pnpm --filter @tfv/api rewrite-media-urls --desde <raíz vieja> [--hasta <raíz nueva>] [--aplicar]",
  )
  process.exit(1)
}

const report = await rewritePersistedUrls({ from, to, apply })

say("")
say(`  Desde:  ${from}`)
say(`  Hasta:  ${to}`)
say("")
say(`  Archivos mirados:  ${report.scanned}`)
say(`  Que se mueven:     ${report.changed}`)
say("")

for (const sample of report.samples) {
  say(`    ${sample.before}`)
  say(`  → ${sample.after}`)
}

say("")
say(
  report.applied
    ? "  Aplicado."
    : "  No se ha cambiado nada. Vuelve a correrlo con --aplicar cuando lo de arriba sea lo que esperas.",
)
say("")

await closeConnection()
