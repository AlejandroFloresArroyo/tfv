"use client"

import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@tfv/ui"
import { Languages, Monitor, Moon, Sun } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useTransition } from "react"
import { setLocale, setTheme } from "~/app/preferences.actions.ts"
import { LOCALE_NAMES, LOCALES } from "~/i18n/config.ts"
import type { Theme } from "~/lib/theme.ts"

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const

/**
 * Tema e idioma, en un solo menú.
 *
 * Son dos preferencias del mismo tipo —cómo se ve la aplicación— y separarlas en dos botones
 * llenaría la barra sin que nadie encontrara ninguna de las dos más rápido.
 *
 * El tema activo llega desde el servidor. No se lee del navegador: leerlo obligaría a pintar algo
 * antes de saberlo, que es el destello que este componente existe para no provocar.
 */
export function PreferencesMenu({ theme }: { theme: Theme }) {
  const t = useTranslations()
  const locale = useLocale()
  const [pending, startTransition] = useTransition()

  const Icon = THEME_ICONS[theme]

  return (
    <Menu>
      <MenuTrigger
        aria-label={`${t("theme.label")} · ${t("language.label")}`}
        disabled={pending}
        className="grid size-9 place-items-center rounded-sm text-content-muted transition-colors hover:bg-panel-hover hover:text-content disabled:opacity-50"
      >
        <Icon className="size-4" aria-hidden="true" />
      </MenuTrigger>

      <MenuContent>
        <MenuLabel>{t("theme.label")}</MenuLabel>
        <MenuRadioGroup
          value={theme}
          onValueChange={(value) => startTransition(() => setTheme(value))}
        >
          <MenuRadioItem value="light">{t("theme.light")}</MenuRadioItem>
          <MenuRadioItem value="dark">{t("theme.dark")}</MenuRadioItem>
          <MenuRadioItem value="system">{t("theme.system")}</MenuRadioItem>
        </MenuRadioGroup>

        <MenuLabel>
          <span className="inline-flex items-center gap-1.5">
            <Languages className="size-3" aria-hidden="true" />
            {t("language.label")}
          </span>
        </MenuLabel>
        <MenuRadioGroup
          value={locale}
          onValueChange={(value) => startTransition(() => setLocale(value))}
        >
          {LOCALES.map((available) => (
            <MenuRadioItem key={available} value={available}>
              {LOCALE_NAMES[available]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}
