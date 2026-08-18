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
