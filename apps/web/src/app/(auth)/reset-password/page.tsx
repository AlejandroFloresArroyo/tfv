import { Callout } from "@tfv/ui"
import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AuthCard } from "~/components/auth-card.tsx"
import { ResetForm } from "./reset-form.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("auth.reset.title") }
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const t = await getTranslations()
  const { token } = await searchParams

  return (
    <AuthCard
      title={t("auth.reset.title")}
      subtitle={t("auth.reset.subtitle")}
      footer={
        <Link href="/login" className="font-semibold text-content underline underline-offset-2">
          {t("auth.forgot.backToLogin")}
        </Link>
      }
    >
      {token ? (
        <ResetForm token={token} />
      ) : (
        <Callout tone="warning">{t("auth.reset.missingToken")}</Callout>
      )}
    </AuthCard>
  )
}
