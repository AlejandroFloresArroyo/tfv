import { Avatar, Badge, ItemCard } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import { CounterpartyActions, CreateCounterparty, type Role } from "./counterparty-actions.tsx"

interface CounterpartyRow {
  id: string
  role: "client" | "provider"
  alias: string
  userId: string | null
  counterpartyCompanyId: string | null
  snapshot: Record<string, string>
  createdAt: string
}

/**
 * Los dos papeles son la misma pantalla y **permisos distintos**.
 *
 * Quien lleva las compras no ve por ello la cartera de clientes: son dos claves separadas en el
 * catálogo y dos colecciones separadas en la API. Aquí se comparte el código y **no** el permiso,
 * que es lo único que no se puede compartir.
 */
const ROLES = {
  clients: {
    view: "companies.clients.view",
    create: "companies.clients.create",
    edit: "companies.clients.edit",
    delete: "companies.clients.delete",
  },
  providers: {
    view: "companies.providers.view",
    create: "companies.providers.create",
    edit: "companies.providers.edit",
    delete: "companies.providers.delete",
  },
} as const satisfies Record<Role, Record<string, string>>

function isRole(value: string): value is Role {
  return value === "clients" || value === "providers"
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ role: string }>
}): Promise<Metadata> {
  const { role } = await params
  if (!isRole(role)) return {}

  return { title: (await getTranslations())(`directory.${role}.title`) }
}

export default async function CounterpartiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; role: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { companyId, role } = await params
  if (!isRole(role)) notFound()

  const t = await getTranslations()
  const format = await getFormatter()
  const query = toSearchParams(await searchParams)
  const keys = ROLES[role]

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/directory/${role}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const result = await apiGet<PageEnvelope<CounterpartyRow>>(
    `/companies/${companyId}/${role}?${toApiQuery(query)}`,
  )

  const canCreate = can(company, keys.create)

  const filters: FilterSpec[] = [
    {
      // `?userId=null` responde «los que no están en la plataforma». Es la pregunta que se hace
      // antes de una campaña de invitación, y la que dice cuánta cartera sigue fuera.
      kind: "select",
      key: "userId",
      label: t("directory.account"),
      options: [{ value: "null", label: t("directory.external") }],
    },
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("directory.since"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  return (
    <PageShell
      title={t(`directory.${role}.title`)}
      subtitle={t(`directory.${role}.subtitle`, { company: company.name })}
      actions={canCreate ? <CreateCounterparty companyId={companyId} role={role} /> : undefined}
    >
      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("directory.searchPlaceholder")}
        emptyTitle={t(`directory.${role}.empty`)}
        emptyBody={t(`directory.${role}.emptyBody`)}
        emptyAction={
          canCreate ? <CreateCounterparty companyId={companyId} role={role} /> : undefined
        }
      >
        {(items, view) =>
          items.map((counterparty) => {
            const person = [counterparty.snapshot.name, counterparty.snapshot.lastname]
              .filter(Boolean)
              .join(" ")

            return (
              <ItemCard
                key={counterparty.id}
                view={view}
                media={<Avatar name={counterparty.alias} />}
                title={counterparty.alias}
                subtitle={person || counterparty.snapshot.email || undefined}
                meta={
                  <>
                    {counterparty.counterpartyCompanyId ? (
                      <Badge tone="accent">{t("directory.tenant")}</Badge>
                    ) : counterparty.userId ? (
                      <Badge tone="success">{t("directory.linked")}</Badge>
                    ) : (
                      <Badge>{t("directory.external")}</Badge>
                    )}

                    <span className="text-body3 text-content-faint">
                      {format.dateTime(new Date(counterparty.createdAt), { dateStyle: "medium" })}
                    </span>
                  </>
                }
                actions={
                  <CounterpartyActions
                    companyId={companyId}
                    role={role}
                    canEdit={can(company, keys.edit)}
                    canDelete={can(company, keys.delete)}
                    counterparty={{
                      id: counterparty.id,
                      alias: counterparty.alias,
                      userId: counterparty.userId,
                      snapshot: counterparty.snapshot,
                    }}
                  />
                }
              />
            )
          })
        }
      </Collection>
    </PageShell>
  )
}
