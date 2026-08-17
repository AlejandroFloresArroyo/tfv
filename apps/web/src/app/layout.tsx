import type { Metadata, Viewport } from "next"
import { cookies } from "next/headers"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import type { ReactNode } from "react"
import { DEFAULT_THEME, isTheme, THEME_COOKIE, THEME_SCRIPT, themeClass } from "~/lib/theme.ts"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "TFV", template: "%s · TFV" },
  description: "The Film Vault",
}

export const viewport: Viewport = {
  // Los dos, para que el navegador pinte sus barras del color correcto en cada tema.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f0f0f0" },
    { media: "(prefers-color-scheme: dark)", color: "#1e1e1e" },
  ],
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  const chosen = (await cookies()).get(THEME_COOKIE)?.value
  const theme = isTheme(chosen) ? chosen : DEFAULT_THEME

  return (
    <html lang={locale} className={themeClass(theme)} suppressHydrationWarning>
      <head>
        {/*
          Corre antes del primer pintado y sólo hace algo cuando el tema es `system`: en los otros
          dos casos la clase ya viene puesta desde el servidor. `suppressHydrationWarning` en
          `<html>` porque este guion puede haber añadido la clase que el servidor no puso — es
          exactamente la divergencia que evita el destello.
        */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: es la única forma de correr antes del pintado. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
