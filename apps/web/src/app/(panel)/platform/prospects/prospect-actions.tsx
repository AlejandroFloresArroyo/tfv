"use client"

import { Field, Input, Panel, Textarea } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"

export interface ProspectRow {
  id: string
  name: string
  lastname: string
  email: string
  phone: string | null
  companyName: string
  message: string
  createdAt: string
}

/**
 * Lo que se puede hacer con un contacto pendiente.
 *
 * Tres cosas, y las tres cambian algo en la plataforma entera, así que las tres dejan asiento en la
 * bitácora. Van agrupadas en un único punto de acceso, como pide `collection-browsing`: tres
 * botones por fila en una bandeja de treinta contactos son noventa objetivos y ninguno destaca.
 */
export function ProspectActions({ prospect }: { prospect: ProspectRow }) {
  const t = useTranslations()

  const name = [prospect.name, prospect.lastname].filter(Boolean).join(" ") || prospect.email

  const actions: ItemAction[] = [
    {
      key: "accept",
      label: t("platform.prospects.accept"),
      dialog: (control) => (
        <AcceptProspect key="accept" prospect={prospect} name={name} {...control} />
      ),
    },
    {
      key: "edit",
      label: t("platform.prospects.edit"),
      dialog: (control) => <EditProspect key="edit" prospect={prospect} {...control} />,
    },
    {
      key: "discard",
      label: t("platform.prospects.discard"),
      danger: true,
      dialog: (control) => (
        <ConfirmDestructive
          key="discard"
          title={t("platform.prospects.discardTitle")}
          entity={name}
          confirmLabel={t("platform.prospects.discard")}
          action={() => api(`/prospects/${prospect.id}`, { method: "DELETE" })}
          {...control}
        />
      ),
    },
  ]

  return <ItemActions label={t("platform.prospects.actions", { name })} actions={actions} />
}

/**
 * Aceptar: crear la cuenta.
 *
 * El diálogo enseña **lo que la persona escribió** antes de confirmar, y no por adorno: aceptar da
 * de alta a alguien en la plataforma con el correo que figura aquí, y si ese correo tiene una
 * errata la cuenta nace inalcanzable. Leerlo justo antes es la última oportunidad de verlo.
 *
 * No hay campos que rellenar. El enlace de un solo uso lo elige el servidor y **no vuelve en la
 * respuesta**: viaja al correo del titular, igual que en la recuperación de contraseña.
 */
function AcceptProspect({
  prospect,
  name,
  open,
  onOpenChange,
}: {
  prospect: ProspectRow
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("platform.prospects.acceptTitle", { name })}
      description={t("platform.prospects.acceptBody", { email: prospect.email })}
      submitLabel={t("platform.prospects.accept")}
      size="sm"
      open={open}
      onOpenChange={onOpenChange}
      action={() => api(`/prospects/${prospect.id}/acceptance`, { method: "POST" })}
    >
      {() =>
        prospect.message ? (
          <Panel className="p-3">
            <p className="text-body3 whitespace-pre-wrap text-content-muted">{prospect.message}</p>
          </Panel>
        ) : null
      }
    </FormDialog>
  )
}

/** Corregir lo que llegó mal escrito. Un correo con una errata no se convierte en cuenta. */
function EditProspect({
  prospect,
  open,
  onOpenChange,
}: {
  prospect: ProspectRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("platform.prospects.editTitle")}
      description={t("platform.prospects.editBody")}
      submitLabel={t("common.save")}
      open={open}
      onOpenChange={onOpenChange}
      action={(data) =>
        api(`/prospects/${prospect.id}`, {
          method: "PATCH",
          body: {
            name: text(data, "name"),
            lastname: text(data, "lastname"),
            email: text(data, "email"),
            phone: optional(data, "phone") ?? null,
            companyName: text(data, "companyName"),
            message: text(data, "message"),
          },
        })
      }
    >
      {(state) => (
        <>
          <Field
            label={t("platform.prospects.name")}
            error={state.fieldErrors.get("name")}
            required
          >
            {(ids) => <Input {...ids} name="name" defaultValue={prospect.name} autoFocus />}
          </Field>

          <Field label={t("platform.prospects.lastname")} error={state.fieldErrors.get("lastname")}>
            {(ids) => <Input {...ids} name="lastname" defaultValue={prospect.lastname} />}
          </Field>

          <Field label={t("auth.email")} error={state.fieldErrors.get("email")} required>
            {(ids) => <Input {...ids} name="email" type="email" defaultValue={prospect.email} />}
          </Field>

          <Field label={t("platform.prospects.phone")} error={state.fieldErrors.get("phone")}>
            {(ids) => <Input {...ids} name="phone" defaultValue={prospect.phone ?? ""} />}
          </Field>

          <Field
            label={t("platform.prospects.companyName")}
            error={state.fieldErrors.get("companyName")}
          >
            {(ids) => <Input {...ids} name="companyName" defaultValue={prospect.companyName} />}
          </Field>

          <Field label={t("platform.prospects.message")} error={state.fieldErrors.get("message")}>
            {(ids) => <Textarea {...ids} name="message" rows={4} defaultValue={prospect.message} />}
          </Field>
        </>
      )}
    </FormDialog>
  )
}
