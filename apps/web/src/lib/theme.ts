/**
 * Tema claro y oscuro.
 *
 * Ver `openspec/specs/app-shell/spec.md`: «El tema elegido SHALL aplicarse **antes del primer
 * pintado**, sin destello del tema contrario».
 *
 * El destello aparece cuando la elección vive sólo en el navegador: el servidor manda una página
 * clara, el guion la corrige, y entre las dos cosas hay un parpadeo. Aquí la elección viaja en una
 * cookie, así que el servidor ya sabe qué clase poner en `<html>` y no hay nada que corregir.
 *
 * Queda un caso que la cookie no resuelve: quien nunca eligió y prefiere oscuro en su sistema. El
 * servidor no puede leer `prefers-color-scheme` —no viaja en la petición—, así que **ese caso, y
 * sólo ése**, lo arregla un guion mínimo que corre antes de pintar.
 */

export const THEME_COOKIE = "tfv_theme"

export const THEMES = ["light", "dark", "system"] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = "system"

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value)
}

/** La clase que `<html>` lleva cuando el servidor ya puede decidir. */
export function themeClass(theme: Theme): string {
  return theme === "dark" ? "dark" : ""
}

/**
 * El guion que corre antes del primer pintado.
 *
 * Sólo actúa con `system`: en los otros dos casos el servidor ya puso la clase correcta y esto no
 * tiene nada que hacer. Se mantiene en una línea porque bloquea el pintado mientras se ejecuta.
 */
export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var t=m?decodeURIComponent(m[1]):"${DEFAULT_THEME}";if(t==="system"||!t){if(window.matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.add("dark")}}catch(e){}})()`
