import { Avatar, Badge, ItemCard } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import type { FilterSpec } from "~/components/collection/params.ts"
import { toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import { AddMember, MemberActions, type RoleOption } from "./member-actions.tsx"

interface MemberRow {
  id: string
  userId: string
  email: string
  name: string
  lastname: string
  roleId: string | null
  roleName: string | null
  isOwner: boolean
  isActive: boolean
  createdAt: string
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("members.title") }
}

/**
 * Miembros de la empresa.
 *
 * Primera pantalla que lee un manejador de dominio, y la primera colección explorable de verdad.
 * También es donde se ve la compuerta de permisos desde fuera: quien no tenga `companies.users.view`
 * no llega hasta aquí, porque la entrada no se pinta y la API responde `403` a quien escriba la
 * dirección.
 *
 * **La exploración no se guarda aquí.** Búsqueda, filtros y página llegan en `searchParams`, se
 * reenvían a la API y vuelven ya resueltos. Por eso esta pantalla no tiene estado: recargarla,
 * compartirla por enlace o llegar desde el botón de atrás dan exactamente lo mismo.
 */
export default async function MembersPage({
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

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/settings/members`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  // Los roles se piden en paralelo y **su fallo no rompe la pantalla**: quien puede ver miembros no
  // necesariamente puede ver roles, y en ese caso el selector y el filtro se quedan sin opciones en
  // lugar de dejar la lista entera sin pintar. Se piden todos —el filtro los necesita completos—,
  // no la primera página.
  const [result, rolesResult] = await Promise.all([
    apiGet<PageEnvelope<MemberRow>>(`/companies/${companyId}/members?${toApiQuery(query)}`),
    apiGet<PageEnvelope<RoleOption>>(`/companies/${companyId}/roles?limit=96`),
  ])

  const roles = rolesResult.ok ? rolesResult.data.items : []
  const canInvite = can(company, "companies.users.invite")
  const canEdit = can(company, "companies.users.change-role")
  const canRemove = can(company, "companies.users.uninvite")

  const filters: FilterSpec[] = [
    {
      kind: "select",
      key: "roleId",
      label: t("members.role"),
      options: roles.map((role) => ({ value: role.id, label: role.name })),
    },
    {
      kind: "boolean",
      key: "isActive",
      label: t("members.state"),
      trueLabel: t("members.active"),
      falseLabel: t("members.inactive"),
    },
    {
      kind: "boolean",
      key: "isOwner",
      label: t("members.ownership"),
      trueLabel: t("members.owner"),
      falseLabel: t("members.notOwner"),
    },
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("members.joined"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  return (
    <PageShell
      title={t("members.title")}
      subtitle={t("members.subtitle", { company: company.name })}
      actions={canInvite ? <AddMember companyId={companyId} roles={roles} /> : undefined}
    >
      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("members.searchPlaceholder")}
        emptyTitle={t("members.empty")}
        emptyBody={t("members.ownerNote")}
      >
        {(items, view) =>
          items.map((member) => {
            const name = [member.name, member.lastname].filter(Boolean).join(" ") || member.email

            return (
              <ItemCard
                key={member.id}
                view={view}
                media={<Avatar name={name} />}
                title={name}
                subtitle={member.email}
                meta={
                  <>
                    {member.isOwner ? (
                      <Badge tone="accent">{t("members.owner")}</Badge>
                    ) : member.roleName ? (
                      <Badge>{member.roleName}</Badge>
                    ) : (
                      <Badge>{t("members.noRole")}</Badge>
                    )}

                    {member.isActive ? null : <Badge tone="danger">{t("members.inactive")}</Badge>}

                    <span className="text-body3 text-content-faint">
                      {format.dateTime(new Date(member.createdAt), { dateStyle: "medium" })}
                    </span>
                  </>
                }
                actions={
                  <MemberActions
                    companyId={companyId}
                    roles={roles}
                    canEdit={canEdit}
                    canRemove={canRemove}
                    canMoveOwnership={company.isOwner || profile.isPlatformAdmin}
                    member={{
                      id: member.id,
                      name,
                      email: member.email,
                      roleId: member.roleId,
                      isOwner: member.isOwner,
                      isActive: member.isActive,
                    }}
                  />
                }
              />
            )
          })
        }
      </Collection>
    </PageShell>
  )
}
