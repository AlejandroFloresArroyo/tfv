/**
 * El estado de exploración, que vive en la dirección.
 *
 * Ver `openspec/specs/collection-browsing/spec.md`: «el estado de exploración vive en la dirección».
 * Búsqueda, filtros, página y tamaño de página son parámetros de la URL y no estado interno de un
 * componente. De ahí salen tres propiedades que la persona da por hechas y que con estado interno
 * no se cumplen: un listado filtrado se comparte por enlace, el gesto de retroceder deshace el
 * último filtro, y recargar no pierde nada.
 *
 * **Este módulo es puro.** No conoce React ni el enrutador: transforma parámetros en parámetros.
 * Es donde vive toda la lógica de la exploración, y por eso es lo único que se puede probar sin un
 * navegador.
 */

/** Prefijo de las claves que son cosa de la interfaz. La API las descarta sin error. */
const INTERNAL = "_"

/** Clave interna de la disposición elegida. Con guion bajo: no es un filtro. */
export const VIEW_KEY = "_view"

export const PAGE_KEY = "page"
export const LIMIT_KEY = "limit"
export const SEARCH_KEY = "search"

export const LIMIT_OPTIONS = [12, 24, 48, 96] as const
export const DEFAULT_LIMIT = 24

/**
 * Qué controles ofrece el panel de filtros, y de qué tipo es cada uno.
 *
 * Se declaran por pantalla y **deben coincidir con lo que el recurso declara filtrable** en el
 * servidor: un filtro que la interfaz ofrezca y el recurso no admita responde `400`. Que sean dos
 * declaraciones y no una es deliberado — la del servidor es la autoridad y la de aquí añade lo que
 * el servidor no tiene: cómo se llama en cada idioma y qué opciones se ofrecen.
 */
export type FilterSpec =
  | { kind: "boolean"; key: string; label: string; trueLabel: string; falseLabel: string }
  | { kind: "select"; key: string; label: string; options: readonly FilterOption[] }
  | { kind: "multi"; key: string; label: string; options: readonly FilterOption[] }
  | { kind: "text"; key: string; label: string; placeholder?: string }
  | { kind: "dateRange"; key: string; label: string; fromLabel: string; toLabel: string }

export interface FilterOption {
  readonly value: string
  readonly label: string
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/** Los parámetros de una página de Next, como `URLSearchParams`. */
export function toSearchParams(
  input: Readonly<Record<string, string | string[] | undefined>>,
): URLSearchParams {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const entry of value) params.append(key, entry)
    else params.append(key, value)
  }

  return params
}

export function readSearch(params: URLSearchParams): string {
  return params.get(SEARCH_KEY) ?? ""
}

export function readLimit(params: URLSearchParams): number {
  const raw = Number(params.get(LIMIT_KEY))
  return LIMIT_OPTIONS.includes(raw as (typeof LIMIT_OPTIONS)[number]) ? raw : DEFAULT_LIMIT
}

export function readView(
  params: URLSearchParams,
  fallback: "grid" | "list" = "list",
): "grid" | "list" {
  const value = params.get(VIEW_KEY)
  return value === "grid" || value === "list" ? value : fallback
}

/**
 * La consulta que se le pasa a la API.
 *
 * Se reenvía **todo** menos las claves internas. Reenviar por lista de permitidas obligaría a
 * acordarse de ampliarla con cada filtro nuevo, y olvidarse no falla: el filtro se ofrece, se marca,
 * y no filtra. La regla de descarte es una sola y no se puede olvidar.
 */
export function toApiQuery(params: URLSearchParams): string {
  const forwarded = new URLSearchParams()

  for (const [key, value] of params.entries()) {
    if (key.startsWith(INTERNAL)) continue
    forwarded.append(key, value)
  }

  return forwarded.toString()
}

// ─── Escritura ───────────────────────────────────────────────────────────────

/**
 * Cambia un parámetro y devuelve unos nuevos.
 *
 * **Vuelve a la primera página** en cuanto cambia cualquier cosa que no sea la página misma. Sin
 * esto, buscar desde la página cuatro deja a la persona mirando una lista vacía con resultados que
 * sí existen — el fallo más común de esta pantalla, y el más difícil de atribuir a su causa.
 */
export function withParam(
  params: URLSearchParams,
  key: string,
  value: string | readonly string[] | null,
): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete(key)

  if (Array.isArray(value)) {
    for (const entry of value) if (entry !== "") next.append(key, entry)
  } else if (typeof value === "string" && value !== "") {
    next.set(key, value)
  }

  if (key !== PAGE_KEY) next.delete(PAGE_KEY)
  return next
}

/**
 * Limpia búsqueda y filtros, conservando lo que no filtra.
 *
 * El tamaño de página y la disposición son cómo se mira la colección, no qué parte se mira:
 * borrarlos al limpiar los filtros devolvería a la persona a una vista que no eligió.
 */
export function clearFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams()

  const limit = params.get(LIMIT_KEY)
  const view = params.get(VIEW_KEY)
  if (limit) next.set(LIMIT_KEY, limit)
  if (view) next.set(VIEW_KEY, view)

  return next
}

// ─── Filtros aplicados ───────────────────────────────────────────────────────

export interface ActiveFilter {
  /** Clave del parámetro. */
  readonly key: string
  /** Nombre del campo, para leerlo antes que el valor. */
  readonly field: string
  /** Valor ya legible: la etiqueta de la opción, no su identificador. */
  readonly value: string
  /**
   * Qué queda al quitarlo.
   *
   * De una selección múltiple se quita **un** valor y los demás siguen. Por eso cada indicador
   * lleva su propio resultado en lugar de un «borra esta clave», que se llevaría los tres por
   * delante.
   */
  readonly remaining: readonly string[]
}

/**
 * Los filtros aplicados, en el orden en que están declarados.
 *
 * Se derivan de los parámetros y no de un estado paralelo: si estuvieran duplicados, una llegada
 * por enlace pintaría la lista filtrada y los indicadores vacíos.
 */
export function activeFilters(
  params: URLSearchParams,
  specs: readonly FilterSpec[],
  formatDate: (value: string) => string = (value) => value,
): ActiveFilter[] {
  const active: ActiveFilter[] = []

  for (const spec of specs) {
    const values = params.getAll(spec.key).filter((value) => value !== "")
    if (values.length === 0) continue

    switch (spec.kind) {
      case "boolean": {
        const value = values[0] as string
        active.push({
          key: spec.key,
          field: spec.label,
          value: value === "true" ? spec.trueLabel : spec.falseLabel,
          remaining: [],
        })
        break
      }

      case "select":
      case "multi": {
        // Una selección múltiple viaja como lista separada por comas: es lo que la gramática del
        // servidor entiende como conjunto.
        const chosen = spec.kind === "multi" ? (values[0] as string).split(",") : values.slice(0, 1)
        for (const value of chosen) {
          const option = spec.options.find((entry) => entry.value === value)
          active.push({
            key: spec.key,
            field: spec.label,
            value: option?.label ?? value,
            remaining: chosen.filter((entry) => entry !== value),
          })
        }
        break
      }

      case "text": {
        active.push({
          key: spec.key,
          field: spec.label,
          value: values[0] as string,
          remaining: [],
        })
        break
      }

      case "dateRange": {
        // Un intervalo son dos valores repetidos y **un solo** indicador: quitar la mitad de un
        // intervalo dejaría un filtro que el servidor ya no reconoce como tal.
        const [from, to] = values
        active.push({
          key: spec.key,
          field: spec.label,
          value: from && to ? `${formatDate(from)} – ${formatDate(to)}` : formatDate(from ?? ""),
          remaining: [],
        })
        break
      }
    }
  }

  return active
}

/** Si hay algo que limpiar: cualquier filtro declarado, o la búsqueda. */
export function hasActiveFilters(params: URLSearchParams, specs: readonly FilterSpec[]): boolean {
  if (readSearch(params) !== "") return true
  return specs.some((spec) => params.getAll(spec.key).some((value) => value !== ""))
}
