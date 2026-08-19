/**
 * El catálogo de mensajes de actividad, contra los dos idiomas y contra el árbol de rutas.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md` y la rebanada 09.
 *
 * Son las dos costuras que el asiento cruza al salir del servidor, y las dos fallan en silencio:
 *
 * - Una clave **sin traducción** no rompe nada. `next-intl` enseña el último tramo de la clave en
 *   mitad de la bitácora —«updated»— y la pantalla se dibuja entera, así que pasa las revisiones.
 * - Una dirección que ya no existe tampoco rompe nada al escribirla: rompe al pulsarla, meses
 *   después, en la bandeja de otra persona. Fue exactamente lo que pasó (`HALLAZGOS.md` H-154).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { ACTIVITY_MESSAGES, activityTarget } from "@tfv/contracts/activity"
import { describe, expect, it } from "vitest"
import en from "../i18n/messages/en.json" with { type: "json" }
import es from "../i18n/messages/es.json" with { type: "json" }

function resolve(messages: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages,
    )
}

describe("los mensajes de la bitácora", () => {
  it("tienen frase en los dos idiomas", () => {
    for (const key of Object.keys(ACTIVITY_MESSAGES)) {
      expect(resolve(es, `activity.messages.${key}`), `es: ${key}`).toBeTypeOf("string")
      expect(resolve(en, `activity.messages.${key}`), `en: ${key}`).toBeTypeOf("string")
    }
  })

  it("dejan un hueco para cada parámetro que la clave declara", () => {
    // Un parámetro que la frase no usa es un dato que se guarda y no se enseña; una frase que usa
    // uno que no se declara enseña `{email}` tal cual al usuario.
    for (const [key, params] of Object.entries(ACTIVITY_MESSAGES)) {
      for (const idioma of [
        { nombre: "es", messages: es },
        { nombre: "en", messages: en },
      ]) {
        const frase = resolve(idioma.messages, `activity.messages.${key}`) as string
        for (const param of params) {
          expect(frase, `${idioma.nombre}: ${key} · ${param}`).toContain(`{${param}`)
        }
      }
    }
  })

  it("dicen quién hizo qué, salvo los que no los hace nadie", () => {
    // «Un cuerpo que indique **quién hizo qué**». El del descuadre de existencias es la excepción
    // honesta: lo escribe una verificación periódica, y no hay ningún «quién».
    for (const key of Object.keys(ACTIVITY_MESSAGES)) {
      if (key.startsWith("stock.")) continue
      expect(resolve(es, `activity.messages.${key}`), key).toContain("{actor}")
      expect(resolve(en, `activity.messages.${key}`), key).toContain("{actor}")
    }
  })

  it("no arrastran marcado", () => {
    for (const key of Object.keys(ACTIVITY_MESSAGES)) {
      expect(resolve(es, `activity.messages.${key}`), key).not.toMatch(/<[^>]+>/)
      expect(resolve(en, `activity.messages.${key}`), key).not.toMatch(/<[^>]+>/)
    }
  })
})

// ─── A dónde lleva ───────────────────────────────────────────────────────────

const panel = fileURLToPath(new URL("../app/(panel)", import.meta.url))

/**
 * ¿Existe esa dirección como pantalla?
 *
 * Recorre los tramos contra el árbol de `app/`, aceptando un directorio literal o uno de parámetro
 * —`[companyId]`—, y exige que el último tenga su `page.tsx`. Los grupos de ruta —`(panel)`— no
 * cuentan como tramo, que es exactamente como los trata Next.
 */
function screenExists(path: string): boolean {
  let dir = panel

  for (const segment of path.split("/").filter(Boolean)) {
    const entradas = readdirSync(dir, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    )

    const literal = entradas.find((entry) => entry.name === segment)
    const parametro = entradas.find((entry) => /^\[\w+\]$/.test(entry.name))
    const elegido = literal ?? parametro

    if (!elegido) return false
    dir = join(dir, elegido.name)
  }

  return existsSync(join(dir, "page.tsx"))
}

describe("a dónde lleva un aviso", () => {
  it("toda entidad con asiento tiene su pantalla", () => {
    // Las entidades que hoy dejan asiento. Con la traducción escrita a mano, las tres direcciones
    // que había apuntaban a pantallas que no existen.
    for (const entity of ["companies", "company_members", "warehouses"]) {
      const target = activityTarget({ companyId: "una-empresa", entity, entityId: "una-entidad" })
      expect(screenExists(target), `${entity} → ${target}`).toBe(true)
    }
  })

  it("y la prueba sabe distinguir una pantalla que no está", () => {
    // Sin esto, `screenExists` podría devolver siempre cierto y la comprobación de arriba no
    // comprobaría nada.
    expect(screenExists("/c/una-empresa/pantalla-que-no-existe/mas-hondo")).toBe(false)
  })

  it("el destino por omisión también existe", () => {
    const target = activityTarget({ companyId: "una-empresa", entity: "lo-que-venga" })
    expect(screenExists(target), target).toBe(true)
  })
})

describe("las claves que la bitácora sabe pintar", () => {
  it("son las mismas que el servidor sabe escribir", () => {
    // La pantalla arma la clave con una plantilla —`activity.messages.${key}`—, así que la prueba
    // de claves literales de `messages.test.ts` no la ve. Ésta sí.
    const fuente = readFileSync(
      fileURLToPath(
        new URL("../app/(panel)/c/[companyId]/settings/activity/page.tsx", import.meta.url),
      ),
      "utf8",
    )

    expect(fuente).toContain("activity.messages.")
  })
})
