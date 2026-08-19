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
 * Se emite al marcado para que sobreviva al build de producción: buscar «CONTRATO DE DIRECCIÓN»
 * en la salida compilada tiene que encontrarlo. Es lo que la revisión final audita contra lo que
 * de verdad se construyó.
 */
const DIRECTION_CONTRACT = `<!--
CONTRATO DE DIRECCIÓN · Hoja de Llamado · dirección fijada por el cliente, no por el dado

THESIS: La hoja de llamado —el documento que toda la industria lee cada mañana— convertida en
superficie de control oscura e iluminada. Su arquitectura se conserva: hechos duros arriba, bloques
debajo, todo lo del día en una sola superficie. Su materia no: no es papel, es panel. Rechaza la
disposición por defecto de la categoría, la barra lateral con fila de métricas planas.

OWN-WORLD: Lienzo casi negro azulado con tarjetas de degradado teñido y filo superior de luz. La
cromática no es inventada: son temperaturas de set —tungsteno 3200 K, HMI 5600 K, hora mágica, luz
de seguridad— y cada estado toma una, así que el color dice algo antes de que nadie lea la
etiqueta. Radios generosos. Voz de display en Archivo expandida al 118%, de su propio eje de ancho.
El oro de marca es la acción primaria y el estado «apartado». Claro es par legítimo, no modo
alterno.

STORY: Quien entra ve de un vistazo qué hay hoy y qué está comprometido, y encuentra la acción
principal sin buscarla.

FIRST VIEWPORT: Cabecera de hechos duros —fecha, día X de Y, citación, puesta de sol— sobre una
fila de tarjetas de tablero con degradado por temperatura, la magnitud a tamaño de display y la
tendencia debajo.

FORM: Dirección fijada por el cliente tras rechazar la anterior. Un brief fijado le gana al dado,
siempre; por eso esta ronda no lleva semilla.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.
-->`

export const metadata: Metadata = {
  title: { default: "TFV", template: "%s · TFV" },
  description: "The Film Vault",
}

export const viewport: Viewport = {
  /*
   * Los dos, para que el navegador pinte sus barras del color correcto en cada tema.
   *
   * Son los valores exactos de `--canvas` en `packages/ui/src/styles/tokens.css`, y van a mano
   * porque esto lo lee el navegador antes de que exista ninguna hoja de estilos: aquí no se puede
   * referenciar una variable. Si el lienzo cambia, este par cambia con él — es el único sitio del
   * sistema donde un color se escribe dos veces, y por eso se anota.
   */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f2f6" },
    { media: "(prefers-color-scheme: dark)", color: "#08090c" },
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
          nadie. Va de primer hijo del cuerpo y se busca en el build por su primera línea.
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
