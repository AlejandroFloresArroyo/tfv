/**
 * Presentación de importes.
 *
 * Los importes viajan como **cadena decimal** y aquí se quedan como tal: se agrupa la parte entera
 * con las convenciones del idioma y se vuelve a pegar la fracción, sin pasar por `Number` en ningún
 * punto. Convertir para pintar parece inofensivo —dos decimales caben de sobra en un flotante— pero
 * es exactamente el hábito que hace que un día un total mostrado no coincida con el cobrado.
 */
export function formatAmount(
  amount: string,
  format: { number: (value: number) => string },
): string {
  const negative = amount.startsWith("-")
  const [whole = "0", fraction = ""] = (negative ? amount.slice(1) : amount).split(".")

  return `${negative ? "−" : ""}${format.number(Number(whole))}.${fraction.padEnd(2, "0").slice(0, 2)}`
}
