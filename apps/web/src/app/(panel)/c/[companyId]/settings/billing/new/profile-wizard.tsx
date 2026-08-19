"use client"

import {
  createMerchantProfileInput,
  isOfLegalAge,
  MERCHANT_BUSINESS_TYPES,
} from "@tfv/contracts/billing"
import {
  Checkbox,
  Field,
  Input,
  Panel,
  Select,
  Wizard,
  type WizardState,
  type WizardStepView,
  wizard,
} from "@tfv/ui"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useMemo, useState } from "react"
import { ApiError, api } from "~/lib/api.client.ts"
import { type FieldErrorCode, fieldErrors } from "~/lib/field-errors.ts"

/**
 * Alta de un perfil de facturación, en cuatro pasos.
 *
 * Cada paso valida con **el esquema del servidor** (`@tfv/contracts/billing`), no con una copia:
 * lo que aquí deja pasar es exactamente lo que allí se admite. La CLABE y la mayoría de edad son las
 * dos reglas que la spec exige comprobar *antes* de hablar con el procesador, y comprobarlas también
 * aquí es lo que evita que alguien recorra cuatro pasos para que el último los rechace.
 *
 * El último paso es un resumen sin campos. No está para rellenar hueco: es donde se dice que
 * continuar **acepta los términos del procesador**, y aceptar términos sin verlos escritos en la
 * pantalla donde se aceptan no es aceptarlos.
 */

interface Values {
  alias: string
  businessType: string
  legalName: string
  taxId: string
  taxRegime: string
  invoiceUse: string
  email: string

  bankName: string
  holderType: string
  holder: string
  clabe: string
  currency: string

  repName: string
  repLastname: string
  repTaxId: string
  day: string
  month: string
  year: string
  line1: string
  city: string
  state: string
  postalCode: string
  relationshipTitle: string
  isOwner: boolean
}

const INITIAL: Values = {
  alias: "",
  businessType: "company",
  legalName: "",
  taxId: "",
  taxRegime: "",
  invoiceUse: "",
  email: "",
  bankName: "",
  holderType: "company",
  holder: "",
  clabe: "",
  currency: "MXN",
  repName: "",
  repLastname: "",
  repTaxId: "",
  day: "",
  month: "",
  year: "",
  line1: "",
  city: "",
  state: "",
  postalCode: "",
  relationshipTitle: "",
  isOwner: false,
}

const trimmed = (value: string): string | undefined => value.trim() || undefined

function birthdateOf(values: Values): { day: number; month: number; year: number } {
  return { day: Number(values.day), month: Number(values.month), year: Number(values.year) }
}

function body(values: Values): Record<string, unknown> {
  return {
    alias: values.alias.trim(),
    business: {
      type: values.businessType,
      legalName: values.legalName.trim(),
      taxId: values.taxId.trim(),
      ...(trimmed(values.taxRegime) === undefined ? {} : { taxRegime: trimmed(values.taxRegime) }),
      ...(trimmed(values.invoiceUse) === undefined
        ? {}
        : { invoiceUse: trimmed(values.invoiceUse) }),
      ...(trimmed(values.email) === undefined ? {} : { email: trimmed(values.email) }),
    },
    bank: {
      ...(trimmed(values.bankName) === undefined ? {} : { bankName: trimmed(values.bankName) }),
      holderType: values.holderType,
      holder: values.holder.trim(),
      clabe: values.clabe.trim(),
      currency: values.currency,
      country: "MX",
    },
    representative: {
      name: values.repName.trim(),
      lastname: values.repLastname.trim(),
      ...(trimmed(values.repTaxId) === undefined ? {} : { taxId: trimmed(values.repTaxId) }),
      birthdate: birthdateOf(values),
      address: {
        line1: values.line1.trim(),
        city: values.city.trim(),
        state: values.state.trim(),
        postalCode: values.postalCode.trim(),
        country: "MX",
      },
      relationship: {
        ...(trimmed(values.relationshipTitle) === undefined
          ? {}
          : { title: trimmed(values.relationshipTitle) }),
        isRepresentative: true,
        isOwner: values.isOwner,
      },
    },
  }
}

export function ProfileWizard({ companyId }: { companyId: string }) {
  const t = useTranslations()
  const router = useRouter()

  const [values, setValues] = useState<Values>(INITIAL)
  const [state, setState] = useState<WizardState>(wizard.start())
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const say = useCallback((code: FieldErrorCode) => t(`forms.errors.${code}`), [t])

  const edit = useCallback((patch: Partial<Values>) => {
    setValues((current) => ({ ...current, ...patch }))
  }, [])

  const steps = useMemo<readonly WizardStepView<Values>[]>(
    () => [
      {
        id: "business",
        label: t("billing.profiles.steps.business"),
        validate: (current) =>
          fieldErrors(
            createMerchantProfileInput
              .pick({ alias: true, business: true })
              .safeParse({ alias: current.alias.trim(), business: body(current).business }),
            say,
          ),
        content: (errors) => (
          <div className="flex flex-col gap-4">
            <Field
              label={t("billing.profiles.alias")}
              hint={t("billing.profiles.aliasHint")}
              required
              error={errors.alias}
            >
              {(ids) => (
                <Input
                  {...ids}
                  value={values.alias}
                  onChange={(event) => edit({ alias: event.target.value })}
                  autoFocus
                />
              )}
            </Field>

            <Field label={t("billing.profiles.businessType")} required>
              {(ids) => (
                <Select
                  {...ids}
                  value={values.businessType}
                  onChange={(event) => edit({ businessType: event.target.value })}
                >
                  {MERCHANT_BUSINESS_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`billing.profiles.types.${type}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              label={t("billing.profiles.legalName")}
              required
              error={errors["business.legalName"]}
            >
              {(ids) => (
                <Input
                  {...ids}
                  value={values.legalName}
                  onChange={(event) => edit({ legalName: event.target.value })}
                />
              )}
            </Field>

            <Field label={t("billing.profiles.taxId")} required error={errors["business.taxId"]}>
              {(ids) => (
                <Input
                  {...ids}
                  value={values.taxId}
                  onChange={(event) => edit({ taxId: event.target.value.toUpperCase() })}
                />
              )}
            </Field>

            <div className="grid gap-4 tablet:grid-cols-2">
              <Field label={t("billing.profiles.taxRegime")}>
                {(ids) => (
                  <Input
                    {...ids}
                    value={values.taxRegime}
                    onChange={(event) => edit({ taxRegime: event.target.value })}
                  />
                )}
              </Field>

              <Field label={t("billing.profiles.invoiceUse")}>
                {(ids) => (
                  <Input
                    {...ids}
                    value={values.invoiceUse}
                    onChange={(event) => edit({ invoiceUse: event.target.value })}
                  />
                )}
              </Field>
            </div>

            <Field label={t("billing.profiles.email")} error={errors["business.email"]}>
              {(ids) => (
                <Input
                  {...ids}
                  type="email"
                  value={values.email}
                  onChange={(event) => edit({ email: event.target.value })}
                />
              )}
            </Field>
          </div>
        ),
      },

      {
        id: "bank",
        label: t("billing.profiles.steps.bank"),
        validate: (current) =>
          fieldErrors(
            createMerchantProfileInput.pick({ bank: true }).safeParse({ bank: body(current).bank }),
            say,
          ),
        content: (errors) => (
          <div className="flex flex-col gap-4">
            <Field label={t("billing.profiles.bankName")}>
              {(ids) => (
                <Input
                  {...ids}
                  value={values.bankName}
                  onChange={(event) => edit({ bankName: event.target.value })}
                />
              )}
            </Field>

            <Field label={t("billing.profiles.holderType")} required>
              {(ids) => (
                <Select
                  {...ids}
                  value={values.holderType}
                  onChange={(event) => edit({ holderType: event.target.value })}
                >
                  <option value="company">{t("billing.profiles.types.company")}</option>
                  <option value="individual">{t("billing.profiles.types.individual")}</option>
                </Select>
              )}
            </Field>

            <Field label={t("billing.profiles.holder")} required error={errors["bank.holder"]}>
              {(ids) => (
                <Input
                  {...ids}
                  value={values.holder}
                  onChange={(event) => edit({ holder: event.target.value })}
                />
              )}
            </Field>

            <Field
              label={t("billing.profiles.clabe")}
              hint={t("billing.profiles.clabeHint")}
              required
              error={errors["bank.clabe"]}
            >
              {(ids) => (
                <Input
                  {...ids}
                  inputMode="numeric"
                  maxLength={18}
                  value={values.clabe}
                  onChange={(event) => edit({ clabe: event.target.value.replace(/\D/g, "") })}
                />
              )}
            </Field>

            <Field label={t("billing.profiles.currency")} required>
              {(ids) => (
                <Select
                  {...ids}
                  value={values.currency}
                  onChange={(event) => edit({ currency: event.target.value })}
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                </Select>
              )}
            </Field>
          </div>
        ),
      },

      {
        id: "representative",
        label: t("billing.profiles.steps.representative"),
        validate: (current) => {
          const errors = fieldErrors(
            createMerchantProfileInput
              .pick({ representative: true })
              .safeParse({ representative: body(current).representative }),
            say,
          )

          // La mayoría de edad no la puede expresar el esquema —depende de hoy—, así que se
          // comprueba aparte con la misma función que usa el servidor. Descubrirlo aquí y no al
          // enviar es la diferencia entre corregir un campo y rehacer cuatro pasos.
          if (Object.keys(errors).length === 0 && !isOfLegalAge(birthdateOf(current), new Date())) {
            return { "representative.birthdate": t("billing.profiles.birthdateHint") }
          }

          return errors
        },
        content: (errors) => (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 tablet:grid-cols-2">
              <Field
                label={t("billing.profiles.repName")}
                required
                error={errors["representative.name"]}
              >
                {(ids) => (
                  <Input
                    {...ids}
                    value={values.repName}
                    onChange={(event) => edit({ repName: event.target.value })}
                  />
                )}
              </Field>

              <Field
                label={t("billing.profiles.repLastname")}
                required
                error={errors["representative.lastname"]}
              >
                {(ids) => (
                  <Input
                    {...ids}
                    value={values.repLastname}
                    onChange={(event) => edit({ repLastname: event.target.value })}
                  />
                )}
              </Field>
            </div>

            <Field label={t("billing.profiles.repTaxId")}>
              {(ids) => (
                <Input
                  {...ids}
                  value={values.repTaxId}
                  onChange={(event) => edit({ repTaxId: event.target.value.toUpperCase() })}
                />
              )}
            </Field>

            <Field
              label={t("billing.profiles.birthdate")}
              hint={t("billing.profiles.birthdateHint")}
              required
              error={errors["representative.birthdate"]}
            >
              {(ids) => (
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    {...ids}
                    inputMode="numeric"
                    placeholder={t("billing.profiles.day")}
                    value={values.day}
                    onChange={(event) => edit({ day: event.target.value.replace(/\D/g, "") })}
                  />
                  <Input
                    inputMode="numeric"
                    aria-label={t("billing.profiles.month")}
                    placeholder={t("billing.profiles.month")}
                    value={values.month}
                    onChange={(event) => edit({ month: event.target.value.replace(/\D/g, "") })}
                  />
                  <Input
                    inputMode="numeric"
                    aria-label={t("billing.profiles.year")}
                    placeholder={t("billing.profiles.year")}
                    value={values.year}
                    onChange={(event) => edit({ year: event.target.value.replace(/\D/g, "") })}
                  />
                </div>
              )}
            </Field>

            <Field
              label={t("billing.profiles.line1")}
              required
              error={errors["representative.address.line1"]}
            >
              {(ids) => (
                <Input
                  {...ids}
                  value={values.line1}
                  onChange={(event) => edit({ line1: event.target.value })}
                />
              )}
            </Field>

            <div className="grid gap-4 tablet:grid-cols-3">
              <Field
                label={t("billing.profiles.city")}
                required
                error={errors["representative.address.city"]}
              >
                {(ids) => (
                  <Input
                    {...ids}
                    value={values.city}
                    onChange={(event) => edit({ city: event.target.value })}
                  />
                )}
              </Field>

              <Field
                label={t("billing.profiles.state")}
                required
                error={errors["representative.address.state"]}
              >
                {(ids) => (
                  <Input
                    {...ids}
                    value={values.state}
                    onChange={(event) => edit({ state: event.target.value })}
                  />
                )}
              </Field>

              <Field
                label={t("billing.profiles.postalCode")}
                required
                error={errors["representative.address.postalCode"]}
              >
                {(ids) => (
                  <Input
                    {...ids}
                    inputMode="numeric"
                    value={values.postalCode}
                    onChange={(event) => edit({ postalCode: event.target.value })}
                  />
                )}
              </Field>
            </div>

            <Field label={t("billing.profiles.relationshipTitle")}>
              {(ids) => (
                <Input
                  {...ids}
                  value={values.relationshipTitle}
                  onChange={(event) => edit({ relationshipTitle: event.target.value })}
                />
              )}
            </Field>

            <Checkbox
              checked={values.isOwner}
              onCheckedChange={(next) => edit({ isOwner: next === true })}
              label={t("billing.profiles.isOwner")}
            />
          </div>
        ),
      },

      {
        id: "review",
        label: t("billing.profiles.steps.review"),
        content: () => (
          <div className="flex flex-col gap-3">
            <dl className="grid gap-2 text-body2">
              <Row label={t("billing.profiles.alias")} value={values.alias} />
              <Row label={t("billing.profiles.legalName")} value={values.legalName} />
              <Row label={t("billing.profiles.taxId")} value={values.taxId} />
              <Row label={t("billing.profiles.holder")} value={values.holder} />
              <Row
                label={t("billing.profiles.clabe")}
                value={values.clabe ? `•••• ${values.clabe.slice(-4)}` : ""}
              />
              <Row
                label={t("billing.profiles.repName")}
                value={`${values.repName} ${values.repLastname}`.trim()}
              />
            </dl>

            <p className="text-body3 text-content-faint">{t("billing.profiles.reviewNote")}</p>
          </div>
        ),
      },
    ],
    [t, say, values, edit],
  )

  async function send() {
    const result = wizard.submit(steps, values, state)
    setState(result.state)
    if (result.invalid.length > 0) return

    setPending(true)
    setFailure(null)

    try {
      await api(`/companies/${companyId}/billing-profiles`, { method: "POST", body: body(values) })
      router.push(`/c/${companyId}/settings/billing`)
      router.refresh()
    } catch (error) {
      // El servidor puede rechazar lo que aquí pasó —la CLABE que el banco no reconoce, un alta que
      // el procesador rehúsa—, y ese mensaje es el útil. No se traduce: viene ya redactado.
      setFailure(error instanceof ApiError ? error.message : t("common.unexpectedError"))
      setPending(false)
    }
  }

  return (
    <Panel className="p-5 tablet:p-6">
      <Wizard
        steps={steps}
        values={values}
        state={state}
        onStateChange={setState}
        onSubmit={send}
        onCancel={() => router.push(`/c/${companyId}/settings/billing`)}
        dirty={values.alias !== "" || values.legalName !== "" || values.clabe !== ""}
        pending={pending}
        {...(failure ? { error: failure } : {})}
        labels={{
          back: t("common.back"),
          next: t("common.next"),
          submit: t("billing.wizard.create"),
          cancel: t("common.cancel"),
          counter: (step, total) => t("billing.wizard.counter", { step, total }),
          stepWithError: t("billing.wizard.stepWithError"),
          stepDone: t("billing.wizard.stepDone"),
          discardTitle: t("billing.wizard.discardTitle"),
          discardDescription: t("billing.wizard.discardBody"),
          discardConfirm: t("billing.wizard.discard"),
          discardKeep: t("billing.wizard.keep"),
          close: t("common.close"),
        }}
      />
    </Panel>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-1.5">
      <dt className="text-content-muted">{label}</dt>
      <dd className="font-medium text-content">{value || "—"}</dd>
    </div>
  )
}
