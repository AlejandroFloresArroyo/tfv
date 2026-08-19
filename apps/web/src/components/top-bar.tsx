import { Badge } from "@tfv/ui"
import { Bell } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Logo } from "~/components/logo.tsx"
import { PreferencesMenu } from "~/components/preferences-menu.tsx"
import { UserMenu } from "~/components/user-menu.tsx"
import { apiGet } from "~/lib/api.server.ts"
import type { Profile } from "~/lib/session.ts"
import type { Theme } from "~/lib/theme.ts"

/** Barra superior del panel: marca, marca de plataforma, avisos, preferencias y cuenta. */
export async function TopBar({ profile, theme }: { profile: Profile; theme: Theme }) {
  const t = await getTranslations()

  // El contador se resuelve en el servidor con el resto de la página. No hay sondeo: una campana
  // que pregunta cada diez segundos es una petición por persona y por minuto para un número que
  // casi nunca cambia. Se pone al día en cada navegación, que es cuando se mira.
  const counts = await apiGet<{ unread: number }>("/me/notifications/counts")
  const unread = counts.ok ? counts.data.unread : 0

  return (
    <header className="sticky top-0 z-(--z-nav) border-b border-line bg-panel/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-(--breakpoint-desktop) items-center gap-3 px-4 tablet:px-6">
        <Link href="/dashboard" className="rounded-sm">
          <Logo />
        </Link>

        {profile.isPlatformAdmin ? (
          <Badge tone="accent" className="hidden tablet:inline-flex">
            {t("shell.platformAdmin")}
          </Badge>
        ) : null}

        <div className="flex-1" />

        <Link
          href="/account/notifications"
          // El número va en el nombre accesible y no sólo en el punto de color: un punto no dice
          // cuántas hay, y quien no lo ve no se entera de que hay algo.
          aria-label={
            unread > 0
              ? t("notifications.bellWithCount", { count: unread })
              : t("notifications.bell")
          }
          className="relative rounded-sm p-2 text-content-muted transition-colors hover:bg-panel-hover hover:text-content"
        >
          <Bell className="size-4.5" aria-hidden="true" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 size-2 rounded-full bg-accent"
            />
          ) : null}
        </Link>

        <PreferencesMenu theme={theme} />
        <UserMenu profile={profile} />
      </div>
    </header>
  )
}
