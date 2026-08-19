import { Badge, ItemCard } from "@tfv/ui"
import { Building2 } from "lucide-react"
import type { Metadata } from "next"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { CompanyMembers, type PlatformCompanyRow } from "./company-members.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("platform.companies.title") }
}

/**
 * El padrón de empresas.
 *
 * **De sólo lectura, y a propósito.** Mirar los datos de una empresa desde plataforma es una cosa;
 * cambiarlos es otra decisión, que hoy ni siquiera tiene clave de permiso que la respalde. Mientras
 * no se tome, aquí no hay ningún botón que escriba.
 *
 * Las empresas dadas de baja **siguen apareciendo**, marcadas. Un padrón que las esconde no puede
 * responder a «¿qué pasó con aquélla?», que es media razón de tener padrón.
 */
export default async function PlatformCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const query = toSearchParams(await searchParams)

  const result = await apiGet<PageEnvelope<PlatformCompanyRow>>(
    `/platform/companies?${toApiQuery(query)}`,
  )

  const filters: FilterSpec[] = [
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("platform.companies.registered"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  return (
    <PageShell title={t("platform.companies.title")} subtitle={t("platform.companies.subtitle")}>
      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("platform.companies.searchPlaceholder")}
        defaultView="list"
        emptyTitle={t("platform.companies.empty")}
      >
        {(items, view) =>
          items.map((company) => (
            <ItemCard
              key={company.id}
              view={view}
              media={
                <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <Building2 className="size-4.5" aria-hidden="true" />
                </span>
              }
              title={company.name}
              subtitle={company.email ?? undefined}
              meta={
                <>
                  {company.deletedAt ? (
                    <Badge tone="danger">{t("platform.companies.deleted")}</Badge>
                  ) : null}

                  <Badge>{t("platform.companies.members", { count: company.memberCount })}</Badge>

                  {/*
                    La comisión que la plataforma retiene sobre sus ventas. Sólo la mueve la
                    administración de plataforma, y este padrón es donde se comparan unas con otras
                    — que es la pregunta que se hace al revisarla.

                    Con el formateador y no pegando un «%» a la cifra guardada, igual que en la
                    pantalla de la empresa: `12.5000 %` enseña cuatro decimales que nadie escribió.
                  */}
                  <Badge tone="accent">
                    {t("platform.companies.commission", {
                      rate: format.number(Number(company.commissionRate) / 100, {
                        style: "percent",
                        maximumFractionDigits: 2,
                      }),
                    })}
                  </Badge>

                  <span className="text-body3 text-content-faint">
                    {format.dateTime(new Date(company.createdAt), { dateStyle: "medium" })}
                  </span>
                </>
              }
              actions={<CompanyMembers company={company} />}
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
