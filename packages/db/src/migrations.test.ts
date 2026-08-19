/**
 * El registro de migraciones, como candado.
 *
 * ## Por qué existe
 *
 * El motor de migraciones lee **una sola vez** cuál fue la última aplicada y salta todo lo que no
 * supere su marca de tiempo. No avisa: responde «migraciones aplicadas» y sigue. Una migración con
 * marca por debajo de la última **no se aplica nunca**, y el defecto aparece mucho después, en
 * forma de columna que no existe.
 *
 * Ya pasó dos veces en dos días (`HALLAZGOS.md` H-145):
 *
 * 1. Al fusionar tres ramas paralelas, cada una había numerado su archivo por el hueco que le
 *    tocaba y el orden del registro dejó de coincidir con el de los números.
 * 2. Al registrar una migración **a mano** con una marca inventada más alta que la del reloj: la
 *    siguiente, generada por la herramienta con la hora de verdad, nació por debajo del listón y se
 *    saltó en silencio. La columna faltó en la base de desarrollo durante horas.
 *
 * Las dos veces costó una vuelta de diagnóstico, porque el síntoma —«no existe la tabla»— no se
 * parece a la causa. Esta prueba convierte ese silencio en rojo.
 *
 * ## Lo que no comprueba
 *
 * Que las migraciones **hagan** lo correcto: de eso se encargan las suites de cada dominio. Aquí
 * sólo se comprueba que el motor las vaya a mirar todas.
 */

import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const carpeta = resolve(import.meta.dirname, "../drizzle")

interface Entrada {
  readonly idx: number
  readonly when: number
  readonly tag: string
}

function registro(): Entrada[] {
  const crudo = readFileSync(resolve(carpeta, "meta/_journal.json"), "utf8")
  return (JSON.parse(crudo) as { entries: Entrada[] }).entries
}

describe("el registro de migraciones", () => {
  it("tiene marcas de tiempo estrictamente crecientes", () => {
    // La propiedad que sostiene todo lo demás. Sin ella el motor salta migraciones **sin error**.
    const entradas = registro()
    const desordenadas = entradas
      .map((entrada, i) => ({ entrada, previa: entradas[i - 1] }))
      .filter(({ entrada, previa }) => previa !== undefined && entrada.when <= previa.when)
      .map(({ entrada, previa }) => `${entrada.tag} (${entrada.when}) no supera a ${previa?.tag}`)

    expect(desordenadas).toEqual([])
  })

  it("se lee en el mismo orden en que están numeradas", () => {
    // Que las marcas crezcan no basta: si el arreglo estuviera en otro orden, el motor aplicaría
    // una migración antes que aquella de la que depende.
    const tags = registro().map((entrada) => entrada.tag)
    expect(tags).toEqual([...tags].sort())
  })

  it("cada entrada tiene su archivo, y cada archivo su entrada", () => {
    // Un archivo sin entrada no se aplica jamás; una entrada sin archivo revienta la migración
    // entera. Las dos cosas se cuelan al resolver una fusión a mano.
    const enRegistro = registro()
      .map((entrada) => entrada.tag)
      .sort()
    const enDisco = readdirSync(carpeta)
      .filter((nombre) => nombre.endsWith(".sql"))
      .map((nombre) => nombre.replace(/\.sql$/, ""))
      .sort()

    expect(enRegistro).toEqual(enDisco)
  })
})
