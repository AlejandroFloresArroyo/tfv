/**
 * El volcado: un directorio de exportación, una colección por archivo.
 *
 * Las rutinas de trasvase **nunca hablan con Mongo**. Leen lo que `mongoexport` dejó en un
 * directorio —`<colección>.json` o `<colección>.jsonl`, un documento por línea o un arreglo—, y
 * eso es lo que hace el trasvase repetible: la misma entrada produce la misma salida, se puede
 * ensayar con una copia y probar con accesorios.
 *
 * La lectura es perezosa: los documentos salen de un generador que recorre el archivo línea a
 * línea, así que una colección grande no se carga entera en memoria.
 */

import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, extname, join } from "node:path"
import { createInterface } from "node:readline"
import { analizarLinea, desenvolver, type Documento } from "./ejson.ts"

export type { Documento } from "./ejson.ts"

export interface Volcado {
  /** El directorio del que se leyó, para los informes. */
  readonly directorio: string
  /** Nombres de las colecciones exportadas, en el orden del directorio. */
  nombres(): string[]
  existe(coleccion: string): boolean
  /** Los documentos de una colección, desenvueltos, uno a uno. */
  documentos(coleccion: string): AsyncGenerator<Documento>
  contar(coleccion: string): Promise<number>
  /** Colecciones presentes sólo como `.bson`: hay que exportarlas, no se leen de ahí. */
  sinExportar(): string[]
}

function esArreglo(ruta: string): boolean {
  // El arreglo de --jsonArray empieza con "[" tras el posible espacio inicial.
  const abridor = readFileSync(ruta, { encoding: "utf8", flag: "r" }).trimStart()
  return abridor.startsWith("[")
}

async function* documentosDe(ruta: string): AsyncGenerator<Documento> {
  // Los volcados de --jsonArray caben en memoria con holgura; los de línea por línea, que son el
  // formato por defecto y el de las colecciones grandes, se recorren sin cargarlos enteros.
  if (esArreglo(ruta)) {
    const crudo = JSON.parse(readFileSync(ruta, "utf8")) as unknown[]
    for (const elemento of crudo) yield desenvolver(elemento) as Documento
    return
  }

  const lineas = createInterface({
    input: createReadStream(ruta, "utf8"),
    crlfDelay: Number.POSITIVE_INFINITY,
  })
  for await (const linea of lineas) {
    if (linea.trim() === "") continue
    yield analizarLinea(linea)
  }
}

export function abrirVolcado(directorio: string): Volcado {
  if (!existsSync(directorio) || !statSync(directorio).isDirectory()) {
    throw new Error(`El directorio del volcado no existe: ${directorio}`)
  }

  const rutas = new Map<string, string>()
  const bson = new Set<string>()

  for (const entrada of readdirSync(directorio)) {
    const ruta = join(directorio, entrada)
    if (!statSync(ruta).isFile()) continue
    const extension = extname(entrada)
    const nombre = basename(entrada, extension)
    if (extension === ".json" || extension === ".jsonl") rutas.set(nombre, ruta)
    else if (extension === ".bson") bson.add(nombre)
  }

  return {
    directorio,
    nombres: () => [...rutas.keys()],
    existe: (coleccion) => rutas.has(coleccion),
    documentos(coleccion) {
      const ruta = rutas.get(coleccion)
      if (!ruta) throw new Error(`La colección no está en el volcado: ${coleccion}`)
      return documentosDe(ruta)
    },
    async contar(coleccion) {
      let total = 0
      for await (const _ of this.documentos(coleccion)) total += 1
      return total
    },
    sinExportar: () => [...bson].filter((nombre) => !rutas.has(nombre)),
  }
}
