/**
 * El contexto de una corrida de trasvase.
 *
 * Reúne lo que toda rutina necesita: la conexión al destino, el volcado del que se lee, y el
 * registro —correspondencia, cuarentena, incidencias—. La URL de la base y el directorio del
 * volcado llegan de fuera; aquí no hay rutas ni secretos.
 *
 * Cada rutina corre dentro de **una transacción**: las filas destino, la correspondencia y la
 * cuarentena se escriben juntas o no se escribe ninguna. Un fallo a mitad deja la base como
 * estaba, que es la propiedad que a la pila anterior le faltaba (`DEFECTS.md` M-02).
 */

import * as esquema from "@tfv/db/schema"
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Sql } from "postgres"
import { prepararEsquemaTrasvase, Registro } from "../destino/registro.ts"
import type { Volcado } from "../volcado/leer.ts"

export type BaseDestino = PostgresJsDatabase<typeof esquema>

/** La transacción de drizzle: misma superficie de consulta que la base. */
export type TransaccionDestino = Parameters<Parameters<BaseDestino["transaction"]>[0]>[0]

export interface Contexto {
  readonly sql: Sql
  readonly db: BaseDestino
  readonly volcado: Volcado
  readonly registro: Registro
}

export async function abrirContexto(sql: Sql, volcado: Volcado): Promise<Contexto> {
  await prepararEsquemaTrasvase(sql)
  const registro = await Registro.abrir(sql)
  return { sql, db: drizzle(sql, { schema: esquema }), volcado, registro }
}

/** Ejecuta una rutina dentro de una transacción, con el registro incluido en ella. */
export async function enTransaccion(
  contexto: Contexto,
  rutina: (db: TransaccionDestino) => Promise<void>,
): Promise<void> {
  await contexto.db.transaction(async (tx) => {
    await rutina(tx)
    await contexto.registro.guardar(tx)
  })
}

/** Recorta a la longitud de la columna destino, con incidencia si algo se pierde. */
export function recortar(
  contexto: Contexto,
  coleccion: string,
  idViejo: string,
  campo: string,
  valor: string,
  maximo: number,
): string {
  if (valor.length <= maximo) return valor
  contexto.registro.incidencia(
    coleccion,
    idViejo,
    campo,
    `Recortado a ${maximo} caracteres; medía ${valor.length}`,
  )
  return valor.slice(0, maximo)
}

/** El texto de un campo del documento, o la alternativa. */
export function texto(valor: unknown, alternativa = ""): string {
  return typeof valor === "string" ? valor : alternativa
}

/** La fecha de un campo del documento, o la alternativa. */
export function fecha(valor: unknown): Date | null {
  return valor instanceof Date ? valor : null
}

/** Las marcas de tiempo del documento viejo, conservadas en el destino. */
export function marcasDe(doc: Record<string, unknown>): { createdAt: Date; updatedAt: Date } {
  const creado = fecha(doc.createdAt) ?? new Date()
  return { createdAt: creado, updatedAt: fecha(doc.updatedAt) ?? creado }
}

/** El `_id` del documento, que todo documento exportado trae. */
export function idDe(doc: Record<string, unknown>): string {
  const id = doc._id
  if (typeof id !== "string" || id === "") {
    throw new Error(`Documento sin _id: ${JSON.stringify(doc).slice(0, 120)}`)
  }
  return id
}
