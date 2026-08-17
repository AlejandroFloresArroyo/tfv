/**
 * Traduce la cadena del navegador a algo que una persona pueda reconocer.
 *
 * Deliberadamente tosco. La cadena de agente de usuario es un pantano histórico —Chrome dice ser
 * Safari, que dice ser Mozilla— y acertar siempre exige una base de datos que se actualiza sola.
 * Aquí sólo hace falta que quien mire la lista pueda distinguir **su** sesión de las demás, y para
 * eso basta con «Chrome · Linux».
 *
 * Cuando no se reconoce, se devuelve `null` y la pantalla dice «dispositivo desconocido», que es
 * más honesto que enseñar setenta caracteres de cadena cruda.
 */

const BROWSERS: readonly [RegExp, string][] = [
  // El orden importa: casi todos los navegadores mienten diciendo ser los anteriores.
  [/\bEdg\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bFirefox\//, "Firefox"],
  [/\bChrome\//, "Chrome"],
  [/\bSafari\//, "Safari"],
  [/\bcurl\//, "curl"],
]

const PLATFORMS: readonly [RegExp, string][] = [
  [/\bAndroid\b/, "Android"],
  [/\biPhone\b|\biPad\b|\biOS\b/, "iOS"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
]

export function describeUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null

  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1]
  const platform = PLATFORMS.find(([pattern]) => pattern.test(userAgent))?.[1]

  if (browser && platform) return `${browser} · ${platform}`
  return browser ?? platform ?? null
}
