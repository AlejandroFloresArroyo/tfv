/**
 * La herramienta de línea de órdenes del trasvase.
 *
 * ```
 * node --experimental-strip-types src/cli.ts analizar   <directorio-del-volcado>
 * node --experimental-strip-types src/cli.ts trasvasar  <directorio-del-volcado>
 * node --experimental-strip-types src/cli.ts verificar  <directorio-del-volcado>
 * node --experimental-strip-types src/cli.ts cuarentena <directorio-del-volcado>
 * ```
 *
 * La base destino llega por `TRASVASE_DATABASE_URL` (o `DATABASE_URL`); el directorio, por
 * argumento. Aquí no hay rutas ni credenciales escritas.
 */

import postgres from "postgres"
import { comprobarVolcado, informeAnalisis } from "./analisis/comprobar.ts"
import { abrirContexto } from "./trasvase/contexto.ts"
import { correrTrasvase } from "./trasvase/correr.ts"
import {
  cuadrarImportes,
  informeCuarentena,
  verificarRecuentos,
} from "./verificacion/verificar.ts"
import { abrirVolcado } from "./volcado/leer.ts"

function salida(texto: string): void {
  process.stdout.write(`${texto}\n`)
}

function usoYSalir(): never {
  process.stderr.write(
    "Uso: cli.ts <analizar|trasvasar|verificar|cuarentena> <directorio-del-volcado>\n",
  )
  process.exit(2)
}

async function principal(): Promise<void> {
  const [orden, directorio] = process.argv.slice(2)
  if (!orden || !directorio) usoYSalir()

  const volcado = abrirVolcado(directorio)

  if (orden === "analizar") {
    salida(informeAnalisis(await comprobarVolcado(volcado)))
    return
  }

  const url = process.env.TRASVASE_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) {
    process.stderr.write("Falta TRASVASE_DATABASE_URL (o DATABASE_URL) con la base destino.\n")
    process.exit(2)
  }

  // Sin avisos del servidor: los `if not exists` del esquema propio no son noticia.
  const sql = postgres(url, { max: 4, onnotice: () => {} })
  try {
    const contexto = await abrirContexto(sql, volcado)

    switch (orden) {
      case "trasvasar": {
        await correrTrasvase(contexto)
        salida("Trasvase terminado. Ejecuta `verificar` para los recuentos y el cuadre.")
        break
      }
      case "verificar": {
        const { colecciones, destinos } = await verificarRecuentos(contexto)
        salida("| colección | origen | migradas | cuarentena | cuadra |")
        salida("| --- | --- | --- | --- | --- |")
        for (const fila of colecciones) {
          salida(
            `| ${fila.coleccion} | ${fila.origen} | ${fila.migradas} | ${fila.cuarentena} | ${fila.cuadra ? "sí" : "NO"} |`,
          )
        }
        salida("")
        salida("| tabla destino | filas | esperadas | cuadra |")
        salida("| --- | --- | --- | --- |")
        for (const fila of destinos) {
          salida(`| ${fila.tabla} | ${fila.filas} | ${fila.esperadas} | ${fila.cuadra ? "sí" : "NO"} |`)
        }
        salida("")
        for (const cuadre of await cuadrarImportes(contexto)) {
          salida(
            `${cuadre.concepto}: origen ${cuadre.origenCentavos} ¢, destino ${cuadre.destinoCentavos} ¢, diferencia ${cuadre.diferenciaCentavos} ¢ — ${cuadre.cuadra ? "cuadra" : "NO CUADRA"}`,
          )
        }
        break
      }
      case "cuarentena": {
        salida(await informeCuarentena(contexto))
        break
      }
      default:
        usoYSalir()
    }
  } finally {
    await sql.end()
  }
}

principal().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
