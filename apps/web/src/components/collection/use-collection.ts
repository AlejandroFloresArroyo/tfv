"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useTransition } from "react"

/**
 * El puente entre los parámetros y el enrutador.
 *
 * Toda la exploración se aplica **navegando**: no hay estado que sincronizar con la dirección
 * porque la dirección es el estado. De ahí salen gratis las tres propiedades que la spec pide —
 * compartir por enlace, retroceder para deshacer, recargar sin perder nada.
 *
 * Va con `push` y no con `replace` a propósito: cada cambio deja entrada en la historia, que es lo
 * que hace que el gesto de retroceder deshaga el último filtro y no salga de la pantalla.
 *
 * El desplazamiento no se toca (`scroll: false`). Saltar arriba al cambiar de página tiene sentido;
 * saltar arriba al marcar una casilla en el panel de filtros deja a la persona buscando dónde
 * estaba.
 */
export function useCollection() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const apply = useCallback(
    (next: URLSearchParams) => {
      const query = next.toString()
      startTransition(() => {
        router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
      })
    },
    [pathname, router],
  )

  return { params, apply, pending }
}
