/**
 * El calendario de producción.
 *
 * Ver `openspec/specs/production-workflows/spec.md`, requisito «Vista de calendario».
 *
 * Aquí vive lo que es **función y no consulta**: qué día civil le toca a un instante, qué rango
 * abarca cada vista, y —la decisión que gobierna la superficie entera— **dónde aterriza el
 * calendario cuando nadie ha dicho una fecha**.
 *
 * ## Por qué la fecha la resuelve el servidor
 *
 * Si abres el calendario de una producción cuyo rodaje empieza dentro de dos meses, un calendario
 * corriente te enseña el mes actual: una rejilla vacía, indistinguible de un fallo de carga. El
 * cliente no puede arreglarlo por su cuenta porque **no sabe dónde están los sucesos sin
 * preguntar**, y para cuando lo sabe ya pintó el mes equivocado.
 *
 * Así que la respuesta trae la fecha de aterrizaje y **por qué**: antes del periodo, dentro,
 * después, o sin nada que enseñar. Los cuatro motivos son cuatro frases distintas en pantalla, y el
 * cuarto —«vacío»— es el que evita la rejilla en blanco: se dice con palabras que todavía no hay
 * nada programado, en vez de dibujar un mes desierto.
 *
 * ## El día civil es en tiempo universal
 *
 * Un calendario agrupa por **días**, no por instantes, y para pasar de uno a otro hace falta una
 * zona horaria. El modelo no guarda ninguna —ni la producción ni la empresa tienen columna— así que
 * se usa la universal, que es la única que da el mismo resultado para todo el mundo y hace que un
 * enlace compartido enseñe lo mismo a quien lo abre.
 *
 * La contrapartida está medida y anotada (`HALLAZGOS.md` H-221): un plan escrito desde el navegador
 * viaja como medianoche local, que en México son las 06:00 universales del mismo día, así que cae
 * donde debe. Un instante de la tarde-noche escrito por otra vía puede caer en el día siguiente.
 */

// ─── Las cuatro vistas ───────────────────────────────────────────────────────

/** Las cuatro vistas que la spec enumera, de la más amplia a la más estrecha. */
export const CALENDAR_VIEWS = ["year", "month", "week", "day"] as const

export type CalendarView = (typeof CALENDAR_VIEWS)[number]

/**
 * Por qué el calendario aterrizó donde aterrizó.
 *
 * Viaja siempre, incluso cuando la fecha llegó pedida: quien la pidió recibe `during` si cae dentro
 * del periodo y la pantalla no tiene que volver a deducirlo.
 */
export const LANDING_REASONS = ["before", "during", "after", "empty"] as const

export type LandingReason = (typeof LANDING_REASONS)[number]

/** Dónde se sitúa el calendario, y por qué. */
export interface CalendarLanding {
  /** Día civil, `AAAA-MM-DD`. */
  readonly date: string
  readonly reason: LandingReason
}

/** Un rango de días civiles, ambos extremos incluidos. */
export interface DayRange {
  readonly from: string
  readonly to: string
}

// ─── Días civiles ────────────────────────────────────────────────────────────

/**
 * El día civil de un instante, en tiempo universal.
 *
 * Se compone a mano en lugar de recortar el ISO porque `toISOString` de una fecha inválida lanza, y
 * aquí llegan columnas que admiten nulo.
 */
export function dayOf(instant: Date): string {
  const year = instant.getUTCFullYear().toString().padStart(4, "0")
  const month = (instant.getUTCMonth() + 1).toString().padStart(2, "0")
  const day = instant.getUTCDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** El primer instante de un día civil. Es lo que se compara contra una columna de marca de tiempo. */
export function startOfDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

/** El último instante de un día civil, para el extremo cerrado de un rango. */
export function endOfDay(day: string): Date {
  return new Date(`${day}T23:59:59.999Z`)
}

/** Un día civil desplazado en días. La aritmética la hace el motor de fechas, no el texto. */
export function shiftDay(day: string, days: number): string {
  const moved = startOfDay(day)
  moved.setUTCDate(moved.getUTCDate() + days)
  return dayOf(moved)
}

/**
 * El lunes de la semana de un día.
 *
 * Lunes y no domingo: una semana de rodaje se planea de lunes a domingo, y partir el fin de semana
 * en dos rejillas distintas es justo lo que nadie quiere ver al mirar un calendario de producción.
 */
export function weekStart(day: string): string {
  const date = startOfDay(day)
  // `getUTCDay` cuenta desde el domingo; el lunes queda a distancia 0 y el domingo a 6.
  const offset = (date.getUTCDay() + 6) % 7
  return shiftDay(day, -offset)
}

// ─── El rango de una vista ───────────────────────────────────────────────────

/**
 * Qué abarca una vista situada en un día.
 *
 * El día pedido **siempre queda dentro** del rango que devuelve, que es lo que cumple el escenario
 * de cambiar de vista conservando la fecha: pasar de mes a semana enseña la semana que contiene ese
 * día, sin que nadie tenga que recalcular nada.
 */
export function calendarRange(view: CalendarView, day: string): DayRange {
  switch (view) {
    case "day":
      return { from: day, to: day }

    case "week": {
      const from = weekStart(day)
      return { from, to: shiftDay(from, 6) }
    }

    case "month": {
      const date = startOfDay(day)
      const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
      // El día cero del mes siguiente es el último del actual, y así febrero se cuenta solo.
      const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
      return { from: dayOf(first), to: dayOf(last) }
    }

    case "year": {
      const year = startOfDay(day).getUTCFullYear()
      return {
        from: dayOf(new Date(Date.UTC(year, 0, 1))),
        to: dayOf(new Date(Date.UTC(year, 11, 31))),
      }
    }
  }
}

// ─── La fecha de aterrizaje ──────────────────────────────────────────────────

/**
 * Dónde situar el calendario cuando nadie ha dicho una fecha.
 *
 * Recibe **los días en los que hay algo** —jornadas, planes y tareas ya mezclados— y el día de hoy.
 * No le importa el orden en que lleguen ni que vengan repetidos: lo que necesita son los extremos y
 * el más cercano.
 *
 * Los cuatro casos son los cuatro motivos, y ninguno devuelve una fecha sin nada alrededor salvo el
 * último, que es el único en el que de verdad no hay nada que enseñar.
 */
export function landingOf(days: readonly string[], today: string): CalendarLanding {
  if (days.length === 0) return { date: today, reason: "empty" }

  // Comparación de cadenas: `AAAA-MM-DD` ordena igual como texto que como fecha, que es la razón
  // por la que este módulo trabaja en ese formato y no en instantes.
  let first = days[0] as string
  let last = days[0] as string
  for (const day of days) {
    if (day < first) first = day
    if (day > last) last = day
  }

  if (today < first) return { date: first, reason: "before" }
  if (today > last) return { date: last, reason: "after" }

  return { date: nearest(days, today), reason: "during" }
}

/**
 * El día con algo que cae más cerca de hoy.
 *
 * A igual distancia gana **el de adelante**: una hoja de llamado se lee hacia el futuro, y con una
 * jornada a tres días por detrás y otra a tres por delante, la que importa es la que viene. El
 * criterio tiene que estar escrito porque sin él el resultado dependería del orden de la consulta.
 */
function nearest(days: readonly string[], today: string): string {
  let best = days[0] as string
  let bestDistance = Number.POSITIVE_INFINITY

  for (const day of days) {
    const distance = Math.abs(daysBetween(today, day))
    const closer = distance < bestDistance
    const tieAhead = distance === bestDistance && day > best
    if (closer || tieAhead) {
      best = day
      bestDistance = distance
    }
  }

  return best
}

/** Días enteros entre dos días civiles. Positivo cuando el segundo va después. */
export function daysBetween(from: string, to: string): number {
  const millis = startOfDay(to).getTime() - startOfDay(from).getTime()
  return Math.round(millis / 86_400_000)
}
