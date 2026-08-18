import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { Logo } from "~/components/logo.tsx"
import { PreferencesMenu } from "~/components/preferences-menu.tsx"
import { landingPath, readProfile } from "~/lib/session.ts"
import { DEFAULT_THEME, isTheme, THEME_COOKIE } from "~/lib/theme.ts"

/**
 * Superficie de acceso.
 *
 * Ver `openspec/specs/app-shell/spec.md`: «Las pantallas de inicio de sesión, registro y
 * recuperación SHALL redirigir al panel cuando quien las abre ya tiene sesión válida».
 *
 * La comprobación vive en el armazón y no en cada pantalla: puesta en cada una, la siguiente que
 * alguien añada se olvidará de ella.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const pathname = ((await headers()).get("x-pathname") ?? "").split("?", 1)[0]
  const profile = await readProfile()
  // El enlace que confirma un cambio de correo también se abre con sesión iniciada. Es la única
  // pantalla de acceso que necesita dejar pasar a quien ya está dentro.
  if (profile && pathname !== "/verify-email") redirect(landingPath(profile))

  const chosen = (await cookies()).get(THEME_COOKIE)?.value
  const theme = isTheme(chosen) ? chosen : DEFAULT_THEME

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center justify-between px-5 py-4">
        <Logo />
        <PreferencesMenu theme={theme} />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pt-6 pb-16 tablet:items-center tablet:pt-0 tablet:pb-24">
        <div className="w-full max-w-95">{children}</div>
      </main>
    </div>
  )
}
