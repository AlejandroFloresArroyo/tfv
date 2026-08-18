import { Callout } from "@tfv/ui"
import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AuthCard } from "~/components/auth-card.tsx"
import { readProfile } from "~/lib/session.ts"
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
  const profile = await readProfile()
  const destination = profile ? "/account" : "/login"

  return (
    <AuthCard
      title={t("auth.verify.title")}
      footer={
        <Link
          href={destination}
          className="font-semibold text-content underline underline-offset-2"
        >
          {profile ? t("auth.verify.back") : t("auth.forgot.backToLogin")}
        </Link>
      }
    >
      {token ? (
        <VerifyEmail token={token} signedIn={profile !== null} />
      ) : (
        <Callout tone="warning">{t("auth.verify.missingToken")}</Callout>
      )}
    </AuthCard>
  )
}
