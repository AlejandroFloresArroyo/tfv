"use client"

import { Button, Callout, Spinner } from "@tfv/ui"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import { ApiError, api } from "~/lib/api.client.ts"

type State =
  | { kind: "checking" }
  | { kind: "verified"; message: string }
  | { kind: "rejected"; message: string }

/**
 * Confirmación del correo a partir del enlace.
 *
 * Se canjea al abrir la pantalla, sin pedir un clic: quien llega ya hizo el clic, en el correo.
 *
 * El `useRef` no es adorno. En modo estricto React monta dos veces en desarrollo, y **el token es de
 * un solo uso**: sin la guarda, el segundo canje falla y la pantalla dice «este enlace ya no es
 * válido» sobre un enlace que acababa de funcionar.
 */
export function VerifyEmail({ token }: { token: string }) {
  const t = useTranslations()
  const [state, setState] = useState<State>({ kind: "checking" })
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    api<{ message: string }>("/auth/verify-email", {
      method: "POST",
      body: { token },
      withoutRefresh: true,
    })
      .then((response) => setState({ kind: "verified", message: response.message }))
      .catch((failure: unknown) =>
        setState({
          kind: "rejected",
          message: failure instanceof ApiError ? failure.message : t("common.networkError"),
        }),
      )
  }, [token, t])

  if (state.kind === "checking") {
    return (
      <div className="flex items-center gap-2.5 text-body1 text-content-muted">
        <Spinner label={t("common.loading")} />
        {t("auth.verify.checking")}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Callout tone={state.kind === "verified" ? "success" : "danger"} live>
        {state.message}
      </Callout>

      <Button asChild block size="lg" variant={state.kind === "verified" ? "primary" : "secondary"}>
        <Link href="/login">{t("auth.verify.goToLogin")}</Link>
      </Button>
    </div>
  )
}
