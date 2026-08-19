import { Callout } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { PageShell } from "~/components/page-shell.tsx"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import { ProfileWizard } from "./profile-wizard.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("billing.wizard.newTitle") }
}

/**
 * El asistente de alta, en su propia dirección.
 *
 * En una página y no en un diálogo: son cuatro pasos con veinte campos, y un diálogo de ese tamaño
 * no cabe en un teléfono ni sobrevive a una recarga. Es la misma decisión que el alta de producto.
 */
export default async function NewBillingProfilePage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const t = await getTranslations()
  const { companyId } = await params

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/settings/billing/new`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  return (
    <PageShell title={t("billing.wizard.newTitle")} subtitle={t("billing.wizard.newSubtitle")}>
      {can(company, "companies.billings.create") ? (
        <ProfileWizard companyId={companyId} />
      ) : (
        <Callout tone="danger">{t("billing.wizard.forbidden")}</Callout>
      )}
    </PageShell>
  )
}
