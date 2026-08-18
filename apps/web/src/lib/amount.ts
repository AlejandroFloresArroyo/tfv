/**
 * Presentación de importes.
 *
 * Los importes viajan como **cadena decimal** y aquí se quedan como tal: se agrupa la parte entera
 * con las convenciones del idioma y se vuelve a pegar la fracción, sin pasar por `Number` en ningún
 * punto. Convertir para pintar parece inofensivo —dos decimales caben de sobra en un flotante— pero
 * es exactamente el hábito que hace que un día un total mostrado no coincida con el cobrado.
 *
 * El separador decimal lo pone también el idioma. Pegar siempre un punto daba `10.500.00` en
 * español, donde el punto ya separa los miles: la misma marca para dos cosas distintas, en la cifra
 * que el cliente firma. Sólo se ve a partir de cinco dígitos, y hasta hoy nada sembrado llegaba.
 */
export function formatAmount(
  amount: string,
  format: { number: (value: number | bigint) => string },
): string {
  const negative = amount.startsWith("-")
  const [whole = "0", fraction = ""] = (negative ? amount.slice(1) : amount).split(".")

  const grouped = format.number(BigInt(whole))
  const decimals = fraction.padEnd(2, "0").slice(0, 2)

  return `${negative ? "−" : ""}${grouped}${decimalSeparator(format)}${decimals}`
}

/**
 * Con qué separa este idioma la parte decimal.
 *
 * Se pregunta formateando un número que sólo tiene unos: lo que quede al quitarlos es la marca. Es
 * preferible a mantener una tabla por idioma, que se queda corta el día que se añada uno.
 */
function decimalSeparator(format: { number: (value: number | bigint) => string }): string {
  return format.number(1.1).replace(/1/g, "")
}
