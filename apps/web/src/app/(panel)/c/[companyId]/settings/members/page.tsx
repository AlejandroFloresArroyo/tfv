import { Badge } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { DataTable } from "~/components/data-table.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import { AddMember, EditMember, RemoveMember, type RoleOption } from "./member-actions.tsx"

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
 * Primera pantalla que lee un manejador de dominio. Es también la primera donde se ve la compuerta
 * de permisos desde fuera: quien no tenga `companies.users.view` no llega hasta aquí, porque la
 * entrada no se pinta y la API responde `403` a quien escriba la dirección.
 */
export default async function MembersPage({ params }: { params: Promise<{ companyId: string }> }) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId } = await params

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/settings/members`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  // Los roles se piden en paralelo y **su fallo no rompe la pantalla**: quien puede ver miembros
  // no necesariamente puede ver roles, y en ese caso el selector se queda sin opciones en lugar de
  // dejar la lista entera sin pintar.
  const [result, rolesResult] = await Promise.all([
    apiGet<{ items: MemberRow[] }>(`/companies/${companyId}/members`),
    apiGet<{ items: RoleOption[] }>(`/companies/${companyId}/roles`),
  ])

  if (!result.ok) {
    return (
      <PageShell title={t("members.title")}>
        <ApiFailure result={result} />
      </PageShell>
    )
  }

  const roles = rolesResult.ok ? rolesResult.data.items : []
  const canInvite = can(company, "companies.users.invite")
  const canEdit = can(company, "companies.users.change-role")
  const canRemove = can(company, "companies.users.uninvite")
  const showActions = canEdit || canRemove

  return (
    <PageShell
      title={t("members.title")}
      subtitle={t("members.subtitle", { company: company.name })}
      actions={canInvite ? <AddMember companyId={companyId} roles={roles} /> : undefined}
    >
      <DataTable
        rows={result.data.items}
        rowKey={(member) => member.id}
        empty={t("members.empty")}
        note={t("members.ownerNote")}
        columns={[
          {
            header: t("members.person"),
            className: "text-content",
            cell: (member) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-content">
                  {[member.name, member.lastname].filter(Boolean).join(" ") || member.email}
                </p>
                <p className="truncate text-body3 text-content-faint">{member.email}</p>
              </div>
            ),
          },
          {
            header: t("members.role"),
            cell: (member) =>
              member.isOwner ? (
                <Badge tone="accent">{t("members.owner")}</Badge>
              ) : member.roleName ? (
                <Badge>{member.roleName}</Badge>
              ) : (
                <span className="text-content-faint">{t("members.noRole")}</span>
              ),
          },
          {
            header: t("members.state"),
            cell: (member) =>
              member.isActive ? (
                <Badge tone="success">{t("members.active")}</Badge>
              ) : (
                <Badge tone="danger">{t("members.inactive")}</Badge>
              ),
          },
          {
            header: t("members.joined"),
            cell: (member) => format.dateTime(new Date(member.createdAt), { dateStyle: "medium" }),
          },
          ...(showActions
            ? [
                {
                  header: t("common.actions"),
                  className: "text-right",
                  cell: (member: MemberRow) => (
                    <div className="flex justify-end gap-1">
                      {canEdit ? (
                        <EditMember
                          companyId={companyId}
                          roles={roles}
                          canMoveOwnership={company.isOwner || profile.isPlatformAdmin}
                          member={{
                            id: member.id,
                            name:
                              [member.name, member.lastname].filter(Boolean).join(" ") ||
                              member.email,
                            email: member.email,
                            roleId: member.roleId,
                            isOwner: member.isOwner,
                            isActive: member.isActive,
                          }}
                        />
                      ) : null}

                      {canRemove ? (
                        <RemoveMember
                          companyId={companyId}
                          member={{
                            id: member.id,
                            name:
                              [member.name, member.lastname].filter(Boolean).join(" ") ||
                              member.email,
                            email: member.email,
                            roleId: member.roleId,
                            isOwner: member.isOwner,
                            isActive: member.isActive,
                          }}
                        />
                      ) : null}
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </PageShell>
  )
}
