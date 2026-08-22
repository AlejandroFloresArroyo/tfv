/**
 * El orquestador: las rutinas de dominio, en el orden de dependencia.
 *
 * Archivos primero —no dependen de nadie y todo el mundo apunta a ellos—, luego el núcleo, luego
 * facturación. Cada rutina es transaccional e idempotente por sí sola; correrlas todas otra vez es
 * seguro, y correr una sola también: las referencias hacia dominios sin migrar se sueltan con
 * incidencia en lugar de romper.
 */

import type { Contexto } from "./contexto.ts"
import { trasvasarArchivos } from "./archivos.ts"
import { trasvasarFacturacion } from "./facturacion.ts"
import { trasvasarNucleo } from "./nucleo.ts"

export interface Dominio {
  readonly nombre: string
  readonly rutina: (contexto: Contexto) => Promise<void>
}

/** En orden de dependencia. Los dominios que faltan se añaden aquí cuando existan. */
export const DOMINIOS: readonly Dominio[] = [
  { nombre: "archivos", rutina: trasvasarArchivos },
  { nombre: "nucleo", rutina: trasvasarNucleo },
  { nombre: "facturacion", rutina: trasvasarFacturacion },
]

export async function correrTrasvase(contexto: Contexto): Promise<void> {
  for (const dominio of DOMINIOS) {
    await dominio.rutina(contexto)
  }
}
