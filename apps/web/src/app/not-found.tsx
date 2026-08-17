import { Button } from "@tfv/ui"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Logo } from "~/components/logo.tsx"

export default async function NotFound() {
  const t = await getTranslations()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-5">
      <Logo />
      <p className="text-h4 font-bold text-content">{t("errors.notFound")}</p>
      <Button asChild variant="secondary">
        <Link href="/dashboard">{t("errors.notFoundAction")}</Link>
      </Button>
    </div>
  )
}
