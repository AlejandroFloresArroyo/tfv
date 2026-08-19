/**
 * Los dos idiomas, clave a clave.
 *
 * La rebanada 29 decidió español e inglés **desde el primer componente**, y añadió que había que
 * comprobar que no se desalinean. No se estaba comprobando: una clave añadida sólo al español
 * pasaba entera hasta la pantalla, donde `next-intl` enseña la clave cruda al usuario en inglés.
 *
 * Con varias personas escribiendo pantallas a la vez es la desalineación más fácil de provocar y
 * la más difícil de ver, porque quien la provoca casi siempre trabaja en un solo idioma.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import en from "./messages/en.json" with { type: "json" }
import es from "./messages/es.json" with { type: "json" }

/** Los caminos de todas las hojas, en orden, para poder compararlos y para poder leer el fallo. */
function paths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix]

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => paths(child, prefix ? `${prefix}.${key}` : key))
    .sort()
}

describe("los mensajes de los dos idiomas", () => {
  it("tienen exactamente las mismas claves", () => {
    const spanish = paths(es)
    const english = paths(en)

    expect(english.filter((key) => !spanish.includes(key))).toEqual([])
    expect(spanish.filter((key) => !english.includes(key))).toEqual([])
  })

  it("no dejan ningún texto vacío", () => {
    const empty = (messages: unknown, language: string) =>
      paths(messages)
        .filter((key) => {
          const value = key
            .split(".")
            .reduce<unknown>(
              (node, part) => (node as Record<string, unknown> | undefined)?.[part],
              messages,
            )
          return typeof value === "string" && value.trim() === ""
        })
        .map((key) => `${language}: ${key}`)

    expect([...empty(es, "es"), ...empty(en, "en")]).toEqual([])
  })
})

/**
 * Y que ninguna pantalla pida una clave que no existe.
 *
 * `next-intl` no falla cuando la clave no está: **enseña la clave cruda** —«warehouses.products.
 * name»— en mitad del formulario. Es un fallo que pasa las revisiones porque la pantalla se dibuja
 * entera, y que sólo se ve si alguien mira ese campo concreto.
 *
 * Sólo se comprueban las claves escritas literalmente. Las compuestas —`t(`forms.errors.${code}`)`—
 * no se pueden resolver leyendo el archivo, y fingir que sí llevaría a una prueba que da confianza
 * sin darla.
 */

const src = fileURLToPath(new URL("../", import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : []
  })
}

function exists(key: string): boolean {
  let node: unknown = es
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return false
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === "string"
}

describe("las claves que piden las pantallas", () => {
  it("existen todas", () => {
    const loose: string[] = []

    for (const file of sources(src)) {
      const source = readFileSync(file, "utf8")

      // Un archivo puede pedir el diccionario acotado a un espacio de nombres. Con varios —los hay
      // que mezclan el general y el suyo— basta con que la clave resuelva bajo alguno.
      const scopes = [
        ...source.matchAll(/(?:useTranslations|getTranslations)\(\s*(?:"([^"]*)")?\s*\)/g),
      ].map((match) => (match[1] === undefined ? "" : `${match[1]}.`))

      const prefixes = scopes.length === 0 ? [""] : [...new Set(scopes)]

      for (const [, key] of source.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) {
        if (key === undefined) continue
        if (prefixes.some((prefix) => exists(prefix + key))) continue
        loose.push(`${file.replace(src, "")} → ${key}`)
      }
    }

    expect(loose).toEqual([])
  })
})
