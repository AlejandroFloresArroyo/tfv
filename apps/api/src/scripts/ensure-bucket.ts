/**
 * Deja puesto el depósito de objetos, y comprueba que sirve.
 *
 * Ver `openspec/specs/media-storage/spec.md` y `media/bucket.ts`. Cierra el hueco de `HALLAZGOS.md`
 * H-136: hasta ahora el depósito existía porque alguien lo creó a mano, así que en una máquina nueva
 * fallaba el primer archivo que alguien subiera y desplegar exigía recordar un paso que no estaba
 * escrito en ninguna parte.
 *
 * ```sh
 * # Contra el almacenamiento configurado: lo crea si falta, lo repara si está mal, y lo comprueba
 * pnpm --filter @tfv/api bucket
 *
 * # Las órdenes que dejan puesto un depósito de AWS, compuestas desde esta misma configuración
 * pnpm --filter @tfv/api bucket --aws
 * pnpm --filter @tfv/api bucket --aws --aplicar
 * ```
 *
 * Es idempotente y reparadora, así que su sitio en un despliegue es junto a las migraciones, antes
 * de `placeholders` —que sin depósito no tiene dónde escribir— y por eso la siembra ya la corre.
 */

import { closeConnection } from "@tfv/db"
import { env } from "../env.ts"
import { provisioningCommands, runCommands, writePolicy } from "../media/aws.ts"
import { ensureBucket } from "../media/bucket.ts"

// biome-ignore lint/suspicious/noConsole: es un guion de línea de órdenes; imprimir es su salida.
const say = console.log

if (process.argv.includes("--aws")) {
  const commands = provisioningCommands({
    bucket: env.STORAGE_BUCKET,
    region: env.STORAGE_S3_REGION,
    origins: env.CORS_ORIGINS,
  })

  if (process.argv.includes("--aplicar")) {
    await runCommands(commands)
    say("")
    say("  Aplicado. Comprueba que sirve con `pnpm --filter @tfv/api bucket`, apuntando ya a AWS.")
    say("")
  } else {
    say("")
    say(`  Depósito ${env.STORAGE_BUCKET} · región ${env.STORAGE_S3_REGION}`)
    say("")

    for (const command of commands) {
      say(`  # ${command.why}`)
      say(`  ${command.argv.map((part) => (/[\s{]/.test(part) ? `'${part}'` : part)).join(" ")}`)
      say("")
    }

    say("  # La credencial con la que firma el servicio, acotada a este depósito. Se adjunta al")
    say("  # usuario o rol que use la API; el nombre lo pone quien administre la cuenta.")
    say(writePolicy(env.STORAGE_BUCKET))
    say("")
    say(
      "  Nada de esto se ha ejecutado. Vuelve a correrlo con --aplicar cuando sea lo que esperas.",
    )
    say("")
  }

  process.exit(0)
}

const report = await ensureBucket()

say("")
say(`  Proveedor:  ${report.provider}`)
say(`  Depósito:   ${report.bucket}${report.created ? " (creado ahora)" : ""}`)
say(`  Lectura:    pública, comprobada leyendo un objeto sin credencial`)
say(`  Escritura:  admitida desde ${report.cors.join(", ")}, comprobada con un preflight de PUT`)
say("")

for (const note of report.notes) say(`    · ${note}`)
if (report.notes.length > 0) say("")

await closeConnection()
