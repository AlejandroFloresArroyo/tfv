import { Avatar, Badge, ItemCard } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { requireProfile } from "~/lib/session.ts"

/**
 * Un asiento de la bitácora personal.
 *
 * Es el mismo de la de empresa **más la empresa**: aquí los asientos vienen de todas a las que uno
 * pertenece, y sin ese campo no habría forma de situar ninguno.
 */
interface ActivityRow {
  id: string
  companyId: string
  companyName: string
  action: "create" | "update" | "delete"
  entity: string
  entityLabel: string
  /** Qué se hizo, como clave del catálogo. La frase se arma aquí, en el idioma de quien mira. */
  messageKey: string
  messageParams: Record<string, string | number>
  url: string
  performedBy: string
  performedAsPlatformAdmin: boolean
  createdAt: string
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("account.activity.title") }
}

/**
 * Mi actividad.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md`. Es la hermana personal de la bitácora de
 * empresa (`c/[companyId]/settings/activity`) y **contesta otra pregunta**: aquélla dice qué pasó
 * dentro de una empresa; ésta, qué hice yo, atravesando todas a las que pertenezco. Quien está en
 * dos no tenía dónde ver su propio rastro sin recorrerlas una por una.
 *
 * Por eso vive bajo `/account`, junto a las sesiones y la bandeja: son las tres cosas que son de la
 * persona y no del arrendatario, y ninguna de las tres pide elegir empresa antes de mirarla.
 *
 * ## Las dos diferencias con la de empresa, y por qué son ésas
 *
 * - **La empresa se nombra en cada asiento.** Es el eje que aquí varía; sin él, dos asientos
 *   idénticos de dos empresas distintas se leen como uno repetido.
 * - **Quien actuó no se pinta como retrato.** Siempre soy yo: un avatar repetido en cada renglón no
 *   distingue nada. El retrato es el de la empresa, que es lo que sí cambia de fila a fila. El
 *   nombre sigue estando, dentro de la frase, porque la frase del catálogo lo lleva y reescribirla
 *   sólo para esta pantalla sería mantener dos redacciones de lo mismo en dos idiomas.
 *
 * **No se ofrece filtrar por empresa**: el lenguaje de consulta de este recurso no lo acepta, y un
 * filtro que se marca y no filtra es peor que ninguno.
 */
export default async function MyActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const query = toSearchParams(await searchParams)

  const path = (await headers()).get("x-pathname") ?? "/account/activity"
  await requireProfile(path)

  const result = await apiGet<PageEnvelope<ActivityRow>>(`/me/activity?${toApiQuery(query)}`)

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
    <PageShell title={t("account.activity.title")} subtitle={t("account.activity.subtitle")}>
      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("activity.searchPlaceholder")}
        defaultView="list"
        emptyTitle={t("account.activity.empty")}
        emptyBody={t("account.activity.emptyBody")}
      >
        {(items, view) =>
          items.map((entry) => (
            <ItemCard
              key={entry.id}
              view={view}
              media={<Avatar name={entry.companyName || "?"} />}
              title={t(`activity.messages.${entry.messageKey}`, {
                actor: entry.performedBy,
                ...entry.messageParams,
              })}
              // La empresa primero: es la que sitúa el asiento. El nombre de lo tocado va detrás,
              // cuando lo hay y **cuando no es el de la empresa**: un asiento sobre la empresa misma
              // lo repetiría, y «Renta Fílmica del Norte · Renta Fílmica del Norte» no informa de
              // nada — se lee como un fallo de la pantalla.
              subtitle={[entry.companyName, entry.entityLabel]
                .filter((part, index, all) => part !== "" && all.indexOf(part) === index)
                .join(" · ")}
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
