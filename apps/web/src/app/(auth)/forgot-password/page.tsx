import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AuthCard } from "~/components/auth-card.tsx"
import { ForgotForm } from "./forgot-form.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("auth.forgot.title") }
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations()

  return (
    <AuthCard
      title={t("auth.forgot.title")}
      subtitle={t("auth.forgot.subtitle")}
      footer={
        <Link href="/login" className="font-semibold text-content underline underline-offset-2">
          {t("auth.forgot.backToLogin")}
        </Link>
      }
    >
      <ForgotForm />
    </AuthCard>
  )
}
