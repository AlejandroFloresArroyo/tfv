/**
 * Idiomas disponibles.
 *
 * Ver `openspec/specs/app-shell/spec.md`, requisito «Idioma seleccionable y persistente».
 *
 * La elección explícita vive en una cookie y manda sobre la preferencia del navegador. Cuando no
 * hay elección previa se usa la del navegador si está entre las disponibles, y el idioma por
 * defecto si no.
 */

export const LOCALES = ["es", "en"] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "es"

/** Nombre de cada idioma **en sí mismo**: quien busca «English» no sabe buscar «Inglés». */
export const LOCALE_NAMES: Record<Locale, string> = {
  es: "Español",
  en: "English",
}

export const LOCALE_COOKIE = "tfv_locale"

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

/**
 * Elige idioma a partir del encabezado del navegador.
 *
 * Recorre las preferencias en orden y se queda con la primera disponible, comparando también por
 * idioma base: quien pide `es-MX` debe recibir español aunque sólo exista `es`.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE

  const preferences = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";")
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="))
        ?.slice(2)

      return { tag: tag.trim().toLowerCase(), quality: quality ? Number(quality) : 1 }
    })
    .filter((preference) => preference.tag.length > 0)
    .sort((a, b) => b.quality - a.quality)

  for (const preference of preferences) {
    if (isLocale(preference.tag)) return preference.tag

    const base = preference.tag.split("-")[0]
    if (isLocale(base)) return base
  }

  return DEFAULT_LOCALE
}
