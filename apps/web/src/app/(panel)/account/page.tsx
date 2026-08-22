import { Badge, Button, Panel, Separator } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { PageShell } from "~/components/page-shell.tsx"
import { requireProfile } from "~/lib/session.ts"
import { ChangeEmail } from "./change-email.tsx"
import { ChangePassword } from "./change-password.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("account.title") }
}

export default async function AccountPage() {
  const t = await getTranslations()
  const path = (await headers()).get("x-pathname") ?? "/account"
  const profile = await requireProfile(path)

  const rows = [
    {
      label: t("auth.register.name"),
      value: [profile.name, profile.lastname].filter(Boolean).join(" "),
    },
    { label: t("auth.email"), value: profile.email },
    { label: t("account.username"), value: profile.username },
  ]

  /**
   * Lo que no se resuelve en esta pantalla sino en la suya.
   *
   * Van juntas y con la misma forma porque son la misma cosa —una puerta— y separarlas obligaría a
   * leer tres veces para descubrir que las tres llevan a otro sitio.
   */
  const doors = [
    {
      title: t("account.sessions.title"),
      body: t("account.sessions.subtitle"),
      href: "/account/sessions",
      label: t("shell.sessions"),
    },
    {
      title: t("account.activity.title"),
      body: t("account.activity.subtitle"),
      href: "/account/activity",
      label: t("account.activity.title"),
    },
    {
      title: t("addresses.mine"),
      body: t("addresses.mineSubtitle"),
      href: "/account/addresses",
      label: t("addresses.mine"),
    },
  ]

  return (
    <PageShell
      title={t("account.title")}
      actions={
        profile.isPlatformAdmin ? (
          <Badge tone="accent">{t("shell.platformAdmin")}</Badge>
        ) : undefined
      }
    >
      <div className="grid gap-4 laptop:grid-cols-3">
        <Panel className="p-5 laptop:col-span-3">
          <h2 className="text-title2 font-bold text-content">{t("account.profile")}</h2>
          <Separator className="my-4" />

          <dl className="flex flex-col gap-3">
            {rows.map((row) => (
              <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-body2 text-content-faint">{row.label}</dt>
                <dd className="text-body1 font-medium text-content">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        {doors.map((door) => (
          <Panel key={door.href} className="flex flex-col p-5">
            <h2 className="text-title2 font-bold text-content">{door.title}</h2>
            <Separator className="my-4" />

            <p className="flex-1 text-body2 text-content-muted">{door.body}</p>

            <Button asChild variant="secondary" className="mt-4 self-start">
              <Link href={door.href}>{door.label}</Link>
            </Button>
          </Panel>
        ))}

        <Panel className="p-5 laptop:col-span-3">
          <h2 className="text-title2 font-bold text-content">
            {t("account.passwordChange.title")}
          </h2>
          <Separator className="my-4" />
          <ChangePassword />
        </Panel>

        <Panel className="p-5 laptop:col-span-3">
          <h2 className="text-title2 font-bold text-content">{t("account.emailChange.title")}</h2>
          <Separator className="my-4" />
          <ChangeEmail currentEmail={profile.email} />
        </Panel>
      </div>
    </PageShell>
  )
}
