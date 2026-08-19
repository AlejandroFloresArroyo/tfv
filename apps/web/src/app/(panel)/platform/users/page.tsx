import { Avatar, Badge, ItemCard } from "@tfv/ui"
import type { Metadata } from "next"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"

interface PlatformUserRow {
  id: string
  email: string
  username: string
  name: string
  lastname: string
  isActive: boolean
  isPlatformAdmin: boolean
  emailVerified: boolean
  companyCount: number
  lastLoginAt: string | null
  createdAt: string
  deletedAt: string | null
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("platform.users.title") }
}

/**
 * El padrón de cuentas.
 *
 * Es la única pantalla del sistema que reúne a **todas** las personas de todos los arrendatarios, y
 * eso la hace la más delicada de todas: lo que se cuele aquí se cuela entero de una vez. El servidor
 * enumera las columnas que devuelve una a una en lugar de servir la fila, y ni la derivación de la
 * contraseña ni ningún dato de sesión están entre ellas.
 *
 * De sólo lectura, como el padrón de empresas. Desde aquí no se desactiva a nadie ni se le cambia
 * nada: eso ocurre dentro de su empresa, donde queda en la bitácora de esa empresa y donde alguien
 * puede verlo.
 */
export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const query = toSearchParams(await searchParams)

  const result = await apiGet<PageEnvelope<PlatformUserRow>>(`/platform/users?${toApiQuery(query)}`)

  const filters: FilterSpec[] = [
    {
      kind: "boolean",
      key: "isActive",
      label: t("platform.users.state"),
      trueLabel: t("platform.users.active"),
      falseLabel: t("platform.users.inactive"),
    },
    {
      kind: "boolean",
      key: "isPlatformAdmin",
      label: t("platform.users.role"),
      trueLabel: t("platform.users.admin"),
      falseLabel: t("platform.users.ordinary"),
    },
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("platform.users.registered"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  return (
    <PageShell title={t("platform.users.title")} subtitle={t("platform.users.subtitle")}>
      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("platform.users.searchPlaceholder")}
        defaultView="list"
        emptyTitle={t("platform.users.empty")}
      >
        {(items, view) =>
          items.map((user) => {
            const name = [user.name, user.lastname].filter(Boolean).join(" ") || user.username

            return (
              <ItemCard
                key={user.id}
                view={view}
                media={<Avatar name={name} />}
                title={name}
                subtitle={user.email}
                meta={
                  <>
                    {user.deletedAt ? (
                      <Badge tone="danger">{t("platform.users.deleted")}</Badge>
                    ) : null}
                    {user.isPlatformAdmin ? (
                      <Badge tone="accent">{t("shell.platformAdmin")}</Badge>
                    ) : null}
                    {user.isActive ? null : (
                      <Badge tone="warning">{t("platform.users.inactive")}</Badge>
                    )}
                    {/* Sin verificar no se inicia sesión, así que explica sola media parte de los
                        «no puedo entrar» que llegan a soporte. */}
                    {user.emailVerified ? null : (
                      <Badge tone="warning">{t("platform.users.unverified")}</Badge>
                    )}

                    <Badge>{t("platform.users.companies", { count: user.companyCount })}</Badge>

                    <span className="text-body3 text-content-faint">
                      {user.lastLoginAt
                        ? t("platform.users.lastLogin", {
                            when: format.dateTime(new Date(user.lastLoginAt), {
                              dateStyle: "medium",
                            }),
                          })
                        : t("platform.users.neverLoggedIn")}
                    </span>
                  </>
                }
              />
            )
          })
        }
      </Collection>
    </PageShell>
  )
}
