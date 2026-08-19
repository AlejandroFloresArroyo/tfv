import { Badge, ItemCard } from "@tfv/ui"
import { Clapperboard } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { Photo } from "~/components/photo.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { ProductionRow } from "./production.ts"
import { CreateProduction, ProductionActions } from "./production-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("productions.title") }
}

export default async function ProductionsPage({
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
  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/productions`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)
  const canCreate = can(company, "productions.productions.create")
  const canEdit = can(company, "productions.productions.edit")
  const canDelete = can(company, "productions.productions.delete")

  const result = await apiGet<PageEnvelope<ProductionRow>>(
    `/companies/${companyId}/productions?${toApiQuery(query)}`,
  )

  const filters: FilterSpec[] = [
    {
      kind: "boolean",
      key: "isPublished",
      label: t("productions.published"),
      trueLabel: t("productions.published"),
      falseLabel: t("productions.unpublished"),
    },
    {
      kind: "dateRange",
      key: "startsOn",
      label: t("productions.startsOn"),
      fromLabel: t("productions.from"),
      toLabel: t("productions.to"),
    },
  ]

  return (
    <PageShell
      title={t("productions.title")}
      subtitle={t("productions.subtitle", { company: company.name })}
      actions={canCreate ? <CreateProduction companyId={companyId} /> : undefined}
    >
      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("productions.searchPlaceholder")}
        emptyTitle={t("productions.empty")}
        emptyBody={t("productions.emptyBody")}
        emptyAction={canCreate ? <CreateProduction companyId={companyId} /> : undefined}
      >
        {(items, view) =>
          items.map((production) => (
            <ItemCard
              key={production.id}
              view={view}
              media={
                <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-sm bg-panel-hover text-content-muted">
                  {(production.imageThumbnailUrl ?? production.imageUrl) ? (
                    <Photo
                      src={(production.imageThumbnailUrl ?? production.imageUrl) as string}
                      className="size-full object-cover"
                    />
                  ) : (
                    <Clapperboard className="size-4" aria-hidden="true" />
                  )}
                </span>
              }
              title={
                <Link
                  href={`/c/${companyId}/productions/${production.id}`}
                  className="rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-focus/40"
                >
                  {production.name}
                </Link>
              }
              subtitle={production.description || undefined}
              meta={
                <>
                  <Badge tone={production.isPublished ? "success" : "neutral"}>
                    {production.isPublished
                      ? t("productions.published")
                      : t("productions.unpublished")}
                  </Badge>
                  <span className="text-body3 text-content-faint">
                    {production.startsOn
                      ? format.dateTime(new Date(production.startsOn), { dateStyle: "medium" })
                      : t("productions.noDates")}
                    {production.endsOn
                      ? ` – ${format.dateTime(new Date(production.endsOn), { dateStyle: "medium" })}`
                      : ""}
                  </span>
                </>
              }
              actions={
                <ProductionActions
                  companyId={companyId}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  production={{
                    id: production.id,
                    name: production.name,
                    description: production.description,
                    slug: production.slug,
                    isPublished: production.isPublished,
                    startsOn: production.startsOn,
                    endsOn: production.endsOn,
                    imageUrl: production.imageUrl,
                  }}
                />
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
