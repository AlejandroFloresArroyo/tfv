import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { landingPath, requireProfile } from "~/lib/session.ts"

/**
 * Reparto tras entrar.
 *
 * No pinta nada: decide. Quién va al selector, quién va directo a su única empresa y quién va a su
 * cuenta depende de las membresías, y eso sólo se sabe con el perfil en la mano — que es
 * información que la pantalla de acceso no tiene ni tiene por qué tener.
 */
export default async function DashboardPage() {
  const path = (await headers()).get("x-pathname") ?? "/dashboard"
  const profile = await requireProfile(path)

  redirect(landingPath(profile))
}
