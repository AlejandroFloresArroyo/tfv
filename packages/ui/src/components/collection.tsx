"use client"

import { Search, X } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../lib/cn.ts"
import { Button } from "./button.tsx"
import { Spinner } from "./spinner.tsx"
import { Panel, Skeleton } from "./surfaces.tsx"

/**
 * Primitivos de exploración de colecciones.
 *
 * Ver `openspec/specs/collection-browsing/spec.md`. Rebanada 28d.
 *
 * Aquí **no hay estado ni direcciones**: son piezas que reciben valores y avisan de los cambios.
 * Quien las ata a la barra de direcciones es la aplicación, porque la regla que gobierna la
 * exploración —el estado vive en la URL— es una decisión de enrutado y este paquete no enruta.
 *
 * Esa separación es lo que permite probar el comportamiento visual sin un navegador con historia, y
 * lo que evita que el sistema de diseño acabe dependiendo del enrutador de un framework concreto.
 */

// ─── Búsqueda ────────────────────────────────────────────────────────────────

export interface SearchFieldProps {
  value: string
  onValueChange: (value: string) => void
  /** Etiqueta accesible. Obligatoria: el icono de lupa no es un nombre. */
  label: string
  placeholder?: string
  clearLabel: string
  /** Se pinta mientras la consulta que provocó este texto sigue en curso. */
  busy?: boolean
  className?: string
}

export function SearchField({
  value,
  onValueChange,
  label,
  placeholder,
  clearLabel,
  busy = false,
  className,
}: SearchFieldProps) {
  return (
    <div className={cn("relative flex-1 min-w-0", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-content-faint"
      />

      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          "h-10 w-full rounded-sm border border-field bg-field pr-10 pl-9 text-body2 text-content",
          "placeholder:text-content-faint",
          "focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus/40",
          // El navegador pinta su propia cruz sobre `type=search` y no se puede etiquetar ni
          // alcanzar con el teclado de forma consistente. La nuestra sí.
          "[&::-webkit-search-cancel-button]:appearance-none",
        )}
      />

      <div className="absolute top-1/2 right-2 -translate-y-1/2">
        {busy ? (
          <Spinner className="size-4 text-content-faint" />
        ) : value ? (
          <button
            type="button"
            aria-label={clearLabel}
            onClick={() => onValueChange("")}
            className="grid size-6 place-items-center rounded-xs text-content-faint hover:bg-panel-hover hover:text-content"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ─── Filtros aplicados ───────────────────────────────────────────────────────

export interface FilterChipProps {
  /** Qué campo. Se lee antes que el valor: «Rol: Almacén». */
  field: string
  value: string
  onRemove: () => void
  /**
   * Nombre accesible del botón de retirada.
   *
   * Se pasa hecho en lugar de componerlo aquí: la frase «Quitar el filtro Rol: Almacén» tiene un
   * orden distinto en cada idioma, y armarla con concatenación produce frases que no son de ninguno.
   */
  removeLabel: string
}

export function FilterChip({ field, value, onRemove, removeLabel }: FilterChipProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-xs border border-line bg-panel py-0.5 pr-0.5 pl-2 text-body3">
      {/* Un solo nodo de texto, con su espacio de verdad. Repartido en dos cajas de disposición, el
          espacio lo pone el CSS y el texto leído queda «Estado:Inactiva» — que es lo que oye un
          lector de pantalla y lo que encuentra una búsqueda en la página. */}
      <span>
        <span className="text-content-faint">{field}:</span>{" "}
        <span className="font-semibold text-content">{value}</span>
      </span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="grid size-5 place-items-center rounded-xs text-content-faint hover:bg-panel-hover hover:text-content"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </span>
  )
}

// ─── Paginación ──────────────────────────────────────────────────────────────

export interface PaginationProps {
  page: number
  totalPages: number
  totalItems: number
  onPageChange: (page: number) => void
  limit: number
  limitOptions: readonly number[]
  onLimitChange: (limit: number) => void
  labels: {
    /** «Página 3 de 12 · 287 elementos», ya compuesto por quien traduce. */
    summary: string
    navigation: string
    first: string
    previous: string
    next: string
    last: string
    perPage: string
    page: (page: number) => string
  }
}

/**
 * Ventana de páginas alrededor de la actual.
 *
 * Siempre devuelve cinco entradas cuando las hay, de modo que la barra no cambie de ancho al
 * navegar: una fila de botones que se ensancha y se estrecha mientras se pulsa mueve el botón de
 * «siguiente» debajo del cursor.
 */
function windowAround(page: number, totalPages: number, size = 5): number[] {
  if (totalPages <= size) return Array.from({ length: totalPages }, (_, index) => index + 1)

  const half = Math.floor(size / 2)
  const start = Math.min(Math.max(page - half, 1), totalPages - size + 1)
  return Array.from({ length: size }, (_, index) => start + index)
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
  limit,
  limitOptions,
  onLimitChange,
  labels,
}: PaginationProps) {
  const pages = windowAround(page, totalPages)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-body3 text-content-faint" aria-live="polite">
        {labels.summary}
      </p>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-body3 text-content-faint">
          {labels.perPage}
          <select
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className="h-8 rounded-xs border border-field bg-field px-1.5 text-body3 text-content focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus/40"
          >
            {limitOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <nav aria-label={labels.navigation} className="flex items-center gap-1">
          <PageButton
            label={labels.first}
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            /* Los saltos a los extremos sobran en un teléfono: con «anterior» y «siguiente» se
               llega igual, y el ancho se necesita para los números. */
            className="hidden tablet:inline-flex"
          >
            «
          </PageButton>
          <PageButton
            label={labels.previous}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            ‹
          </PageButton>

          {pages.map((entry, index) => (
            <PageButton
              key={entry}
              label={labels.page(entry)}
              current={entry === page}
              onClick={() => onPageChange(entry)}
              /* La ventana se estrecha con la pantalla: cinco en tableta, tres en teléfono. Se
                 hace con clases y no midiendo, para que el servidor pinte ya lo correcto. */
              className={
                index === 0 || index === pages.length - 1 ? "hidden tablet:inline-flex" : ""
              }
            >
              {entry}
            </PageButton>
          ))}

          <PageButton
            label={labels.next}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            ›
          </PageButton>
          <PageButton
            label={labels.last}
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            className="hidden tablet:inline-flex"
          >
            »
          </PageButton>
        </nav>
      </div>

      <span className="sr-only">{totalItems}</span>
    </div>
  )
}

function PageButton({
  label,
  current = false,
  disabled = false,
  onClick,
  className,
  children,
}: {
  label: string
  current?: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-xs px-2 text-body3 font-semibold",
        "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40",
        current
          ? "bg-accent text-on-accent"
          : "border border-field bg-panel text-content-muted hover:bg-panel-hover hover:text-content",
        className,
      )}
    >
      {children}
    </button>
  )
}

// ─── Estados ─────────────────────────────────────────────────────────────────

/**
 * Los cuatro estados de una colección.
 *
 * La distinción que importa es la última: **vacía no es lo mismo que sin resultados**. Una
 * colección vacía invita a crear el primer elemento; una sin resultados ofrece limpiar los filtros.
 * Ofrecer «crear» a quien acaba de escribir un término que no encuentra nada le hace crear un
 * duplicado de algo que sí existe.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <Panel className="grid place-items-center gap-2 p-10 text-center">
      <p className="text-title2 font-bold text-content">{title}</p>
      {body ? <p className="max-w-prose text-body2 text-content-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </Panel>
  )
}

export function ErrorState({
  title,
  body,
  retryLabel,
  onRetry,
}: {
  title: string
  body: string
  retryLabel: string
  onRetry: () => void
}) {
  return (
    <Panel className="grid place-items-center gap-2 p-10 text-center">
      <p className="text-title2 font-bold text-content">{title}</p>
      <p className="max-w-prose text-body2 text-content-muted">{body}</p>
      <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
        {retryLabel}
      </Button>
    </Panel>
  )
}

/**
 * Espera que **conserva la disposición**.
 *
 * Pinta tantos huecos como elementos habrá, con la misma altura. Un indicador centrado en su lugar
 * encoge la página y la vuelve a estirar al llegar los datos, y el salto mueve bajo el cursor lo
 * que la persona estaba a punto de pulsar.
 */
export function CollectionSkeleton({
  rows = 6,
  label,
  view = "list",
}: {
  rows?: number
  label: string
  view?: CollectionView
}) {
  const holes = Array.from({ length: rows }, (_, index) => `hueco-${index}`)

  return (
    <div role="status" aria-label={label} className={view === "grid" ? GRID_CLASS : "space-y-2"}>
      {holes.map((hole) => (
        <Skeleton key={hole} className={view === "grid" ? "h-32" : "h-16"} />
      ))}
    </div>
  )
}

// ─── Disposiciones ───────────────────────────────────────────────────────────

export type CollectionView = "grid" | "list"

const GRID_CLASS = "grid gap-3 grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-3"

/**
 * El mismo conjunto, con la misma acción por elemento, en dos disposiciones.
 *
 * Cambiar de vista no toca los datos ni el orden: es la misma lista, colocada de otra manera. Por
 * eso la disposición es una clase y no un componente distinto por vista, que es como acaban
 * divergiendo.
 *
 * Es una **lista de verdad** (`ul`/`li`), no cajas apiladas. Un lector de pantalla anuncia cuántos
 * elementos hay y por cuál va, que es exactamente la información que se pierde con un montón de
 * `div`s: en una rejilla de veinticuatro tarjetas, saber que son veinticuatro es la mitad de poder
 * recorrerlas.
 */
export function CollectionLayout({
  view,
  label,
  className,
  children,
}: {
  view: CollectionView
  /**
   * Nombre de la lista.
   *
   * Obligatorio: la cáscara de la aplicación también tiene listas —la navegación, los menús—, y
   * sin nombre las tres son «lista» y no hay forma de decir en cuál se está.
   */
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <ul
      aria-label={label}
      className={cn(view === "grid" ? GRID_CLASS : "flex flex-col gap-2", className)}
    >
      {children}
    </ul>
  )
}

/**
 * Tarjeta de elemento.
 *
 * Sirve a las dos disposiciones: en rejilla se apila, en lista se pone en fila. Es la misma tarjeta
 * porque las acciones y los datos son los mismos; lo único que cambia es dónde caen.
 *
 * El nombre va en un encabezado, no en un párrafo con letra gorda. Es lo que permite saltar de
 * elemento en elemento con el teclado de un lector de pantalla en lugar de recorrer la rejilla
 * entera; y es la diferencia entre «parece un título» y «es un título».
 */
export function ItemCard({
  view,
  media,
  title,
  subtitle,
  meta,
  actions,
}: {
  view: CollectionView
  media?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Insignias, fechas, recuentos. Lo que describe al elemento sin ser su nombre. */
  meta?: ReactNode
  /** Agrupadas en un único punto de acceso, no repartidas por la tarjeta. */
  actions?: ReactNode
}) {
  return (
    <li className="min-w-0">
      <Panel
        className={cn(
          "flex h-full min-w-0 gap-3 p-3 transition-colors hover:bg-panel-hover",
          view === "grid" ? "flex-col" : "flex-row items-center",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {media}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-body1 font-semibold text-content">{title}</h2>
            {subtitle ? <p className="truncate text-body3 text-content-faint">{subtitle}</p> : null}
          </div>
        </div>

        <div
          className={cn(
            "flex items-center gap-2",
            view === "grid" ? "justify-between" : "shrink-0 justify-end",
          )}
        >
          {meta ? <div className="flex flex-wrap items-center gap-1.5">{meta}</div> : null}
          {actions}
        </div>
      </Panel>
    </li>
  )
}
