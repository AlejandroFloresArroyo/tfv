"use client"

import { Button, ErrorState } from "@tfv/ui"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { clearFilters } from "./params.ts"
import { useCollection } from "./use-collection.ts"

/**
 * Reintentar **sin recargar la página**.
 *
 * Recargar tira el estado del panel entero para volver a pedir una lista. `router.refresh()` vuelve
 * a resolver el árbol de servidor conservando lo demás, que es lo que la spec pide: «se ofrece
 * reintentar sin recargar la página».
 */
export function Retry({ title, body }: { title: string; body: string }) {
  const t = useTranslations()
  const router = useRouter()

  return (
    <ErrorState
      title={title}
      body={body}
      retryLabel={t("common.retry")}
      onRetry={() => router.refresh()}
    />
  )
}

/** Limpiar desde el estado de «sin resultados», que es donde de verdad hace falta. */
export function ClearFilters({ label }: { label: string }) {
  const { params, apply } = useCollection()

  return (
    <Button variant="secondary" size="sm" onClick={() => apply(clearFilters(params))}>
      {label}
    </Button>
  )
}
