import { subdomainOf } from "@tfv/contracts/storefront"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Resolución por subdominio.
 *
 * Ver `openspec/specs/websites/spec.md`, requisito «Resolución por subdominio»: «el sistema SHALL
 * extraer el subdominio del nombre de host y SHALL resolver el sitio correspondiente **antes de
 * servir contenido alguno**».
 *
 * Antes que nada quiere decir aquí: el middleware corre delante de cualquier página, así que la
 * tienda no se puede alcanzar por una ruta que se olvidara de mirar el anfitrión.
 *
 * ## Reescritura, no redirección
 *
 * `renta-norte.tfv.mx/panel-led` se atiende con `/s/renta-norte/panel-led` **sin que la dirección
 * cambie en el navegador**. Redirigir dejaría la dirección interna a la vista, y con ella dos
 * direcciones distintas para la misma página: mala de compartir y peor de indexar.
 *
 * El camino interno sigue existiendo por su cuenta, y eso es deliberado: es la única forma de
 * abrir una tienda en un entorno sin nombres de dominio, y de que las pruebas de navegador no
 * dependan del sistema de nombres.
 *
 * ## Lo que no se toca
 *
 * `/api/*` es el proxy hacia el servicio, y reescribirlo bajo la tienda rompería toda petición del
 * navegador. Queda fuera por el `matcher`, junto con lo que sirve el propio empaquetador.
 */

/**
 * El dominio bajo el que se sirven las tiendas.
 *
 * Con prefijo público porque el mismo valor lo necesita el empaquetador para el cliente. Su valor
 * por defecto es el de desarrollo: cualquier navegador resuelve `loquesea.localhost` sin tocar el
 * sistema de nombres, así que una tienda se abre sin configurar nada.
 */
const SITES_DOMAIN = process.env.NEXT_PUBLIC_SITES_DOMAIN ?? "localhost:3000"

export function middleware(request: NextRequest): NextResponse {
  const slug = subdomainOf(request.headers.get("host") ?? "", SITES_DOMAIN)

  // El dominio principal se atiende con normalidad por la aplicación principal, que es la otra
  // mitad del requisito y la que se olvida: sin esto, el panel dejaría de existir.
  if (slug === null) return NextResponse.next()

  // Ya viene reescrito —o alguien escribió el camino interno estando en el subdominio—. Volver a
  // anteponerlo daría `/s/renta-norte/s/renta-norte`.
  if (request.nextUrl.pathname.startsWith("/s/")) return NextResponse.next()

  const url = request.nextUrl.clone()
  url.pathname = `/s/${slug}${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname}`

  return NextResponse.rewrite(url)
}

export const config = {
  /**
   * Todo menos el proxy de la API y lo que sirve el empaquetador.
   *
   * Se expresa como exclusión y no como lista de lo que sí: una página nueva de la tienda nace
   * cubierta, en lugar de nacer sin resolver su subdominio y que nadie lo note hasta abrirla.
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
