import { Avatar, Badge, ItemCard } from "@tfv/ui"
import type { Metadata } from "next"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"

interface PlatformActivityRow {
  id: string
  action: "create" | "update" | "delete"
  entity: string
  entityId: string | null
  entityLabel: string
  title: string
  description: string
  performedBy: string
  createdAt: string
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("platform.activity.title") }
}

/**
 * La bitácora de la administración de plataforma.
 *
 * Aquí no hay ninguna acción, y no por falta de tiempo: los asientos son de sólo anexado y el motor
 * tiene retirado el permiso de modificarlos y borrarlos, también a quien los protagoniza. Una
 * bitácora que su protagonista puede corregir no sirve para lo único que sirve, y aquí importa más
 * que en la de una empresa porque quien la protagoniza tiene la llave de todos los arrendatarios.
 *
 * Es la contrapartida del área entera: quien puede mirar a través de todos los arrendatarios deja
 * aquí lo que hizo, para que alguien pueda revisarlo después.
 */
export default async function PlatformActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const query = toSearchParams(await searchParams)

  const result = await apiGet<PageEnvelope<PlatformActivityRow>>(
    `/platform/activity?${toApiQuery(query)}`,
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
    <PageShell title={t("platform.activity.title")} subtitle={t("platform.activity.subtitle")}>
      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("platform.activity.searchPlaceholder")}
        defaultView="list"
        emptyTitle={t("platform.activity.empty")}
        emptyBody={t("platform.activity.emptyBody")}
      >
        {(items, view) =>
          items.map((entry) => (
            <ItemCard
              key={entry.id}
              view={view}
              media={<Avatar name={entry.performedBy || "?"} />}
              title={entry.title}
              // Sobre quién se ejerció, no sólo que se ejerció. Sin esto, «Prospecto aceptado»
              // treinta veces seguidas no dice absolutamente nada.
              subtitle={[entry.entityLabel, entry.performedBy].filter(Boolean).join(" · ")}
              meta={
                <>
                  <Badge tone={tone[entry.action]}>{t(`activity.actions.${entry.action}`)}</Badge>

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
