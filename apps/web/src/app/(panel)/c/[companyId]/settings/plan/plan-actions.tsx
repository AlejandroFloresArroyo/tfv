"use client"

import { Button, DialogTrigger, Field, Input, Select } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import type { Plan } from "./plan.ts"

/**
 * Contratar o cambiar de plan.
 *
 * Son el mismo diálogo con dos cuerpos distintos porque son la misma decisión vista desde dos
 * sitios, y la diferencia que importa está escrita en la pantalla: **al cambiar no se piden
 * asientos**, se conservan los contratados. Ofrecer el campo sería ofrecer una forma de perderlos
 * por descuido en la misma petición que cambia el plan.
 */
export function ChoosePlan({
  companyId,
  plan,
  mode,
  seats,
}: {
  companyId: string
  plan: Plan
  mode: "subscribe" | "change"
  seats: number
}) {
  const t = useTranslations()
  const isFree = plan.tier === 0

  return (
    <FormDialog
      title={
        mode === "change"
          ? t("billing.plan.changeTitle", { plan: plan.title })
          : t("billing.plan.chooseTitle", { plan: plan.title })
      }
      description={
        mode === "change"
          ? t("billing.plan.changeBody")
          : isFree
            ? t("billing.plan.freeOneSeat")
            : t("billing.plan.chooseBody")
      }
      submitLabel={
        mode === "change" ? t("billing.plan.changeSubmit") : t("billing.plan.chooseSubmit")
      }
      size="sm"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm" variant={mode === "change" ? "secondary" : "primary"}>
            {mode === "change" ? t("billing.plan.change") : t("billing.plan.choose")}
          </Button>
        </DialogTrigger>
      }
      action={async (data) => {
        if (mode === "change") {
          const changed = await api<{ kind: string; url?: string }>(
            `/companies/${companyId}/subscription`,
            {
              method: "PATCH",
              body: { planId: plan.id, interval: text(data, "interval") },
            },
          )

          // Subir del plan gratuito a uno de pago no es un cambio: no hay suscripción en el
          // procesador que modificar, y nadie ha pagado nada. El servidor lo devuelve como sesión
          // de pago y aquí se va allí.
          if (changed.kind === "checkout" && changed.url) window.location.assign(changed.url)
          return changed
        }

        const result = await api<{ kind: string; url?: string }>(
          `/companies/${companyId}/subscription`,
          {
            method: "POST",
            body: {
              planId: plan.id,
              interval: text(data, "interval"),
              seats: Number(text(data, "seats")),
              ...(optional(data, "promotionCode") === undefined
                ? {}
                : { promotionCode: optional(data, "promotionCode") }),
            },
          },
        )

        // Un plan de pago devuelve la dirección del procesador y hay que ir allí: la suscripción no
        // existe hasta que alguien pague. El gratuito vuelve ya activo y basta con refrescar.
        if (result.kind === "checkout" && result.url) window.location.assign(result.url)
        return result
      }}
    >
      {(state) => (
        <>
          <Field label={t("billing.plan.interval")} error={state.fieldErrors.get("interval")}>
            {(ids) => (
              <Select {...ids} name="interval" defaultValue="month">
                <option value="month">{t("billing.plan.monthly")}</option>
                <option value="year">{t("billing.plan.yearly")}</option>
              </Select>
            )}
          </Field>

          {mode === "subscribe" ? (
            <>
              <Field
                label={t("billing.plan.seats")}
                hint={t("billing.plan.seatsHint")}
                error={state.fieldErrors.get("seats")}
                required
              >
                {(ids) => (
                  <Input
                    {...ids}
                    name="seats"
                    type="number"
                    min={1}
                    max={isFree ? 1 : 500}
                    defaultValue={isFree ? 1 : seats}
                    readOnly={isFree}
                  />
                )}
              </Field>

              {isFree ? null : (
                <Field
                  label={t("billing.plan.promotionCodeLabel")}
                  hint={t("billing.plan.promotionCodeHint")}
                  error={state.fieldErrors.get("promotionCode")}
                >
                  {(ids) => <Input {...ids} name="promotionCode" />}
                </Field>
              )}
            </>
          ) : null}
        </>
      )}
    </FormDialog>
  )
}

/**
 * Cancelar.
 *
 * El texto dice lo que de verdad pasa: surte efecto **al terminar el periodo pagado**, no ahora.
 * Un botón de cancelar que no lo diga hace que la gente espere quedarse fuera hoy, y algunos no lo
 * pulsan por eso.
 */
export function CancelPlan({ companyId }: { companyId: string }) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("billing.plan.cancelTitle")}
      description={t("billing.plan.cancelBody")}
      submitLabel={t("billing.plan.cancelSubmit")}
      tone="danger"
      size="sm"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost">
            {t("billing.plan.cancel")}
          </Button>
        </DialogTrigger>
      }
      action={() =>
        api(`/companies/${companyId}/subscription/cancel`, { method: "POST", body: {} })
      }
    >
      {() => null}
    </FormDialog>
  )
}

export function ReactivatePlan({ companyId }: { companyId: string }) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("billing.plan.reactivateTitle")}
      description={t("billing.plan.reactivateBody")}
      submitLabel={t("billing.plan.reactivateSubmit")}
      size="sm"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">{t("billing.plan.reactivate")}</Button>
        </DialogTrigger>
      }
      action={() =>
        api(`/companies/${companyId}/subscription/reactivate`, { method: "POST", body: {} })
      }
    >
      {() => null}
    </FormDialog>
  )
}
