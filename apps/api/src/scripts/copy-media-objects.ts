/**
 * Copia los objetos de un depósito a otro, con la herramienta del proveedor.
 *
 * Ver `media/transfer.ts`, que explica por qué esto no lo hace Node. Es **la otra mitad** de la
 * mudanza: `rewrite-media-urls` mueve direcciones y esto mueve bytes. Correr sólo aquella deja mil
 * filas apuntando a un depósito vacío; correr sólo ésta deja los objetos copiados y a nadie
 * mirándolos.
 *
 * ```sh
 * # Ver el plan: qué órdenes hacen falta para llevar el depósito de hoy al que se configure
 * pnpm --filter @tfv/api copy-media-objects --hasta tfv-archivos
 *
 * # Y ejecutarlo
 * pnpm --filter @tfv/api copy-media-objects --hasta tfv-archivos --aplicar
 * ```
 *
 * El origen es, por omisión, el depósito configurado, con su punto de acceso si no es AWS. El orden
 * de la mudanza entera:
 *
 * 1. Dejar puesto el depósito nuevo — `pnpm --filter @tfv/api bucket --aws`.
 * 2. Copiar los objetos — esto, **en frío**: tarda lo que tarde y se puede repetir.
 * 3. Copiarlos otra vez en el corte: la segunda pasada sólo trae lo que haya cambiado.
 * 4. Cambiar `STORAGE_PROVIDER` y `STORAGE_S3_*`.
 * 5. Reescribir las direcciones — `pnpm --filter @tfv/api rewrite-media-urls`.
 * 6. Volver a dejar los marcadores — `pnpm --filter @tfv/api placeholders`.
 * 7. Comprobar el depósito nuevo — `pnpm --filter @tfv/api bucket`.
 */

import { env } from "../env.ts"
import { runCommands } from "../media/aws.ts"
import { transferCommands } from "../media/transfer.ts"

function argument(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`)
  if (at === -1) return undefined
  const value = process.argv[at + 1]
  return value?.startsWith("--") ? undefined : value
}

// biome-ignore lint/suspicious/noConsole: es un guion de línea de órdenes; imprimir es su salida.
const say = console.log

const to = argument("hasta")

if (to === undefined) {
  say(
    "Falta --hasta, el depósito de destino.\n" +
      "  pnpm --filter @tfv/api copy-media-objects --hasta <depósito> " +
      "[--desde <depósito>] [--punto <punto de acceso del origen>] [--escala <carpeta>] [--aplicar]",
  )
  process.exit(1)
}

/**
 * El punto de acceso del origen.
 *
 * Por omisión, el del almacenamiento configurado — y cuando el de hoy no es S3, el que la pila
 * local expone bajo `/s3`, que es el mismo depósito visto por el otro protocolo.
 */
const endpoint =
  argument("punto") ??
  (env.STORAGE_PROVIDER === "s3" ? env.STORAGE_S3_ENDPOINT : `${env.STORAGE_URL}/s3`)

const commands = transferCommands({
  from: { bucket: argument("desde") ?? env.STORAGE_BUCKET, endpoint },
  to: { bucket: to, endpoint: argument("punto-destino") },
  ...(argument("escala") === undefined ? {} : { staging: argument("escala") }),
})

if (process.argv.includes("--aplicar")) {
  await runCommands(commands)
  say("")
  say("  Copiado. Ahora las direcciones: `pnpm --filter @tfv/api rewrite-media-urls`.")
  say("")
} else {
  say("")
  for (const command of commands) {
    say(`  # ${command.why}`)
    say(`  ${command.argv.join(" ")}`)
    say("")
  }
  say("  Nada de esto se ha ejecutado. Vuelve a correrlo con --aplicar cuando sea lo que esperas.")
  say("")
}
