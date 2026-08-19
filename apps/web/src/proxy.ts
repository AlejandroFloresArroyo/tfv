import { subdomainOf } from "@tfv/contracts/storefront"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Lo que la aplicación necesita saber de la petición en bruto.
 *
 * Es el único punto donde la petición entera está a la vista: un componente de servidor recibe sus
 * parámetros, no la ruta ni los encabezados de red. En Next 16 este archivo se llama `proxy`; hasta
 * la 15 era `middleware`.
 *
 * Hace tres cosas, y las dos primeras por la misma razón:
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
 *
 * 3. **La resolución por subdominio**, rebanada 19. `websites` la exige «antes de servir contenido
 *    alguno», y éste es el único sitio donde el nombre de host está a la vista. Va aquí y no en un
 *    archivo propio porque Next admite **uno solo**: crear `middleware.ts` al lado de esto no da
 *    dos ganchos, da un servidor que no arranca.
 */
export default function proxy(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search)

  const forwarded = clientAddress(request)
  if (forwarded) headers.set("x-forwarded-for", forwarded)

  const storefront = storefrontRewrite(request)
  if (storefront) return NextResponse.rewrite(storefront, { request: { headers } })

  return NextResponse.next({ request: { headers } })
}

/**
 * El dominio bajo el que se sirven las tiendas.
 *
 * Con prefijo público porque el mismo valor tiene que llegar al empaquetado. Su valor por defecto es
 * el de desarrollo: cualquier navegador resuelve `loquesea.localhost` sin tocar el sistema de
 * nombres, así que una tienda se abre sin configurar nada.
 */
const SITES_DOMAIN = process.env.NEXT_PUBLIC_SITES_DOMAIN ?? "localhost:3000"

/**
 * Adónde hay que reescribir esta petición para servir una tienda, o nada.
 *
 * Ver `openspec/specs/websites/spec.md`, «Resolución por subdominio».
 *
 * **Reescritura, no redirección.** `renta-norte.tfv.mx/p/panel-led` se atiende con
 * `/s/renta-norte/p/panel-led` sin que la dirección cambie en el navegador; redirigir dejaría el
 * camino interno a la vista y daría dos direcciones para la misma página, mala de compartir y peor
 * de indexar.
 *
 * El camino interno sigue existiendo por su cuenta, y es deliberado: es la única forma de abrir una
 * tienda donde no hay sistema de nombres que configurar.
 *
 * Nada cuando el anfitrión es el dominio principal, que es la otra mitad del requisito y la que se
 * olvida: sin ella, el panel dejaría de existir.
 */
function storefrontRewrite(request: NextRequest): URL | null {
  const slug = subdomainOf(request.headers.get("host") ?? "", SITES_DOMAIN)
  if (slug === null) return null

  const { pathname } = request.nextUrl

  // El reenvío a la API cuelga del mismo origen que la tienda. Reescribirlo bajo `/s/` rompería
  // toda petición del navegador, incluida la que resuelve la propia tienda.
  if (pathname.startsWith("/api")) return null

  // Ya viene reescrito, o alguien escribió el camino interno estando en el subdominio. Volver a
  // anteponerlo daría `/s/renta-norte/s/renta-norte`.
  if (pathname.startsWith("/s/")) return null

  const url = request.nextUrl.clone()
  url.pathname = `/s/${slug}${pathname === "/" ? "" : pathname}`
  return url
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
