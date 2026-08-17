"use client"

import { Button, DialogTrigger, Field, Input } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"

/**
 * Crear una empresa.
 *
 * **No lleva permiso**, y no es un olvido: un permiso se resuelve dentro de una empresa y aquí
 * todavía no hay ninguna. El catálogo lo refleja — tiene `companies.companies.edit` y `.delete`, y
 * no tiene `.create`.
 *
 * Al terminar se entra directamente en ella. Quien acaba de crear una empresa quiere estar dentro,
 * no volver a un selector donde ahora hay una opción más.
 */
export function CreateCompany() {
  const t = useTranslations()
  const router = useRouter()

  return (
    <FormDialog
      title={t("companies.createTitle")}
      description={t("companies.createBody")}
      submitLabel={t("common.create")}
      size="sm"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            {t("companies.create")}
          </Button>
        </DialogTrigger>
      }
      action={async (data) => {
        const company = await api<{ id: string }>("/companies", {
          method: "POST",
          body: {
            name: text(data, "name"),
            description: optional(data, "description"),
            email: optional(data, "email"),
          },
        })

        router.push(`/c/${company.id}`)
        return company
      }}
    >
      {(state) => (
        <>
          <Field label={t("companies.name")} error={state.fieldErrors.get("name")} required>
            {(ids) => <Input {...ids} name="name" autoFocus />}
          </Field>

          <Field label={t("companies.description")} error={state.fieldErrors.get("description")}>
            {(ids) => <Input {...ids} name="description" />}
          </Field>

          <Field label={t("companies.email")} error={state.fieldErrors.get("email")}>
            {(ids) => <Input {...ids} name="email" type="email" />}
          </Field>
        </>
      )}
    </FormDialog>
  )
}
