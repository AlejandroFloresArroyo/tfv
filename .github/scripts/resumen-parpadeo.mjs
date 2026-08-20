/**
 * El recuento de la cacería de H-146: qué prueba cayó, en cuántas vueltas, y con quién coincidió.
 *
 * Lee los informes JSON que dejó cada vuelta de Playwright y responde las tres preguntas con las que
 * se diagnostica un parpadeo:
 *
 *   1. **Cuántas vueltas fueron rojas.** «Una de cada tres» es la afirmación de H-146; lo primero es
 *      medirla de verdad, porque una frecuencia distinta apunta a otra causa.
 *   2. **Cuáles cayeron y cuántas veces cada una.** Una prueba que cae siempre no es un parpadeo,
 *      es un fallo; y un reparto plano entre muchas apunta a recurso compartido y no a una mala
 *      espera dentro de una prueba concreta.
 *   3. **Quién estaba corriendo a la vez.** Es la pregunta que el informe suelto no responde y la
 *      que importa cuando la sospecha es interferencia: dos pruebas se solapan en el tiempo si sus
 *      ventanas de ejecución se cruzan.
 *
 * Node pelado, sin dependencias: el resumen tiene que poder correr aunque la instalación falle.
 */

// biome-ignore-all lint/suspicious/noConsole: la salida estándar **es** el producto de este guion — se redirige al resumen de la ejecución. Aquí `console` no es un resto de depuración.

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const carpeta = process.argv[2]

if (!carpeta) {
  console.error("Uso: resumen-parpadeo.mjs <carpeta con los informes JSON>")
  process.exit(1)
}

/** Recorre el árbol de suites y devuelve una fila por prueba ejecutada. */
function pruebasDe(nodo, archivo = nodo.file ?? "") {
  const filas = []

  for (const spec of nodo.specs ?? []) {
    for (const prueba of spec.tests ?? []) {
      for (const resultado of prueba.results ?? []) {
        filas.push({
          archivo: (archivo || spec.file || "").split("/").pop() ?? "",
          titulo: spec.title,
          estado: resultado.status,
          esperado: spec.ok === true,
          inicio: resultado.startTime ? Date.parse(resultado.startTime) : null,
          duracion: resultado.duration ?? 0,
          error: (resultado.error?.message ?? "").split("\n")[0]?.slice(0, 200) ?? "",
        })
      }
    }
  }

  for (const hija of nodo.suites ?? []) filas.push(...pruebasDe(hija, hija.file ?? archivo))

  return filas
}

const informes = readdirSync(carpeta)
  .filter((nombre) => nombre.endsWith(".json"))
  .sort()

if (informes.length === 0) {
  console.log("No hay ningún informe que contar. ¿Se llegaron a dar vueltas?")
  process.exit(0)
}

const vueltas = []

for (const nombre of informes) {
  let datos
  try {
    datos = JSON.parse(readFileSync(join(carpeta, nombre), "utf8"))
  } catch (error) {
    console.log(`- \`${nombre}\`: informe ilegible (${error.message})`)
    continue
  }

  const filas = (datos.suites ?? []).flatMap((suite) => pruebasDe(suite))
  const caidas = filas.filter((fila) => fila.estado !== "passed" && fila.estado !== "skipped")

  vueltas.push({ nombre, filas, caidas, stats: datos.stats ?? {} })
}

const rojas = vueltas.filter((vuelta) => vuelta.caidas.length > 0)

console.log("")
console.log(
  `**${rojas.length} de ${vueltas.length} vueltas en rojo** ` +
    `(${((rojas.length / vueltas.length) * 100).toFixed(0)} %).`,
)
console.log("")

if (rojas.length === 0) {
  console.log("Ninguna prueba cayó. Con estas vueltas, el parpadeo no se reprodujo.")
  process.exit(0)
}

// ─── Quién cae, y cuántas veces ──────────────────────────────────────────────
const porPrueba = new Map()

for (const vuelta of vueltas) {
  for (const caida of vuelta.caidas) {
    const clave = `${caida.archivo} › ${caida.titulo}`
    const previo = porPrueba.get(clave) ?? { veces: 0, errores: new Set() }
    previo.veces++
    if (caida.error) previo.errores.add(caida.error)
    porPrueba.set(clave, previo)
  }
}

console.log("| Prueba | Vueltas en las que cayó | Primer renglón del error |")
console.log("|---|---|---|")

for (const [clave, dato] of [...porPrueba].sort((a, b) => b[1].veces - a[1].veces)) {
  const error = [...dato.errores][0]?.replaceAll("|", "\\|") ?? ""
  console.log(`| ${clave.replaceAll("|", "\\|")} | ${dato.veces} de ${vueltas.length} | ${error} |`)
}

// ─── Con quién coincidía en el tiempo ────────────────────────────────────────
//
// La sospecha de H-146 es interferencia entre pruebas que comparten la empresa y el almacén
// sembrados. Si eso es lo que pasa, la que cae tiene siempre a alguien solapado — y este cuadro es
// lo que lo enseña o lo descarta.
console.log("")
console.log("<details><summary>Con quién se solapaba cada caída</summary>")
console.log("")

for (const vuelta of rojas) {
  for (const caida of vuelta.caidas) {
    if (caida.inicio === null) continue
    const fin = caida.inicio + caida.duracion

    const solapadas = vuelta.filas
      .filter((fila) => fila !== caida && fila.inicio !== null)
      .filter((fila) => fila.inicio < fin && fila.inicio + fila.duracion > caida.inicio)
      .map((fila) => `${fila.archivo} › ${fila.titulo}`)

    console.log("")
    console.log(`**${vuelta.nombre}** — cayó \`${caida.archivo} › ${caida.titulo}\``)
    console.log("")
    if (solapadas.length === 0) {
      console.log("- Sin nadie solapado: no puede ser interferencia de otra prueba.")
    } else {
      for (const nombre of solapadas) console.log(`- ${nombre}`)
    }
  }
}

console.log("")
console.log("</details>")
