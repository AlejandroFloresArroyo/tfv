import { Callout, Panel } from "@tfv/ui"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { PageShell } from "~/components/page-shell.tsx"
import { isKnownService, SERVICE_SLICE } from "~/lib/services.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"

/**
 * Tercera guarda: **habilitación del servicio**.
 *
 * Dos casos distintos, y la spec pide respuestas distintas:
 *
 * - Servicio que existe pero la empresa no tiene contratado → a la portada de la empresa.
 * - Servicio que no existe → pantalla de no encontrado **dentro del ámbito de la empresa**,
 *   conservando su navegación. Sacar a alguien del ámbito por escribir mal una dirección le hace
 *   perder el sitio donde estaba.
 *
 * El contenido de cada servicio llega con su rebanada. Hasta entonces esta pantalla es la prueba de
 * que las tres guardas encadenan.
 */
export default async function ServicePage({
  params,
}: {
  params: Promise<{ companyId: string; service: string }>
}) {
  const t = await getTranslations()
  const { companyId, service } = await params

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/${service}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const enabled = company.services.find((candidate) => candidate.keycode === service)

  if (!enabled) {
    // Un servicio real que esta empresa no tiene: a su portada.
    if (isKnownService(service)) redirect(`/c/${companyId}`)

    // Un servicio inventado: no encontrado, pero sin salir de la empresa.
    return (
      <PageShell title={t("errors.notFound")}>
        <Callout tone="warning">{t("service.unknown")}</Callout>
      </PageShell>
    )
  }

  const label = isKnownService(service) ? t(`services.${service}`) : enabled.name

  return (
    <PageShell title={label} subtitle={company.name}>
      <Panel className="flex flex-col items-start gap-3 border-dashed p-6">
        <span className="rounded-xs bg-panel-hover px-2 py-0.5 text-body3 font-semibold tracking-wide text-content-faint uppercase">
          {t("dashboard.pendingSlice")}
        </span>
        <p className="text-body1 text-content-muted">
          {t("dashboard.pendingBody", { slice: SERVICE_SLICE[service] ?? "—" })}
        </p>
      </Panel>
    </PageShell>
  )
}
