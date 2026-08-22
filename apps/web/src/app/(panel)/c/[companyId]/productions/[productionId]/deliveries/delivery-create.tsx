"use client"

import { Button, Callout, DialogTrigger, Field, Input, Select, Textarea } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import { DELIVERY_DIRECTIONS, type DeliveryRow } from "../../production.ts"

/**
 * Abrir una nota de entrega.
 *
 * **La dirección se elige aquí y sólo aquí.** Se fija al abrir la nota y después no cambia: una
 * nota de salida a medio verificar que se convirtiera en devolución dejaría las líneas ya marcadas
 * afirmando algo que nadie comprobó. El servidor tampoco la admite en el parche del encabezado, así
 * que la pantalla no ofrece una puerta que no existe.
 *
 * Al crearla se entra directamente a la nota. No es un atajo de cortesía: una nota recién abierta
 * está vacía y **lo siguiente que hay que hacer es componer su lista**, que sólo se puede hacer
 * dentro. Devolver al listado obligaría a buscar la que se acaba de crear entre las demás.
 */
export function CreateDelivery({
  companyId,
  productionId,
}: {
  companyId: string
  productionId: string
}) {
  const t = useTranslations("productions.deliveries")
  const router = useRouter()

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            {t("create")}
          </Button>
        </DialogTrigger>
      }
      title={t("createTitle")}
      description={t("createBody")}
      submitLabel={t("create")}
      action={async (data) => {
        const created = await api<DeliveryRow>(
          `/companies/${companyId}/productions/${productionId}/deliveries`,
          {
            method: "POST",
            body: {
              name: text(data, "name"),
              direction: text(data, "direction"),
              ...(optional(data, "description") === undefined
                ? {}
                : { description: text(data, "description") }),
            },
          },
        )

        router.push(`/c/${companyId}/productions/${productionId}/deliveries/${created.id}`)
      }}
    >
      {(state) => (
        <>
          <Field label={t("name")} error={state.fieldErrors.get("name")} required>
            {(ids) => (
              <Input
                {...ids}
                name="name"
                autoComplete="off"
                maxLength={250}
                placeholder={t("namePlaceholder")}
              />
            )}
          </Field>

          <Field
            label={t("direction")}
            hint={t("directionHint")}
            error={state.fieldErrors.get("direction")}
            required
          >
            {(ids) => (
              <Select {...ids} name="direction" defaultValue={DELIVERY_DIRECTIONS[0]}>
                {DELIVERY_DIRECTIONS.map((direction) => (
                  <option key={direction} value={direction}>
                    {t(`way.${direction}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t("description")}>
            {(ids) => <Textarea {...ids} name="description" rows={3} maxLength={4000} />}
          </Field>

          <Callout tone="info">{t("directionIsFixed")}</Callout>
        </>
      )}
    </FormDialog>
  )
}
