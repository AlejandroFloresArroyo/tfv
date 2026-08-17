import { cookies, headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { TopBar } from "~/components/top-bar.tsx"
import { requireProfile } from "~/lib/session.ts"
import { DEFAULT_THEME, isTheme, THEME_COOKIE } from "~/lib/theme.ts"

/**
 * Superficie del panel.
 *
 * Primera de las tres guardas anidadas: **sesión**. Las otras dos —empresa y servicio— viven en los
 * armazones de abajo, para que fallar una lleve al nivel inmediatamente superior y no a la raíz.
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations()

  // El camino actual lo pone el middleware: en un componente de servidor no hay forma de leerlo, y
  // sin él la vuelta tras iniciar sesión perdería el destino.
  const path = (await headers()).get("x-pathname") ?? "/dashboard"
  const profile = await requireProfile(path)

  const chosen = (await cookies()).get(THEME_COOKIE)?.value
  const theme = isTheme(chosen) ? chosen : DEFAULT_THEME

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {/* Primer elemento enfocable de la página: quien navega con teclado no tiene que recorrer
          toda la navegación en cada pantalla para llegar al contenido. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-(--z-toast) focus:rounded-sm focus:bg-accent focus:px-4 focus:py-2 focus:text-body2 focus:font-semibold focus:text-on-accent"
      >
        {t("shell.skipToContent")}
      </a>

      <TopBar profile={profile} theme={theme} />

      {children}
    </div>
  )
}
