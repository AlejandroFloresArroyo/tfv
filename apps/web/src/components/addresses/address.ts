/**
 * La forma de una dirección, y cómo se lee.
 *
 * Vive en `components/` y no bajo una pantalla porque **hay dos libretas**: la de una empresa y la
 * de una persona. `addresses` las especifica juntas —«el mismo comportamiento y distinto dueño»— y
 * aquí se cumple igual: un solo formulario, una sola regla de la primaria, y el dueño como dato.
 *
 * **Sin `"use client"` a propósito.** Lo usan la pantalla, que es de servidor, y los diálogos, que
 * son de cliente. Una función exportada desde un módulo marcado como cliente no es una función para
 * el servidor: es una referencia, y llamarla desde ahí falla en ejecución con «attempted to call
 * describe() from the server». No lo ve el compilador de tipos, así que la frontera hay que
 * dibujarla a mano — y este archivo es la parte que no la cruza.
 */

export interface AddressSummary {
  id: string
  label: string
  street: string
  number: string
  colony: string
  city: string
  state: string
  country: string
  countryCode: string
  postalCode: string
  isPrimary: boolean
}

/**
 * De dónde cuelga la libreta.
 *
 * La de un usuario y la de una empresa son la misma libreta con el mismo comportamiento; lo único
 * que cambia es su camino. Pasarlo evita dos copias del formulario, que es donde acabarían
 * divergiendo las reglas de la primaria.
 */
export interface Book {
  /**
   * De quién es la libreta.
   *
   * No cambia ninguna regla —los dos extremos de la API son el mismo recurso con otro dueño—, pero
   * sí lo que se sugiere al escribir: la etiqueta de ejemplo de una empresa es «Bodega principal»
   * y la de una persona, «Casa». Un ejemplo que no se parece a lo que se va a escribir estorba más
   * que ayuda.
   */
  readonly kind: "user" | "company"
  /** `/me/addresses` o `/companies/<id>/addresses`. */
  readonly base: string
}

/** Una línea legible: «Avenida Núñez 128, Centro, Monterrey». */
export function describe(address: AddressSummary): string {
  const street = [address.street, address.number].filter(Boolean).join(" ")
  return [street, address.colony, address.city].filter(Boolean).join(", ")
}
