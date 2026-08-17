"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { ApiError, SessionExpiredError } from "~/lib/api.client.ts"

/**
 * El envío de un formulario, con lo que hay que hacer bien las cuatro veces.
 *
 * Se extrajo al escribir la quinta pantalla con formulario. Las cuatro anteriores repetían el mismo
 * bloque —bandera de en curso, mensaje general, errores por campo, `try`/`catch`— y ya empezaban a
 * diferir en detalles que nadie había decidido.
 *
 * Lo que resuelve, y que puesto a mano se olvida:
 *
 * - **El envío doble.** Si ya hay uno en curso, el segundo no sale. En un formulario de cobro eso
 *   es cobrar dos veces; aquí es crear dos empresas con el mismo nombre.
 * - **Los errores por campo van a su campo.** La API los devuelve con la forma del contrato;
 *   amontonarlos arriba obliga a adivinar cuál de los seis estaba mal.
 * - **La sesión caducada no es un error del formulario.** Si la renovación no pudo recuperarla, se
 *   va a la pantalla de acceso en lugar de decir «algo salió mal» sobre un formulario correcto.
 * - **Refresca el árbol de servidor al terminar.** Es lo que hace que la fila nueva aparezca en el
 *   listado sin recargar la página, y lo que sustituye a las mil doscientas llamadas manuales de
 *   refresco de la pila anterior (`DEFECTS.md` F-02).
 */
export interface SubmitState {
  readonly pending: boolean
  /** Mensaje general, para lo que no pertenece a ningún campo. */
  readonly error: string | null
  readonly fieldErrors: ReadonlyMap<string, string>
}

export interface UseSubmitOptions<T> {
  /** Qué hacer con el resultado. Corre antes de refrescar. */
  readonly onDone?: (result: T) => void
  /**
   * Volver a resolver el árbol de servidor al terminar.
   *
   * Cierto por omisión: casi todo lo que se envía cambia algo que la pantalla está mostrando.
   */
  readonly refresh?: boolean
}

export function useSubmit<T>(
  action: (input: FormData) => Promise<T>,
  options: UseSubmitOptions<T> = {},
) {
  const t = useTranslations()
  const router = useRouter()

  const [state, setState] = useState<SubmitState>({
    pending: false,
    error: null,
    fieldErrors: new Map(),
  })

  const submit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (state.pending) return

      const data = new FormData(event.currentTarget)
      setState({ pending: true, error: null, fieldErrors: new Map() })

      try {
        const result = await action(data)

        options.onDone?.(result)
        if (options.refresh !== false) router.refresh()

        setState({ pending: false, error: null, fieldErrors: new Map() })
      } catch (failure) {
        if (failure instanceof SessionExpiredError) {
          router.replace("/login")
          router.refresh()
          return
        }

        setState({
          pending: false,
          error: failure instanceof ApiError ? failure.message : t("common.networkError"),
          fieldErrors: failure instanceof ApiError ? failure.fields : new Map(),
        })
      }
    },
    [action, options, router, state.pending, t],
  )

  const reset = useCallback(() => {
    setState({ pending: false, error: null, fieldErrors: new Map() })
  }, [])

  return { ...state, submit, reset }
}

/** Lee un campo de texto del formulario, ya recortado. */
export function text(data: FormData, name: string): string {
  return String(data.get(name) ?? "").trim()
}

/** Lee un campo opcional: la cadena vacía se trata como ausencia, no como valor. */
export function optional(data: FormData, name: string): string | undefined {
  return text(data, name) || undefined
}
