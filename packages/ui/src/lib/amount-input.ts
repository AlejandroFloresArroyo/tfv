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
 * **Cuál de los dos signos es el decimal lo dice el idioma, y el otro se descarta.** Es lo mismo
 * que hace la presentación del importe (`H-22`), en la dirección contraria. Adivinarlo con una
 * regla fija —«coma o punto, los dos deciden»— hace que teclear `12,345.678` con punto decimal
 * acabe en `12.34`: tres órdenes de magnitud, sin aviso, en la cifra que el cliente firma.
 *
 * Lo que queda fuera a propósito: un solo separador **siempre** se lee como decimal, aunque sea el
 * de millar. `12,50` con punto decimal se queda en `1250`, que es lo que dice literalmente lo
 * tecleado; `12,5` con coma decimal es `12.5`. No hay forma de distinguir un millar mal escrito de
 * un decimal en otra convención, y esa ambigüedad es `H-25` — decisión de producto.
 */

/** El signo decimal del idioma. El otro agrupa, y al teclear se descarta. */
export type DecimalSeparator = "." | ","

/** Lo que el campo debe mostrar después de esta pulsación. Admite estados a medias como `12.`. */
export function sanitizeAmount(
  raw: string,
  options?: { negative?: boolean | undefined; decimal?: DecimalSeparator | undefined },
): string {
  const sign = options?.negative === true && raw.startsWith("-") ? "-" : ""
  const decimal = options?.decimal ?? "."
  const grouping = decimal === "." ? "," : "."

  const digits = raw
    .replace(/[^\d.,]/g, "")
    .split(grouping)
    .join("")
    .split(decimal)
    .join(".")

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

  // Se escribe con el separador del idioma, no con el del contrato: si el campo enseñara `12.`
  // donde el idioma escribe `12,`, la pulsación siguiente leería ese punto como millar y se
  // comería el decimal — `12,3` acabaría siendo `123`.
  if (first === -1) return `${sign}${trimmed}`
  return `${sign}${trimmed}${decimal}${decimals}`
}

/**
 * El valor que se manda al servicio, o nada si todavía no hay número.
 *
 * Completa las dos formas que el usuario escribe y el esquema no admite —`12.` y `.5`— en vez de
 * rechazarlas: son maneras normales de teclear, no errores. Y traduce el separador del idioma al
 * punto, que es como el importe viaja en la petición.
 */
export function toDecimalString(
  value: string,
  decimal: DecimalSeparator = ".",
): string | undefined {
  const sign = value.startsWith("-") ? "-" : ""
  const [whole = "", decimals = ""] = value.replace("-", "").split(decimal)

  if (whole === "" && decimals === "") return undefined

  const integer = whole === "" ? "0" : whole
  return decimals === "" ? `${sign}${integer}` : `${sign}${integer}.${decimals}`
}
