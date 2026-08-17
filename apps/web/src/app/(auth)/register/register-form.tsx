"use client"

import { Button, Callout, Field, Input, PasswordInput } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { optional, text, useSubmit } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"

/**
 * Alta de cuenta.
 *
 * El registro **no abre sesión**: deja la cuenta sin verificar y encola el enlace. Es la corrección
 * de S-15, donde el alta marcaba el correo como verificado en el acto y la verificación no existía
 * como mecanismo.
 */
export function RegisterForm() {
  const t = useTranslations()
  const [done, setDone] = useState<string | null>(null)

  const form = useSubmit(
    (data) =>
      api<{ message: string }>("/auth/register", {
        method: "POST",
        withoutRefresh: true,
        body: {
          email: text(data, "email"),
          password: String(data.get("password") ?? ""),
          name: text(data, "name"),
          lastname: optional(data, "lastname"),
        },
      }),
    { onDone: (response) => setDone(response.message), refresh: false },
  )

  if (done) {
    return (
      <Callout tone="success" live>
        {done}
      </Callout>
    )
  }

  return (
    <form onSubmit={form.submit} noValidate className="flex flex-col gap-4">
      {form.error ? (
        <Callout tone="danger" live>
          {form.error}
        </Callout>
      ) : null}

      <div className="grid gap-4 tablet:grid-cols-2">
        <Field label={t("auth.register.name")} error={form.fieldErrors.get("name")} required>
          {(ids) => <Input {...ids} name="name" autoComplete="given-name" autoFocus />}
        </Field>

        <Field
          label={t("auth.register.lastname")}
          hint={t("auth.register.lastnameOptional")}
          error={form.fieldErrors.get("lastname")}
        >
          {(ids) => <Input {...ids} name="lastname" autoComplete="family-name" />}
        </Field>
      </div>

      <Field label={t("auth.email")} error={form.fieldErrors.get("email")} required>
        {(ids) => (
          <Input
            {...ids}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tu@correo.mx"
          />
        )}
      </Field>

      <Field
        label={t("auth.password")}
        hint={t("auth.register.passwordHint")}
        error={form.fieldErrors.get("password")}
        required
      >
        {(ids) => (
          <PasswordInput
            {...ids}
            name="password"
            autoComplete="new-password"
            showLabel={t("auth.showPassword")}
            hideLabel={t("auth.hidePassword")}
          />
        )}
      </Field>

      <Button type="submit" loading={form.pending} block size="lg">
        {t("auth.register.submit")}
      </Button>
    </form>
  )
}
