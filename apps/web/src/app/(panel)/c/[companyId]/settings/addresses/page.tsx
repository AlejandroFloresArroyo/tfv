import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { AddressBook } from "~/components/addresses/address-book.tsx"
import { toSearchParams } from "~/components/collection/params.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("addresses.title") }
}

/**
 * Libreta de direcciones de la empresa.
 *
 * La pantalla es `components/addresses`, compartida con la libreta de la persona. Aquí queda lo que
 * de verdad distingue a ésta: de quién cuelga y **quién puede qué**, que en una empresa lo deciden
 * cuatro permisos y en la libreta de alguien no lo decide nadie.
 */
export default async function AddressesPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const { companyId } = await params
  const query = toSearchParams(await searchParams)

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/settings/addresses`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  return (
    <AddressBook
      book={{ kind: "company", base: `/companies/${companyId}/addresses` }}
      title={t("addresses.title")}
      subtitle={t("addresses.subtitle", { company: company.name })}
      emptyBody={t("addresses.emptyBody")}
      query={query}
      permissions={{
        create: can(company, "companies.addresses.create"),
        edit: can(company, "companies.addresses.edit"),
        setPrimary: can(company, "companies.addresses.primary"),
        delete: can(company, "companies.addresses.delete"),
      }}
    />
  )
}
