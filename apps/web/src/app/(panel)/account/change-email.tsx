"use client"

import { Button, Callout, Field, Input } from "@tfv/ui"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type FormEvent, useState } from "react"
import { ApiError, api, SessionExpiredError } from "~/lib/api.client.ts"

interface Result {
  readonly message: string
}

/** Solicita la verificación de una dirección nueva sin sustituir todavía la actual. */
export function ChangeEmail({ currentEmail }: { currentEmail: string }) {
  const t = useTranslations("account.emailChange")
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const newEmail = String(new FormData(event.currentTarget).get("newEmail") ?? "").trim()
    setPending(true)
    setError(null)
    setFieldError(null)

    try {
      await api<Result>("/auth/change-email", { method: "POST", body: { newEmail } })
      setRequestedEmail(newEmail)
    } catch (failure) {
      if (failure instanceof SessionExpiredError) {
        router.replace("/login?next=/account")
        return
      }
      if (failure instanceof ApiError) {
        const semanticError =
          failure.status === 409
            ? t("occupied")
            : failure.status === 422
              ? t("same")
              : failure.status === 400
                ? t("invalid")
                : null
        if (semanticError) setFieldError(semanticError)
        else setError(failure.message)
      } else {
        setError(t("networkError"))
      }
      setPending(false)
    }
  }

  if (requestedEmail) {
    return (
      <Callout tone="success" live>
        {t("sent", { email: requestedEmail })}
      </Callout>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      <p className="text-body2 text-content-muted">{t("description", { email: currentEmail })}</p>

      {error ? (
        <Callout tone="danger" live>
          {error}
        </Callout>
      ) : null}

      <Field label={t("newEmail")} hint={t("hint")} error={fieldError ?? undefined} required>
        {(ids) => (
          <Input
            {...ids}
            name="newEmail"
            type="email"
            autoComplete="email"
            placeholder="nuevo@correo.mx"
          />
        )}
      </Field>

      <Button type="submit" loading={pending} className="self-start">
        {t("submit")}
      </Button>
    </form>
  )
}
