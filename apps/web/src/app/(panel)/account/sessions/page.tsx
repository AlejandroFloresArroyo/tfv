import type { Metadata } from "next"
import { headers } from "next/headers"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { DataTable } from "~/components/data-table.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { requireProfile } from "~/lib/session.ts"
import { CloseAllButton } from "./close-all-button.tsx"
import { describeUserAgent } from "./user-agent.ts"

interface SessionRow {
  id: string
  userAgent: string | null
  ipAddress: string | null
  lastUsedAt: string | null
  createdAt: string
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("account.sessions.title") }
}

/**
 * Sesiones activas.
 *
 * La pantalla existe porque las sesiones son revocables, y una revocación que nadie puede ejercer
 * no sirve de nada. Ver `openspec/specs/user-accounts/spec.md`.
 */
export default async function SessionsPage() {
  const t = await getTranslations()
  const format = await getFormatter()

  const path = (await headers()).get("x-pathname") ?? "/account/sessions"
  await requireProfile(path)

  const result = await apiGet<{ items: SessionRow[] }>("/auth/sessions")

  if (!result.ok) {
    return (
      <PageShell title={t("account.sessions.title")}>
        <ApiFailure result={result} />
      </PageShell>
    )
  }

  const { items } = result.data

  return (
    <PageShell
      title={t("account.sessions.title")}
      subtitle={t("account.sessions.subtitle")}
      actions={items.length > 0 ? <CloseAllButton /> : undefined}
    >
      <DataTable
        rows={items}
        rowKey={(session) => session.id}
        empty={t("account.sessions.empty")}
        columns={[
          {
            header: t("account.sessions.device"),
            className: "font-medium text-content",
            cell: (session) =>
              describeUserAgent(session.userAgent) ?? t("account.sessions.unknownDevice"),
          },
          {
            header: t("account.sessions.address"),
            className: "font-mono text-body3",
            cell: (session) => session.ipAddress ?? "—",
          },
          {
            header: t("account.sessions.lastUsed"),
            cell: (session) =>
              session.lastUsedAt
                ? format.dateTime(new Date(session.lastUsedAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : t("common.never"),
          },
          {
            header: t("account.sessions.started"),
            cell: (session) =>
              format.dateTime(new Date(session.createdAt), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
          },
        ]}
      />
    </PageShell>
  )
}
