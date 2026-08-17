/**
 * Los cuatro papeles de la siembra, y dónde queda guardada la sesión de cada uno.
 *
 * La siembra los creó distintos a propósito: cubren las cuatro vías por las que el sistema concede
 * o niega. Aquí se les da nombre para que una prueba diga «esto lo hace el almacenista» en lugar de
 * repetir un correo.
 *
 * **Se entra una sola vez por papel**, en la preparación, y las pruebas reutilizan las cookies. Con
 * cuatro papeles y varias decenas de pruebas, entrar en cada una multiplicaría la suite por el
 * coste de la derivación de contraseña — que es lento **a propósito**, porque de eso se trata.
 */

import { fileURLToPath } from "node:url"

export const PASSWORD = "Desarrollo.2026"

export const ROLES = {
  /** Administración de plataforma, y miembro de las dos empresas. */
  admin: "admin@tfv.dev",
  /** Propietaria de una sola empresa: elude los permisos, no la pertenencia. */
  owner: "duena@tfv.dev",
  /** Rol acotado: cinco claves de doscientas cincuenta y cinco. */
  limited: "almacenista@tfv.dev",
  /** Sin membresías: el caso del padrón único. */
  outsider: "compradora@tfv.dev",
} as const

export type Role = keyof typeof ROLES

const dir = fileURLToPath(new URL("../.auth/", import.meta.url))

/** Dónde vive la sesión guardada de un papel. */
export function stateFor(role: Role): string {
  return `${dir}${role}.json`
}

/**
 * Lo que la preparación deja escrito para las pruebas.
 *
 * Los identificadores de empresa no se pueden fijar en el código: la siembra los genera. Se
 * resuelven una vez y se pasan por aquí, en lugar de que cada prueba los busque.
 */
export interface Fixture {
  readonly companies: Record<string, string>
}

export const FIXTURE_PATH = `${dir}fixture.json`
