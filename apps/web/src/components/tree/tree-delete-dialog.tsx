"use client"

import { useEffect, useRef, useState } from "react"
import { ConfirmDestructive } from "../confirm-destructive.tsx"

/**
 * Borrar un nodo, con el alcance contado y no supuesto.
 *
 * Las dos specs piden lo mismo con distintas palabras: el borrado **es recursivo** y lo clasificado
 * o guardado dentro **no se borra**, se queda huérfano. Y las dos piden que la confirmación diga
 * cuánto, antes de pulsar. «¿Eliminar el rack?» y «se eliminan 10 ubicaciones y 12 productos se
 * quedan sin ubicación» son dos decisiones distintas.
 *
 * El recuento se pide **al abrir** y no al pintar la lista: contar el subárbol de cada tarjeta de
 * una rejilla sería una consulta por tarjeta para un número que casi nadie va a mirar.
 *
 * Qué se cuenta y cómo lo decide la pantalla, porque cada recurso lo averigua a su manera —una
 * ubicación tiene consulta de alcance, una categoría no—. Aquí sólo se sabe que llega tarde.
 */
export function TreeDeleteDialog({
  title,
  entity,
  confirmLabel,
  countingLabel,
  countFailedLabel,
  load,
  remove,
  open,
  onOpenChange,
}: {
  title: string
  /** Qué se borra, por su nombre. Es lo que detiene a quien iba a borrar otra cosa. */
  entity: string
  confirmLabel: string
  /** Mientras el alcance no ha llegado. Ocupa su sitio para que la lista no dé un salto. */
  countingLabel: string
  /** Si no se pudo contar. Callar el alcance sería peor que decir que se desconoce. */
  countFailedLabel: string
  /** Las líneas del alcance, ya redactadas por la pantalla. */
  load: () => Promise<readonly string[]>
  remove: () => Promise<unknown>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [cascade, setCascade] = useState<readonly string[] | null>(null)
  const [failed, setFailed] = useState(false)

  // Como en el diálogo de mover: la referencia evita que volver a crear `load` en cada pintado del
  // componente de arriba dispare otra cuenta.
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    if (!open) {
      setCascade(null)
      setFailed(false)
      return
    }

    let alive = true

    loadRef.current().then(
      (lines) => {
        if (alive) setCascade(lines)
      },
      () => {
        if (alive) setFailed(true)
      },
    )

    return () => {
      alive = false
    }
  }, [open])

  return (
    <ConfirmDestructive
      title={title}
      entity={entity}
      cascade={failed ? [countFailedLabel] : (cascade ?? [countingLabel])}
      confirmLabel={confirmLabel}
      open={open}
      onOpenChange={onOpenChange}
      action={remove}
    />
  )
}
