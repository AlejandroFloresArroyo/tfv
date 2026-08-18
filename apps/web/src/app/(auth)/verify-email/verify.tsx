"use client"

import { Button, Callout, Spinner } from "@tfv/ui"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import { ApiError, api } from "~/lib/api.client.ts"

type State =
  | { kind: "checking" }
  | { kind: "verified"; message: string; sameSession: boolean }
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
export function VerifyEmail({ token, signedIn }: { token: string; signedIn: boolean }) {
  const t = useTranslations()
  const [state, setState] = useState<State>({ kind: "checking" })
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    api<{ message: string; changed: boolean; sameSession: boolean }>("/auth/verify-email", {
      method: "POST",
      body: { token },
      withoutRefresh: true,
    })
      .then((response) =>
        setState({
          kind: "verified",
          message: t(response.changed ? "auth.verify.updated" : "auth.verify.success"),
          sameSession: response.sameSession,
        }),
      )
      .catch((failure: unknown) => {
        const message =
          failure instanceof ApiError && failure.status === 409
            ? t("auth.verify.occupied")
            : failure instanceof ApiError && failure.status === 400
              ? t("auth.verify.invalidLink")
              : failure instanceof ApiError
                ? failure.message
                : t("common.networkError")
        setState({ kind: "rejected", message })
      })
  }, [token, t])

  if (state.kind === "checking") {
    return (
      <div className="flex items-center gap-2.5 text-body1 text-content-muted">
        <Spinner label={t("common.loading")} />
        {t("auth.verify.checking")}
      </div>
    )
  }

  const returnToAccount = state.kind === "verified" ? state.sameSession : signedIn

  return (
    <div className="flex flex-col gap-4">
      <Callout tone={state.kind === "verified" ? "success" : "danger"} live>
        {state.message}
      </Callout>

      <Button asChild block size="lg" variant={state.kind === "verified" ? "primary" : "secondary"}>
        <Link href={returnToAccount ? "/account" : "/login"}>
          {returnToAccount ? t("auth.verify.continue") : t("auth.verify.goToLogin")}
        </Link>
      </Button>
    </div>
  )
}
