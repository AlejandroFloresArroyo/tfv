import { Avatar, ItemCard } from "@tfv/ui"
import type { Metadata } from "next"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { ProspectActions, type ProspectRow } from "./prospect-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("platform.prospects.title") }
}

/**
 * La bandeja de prospectos.
 *
 * Ver `openspec/specs/user-accounts/spec.md`, «Captura pública de prospectos» y «Aceptación de un
 * prospecto». La rebanada 10 dejó esto entero en el servidor y sin pantalla, porque no había dónde
 * ponerla: un prospecto no pertenece a ninguna empresa, así que no cabía en el panel de ninguna.
 *
 * **La bandeja son los pendientes, y lo son por construcción.** El servidor devuelve sólo los que
 * nadie ha aceptado ni descartado, así que aceptar uno lo saca de aquí sin que esta pantalla tenga
 * que acordarse de nada. Es la corrección de `DEFECTS.md` L-02, donde el prospecto aceptado seguía
 * pidiendo atención para siempre.
 *
 * Lo que se ve aquí son personas que dejaron su teléfono en un formulario público. No hay vista de
 * detalle: lo que escribieron cabe en la tarjeta, y una ficha aparte sólo añadiría un clic entre
 * quien llama y a quién llama.
 */
export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const query = toSearchParams(await searchParams)

  const result = await apiGet<PageEnvelope<ProspectRow>>(`/prospects?${toApiQuery(query)}`)

  const filters: FilterSpec[] = [
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("platform.prospects.received"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  return (
    <PageShell title={t("platform.prospects.title")} subtitle={t("platform.prospects.subtitle")}>
      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("platform.prospects.searchPlaceholder")}
        defaultView="list"
        emptyTitle={t("platform.prospects.empty")}
        emptyBody={t("platform.prospects.emptyBody")}
      >
        {(items, view) =>
          items.map((prospect) => {
            const name =
              [prospect.name, prospect.lastname].filter(Boolean).join(" ") || prospect.email

            return (
              <ItemCard
                key={prospect.id}
                view={view}
                media={<Avatar name={name} />}
                title={name}
                subtitle={
                  // El correo y la empresa juntos: son las dos cosas por las que se reconoce a
                  // alguien que llamó hace un mes, y ninguna de las dos sola basta.
                  [prospect.email, prospect.companyName].filter(Boolean).join(" · ")
                }
                meta={
                  <span className="text-body3 text-content-faint">
                    {format.dateTime(new Date(prospect.createdAt), { dateStyle: "medium" })}
                  </span>
                }
                actions={<ProspectActions prospect={prospect} />}
              />
            )
          })
        }
      </Collection>
    </PageShell>
  )
}
