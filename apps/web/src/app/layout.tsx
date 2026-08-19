import type { Metadata, Viewport } from "next"
import { cookies } from "next/headers"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import type { ReactNode } from "react"
import { DEFAULT_THEME, isTheme, THEME_COOKIE, THEME_SCRIPT, themeClass } from "~/lib/theme.ts"
import "./globals.css"

/**
 * Contrato de dirección de la rebanada de rediseño.
 *
 * Se emite al marcado para que sobreviva al build de producción: `grep 9f316c9f` sobre la salida
 * compilada tiene que encontrarlo. Es lo que la revisión final audita contra lo que se construyó.
 */
const DIRECTION_CONTRACT = `<!--
CONTRATO DE DIRECCIÓN · Motor de Rayado · seed 9f316c9f · re-tirada 3, registro bolder

THESIS: El sistema traza su propia estructura. Un motor de rayado dibuja cada filete, muesca y
corchete a un píxel de dispositivo exacto, y el estado es una marca trazada, nunca un relleno
tintado. Rechaza la disposición por defecto de la categoría: tarjetas redondeadas flotando sobre
sombras, con chips de color de fondo.

OWN-WORLD: Cero radios en todo el sistema. Filetes de un píxel de dispositivo, resueltos contra
devicePixelRatio. Separación por línea y escalón de valor, nunca por relleno. Raíl de claves con
muescas cuadradas cortadas donde cambia el pie. Estados como marcas: fina en reposo, llena al
presionar, atravesada si deshabilitada, entre corchetes al enfocar, barra tachada si gastada. Ley
de paleta: escalera semántica corta, fija y numerada, y nada se pinta fuera de ella. Oro de marca
sólo como relleno con tinta encima o como marca de posición activa.

STORY: Quien entra ve una superficie de precisión que se explica sola —cada estado trae su nombre
además de su color— y entiende en segundos qué toca hacer y qué está en curso.

FIRST VIEWPORT: El constructor de cotización con su raíl central: las claves de bloque corriendo
por el centro, cada muesca cortada donde cambia el pie, el margen ancho absorbiendo el sobrante en
ultrapanorámico, y la acción primaria al alcance del pulgar.

FORM: Motor de rayado, retador líder de la mano bolder por orden de reparto, arrancado de su papel
porque el brief fija «nada de hojas de papel» y un brief fijado gana al dado. Seed 9f316c9f.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.
-->`

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
        {/*
          El contrato de dirección se emite como comentario HTML real, no como comentario de JSX:
          el de JSX lo borra el compilador y un contrato que el build borra no lo puede auditar
          nadie. Va de primer hijo del cuerpo y se busca en el build por su clave de semilla.
        */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: un comentario sólo llega al marcado así. */}
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
