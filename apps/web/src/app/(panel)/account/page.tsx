import { Badge, Button, Panel, Separator } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { PageShell } from "~/components/page-shell.tsx"
import { requireProfile } from "~/lib/session.ts"
import { ChangeEmail } from "./change-email.tsx"

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

  return (
    <PageShell
      title={t("account.title")}
      actions={
        profile.isPlatformAdmin ? (
          <Badge tone="accent">{t("shell.platformAdmin")}</Badge>
        ) : undefined
      }
    >
      <div className="grid gap-4 laptop:grid-cols-2">
        <Panel className="p-5">
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

        <Panel className="flex flex-col p-5">
          <h2 className="text-title2 font-bold text-content">{t("account.sessions.title")}</h2>
          <Separator className="my-4" />

          <p className="flex-1 text-body2 text-content-muted">{t("account.sessions.subtitle")}</p>

          <Button asChild variant="secondary" className="mt-4 self-start">
            <Link href="/account/sessions">{t("shell.sessions")}</Link>
          </Button>
        </Panel>

        <Panel className="p-5 laptop:col-span-2">
          <h2 className="text-title2 font-bold text-content">{t("account.emailChange.title")}</h2>
          <Separator className="my-4" />
          <ChangeEmail currentEmail={profile.email} />
        </Panel>
      </div>
    </PageShell>
  )
}
