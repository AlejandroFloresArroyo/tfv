"use client"

import { Field, Input } from "@tfv/ui"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"

export interface CompanyRecord {
  id: string
  name: string
  description: string
  email: string | null
  commissionRate: string
}

/**
 * Editar los datos de la empresa.
 *
 * ## La comisión sólo se ofrece a quien puede moverla
 *
 * Es de la plataforma, no de la empresa: `companies` lo dice —«SHALL ser modificable **únicamente**
 * por un administrador de plataforma»— y la ruta rechaza con `403` a quien lo intente sin serlo.
 * Así que el campo **no se pinta** para el resto, ni siquiera apagado: un control desactivado
 * invita a preguntarse qué hay que hacer para activarlo, y aquí la respuesta no es nada que la
 * persona pueda hacer.
 */
function EditCompany({
  company,
  isPlatformAdmin,
  open,
  onOpenChange,
}: {
  company: CompanyRecord
  isPlatformAdmin: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("companies")
  const common = useTranslations("common")

  return (
    <FormDialog
      title={t("manage.editTitle")}
      submitLabel={common("save")}
      size="sm"
      open={open}
      onOpenChange={onOpenChange}
      action={(data) =>
        api(`/companies/${company.id}`, {
          method: "PATCH",
          body: {
            name: text(data, "name"),
            // La descripción vacía viaja como cadena y el correo vacío como nulo, porque el
            // esquema no admite `""` donde espera una dirección: son las dos maneras de decir
            // «bórralo» que entiende cada campo.
            description: text(data, "description"),
            email: optional(data, "email") ?? null,
            ...(isPlatformAdmin && optional(data, "commissionRate")
              ? { commissionRate: text(data, "commissionRate") }
              : {}),
          },
        })
      }
    >
      {(state) => (
        <>
          <Field label={t("name")} error={state.fieldErrors.get("name")} required>
            {(ids) => <Input {...ids} name="name" autoFocus defaultValue={company.name} />}
          </Field>

          <Field label={t("description")} error={state.fieldErrors.get("description")}>
            {(ids) => <Input {...ids} name="description" defaultValue={company.description} />}
          </Field>

          <Field label={t("email")} error={state.fieldErrors.get("email")}>
            {(ids) => (
              <Input {...ids} name="email" type="email" defaultValue={company.email ?? ""} />
            )}
          </Field>

          {isPlatformAdmin ? (
            <Field
              label={t("manage.commission")}
              hint={t("manage.commissionHint")}
              error={state.fieldErrors.get("commissionRate")}
            >
              {(ids) => (
                <Input
                  {...ids}
                  name="commissionRate"
                  inputMode="decimal"
                  className="font-mono"
                  defaultValue={company.commissionRate}
                />
              )}
            </Field>
          ) : null}
        </>
      )}
    </FormDialog>
  )
}

/**
 * Dar de baja la empresa.
 *
 * ## Lo que se enumera, y lo que no se puede enumerar
 *
 * `companies` pide enumerar antes «lo que quedará inaccesible». Un almacén lo hace con cifras
 * porque tiene `…/warehouses/{id}/scope`, que las cuenta con la misma función que decide la baja;
 * **la empresa no tiene esa ruta**, así que aquí no hay ubicaciones ni productos que contar sin
 * inventarse una consulta por dominio. Lo que sí se sabe sin preguntar nada es qué servicios tiene
 * habilitados —viene en el perfil—, y eso es lo que se enumera: cada servicio es una rama entera
 * del arrendatario que deja de estar accesible.
 *
 * No se finge más precisión de la que hay. Queda anotado como H-47.
 *
 * ## Y lo que la spec pide y el servicio no comprueba
 *
 * La baja debería exigir que no haya suscripción activa. `deleteCompany` sólo marca `deletedAt`, y
 * las suscripciones son la rebanada 11: no hay dato con el que advertirlo ni guarda que lo impida.
 * La pantalla no promete una comprobación que nadie hace.
 *
 * Quien la da de baja se queda sin empresa que mirar, así que se le lleva al selector.
 */
function DeleteCompany({
  company,
  services,
  open,
  onOpenChange,
}: {
  company: CompanyRecord
  /** Los servicios habilitados, ya con su nombre en el idioma de quien mira. */
  services: readonly string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("companies")
  const router = useRouter()

  return (
    <ConfirmDestructive
      title={t("manage.deleteTitle")}
      entity={company.name}
      cascade={[
        ...services.map((service) => t("manage.deleteScopeService", { service })),
        t("manage.deleteScopeMembers"),
      ]}
      confirmLabel={t("manage.delete")}
      open={open}
      onOpenChange={onOpenChange}
      action={async () => {
        await api(`/companies/${company.id}`, { method: "DELETE" })
        router.replace("/companies")
      }}
    />
  )
}

/**
 * Las acciones de la empresa, agrupadas.
 *
 * Las que la persona no puede hacer no llegan aquí: se omiten, no se pintan apagadas.
 */
export function CompanyActions({
  company,
  services,
  isPlatformAdmin,
  canEdit,
  canDelete,
}: {
  company: CompanyRecord
  services: readonly string[]
  isPlatformAdmin: boolean
  canEdit: boolean
  canDelete: boolean
}) {
  const t = useTranslations("companies")
  const common = useTranslations("common")
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: common("edit"),
      dialog: (control) => (
        <EditCompany key="edit" company={company} isPlatformAdmin={isPlatformAdmin} {...control} />
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: t("manage.delete"),
      danger: true,
      dialog: (control) => (
        <DeleteCompany key="delete" company={company} services={services} {...control} />
      ),
    })
  }

  return <ItemActions label={t("manage.actions")} actions={actions} />
}
