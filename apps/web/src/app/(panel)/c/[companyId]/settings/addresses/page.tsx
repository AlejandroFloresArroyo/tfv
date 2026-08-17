import { Badge, ItemCard } from "@tfv/ui"
import { MapPin } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import { type AddressSummary, describe } from "./address.ts"
import { AddressActions, CreateAddress } from "./address-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("addresses.title") }
}

/**
 * Libreta de direcciones de la empresa.
 *
 * **La primaria va primero, y es orden del servidor.** Antes se traía la libreta entera y se subía
 * la primaria en memoria; con paginación eso deja de funcionar, porque la primaria puede estar en
 * la página nueve y subirla dentro de la página uno la pondría primera entre las que no lo son.
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

  const result = await apiGet<PageEnvelope<AddressSummary>>(
    `/companies/${companyId}/addresses?${toApiQuery(query)}`,
  )

  const book = { base: `/companies/${companyId}/addresses` }
  const canCreate = can(company, "companies.addresses.create")
  const canEdit = can(company, "companies.addresses.edit")
  const canSetPrimary = can(company, "companies.addresses.primary")
  const canDelete = can(company, "companies.addresses.delete")

  const filters: FilterSpec[] = [
    {
      kind: "boolean",
      key: "isPrimary",
      label: t("addresses.primary"),
      trueLabel: t("addresses.onlyPrimary"),
      falseLabel: t("addresses.exceptPrimary"),
    },
    { kind: "text", key: "city", label: t("addresses.city") },
  ]

  return (
    <PageShell
      title={t("addresses.title")}
      subtitle={t("addresses.subtitle", { company: company.name })}
      actions={canCreate ? <CreateAddress book={book} /> : undefined}
    >
      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("addresses.searchPlaceholder")}
        emptyTitle={t("addresses.empty")}
        emptyBody={t("addresses.emptyBody")}
        emptyAction={canCreate ? <CreateAddress book={book} /> : undefined}
      >
        {(items, view) =>
          items.map((address) => (
            <ItemCard
              key={address.id}
              view={view}
              media={
                <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <MapPin className="size-4" aria-hidden="true" />
                </span>
              }
              title={address.label || describe(address)}
              subtitle={address.label ? describe(address) : undefined}
              meta={
                <>
                  {address.isPrimary ? <Badge tone="accent">{t("addresses.primary")}</Badge> : null}
                  <span className="text-body3 text-content-faint">
                    {[address.state, address.postalCode].filter(Boolean).join(" · ")}
                  </span>
                </>
              }
              actions={
                <AddressActions
                  book={book}
                  address={address}
                  canEdit={canEdit}
                  canSetPrimary={canSetPrimary}
                  canDelete={canDelete}
                />
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
