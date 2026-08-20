import { headers } from "next/headers"
import type { ReactNode } from "react"
import { CompanyNav } from "~/components/company-nav.tsx"
import { requireCompany, requireProfile } from "~/lib/session.ts"

/**
 * Ámbito de una empresa.
 *
 * Segunda guarda: **pertenencia**. Sin membresía activa se va al selector de empresas, no a la
 * pantalla de acceso: la sesión es buena, lo que falla es el nivel de abajo.
 */
export default async function CompanyLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  return (
    <div className="empuje-pizarra mx-auto flex w-full max-w-(--breakpoint-desktop) flex-1 flex-col">
      {/* La navegación es la pizarra flotante: no ocupa columna ni fila. El contenido tiene el
          ancho completo en todos los tamaños, que es la razón de ser del cajón. */}
      <CompanyNav company={company} companies={profile.companies} />
      {/* El rincón del asa se reserva abajo: sin esto, el final de una lista larga queda
          escondido debajo de la pastilla. */}
      <div className="flex min-w-0 flex-1 flex-col pb-20">{children}</div>
    </div>
  )
}
