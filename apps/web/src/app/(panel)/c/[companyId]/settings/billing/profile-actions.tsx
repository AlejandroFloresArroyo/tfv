"use client"

import { Button } from "@tfv/ui"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { api } from "~/lib/api.client.ts"
import { maskClabe, type ProfileRow } from "./profile.ts"

/** Entrada al asistente. Es un enlace y no un diálogo: el alta vive en su propia dirección. */
export function NewProfile({ companyId }: { companyId: string }) {
  const t = useTranslations()

  return (
    <Button size="sm" asChild>
      <Link href={`/c/${companyId}/settings/billing/new`}>{t("billing.profiles.add")}</Link>
    </Button>
  )
}

/**
 * Lo que se puede hacer con un perfil.
 *
 * **Marcar como primario no se ofrece en el que ya lo es**, y verificar no se ofrece en el que ya
 * está verificado: una acción que no hace nada gasta la atención de quien abre el menú buscando la
 * que sí.
 */
export function ProfileActions({
  companyId,
  profile,
  canEdit,
  canSetPrimary,
  canDelete,
}: {
  companyId: string
  profile: ProfileRow
  canEdit: boolean
  canSetPrimary: boolean
  canDelete: boolean
}) {
  const t = useTranslations()
  const [verifying, setVerifying] = useState(false)

  const actions: ItemAction[] = []

  if (canSetPrimary && !profile.isPrimary) {
    actions.push({
      key: "primary",
      label: t("billing.profiles.makePrimary"),
      dialog: (control) => (
        <FormDialog
          {...control}
          title={t("billing.profiles.makePrimaryTitle", { alias: profile.alias })}
          description={t("billing.profiles.makePrimaryBody")}
          submitLabel={t("billing.profiles.makePrimarySubmit")}
          size="sm"
          action={() =>
            api(`/companies/${companyId}/billing-profiles/${profile.id}/primary`, {
              method: "POST",
              body: {},
            })
          }
        >
          {() => null}
        </FormDialog>
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: t("common.delete"),
      danger: true,
      dialog: (control) => (
        <ConfirmDestructive
          {...control}
          title={t("billing.profiles.deleteTitle")}
          entity={profile.alias}
          // Lo que se lleva por delante: la cuenta de comercio del procesador. Enumerarlo es lo que
          // convierte la baja en una decisión y no en una sorpresa.
          cascade={[
            `${t("billing.profiles.clabe")} ${maskClabe(profile.bank.clabe)}`,
            ...(profile.isPrimary ? [t("billing.profiles.primary")] : []),
          ]}
          confirmLabel={t("common.delete")}
          action={() =>
            api(`/companies/${companyId}/billing-profiles/${profile.id}`, { method: "DELETE" })
          }
        />
      ),
    })
  }

  return (
    <div className="flex items-center gap-1">
      {canEdit && profile.verificationStatus !== "verified" ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={verifying}
          onClick={async () => {
            setVerifying(true)
            try {
              // El enlace es de un solo uso y lo emite el procesador al pedirlo: no se puede
              // precargar en un `href`, porque caducaría antes de que nadie lo pulse.
              const { url } = await api<{ url: string }>(
                `/companies/${companyId}/billing-profiles/${profile.id}/verification-link`,
                { method: "POST", body: {} },
              )
              window.location.assign(url)
            } finally {
              setVerifying(false)
            }
          }}
        >
          {t("billing.profiles.verify")}
        </Button>
      ) : null}

      <ItemActions label={t("common.actions")} actions={actions} />
    </div>
  )
}
