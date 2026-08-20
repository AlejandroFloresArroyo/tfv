"use client"

import {
  type CalendarCell,
  CalendarGrid,
  type CalendarMonth,
  CalendarYearGrid,
  Select,
} from "@tfv/ui"
import { Clapperboard, ListChecks, NotebookPen } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import {
  CALENDAR_VIEWS,
  type CalendarData,
  type CalendarEventRow,
  type CalendarKind,
  type CalendarView,
  type CharacterRow,
  type ProductionCategoryRow,
} from "../../../production.ts"

/**
 * El calendario de la producción.
 *
 * ## La dirección es lo que estás mirando
 *
 * Sin fecha, la dirección significa «llévame donde está la acción»; con fecha, significa
 * exactamente ese día. Al llegar sin fecha, el servidor resuelve dónde aterrizar y **esta pantalla
 * reescribe la dirección** a la fecha resuelta, para que lo que se está mirando se pueda pegar en
 * un chat y abrirse igual.
 *
 * Se reescribe con `history.replaceState` y no navegando: navegar volvería a pedirle al servidor lo
 * que ya tenemos delante, y el calendario parpadearía al abrirse. Tampoco se apila en el historial,
 * porque volver atrás desde una fecha que nadie eligió no lleva a ninguna parte.
 *
 * ## Nunca una rejilla vacía
 *
 * Cuando la producción no tiene ni una jornada, ni un plan, ni una tarea, esto **no dibuja un mes en
 * blanco**: lo dice con palabras. Un mes desierto y un fallo de carga se ven exactamente igual, y la
 * diferencia importa mucho cuando alguien acaba de dar de alta la producción.
 */

/** Cada estado toma una temperatura de set. Ninguno se enseña sin su nombre escrito al lado. */
const WORKFLOW_TINT: Record<string, string> = {
  pending: "reposo",
  in_progress: "curso",
  rescheduled: "cuida",
  completed: "firme",
  cancelled: "alto",
}

const TASK_TINT: Record<string, string> = {
  pending: "reposo",
  in_progress: "curso",
  completed: "firme",
  // Cerrada sin terminar: pide atención, no está bloqueada.
  incomplete: "cuida",
}

const RECORDING_TINT: Record<string, string> = {
  draft: "reposo",
  ongoing: "curso",
  completed: "firme",
}

const LUZ: Record<string, string> = {
  reposo: "bg-luz-reposo",
  curso: "bg-luz-curso",
  firme: "bg-luz-firme",
  cuida: "bg-luz-cuida",
  alto: "bg-luz-alto",
}

const KIND_ICON = {
  recording: Clapperboard,
  workflow: NotebookPen,
  task: ListChecks,
} as const

function tintOf(event: CalendarEventRow): string {
  const table =
    event.kind === "workflow" ? WORKFLOW_TINT : event.kind === "task" ? TASK_TINT : RECORDING_TINT

  return table[event.status] ?? "reposo"
}

// ─── Aritmética de días, la mínima que la rejilla necesita ───────────────────

function startOfDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

function dayOf(instant: Date): string {
  const year = instant.getUTCFullYear().toString().padStart(4, "0")
  const month = (instant.getUTCMonth() + 1).toString().padStart(2, "0")
  const day = instant.getUTCDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}

function shiftDay(day: string, days: number): string {
  const moved = startOfDay(day)
  moved.setUTCDate(moved.getUTCDate() + days)
  return dayOf(moved)
}

/** El lunes de la semana de un día. La semana de rodaje va de lunes a domingo. */
function weekStart(day: string): string {
  const offset = (startOfDay(day).getUTCDay() + 6) % 7
  return shiftDay(day, -offset)
}

/** Los días de la rejilla: el rango, estirado a semanas enteras para que no queden huecos. */
function gridDays(from: string, to: string): string[] {
  const days: string[] = []
  let cursor = weekStart(from)
  const last = shiftDay(weekStart(to), 6)

  while (cursor <= last) {
    days.push(cursor)
    cursor = shiftDay(cursor, 1)
  }

  return days
}

export function ProductionCalendar({
  companyId,
  productionId,
  data,
  characters,
  categories,
  requestedDate,
  today,
}: {
  companyId: string
  productionId: string
  data: CalendarData
  characters: readonly CharacterRow[]
  categories: readonly ProductionCategoryRow[]
  /** La fecha que venía en la dirección, o nula. Es lo que decide si hay que reescribirla. */
  requestedDate: string | null
  today: string
}) {
  const t = useTranslations("productions.calendar")
  const tw = useTranslations("productions.workflowStatus")
  const tt = useTranslations("productions.taskStatus")
  const tr = useTranslations("productions.recordingStatus")
  const format = useFormatter()
  const router = useRouter()
  const params = useSearchParams()

  const base = `/c/${companyId}/productions/${productionId}/workflows/calendar`

  /**
   * La dirección se pone al día con lo que se está viendo.
   *
   * Sólo cuando no venía fecha: si alguien pidió un día concreto, la dirección ya es la correcta y
   * tocarla sería contradecirle.
   */
  useEffect(() => {
    if (requestedDate !== null) return

    const next = new URLSearchParams(params.toString())
    next.set("date", data.landing.date)
    window.history.replaceState(null, "", `${base}?${next.toString()}`)
  }, [requestedDate, data.landing.date, params, base])

  function linkTo(changes: Record<string, string | null>): string {
    const next = new URLSearchParams(params.toString())
    // La fecha resuelta viaja siempre: cambiar de vista **conserva la fecha**, que es el escenario
    // de la spec y lo que evita que pasar de mes a semana te deje en otra semana.
    next.set("date", data.landing.date)

    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }

    return `${base}?${next.toString()}`
  }

  const byDay = useMemo(() => {
    const grouped = new Map<string, CalendarEventRow[]>()
    for (const event of data.events) {
      const bucket = grouped.get(event.day)
      if (bucket) bucket.push(event)
      else grouped.set(event.day, [event])
    }
    return grouped
  }, [data.events])

  function statusName(event: CalendarEventRow): string {
    if (event.kind === "workflow") return tw(event.status)
    if (event.kind === "task") return tt(event.status)
    return tr(event.status)
  }

  const longDate = (day: string) =>
    format.dateTime(startOfDay(day), { dateStyle: "full", timeZone: "UTC" })

  // ─── Lo que se dice cuando no hay nada ─────────────────────────────────────

  if (data.landing.reason === "empty") {
    return (
      <div className="flex flex-col gap-4">
        <Toolbar
          data={data}
          linkTo={linkTo}
          characters={characters}
          categories={categories}
          params={params}
          router={router}
          base={base}
        />

        <div className="rounded-lg border border-edge border-dashed bg-panel px-6 py-12 text-center">
          <p className="text-body1 text-content">{t("emptyTitle")}</p>
          <p className="mx-auto mt-2 max-w-prose text-body2 text-content-muted">{t("emptyBody")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        data={data}
        linkTo={linkTo}
        characters={characters}
        categories={categories}
        params={params}
        router={router}
        base={base}
      />

      {/* Por qué estás mirando esto y no el mes actual. Sólo cuando la respuesta no es «hoy». */}
      {data.landing.reason !== "during" ? (
        <p className="rounded-lg border border-edge bg-panel-sunken px-3 py-2 text-body3 text-content-muted">
          {t(data.landing.reason === "before" ? "landedBefore" : "landedAfter", {
            date: longDate(data.landing.date),
          })}
        </p>
      ) : null}

      {data.view === "year" ? (
        <YearView
          data={data}
          byDay={byDay}
          today={today}
          onPick={(day) => router.push(linkTo({ view: "day", date: day }))}
          monthName={(day) => format.dateTime(startOfDay(day), { month: "long", timeZone: "UTC" })}
          longDate={longDate}
          countLabel={(count) => t("dayEvents", { count })}
          emptyMonthLabel={t("noneShort")}
        />
      ) : data.view === "day" ? (
        <DayView
          day={data.landing.date}
          events={byDay.get(data.landing.date) ?? []}
          title={longDate(data.landing.date)}
          companyId={companyId}
          productionId={productionId}
          statusName={statusName}
          emptyLabel={t("noneThisDay")}
        />
      ) : (
        <>
          {/* Tableta en adelante: la rejilla. */}
          <div className="hidden tablet:block">
            <CalendarGrid
              tall={data.view === "week"}
              weekdays={weekdayNames(format)}
              cells={gridDays(data.range.from, data.range.to).map<CalendarCell>((day) => ({
                day,
                label: format.dateTime(startOfDay(day), { day: "numeric", timeZone: "UTC" }),
                title: longDate(day),
                outside: day < data.range.from || day > data.range.to,
                today: day === today,
                landing: day === data.landing.date,
                children: (byDay.get(day) ?? []).map((event) => (
                  <EventChip
                    key={`${event.kind}-${event.id}`}
                    event={event}
                    statusName={statusName(event)}
                    companyId={companyId}
                    productionId={productionId}
                  />
                )),
              }))}
            />
          </div>

          {/*
            Por debajo de tableta, una agenda.
            Siete columnas con texto dentro no caben en un teléfono, y desplazarlas en horizontal
            escondería media semana sin anunciarlo. La agenda enseña **sólo los días con algo**, que
            es lo que de verdad se consulta con el teléfono en la mano.
          */}
          <div className="flex flex-col gap-3 tablet:hidden">
            {byDay.size === 0 ? (
              <p className="rounded-lg border border-edge border-dashed bg-panel px-4 py-8 text-center text-body2 text-content-muted">
                {t("noneThisRange")}
              </p>
            ) : (
              [...byDay.keys()]
                .sort()
                .map((day) => (
                  <DayView
                    key={day}
                    day={day}
                    events={byDay.get(day) ?? []}
                    title={longDate(day)}
                    companyId={companyId}
                    productionId={productionId}
                    statusName={statusName}
                    emptyLabel={t("noneThisDay")}
                  />
                ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── La barra ────────────────────────────────────────────────────────────────

function Toolbar({
  data,
  linkTo,
  characters,
  categories,
  params,
  router,
  base,
}: {
  data: CalendarData
  linkTo: (changes: Record<string, string | null>) => string
  characters: readonly CharacterRow[]
  categories: readonly ProductionCategoryRow[]
  params: URLSearchParams
  router: ReturnType<typeof useRouter>
  base: string
}) {
  const t = useTranslations("productions.calendar")

  function move(direction: -1 | 1): string {
    const step: Record<CalendarView, number> = { year: 365, month: 30, week: 7, day: 1 }
    // Se salta al día siguiente **fuera** del rango, y el servidor resuelve el periodo que lo
    // contiene: así avanzar un mes desde el 31 no aterriza dos meses más allá.
    const target =
      direction === 1
        ? shiftDay(data.range.to, 1)
        : shiftDay(data.range.from, -(step[data.view] === 1 ? 1 : 1))

    return linkTo({ date: target })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Link
          href={move(-1)}
          aria-label={t("previous")}
          className="grid size-[var(--control-h)] place-items-center rounded-lg border border-edge-control text-content-muted transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-focus"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <Link
          href={move(1)}
          aria-label={t("next")}
          className="grid size-[var(--control-h)] place-items-center rounded-lg border border-edge-control text-content-muted transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-focus"
        >
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {/* Las cuatro vistas. La elegida lleva la rúbrica de posición, en su versión de tinta. */}
      <nav
        aria-label={t("viewLabel")}
        className="flex items-center rounded-lg border border-edge-control p-0.5"
      >
        {CALENDAR_VIEWS.map((view) => (
          <Link
            key={view}
            href={linkTo({ view })}
            aria-current={data.view === view ? "true" : undefined}
            className={
              data.view === view
                ? "rounded-md bg-panel-sunken px-3 py-1 text-body3 font-semibold text-tinta-aparta"
                : "rounded-md px-3 py-1 text-body3 text-content-muted transition-colors hover:bg-panel-hover"
            }
          >
            {t(`view.${view}`)}
          </Link>
        ))}
      </nav>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        {characters.length > 0 ? (
          <div className="flex items-center gap-2">
            <label htmlFor="calendario-personaje" className="legend text-content-muted">
              {t("character")}
            </label>
            <Select
              id="calendario-personaje"
              value={params.get("characterId") ?? ""}
              onChange={(event) =>
                router.push(
                  `${base}?${withParam(params, "characterId", event.target.value, data.landing.date)}`,
                )
              }
              className="min-w-40"
            >
              <option value="">{t("allCharacters")}</option>
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {categories.length > 0 ? (
          <div className="flex items-center gap-2">
            <label htmlFor="calendario-categoria" className="legend text-content-muted">
              {t("category")}
            </label>
            <Select
              id="calendario-categoria"
              value={params.get("categoryId") ?? ""}
              onChange={(event) =>
                router.push(
                  `${base}?${withParam(params, "categoryId", event.target.value, data.landing.date)}`,
                )
              }
              className="min-w-40"
            >
              <option value="">{t("allCategories")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function withParam(params: URLSearchParams, key: string, value: string, date: string): string {
  const next = new URLSearchParams(params.toString())
  next.set("date", date)
  if (value === "") next.delete(key)
  else next.set(key, value)
  return next.toString()
}

// ─── Un suceso, dentro de una casilla ────────────────────────────────────────

function EventChip({
  event,
  statusName,
  companyId,
  productionId,
}: {
  event: CalendarEventRow
  statusName: string
  companyId: string
  productionId: string
}) {
  const Icon: (typeof KIND_ICON)[CalendarKind] = KIND_ICON[event.kind]
  const tint = tintOf(event)

  const body = (
    <>
      <span className="flex items-center gap-1.5">
        <Icon className="size-3 shrink-0 text-content-faint" aria-hidden="true" />
        <span className="truncate text-body3 text-content">{event.title}</span>
      </span>
      {/*
        La regla del color que no viaja solo: el punto de temperatura **y** el nombre del estado
        escrito, siempre los dos. El color acelera a quien conoce el sistema; el nombre es lo que
        lo hace utilizable por quien no y por quien no distingue el ámbar del verde.
      */}
      <span className="flex items-center gap-1.5">
        <span
          className={`size-1.5 shrink-0 rounded-full ${LUZ[tint] ?? "bg-luz-reposo"}`}
          aria-hidden="true"
        />
        <span className="truncate text-body3 text-content-faint">{statusName}</span>
      </span>
    </>
  )

  const className =
    "flex flex-col gap-0.5 rounded-xs border border-edge bg-panel-sunken px-1.5 py-1 text-left"

  // Sólo el plan y la tarea llevan a algún sitio; la jornada es de otra pantalla que aún no existe.
  if (event.kind === "workflow" || event.kind === "task") {
    const href =
      event.kind === "workflow"
        ? `/c/${companyId}/productions/${productionId}/workflows/${event.id}`
        : `/c/${companyId}/productions/${productionId}/workflows/${event.workflowId}#tarea-${event.id}`

    return (
      <Link
        href={href}
        className={`${className} transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-focus`}
      >
        {body}
      </Link>
    )
  }

  return <span className={className}>{body}</span>
}

// ─── El día ──────────────────────────────────────────────────────────────────

function DayView({
  day,
  events,
  title,
  companyId,
  productionId,
  statusName,
  emptyLabel,
}: {
  day: string
  events: readonly CalendarEventRow[]
  title: string
  companyId: string
  productionId: string
  statusName: (event: CalendarEventRow) => string
  emptyLabel: string
}) {
  return (
    <section className="rounded-lg border border-edge bg-panel">
      <h2 className="border-edge border-b px-4 py-2 text-body2 text-content">{title}</h2>

      {events.length === 0 ? (
        <p className="px-4 py-6 text-center text-body3 text-content-muted">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-edge">
          {events.map((event) => (
            <li key={`${event.kind}-${event.id}`} className="px-2 py-2">
              <EventChip
                event={event}
                statusName={statusName(event)}
                companyId={companyId}
                productionId={productionId}
              />
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only">{day}</span>
    </section>
  )
}

// ─── El año ──────────────────────────────────────────────────────────────────

function YearView({
  data,
  byDay,
  today,
  onPick,
  monthName,
  longDate,
  countLabel,
  emptyMonthLabel,
}: {
  data: CalendarData
  byDay: Map<string, CalendarEventRow[]>
  today: string
  onPick: (day: string) => void
  monthName: (day: string) => string
  longDate: (day: string) => string
  countLabel: (count: number) => string
  emptyMonthLabel: string
}) {
  const year = data.range.from.slice(0, 4)

  const months = useMemo<CalendarMonth[]>(() => {
    return Array.from({ length: 12 }, (_, index) => {
      const month = `${index + 1}`.padStart(2, "0")
      const first = `${year}-${month}-01`
      const lastDay = new Date(Date.UTC(Number(year), index + 1, 0)).getUTCDate()

      // Hueco inicial: los días de la semana anterior al día uno, para que las columnas cuadren.
      const lead = (startOfDay(first).getUTCDay() + 6) % 7
      const days = Array.from({ length: lead }, () => null) as (null | {
        day: string
        count: number
        today?: boolean
        title: string
      })[]

      let total = 0
      for (let number = 1; number <= lastDay; number++) {
        const day = `${year}-${month}-${`${number}`.padStart(2, "0")}`
        const count = byDay.get(day)?.length ?? 0
        total += count
        days.push({
          day,
          count,
          ...(day === today ? { today: true } : {}),
          title: `${longDate(day)} · ${countLabel(count)}`,
        })
      }

      return { key: month, name: monthName(first), days, total }
    })
  }, [year, byDay, today, monthName, longDate, countLabel])

  return <CalendarYearGrid months={months} onPick={onPick} emptyMonthLabel={emptyMonthLabel} />
}

/** Los siete nombres de día, empezando en lunes, en el idioma de quien mira. */
function weekdayNames(format: ReturnType<typeof useFormatter>): string[] {
  // Un lunes cualquiera de referencia; sólo se usa para sacar los nombres.
  return Array.from({ length: 7 }, (_, index) =>
    format.dateTime(startOfDay(shiftDay("2026-03-09", index)), {
      weekday: "short",
      timeZone: "UTC",
    }),
  )
}
