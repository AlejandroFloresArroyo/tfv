import { headers } from "next/headers"
import type { ReactNode } from "react"
import { PlatformNav } from "~/components/platform-nav.tsx"
import { requirePlatformAdmin, requireProfile } from "~/lib/session.ts"

/**
 * Ámbito de la administración de plataforma.
 *
 * La cuarta guarda de `app-shell`, y la más delicada de las cuatro: lo que hay debajo **atraviesa a
 * todos los arrendatarios**. Sin la marca se va al panel, no a la pantalla de acceso — la sesión es
 * buena, lo que falta es el papel.
 *
 * Vive en el armazón y no en cada pantalla a propósito: una pantalla nueva bajo `/platform` nace
 * protegida sin que su autor tenga que acordarse, que es la misma propiedad que `defineRoute` da en
 * el servidor. Olvidarse del gancho ruta por ruta es como sesenta y nueve de noventa y un módulos
 * de la pila anterior acabaron sin autenticación.
 *
 * **Y aun así esto no es lo que protege.** Cada ruta de la API comprueba la misma marca por su
 * cuenta y responde `403`; esto sólo evita servir una página que su lector no va a poder usar.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get("x-pathname") ?? "/platform"
  const profile = await requireProfile(path)
  requirePlatformAdmin(profile)

  return (
    <div className="mx-auto flex w-full max-w-(--breakpoint-desktop) flex-1 flex-col">
      <PlatformNav />
      {/* El rincón del asa se reserva abajo: sin esto, el final de una lista larga queda
          escondido debajo de la pastilla. */}
      <div className="flex min-w-0 flex-1 flex-col pb-20">{children}</div>
    </div>
  )
}
