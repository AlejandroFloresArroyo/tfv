import { Badge, Panel, Separator } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { isKnownService } from "~/lib/services.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import { CompanyActions, type CompanyRecord } from "./company-actions.tsx"

interface CompanyDetail extends CompanyRecord {
  createdAt: string
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("companies.manage.title") }
}

/**
 * Datos de la empresa, y su gestión.
 *
 * Vive en configuración y no en el selector porque es la pantalla **de una empresa**: quien tiene
 * una sola nunca pasa por el selector —se lo salta al entrar— y ahí no habría encontrado nunca
 * cómo editarla. Al lado de miembros, roles y direcciones es donde se busca.
 *
 * Los datos vienen de la API y no del perfil aunque el nombre esté en los dos: el perfil trae lo
 * justo para pintar la cáscara, y la descripción, el correo y la comisión sólo están aquí.
 */
export default async function CompanySettingsPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId } = await params

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/settings/company`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const result = await apiGet<CompanyDetail>(`/companies/${companyId}`)

  if (!result.ok) {
    return (
      <PageShell
        title={t("companies.manage.title")}
        subtitle={t("companies.manage.subtitle", { company: company.name })}
      >
        <ApiFailure result={result} />
      </PageShell>
    )
  }

  const detail = result.data
  const services = company.services.map((service) =>
    isKnownService(service.keycode) ? t(`services.${service.keycode}`) : service.name,
  )

  const rows = [
    { label: t("companies.name"), value: detail.name },
    { label: t("companies.description"), value: detail.description || "—" },
    { label: t("companies.email"), value: detail.email ?? "—" },
    {
      label: t("companies.manage.commission"),
      // Con el formateador y no pegando un «%» a la cifra guardada: `12.5000 %` enseña cuatro
      // decimales que nadie escribió, y el separador lo pone el idioma.
      value: format.number(Number(detail.commissionRate) / 100, {
        style: "percent",
        maximumFractionDigits: 2,
      }),
    },
    {
      label: t("companies.manage.created"),
      value: format.dateTime(new Date(detail.createdAt), { dateStyle: "medium" }),
    },
  ]

  return (
    <PageShell
      title={t("companies.manage.title")}
      subtitle={t("companies.manage.subtitle", { company: detail.name })}
      actions={
        <CompanyActions
          company={detail}
          services={services}
          isPlatformAdmin={profile.isPlatformAdmin}
          canEdit={can(company, "companies.companies.edit")}
          canDelete={can(company, "companies.companies.delete")}
        />
      }
    >
      <div className="grid gap-4 laptop:grid-cols-2">
        <Panel className="p-5">
          <h2 className="text-title2 font-bold text-content">{t("companies.manage.data")}</h2>
          <Separator className="my-4" />

          <dl className="flex flex-col gap-3">
            {rows.map((row) => (
              <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-body2 text-content-faint">{row.label}</dt>
                <dd className="min-w-0 text-body1 font-medium break-words text-content">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel className="flex flex-col p-5">
          <h2 className="text-title2 font-bold text-content">{t("companies.manage.services")}</h2>
          <Separator className="my-4" />

          {services.length === 0 ? (
            <p className="text-body2 text-content-muted">{t("companies.manage.noServices")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {services.map((service) => (
                <Badge key={service}>{service}</Badge>
              ))}
            </div>
          )}

          {/* Quién los habilita, dicho una vez: es la respuesta a «¿y esto dónde se cambia?», que
              sin ella se busca por toda la configuración. */}
          <p className="mt-4 text-body3 text-content-faint">{t("companies.manage.servicesHint")}</p>
        </Panel>
      </div>
    </PageShell>
  )
}
