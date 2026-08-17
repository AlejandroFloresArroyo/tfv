import type { ProfileCompany } from "./session.ts"

/**
 * ¿Ofrecer esta acción?
 *
 * Vive en su propio archivo, separado de las guardas, porque **lo usan componentes de cliente** y
 * `session.ts` importa `next/headers`. Arrastrar eso al navegador rompería la compilación, y
 * arreglarlo a base de excepciones dejaría código de servidor a un paso del paquete servido.
 *
 * Se llama `can` y no `authorize` a propósito: lo que decide es qué se pinta. La autorización
 * ocurre en el servidor de la API, y esto no la sustituye ni la adelanta — la spec de `app-shell`
 * lo dice con esas palabras: ocultar una entrada de navegación no es control de acceso.
 */
export function can(company: ProfileCompany, permission: string): boolean {
  return company.permissions.includes(permission)
}
