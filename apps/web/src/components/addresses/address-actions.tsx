"use client"

import { Button, Checkbox, DialogTrigger, Field, Input } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import { type AddressSummary, type Book, describe } from "./address.ts"

export function CreateAddress({ book }: { book: Book }) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("addresses.createTitle")}
      description={t("addresses.createBody")}
      submitLabel={t("common.create")}
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">{t("addresses.create")}</Button>
        </DialogTrigger>
      }
      action={(data) => api(book.base, { method: "POST", body: bodyOf(data) })}
    >
      {(state) => <Fields state={state} book={book} />}
    </FormDialog>
  )
}

function EditAddress({
  book,
  address,
  open,
  onOpenChange,
}: {
  book: Book
  address: AddressSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("addresses.editTitle")}
      submitLabel={t("common.save")}
      open={open}
      onOpenChange={onOpenChange}
      action={(data) => api(`${book.base}/${address.id}`, { method: "PATCH", body: bodyOf(data) })}
    >
      {(state) => <Fields state={state} book={book} address={address} />}
    </FormDialog>
  )
}

/**
 * Marcar como primaria.
 *
 * Es una acción y no una casilla dentro del formulario de edición porque **desmarca otra**: quien
 * la pulsa está cambiando dos direcciones, y eso merece decirse antes y no descubrirse después.
 */
function MakePrimary({
  book,
  address,
  open,
  onOpenChange,
}: {
  book: Book
  address: AddressSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("addresses.makePrimaryTitle")}
      description={t("addresses.makePrimaryBody")}
      submitLabel={t("addresses.makePrimary")}
      size="sm"
      open={open}
      onOpenChange={onOpenChange}
      action={() =>
        api(`${book.base}/${address.id}`, { method: "PATCH", body: { isPrimary: true } })
      }
    >
      {() => <p className="text-body1 text-content">{describe(address)}</p>}
    </FormDialog>
  )
}

function DeleteAddress({
  book,
  address,
  open,
  onOpenChange,
}: {
  book: Book
  address: AddressSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()

  return (
    <ConfirmDestructive
      title={t("addresses.deleteTitle")}
      entity={address.label || describe(address)}
      // Eliminar la primaria promueve a otra, y la sustituta es la más antigua de las que quedan.
      // Decirlo antes evita la sorpresa de que el origen de los envíos cambie solo.
      cascade={address.isPrimary ? [t("addresses.deletePrimaryCascade")] : []}
      confirmLabel={t("common.delete")}
      open={open}
      onOpenChange={onOpenChange}
      action={() => api(`${book.base}/${address.id}`, { method: "DELETE" })}
    />
  )
}

export function AddressActions({
  book,
  address,
  canEdit,
  canSetPrimary,
  canDelete,
}: {
  book: Book
  address: AddressSummary
  canEdit: boolean
  canSetPrimary: boolean
  canDelete: boolean
}) {
  const t = useTranslations()
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: t("common.edit"),
      dialog: (control) => <EditAddress key="edit" book={book} address={address} {...control} />,
    })
  }

  // No se ofrece marcar la que ya lo es: una acción que no hace nada es peor que no ofrecerla.
  if (canSetPrimary && !address.isPrimary) {
    actions.push({
      key: "primary",
      label: t("addresses.makePrimary"),
      dialog: (control) => <MakePrimary key="primary" book={book} address={address} {...control} />,
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: t("common.delete"),
      danger: true,
      dialog: (control) => (
        <DeleteAddress key="delete" book={book} address={address} {...control} />
      ),
    })
  }

  return <ItemActions label={t("common.actions")} actions={actions} />
}

// ─── Campos compartidos ──────────────────────────────────────────────────────

function Fields({
  state,
  book,
  address,
}: {
  state: { fieldErrors: ReadonlyMap<string, string> }
  book: Book
  address?: AddressSummary
}) {
  const t = useTranslations()

  /**
   * Sólo al crear, y sólo si la libreta ya tiene alguna.
   *
   * La primera dirección de una libreta vacía nace primaria sin que nadie lo pida, así que ofrecer
   * la casilla ahí sería ofrecer marcar lo que ya va marcado.
   */
  const [isPrimary, setIsPrimary] = useState(false)

  return (
    <>
      <Field
        label={t("addresses.label")}
        hint={t("addresses.labelHint")}
        error={state.fieldErrors.get("label")}
      >
        {(ids) => (
          <Input
            {...ids}
            name="label"
            autoFocus
            defaultValue={address?.label ?? ""}
            placeholder={
              book.kind === "user"
                ? t("addresses.labelPlaceholderMine")
                : t("addresses.labelPlaceholder")
            }
          />
        )}
      </Field>

      <div className="grid gap-4 tablet:grid-cols-[1fr_8rem]">
        <Field label={t("addresses.street")} error={state.fieldErrors.get("street")}>
          {(ids) => <Input {...ids} name="street" defaultValue={address?.street ?? ""} />}
        </Field>

        <Field label={t("addresses.number")}>
          {(ids) => <Input {...ids} name="number" defaultValue={address?.number ?? ""} />}
        </Field>
      </div>

      <div className="grid gap-4 tablet:grid-cols-2">
        <Field label={t("addresses.colony")}>
          {(ids) => <Input {...ids} name="colony" defaultValue={address?.colony ?? ""} />}
        </Field>

        <Field label={t("addresses.postalCode")} error={state.fieldErrors.get("postalCode")}>
          {(ids) => <Input {...ids} name="postalCode" defaultValue={address?.postalCode ?? ""} />}
        </Field>
      </div>

      <div className="grid gap-4 tablet:grid-cols-2">
        <Field label={t("addresses.city")} error={state.fieldErrors.get("city")}>
          {(ids) => <Input {...ids} name="city" defaultValue={address?.city ?? ""} />}
        </Field>

        <Field label={t("addresses.state")}>
          {(ids) => <Input {...ids} name="state" defaultValue={address?.state ?? ""} />}
        </Field>
      </div>

      <div className="grid gap-4 tablet:grid-cols-[1fr_8rem]">
        <Field label={t("addresses.country")}>
          {(ids) => <Input {...ids} name="country" defaultValue={address?.country ?? "México"} />}
        </Field>

        <Field
          label={t("addresses.countryCode")}
          error={state.fieldErrors.get("countryCode")}
          hint={t("addresses.countryCodeHint")}
        >
          {(ids) => (
            <Input
              {...ids}
              name="countryCode"
              maxLength={2}
              defaultValue={address?.countryCode ?? "MX"}
              className="uppercase"
            />
          )}
        </Field>
      </div>

      {address ? null : (
        <Checkbox
          name="isPrimary"
          checked={isPrimary}
          onCheckedChange={(value) => setIsPrimary(value === true)}
          label={t("addresses.isPrimary")}
          hint={t("addresses.isPrimaryHint")}
        />
      )}
    </>
  )
}

/**
 * El cuerpo de la petición.
 *
 * El código de país va en mayúsculas porque el esquema exige dos letras y quien escribe «mx» no
 * está equivocándose: está escribiendo en minúsculas.
 */
function bodyOf(data: FormData): Record<string, unknown> {
  const countryCode = optional(data, "countryCode")?.toUpperCase()

  return {
    label: text(data, "label"),
    street: text(data, "street"),
    number: text(data, "number"),
    colony: text(data, "colony"),
    city: text(data, "city"),
    state: text(data, "state"),
    country: text(data, "country"),
    postalCode: text(data, "postalCode"),
    ...(countryCode ? { countryCode } : {}),
    ...(data.get("isPrimary") === "on" ? { isPrimary: true } : {}),
  }
}
