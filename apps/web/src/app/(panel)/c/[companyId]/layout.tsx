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
    <div className="mx-auto flex w-full max-w-(--breakpoint-desktop) flex-1 flex-col laptop:flex-row">
      <CompanyNav company={company} companies={profile.companies} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
