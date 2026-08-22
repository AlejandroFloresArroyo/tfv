/**
 * JSON extendido de MongoDB → valores de JavaScript.
 *
 * `mongoexport` escribe los tipos de BSON envueltos: `{"$oid": …}`, `{"$date": …}`,
 * `{"$numberLong": …}`. Aquí se desenvuelven una sola vez, para que el resto del paquete trabaje
 * con cadenas, números y fechas y no vuelva a saber de dónde salieron.
 *
 * Dos decisiones:
 *
 * - **`$numberDecimal` se queda como cadena.** Es el tipo de los importes exactos (`Decimal128`),
 *   y convertirlo a número lo pasaría por coma flotante, que es justo lo que el esquema destino
 *   prohíbe.
 * - **`$numberLong` se convierte a número y falla si no cabe.** Los enteros del árbol viejo son
 *   cantidades y centavos; uno que no quepa en un entero seguro no es un dato, es un defecto, y
 *   tiene que verse.
 */

/** Un documento del volcado, ya desenvuelto. */
export type Documento = Record<string, unknown>

const SEGURO = BigInt(Number.MAX_SAFE_INTEGER)

function desenvolverLong(crudo: string): number {
  const valor = BigInt(crudo)
  if (valor > SEGURO || valor < -SEGURO) {
    throw new Error(`$numberLong fuera del rango entero seguro: ${crudo}`)
  }
  return Number(valor)
}

/** Desenvuelve recursivamente un valor de JSON extendido. */
export function desenvolver(valor: unknown): unknown {
  if (valor === null || typeof valor !== "object") return valor
  if (Array.isArray(valor)) return valor.map(desenvolver)

  const objeto = valor as Record<string, unknown>

  if (typeof objeto.$oid === "string") return objeto.$oid
  if ("$date" in objeto) {
    const fecha = objeto.$date
    if (typeof fecha === "string") return new Date(fecha)
    if (fecha !== null && typeof fecha === "object" && "$numberLong" in fecha) {
      return new Date(desenvolverLong((fecha as { $numberLong: string }).$numberLong))
    }
    if (typeof fecha === "number") return new Date(fecha)
    throw new Error(`$date con forma desconocida: ${JSON.stringify(fecha)}`)
  }
  if (typeof objeto.$numberInt === "string") return Number.parseInt(objeto.$numberInt, 10)
  if (typeof objeto.$numberLong === "string") return desenvolverLong(objeto.$numberLong)
  if (typeof objeto.$numberDouble === "string") return Number(objeto.$numberDouble)
  if (typeof objeto.$numberDecimal === "string") return objeto.$numberDecimal

  const resultado: Documento = {}
  for (const [clave, interno] of Object.entries(objeto)) {
    resultado[clave] = desenvolver(interno)
  }
  return resultado
}

/** Analiza una línea de la exportación: JSON → valor desenvuelto. */
export function analizarLinea(linea: string): Documento {
  return desenvolver(JSON.parse(linea)) as Documento
}
