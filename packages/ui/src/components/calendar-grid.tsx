import type { ReactNode } from "react"
import { cn } from "../lib/cn.ts"

/**
 * La rejilla de un calendario.
 *
 * Rebanada 22. **Aquí no hay fechas ni estado**: no calcula qué día es hoy, no sabe en qué mes
 * está, no enruta y no llama a `Date` ni una vez. Recibe una lista de casillas ya resueltas y las
 * coloca. Es la misma separación que en los primitivos de colección, y por el mismo motivo: la
 * aritmética de días civiles vive en `@tfv/contracts`, se prueba sin navegador, y el sistema de
 * diseño no acaba dependiendo de la zona horaria de nadie.
 *
 * ## Por qué la casilla es una hoja de llamado en miniatura
 *
 * Un calendario corriente pinta píldoras de colores dentro de un cuadro. Aquí no sirve: **el color
 * nunca viaja solo**, así que cada suceso escribe el nombre de su estado al lado de su punto de
 * temperatura. Eso hace la fila más alta y obliga a que la casilla se lea de arriba abajo como el
 * bloque de una hoja de llamado —lo que se rueda, el plan que lo sostiene, lo que hay que hacer—
 * en vez de como una cuadrícula de manchas.
 *
 * ## La rejilla no baja del tamaño de tableta
 *
 * Siete columnas con texto dentro no caben en un teléfono, y desplazarlas en horizontal esconde la
 * mitad de la semana sin anunciarlo — justo lo que `DESIGN.md` prohíbe para las tablas. Quien la
 * usa pinta una agenda en su lugar por debajo de tableta; esta pieza sólo se asegura de no
 * desbordar y de no encogerse hasta ser ilegible.
 */

/** Una casilla de la rejilla, ya resuelta por quien la dibuja. */
export interface CalendarCell {
  /** Día civil `AAAA-MM-DD`. Es la clave de React y el valor que viaja en la dirección. */
  readonly day: string
  /** El número del día, ya formateado en el idioma de quien mira. */
  readonly label: string
  /** Fuera del periodo que se está mirando: los días vecinos que rellenan la primera y la última semana. */
  readonly outside?: boolean | undefined
  /** Hoy, en el día de quien mira. */
  readonly today?: boolean | undefined
  /** El día en el que el calendario aterrizó. Lleva la rúbrica de posición. */
  readonly landing?: boolean | undefined
  /** Nombre accesible de la casilla: la fecha larga, no el número suelto. */
  readonly title: string
  readonly children?: ReactNode
}

export interface CalendarGridProps {
  /** Los siete nombres de día, empezando en lunes y ya traducidos. */
  readonly weekdays: readonly string[]
  readonly cells: readonly CalendarCell[]
  /**
   * La semana da a cada casilla mucho más alto que el mes.
   *
   * Es la diferencia entre las dos vistas: el mes enseña **que hay algo** y la semana enseña **qué
   * es**. Con la misma altura, la de semana sería un mes con cinco columnas de menos.
   */
  readonly tall?: boolean | undefined
  readonly className?: string | undefined
}

export function CalendarGrid({ weekdays, cells, tall = false, className }: CalendarGridProps) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-edge bg-panel", className)}>
      <div className="grid grid-cols-7 border-edge border-b bg-panel-sunken">
        {weekdays.map((weekday) => (
          <div key={weekday} className="px-2 py-2 text-center legend text-content-muted">
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell) => (
          <div
            key={cell.day}
            // Los bordes se pintan sólo arriba y a la izquierda: en una rejilla, hacerlo por los
            // cuatro lados duplica cada línea interior y la deja del doble de grosor que el marco.
            className={cn(
              "-mt-px -ml-px flex min-w-0 flex-col gap-1 border-edge border-t border-l p-1.5",
              tall ? "min-h-40" : "min-h-24",
              cell.outside && "bg-panel-sunken/40",
            )}
          >
            <div className="flex items-baseline justify-between gap-1">
              <span
                className={cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-body3 tabular-nums",
                  cell.outside ? "text-content-faint" : "text-content-muted",
                  // Hoy es un anillo y no un relleno: un relleno competiría con las temperaturas
                  // de los sucesos que la casilla tiene dentro, que es lo que de verdad hay que leer.
                  cell.today && "ring-1 ring-edge-control ring-inset",
                  // La rúbrica de posición, en su versión de tinta. El oro puro sobre panel claro
                  // da 1.6:1 y como señal desaparece.
                  cell.landing && "font-semibold text-tinta-aparta",
                )}
              >
                <span className="sr-only">{cell.title}</span>
                <span aria-hidden="true">{cell.label}</span>
              </span>
            </div>

            <div className="flex min-w-0 flex-col gap-1">{cell.children}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Un mes de la vista de año: su nombre y la densidad de cada uno de sus días. */
export interface CalendarMonth {
  readonly key: string
  readonly name: string
  /** Casillas del mes, en orden, con el hueco inicial ya incluido como `null`. */
  readonly days: readonly (CalendarYearDay | null)[]
  readonly total: number
}

export interface CalendarYearDay {
  readonly day: string
  /** Cuántos sucesos caen ese día. Cero pinta la casilla apagada. */
  readonly count: number
  readonly today?: boolean | undefined
  /** Nombre accesible: la fecha larga y cuántos sucesos hay. Es lo que la marca no puede decir. */
  readonly title: string
}

export interface CalendarYearGridProps {
  readonly months: readonly CalendarMonth[]
  /** Qué hacer al elegir un día. Sin ella los días no son alcanzables y se pintan quietos. */
  readonly onPick?: ((day: string) => void) | undefined
  readonly emptyMonthLabel: string
  readonly className?: string | undefined
}

/**
 * El año, doce meses de un vistazo.
 *
 * A esta escala **no cabe el nombre de ningún estado**, así que la vista de año no dice estados:
 * dice **dónde hay trabajo**. Cada día es una marca cuya presencia significa «aquí pasa algo», y el
 * único gradiente es la intensidad —uno, pocos, muchos—, que se anuncia en el texto accesible de
 * cada casilla. Fingir aquí las temperaturas sería usar el color solo, sin su nombre al lado.
 */
export function CalendarYearGrid({
  months,
  onPick,
  emptyMonthLabel,
  className,
}: CalendarYearGridProps) {
  return (
    <div
      className={cn(
        "grid gap-4 phone:grid-cols-2 laptop:grid-cols-3 desktop:grid-cols-4",
        className,
      )}
    >
      {months.map((month) => (
        <div key={month.key} className="rounded-lg border border-edge bg-panel p-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-body2 text-content">{month.name}</h3>
            <span className="text-body3 text-content-faint tabular-nums">
              {month.total === 0 ? emptyMonthLabel : month.total}
            </span>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {month.days.map((day, index) =>
              day === null ? (
                // Hueco de la primera semana. Sin clave estable porque no es un dato: es sitio.
                // biome-ignore lint/suspicious/noArrayIndexKey: es un relleno de posición, no una fila.
                <span key={`hueco-${month.key}-${index}`} aria-hidden="true" className="size-5" />
              ) : (
                <DensityCell key={day.day} day={day} onPick={onPick} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function DensityCell({
  day,
  onPick,
}: {
  day: CalendarYearDay
  onPick?: ((day: string) => void) | undefined
}) {
  /**
   * Tres escalones y no una rampa continua.
   *
   * Con una rampa nadie distingue cuatro de cinco, y la diferencia que sí importa —«hay algo» o
   * «no hay nada»— se diluye. La cifra exacta va en el texto accesible.
   */
  const level = day.count === 0 ? 0 : day.count === 1 ? 1 : day.count <= 3 ? 2 : 3

  const surface =
    level === 0
      ? "bg-panel-sunken"
      : level === 1
        ? "bg-[color-mix(in_oklab,var(--luz-aparta)_22%,var(--panel))]"
        : level === 2
          ? "bg-[color-mix(in_oklab,var(--luz-aparta)_45%,var(--panel))]"
          : "bg-accent"

  /**
   * La casilla del año **no lleva el número del día**, y es una decisión, no un olvido.
   *
   * Trescientos sesenta y cinco numerales de seis píxeles no se leen: se ven como ruido y tapan lo
   * único que esta vista tiene que decir, que es dónde se acumula el trabajo. La fecha y la cifra
   * exacta viajan en el nombre accesible, donde sí se pueden consultar.
   */
  const className = cn("size-5 rounded-xs", surface)

  if (!onPick) {
    return (
      <span className={className} title={day.title}>
        <span className="sr-only">{day.title}</span>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onPick(day.day)}
      title={day.title}
      // El día de hoy lleva anillo también aquí, por la misma razón que en la rejilla grande.
      className={cn(
        className,
        "cursor-pointer transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-1",
        day.today && "ring-1 ring-edge-control ring-inset",
      )}
    >
      <span className="sr-only">{day.title}</span>
    </button>
  )
}
