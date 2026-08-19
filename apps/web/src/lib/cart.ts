/**
 * El carrito de una tienda pública.
 *
 * Ver `openspec/specs/storefront-checkout/spec.md`, requisito «Carrito de la tienda de almacén».
 * Rebanada 18.
 *
 * ## Por qué vive en el navegador
 *
 * Porque hasta que alguien decide pagar **no hay nada que apartar**. Un carrito en el servidor
 * obligaría a escribir filas por cada visitante que mira sin comprar, y a decidir cuánto duran; lo
 * que la spec quiere que exista en el servidor es la **compra**, que nace con su instantánea, su
 * inventario apartado y su caducidad. Antes de eso, el carrito es una intención.
 *
 * ## Lo que guarda, y lo que no
 *
 * Guarda **qué y cuánto**, más el nombre y el precio que se vieron, para poder pintar el carrito sin
 * pedir nada. Ese precio es una **copia para enseñar**: el que vale lo resuelve el servidor cada vez
 * que se valora el carrito, y el que se cobra sale de la instantánea. Si el comercio cambió el
 * precio entre una visita y otra, lo que el comprador ve al abrir el carrito es el nuevo.
 *
 * Un carrito por tienda, y por eso la clave lleva su identificador legible: quien tiene abiertas dos
 * tiendas en dos pestañas no está llenando el mismo carrito.
 */

export interface CartItem {
  /** La medida del producto. Es lo que se aparta y lo que se sirve. */
  readonly refId: string
  readonly quantity: number
  /** Copia de lo que se vio, para pintar el carrito sin pedir nada. */
  readonly name: string
  readonly unitPrice: string
  readonly coverUrl: string | null
}

const PREFIX = "tfv.carrito."

function keyOf(slug: string): string {
  return `${PREFIX}${slug}`
}

// ─── Aritmética del carrito ──────────────────────────────────────────────────

/**
 * Añade un artículo, sumando si ya estaba.
 *
 * Dos líneas de la misma medida son **una** de la suma. Separadas, el servidor apartaría para cada
 * una por su cuenta y la comprobación de existencia miraría media compra cada vez.
 */
export function mergeItem(items: readonly CartItem[], added: CartItem): readonly CartItem[] {
  const existing = items.find((item) => item.refId === added.refId)
  if (!existing) return [...items, added]

  return items.map((item) =>
    item.refId === added.refId
      ? // El nombre y el precio se quedan con los de la última vez que se vio el artículo: son lo
        // que el comprador acaba de mirar.
        { ...added, quantity: item.quantity + added.quantity }
      : item,
  )
}

/** Fija la cantidad de un artículo. Cero o menos lo retira. */
export function withQuantity(
  items: readonly CartItem[],
  refId: string,
  quantity: number,
): readonly CartItem[] {
  const wanted = Math.floor(quantity)
  if (wanted < 1) return withoutItem(items, refId)

  return items.map((item) => (item.refId === refId ? { ...item, quantity: wanted } : item))
}

export function withoutItem(items: readonly CartItem[], refId: string): readonly CartItem[] {
  return items.filter((item) => item.refId !== refId)
}

/** Piezas, no líneas: es lo que el contador de la cabecera tiene que decir. */
export function cartCount(items: readonly CartItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0)
}

// ─── Persistencia ────────────────────────────────────────────────────────────

/**
 * El carrito guardado de una tienda.
 *
 * Todo lo que sale de aquí se comprueba antes de creérselo: es texto que el usuario puede editar
 * desde las herramientas del navegador, y una forma inesperada no debe reventar la pantalla. Lo
 * peor que puede pasar con un carrito manipulado es que el servidor rechace la compra, porque los
 * precios los pone él.
 */
export function readCart(slug: string): readonly CartItem[] {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(keyOf(slug))
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(isItem)
  } catch {
    return []
  }
}

export function writeCart(slug: string, items: readonly CartItem[]): void {
  if (typeof window === "undefined") return

  try {
    if (items.length === 0) window.localStorage.removeItem(keyOf(slug))
    else window.localStorage.setItem(keyOf(slug), JSON.stringify(items))
  } catch {
    // Sin almacenamiento —modo privado en algunos navegadores— el carrito vive lo que dure la
    // pestaña. Es peor que lo normal y mucho mejor que una pantalla que no responde.
  }

  window.dispatchEvent(new CustomEvent(CART_CHANGED, { detail: slug }))
}

/** Vaciar el carrito al pagar: lo que se compró ya no se compra otra vez. */
export function clearCart(slug: string): void {
  writeCart(slug, [])
}

/** El aviso con el que la cabecera se entera de que el carrito cambió en esta misma pestaña. */
export const CART_CHANGED = "tfv:carrito"

function isItem(value: unknown): value is CartItem {
  if (typeof value !== "object" || value === null) return false
  const item = value as Record<string, unknown>

  return (
    typeof item.refId === "string" &&
    typeof item.quantity === "number" &&
    Number.isFinite(item.quantity) &&
    item.quantity > 0 &&
    typeof item.name === "string" &&
    typeof item.unitPrice === "string"
  )
}
