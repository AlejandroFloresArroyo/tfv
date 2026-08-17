"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { isLocale, LOCALE_COOKIE } from "~/i18n/config.ts"
import { isTheme, THEME_COOKIE } from "~/lib/theme.ts"

/**
 * Tema e idioma se guardan en cookie, no en almacenamiento local.
 *
 * Es lo que permite que el servidor los conozca al atender la primera petición: con
 * almacenamiento local la elección sólo existe después de que el navegador ejecute algo, y para
 * entonces la página ya se pintó del color contrario y con el idioma contrario.
 *
 * Un año de vigencia, y accesibles por script: no son credenciales, y ocultarlas no protegería
 * nada. Ver `openspec/specs/app-shell/spec.md`.
 */
const OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
} as const

export async function setTheme(value: string): Promise<void> {
  if (!isTheme(value)) return

  const store = await cookies()
  store.set(THEME_COOKIE, value, OPTIONS)

  // Vuelve a pintar en el servidor para que la clase de `<html>` cambie sin recargar la página.
  revalidatePath("/", "layout")
}

export async function setLocale(value: string): Promise<void> {
  if (!isLocale(value)) return

  const store = await cookies()
  store.set(LOCALE_COOKIE, value, OPTIONS)

  revalidatePath("/", "layout")
}
