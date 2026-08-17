"use client"

import { Button, DialogTrigger, Field, Input } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import { type Catalog, PermissionMatrix } from "./permission-matrix.tsx"

export interface RoleSummary {
  id: string
  name: string
  permissions: string[]
  memberCount: number
}

export function CreateRole({ companyId, catalog }: { companyId: string; catalog: Catalog }) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("roles.createTitle")}
      submitLabel={t("common.create")}
      size="lg"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">{t("roles.create")}</Button>
        </DialogTrigger>
      }
      action={(data) =>
        api(`/companies/${companyId}/roles`, {
          method: "POST",
          body: { name: text(data, "name"), permissions: data.getAll("permissions") },
        })
      }
    >
      {(state) => (
        <>
          <Field label={t("common.name")} error={state.fieldErrors.get("name")} required>
            {(ids) => <Input {...ids} name="name" autoFocus />}
          </Field>

          <Field label={t("roles.permissionsTitle")} error={state.fieldErrors.get("permissions")}>
            {() => <PermissionMatrix catalog={catalog} defaultValue={[]} />}
          </Field>
        </>
      )}
    </FormDialog>
  )
}

/**
 * Editar un rol.
 *
 * Nombre y permisos van juntos en la pantalla y **separados en el servidor**: repartir claves exige
 * `companies.roles.change_permissions`, distinta de la de renombrar. Quien sólo puede renombrar
 * recibe `403` al tocar la matriz, y el diálogo lo muestra como error general — que es lo correcto,
 * porque no es un error de ningún campo sino de quién es quien lo envía.
 */
export function EditRole({
  companyId,
  role,
  catalog,
}: {
  companyId: string
  role: RoleSummary
  catalog: Catalog
}) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("roles.editTitle", { name: role.name })}
      submitLabel={t("common.save")}
      size="lg"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost">
            {t("common.edit")}
          </Button>
        </DialogTrigger>
      }
      action={(data) =>
        api(`/companies/${companyId}/roles/${role.id}`, {
          method: "PATCH",
          body: { name: text(data, "name"), permissions: data.getAll("permissions") },
        })
      }
    >
      {(state) => (
        <>
          <Field label={t("common.name")} error={state.fieldErrors.get("name")} required>
            {(ids) => <Input {...ids} name="name" defaultValue={role.name} autoFocus />}
          </Field>

          <Field label={t("roles.permissionsTitle")} error={state.fieldErrors.get("permissions")}>
            {() => <PermissionMatrix catalog={catalog} defaultValue={role.permissions} />}
          </Field>
        </>
      )}
    </FormDialog>
  )
}

export function DeleteRole({ companyId, role }: { companyId: string; role: RoleSummary }) {
  const t = useTranslations()

  return (
    <ConfirmDestructive
      title={t("roles.deleteTitle")}
      entity={role.name}
      // La cascada real, contada: quién se queda sin rol. Es lo que `forms-and-wizards` pide
      // enumerar antes de pulsar, y aquí el número sale del servidor, no de una suposición.
      cascade={[t("roles.deleteCascade", { count: role.memberCount })]}
      confirmLabel={t("common.delete")}
      trigger={
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" className="text-danger hover:text-danger">
            {t("common.delete")}
          </Button>
        </DialogTrigger>
      }
      action={() => api(`/companies/${companyId}/roles/${role.id}`, { method: "DELETE" })}
    />
  )
}
