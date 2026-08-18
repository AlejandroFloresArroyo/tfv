/**
 * Los enlaces de un solo uso, escritos en el registro **durante el desarrollo**.
 *
 * ## Por qué hace falta
 *
 * Registrarse, recuperar la contraseña o aceptar una invitación terminan con un enlace que llega
 * por correo. El envío lo hace el despachador de la rebanada 09, que **no existe todavía**: el aviso
 * se encola en `notification_deliveries` y se queda ahí, en estado `queued`, para siempre.
 *
 * En producción eso es correcto —cuando exista el despachador, los recogerá—. En desarrollo
 * significa que **no se puede completar un registro**: la cuenta queda sin verificar y no se puede
 * entrar con ella. Hasta hoy la única salida era abrir la base y leer el `payload` a mano.
 *
 * ## Por qué esto no es un agujero
 *
 * Sólo escribe con `NODE_ENV === "development"`, comparado de forma exacta: ni en producción ni en
 * las pruebas. Un enlace de un solo uso en el registro es una credencial, y por eso no vale con
 * «todo lo que no sea producción» — el mismo criterio por el que la siembra se niega a ejecutarse
 * si `NODE_ENV` es `production`, en vez de comprobar que sea desarrollo.
 *
 * No hay ruta que los exponga, ni se guardan en ninguna parte: quien los ve es quien ya tiene la
 * terminal del servicio delante, que es quien podría leerlos de la base de todos modos.
 */

import { env } from "../env.ts"
import { rootLogger } from "../runtime/logger.ts"

/** Dónde canjea cada tipo de enlace. Los que no tienen pantalla todavía sólo enseñan su credencial. */
const PAGES: Readonly<Record<string, string | undefined>> = {
  email_verification: "/verify-email",
  email_change_verification: "/verify-email",
  password_reset: "/reset-password",
  invitation: undefined,
  prospect_accepted: undefined,
}

export function announceDevLink(kind: string, token: string, email?: string): void {
  if (env.NODE_ENV !== "development") return

  const page = PAGES[kind]
  const base = env.CORS_ORIGINS[0] ?? "http://localhost:3000"

  rootLogger.warn("enlace sin enviar · no hay despachador de correo todavía (rebanada 09)", {
    kind,
    ...(email ? { email } : {}),
    ...(page ? { url: `${base}${page}?token=${token}` } : { token }),
  })
}
