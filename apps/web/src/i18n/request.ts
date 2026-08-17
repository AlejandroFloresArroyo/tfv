import { cookies, headers } from "next/headers"
import { getRequestConfig } from "next-intl/server"
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale } from "./config.ts"

/**
 * Resolución del idioma en cada petición.
 *
 * **Sin prefijo de idioma en la ruta.** Una empresa mexicana con interfaz en español y algún
 * usuario en inglés no necesita dos árboles de direcciones; lo que necesita es que cada persona vea
 * la aplicación en su idioma. Duplicar cada URL sólo tendría sentido si las páginas fueran públicas
 * e indexables, y el panel no lo es.
 *
 * Los mensajes se cargan con `import()` a secas, que es la corrección del defecto F-07: la pila
 * anterior los descubría con una interfaz exclusiva de un empaquetador concreto, y eso ataba la
 * traducción a la herramienta de compilación.
 */
export default getRequestConfig(async () => {
  const store = await cookies()
  const chosen = store.get(LOCALE_COOKIE)?.value

  const locale = isLocale(chosen)
    ? chosen
    : negotiateLocale((await headers()).get("accept-language"))

  const messages = (await import(`./messages/${locale}.json`)).default

  return {
    locale,
    messages,
    // Los importes y las fechas de la plataforma son de México aunque la interfaz esté en inglés:
    // el negocio ocurre allí. El idioma cambia las palabras, no la zona horaria.
    timeZone: "America/Mexico_City",
    now: new Date(),
    onError(error) {
      // Una clave que falta es un error de programación, no del usuario. En desarrollo tiene que
      // verse; en producción no debe tirar la página.
      if (process.env.NODE_ENV === "development") console.error(error)
    },
    getMessageFallback({ key }) {
      return process.env.NODE_ENV === "development" ? `⟨${key}⟩` : key.split(".").at(-1) || key
    },
  }
})

export { DEFAULT_LOCALE }
