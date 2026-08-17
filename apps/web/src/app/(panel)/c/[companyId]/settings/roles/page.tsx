import { Badge } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { DataTable } from "~/components/data-table.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { Catalog } from "./permission-matrix.tsx"
import { CreateRole, DeleteRole, EditRole } from "./role-actions.tsx"

interface RoleRow {
  id: string
  name: string
  permissions: string[]
  memberCount: number
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("roles.title") }
}

/**
 * Roles de la empresa.
 *
 * Se muestra cuántas claves concede cada rol **sobre el total del catálogo**, porque el número
 * suelto no dice nada: cinco permisos puede ser mucho o casi nada, y la comparación es lo que
 * convierte el dato en información.
 *
 * El total sale del servidor, no de una constante repetida aquí. Es el mismo catálogo que hace
 * cumplir el permiso, así que no puede quedar desfasado.
 */
export default async function RolesPage({ params }: { params: Promise<{ companyId: string }> }) {
  const t = await getTranslations()
  const { companyId } = await params

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/settings/roles`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const [rolesResult, catalogResult] = await Promise.all([
    apiGet<{ items: RoleRow[] }>(`/companies/${companyId}/roles`),
    apiGet<Catalog>("/permissions"),
  ])

  if (!rolesResult.ok || !catalogResult.ok) {
    // El de roles manda: si falta el permiso, es lo que hay que decir. El del catálogo sólo puede
    // fallar por avería, y entonces `ApiFailure` lo trata como tal.
    const failure = !rolesResult.ok ? rolesResult : catalogResult

    return (
      <PageShell title={t("roles.title")}>
        <ApiFailure result={failure as Extract<typeof failure, { ok: false }>} />
      </PageShell>
    )
  }

  const total = catalogResult.data.total
  const catalog = catalogResult.data
  const canCreate = can(company, "companies.roles.create")
  const canEdit = can(company, "companies.roles.edit")
  const canDelete = can(company, "companies.roles.delete")
  const showActions = canEdit || canDelete

  return (
    <PageShell
      title={t("roles.title")}
      subtitle={t("roles.subtitle", { total })}
      actions={canCreate ? <CreateRole companyId={companyId} catalog={catalog} /> : undefined}
    >
      <DataTable
        rows={rolesResult.data.items}
        rowKey={(role) => role.id}
        empty={t("roles.empty")}
        note={t("roles.note")}
        columns={[
          {
            header: t("roles.name"),
            cell: (role) => <span className="font-medium text-content">{role.name}</span>,
          },
          {
            header: t("roles.granted"),
            cell: (role) =>
              role.permissions.length === 0 ? (
                <span className="text-content-faint">{t("roles.noneGranted")}</span>
              ) : (
                <Badge>{t("roles.allOf", { count: role.permissions.length, total })}</Badge>
              ),
          },
          {
            header: t("roles.people"),
            cell: (role) => role.memberCount,
          },
          ...(showActions
            ? [
                {
                  header: t("common.actions"),
                  className: "text-right",
                  cell: (role: RoleRow) => (
                    <div className="flex justify-end gap-1">
                      {canEdit ? (
                        <EditRole companyId={companyId} role={role} catalog={catalog} />
                      ) : null}
                      {canDelete ? <DeleteRole companyId={companyId} role={role} /> : null}
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
