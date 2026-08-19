"use client"

import { GripVertical } from "lucide-react"
import { type ReactNode, useState } from "react"
import { cn } from "../lib/cn.ts"
import { cancel, drag, drop, grab, move, nudge, preview, type Reorder } from "../lib/reorder.ts"

/**
 * Una lista que se reordena arrastrando.
 *
 * **Este archivo no decide nada.** Toda la aritmética está en `../lib/reorder.ts`, probada sin
 * navegador; aquí sólo se traducen seis eventos del puntero y dos teclas en llamadas a esa máquina.
 * Si algo de lo que hace este componente no se puede explicar leyendo `reorder.ts`, está en el sitio
 * equivocado.
 *
 * ## Por qué el asa y no la fila entera
 *
 * Porque la fila lleva dentro campos de texto, y un `<input>` dentro de un elemento `draggable` no
 * se puede seleccionar con el ratón: el navegador interpreta el gesto como el comienzo de un
 * arrastre. Con asa, arrastrar es un gesto deliberado y editar sigue funcionando.
 *
 * ## Y por qué además se mueve con el teclado
 *
 * Porque `dragstart` no existe para quien navega con teclado, y una lista que sólo se ordena
 * arrastrando deja fuera a esa persona. El asa es un botón: recibe foco, y las flechas mueven su
 * fila. Es el mismo movimiento —`move`, la misma función— disparado por otro evento.
 */
export interface ReorderListProps<T> {
  items: readonly T[]
  /** Estable y propio del elemento: el índice cambia justo cuando se reordena. */
  keyOf: (item: T, index: number) => string
  /** Se llama con la lista ya movida, y **sólo cuando hubo movimiento**. */
  onReorder: (items: readonly T[]) => void
  children: (item: T, index: number) => ReactNode
  /** Lo que anuncia el asa a un lector de pantalla, con el nombre de la fila dentro. */
  handleLabel: (item: T, index: number) => string
  className?: string
  itemClassName?: string
}

export function ReorderList<T>({
  items,
  keyOf,
  onReorder,
  children,
  handleLabel,
  className,
  itemClassName,
}: ReorderListProps<T>) {
  const [state, setState] = useState<Reorder>(null)

  // Lo que se ve mientras se arrastra ya es la lista movida: el hueco se abre bajo el cursor en vez
  // de aparecer al soltar, que es lo que hace que se entienda dónde va a caer.
  const shown = preview(items, state)

  // Qué fila se está arrastrando, por su clave y no por su índice: durante el arrastre el índice de
  // esa fila es justo el dato que está cambiando.
  const grabbed = state === null ? undefined : items[state.from]
  const grabbedKey = state === null || grabbed === undefined ? null : keyOf(grabbed, state.from)

  const commit = (next: readonly T[]) => {
    if (next !== items) onReorder(next)
  }

  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {shown.map((item, index) => {
        const dragged = grabbedKey !== null && keyOf(item, index) === grabbedKey

        return (
          <li
            key={keyOf(item, index)}
            // El destino es la fila entera aunque el origen sea el asa: al arrastrar se apunta a
            // dónde va, y obligar a soltar sobre otra asa sería pedir puntería de seis píxeles.
            onDragOver={(event) => {
              if (state === null) return
              // Sin esto el navegador rechaza el soltado y el arrastre termina en nada.
              event.preventDefault()
              setState((current) => drag(current, index, items.length))
            }}
            onDrop={(event) => {
              event.preventDefault()
              const result = drop(items, state)
              setState(result.state)
              if (result.moved) commit(result.items)
            }}
            className={cn(
              "flex items-start gap-2 rounded-lg border border-edge bg-panel",
              // El anillo de la fila agarrada es la rúbrica: dice dónde estás, que es su trabajo.
              dragged && "opacity-60 ring-2 ring-accent",
              itemClassName,
            )}
          >
            <button
              type="button"
              draggable
              aria-label={handleLabel(item, index)}
              onDragStart={() => setState(grab(index, items.length))}
              onDragEnd={() => setState(cancel())}
              onKeyDown={(event) => {
                const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0
                if (delta === 0) return
                // La lista se desplazaría con las flechas si no; el gesto es mover la fila.
                event.preventDefault()
                commit(move(items, index, nudge(index, delta, items.length)))
              }}
              className="mt-1 shrink-0 cursor-grab rounded-md p-1.5 text-content-faint hover:bg-panel-hover hover:text-content active:cursor-grabbing"
            >
              <GripVertical className="size-4" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">{children(item, index)}</div>
          </li>
        )
      })}
    </ul>
  )
}
