import { Badge, Callout, ItemCard } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import type { FilterSpec } from "~/components/collection/params.ts"
import { toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { OperatingProfile, ProfileRow } from "./profile.ts"
import { NewProfile, ProfileActions } from "./profile-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("billing.profiles.title") }
}

/**
 * Perfiles de facturación de la empresa.
 *
 * Lo que esta pantalla tiene que dejar claro de un vistazo es **cuál cobra**, porque es la regla que
 * más se olvida: sólo el primario, y sólo si su cuenta está registrada y en estado activo o
 * limitado. Un perfil activo que no sea el primario no habilita nada, y sin decirlo la pantalla
 * enseñaría un «Activo» verde junto a una tienda que no puede vender.
 *
 * Por eso el aviso de arriba no habla de un perfil sino de la empresa: responde a «¿puedo cobrar?»,
 * que es la pregunta con la que se entra aquí.
 */
export default async function BillingProfilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId } = await params
  const query = toSearchParams(await searchParams)

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/settings/billing`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const [result, operatingResult] = await Promise.all([
    apiGet<PageEnvelope<ProfileRow>>(
      `/companies/${companyId}/billing-profiles?${toApiQuery(query)}`,
    ),
    apiGet<OperatingProfile>(`/companies/${companyId}/billing-profiles/operating`),
  ])

  const operating = operatingResult.ok ? operatingResult.data : null

  const canCreate = can(company, "companies.billings.create")
  const canEdit = can(company, "companies.billings.edit")
  const canSetPrimary = can(company, "companies.billings.primary")
  const canDelete = can(company, "companies.billings.delete")

  const filters: FilterSpec[] = [
    {
      kind: "select",
      key: "status",
      label: t("billing.profiles.statusLabel"),
      options: (["pending", "limited", "active", "inactive"] as const).map((value) => ({
        value,
        label: t(`billing.profiles.status.${value}`),
      })),
    },
    {
      kind: "boolean",
      key: "isPrimary",
      label: t("billing.profiles.primary"),
      trueLabel: t("billing.profiles.primary"),
      falseLabel: t("collection.any"),
    },
  ]

  return (
    <PageShell
      title={t("billing.profiles.title")}
      subtitle={t("billing.profiles.subtitle", { company: company.name })}
      actions={canCreate ? <NewProfile companyId={companyId} /> : undefined}
    >
      {operating?.exists ? (
        <Callout tone={operating.canCharge ? "success" : "warning"} className="mb-5">
          {operating.canCharge
            ? t("billing.profiles.canCharge")
            : t("billing.profiles.operatingNone")}
        </Callout>
      ) : null}

      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("common.search")}
        emptyTitle={t("billing.profiles.empty")}
        emptyBody={t("billing.profiles.emptyBody")}
      >
        {(items, view) =>
          items.map((row) => (
            <ItemCard
              key={row.id}
              view={view}
              title={row.alias}
              subtitle={row.business.legalName}
              meta={
                <>
                  {row.isPrimary ? (
                    <Badge tone="accent">{t("billing.profiles.primary")}</Badge>
                  ) : null}
                  <Badge tone={row.status === "active" ? "success" : "neutral"}>
                    {t(`billing.profiles.status.${row.status}`)}
                  </Badge>
                  <Badge tone={row.verificationStatus === "verified" ? "success" : "warning"}>
                    {t(`billing.profiles.verification.${row.verificationStatus}`)}
                  </Badge>
                  <span className="text-body3 text-content-faint">
                    {format.dateTime(new Date(row.createdAt), { dateStyle: "medium" })}
                  </span>
                </>
              }
              actions={
                <ProfileActions
                  companyId={companyId}
                  profile={row}
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
