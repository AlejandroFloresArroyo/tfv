/**
 * El núcleo del guardado automático.
 *
 * Lo que se comprueba aquí es lo que decidió la sesión de diseño: una petición en vuelo a la vez
 * con el estado más reciente al terminar, y un fallo que no borra lo escrito.
 */

import { describe, expect, it } from "vitest"
import { type AutosaveState, createAutosaver } from "./autosave.ts"

/** Un guardado que se resuelve cuando la prueba lo diga. */
function deferred() {
  let resolve!: () => void
  let reject!: (failure: Error) => void
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

function collect() {
  const states: AutosaveState[] = []
  return { states, notify: (state: AutosaveState) => states.push(state) }
}

describe("guardado automático", () => {
  it("no manda dos veces el mismo valor", () => {
    const sent: string[] = []
    const { notify } = collect()
    const autosaver = createAutosaver<string>(
      async (value) => {
        sent.push(value)
      },
      "",
      notify,
    )

    autosaver.push("")
    expect(sent).toEqual([])
  })

  it("manda el estado más reciente cuando hay una petición en vuelo", async () => {
    // Es la razón entera de que exista la cola: el `PUT` reemplaza el objeto completo, así que dos
    // en paralelo se pisan y la que llega la última manda, no la que se escribió la última.
    const sent: string[] = []
    const first = deferred()
    const autosaver = createAutosaver<string>(
      async (value) => {
        sent.push(value)
        if (sent.length === 1) await first.promise
      },
      "",
      collect().notify,
    )

    autosaver.push("uno")
    expect(sent).toEqual(["uno"])

    // Dos cambios más mientras el primero sigue en vuelo: sólo el último tiene que viajar.
    autosaver.push("dos")
    autosaver.push("tres")
    expect(sent).toEqual(["uno"])

    first.resolve()
    await new Promise((tick) => setTimeout(tick, 0))

    expect(sent).toEqual(["uno", "tres"])
  })

  it("un fallo deja lo escrito sin confirmar y lo cuenta", async () => {
    const failing = deferred()
    const { states, notify } = collect()
    const autosaver = createAutosaver<string>(async () => await failing.promise, "", notify)

    autosaver.push("uno")
    failing.reject(new Error("No se pudo guardar"))
    await new Promise((tick) => setTimeout(tick, 0))

    const last = states.at(-1)
    expect(last?.saving).toBe(false)
    expect(last?.error).toBe("No se pudo guardar")
    expect(last?.saved).toBe(false)
    // Lo confirmado sigue siendo el valor inicial: el aviso de pendiente se enciende solo.
    expect(last?.confirmed).toBe('""')
  })

  it("el siguiente cambio reintenta después de un fallo", async () => {
    const sent: string[] = []
    let failNext = true
    const { states, notify } = collect()
    const autosaver = createAutosaver<string>(
      async (value) => {
        sent.push(value)
        if (failNext) {
          failNext = false
          throw new Error("caída")
        }
      },
      "",
      notify,
    )

    autosaver.push("uno")
    await new Promise((tick) => setTimeout(tick, 0))
    expect(states.at(-1)?.error).toBe("caída")

    autosaver.push("dos")
    await new Promise((tick) => setTimeout(tick, 0))

    expect(sent).toEqual(["uno", "dos"])
    expect(states.at(-1)?.error).toBeNull()
    expect(states.at(-1)?.confirmed).toBe('"dos"')
    expect(states.at(-1)?.saved).toBe(true)
  })
})
