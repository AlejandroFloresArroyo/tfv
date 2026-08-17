"use client"

import { Button, Callout, Field, Input, PasswordInput } from "@tfv/ui"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { text, useSubmit } from "~/components/use-submit.ts"
import { ApiError, api } from "~/lib/api.client.ts"

/**
 * Inicio de sesión.
 *
 * Ver `openspec/specs/app-shell/spec.md`: entrar **no recarga la página**. La pila anterior fijaba
 * la credencial al cargar el módulo y no tenía otra salida que recargar entera (`DEFECTS.md` F-01).
 * Aquí la credencial es una cookie que el navegador ya trae en la petición siguiente, así que basta
 * con navegar y pedir que el servidor vuelva a resolver las guardas.
 *
 * El destino lo decide el servidor: la pantalla no sabe —ni debe— cuántas empresas tiene quien
 * entra.
 */
export function LoginForm({ next }: { next: string }) {
  const t = useTranslations()
  const router = useRouter()

  /** El único caso con salida propia: falta verificar el correo, y se puede reenviar el enlace. */
  const [unverified, setUnverified] = useState<string | null>(null)
  const [resent, setResent] = useState(false)

  const form = useSubmit(
    async (data) => {
      const email = text(data, "email")
      setUnverified(null)
      setResent(false)

      try {
        await api("/auth/login", {
          method: "POST",
          body: { email, password: String(data.get("password") ?? "") },
          // Un 401 aquí es «contraseña incorrecta», no «sesión caducada».
          withoutRefresh: true,
        })
      } catch (failure) {
        if (failure instanceof ApiError && failure.status === 403) {
          setUnverified(email)
          // Se traga el error: el aviso de verificación ya cuenta lo que pasa, y añadir encima
          // «algo salió mal» sería decir dos cosas distintas del mismo hecho.
          return
        }
        throw failure
      }

      router.replace(next)
    },
    // La navegación ya vuelve a resolver el árbol; refrescar además sería un viaje de más.
    { refresh: false },
  )

  async function resend() {
    if (!unverified) return
    try {
      await api("/auth/resend-verification", {
        method: "POST",
        body: { email: unverified },
        withoutRefresh: true,
      })
    } finally {
      // La API responde igual exista o no la cuenta, así que aquí tampoco se distingue.
      setResent(true)
    }
  }

  return (
    <form onSubmit={form.submit} noValidate className="flex flex-col gap-4">
      {form.error ? (
        <Callout tone="danger" live>
          {form.error}
        </Callout>
      ) : null}

      {unverified ? (
        <Callout tone="warning" live>
          <p>{t("auth.login.resendVerification")}</p>
          {resent ? null : (
            <button
              type="button"
              onClick={resend}
              className="mt-1.5 font-semibold underline underline-offset-2"
            >
              {t("auth.verify.resend")}
            </button>
          )}
        </Callout>
      ) : null}

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

      <Field label={t("auth.password")} required>
        {(ids) => (
          <PasswordInput
            {...ids}
            name="password"
            autoComplete="current-password"
            showLabel={t("auth.showPassword")}
            hideLabel={t("auth.hidePassword")}
          />
        )}
      </Field>

      <Button type="submit" loading={form.pending} block size="lg">
        {t("auth.login.submit")}
      </Button>

      <Link
        href="/forgot-password"
        className="self-start text-body2 text-content-muted underline underline-offset-2 hover:text-content"
      >
        {t("auth.login.forgot")}
      </Link>
    </form>
  )
}
