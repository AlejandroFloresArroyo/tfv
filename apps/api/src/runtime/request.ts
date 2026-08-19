/**
 * Lo que se puede saber de una petición sin resolver nada.
 *
 * Vive aquí y no dentro de una ruta porque **lo usan dos capas**: el limitador de frecuencia del
 * armazón y el registro de intentos de acceso. Dos copias de esta función acabarían con criterios
 * distintos de a qué salto hacer caso, y sería la clase de divergencia que sólo se nota cuando hay
 * un balanceador delante y ya no hay quien la reproduzca.
 */

import type { Context } from "hono"

/**
 * La dirección del solicitante, tal y como llega.
 *
 * Devuelve ausencia y no una cadena centinela. `"unknown"` se compara como si fuera una dirección
 * real, y quien la usara para agrupar acabaría metiendo en el mismo saco a todo el que llegue sin
 * ella — que es exactamente el defecto que tenía el limitador de intentos y que dejó al sistema
 * entero sin admitir inicios de sesión durante quince minutos (ver `drizzle/0007`).
 *
 * El servicio va detrás de un proxy, así que la dirección llega por encabezado. **Sólo es de fiar
 * si un proxy de confianza lo escribe**: un cliente directo puede poner ahí lo que quiera. Hoy la
 * aplicación web es la que lo reenvía; cuando haya un balanceador delante habrá que decidir a
 * cuántos saltos hacer caso, y ese día esta función es el único punto que cambia.
 */
export function clientIp(c: Context): string | undefined {
  const forwarded = c.req.header("x-forwarded-for")
  const first = forwarded?.split(",")[0]?.trim()
  if (first) return first

  return c.req.header("x-real-ip")?.trim() || undefined
}
