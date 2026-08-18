"use client"

import { useCallback, useRef, useState } from "react"

/**
 * Guardado automático de un bloque que se manda entero.
 *
 * Los bloques de condiciones de pago e impuestos se escriben campo a campo y se guardan **sin
 * botón**: el texto al perder el foco, los interruptores y selectores al cambiar. Lo que sigue son
 * las tres decisiones que hacen que eso no sea una fuente de pérdidas silenciosas.
 *
 * ## Una petición en vuelo a la vez
 *
 * El `PUT` reemplaza el objeto completo. Dos cambios seguidos lanzan dos peticiones y, si la
 * primera llega la última, **machaca a la segunda**: el usuario ve en pantalla lo que escribió y el
 * servidor guarda lo anterior. Aquí sólo hay una en curso; las que lleguen mientras tanto no se
 * encolan, marcan que hay que repetir, y al terminar se manda **el estado más reciente**. Los
 * intermedios no viajan porque no hacen falta: el objeto va entero.
 *
 * ## Fallar no revierte
 *
 * Si el `PUT` falla, lo escrito se queda donde está y el aviso aparece. Revertir al último valor
 * bueno tiraría lo que la persona acaba de teclear, que es la peor manera de contarle que hubo un
 * problema. El siguiente cambio reintenta.
 *
 * ## Lo pendiente se sabe comparando, no recordando
 *
 * Sale de comparar lo que hay con lo último que el servidor confirmó. Así un guardado fallido deja
 * el aviso encendido sin que nadie tenga que acordarse de encenderlo, y volver a escribir a mano el
 * valor anterior lo apaga solo.
 */

export interface AutosaveState {
  readonly saving: boolean
  /** El mensaje del último fallo, o nada. Se limpia en cuanto un guardado triunfa. */
  readonly error: string | null
  /** Lo último que el servidor confirmó, serializado. Comparar contra esto es saber qué falta. */
  readonly confirmed: string
  /**
   * Se ha guardado algo en esta visita.
   *
   * Sin esto, el panel saluda con un «Guardado» que nadie provocó: al abrir la ficha no hay nada
   * pendiente, y decir que se guardó algo es contar un acto que no ocurrió.
   */
  readonly saved: boolean
}

export interface Autosaver<T> {
  /** Manda `value` si difiere de lo confirmado. Si hay algo en vuelo, se repetirá al terminar. */
  readonly push: (value: T) => void
}

/**
 * El núcleo, sin React, para poder probarlo.
 *
 * Vive fuera del hook porque lo que hay que comprobar —que dos cambios seguidos no se pisan y que
 * un fallo no borra lo escrito— no necesita un navegador, y montar uno para verlo habría acabado en
 * que no se comprueba.
 */
export function createAutosaver<T>(
  save: (value: T) => Promise<void>,
  initial: T,
  notify: (state: AutosaveState) => void,
): Autosaver<T> {
  let confirmed = serialize(initial)
  let error: string | null = null
  let running = false
  let again = false
  let saved = false
  let latest = initial

  const emit = (saving: boolean) => notify({ saving, error, confirmed, saved })

  async function run(): Promise<void> {
    running = true
    emit(true)
    try {
      do {
        again = false
        const snapshot = latest
        await save(snapshot)
        confirmed = serialize(snapshot)
      } while (again && serialize(latest) !== confirmed)
      error = null
      saved = true
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure)
    } finally {
      running = false
      emit(false)
    }
  }

  return {
    push(value: T) {
      latest = value
      if (serialize(value) === confirmed) return
      if (running) {
        again = true
        return
      }
      void run()
    },
  }
}

export interface Autosave {
  /** Manda lo que haya, si cambió. Es lo que llaman `onBlur` y los controles al cambiar. */
  readonly commit: () => void
  readonly saving: boolean
  readonly error: string | null
  /** Hay algo escrito que el servidor todavía no tiene. */
  readonly pending: boolean
  /** Se ha guardado algo en esta visita. Antes de eso no hay nada que anunciar. */
  readonly saved: boolean
}

export function useAutosave<T>(value: T, save: (value: T) => Promise<void>): Autosave {
  const [state, setState] = useState<AutosaveState>(() => ({
    saving: false,
    error: null,
    confirmed: serialize(value),
    saved: false,
  }))

  // En cada render, sin efecto: `commit` tiene que ver lo último aunque se le llame desde un
  // manejador registrado hace tres renders.
  const latest = useRef(value)
  latest.current = value
  const saver = useRef(save)
  saver.current = save

  const autosaver = useRef<Autosaver<T> | null>(null)
  autosaver.current ??= createAutosaver<T>(
    (next) => saver.current(next),
    value,
    (next) => setState(next),
  )

  const commit = useCallback(() => autosaver.current?.push(latest.current), [])

  return {
    commit,
    saving: state.saving,
    error: state.error,
    pending: serialize(value) !== state.confirmed,
    saved: state.saved,
  }
}

/**
 * La forma de comparar dos estados del bloque.
 *
 * Por identidad no sirve: el valor se deriva del formulario en cada render y siempre es un objeto
 * nuevo. Son objetos pequeños y de datos, construidos siempre igual, así que el orden de las claves
 * es estable y el texto los distingue bien.
 */
function serialize(value: unknown): string {
  return JSON.stringify(value) ?? ""
}
