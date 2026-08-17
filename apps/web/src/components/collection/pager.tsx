"use client"

import { Pagination } from "@tfv/ui"
import { useFormatter, useTranslations } from "next-intl"
import { LIMIT_KEY, LIMIT_OPTIONS, PAGE_KEY, readLimit, withParam } from "./params.ts"
import { useCollection } from "./use-collection.ts"

/**
 * Paginación atada a la dirección.
 *
 * No se pinta cuando sólo hay una página: una barra de navegación con un único destino es ruido.
 * El recuento sí se sigue diciendo, porque «cuántos hay» es información aunque quepan todos.
 */
export function Pager({
  page,
  totalPages,
  totalItems,
}: {
  page: number
  totalPages: number
  totalItems: number
}) {
  const t = useTranslations()
  const format = useFormatter()
  const { params, apply } = useCollection()

  if (totalItems === 0) return null

  return (
    <div className="mt-4">
      {totalPages <= 1 ? (
        <p className="text-body3 text-content-faint">
          {t("collection.itemCount", { count: format.number(totalItems) })}
        </p>
      ) : (
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={(next) => apply(withParam(params, PAGE_KEY, String(next)))}
          limit={readLimit(params)}
          limitOptions={LIMIT_OPTIONS}
          onLimitChange={(next) => apply(withParam(params, LIMIT_KEY, String(next)))}
          labels={{
            summary: t("collection.summary", {
              page: format.number(page),
              totalPages: format.number(totalPages),
              totalItems: format.number(totalItems),
            }),
            navigation: t("collection.pagination"),
            first: t("collection.firstPage"),
            previous: t("collection.previousPage"),
            next: t("collection.nextPage"),
            last: t("collection.lastPage"),
            perPage: t("collection.perPage"),
            page: (entry) => t("collection.goToPage", { page: format.number(entry) }),
          }}
        />
      )}
    </div>
  )
}
