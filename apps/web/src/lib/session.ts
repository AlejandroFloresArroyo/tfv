import { redirect } from "next/navigation"
import { apiGet } from "./api.server.ts"

/**
 * Las guardas del panel, resueltas en el servidor.
 *
 * Ver `openspec/specs/app-shell/spec.md`. Son tres, anidadas, y **fallar una lleva al nivel
 * inmediatamente superior, nunca a la raíz**: sin sesión se va a acceder, sin membresía al selector
 * de empresas, sin servicio a la portada de la empresa.
 *
 * Se resuelven antes de pintar. Comprobar en el cliente significaría mandar la página del panel a
 * alguien que no debe verla y retirarla después, que es a la vez un parpadeo y una filtración de la
 * forma de la pantalla.
 *
 * **Esto no sustituye al guardián del servidor de la API.** Ocultar y proteger son cosas distintas;
 * la spec lo dice con esas palabras. Quien escriba la dirección a mano llega igualmente a una API
 * que comprueba por su cuenta.
 */

export interface ProfileService {
  readonly keycode: string
  readonly name: string
}

export interface ProfileCompany {
  readonly id: string
  readonly name: string
  readonly isOwner: boolean
  readonly services: readonly ProfileService[]
  /**
   * Lo que esta persona puede hacer aquí, resuelto por el servidor.
   *
   * **Sirve para no ofrecer, no para proteger.** La spec lo dice con esas palabras: ocultar una
   * entrada de navegación no es control de acceso. Quien escriba la dirección a mano se topa
   * igualmente con el guardián. Usarlo para decidir qué se pinta está bien; darlo por suficiente,
   * no.
   */
  readonly permissions: readonly string[]
}

export interface Profile {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly lastname: string
  readonly username: string
  readonly isPlatformAdmin: boolean
  readonly emailVerified: boolean
  readonly companies: readonly ProfileCompany[]
}

/** El perfil, o `null` si no hay sesión. No redirige: quien decide es la pantalla. */
export async function readProfile(): Promise<Profile | null> {
  const result = await apiGet<Profile>("/auth/me")
  return result.ok ? result.data : null
}

/**
 * Exige sesión.
 *
 * Conserva el destino en `next` para volver a él tras entrar, que es lo que la spec pide con «Tras
 * iniciar sesión, el usuario SHALL volver a la ruta que intentaba abrir».
 */
export async function requireProfile(currentPath: string): Promise<Profile> {
  const profile = await readProfile()
  if (profile) return profile

  redirect(`/login?next=${encodeURIComponent(currentPath)}`)
}

/** Exige membresía activa en la empresa. Sin ella, al selector. */
export function requireCompany(profile: Profile, companyId: string): ProfileCompany {
  const company = profile.companies.find((candidate) => candidate.id === companyId)
  if (company) return company

  redirect("/companies")
}

/**
 * Exige la marca de administración de plataforma. Sin ella, al panel.
 *
 * Es la cuarta guarda de `app-shell`: «Las rutas de administración de plataforma SHALL exigir que
 * el usuario esté marcado como administrador de plataforma, y SHALL redirigir al panel cuando no lo
 * esté». Al panel y no a la pantalla de acceso: la sesión es buena, lo que falta es el papel.
 *
 * **Y esto tampoco protege nada**, igual que las otras tres. Lo que protege es el servidor de la
 * API, que comprueba la misma marca por su cuenta y responde `403` a quien escriba la dirección.
 * Aquí sólo se evita servirle la página a alguien que no va a poder usarla.
 */
export function requirePlatformAdmin(profile: Profile): void {
  if (profile.isPlatformAdmin) return

  redirect("/dashboard")
}

// `can()` vive en `./can.ts`: lo usan componentes de cliente y este archivo no puede llegar al
// navegador — importa `next/headers` a través de la capa de transporte.

/**
 * Adónde va alguien que acaba de entrar.
 *
 * Con una sola empresa se salta el selector: elegir entre una opción no es elegir.
 *
 * **Sin ninguna va al selector, no a su cuenta.** Antes iba a la cuenta porque era lo único que esa
 * persona podía hacer hasta que la invitaran; desde que puede crear una empresa, mandarla a su
 * perfil la deja mirando una pantalla sin salida.
 */
export function landingPath(profile: Profile): string {
  const [first, second] = profile.companies
  if (second) return "/companies"
  if (first) return `/c/${first.id}`
  return "/companies"
}

/**
 * Comprueba que el destino de vuelta es una ruta de esta aplicación.
 *
 * Sin esto, `?next=https://otro-sitio` convierte la pantalla de acceso en un trampolín: el enlace
 * lleva el dominio real, el usuario entra confiado y acaba en otro sitio con aspecto parecido.
 */
export function safeNext(next: string | undefined, fallback: string): string {
  if (!next) return fallback
  // Sólo caminos absolutos de este origen. `//otro.com` es una dirección de red completa aunque
  // empiece por barra, así que la doble barra queda fuera.
  if (!next.startsWith("/") || next.startsWith("//")) return fallback
  return next
}
