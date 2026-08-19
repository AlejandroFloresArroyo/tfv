/**
 * La aritmética de la dirección de una tienda pública.
 *
 * Ver `openspec/specs/websites/spec.md`, requisitos «Subdominio y dirección derivados», «Resolución
 * por subdominio» y «La vertical determina las páginas servidas».
 *
 * Vive en los contratos y no en el servicio porque **los dos extremos la necesitan, en direcciones
 * contrarias**: la API compone la dirección pública de un sitio para publicarla como campo
 * calculado, y la aplicación web descompone el nombre de host entrante para saber qué tienda
 * servir. Dos implementaciones del mismo formato acaban difiriendo en el primer caso raro —el
 * puerto de desarrollo, una mayúscula, una etiqueta de más—, y ese desacuerdo se manifiesta como
 * «la tienda no existe» en una dirección que la propia API acaba de imprimir.
 *
 * Es el mismo motivo por el que `slug.ts` vive aquí y no junto a cada entidad.
 */

/**
 * Nombres de host que **nunca** son una tienda.
 *
 * Un sitio cuyo identificador legible fuera `www` se quedaría con la portada de la plataforma, y
 * uno llamado `api` interceptaría el servicio. La lista es corta a propósito: cada entrada retira
 * un identificador del alcance de las empresas, y ampliarla sin necesidad es cobrarles un nombre.
 */
export const RESERVED_SUBDOMAINS: readonly string[] = ["www", "app", "api", "admin"]

/**
 * El alfabeto de un identificador legible, tal y como lo produce `slugify`.
 *
 * Lo que llega en `Host` lo elige quien llama, y de aquí sale directo a una consulta. Comprobar la
 * forma antes convierte una etiqueta rara en «no hay tienda» en lugar de en un valor que viaja.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * El identificador legible del sitio que sirve este nombre de host, o nada.
 *
 * Nada —y no una excepción— porque «esto no es una tienda» es la respuesta normal para el dominio
 * principal: la spec pide que la petición se atienda entonces con normalidad por la aplicación
 * principal, no que falle.
 */
export function subdomainOf(host: string, rootDomain: string): string | null {
  const name = withoutPort(host).toLowerCase()
  const root = withoutPort(rootDomain).toLowerCase()

  if (name === "" || root === "" || name === root) return null
  if (!name.endsWith(`.${root}`)) return null

  const label = name.slice(0, -(root.length + 1))

  if (!SLUG.test(label)) return null
  if (RESERVED_SUBDOMAINS.includes(label)) return null

  return label
}

/**
 * La dirección pública completa de un sitio.
 *
 * El esquema se deriva del dominio y no se recibe: un dominio local no tiene certificado, así que
 * componer `https://` ahí produce una dirección que no abre — y es la que se enseñaría en el panel
 * justo al lado del botón de publicar.
 */
export function storefrontAddress(slug: string, rootDomain: string): string {
  return `${isLocal(rootDomain) ? "http" : "https"}://${slug}.${rootDomain}`
}

function withoutPort(host: string): string {
  const colon = host.indexOf(":")
  return colon === -1 ? host.trim() : host.slice(0, colon).trim()
}

function isLocal(rootDomain: string): boolean {
  const name = withoutPort(rootDomain).toLowerCase()
  return name === "localhost" || name.endsWith(".localhost") || name === "127.0.0.1"
}

// ─── Verticales ──────────────────────────────────────────────────────────────

/**
 * Qué juego de páginas sirve un sitio.
 *
 * Cerrado a propósito, como el catálogo de permisos y por lo mismo: una vertical que no esté aquí
 * no compila, en lugar de ser una cadena que nunca coincide con ninguna rama y deja páginas en
 * blanco que nadie relaciona con un dato mal escrito.
 */
export const WEBSITE_VERTICALS = ["warehouse", "mosaic", "under-construction"] as const

export type WebsiteVertical = (typeof WEBSITE_VERTICALS)[number]

/**
 * La clave estable de la categoría global que declara cada vertical.
 *
 * La vertical **se declara mediante la categoría del sitio**, dice la spec, y `global_categories`
 * tiene para eso la columna `keyname` —«clave estable para referenciar una categoría desde el
 * código, como la vertical de un sitio»—. Aquí está la correspondencia entre esas claves y las
 * páginas que se sirven, escrita en un solo sitio.
 */
export const VERTICAL_KEYNAMES: Readonly<Record<string, WebsiteVertical>> = {
  "warehouse-store": "warehouse",
  "mosaic-store": "mosaic",
}

/**
 * La vertical de un sitio a partir de la clave de su categoría.
 *
 * Una clave desconocida, o ninguna categoría, dan **página en construcción y no error**: es lo que
 * permite dar de alta un sitio antes de decidir qué va a vender, que es el caso normal el día que
 * alguien lo crea.
 */
export function verticalOf(keyname: string | null | undefined): WebsiteVertical {
  if (!keyname) return "under-construction"
  return VERTICAL_KEYNAMES[keyname] ?? "under-construction"
}
