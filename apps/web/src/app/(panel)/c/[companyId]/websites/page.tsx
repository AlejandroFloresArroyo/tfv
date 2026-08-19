import { Badge, Panel } from "@tfv/ui"
import { ExternalLink, Globe } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { WebsiteRow } from "./site.ts"
import { CreateWebsite, PublishSwitch } from "./site-actions.tsx"

/**
 * Los sitios de una empresa.
 *
 * Es la puerta del constructor, y por eso enseña las dos cosas que hacen falta para saber si un
 * sitio está vivo: **su dirección**, que es donde se abre, y **si está publicado**, que es lo que
 * decide si esa dirección sirve algo. El resto —el tema, las secciones— vive dentro.
 */

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("websites.title") }
}

interface Envelope<T> {
  items: T[]
}

export default async function WebsitesPage({ params }: { params: Promise<{ companyId: string }> }) {
  const t = await getTranslations()
  const { companyId } = await params
  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/websites`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canCreate = can(company, "websites.websites.create")
  const canEdit = can(company, "websites.websites.edit")
  const canBuild = can(company, "websites.customizes.view")

  const result = await apiGet<Envelope<WebsiteRow>>(`/companies/${companyId}/websites`)
  const warehouses = await apiGet<Envelope<{ id: string; name: string }>>(
    `/companies/${companyId}/warehouses`,
  )
  /**
   * La categoría que declara la vertical de almacén.
   *
   * La vertical **se declara con la categoría del sitio**, y la clave estable es lo que el código
   * reconoce. Se busca en lugar de escribir un identificador: la taxonomía global la administra la
   * plataforma, y un identificador fijo aquí sería una copia que se rompe al resembrar.
   */
  const categories = await apiGet<Envelope<{ id: string; keyname: string | null }>>(
    "/categories?service=websites",
  )
  const vertical = categories.ok
    ? (categories.data.items.find((entry) => entry.keyname === "warehouse-store")?.id ?? null)
    : null

  const create = canCreate ? (
    <CreateWebsite
      companyId={companyId}
      warehouses={warehouses.ok ? warehouses.data.items : []}
      verticalId={vertical}
    />
  ) : undefined

  return (
    <PageShell
      title={t("websites.title")}
      subtitle={t("websites.subtitle", { company: company.name })}
      actions={create}
    >
      {!result.ok ? (
        <ApiFailure result={result} />
      ) : result.data.items.length === 0 ? (
        <Panel className="flex flex-col items-start gap-3 p-6">
          <Globe className="size-6 text-content-faint" aria-hidden="true" />
          <p className="text-body1 font-semibold text-content">{t("websites.empty")}</p>
          <p className="text-body2 text-content-muted">{t("websites.emptyBody")}</p>
          {create}
        </Panel>
      ) : (
        <ul className="flex flex-col gap-3">
          {result.data.items.map((site) => (
            <li key={site.id}>
              <Panel className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body1 font-semibold text-content">
                    {canBuild ? (
                      <Link
                        href={`/c/${companyId}/websites/${site.id}`}
                        className="rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-focus/40"
                      >
                        {site.name}
                      </Link>
                    ) : (
                      site.name
                    )}
                  </p>
                  <a
                    href={site.address}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-body3 text-content-muted hover:underline"
                  >
                    {site.address}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </div>

                <Badge tone={site.isPublished ? "success" : "neutral"}>
                  {site.isPublished ? t("websites.published") : t("websites.unpublished")}
                </Badge>

                {canEdit ? (
                  <PublishSwitch
                    companyId={companyId}
                    websiteId={site.id}
                    isPublished={site.isPublished}
                    label={t("websites.publish")}
                  />
                ) : null}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}
