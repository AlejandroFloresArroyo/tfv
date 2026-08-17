import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AuthCard } from "~/components/auth-card.tsx"
import { safeNext } from "~/lib/session.ts"
import { LoginForm } from "./login-form.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("auth.login.title") }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const t = await getTranslations()
  const { next } = await searchParams

  // `/dashboard` reparte según cuántas empresas tenga la cuenta: la pantalla de acceso no lo sabe.
  const destination = safeNext(next, "/dashboard")

  return (
    <AuthCard
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
      footer={
        <>
          {t("auth.login.noAccount")}{" "}
          <Link
            href="/register"
            className="font-semibold text-content underline underline-offset-2"
          >
            {t("auth.login.register")}
          </Link>
        </>
      }
    >
      <LoginForm next={destination} />
    </AuthCard>
  )
}
