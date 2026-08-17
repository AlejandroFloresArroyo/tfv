/**
 * Identificadores.
 *
 * Ver `openspec/project.md` D-04.
 *
 * Son opacos y ordenables por tiempo: un identificador generado después ordena después, lo que
 * hace que la clave primaria sirva también como orden de inserción y evita índices adicionales.
 *
 * El contrato observable es sólo este: son cadenas, y las lecturas públicas aceptan **identificador
 * o identificador legible** en la misma posición de la ruta. Durante la transición se aceptan
 * además los identificadores de la pila anterior, veinticuatro caracteres hexadecimales, porque
 * están incrustados en URLs ya compartidas con clientes.
 */

import { randomBytes } from "node:crypto"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LEGACY_PATTERN = /^[0-9a-f]{24}$/i

declare const IdBrand: unique symbol
export type Id = string & { readonly [IdBrand]: true }

let lastTimestamp = 0
let sequence = 0

/**
 * Genera un identificador nuevo, ordenable por tiempo.
 *
 * Dentro del mismo milisegundo se usa un contador para que dos identificaciones consecutivas
 * conserven su orden, en lugar de depender del azar.
 */
export function newId(): Id {
  const now = Date.now()

  if (now === lastTimestamp) {
    sequence = (sequence + 1) & 0xfff
  } else {
    lastTimestamp = now
    sequence = randomBytes(2).readUInt16BE(0) & 0xfff
  }

  const bytes = randomBytes(16)

  // 48 bits de marca de tiempo en milisegundos.
  bytes.writeUIntBE(now, 0, 6)

  // Versión 7 en los cuatro bits altos del séptimo octeto, y el contador en los doce siguientes.
  bytes[6] = 0x70 | ((sequence >> 8) & 0x0f)
  bytes[7] = sequence & 0xff

  // Variante en los dos bits altos del noveno octeto.
  bytes[8] = 0x80 | ((bytes[8] as number) & 0x3f)

  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as Id
}

/** ¿Tiene forma de identificador propio? */
export function isId(value: string): value is Id {
  return UUID_PATTERN.test(value)
}

/**
 * ¿Tiene forma de identificador de la pila anterior?
 *
 * Se conserva mientras haya URLs públicas antiguas circulando. Al retirarse, esta función y su
 * tabla de correspondencia desaparecen con ella.
 */
export function isLegacyId(value: string): boolean {
  return LEGACY_PATTERN.test(value)
}

/** Cómo hay que resolver una referencia recibida en una ruta pública. */
export type Reference =
  | { readonly kind: "id"; readonly value: Id }
  | { readonly kind: "legacy"; readonly value: string }
  | { readonly kind: "slug"; readonly value: string }

/**
 * Clasifica una referencia de ruta.
 *
 * Toda lectura pública acepta las tres formas en la misma posición, así que quien resuelve necesita
 * saber contra qué columna buscar.
 */
export function parseReference(raw: string): Reference {
  const value = raw.trim()
  if (isId(value)) return { kind: "id", value: value as Id }
  if (isLegacyId(value)) return { kind: "legacy", value }
  return { kind: "slug", value }
}

/** Extrae el instante de creación embebido en el identificador. Útil para diagnóstico. */
export function timestampOf(id: Id): Date {
  const hex = id.replace(/-/g, "").slice(0, 12)
  return new Date(Number.parseInt(hex, 16))
}
