import { Badge, Panel } from "@tfv/ui"
import { ArrowRight } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { PageShell } from "~/components/page-shell.tsx"
import {
  FALLBACK_SERVICE_ICON,
  isKnownService,
  SERVICE_ICONS,
  SERVICE_SLICE,
} from "~/lib/services.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companyId: string }>
}): Promise<Metadata> {
  const { companyId } = await params
  const profile = await requireProfile(`/c/${companyId}`)
  const company = profile.companies.find((candidate) => candidate.id === companyId)

  return { title: company?.name ?? "TFV" }
}

/** Portada de la empresa: qué servicios hay habilitados y cuál se puede abrir. */
export default async function CompanyHomePage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const t = await getTranslations()
  const { companyId } = await params

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  return (
    <PageShell
      title={t("dashboard.welcome", { name: profile.name })}
      subtitle={t("dashboard.subtitle", { company: company.name })}
      actions={company.isOwner ? <Badge tone="accent">{t("shell.owner")}</Badge> : undefined}
    >
      {company.services.length === 0 ? (
        <Panel className="p-6">
          <p className="text-title2 font-bold text-content">{t("dashboard.noServices.title")}</p>
          <p className="mt-1.5 max-w-prose text-body1 text-content-muted">
            {t("dashboard.noServices.body")}
          </p>
        </Panel>
      ) : (
        <ul className="grid gap-3 tablet:grid-cols-2 laptop:grid-cols-3">
          {company.services.map((service) => {
            const Icon = SERVICE_ICONS[service.keycode] ?? FALLBACK_SERVICE_ICON
            const label = isKnownService(service.keycode)
              ? t(`services.${service.keycode}`)
              : service.name

            return (
              <li key={service.keycode}>
                <Link
                  href={`/c/${company.id}/${service.keycode}`}
                  className="group block h-full rounded-md"
                >
                  <Panel className="flex h-full flex-col gap-3 p-5 transition-colors group-hover:border-edge-control group-hover:bg-panel-hover">
                    <span className="grid size-10 place-items-center rounded-sm bg-panel-hover text-content">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>

                    <p className="text-title2 font-bold text-content">{label}</p>

                    <p className="flex-1 text-body2 text-content-faint">
                      {t("dashboard.pendingBody", { slice: SERVICE_SLICE[service.keycode] ?? "—" })}
                    </p>

                    <span className="inline-flex items-center gap-1 text-body3 font-semibold text-content-muted">
                      {t("shell.overview")}
                      <ArrowRight
                        className="size-3 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </span>
                  </Panel>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </PageShell>
  )
}
