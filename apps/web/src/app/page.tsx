import { redirect } from "next/navigation"
import { landingPath, readProfile } from "~/lib/session.ts"

/**
 * Raíz.
 *
 * **Provisional.** Según `app-shell` la raíz es la superficie de marketing, abierta a cualquiera.
 * Esa portada no forma parte de esta rebanada, así que por ahora reparte: al panel con sesión, a la
 * pantalla de acceso sin ella.
 */
export default async function RootPage() {
  const profile = await readProfile()
  redirect(profile ? landingPath(profile) : "/login")
}
