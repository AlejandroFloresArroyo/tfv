import { Badge } from "@tfv/ui"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Logo } from "~/components/logo.tsx"
import { PreferencesMenu } from "~/components/preferences-menu.tsx"
import { UserMenu } from "~/components/user-menu.tsx"
import type { Profile } from "~/lib/session.ts"
import type { Theme } from "~/lib/theme.ts"

/** Barra superior del panel: marca, marca de plataforma, preferencias y cuenta. */
export async function TopBar({ profile, theme }: { profile: Profile; theme: Theme }) {
  const t = await getTranslations()

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

        <PreferencesMenu theme={theme} />
        <UserMenu profile={profile} />
      </div>
    </header>
  )
}
