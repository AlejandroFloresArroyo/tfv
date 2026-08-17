import { type NextRequest, NextResponse } from "next/server"

/**
 * Lo que la aplicación necesita saber de la petición en bruto.
 *
 * Es el único punto donde la petición entera está a la vista: un componente de servidor recibe sus
 * parámetros, no la ruta ni los encabezados de red. En Next 16 este archivo se llama `proxy`; hasta
 * la 15 era `middleware`.
 *
 * Hace dos cosas, y las dos por la misma razón:
 *
 * 1. **El camino**, para que la guarda de sesión pueda conservar el destino en `?next=` y devolver
 *    al usuario adonde iba. Lo pide `app-shell`: «Tras iniciar sesión, el usuario SHALL volver a la
 *    ruta que intentaba abrir».
 *
 * 2. **La dirección del cliente**, hacia la API. El reenvío de `/api/*` que declara `next.config`
 *    conserva el agente de usuario pero **no** añade `x-forwarded-for`, así que sin esto la API ve
 *    todas las peticiones sin origen. Comprobado: la sesión quedaba registrada sin dirección, y el
 *    limitador de intentos —que frena por cuenta y por origen— se quedaba sin su segunda mitad.
 *
 *    En desarrollo no hay nada que reenviar: la conexión es directa y no existe encabezado del que
 *    sacar la dirección. La API lo trata como desconocida, que es distinto de compartir casilla con
 *    todos los demás desconocidos.
 */
export default function proxy(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search)

  const forwarded = clientAddress(request)
  if (forwarded) headers.set("x-forwarded-for", forwarded)

  return NextResponse.next({ request: { headers } })
}

/**
 * La dirección del cliente, tal y como llega.
 *
 * Se conserva la cadena entera cuando ya viene: cada salto añade el suyo por la izquierda, y
 * recortarla aquí le quitaría a quien esté detrás la información para decidir de cuántos saltos
 * fiarse.
 */
function clientAddress(request: NextRequest): string | null {
  return request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip")
}

export const config = {
  matcher: [
    // Incluye `/api`, a diferencia de lo habitual: el reenvío a la API es precisamente donde hace
    // falta añadir la dirección. Se dejan fuera los archivos que Next sirve por su cuenta.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
