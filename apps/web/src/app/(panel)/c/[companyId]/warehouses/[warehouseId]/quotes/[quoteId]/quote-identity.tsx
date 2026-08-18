"use client"

import { Callout, Field, Input, Select, Switch, Textarea } from "@tfv/ui"
import { CalendarRange } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { ApiError, api, SessionExpiredError } from "~/lib/api.client.ts"
import { useAutosave } from "~/lib/autosave.ts"
import type { QuoteRow } from "../../../warehouse.ts"
import { SaveState } from "./quote-payment.tsx"
import { usePreviewedQuote, usePublishPreview } from "./quote-preview.tsx"

/**
 * La identidad del documento: cómo se llama, qué dice de sí mismo y para qué días es.
 *
 * ## Sin botón, como sus dos vecinos
 *
 * Se guarda al perder el foco; los interruptores y selectores, al cambiar. La mecánica —una
 * petición en vuelo a la vez, y un fallo que no revierte lo escrito— vive en `useAutosave`, con sus
 * pruebas. Es la decisión tomada para este documento en concreto: **una cotización se compone**, y
 * un botón por bloque obligaría a acordarse de pulsar cuatro.
 *
 * ## La ventana no es un dato más
 *
 * Cambiarla **cambia los días que cobra cada línea**, y con ellos el importe de todas. Por eso el
 * formulario publica su ventana en el punto de composición en cuanto es válida, sin esperar al
 * guardado: los días aplicados y los totales que el editor tiene tres centímetros más abajo se
 * rehacen con lo que se está escribiendo. Sin eso, mover la fecha de fin dejaba una ventana de diez
 * días encima de unas líneas que seguían cobrando catorce.
 *
 * Y mientras el guardado tenga algo pendiente, la previsualización se declara **sin guardar**: el
 * panel de importes de la otra columna pasa a enseñar lo mismo que las líneas en lugar de la cifra
 * anterior. Es H-17 aplicado al bloque que faltaba.
 *
 * ## Por qué una fecha a medias no viaja
 *
 * `PATCH` acepta cada campo por separado, pero este bloque manda **los seis juntos**: es el mismo
 * documento y mandarlo entero es lo que hace que reintentar sea seguro —el guardado automático
 * repite el estado más reciente, y con un cuerpo parcial repetir dejaría de ser inocuo—. Que eso
 * dependa de una costumbre y no del contrato es H-59: los cuatro bloques del documento se guardan
 * con dos verbos y tres formas de cuerpo.
 *
 * De ahí la regla: una ventana con una sola fecha escrita mandaría `null` en la otra y borraría del
 * servidor la que había, así que el bloque espera a que estén las dos —o ninguna, que sí es una
 * instrucción—. Una renta sin fechas es legal hasta que quiere avanzar; lo que no es legal es
 * perder la mitad de la ventana por haber empezado a escribir.
 *
 * ## Qué no se enseña aquí
 *
 * El nombre y la descripción son el título y el subtítulo de la pantalla. A quien no puede
 * editarlos no se le repiten en un panel: se le enseña lo que sí cambia el dinero —la ventana y su
 * redondeo—, que es lo que hoy había.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/

interface Form {
  readonly name: string
  readonly description: string
  readonly startsOn: string
  readonly endsOn: string
  readonly roundDays: boolean
  readonly roundDirection: "up" | "down"
}

/** Lo que viaja en el `PATCH`. Las fechas van como instante, que es lo que declara la ruta. */
interface Identity {
  readonly name: string
  readonly description: string
  readonly startsOn?: string | null
  readonly endsOn?: string | null
  readonly roundDays?: boolean
  readonly roundDirection?: "up" | "down"
}

export function QuoteIdentity({
  companyId,
  warehouseId,
  quoteId,
  quote,
  editable,
  extension,
}: {
  companyId: string
  warehouseId: string
  quoteId: string
  quote: QuoteRow
  /** Sin permiso de edición, o con la cotización cerrada: se ve, no se toca. */
  editable: boolean
  /** El disparador de la extensión de renta, si quien mira puede crearla. */
  extension?: ReactNode
}) {
  const t = useTranslations("warehouses.quotes")
  const format = useFormatter()
  const router = useRouter()
  const [form, setForm] = useState<Form>(() => formOf(quote))

  // Una venta no exige ventana, y dos campos de fecha que no se usan invitan a rellenarlos. Se
  // enseñan igualmente si la cotización ya trae fechas: esconder un dato guardado es peor que
  // enseñar un campo de más, porque deja de haber forma de quitarlo.
  const hasWindow = quote.type === "rent" || quote.startsOn !== null || quote.endsOn !== null

  const { value, invalid } = useMemo(() => derive(form, hasWindow), [form, hasWindow])

  const autosave = useAutosave(value, async (next) => {
    try {
      await api(`/companies/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}`, {
        method: "PATCH",
        body: next,
      })
      router.refresh()
    } catch (failure) {
      if (failure instanceof SessionExpiredError) {
        router.replace("/login")
        return
      }
      throw failure instanceof ApiError ? failure : new Error(t("identityFailed"))
    }
  })

  const publish = usePublishPreview()
  const pending = autosave.pending
  useEffect(() => {
    if (invalid.size > 0) return
    publish.window(
      {
        startsOn: dayStart(form.startsOn),
        endsOn: dayStart(form.endsOn),
        roundDays: form.roundDays,
        roundDirection: form.roundDirection,
      },
      pending,
    )
  }, [publish, invalid, form.startsOn, form.endsOn, form.roundDays, form.roundDirection, pending])

  const preview = usePreviewedQuote()

  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }))
  const commit = () => {
    if (invalid.size === 0) autosave.commit()
  }
  const bad = (field: string) => invalid.has(field) || undefined

  const days =
    preview.breakdown && hasWindow && quote.type === "rent" ? preview.breakdown.days : null

  if (!editable) {
    return (
      <dl className="grid gap-3 tablet:grid-cols-2">
        <Row
          label={t("window")}
          value={
            quote.startsOn && quote.endsOn ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <CalendarRange className="size-4 text-content-faint" aria-hidden="true" />
                {format.dateTime(new Date(quote.startsOn), { dateStyle: "medium" })} –{" "}
                {format.dateTime(new Date(quote.endsOn), { dateStyle: "medium" })}
                {extension}
                {days === null ? null : (
                  <span className="text-content-faint">· {t("days", { count: days })}</span>
                )}
              </span>
            ) : (
              t("noWindow")
            )
          }
        />
        <Row
          label={t("rounding")}
          value={
            quote.roundDays
              ? quote.roundDirection === "up"
                ? t("roundUp")
                : t("roundDown")
              : t("noRounding")
          }
        />
      </dl>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-body2 font-bold text-content">{t("identity")}</h2>
        <SaveState
          saving={autosave.saving}
          pending={autosave.pending}
          saved={autosave.saved}
          editable={editable}
          incomplete={invalid.size > 0}
          incompleteLabel={t("windowIncomplete")}
        />
      </div>

      {autosave.error ? (
        <Callout tone="danger" live>
          {autosave.error}
        </Callout>
      ) : null}

      <Field label={t("name")} hint={t("nameHint")}>
        {(ids) => (
          <Input
            {...ids}
            type="text"
            maxLength={250}
            value={form.name}
            placeholder={quote.folio}
            onChange={(event) => set({ name: event.target.value })}
            onBlur={commit}
          />
        )}
      </Field>

      <Field label={t("description")} hint={t("descriptionHint")}>
        {(ids) => (
          <Textarea
            {...ids}
            rows={2}
            maxLength={4000}
            value={form.description}
            onChange={(event) => set({ description: event.target.value })}
            onBlur={commit}
          />
        )}
      </Field>

      {hasWindow ? (
        <>
          <div className="grid gap-4 tablet:grid-cols-2">
            <Field
              label={t("startsOn")}
              error={bad("startsOn") ? t("windowIncomplete") : undefined}
            >
              {(ids) => (
                <Input
                  {...ids}
                  type="date"
                  value={form.startsOn}
                  onChange={(event) => set({ startsOn: event.target.value })}
                  onBlur={commit}
                />
              )}
            </Field>

            <Field
              label={t("endsOn")}
              error={
                bad("endsOn")
                  ? form.endsOn !== "" && form.startsOn !== ""
                    ? t("endsBefore")
                    : t("windowIncomplete")
                  : undefined
              }
            >
              {(ids) => (
                <Input
                  {...ids}
                  type="date"
                  value={form.endsOn}
                  onChange={(event) => set({ endsOn: event.target.value })}
                  onBlur={commit}
                />
              )}
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body3 text-content-muted">
            <CalendarRange className="size-4 text-content-faint" aria-hidden="true" />
            {days === null ? t("noWindow") : t("days", { count: days })}
            {extension}
          </div>

          <div className="grid gap-4 tablet:grid-cols-2">
            <Field label={t("roundDaysLabel")} hint={t("roundDaysHint")}>
              {(ids) => (
                <Switch
                  {...ids}
                  checked={form.roundDays}
                  onCheckedChange={(checked) => {
                    set({ roundDays: checked })
                    queueMicrotask(commit)
                  }}
                />
              )}
            </Field>

            {form.roundDays ? (
              <Field label={t("rounding")}>
                {(ids) => (
                  <Select
                    {...ids}
                    value={form.roundDirection}
                    onChange={(event) => {
                      set({ roundDirection: event.target.value as Form["roundDirection"] })
                      queueMicrotask(commit)
                    }}
                  >
                    <option value="up">{t("roundUp")}</option>
                    <option value="down">{t("roundDown")}</option>
                  </Select>
                )}
              </Field>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-body3 font-semibold text-content-faint">{label}</dt>
      <dd className="text-body2 text-content-muted">{value}</dd>
    </div>
  )
}

// ─── Del servidor al formulario, y de vuelta ─────────────────────────────────

function formOf(quote: QuoteRow): Form {
  return {
    name: quote.name,
    description: quote.description,
    startsOn: dateInput(quote.startsOn),
    endsOn: dateInput(quote.endsOn),
    roundDays: quote.roundDays,
    roundDirection: quote.roundDirection,
  }
}

/**
 * El instante guardado, como día del calendario **local**.
 *
 * Un control de fecha habla en días, no en instantes, y el documento se firma con el día que lee
 * quien lo firma. Cortar la cadena ISO por la `T` daría el día en tiempo universal, que en México
 * es el siguiente durante las últimas seis horas de cada día.
 */
function dateInput(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** El día del calendario como instante, al principio del día local. La vuelta de `dateInput`. */
function dayStart(value: string): Date | null {
  const day = value.trim()
  if (!DATE.test(day)) return null
  const date = new Date(`${day}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * El formulario convertido en identidad, y los campos que todavía no se pueden mandar.
 *
 * Lo que bloquea el guardado del bloque entero es la ventana a medias: mandar una sola fecha
 * borraría la otra. El nombre y la descripción no bloquean nada — vaciarlos es una instrucción.
 */
function derive(form: Form, hasWindow: boolean): { value: Identity; invalid: ReadonlySet<string> } {
  const invalid = new Set<string>()

  const base: Identity = { name: form.name.trim(), description: form.description }
  if (!hasWindow) return { value: base, invalid }

  const starts = form.startsOn.trim()
  const ends = form.endsOn.trim()

  for (const [field, value] of [
    ["startsOn", starts],
    ["endsOn", ends],
  ] as const) {
    if (value !== "" && !DATE.test(value)) invalid.add(field)
  }

  // Una sola escrita: se espera a la otra. Las dos vacías sí viajan — es «quítalas».
  if (starts === "" && ends !== "") invalid.add("startsOn")
  if (ends === "" && starts !== "") invalid.add("endsOn")
  if (starts !== "" && ends !== "" && ends <= starts) invalid.add("endsOn")

  return {
    value: {
      ...base,
      startsOn: dayStart(starts)?.toISOString() ?? null,
      endsOn: dayStart(ends)?.toISOString() ?? null,
      roundDays: form.roundDays,
      roundDirection: form.roundDirection,
    },
    invalid,
  }
}
