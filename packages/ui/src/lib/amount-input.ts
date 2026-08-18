/**
 * Escribir un importe sin pasar nunca por coma flotante.
 *
 * Los importes de este sistema viajan como **cadenas decimales** y se calculan en enteros de la
 * unidad mínima. Un campo que hiciera `Number(valor)` para «limpiarlo» rompería esa cadena en el
 * único punto donde nadie mira: `0.1 + 0.2` no es `0.3`, y mil productos convierten eso en una
 * factura que no cuadra por unos pesos.
 *
 * Por eso aquí no hay ninguna conversión a número. Todo es manipulación de texto.
 *
 * **Criterio adoptado, y anotado porque la decisión de producto sigue abierta** (`H-25`): mientras
 * se teclea se admite **un solo separador**, punto o coma, y siempre significa *decimal*. No se
 * admiten separadores de millar al escribir. Es la única lectura que no es ambigua sin saber si el
 * idioma agrupa a la europea o a la mexicana — y el agrupamiento es cosa de cómo se enseña el
 * importe, no de cómo se teclea.
 */

/** Lo que el campo debe mostrar después de esta pulsación. Admite estados a medias como `12.`. */
export function sanitizeAmount(raw: string, options?: { negative?: boolean | undefined }): string {
  const sign = options?.negative === true && raw.startsWith("-") ? "-" : ""

  const digits = raw.replace(/[^\d.,]/g, "").replace(/,/g, ".")

  const first = digits.indexOf(".")
  const whole = first === -1 ? digits : digits.slice(0, first)
  // Los separadores siguientes al primero se descartan en lugar de rechazar la pulsación entera:
  // quien pega «1.2.3» quiere un número, no perder lo pegado.
  const decimals =
    first === -1
      ? ""
      : digits
          .slice(first + 1)
          .replace(/\./g, "")
          .slice(0, 2)

  const trimmed = whole.replace(/^0+(?=\d)/, "")

  if (first === -1) return `${sign}${trimmed}`
  return `${sign}${trimmed}.${decimals}`
}

/**
 * El valor que se manda al servicio, o nada si todavía no hay número.
 *
 * Completa las dos formas que el usuario escribe y el esquema no admite —`12.` y `.5`— en vez de
 * rechazarlas: son maneras normales de teclear, no errores.
 */
export function toDecimalString(value: string): string | undefined {
  const sign = value.startsWith("-") ? "-" : ""
  const [whole = "", decimals = ""] = value.replace("-", "").split(".")

  if (whole === "" && decimals === "") return undefined

  const integer = whole === "" ? "0" : whole
  return decimals === "" ? `${sign}${integer}` : `${sign}${integer}.${decimals}`
}
