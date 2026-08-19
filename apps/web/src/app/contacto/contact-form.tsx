"use client"

import { Button, Callout, Field, Input, Textarea } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { optional, text, useSubmit } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"

/**
 * El formulario público de contacto.
 *
 * Ver `openspec/specs/user-accounts/spec.md`, requisito «Captura pública de prospectos».
 *
 * **No implementa nada del servidor**: la rebanada 10 dejó los prospectos hechos —su tabla, su
 * captura sin sesión, su acuse encolado y la bandeja de pendientes de la administración de
 * plataforma— y lo único que faltaba era esto. Aquí sólo se cablea.
 *
 * `withoutRefresh` porque quien rellena esto **no tiene sesión**: un `400` de validación aquí no es
 * una sesión caducada, y salir a renovarla devolvería su propio `401` y taparía el mensaje real.
 * Es el mismo motivo por el que lo llevan el registro y el acceso.
 */
export function ContactForm() {
  const t = useTranslations("contact")
  const [done, setDone] = useState<string | null>(null)

  const form = useSubmit(
    (data) =>
      api<{ message: string }>("/prospects", {
        method: "POST",
        withoutRefresh: true,
        body: {
          name: text(data, "name"),
          lastname: optional(data, "lastname"),
          email: text(data, "email"),
          phone: optional(data, "phone"),
          companyName: optional(data, "companyName"),
          message: optional(data, "message"),
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
        <Field label={t("name")} error={form.fieldErrors.get("name")} required>
          {(ids) => <Input {...ids} name="name" autoComplete="given-name" autoFocus />}
        </Field>

        <Field label={t("lastname")} error={form.fieldErrors.get("lastname")}>
          {(ids) => <Input {...ids} name="lastname" autoComplete="family-name" />}
        </Field>
      </div>

      <div className="grid gap-4 tablet:grid-cols-2">
        <Field label={t("email")} error={form.fieldErrors.get("email")} required>
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

        <Field label={t("phone")} error={form.fieldErrors.get("phone")}>
          {(ids) => <Input {...ids} name="phone" type="tel" autoComplete="tel" />}
        </Field>
      </div>

      <Field label={t("companyName")} error={form.fieldErrors.get("companyName")}>
        {(ids) => <Input {...ids} name="companyName" autoComplete="organization" />}
      </Field>

      <Field label={t("message")} error={form.fieldErrors.get("message")}>
        {(ids) => <Textarea {...ids} name="message" rows={5} />}
      </Field>

      <Button type="submit" loading={form.pending} block size="lg">
        {t("submit")}
      </Button>
    </form>
  )
}
