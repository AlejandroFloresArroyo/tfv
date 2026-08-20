/**
 * La aritmética de una gráfica de barras.
 *
 * Rebanada 22. Vive aparte del componente por lo mismo que la de días civiles vive en los
 * contratos: **se prueba sin navegador**. Lo que decide si una barra miente no es el `rect`, es la
 * proporción que se le pasa, y eso es una función de números a números.
 *
 * ## No hay librería de gráficas, y no hace falta
 *
 * Una barra es un rectángulo cuyo ancho es una fracción del máximo. Traer una dependencia para eso
 * costaría más de lo que pesa el sistema de diseño entero, y traería consigo su propio tema, su
 * propia tipografía y sus propios colores — tres cosas que aquí ya están decididas.
 *
 * ## Los importes llegan como cadena decimal y aquí se convierten a número
 *
 * Y está bien que así sea: **un píxel no es un importe**. La aritmética exacta gobierna lo que se
 * suma y lo que se imprime; lo que gobierna un ancho es la resolución de la pantalla, que es de
 * tres cifras. La conversión no sale de este módulo: lo que se escribe al lado de la barra es
 * siempre la cadena, nunca el número que se usó para dibujarla.
 */

/**
 * Lo mínimo que se le ve a una barra que no es cero.
 *
 * Sin este suelo, un gasto de cien pesos al lado de uno de un millón sale con una barra de una
 * décima de píxel: **indistinguible de no haber gastado nada**, que es exactamente lo contrario de
 * lo que el dato dice. Con el suelo se ve una marca fina, que se lee como «hay algo, poco».
 *
 * El suelo distorsiona la proporción de los valores diminutos a propósito. La cifra exacta va
 * escrita al lado, siempre, y es la que manda.
 */
export const MIN_BAR = 0.012

/**
 * Las proporciones de un juego de barras, todas contra el mismo máximo.
 *
 * **El mismo máximo para todas** es lo que hace la gráfica comparable: escalar cada fila contra su
 * propio máximo pintaría todas las categorías igual de largas y no diría nada.
 *
 * Se compara por valor absoluto porque una diferencia puede ser negativa y su tamaño sigue siendo
 * su tamaño. El signo lo dice la palabra que va al lado, no la longitud.
 */
export function barRatios(values: readonly string[]): number[] {
  const numbers = values.map(toNumber)
  const max = Math.max(...numbers.map(Math.abs), 0)

  if (max === 0) return numbers.map(() => 0)

  return numbers.map((value) => {
    const ratio = Math.abs(value) / max
    if (ratio === 0) return 0
    return Math.min(1, Math.max(MIN_BAR, ratio))
  })
}

/**
 * El importe como número, o cero.
 *
 * Cero y no `NaN`: un dato que no se pudo leer tiene que dibujar una barra vacía, no romper la
 * escala entera y dejar la gráfica en blanco. Que falte un dato se ve porque su cifra al lado
 * también falta.
 */
function toNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * El porcentaje que una parte representa del total, redondeado a un decimal.
 *
 * Para el peso de una categoría dentro del conjunto, que es lo que la spec pide poder ver «sin
 * perder de vista el total». Con total cero devuelve cero: no hay conjunto del que ser parte.
 */
export function shareOf(part: string, total: string): number {
  const whole = toNumber(total)
  if (whole === 0) return 0
  return Math.round((toNumber(part) / whole) * 1000) / 10
}
