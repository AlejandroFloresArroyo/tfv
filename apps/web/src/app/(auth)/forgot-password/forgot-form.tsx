"use client"

import { Button, Callout, Field, Input } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { type FormEvent, useState } from "react"
import { api } from "~/lib/api.client.ts"

/**
 * Solicitud de restablecimiento.
 *
 * **Responde igual exista o no la cuenta**, y la pantalla lo respeta: mostrar «ese correo no está
 * registrado» convertiría este formulario en un comprobador de qué direcciones tienen cuenta. Es la
 * corrección de S-16.
 *
 * Un fallo de red tampoco cambia el mensaje: distinguirlo dejaría ver, por el tiempo de respuesta o
 * por el texto, lo que el mensaje único oculta.
 */
export function ForgotForm() {
  const t = useTranslations()

  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim()

    setPending(true)
    try {
      const response = await api<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: { email },
        withoutRefresh: true,
      })
      setMessage(response.message)
    } catch {
      setMessage(t("common.networkError"))
      setPending(false)
    }
  }

  if (message) {
    return (
      <Callout tone="info" live>
        {message}
      </Callout>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label={t("auth.email")} required>
        {(ids) => (
          <Input
            {...ids}
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="tu@correo.mx"
          />
        )}
      </Field>

      <Button type="submit" loading={pending} block size="lg">
        {t("auth.forgot.submit")}
      </Button>
    </form>
  )
}
