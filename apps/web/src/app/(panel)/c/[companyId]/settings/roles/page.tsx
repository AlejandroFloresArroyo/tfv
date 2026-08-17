import { Badge, ItemCard } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { Catalog } from "./permission-matrix.tsx"
import { CreateRole, RoleActions } from "./role-actions.tsx"

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
export default async function RolesPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const { companyId } = await params
  const query = toSearchParams(await searchParams)

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/settings/roles`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const [rolesResult, catalogResult] = await Promise.all([
    apiGet<PageEnvelope<RoleRow>>(`/companies/${companyId}/roles?${toApiQuery(query)}`),
    apiGet<Catalog>("/permissions"),
  ])

  // El catálogo no es una colección: si falla, no hay matriz de permisos que pintar y la pantalla
  // entera deja de tener sentido. El de roles sí lo es, y sus fallos los lleva `Collection`.
  if (!catalogResult.ok) {
    return (
      <PageShell title={t("roles.title")}>
        <ApiFailure result={catalogResult} />
      </PageShell>
    )
  }

  const catalog = catalogResult.data
  const total = catalog.total
  const canCreate = can(company, "companies.roles.create")
  const canEdit = can(company, "companies.roles.edit")
  const canDelete = can(company, "companies.roles.delete")

  return (
    <PageShell
      title={t("roles.title")}
      subtitle={t("roles.subtitle", { total })}
      actions={canCreate ? <CreateRole companyId={companyId} catalog={catalog} /> : undefined}
    >
      <Collection
        params={query}
        result={rolesResult}
        searchPlaceholder={t("roles.searchRolePlaceholder")}
        emptyTitle={t("roles.empty")}
        emptyBody={t("roles.note")}
      >
        {(items, view) =>
          items.map((role) => (
            <ItemCard
              key={role.id}
              view={view}
              title={role.name}
              subtitle={t("roles.peopleCount", { count: role.memberCount })}
              meta={
                role.permissions.length === 0 ? (
                  <Badge>{t("roles.noneGranted")}</Badge>
                ) : (
                  <Badge tone="accent">
                    {t("roles.allOf", { count: role.permissions.length, total })}
                  </Badge>
                )
              }
              actions={
                <RoleActions
                  companyId={companyId}
                  role={role}
                  catalog={catalog}
                  canEdit={canEdit}
                  canDelete={canDelete}
                />
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
