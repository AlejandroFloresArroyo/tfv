"use client"

import { Search, X } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../lib/cn.ts"
import { Button } from "./button.tsx"
import { Spinner } from "./spinner.tsx"
import { Panel, Skeleton, type Tint } from "./surfaces.tsx"

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
          "h-[var(--control-h)] w-full rounded-lg border border-edge-control bg-panel pr-10 pl-9 text-body2 text-content",
          "placeholder:text-content-faint",
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
            className="grid size-6 place-items-center rounded-md text-content-faint hover:bg-panel-hover hover:text-content"
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
    <span className="inline-flex items-center gap-1 rounded-md border border-edge bg-panel-raised py-0.5 pr-0.5 pl-2 text-body3">
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
        className="grid size-5 place-items-center rounded-md text-content-faint hover:bg-panel-hover hover:text-content"
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
            className="h-[var(--control-h-sm)] rounded-md border border-edge-control bg-panel px-1.5 text-body3 text-content"
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
        "inline-flex h-[var(--control-h-sm)] min-w-[var(--control-h-sm)] items-center justify-center rounded-md px-2 text-body3 font-semibold",
        "transition-colors duration-200 ease-[--ease-out-soft] disabled:pointer-events-none disabled:opacity-40",
        current
          ? "bg-accent text-on-accent"
          : "border border-edge-control bg-panel text-content-muted hover:bg-panel-hover hover:text-content",
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
    <Panel tint="alto" className="grid place-items-center gap-2 p-10 text-center">
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

/**
 * Las dos retículas, y por qué son dos.
 *
 * La densidad de una rejilla no la decide el gusto: la decide qué manda dentro de la celda.
 *
 * En `text`, la celda es un nombre con algo de metadato — un papel, una factura, una contraparte —,
 * y el ancho es lo que la hace legible: pocas columnas y anchas, porque un nombre partido en tres
 * renglones cuesta más que una fila de más.
 *
 * En `cover`, la celda es **una fotografía de algo que existe**, y ahí el ancho de más no compra
 * nada: compra hueco. Con la retícula de texto, veinticuatro productos con portada medían 9.886 px
 * de alto en la tablet —dos y media veces la página anterior— para enseñar lo mismo. Una columna
 * más recorta esa altura casi un tercio y la portada sigue midiendo más de 150 px, que es de sobra
 * para reconocer un objeto.
 */
const GRID_CLASS = "grid gap-3 grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-3"
const GRID_COVER_CLASS = "grid gap-3 grid-cols-2 tablet:grid-cols-3 laptop:grid-cols-4"

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
  grid = "text",
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
  /** Qué manda dentro de la celda, que es lo que decide cuántas columnas caben. */
  grid?: "text" | "cover"
  className?: string
  children: ReactNode
}) {
  return (
    <ul
      aria-label={label}
      className={cn(
        view === "grid"
          ? grid === "cover"
            ? GRID_COVER_CLASS
            : GRID_CLASS
          : "flex flex-col gap-2",
        className,
      )}
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
 *
 * ## `media` y `cover` no son lo mismo
 *
 * `media` es una **marca**: un ícono de tipo, unas iniciales, un glifo. Identifica la *clase* del
 * elemento y con 36 px le sobra, porque no hay más que mirar.
 *
 * `cover` es una **fotografía de algo que existe**: el objeto que alguien va a ir a buscar a un
 * estante. Ahí el tamaño no es estética, es si se reconoce o no. Durante un tiempo las dos cosas
 * compartieron ranura, y el resultado medido fue que la foto del producto ocupaba el 3.2% de su
 * tarjeta en rejilla y el 2.4% en lista — la misma ficha de 36 px que lleva un ícono. Una rejilla
 * cuyas celdas no son más grandes que sus filas no es una rejilla: es la lista apilada.
 *
 * Por eso `cover` trae su propia caja y cambia de forma con la disposición: a sangre y en 4:3 en
 * rejilla, en ficha de 48 px en lista. **Quien la llena decide qué va dentro**, y ya tiene la
 * disposición a mano —la recibe en la función de pintado de `Collection`—, así que puede poner una
 * cosa en rejilla y otra en lista sin que esta tarjeta tenga que adivinarlo.
 *
 * ## La tarjeta entera lleva a donde lleva el título
 *
 * `card-live` pone el cursor de mano y enciende el degradado sobre la superficie completa. Si sólo
 * el renglón del título es enlace, la tarjeta promete un blanco de 387×104 y entrega uno de 18 px
 * —y en tacto, que es el dispositivo de referencia, no hay encendido que avise del engaño—. El
 * `::after` extendido del enlace hace verdadera la promesa sin envolver la tarjeta en un ancla, que
 * es lo que metería el nombre completo, las insignias y las acciones dentro del nombre accesible
 * del enlace.
 */
export function ItemCard({
  view,
  cover,
  media,
  title,
  subtitle,
  meta,
  actions,
  tint = "neutral",
}: {
  view: CollectionView
  /**
   * La fotografía del elemento, o lo que se enseña cuando no la hay. Llena la caja que recibe.
   *
   * Sustituye a `media` en rejilla: dos marcas de identificación en la misma tarjeta compiten.
   */
  cover?: ReactNode
  media?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Insignias, fechas, recuentos. Lo que describe al elemento sin ser su nombre. */
  meta?: ReactNode
  /** Agrupadas en un único punto de acceso, no repartidas por la tarjeta. */
  actions?: ReactNode
  /**
   * La temperatura de la tarjeta.
   *
   * Por omisión neutra: un elemento de una colección no está en ningún estado por el hecho de
   * existir. Se pasa una temperatura sólo cuando el elemento **está** en ese estado, que es lo que
   * hace que teñir signifique algo cuando ocurre.
   */
  tint?: Tint
}) {
  const conPortada = cover !== undefined

  return (
    <li className="min-w-0">
      <Panel
        tint={tint}
        live
        className={cn(
          "flex h-full min-w-0 gap-3 p-3",
          view === "grid" ? "flex-col" : "flex-row items-center",
          // El blanco real de la tarjeta. `.card` ya es `position: relative`.
          "[&_h2_a]:after:absolute [&_h2_a]:after:inset-0 [&_h2_a]:after:content-['']",
        )}
      >
        {conPortada ? (
          <div
            className={cn(
              "grid shrink-0 place-items-center overflow-hidden bg-panel-sunken text-content-faint",
              view === "grid"
                ? // A sangre. El radio descuenta el borde de 1 px para que la esquina de la foto
                  // siga la de la tarjeta en vez de asomar por fuera.
                  //
                  // 3:2 y no 4:3: se probaron las dos con datos reales. En 4:3 la banda mide 290 px
                  // en la tablet y, como hoy la mayoría de los productos no tiene fotografía, la
                  // página se convertía en una columna de cajones vacíos y el desplazamiento se
                  // triplicaba. En 3:2 la fotografía sigue leyéndose de sobra y el hueco vacío
                  // cuesta un tercio menos.
                  "-mx-3 -mt-3 aspect-[3/2] rounded-t-[calc(var(--radius-lg)-1px)]"
                : "size-12 rounded-md",
            )}
          >
            {cover}
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 items-center gap-3">
          {conPortada && view === "grid" ? null : media}
          <div className="min-w-0 flex-1">
            <h2
              className={cn(
                "text-body1 font-semibold text-content",
                // En rejilla hay ancho para dos renglones, y un nombre de equipo se distingue de
                // otro por el final —«Lente Sigma 18-35» contra «Lente Sigma 24-70»—, que es justo
                // lo que se lleva el corte.
                view === "grid" ? "line-clamp-2" : "truncate",
              )}
            >
              {title}
            </h2>
            {subtitle ? (
              <p
                className={cn(
                  "text-body3 text-content-faint",
                  // En rejilla la celda es estrecha y el subtítulo lleva el código, que es lo que
                  // se coteja contra una etiqueta: cortarlo a media cadena lo vuelve inservible.
                  view === "grid" ? "line-clamp-2" : "truncate",
                )}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "flex items-center gap-2",
            view === "grid" ? "justify-between" : "shrink-0 justify-end",
          )}
        >
          {meta ? <div className="flex flex-wrap items-center gap-1.5">{meta}</div> : null}
          {/* Por encima del `::after` del título, o el punto de acciones deja de ser pulsable. */}
          {actions ? <div className="relative z-10">{actions}</div> : null}
        </div>
      </Panel>
    </li>
  )
}
