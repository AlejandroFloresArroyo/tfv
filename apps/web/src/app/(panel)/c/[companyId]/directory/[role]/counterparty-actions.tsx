"use client"

import { Button, DialogTrigger, Field, Input } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"

/** `clients` o `providers`, que es el segmento de la ruta y también el de la API. */
export type Role = "clients" | "providers"

export interface CounterpartySummary {
  id: string
  alias: string
  userId: string | null
  snapshot: Record<string, string>
}

/**
 * Alta de una contraparte.
 *
 * El correo es opcional **y decide de qué tipo es**: si corresponde a una cuenta, la contraparte
 * queda atada a ella; si no, se guarda como externa con sus datos copiados. Las dos son válidas —
 * media cartera de una casa de renta no tiene cuenta en la plataforma, y obligar a crearla para
 * poder facturarles convertiría un alta en un trámite.
 */
export function CreateCounterparty({ companyId, role }: { companyId: string; role: Role }) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t(`directory.${role}.createTitle`)}
      description={t("directory.createBody")}
      submitLabel={t("common.create")}
      size="sm"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">{t(`directory.${role}.create`)}</Button>
        </DialogTrigger>
      }
      action={(data) =>
        api(`/companies/${companyId}/${role}`, {
          method: "POST",
          body: {
            alias: text(data, "alias"),
            ...(optional(data, "email") ? { email: text(data, "email") } : {}),
            snapshot: snapshotOf(data),
          },
        })
      }
    >
      {(state) => <Fields state={state} />}
    </FormDialog>
  )
}

function EditCounterparty({
  companyId,
  role,
  counterparty,
  open,
  onOpenChange,
}: {
  companyId: string
  role: Role
  counterparty: CounterpartySummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("directory.editTitle", { name: counterparty.alias })}
      submitLabel={t("common.save")}
      size="sm"
      open={open}
      onOpenChange={onOpenChange}
      action={(data) =>
        api(`/companies/${companyId}/${role}/${counterparty.id}`, {
          method: "PATCH",
          body: { alias: text(data, "alias"), snapshot: snapshotOf(data) },
        })
      }
    >
      {(state) => <Fields state={state} counterparty={counterparty} />}
    </FormDialog>
  )
}

function DeleteCounterparty({
  companyId,
  role,
  counterparty,
  open,
  onOpenChange,
}: {
  companyId: string
  role: Role
  counterparty: CounterpartySummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()

  return (
    <ConfirmDestructive
      title={t(`directory.${role}.deleteTitle`)}
      entity={counterparty.alias}
      // La baja es lógica, y decirlo importa: quien la da de baja necesita saber que las
      // cotizaciones y los pedidos ya emitidos conservan su nombre.
      cascade={[t("directory.deleteCascade")]}
      confirmLabel={t("common.delete")}
      open={open}
      onOpenChange={onOpenChange}
      action={() => api(`/companies/${companyId}/${role}/${counterparty.id}`, { method: "DELETE" })}
    />
  )
}

export function CounterpartyActions({
  companyId,
  role,
  counterparty,
  canEdit,
  canDelete,
}: {
  companyId: string
  role: Role
  counterparty: CounterpartySummary
  canEdit: boolean
  canDelete: boolean
}) {
  const t = useTranslations()
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: t("common.edit"),
      dialog: (control) => (
        <EditCounterparty
          key="edit"
          companyId={companyId}
          role={role}
          counterparty={counterparty}
          {...control}
        />
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: t("common.delete"),
      danger: true,
      dialog: (control) => (
        <DeleteCounterparty
          key="delete"
          companyId={companyId}
          role={role}
          counterparty={counterparty}
          {...control}
        />
      ),
    })
  }

  return <ItemActions label={t("common.actions")} actions={actions} />
}

// ─── Campos compartidos ──────────────────────────────────────────────────────

/**
 * Los mismos campos para el alta y para la edición.
 *
 * Duplicarlos deja dos formularios que se parecen y no coinciden: el primero que gane un campo lo
 * gana solo, y quien edite no puede tocar lo que sí pudo escribir al crear.
 */
function Fields({
  state,
  counterparty,
}: {
  state: { fieldErrors: ReadonlyMap<string, string> }
  counterparty?: CounterpartySummary
}) {
  const t = useTranslations()
  const snapshot = counterparty?.snapshot ?? {}

  return (
    <>
      <Field label={t("directory.alias")} error={state.fieldErrors.get("alias")} required>
        {(ids) => (
          <Input
            {...ids}
            name="alias"
            autoFocus
            defaultValue={counterparty?.alias ?? ""}
            placeholder={t("directory.aliasHint")}
          />
        )}
      </Field>

      <div className="grid gap-4 tablet:grid-cols-2">
        <Field label={t("directory.name")} error={state.fieldErrors.get("snapshot.name")}>
          {(ids) => <Input {...ids} name="name" defaultValue={snapshot.name ?? ""} />}
        </Field>

        <Field label={t("directory.lastname")}>
          {(ids) => <Input {...ids} name="lastname" defaultValue={snapshot.lastname ?? ""} />}
        </Field>
      </div>

      <Field
        label={t("auth.email")}
        error={state.fieldErrors.get("email")}
        // Sólo al crear: el correo es lo que decide si queda atada a una cuenta, y cambiarlo
        // después no re-ata nada. Prometer menos y cumplirlo es mejor que un cambio que no surte
        // efecto.
        hint={counterparty ? undefined : t("directory.emailHint")}
      >
        {(ids) => (
          <Input
            {...ids}
            name="email"
            type="email"
            defaultValue={snapshot.email ?? ""}
            disabled={counterparty !== undefined && counterparty.userId !== null}
          />
        )}
      </Field>

      <div className="grid gap-4 tablet:grid-cols-2">
        <Field label={t("directory.phone")}>
          {(ids) => <Input {...ids} name="phone" type="tel" defaultValue={snapshot.phone ?? ""} />}
        </Field>

        <Field label={t("directory.taxId")}>
          {(ids) => <Input {...ids} name="taxId" defaultValue={snapshot.taxId ?? ""} />}
        </Field>
      </div>

      <Field label={t("directory.companyName")}>
        {(ids) => <Input {...ids} name="companyName" defaultValue={snapshot.companyName ?? ""} />}
      </Field>
    </>
  )
}

/** Los datos copiados, sin las claves vacías: escribirlas borraría lo que ya hubiera. */
function snapshotOf(data: FormData): Record<string, string> {
  const snapshot: Record<string, string> = {}

  for (const key of ["name", "lastname", "phone", "taxId", "companyName"]) {
    const value = optional(data, key)
    if (value) snapshot[key] = value
  }

  return snapshot
}
