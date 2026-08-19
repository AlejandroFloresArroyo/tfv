import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { requireCompany, requireProfile } from "~/lib/session.ts"

/** La guarda de servicio cubre también el constructor de cada sitio. */
export default async function WebsitesLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/websites`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  if (!company.services.some((service) => service.keycode === "websites")) {
    redirect(`/c/${companyId}`)
  }

  return children
}
