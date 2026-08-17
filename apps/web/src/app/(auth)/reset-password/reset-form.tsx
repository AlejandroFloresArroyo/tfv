"use client"

import { Button, Callout, Field, PasswordInput } from "@tfv/ui"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { type FormEvent, useState } from "react"
import { ApiError, api } from "~/lib/api.client.ts"

/** Fija una contraseña nueva a partir del enlace de un solo uso. Cierra las sesiones anteriores. */
export function ResetForm({ token }: { token: string }) {
  const t = useTranslations()

  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<ReadonlyMap<string, string>>(new Map())
  const [done, setDone] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const password = String(new FormData(event.currentTarget).get("password") ?? "")

    setPending(true)
    setError(null)
    setFieldErrors(new Map())

    try {
      const response = await api<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: { token, password },
        withoutRefresh: true,
      })
      setDone(response.message)
    } catch (failure) {
      if (failure instanceof ApiError) {
        setError(failure.message)
        setFieldErrors(failure.fields)
      } else {
        setError(t("common.networkError"))
      }
      setPending(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Callout tone="success" live>
          {done}
        </Callout>
        <Button asChild block size="lg">
          <Link href="/login">{t("auth.verify.goToLogin")}</Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error ? (
        <Callout tone="danger" live>
          {error}
        </Callout>
      ) : null}

      <Field
        label={t("auth.reset.newPassword")}
        hint={t("auth.register.passwordHint")}
        error={fieldErrors.get("password")}
        required
      >
        {(ids) => (
          <PasswordInput
            {...ids}
            name="password"
            autoComplete="new-password"
            autoFocus
            showLabel={t("auth.showPassword")}
            hideLabel={t("auth.hidePassword")}
          />
        )}
      </Field>

      <Button type="submit" loading={pending} block size="lg">
        {t("auth.reset.submit")}
      </Button>
    </form>
  )
}
