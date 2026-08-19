import { Badge } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { SECTION_PRODUCT_SAMPLE } from "~/components/site/page.ts"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { CustomizationRow, WebsiteRow } from "../site.ts"
import { Builder } from "./builder.tsx"

/**
 * El constructor de un sitio.
 *
 * Los datos se cargan aquí —en el servidor, con la cookie de quien navega— y el constructor recibe
 * un punto de partida. El catálogo de la muestra viene de **las mismas rutas públicas que sirven la
 * tienda**: las secciones de catálogo leen de la fuente, y pedirlas por otro camino sería enseñar
 * en la vista previa una lista que la tienda compone de otra manera.
 *
 * Un sitio sin publicar no tiene catálogo público que enseñar, y entonces la muestra viene vacía.
 * La sección lo dice con su estado vacío, igual que lo diría la tienda; el aviso de que falta
 * publicar va fuera del marco, en la pantalla, para que dentro no haya un texto que la tienda no
 * tenga.
 */

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("websites.builder.title") }
}

interface Envelope<T> {
  items: T[]
}

interface ProductCard {
  id: string
  slug: string | null
  name: string
  price: string | null
  coverUrl: string | null
}

export default async function BuilderPage({
  params,
}: {
  params: Promise<{ companyId: string; websiteId: string }>
}) {
  const t = await getTranslations()
  const { companyId, websiteId } = await params
  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/websites/${websiteId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const site = await apiGet<WebsiteRow>(`/companies/${companyId}/websites/${websiteId}`)
  if (!site.ok) {
    return (
      <PageShell title={t("websites.builder.title")}>
        <ApiFailure result={site} />
      </PageShell>
    )
  }

  const customizations = await apiGet<Envelope<CustomizationRow>>(
    `/companies/${companyId}/websites/${websiteId}/customizations`,
  )
  if (!customizations.ok) {
    return (
      <PageShell title={site.data.name}>
        <ApiFailure result={customizations} />
      </PageShell>
    )
  }

  const slug = encodeURIComponent(site.data.slug)
  const resolution = await apiGet<{
    status: string
    site?: { categories: { id: string; name: string }[] }
  }>(`/public/sites/${slug}`)
  const products = await apiGet<{ items: ProductCard[] }>(
    `/public/sites/${slug}/products?limit=${SECTION_PRODUCT_SAMPLE}`,
  )

  return (
    <PageShell
      title={site.data.name}
      subtitle={site.data.address}
      actions={
        <Badge tone={site.data.isPublished ? "success" : "neutral"}>
          {site.data.isPublished ? t("websites.published") : t("websites.unpublished")}
        </Badge>
      }
    >
      <Builder
        companyId={companyId}
        site={site.data}
        customizations={customizations.data.items}
        catalog={{
          categories:
            resolution.ok && resolution.data.status === "ready"
              ? (resolution.data.site?.categories ?? [])
              : [],
          products: products.ok ? products.data.items : [],
        }}
        canEdit={can(company, "websites.customizes.edit")}
        canCreate={can(company, "websites.customizes.create")}
        canDelete={can(company, "websites.customizes.delete")}
      />
    </PageShell>
  )
}
