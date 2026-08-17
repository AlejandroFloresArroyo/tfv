"use client"

import { Button, Checkbox, DialogTrigger, Field, Input, Select, Switch } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { useId, useState } from "react"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"

export interface MemberSummary {
  id: string
  name: string
  email: string
  roleId: string | null
  isOwner: boolean
  isActive: boolean
}

export interface RoleOption {
  id: string
  name: string
}

/**
 * Incorporar a alguien a la empresa.
 *
 * Sólo admite cuentas existentes, y lo dice en la descripción en lugar de fallar después: crear la
 * cuenta desde aquí existe en el servidor —es la invitación de la rebanada 04— pero todavía no está
 * atada a esta ruta. Prometer menos y cumplirlo es mejor que un `422` que parece un error de quien
 * escribe el correo.
 */
export function AddMember({ companyId, roles }: { companyId: string; roles: RoleOption[] }) {
  const t = useTranslations()
  const roleFieldId = useId()

  return (
    <FormDialog
      title={t("members.addTitle")}
      description={t("members.addBody")}
      submitLabel={t("members.addSubmit")}
      size="sm"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">{t("members.add")}</Button>
        </DialogTrigger>
      }
      action={(data) =>
        api(`/companies/${companyId}/members`, {
          method: "POST",
          body: { email: text(data, "email"), roleId: optional(data, "roleId") ?? null },
        })
      }
    >
      {(state) => (
        <>
          <Field label={t("auth.email")} error={state.fieldErrors.get("email")} required>
            {(ids) => (
              <Input {...ids} name="email" type="email" autoFocus placeholder="persona@correo.mx" />
            )}
          </Field>

          <Field label={t("members.role")} error={state.fieldErrors.get("roleId")}>
            {(ids) => (
              <Select {...ids} id={roleFieldId} name="roleId" defaultValue="">
                <option value="">{t("members.noRole")}</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </>
      )}
    </FormDialog>
  )
}

/**
 * Cambiar rol, actividad y propiedad de un miembro.
 *
 * Los tres van en el mismo diálogo porque son la misma pregunta —«qué es esta persona aquí»— y
 * porque la API los acepta en una sola petición. Separarlos obligaría a tres viajes y a tres
 * momentos en los que el estado puede quedar a medias.
 */
export function EditMember({
  companyId,
  member,
  roles,
  canMoveOwnership,
}: {
  companyId: string
  member: MemberSummary
  roles: RoleOption[]
  /** Sólo una propietaria mueve la propiedad. No hay clave de permiso para esto. */
  canMoveOwnership: boolean
}) {
  const t = useTranslations()
  const [isOwner, setIsOwner] = useState(member.isOwner)
  const [isActive, setIsActive] = useState(member.isActive)

  const ownerId = useId()
  const activeId = useId()

  return (
    <FormDialog
      title={t("members.editTitle", { name: member.name })}
      submitLabel={t("common.save")}
      size="sm"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost">
            {t("common.edit")}
          </Button>
        </DialogTrigger>
      }
      action={(data) =>
        api(`/companies/${companyId}/members/${member.id}`, {
          method: "PATCH",
          body: {
            roleId: optional(data, "roleId") ?? null,
            isActive,
            ...(canMoveOwnership ? { isOwner } : {}),
          },
        })
      }
    >
      {(state) => (
        <>
          <Field
            label={t("members.role")}
            error={state.fieldErrors.get("roleId")}
            hint={isOwner ? t("members.ownerHint") : undefined}
          >
            {(ids) => (
              <Select {...ids} name="roleId" defaultValue={member.roleId ?? ""} disabled={isOwner}>
                <option value="">{t("members.noRole")}</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="flex flex-col gap-3 rounded-sm border border-line bg-panel-sunken p-3">
            <Switch
              id={activeId}
              checked={isActive}
              onCheckedChange={setIsActive}
              label={t("members.active")}
            />
            <p className="text-body3 text-content-faint">{t("members.activeHint")}</p>

            {canMoveOwnership ? (
              <>
                <hr className="border-0 border-t border-line" />
                <Checkbox
                  id={ownerId}
                  checked={isOwner}
                  onCheckedChange={(value) => setIsOwner(value === true)}
                  label={t("members.owner")}
                  hint={t("members.ownerHint")}
                />
              </>
            ) : null}
          </div>
        </>
      )}
    </FormDialog>
  )
}

export function RemoveMember({ companyId, member }: { companyId: string; member: MemberSummary }) {
  const t = useTranslations()

  return (
    <ConfirmDestructive
      title={t("members.removeTitle")}
      entity={member.name || member.email}
      cascade={[t("members.removeCascade")]}
      confirmLabel={t("members.remove")}
      trigger={
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" className="text-danger hover:text-danger">
            {t("members.remove")}
          </Button>
        </DialogTrigger>
      }
      action={() => api(`/companies/${companyId}/members/${member.id}`, { method: "DELETE" })}
    />
  )
}
