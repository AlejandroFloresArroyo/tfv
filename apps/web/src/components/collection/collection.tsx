import { CollectionLayout, type CollectionView, EmptyState } from "@tfv/ui"
import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { ApiFailure } from "~/components/api-failure.tsx"
import type { ApiResult } from "~/lib/api.server.ts"
import { ClearFilters, Retry } from "./actions.tsx"
import { Pager } from "./pager.tsx"
import { type FilterSpec, hasActiveFilters, readView } from "./params.ts"
import { CollectionToolbar } from "./toolbar.tsx"

/** El sobre que devuelve toda colección de la API. Uno para todas, por contrato. */
export interface PageEnvelope<T> {
  items: T[]
  page: number
  limit: number
  totalItems: number
  totalPages: number
  hasPrevious: boolean
  hasNext: boolean
  previousPage: number | null
  nextPage: number | null
}

export interface CollectionProps<T> {
  /** Los parámetros de la pantalla, ya convertidos. */
  params: URLSearchParams
  result: ApiResult<PageEnvelope<T>>
  filters?: readonly FilterSpec[]
  /** Ausente: el recurso no admite búsqueda y no se ofrece el campo. */
  searchPlaceholder?: string
  views?: boolean
  /** Qué se dice cuando la colección está genuinamente vacía. */
  emptyTitle: string
  emptyBody?: string
  /** Con qué se invita a crear el primero. Se omite a quien no puede crear. */
  emptyAction?: ReactNode
  children: (items: readonly T[], view: CollectionView) => ReactNode
}

/**
 * Una colección explorable.
 *
 * Ver `openspec/specs/collection-browsing/spec.md`. Reúne barra, contenido, estados y paginación,
 * que son la misma pantalla repetida decenas de veces sobre entidades distintas. Repartir esa
 * composición por cada pantalla es lo que hace que dos listados se comporten distinto sin que nadie
 * lo haya decidido.
 *
 * ## La distinción que importa
 *
 * **Vacía no es lo mismo que sin resultados.** Una colección vacía invita a crear el primer
 * elemento; una sin resultados ofrece limpiar los filtros. Ofrecer «crear» a quien acaba de buscar
 * algo que sí existe pero no encuentra le hace crear un duplicado.
 *
 * ## Por qué no hay estado de carga aquí
 *
 * Porque el listado lo resuelve el servidor: cuando este componente se pinta, los datos están. La
 * espera que sí existe es la de **volver a resolver** tras cambiar un filtro, y esa la lleva la
 * barra —el campo de búsqueda se pone en curso y el contenido se atenúa— sin cambiar la disposición
 * ni perder la posición de desplazamiento.
 */
export async function Collection<T>({
  params,
  result,
  filters = [],
  searchPlaceholder,
  views = true,
  emptyTitle,
  emptyBody,
  emptyAction,
  children,
}: CollectionProps<T>) {
  const t = await getTranslations()
  const view = readView(params)
  const filtered = hasActiveFilters(params, filters)

  const toolbar = (
    <CollectionToolbar
      {...(searchPlaceholder === undefined ? {} : { searchPlaceholder })}
      filters={filters}
      views={views}
    />
  )

  if (!result.ok) {
    return (
      <>
        {toolbar}
        {result.status === 403 ? (
          <ApiFailure result={result} />
        ) : (
          <Retry title={t("collection.errorTitle")} body={t("collection.errorBody")} />
        )}
      </>
    )
  }

  const page = result.data

  if (page.items.length === 0) {
    return (
      <>
        {toolbar}
        {filtered ? (
          <EmptyState
            title={t("collection.noResultsTitle")}
            body={t("collection.noResultsBody")}
            // Etiqueta distinta de la del enlace de la barra a propósito: dos botones con el mismo
            // nombre en la misma pantalla no se pueden nombrar por voz ni distinguir al recorrerla.
            action={<ClearFilters label={t("collection.clearAndShowAll")} />}
          />
        ) : (
          <EmptyState
            title={emptyTitle}
            {...(emptyBody === undefined ? {} : { body: emptyBody })}
            {...(emptyAction === undefined ? {} : { action: emptyAction })}
          />
        )}
      </>
    )
  }

  return (
    <>
      {toolbar}
      <CollectionLayout view={view} label={t("collection.results")}>
        {children(page.items, view)}
      </CollectionLayout>
      <Pager page={page.page} totalPages={page.totalPages} totalItems={page.totalItems} />
    </>
  )
}
