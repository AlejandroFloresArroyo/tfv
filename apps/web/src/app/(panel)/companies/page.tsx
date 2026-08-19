import { Badge, Button, Panel } from "@tfv/ui"
import { ArrowRight, Building2 } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { PageShell } from "~/components/page-shell.tsx"
import { FALLBACK_SERVICE_ICON, isKnownService, SERVICE_ICONS } from "~/lib/services.ts"
import { requireProfile } from "~/lib/session.ts"
import { CreateCompany } from "./create-company.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("companies.title") }
}

/**
 * Selector de empresa.
 *
 * También es la pantalla a la que caen las guardas de abajo cuando alguien abre la ruta de una
 * empresa a la que no pertenece.
 */
export default async function CompaniesPage() {
  const t = await getTranslations()
  const path = (await headers()).get("x-pathname") ?? "/companies"
  const profile = await requireProfile(path)

  if (profile.companies.length === 0) {
    return (
      <PageShell title={t("companies.empty.title")} actions={<CreateCompany />}>
        <Panel className="flex flex-col items-start gap-4 p-6">
          <p className="max-w-prose text-body1 text-content-muted">{t("companies.empty.body")}</p>
          <Button asChild variant="secondary">
            <Link href="/account">{t("companies.empty.action")}</Link>
          </Button>
        </Panel>
      </PageShell>
    )
  }

  return (
    <PageShell
      title={t("companies.title")}
      subtitle={t("companies.subtitle")}
      actions={<CreateCompany />}
    >
      <ul className="grid gap-3 tablet:grid-cols-2">
        {profile.companies.map((company) => (
          <li key={company.id}>
            <Link
              href={`/c/${company.id}`}
              className="group block h-full rounded-md focus-visible:outline-2"
            >
              <Panel className="flex h-full flex-col gap-4 p-5 transition-colors group-hover:border-edge-control group-hover:bg-panel-hover">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                      <Building2 className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-title2 font-bold text-content">{company.name}</p>
                      <p className="text-body3 text-content-faint">
                        {t("companies.servicesCount", { count: company.services.length })}
                      </p>
                    </div>
                  </div>

                  <ArrowRight
                    className="mt-2.5 size-4 shrink-0 text-content-faint transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {company.isOwner ? <Badge tone="accent">{t("shell.owner")}</Badge> : null}
                  {company.services.map((service) => {
                    const Icon = SERVICE_ICONS[service.keycode] ?? FALLBACK_SERVICE_ICON
                    return (
                      <Badge key={service.keycode}>
                        <Icon className="mr-1 size-3" aria-hidden="true" />
                        {/* Un servicio que la interfaz no conoce se muestra con el nombre que
                            venga de la API: es mejor que una clave sin traducir. */}
                        {isKnownService(service.keycode)
                          ? t(`services.${service.keycode}`)
                          : service.name}
                      </Badge>
                    )
                  })}
                </div>
              </Panel>
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  )
}
