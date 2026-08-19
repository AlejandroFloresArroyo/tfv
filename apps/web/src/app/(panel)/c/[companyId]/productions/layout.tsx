import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { requireCompany, requireProfile } from "~/lib/session.ts"

/** La guarda de servicio cubre también el panel, la taxonomía y los planes de trabajo. */
export default async function ProductionsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/productions`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  if (!company.services.some((service) => service.keycode === "productions")) {
    redirect(`/c/${companyId}`)
  }

  return children
}
