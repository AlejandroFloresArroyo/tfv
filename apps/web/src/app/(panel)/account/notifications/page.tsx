import { noticeWindowName } from "@tfv/contracts/activity"
import { Badge, cn, Panel } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { requireProfile } from "~/lib/session.ts"
import { ChannelPreferences, type Preference } from "./channel-preferences.tsx"
import { MarkOpened, NotificationActions } from "./notification-actions.tsx"

interface NotificationRow {
  id: string
  kind: string
  /** El nombre de la entidad afectada. */
  title: string
  /** Quién hizo qué, como clave y parámetros: la frase se arma aquí, con el idioma delante. */
  bodyKey: string
  bodyParams: Record<string, string | number>
  url: string
  readAt: string | null
  archivedAt: string | null
  createdAt: string
}

interface Envelope {
  items: NotificationRow[]
  page: number
  totalItems: number
  totalPages: number
  hasPrevious: boolean
  hasNext: boolean
  previousPage: number | null
  nextPage: number | null
}

const FILTERS = ["all", "unread", "read", "archived"] as const
type Filter = (typeof FILTERS)[number]

function isFilter(value: string | undefined): value is Filter {
  return FILTERS.includes(value as Filter)
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("notifications.title") }
}

/**
 * La bandeja.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md`. El filtro y la página viven **en la
 * dirección**, como en el resto de colecciones: una bandeja filtrada se comparte por enlace, el
 * botón de atrás deshace el último filtro y recargar no pierde nada.
 *
 * Sólo se enseña el canal de bandeja. Los otros dos no tienen proveedor todavía y el bloque de
 * preferencias lo dice en lugar de ofrecer interruptores que no encenderían nada.
 *
 * ## Pulsar un aviso abre la entidad, y reutiliza su pestaña
 *
 * El enlace lleva **nombre de ventana**, y ahí está todo el requisito: el navegador enfoca la
 * pestaña que ya se llame así en lugar de abrir otra, que es literalmente «si ya estaba abierta en
 * otra pestaña, se enfoca esa». Enfocar no se puede probar con una función pura y no hace falta
 * escribirlo: lo hace el navegador. Lo que sí es decisión nuestra —y lo único que puede estar mal—
 * es **qué pestaña es la misma pestaña**, y eso lo decide `noticeWindowName`, que se prueba sola.
 *
 * La bandeja se queda donde está al pulsar, que además es lo que se quiere: quien tiene cinco
 * avisos los abre uno tras otro sin perder la lista, y los tres de la misma cotización caen en la
 * misma pestaña.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const raw = await searchParams

  const filter = isFilter(typeof raw.filter === "string" ? raw.filter : undefined)
    ? (raw.filter as Filter)
    : "all"
  const page = Math.max(1, Number(typeof raw.page === "string" ? raw.page : 1) || 1)

  const path = (await headers()).get("x-pathname") ?? "/account/notifications"
  await requireProfile(path)

  const [result, counts, preferences] = await Promise.all([
    apiGet<Envelope>(`/me/notifications?filter=${filter}&page=${page}`),
    apiGet<{ unread: number; news: number }>("/me/notifications/counts"),
    apiGet<{ items: Preference[]; available: string[] }>("/me/notification-preferences"),
  ])

  if (!result.ok) {
    return (
      <PageShell title={t("notifications.title")}>
        <ApiFailure result={result} />
      </PageShell>
    )
  }

  const sinLeer = counts.ok ? counts.data.unread : 0
  const novedades = counts.ok ? counts.data.news : 0

  return (
    <PageShell
      title={t("notifications.title")}
      subtitle={
        sinLeer > 0
          ? t("notifications.unreadCount", { count: sinLeer })
          : t("notifications.allRead")
      }
    >
      {/* Abrirla es lo que reinicia el aviso de novedades. */}
      <MarkOpened />

      <nav aria-label={t("notifications.filters")} className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((candidate) => (
          <Link
            key={candidate}
            href={`/account/notifications?filter=${candidate}`}
            aria-current={candidate === filter ? "page" : undefined}
            className={cn(
              "rounded-sm px-3 py-1.5 text-body2 font-medium transition-colors",
              candidate === filter
                ? "bg-accent text-on-accent"
                : "bg-panel-hover text-content-muted hover:text-content",
            )}
          >
            {t(`notifications.filter.${candidate}`)}
          </Link>
        ))}

        {novedades > 0 ? (
          <span className="self-center">
            <Badge tone="accent">{t("notifications.news", { count: novedades })}</Badge>
          </span>
        ) : null}
      </nav>

      {result.data.items.length === 0 ? (
        <Panel className="p-8 text-center">
          <p className="text-body1 font-medium text-content">{t("notifications.empty")}</p>
          <p className="mt-1 text-body2 text-content-muted">{t("notifications.emptyBody")}</p>
        </Panel>
      ) : (
        <ul className="space-y-2">
          {result.data.items.map((item) => (
            <li key={item.id}>
              <Panel
                className={cn(
                  "flex items-start gap-3 p-4",
                  // Lo no leído se distingue por el borde y por la negrita del título, no sólo por
                  // el color: quien no distingue el matiz sigue viendo cuál es cuál.
                  item.readAt ? "" : "border-accent",
                )}
              >
                <div className="min-w-0 flex-1">
                  <Link href={item.url} target={noticeWindowName(item.url)} className="rounded-sm">
                    <p
                      className={cn(
                        "truncate text-body2 text-content",
                        item.readAt ? "font-medium" : "font-bold",
                      )}
                    >
                      {item.title || t(`notifications.kinds.${kindKey(item.kind)}`)}
                    </p>
                    {item.bodyKey ? (
                      <p className="mt-0.5 text-body2 text-content-muted">
                        {t(`activity.messages.${item.bodyKey}`, item.bodyParams)}
                      </p>
                    ) : null}
                  </Link>

                  <p className="mt-1 text-body3 text-content-faint">
                    {format.dateTime(new Date(item.createdAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <NotificationActions
                    id={item.id}
                    read={item.readAt !== null}
                    archived={item.archivedAt !== null}
                  />
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      {result.data.totalPages > 1 ? (
        <nav aria-label={t("collection.pagination")} className="mt-4 flex items-center gap-3">
          {result.data.hasPrevious ? (
            <Link
              href={`/account/notifications?filter=${filter}&page=${result.data.previousPage}`}
              className="text-body2 font-medium text-accent"
            >
              {t("collection.previousPage")}
            </Link>
          ) : null}

          <span className="text-body3 text-content-faint">
            {t("notifications.pageOf", {
              page: result.data.page,
              total: result.data.totalPages,
            })}
          </span>

          {result.data.hasNext ? (
            <Link
              href={`/account/notifications?filter=${filter}&page=${result.data.nextPage}`}
              className="text-body2 font-medium text-accent"
            >
              {t("collection.nextPage")}
            </Link>
          ) : null}
        </nav>
      ) : null}

      <section className="mt-10">
        <h2 className="text-h5 font-bold text-content">{t("notifications.preferences.title")}</h2>
        <p className="mt-1 mb-4 text-body2 text-content-muted">
          {t("notifications.preferences.subtitle")}
        </p>

        <Panel className="p-4">
          {preferences.ok ? (
            <ChannelPreferences
              preferences={preferences.data.items}
              available={preferences.data.available}
            />
          ) : (
            <ApiFailure result={preferences} />
          )}
        </Panel>
      </section>
    </PageShell>
  )
}

/** Los tipos que la interfaz sabe nombrar. Cualquier otro se enseña con su texto, que ya lo trae. */
function kindKey(kind: string): string {
  return kind === "activity" || kind === "stock_coherence" ? kind : "other"
}
