"use client"

import { Button, Callout, Field, PasswordInput } from "@tfv/ui"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type FormEvent, useState } from "react"
import { ApiError, api } from "~/lib/api.client.ts"

/**
 * Cambio de contraseña con sesión iniciada.
 *
 * ## Lo que hace que no sea un formulario más
 *
 * **Cambiarla cierra todas las sesiones, incluida ésta.** El servicio revoca la cuenta entera
 * —`changePassword` llama a `revokeAllForUser`— y la ruta borra las credenciales al responder, así
 * que quien la cambia se queda fuera en el mismo acto. Eso se dice **antes** de confirmar: enterarse
 * al aterrizar en la pantalla de acceso es enterarse mal, y quien la cambia desde el teléfono con el
 * portátil abierto en la oficina merece saber que también está cortando aquella.
 *
 * La spec decía que la sesión actual se conservaba y no es lo que ocurre. Corregida bajo la regla 4
 * del plan, y anotado como H-45.
 *
 * ## Por qué hay confirmación de la contraseña nueva
 *
 * Porque justo después hay que volver a escribirla y no queda ninguna sesión desde la que corregir
 * una errata: se recupera el acceso por correo. La API pide dos campos; el tercero es de esta
 * pantalla y no llega a salir de ella.
 *
 * ## Por qué el texto del rechazo no viene de la API
 *
 * Sus mensajes están en español y la aplicación se sirve en dos idiomas. De la respuesta se toma
 * **qué clase de rechazo es** —`422` la actual no coincide, `400` la nueva no cumple— y el texto lo
 * pone la capa de traducción, igual que `field-errors.ts` hace con las incidencias del esquema.
 */
export function ChangePassword() {
  const t = useTranslations("account.passwordChange")
  const common = useTranslations("common")
  const router = useRouter()

  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<ReadonlyMap<string, string>>(new Map())

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = new FormData(event.currentTarget)
    const currentPassword = String(data.get("currentPassword") ?? "")
    const newPassword = String(data.get("newPassword") ?? "")
    const repeated = String(data.get("newPasswordAgain") ?? "")

    // La errata se caza aquí y no en el servidor: el servidor no sabe qué se quiso escribir.
    if (newPassword !== repeated) {
      setError(null)
      setFieldErrors(new Map([["newPasswordAgain", t("mismatch")]]))
      return
    }

    setPending(true)
    setError(null)
    setFieldErrors(new Map())

    try {
      // Sin renovación: la respuesta llega con las credenciales ya borradas, así que un `401` de
      // aquí no es una sesión que recuperar sino la consecuencia del propio cambio.
      await api("/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
        withoutRefresh: true,
      })
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 422) {
        setFieldErrors(new Map([["currentPassword", t("wrongCurrent")]]))
      } else if (failure instanceof ApiError && failure.status === 400) {
        setFieldErrors(new Map([["newPassword", t("rejected")]]))
      } else if (failure instanceof ApiError) {
        setError(failure.message)
      } else {
        setError(common("networkError"))
      }

      setPending(false)
      return
    }

    // Ya no hay sesión con la que volver a dibujar el panel. Se va a acceder directamente, en lugar
    // de dejar que la guarda llegue al mismo sitio dando un rodeo por una pantalla que ya no carga.
    router.replace("/login")
    router.refresh()
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-140 flex-col gap-4">
      <p className="text-body2 text-content-muted">{t("description")}</p>

      {error ? (
        <Callout tone="danger" live>
          {error}
        </Callout>
      ) : null}

      <Field label={t("current")} error={fieldErrors.get("currentPassword")} required>
        {(ids) => (
          <PasswordInput
            {...ids}
            name="currentPassword"
            autoComplete="current-password"
            showLabel={t("show")}
            hideLabel={t("hide")}
          />
        )}
      </Field>

      <Field label={t("new")} hint={t("newHint")} error={fieldErrors.get("newPassword")} required>
        {(ids) => (
          <PasswordInput
            {...ids}
            name="newPassword"
            autoComplete="new-password"
            showLabel={t("show")}
            hideLabel={t("hide")}
          />
        )}
      </Field>

      <Field label={t("again")} error={fieldErrors.get("newPasswordAgain")} required>
        {(ids) => (
          <PasswordInput
            {...ids}
            name="newPasswordAgain"
            autoComplete="new-password"
            showLabel={t("show")}
            hideLabel={t("hide")}
          />
        )}
      </Field>

      {/* La consecuencia, delante del botón y no en la respuesta. */}
      <Callout tone="warning">{t("signsOut")}</Callout>

      <Button type="submit" loading={pending} className="self-start">
        {t("submit")}
      </Button>
    </form>
  )
}
