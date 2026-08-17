/**
 * Identificadores legibles.
 *
 * Ver `openspec/specs/api-conventions/spec.md`. Un identificador legible es lo que aparece en una
 * dirección web —`/tienda/renta-filmica-del-norte`—, así que tiene que ser estable, escribible a
 * mano y decible en voz alta.
 *
 * Vive en los contratos y no junto a cada entidad porque **la derivación tiene que ser la misma en
 * todas**: categorías, almacenes, productos y tiendas comparten formato, y dos implementaciones del
 * mismo formato acaban difiriendo en el primer caso raro —una eñe, un guion doble, un nombre que
 * son sólo símbolos.
 */

/** Longitud máxima del identificador derivado. Las columnas dan más margen; esto es legibilidad. */
const MAX_LENGTH = 60

/**
 * Deriva un identificador legible de un nombre.
 *
 * Retira los diacríticos **sin retirar la letra**: «Iluminación» da `iluminacion`, no `iluminacin`.
 * Es la diferencia entre normalizar y truncar, y con la forma descompuesta de Unicode es un
 * descuido fácil: la tilde es un carácter aparte y borrar el rango equivocado se lleva la vocal.
 *
 * Un nombre que no deje ningún carácter utilizable —sólo símbolos, sólo espacios— devuelve el
 * respaldo, porque un identificador vacío no se puede poner en una dirección.
 */
export function slugify(name: string, fallback = "sin-nombre"): string {
  return (
    name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_LENGTH)
      // Truncar puede dejar un guion al final: «cámara-réflex-profesional-…» cortado por la mitad
      // de una palabra deja `-`, y un identificador no termina en separador.
      .replace(/-+$/g, "") || fallback
  )
}

/**
 * El candidato número `attempt` para un identificador, empezando por el que no lleva sufijo.
 *
 * El sufijo se añade en lugar de rechazar el alta: «Iluminación» es un nombre razonable en dos
 * ramas distintas, y obligar a renombrar convertiría una restricción técnica en una decisión de
 * negocio.
 */
export function slugCandidate(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}-${attempt + 1}`
}
