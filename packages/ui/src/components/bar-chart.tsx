import type { ReactNode } from "react"
import { cn } from "../lib/cn.ts"
import type { Tint } from "./surfaces.tsx"

/**
 * Barras horizontales, dibujadas con SVG en línea.
 *
 * Rebanada 22, para el presupuesto: lo presupuestado contra lo gastado, y el desglose por
 * categoría. **No hay librería de gráficas en el repositorio y no se añade ninguna**: una barra es
 * un rectángulo cuyo ancho es una fracción, y la fracción la calcula `lib/chart.ts`, que se prueba
 * sin navegador.
 *
 * ## Aquí no hay aritmética
 *
 * Igual que la rejilla del calendario no sabe qué día es hoy, esto no sabe cuánto se gastó: recibe
 * proporciones ya resueltas y cifras ya formateadas. Es lo que impide que el sistema de diseño
 * acabe con una función de dinero dentro.
 *
 * ## El color nunca viaja solo
 *
 * Cada barra lleva **su nombre y su cifra escritos al lado**. Una leyenda de colores aparte obliga
 * a mirar dos sitios y desaparece para quien no distingue los dos tonos; y en el papel, que no
 * tiene tema, la barra se imprime gris y lo único que queda es el texto. Por eso el texto es el
 * dato y la barra es el adorno que lo hace comparable de un vistazo.
 *
 * ## Horizontal, y no vertical
 *
 * Las etiquetas son nombres de categoría —«Vestuario», «Escenografía»— y en vertical no caben:
 * acabarían giradas cuarenta y cinco grados, que es la forma más común de que una gráfica deje de
 * poder leerse. En horizontal la etiqueta va donde va cualquier lista.
 */

/** Una barra: qué mide, cuánto mide, y de qué color. */
export interface ChartBar {
  /** Qué es esta barra, escrito. «Presupuestado», «Gastado». */
  readonly label: string
  /** La cifra, **ya formateada** por quien la dibuja. Es el dato; la barra sólo la ilustra. */
  readonly value: string
  /** Proporción contra el máximo del juego, de 0 a 1. Sale de `barRatios`. */
  readonly ratio: number
  readonly tint: Tint
}

/** Un grupo de barras bajo una etiqueta: una categoría, o el conjunto. */
export interface ChartRow {
  readonly key: string
  readonly label: string
  readonly bars: readonly ChartBar[]
  /** Lo que se dice del grupo: la diferencia con su palabra, el peso sobre el total. */
  readonly note?: ReactNode | undefined
}

export interface BarChartProps {
  readonly rows: readonly ChartRow[]
  /** Qué se enseña cuando no hay ninguna fila. Una gráfica en blanco se lee como un fallo. */
  readonly empty: ReactNode
  readonly className?: string | undefined
}

const FILLS: Record<Tint, string> = {
  reposo: "fill-luz-reposo",
  curso: "fill-luz-curso",
  firme: "fill-luz-firme",
  aparta: "fill-luz-aparta",
  cuida: "fill-luz-cuida",
  alto: "fill-luz-alto",
  leido: "fill-luz-leido",
  neutral: "fill-luz-reposo",
  accent: "fill-luz-aparta",
  success: "fill-luz-firme",
  warning: "fill-luz-cuida",
  danger: "fill-luz-alto",
}

export function BarChart({ rows, empty, className }: BarChartProps) {
  if (rows.length === 0) {
    return <p className={cn("text-body2 text-content-muted", className)}>{empty}</p>
  }

  return (
    <ul className={cn("flex flex-col gap-4", className)}>
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="min-w-0 text-body2 font-semibold text-content">{row.label}</span>
            {row.note === undefined ? null : (
              <span className="text-body3 text-content-muted">{row.note}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            {row.bars.map((bar) => (
              <Bar key={bar.label} bar={bar} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Una barra y su cifra.
 *
 * El `svg` va con `preserveAspectRatio="none"` y coordenadas de 0 a 100 para que el ancho salga
 * en porcentaje sin medir nada: no hace falta saber cuántos píxeles mide el contenedor, que es
 * justo el dato que en el servidor no existe. Sólo hay rellenos, así que la deformación del eje no
 * afecta a ningún trazo.
 *
 * `role="img"` con nombre accesible, y `aria-hidden` en las barras de dentro: quien navega con
 * lector de pantalla oye «Presupuestado: 100.000,00», que es el dato entero, en vez de un
 * rectángulo.
 */
function Bar({ bar }: { bar: ChartBar }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 truncate text-body3 text-content-muted">{bar.label}</span>

      <svg
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${bar.label}: ${bar.value}`}
        className="h-2.5 min-w-0 flex-1 rounded-xs bg-panel-sunken"
      >
        <rect
          x="0"
          y="0"
          width={Math.max(0, Math.min(1, bar.ratio)) * 100}
          height="8"
          className={FILLS[bar.tint]}
        />
      </svg>

      <span className="shrink-0 text-body3 tabular-nums text-content">{bar.value}</span>
    </div>
  )
}
