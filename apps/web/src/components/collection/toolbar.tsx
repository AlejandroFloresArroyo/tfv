"use client"

import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Field,
  FilterChip,
  Input,
  SearchField,
  Select,
} from "@tfv/ui"
import { LayoutGrid, List, SlidersHorizontal } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import {
  activeFilters,
  clearFilters,
  type FilterSpec,
  hasActiveFilters,
  readSearch,
  readView,
  SEARCH_KEY,
  VIEW_KEY,
  withParam,
} from "./params.ts"
import { useCollection } from "./use-collection.ts"

/** Lo que se espera a que la persona deje de escribir. */
const TYPING_PAUSE_MS = 300

export interface ToolbarProps {
  /** Texto del campo de búsqueda. Ausente: el recurso no admite búsqueda y no se ofrece. */
  searchPlaceholder?: string
  filters?: readonly FilterSpec[]
  /** Ofrecer rejilla además de lista. Hay colecciones a las que la rejilla no les aporta nada. */
  views?: boolean
}

/**
 * Búsqueda, filtros e indicadores de lo aplicado.
 *
 * Es un componente de cliente sobre una pantalla de servidor: lo único que hace es cambiar la
 * dirección, y de volver a resolver los datos se encarga el servidor. Por eso no hay aquí ni
 * consulta, ni caché, ni invalidación.
 */
export function CollectionToolbar({ searchPlaceholder, filters = [], views = true }: ToolbarProps) {
  const t = useTranslations()
  const format = useFormatter()
  const { params, apply, pending } = useCollection()

  const applied = readSearch(params)
  const view = readView(params)

  /**
   * Lo escrito, que va por delante de la dirección.
   *
   * Sin este estado local el campo escribiría a la velocidad de la red: cada tecla esperaría a que
   * la página se resolviera en el servidor para verse. Con él, se ve al instante y la consulta va
   * detrás.
   */
  const [typed, setTyped] = useState(applied)

  // Cuando la dirección cambia por otra vía —retroceder, limpiar todo, un enlace— el campo tiene
  // que seguirla. Es la mitad que se olvida al escribir un campo con retardo, y se nota al pulsar
  // atrás: el listado vuelve y el término se queda escrito.
  useEffect(() => {
    setTyped(applied)
  }, [applied])

  useEffect(() => {
    if (typed === applied) return

    const timer = setTimeout(() => {
      apply(withParam(params, SEARCH_KEY, typed))
    }, TYPING_PAUSE_MS)

    return () => clearTimeout(timer)
  }, [typed, applied, params, apply])

  const active = activeFilters(params, filters, (value) =>
    format.dateTime(new Date(value), { dateStyle: "medium" }),
  )
  const dirty = hasActiveFilters(params, filters)

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {searchPlaceholder ? (
          <SearchField
            value={typed}
            onValueChange={setTyped}
            label={t("collection.searchLabel")}
            placeholder={searchPlaceholder}
            clearLabel={t("collection.clearSearch")}
            busy={pending}
          />
        ) : null}

        {filters.length > 0 ? <FilterDialog filters={filters} /> : null}

        {views ? (
          <div className="flex items-center gap-1 rounded-sm border border-field bg-panel p-0.5">
            <ViewButton
              active={view === "list"}
              label={t("collection.viewList")}
              onClick={() => apply(withParam(params, VIEW_KEY, "list"))}
            >
              <List aria-hidden="true" className="size-4" />
            </ViewButton>
            <ViewButton
              active={view === "grid"}
              label={t("collection.viewGrid")}
              onClick={() => apply(withParam(params, VIEW_KEY, "grid"))}
            >
              <LayoutGrid aria-hidden="true" className="size-4" />
            </ViewButton>
          </div>
        ) : null}
      </div>

      {active.length > 0 || dirty ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map((filter) => (
            <FilterChip
              key={`${filter.key}:${filter.value}`}
              field={filter.field}
              value={filter.value}
              removeLabel={t("collection.removeFilter", {
                field: filter.field,
                value: filter.value,
              })}
              onRemove={() =>
                apply(
                  withParam(
                    params,
                    filter.key,
                    filter.remaining.length > 0 ? filter.remaining.join(",") : "",
                  ),
                )
              }
            />
          ))}

          <button
            type="button"
            onClick={() => apply(clearFilters(params))}
            className="rounded-xs px-1.5 py-0.5 text-body3 font-semibold text-content-muted underline underline-offset-2 hover:text-content"
          >
            {t("collection.clearAll")}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function ViewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? "grid size-8 place-items-center rounded-xs bg-accent text-on-accent"
          : "grid size-8 place-items-center rounded-xs text-content-faint hover:bg-panel-hover hover:text-content"
      }
    >
      {children}
    </button>
  )
}

// ─── Panel de filtros ────────────────────────────────────────────────────────

/**
 * Los filtros, en un diálogo.
 *
 * En un diálogo y no en un desplegable porque debajo del ancho de tableta el diálogo se convierte
 * en cajón inferior, y un panel de filtros flotando sobre un teléfono queda bajo el teclado en
 * cuanto se toca un campo de texto. El primitivo ya resuelve eso, la trampa de foco y el cierre.
 *
 * Se aplica al pulsar «aplicar» y no a cada cambio: dejar tres filtros como se quieren son tres
 * navegaciones y tres consultas si cada casilla aplica sola, y tres entradas en la historia que
 * hay que deshacer una a una.
 */
function FilterDialog({ filters }: { filters: readonly FilterSpec[] }) {
  const t = useTranslations()
  const { params, apply } = useCollection()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<URLSearchParams>(() => new URLSearchParams(params))

  // Al abrir se parte de lo que está aplicado, no de lo que quedó del borrador anterior.
  useEffect(() => {
    if (open) setDraft(new URLSearchParams(params))
  }, [open, params])

  const count = activeFilters(params, filters).length

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="md">
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          {t("collection.filters")}
          {count > 0 ? (
            <span className="grid size-5 place-items-center rounded-full bg-accent text-body3 text-on-accent">
              {count}
            </span>
          ) : null}
        </Button>
      </DialogTrigger>

      <DialogContent
        title={t("collection.filters")}
        description={t("collection.filtersHint")}
        size="sm"
        closeLabel={t("common.close")}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDraft(clearFilters(draft))}
              disabled={activeFilters(draft, filters).length === 0}
            >
              {t("collection.clearFilters")}
            </Button>
            <DialogClose asChild>
              <Button
                onClick={() => {
                  // La página se reinicia sola: `withParam` la quita en cuanto cambia algo que no
                  // es la página. Aquí se aplica el borrador entero, así que se quita a mano.
                  const next = new URLSearchParams(draft)
                  next.delete("page")
                  apply(next)
                }}
              >
                {t("collection.apply")}
              </Button>
            </DialogClose>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {filters.map((spec) => (
            <FilterControl
              key={spec.key}
              spec={spec}
              params={draft}
              onChange={(value) => setDraft(withParam(draft, spec.key, value))}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Un control por tipo de campo.
 *
 * Los tipos que hay son los que algún recurso declara hoy. Número, intervalo numérico y fecha
 * suelta no están: ningún recurso los declara todavía, y un control sin nada que filtrar se
 * escribe a ciegas y se descubre equivocado el día que tenga usuario.
 */
function FilterControl({
  spec,
  params,
  onChange,
}: {
  spec: FilterSpec
  params: URLSearchParams
  onChange: (value: string | readonly string[]) => void
}) {
  const t = useTranslations()

  switch (spec.kind) {
    case "boolean": {
      const current = params.get(spec.key) ?? ""
      return (
        <Field label={spec.label}>
          {(ids) => (
            <Select id={ids.id} value={current} onChange={(event) => onChange(event.target.value)}>
              <option value="">{t("collection.any")}</option>
              <option value="true">{spec.trueLabel}</option>
              <option value="false">{spec.falseLabel}</option>
            </Select>
          )}
        </Field>
      )
    }

    case "select": {
      const current = params.get(spec.key) ?? ""
      return (
        <Field label={spec.label}>
          {(ids) => (
            <Select id={ids.id} value={current} onChange={(event) => onChange(event.target.value)}>
              <option value="">{t("collection.any")}</option>
              {spec.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )
    }

    case "multi": {
      const chosen = new Set((params.get(spec.key) ?? "").split(",").filter(Boolean))
      return (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-body2 font-semibold text-content">{spec.label}</legend>
          {spec.options.map((option) => (
            <Checkbox
              key={option.value}
              label={option.label}
              checked={chosen.has(option.value)}
              onCheckedChange={(checked) => {
                const next = new Set(chosen)
                if (checked === true) next.add(option.value)
                else next.delete(option.value)
                onChange([...next].join(","))
              }}
            />
          ))}
        </fieldset>
      )
    }

    case "text": {
      return (
        <Field label={spec.label}>
          {(ids) => (
            <Input
              id={ids.id}
              value={params.get(spec.key) ?? ""}
              placeholder={spec.placeholder ?? ""}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </Field>
      )
    }

    case "dateRange": {
      // Un intervalo son **dos valores repetidos**: es lo que la gramática del servidor reconoce.
      // Con uno solo no hay intervalo, así que se manda vacío hasta que estén los dos.
      const [from = "", to = ""] = params.getAll(spec.key)
      const emit = (nextFrom: string, nextTo: string) =>
        onChange(nextFrom && nextTo ? [nextFrom, nextTo] : "")

      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body2 font-semibold text-content">{spec.label}</legend>
          <div className="grid grid-cols-2 gap-2">
            <Field label={spec.fromLabel}>
              {(ids) => (
                <Input
                  id={ids.id}
                  type="date"
                  value={from}
                  onChange={(event) => emit(event.target.value, to)}
                />
              )}
            </Field>
            <Field label={spec.toLabel}>
              {(ids) => (
                <Input
                  id={ids.id}
                  type="date"
                  value={to}
                  onChange={(event) => emit(from, event.target.value)}
                />
              )}
            </Field>
          </div>
        </fieldset>
      )
    }
  }
}
