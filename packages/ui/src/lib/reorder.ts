/**
 * Reordenar una lista arrastrando, con el arrastre fuera.
 *
 * Ver `openspec/specs/site-builder/spec.md`, requisito «Orden de las secciones»: «SHALL poder
 * reordenarse arrastrándolas».
 *
 * Es el mismo reparto que `wizard.ts` y por un motivo que aquí se ve más claro que en ningún otro
 * primitivo: **mover un elemento de la tercera posición a la primera es aritmética**, y una
 * aritmética que sólo se puede ejercer con un ratón no se puede probar. Escrita dentro del
 * componente, los casos que fallan —soltar sobre uno mismo, salirse de la lista, soltar sin haber
 * agarrado, el desplazamiento hacia abajo, que no es simétrico del de arriba— se descubren cuando
 * alguien pierde una sección.
 *
 * El componente que la conecta a los eventos del puntero vive en `components/reorder-list.tsx`, y
 * no sabe nada de índices: llama a estas seis funciones.
 *
 * ## Las tres posiciones que intervienen
 *
 * - `from`: dónde estaba el elemento cuando se agarró. **No cambia** durante el arrastre.
 * - `over`: dónde caería si se soltara ahora. Es lo único que se mueve.
 * - El resultado de `move`, que es la lista ya cambiada y sólo existe al soltar.
 *
 * Confundir las dos primeras es el error clásico: si `from` se actualizara al pasar por encima de
 * cada vecino, arrastrar tres posiciones haría tres movimientos encadenados en vez de uno, y soltar
 * fuera dejaría la lista a medio mover.
 */

/**
 * La lista con el elemento de `from` colocado en `to`.
 *
 * `to` es el índice **final** que ocupa el elemento, no el hueco donde se inserta: mover el primero
 * a la posición 2 lo deja en la 2. Es lo que espera quien mira la pantalla, y evita la corrección
 * de «uno menos si vas hacia abajo» que hay que hacer con la otra convención — y que se olvida.
 *
 * Un origen que no existe devuelve la lista intacta en lugar de vaciarla; un destino fuera se ajusta
 * al extremo, porque soltar más allá del último elemento significa «al final», no «a ninguna parte».
 */
export function move<T>(items: readonly T[], from: number, to: number): readonly T[] {
  if (!Number.isInteger(from) || from < 0 || from >= items.length) return items

  const target = clamp(to, items.length)
  if (target === from) return items

  const next = [...items]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return items

  next.splice(target, 0, moved)
  return next
}

/**
 * El índice al que lleva una tecla de dirección.
 *
 * Existe porque una lista que sólo se reordena arrastrando **no se puede usar sin ratón**, y eso
 * deja fuera a quien navega con teclado. En los extremos se queda quieta: dar la vuelta mandaría la
 * primera sección al final de la página al pulsar una vez de más.
 */
export function nudge(index: number, delta: number, length: number): number {
  return clamp(index + delta, length)
}

/** Un arrastre en curso. `null` cuando no hay ninguno. */
export interface DragState {
  /** Dónde estaba el elemento al agarrarlo. Constante mientras dure el arrastre. */
  readonly from: number
  /** Dónde caería si se soltara ahora. */
  readonly over: number
}

export type Reorder = DragState | null

/** Agarrar el elemento de un índice. Agarrar algo que no está en la lista no empieza nada. */
export function grab(index: number, length: number): Reorder {
  if (!Number.isInteger(index) || index < 0 || index >= length) return null
  return { from: index, over: index }
}

/**
 * Pasar por encima de un elemento.
 *
 * Sin arrastre en curso no empieza uno: un `dragover` puede llegar de un arrastre ajeno —un archivo
 * traído del escritorio, otra lista de la misma página— y responderle moviendo secciones sería
 * reordenar por algo que nadie pidió.
 */
export function drag(state: Reorder, index: number, length: number): Reorder {
  if (state === null) return null
  if (!Number.isInteger(index) || index < 0 || index >= length) return state
  return { from: state.from, over: index }
}

/** Lo que se enseña mientras se arrastra: la lista como quedaría al soltar. */
export function preview<T>(items: readonly T[], state: Reorder): readonly T[] {
  if (state === null) return items
  return move(items, state.from, state.over)
}

/**
 * Soltar.
 *
 * Devuelve además si **hubo movimiento**, y eso no es cosmético: quien llama guarda al soltar, y
 * agarrar una sección y soltarla donde estaba no puede disparar un guardado — ni marcar el
 * formulario como sucio, ni mandar una petición, ni avisar de cambios sin guardar al salir.
 */
export function drop<T>(
  items: readonly T[],
  state: Reorder,
): { readonly items: readonly T[]; readonly state: Reorder; readonly moved: boolean } {
  if (state === null) return { items, state: null, moved: false }

  const next = move(items, state.from, state.over)
  return { items: next, state: null, moved: next !== items }
}

/** Abandonar el arrastre. La lista no se toca: `preview` deja de aplicarse y ya está. */
export function cancel(): Reorder {
  return null
}

function clamp(index: number, length: number): number {
  if (length === 0) return 0
  return Math.min(Math.max(index, 0), length - 1)
}
