import { Avatar, Badge, ItemCard } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"

interface ActivityRow {
  id: string
  action: "create" | "update" | "delete"
  entity: string
  entityLabel: string
  title: string
  url: string
  performedBy: string
  performedAsPlatformAdmin: boolean
  createdAt: string
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("activity.title") }
}

/**
 * La bitácora de la empresa.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md`. Es la primera pantalla que enseña algo
 * que **no se puede cambiar desde ninguna otra**: los asientos son de sólo anexado, así que aquí no
 * hay acciones. Una fila sin botones es rara hasta que se entiende qué es esta lista.
 *
 * La marca de administración de plataforma se pinta aparte y a propósito: distinguir lo que hizo
 * soporte de lo que hizo el cliente es la pregunta que se hace cuando algo apareció sin que nadie
 * de la empresa lo recuerde.
 */
export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { companyId } = await params
  const t = await getTranslations()
  const format = await getFormatter()
  const query = toSearchParams(await searchParams)

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/settings/activity`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const result = await apiGet<PageEnvelope<ActivityRow>>(
    `/companies/${companyId}/activity?${toApiQuery(query)}`,
  )

  const filters: FilterSpec[] = [
    {
      kind: "select",
      key: "action",
      label: t("activity.action"),
      options: [
        { value: "create", label: t("activity.actions.create") },
        { value: "update", label: t("activity.actions.update") },
        { value: "delete", label: t("activity.actions.delete") },
      ],
    },
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("activity.when"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  const tone = { create: "success", update: "accent", delete: "danger" } as const

  return (
    <PageShell
      title={t("activity.title")}
      subtitle={t("activity.subtitle", { company: company.name })}
    >
      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("activity.searchPlaceholder")}
        defaultView="list"
        emptyTitle={t("activity.empty")}
        emptyBody={t("activity.emptyBody")}
      >
        {(items, view) =>
          items.map((entry) => (
            <ItemCard
              key={entry.id}
              view={view}
              media={<Avatar name={entry.performedBy || "?"} />}
              title={entry.title}
              subtitle={entry.performedBy || undefined}
              meta={
                <>
                  <Badge tone={tone[entry.action]}>{t(`activity.actions.${entry.action}`)}</Badge>

                  {entry.performedAsPlatformAdmin ? (
                    <Badge tone="warning">{t("activity.byPlatform")}</Badge>
                  ) : null}

                  <span className="text-body3 text-content-faint">
                    {format.dateTime(new Date(entry.createdAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </>
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
