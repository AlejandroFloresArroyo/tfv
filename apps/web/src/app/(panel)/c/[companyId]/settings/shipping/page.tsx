import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import { type RatesRecord, ShippingRatesForm } from "./shipping-rates-form.tsx"
import { ShippingSimulator } from "./shipping-simulator.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("shipping.title") }
}

/**
 * El cuadro de tarifas de envío de la empresa.
 *
 * Ver `openspec/specs/shipping-rates/spec.md`, requisito «Las tarifas son datos configurables».
 *
 * Vive en configuración y no dentro de un almacén porque las tarifas son **de la empresa**: el
 * mismo cuadro cobra lo que sale de cualquiera de sus naves y lo que vende su tienda de mosaicos.
 * Colgarlo de un almacén obligaría a repetirlo, y dos copias de una tarifa acaban cobrando
 * distinto.
 *
 * El simulador de al lado no calcula nada: **pregunta al servidor**. Es el requisito de la spec
 * —«cuando la interfaz muestre una estimación, SHALL obtenerla del servidor y no calcularla por su
 * cuenta»— y aquí además sirve de comprobación: quien acaba de cambiar una tarifa ve en el acto
 * qué cobrará, sin esperar a una compra real.
 */
export default async function ShippingSettingsPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const t = await getTranslations()
  const { companyId } = await params

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/settings/shipping`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const result = await apiGet<RatesRecord>(`/companies/${companyId}/shipping/rates`)

  if (!result.ok) {
    return (
      <PageShell title={t("shipping.title")} subtitle={t("shipping.subtitle")}>
        <ApiFailure result={result} />
      </PageShell>
    )
  }

  return (
    <PageShell title={t("shipping.title")} subtitle={t("shipping.subtitle")}>
      <div className="grid gap-4 desktop:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ShippingRatesForm
          companyId={companyId}
          rates={result.data}
          canEdit={can(company, "companies.companies.edit")}
        />
        <ShippingSimulator companyId={companyId} currency={result.data.currency} />
      </div>
    </PageShell>
  )
}
