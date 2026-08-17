import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AuthCard } from "~/components/auth-card.tsx"
import { RegisterForm } from "./register-form.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("auth.register.title") }
}

export default async function RegisterPage() {
  const t = await getTranslations()

  return (
    <AuthCard
      title={t("auth.register.title")}
      subtitle={t("auth.register.subtitle")}
      footer={
        <>
          {t("auth.register.hasAccount")}{" "}
          <Link href="/login" className="font-semibold text-content underline underline-offset-2">
            {t("auth.register.login")}
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  )
}
