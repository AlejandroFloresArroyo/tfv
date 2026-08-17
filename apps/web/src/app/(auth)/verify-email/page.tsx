import { Callout } from "@tfv/ui"
import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AuthCard } from "~/components/auth-card.tsx"
import { VerifyEmail } from "./verify.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("auth.verify.title") }
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const t = await getTranslations()
  const { token } = await searchParams

  return (
    <AuthCard
      title={t("auth.verify.title")}
      footer={
        <Link href="/login" className="font-semibold text-content underline underline-offset-2">
          {t("auth.forgot.backToLogin")}
        </Link>
      }
    >
      {token ? (
        <VerifyEmail token={token} />
      ) : (
        <Callout tone="warning">{t("auth.verify.missingToken")}</Callout>
      )}
    </AuthCard>
  )
}
