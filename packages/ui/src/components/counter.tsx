"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "../lib/cn.ts"

/**
 * En el servidor no hay disposición que medir, y React avisa si se le pide.
 *
 * Se usa la variante de disposición en el cliente a propósito: corre **antes** de que el navegador
 * pinte, así que la cuenta arranca desde su origen sin que llegue a verse un fotograma con el valor
 * final. Con `useEffect` habría un parpadeo del número correcto seguido de un salto hacia atrás.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/** Salida exponencial: rápida al principio y asentándose al final, sin rebote. */
const salida = (t: number) => 1 - 2 ** (-10 * t)

export interface CounterProps {
  value: number
  /**
   * Cómo se escribe el número.
   *
   * El sistema de diseño no habla ningún idioma y la aplicación se sirve en dos, así que el
   * formato lo pone quien lo usa. Por defecto va sin agrupar, que es correcto en cualquier idioma
   * aunque sea feo en algunos: inventar aquí un separador de miles sería elegir un idioma a
   * escondidas, y además haría que servidor y cliente pintaran cosas distintas.
   */
  format?: ((value: number) => string) | undefined
  durationMs?: number | undefined
  className?: string | undefined
}

/**
 * Un número que se asienta en su valor.
 *
 * **El valor real se pinta en el servidor.** La cuenta es un añadido del cliente y sólo corre
 * cuando hay movimiento permitido, así que sin JavaScript, con `prefers-reduced-motion`, o en el
 * primer HTML, el dato está completo y es correcto. Una cifra que hay que esperar para leer no es
 * una animación, es un dato escondido.
 *
 * Al cambiar el valor cuenta desde el anterior hasta el nuevo, que es donde de verdad se siente
 * que el sistema está vivo: la cifra se mueve porque **algo pasó**, no porque la pantalla cargó.
 */
export function Counter({ value, format, durationMs = 850, className }: CounterProps) {
  const escribir = format ?? ((v: number) => String(v))

  // El primer render —servidor y primera pintura del cliente— muestra el valor de verdad.
  const [mostrado, setMostrado] = useState(value)
  const anterior = useRef(0)
  const cuadro = useRef(0)

  useIsomorphicLayoutEffect(() => {
    const quieto =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (quieto) {
      anterior.current = value
      setMostrado(value)
      return
    }

    const desde = anterior.current
    const hasta = value
    anterior.current = value
    if (desde === hasta) return

    let inicio = 0
    const paso = (ahora: number) => {
      if (inicio === 0) inicio = ahora
      const t = Math.min(1, (ahora - inicio) / durationMs)

      /*
       * El último fotograma se fija al valor exacto en vez de calcularse.
       *
       * La salida exponencial **nunca llega a uno**: en t=1 vale 1 − 2⁻¹⁰ = 0.999, que sobre 1284
       * redondea a 1283. Un contador que se queda un entero por debajo del dato real no es un
       * detalle de suavizado: es una cifra equivocada en pantalla, y aquí las cifras son
       * existencias y dinero.
       */
      setMostrado(t >= 1 ? hasta : Math.round(desde + (hasta - desde) * salida(t)))

      if (t < 1) cuadro.current = requestAnimationFrame(paso)
    }

    /*
     * El descenso al origen ocurre **dentro** del primer fotograma, no antes de pedirlo.
     *
     * Importa por el modo en que esto falla. Si se bajara la cifra a cero y luego se pidiera el
     * fotograma, un navegador que nunca lo entrega —pestaña en segundo plano, entorno sin
     * composición, batería baja— dejaría un cero permanente en pantalla: un dato falso, que es
     * mucho peor que una animación que no corre. Pidiéndolo primero, el peor caso es que la cifra
     * real se quede quieta, que es exactamente lo que debe pasar.
     */
    cuadro.current = requestAnimationFrame(paso)

    return () => cancelAnimationFrame(cuadro.current)
  }, [value, durationMs])

  return <span className={cn("tnum", className)}>{escribir(mostrado)}</span>
}
