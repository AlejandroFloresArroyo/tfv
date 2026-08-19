/**
 * La conversación del pedido, vista desde el navegador.
 *
 * Transcritas de `openspec/specs/order-chat/spec.md`. Lo que se comprueba aquí es lo que se ve raro
 * en cuanto hay dos personas: que el mensaje propio no se duplique, que un envío fallido no borre
 * lo escrito, que lo perdido mientras no se miraba vuelva, y que un borrado ajeno desaparezca de
 * la pantalla.
 *
 * El transporte es de mentira a propósito: lo que se prueba es la reconciliación, no la red.
 */

import { describe, expect, it } from "vitest"
import {
  backoffDelay,
  type ChatMessage,
  type ChatSnapshot,
  type ChatTransport,
  createChatStore,
  mergeMessages,
  type SentMessage,
} from "./order-chat.ts"

const YO = "u-almacen"

function message(id: string, body: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    orderId: "o-1",
    side: "provider",
    authorId: YO,
    authorName: "Almacén",
    body,
    replyToId: null,
    readByClientAt: null,
    readByProviderAt: null,
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-08-18T10:00:00.000Z",
    updatedAt: "2026-08-18T10:00:00.000Z",
    ...extra,
  }
}

/** Un transporte que responde lo que se le diga, y anota lo que le pidieron. */
function fakeTransport(overrides: Partial<ChatTransport> = {}) {
  const asked: string[] = []

  const base: ChatTransport = {
    history: async () => ({
      items: [],
      side: "provider",
      hasMore: false,
      olderCursor: null,
      syncCursor: "",
      unread: 0,
    }),
    updates: async (since) => {
      asked.push(since)
      return {
        items: [],
        side: "provider",
        hasMore: false,
        olderCursor: null,
        syncCursor: since,
        unread: 0,
      }
    },
    send: async () => {
      throw new Error("sin implementar")
    },
    edit: async () => {
      throw new Error("sin implementar")
    },
    remove: async () => {},
    markRead: async () => {},
  }

  return { transport: { ...base, ...overrides } as ChatTransport, asked }
}

function store(transport: ChatTransport) {
  let snapshot: ChatSnapshot | null = null
  const chat = createChatStore({
    transport,
    viewerId: YO,
    notify: (next) => {
      snapshot = next
    },
  })
  return { chat, state: () => snapshot as ChatSnapshot }
}

describe("mezclar lo que llega con lo que hay", () => {
  it("no repite lo que ya está, y deja lo más reciente arriba", () => {
    const actual = [message("a", "Uno"), message("b", "Dos")]
    const llega = [message("b", "Dos"), message("c", "Tres")]

    expect(mergeMessages(actual, llega).map((row) => row.id)).toEqual(["a", "b", "c"])
  })

  it("lo editado sustituye a su copia vieja", () => {
    const actual = [message("a", "Salimos a las ocho")]
    const llega = [message("a", "Salimos a las nueve", { editedAt: "2026-08-18T11:00:00.000Z" })]

    expect(mergeMessages(actual, llega)[0]?.body).toBe("Salimos a las nueve")
  })

  it("lo borrado desaparece", () => {
    // Escenario: «El borrado llega a todos». El aviso llega como el mensaje marcado, y lo que hay
    // que hacer con él es retirarlo.
    const actual = [message("a", "Uno"), message("b", "Me equivoqué")]
    const llega = [message("b", "", { deletedAt: "2026-08-18T11:00:00.000Z" })]

    expect(mergeMessages(actual, llega).map((row) => row.id)).toEqual(["a"])
  })
})

describe("envío optimista", () => {
  it("el mensaje se ve antes de que el servidor conteste, y luego no se duplica", async () => {
    // Escenario: «El mensaje propio no se duplica».
    // En un objeto y no en una variable suelta: al asignarse dentro de la promesa, el análisis de
    // flujo daría la variable por nula para siempre.
    const puerta: { resolve: ((value: SentMessage) => void) | null } = { resolve: null }
    const { transport } = fakeTransport({
      send: () =>
        new Promise<SentMessage>((resolve) => {
          puerta.resolve = resolve
        }),
    })

    const { chat, state } = store(transport)
    const enviando = chat.send("Ya salió el equipo")

    expect(state().timeline.map((entry) => entry.body)).toEqual(["Ya salió el equipo"])
    expect(state().timeline[0]?.pending).toBe(true)

    puerta.resolve?.({
      message: message("m-1", "Ya salió el equipo"),
      clientRef: state().timeline[0]?.id ?? null,
    })
    await enviando

    expect(state().timeline.map((entry) => entry.body)).toEqual(["Ya salió el equipo"])
    expect(state().timeline[0]?.pending).toBe(false)
    expect(state().timeline[0]?.id).toBe("m-1")
  })

  it("si la consulta trae mi mensaje antes que su confirmación, no se ve dos veces", async () => {
    // La carrera fina: el servidor ya lo guardó, la consulta periódica lo trae, y la respuesta al
    // envío todavía no ha vuelto. Sin esto el mensaje se ve dos veces —el borrador y el
    // confirmado— hasta que la respuesta llega.
    const puerta: { resolve: ((value: SentMessage) => void) | null } = { resolve: null }
    const { transport } = fakeTransport({
      send: () =>
        new Promise<SentMessage>((resolve) => {
          puerta.resolve = resolve
        }),
      updates: async (since) => ({
        items: [message("m-9", "Ya salió el equipo")],
        side: "provider",
        hasMore: false,
        olderCursor: null,
        syncCursor: since,
        unread: 0,
      }),
    })

    const { chat, state } = store(transport)
    const enviando = chat.send("Ya salió el equipo")
    await chat.poll()

    expect(state().timeline.map((entry) => entry.id)).toEqual(["m-9"])

    puerta.resolve?.({ message: message("m-9", "Ya salió el equipo"), clientRef: "borrador" })
    await enviando

    expect(state().timeline.map((entry) => entry.id)).toEqual(["m-9"])
  })

  it("si el envío falla, lo escrito no se pierde", async () => {
    // Revertir tiraría lo que la persona acaba de teclear, que es la peor manera de contarle que
    // hubo un problema.
    const { transport } = fakeTransport({
      send: async () => {
        throw new Error("sin red")
      },
    })

    const { chat, state } = store(transport)
    await chat.send("Voy para allá")

    expect(state().timeline[0]?.body).toBe("Voy para allá")
    expect(state().timeline[0]?.failed).toBe(true)
  })

  it("lo que falló se reintenta con el mismo texto", async () => {
    let intentos = 0
    const { transport } = fakeTransport({
      send: async (input) => {
        intentos += 1
        if (intentos === 1) throw new Error("sin red")
        return { message: message("m-2", input.body), clientRef: input.clientRef }
      },
    })

    const { chat, state } = store(transport)
    await chat.send("Confirmado")
    const fallido = state().timeline[0]?.id as string

    await chat.retry(fallido)

    expect(state().timeline.map((entry) => entry.id)).toEqual(["m-2"])
    expect(state().timeline[0]?.failed).toBe(false)
  })

  it("un mensaje vacío ni se manda", async () => {
    let llamadas = 0
    const { transport } = fakeTransport({
      send: async (input) => {
        llamadas += 1
        return { message: message("m-3", input.body), clientRef: input.clientRef }
      },
    })

    const { chat, state } = store(transport)
    await chat.send("   ")

    expect(llamadas).toBe(0)
    expect(state().timeline).toHaveLength(0)
  })
})

describe("recuperar lo perdido", () => {
  it("la consulta pide desde donde se quedó, y retrocede un poco para no perder nada", async () => {
    // Escenario: «Se recupera lo perdido al reconectar». El solape cierra la carrera entre
    // escribir y leer: lo que confirma después de que la lectura tomó su instante caería fuera.
    const { transport, asked } = fakeTransport({
      history: async () => ({
        items: [message("a", "Uno")],
        side: "provider",
        hasMore: false,
        olderCursor: null,
        syncCursor: "1755511200000.0197f0e1-2c34-7abc-8def-0123456789ab",
        unread: 0,
      }),
    })

    const { chat } = store(transport)
    await chat.open()
    await chat.poll()

    expect(asked).toHaveLength(1)
    // Dos segundos por detrás del cursor, con el identificador mínimo.
    expect(asked[0]).toBe("1755511198000.00000000-0000-0000-0000-000000000000")
  })

  it("mientras queda cola no retrocede: se vacía primero", async () => {
    const { transport, asked } = fakeTransport({
      history: async () => ({
        items: [],
        side: "provider",
        hasMore: false,
        olderCursor: null,
        syncCursor: "1755511200000.0197f0e1-2c34-7abc-8def-0123456789ab",
        unread: 0,
      }),
      updates: async (since) => {
        asked.push(since)
        return {
          items: [message("a", "Uno")],
          side: "provider",
          hasMore: asked.length === 1,
          olderCursor: null,
          syncCursor: "1755511300000.0197f0e1-2c34-7abc-8def-0123456789ac",
          unread: 0,
        }
      },
    })

    const { chat, state } = store(transport)
    await chat.open()
    await chat.poll()
    await chat.poll()

    // La segunda vuelta parte del cursor exacto que devolvió la primera, sin solape: mientras hay
    // más cola, retroceder sería no avanzar nunca.
    expect(asked[1]).toBe("1755511300000.0197f0e1-2c34-7abc-8def-0123456789ac")
    expect(state().timeline).toHaveLength(1)
  })

  it("lo que llega mientras nadie miraba aparece en la conversación", async () => {
    const { transport } = fakeTransport({
      updates: async (since) => ({
        items: [message("n-1", "¿Sigue en pie lo del martes?", { side: "client", authorId: null })],
        side: "provider",
        hasMore: false,
        olderCursor: null,
        syncCursor: since,
        unread: 1,
      }),
    })

    const { chat, state } = store(transport)
    await chat.poll()

    expect(state().timeline.map((entry) => entry.body)).toEqual(["¿Sigue en pie lo del martes?"])
    expect(state().unread).toBe(1)
  })
})

describe("el estado de la conexión", () => {
  it("una consulta fallida deja la conversación reintentando, y no borra lo que había", async () => {
    // Escenario: «El estado de la conexión es visible».
    let falla = true
    const { transport } = fakeTransport({
      history: async () => ({
        items: [message("a", "Uno")],
        side: "provider",
        hasMore: false,
        olderCursor: null,
        syncCursor: "1755511200000.0197f0e1-2c34-7abc-8def-0123456789ab",
        unread: 0,
      }),
      updates: async (since) => {
        if (falla) throw new Error("sin red")
        return {
          items: [],
          side: "provider",
          hasMore: false,
          olderCursor: null,
          syncCursor: since,
          unread: 0,
        }
      },
    })

    const { chat, state } = store(transport)
    await chat.open()
    await chat.poll()

    expect(state().status).toBe("retrying")
    expect(state().attempt).toBe(1)
    expect(state().timeline).toHaveLength(1)

    falla = false
    await chat.poll()

    expect(state().status).toBe("live")
    expect(state().attempt).toBe(0)
  })

  it("los reintentos se espacian y no crecen sin fin", () => {
    // Requisito: «Los intentos SHALL espaciarse progresivamente».
    const delays = [0, 1, 2, 3, 4, 8, 20].map(backoffDelay)

    expect(delays[1]).toBeGreaterThan(delays[0] as number)
    expect(delays[2]).toBeGreaterThan(delays[1] as number)
    expect(delays[6]).toBe(delays[5])
    expect(delays[6]).toBeLessThanOrEqual(30_000)
  })
})

describe("el historial hacia atrás", () => {
  it("se añade por delante sin repetir, y deja de pedirse cuando se acaba", async () => {
    const paginas = [
      {
        items: [message("c", "Tres"), message("b", "Dos")],
        side: "provider" as const,
        hasMore: true,
        olderCursor: "b",
        syncCursor: "1755511200000.0197f0e1-2c34-7abc-8def-0123456789ab",
        unread: 0,
      },
      {
        items: [message("a", "Uno")],
        side: "provider" as const,
        hasMore: false,
        olderCursor: null,
        syncCursor: "1755511200000.0197f0e1-2c34-7abc-8def-0123456789ab",
        unread: 0,
      },
    ]

    let vuelta = 0
    const { transport } = fakeTransport({
      history: async () => paginas[vuelta++] as (typeof paginas)[number],
    })

    const { chat, state } = store(transport)
    await chat.open()
    expect(state().hasOlder).toBe(true)

    await chat.older()

    expect(state().timeline.map((entry) => entry.body)).toEqual(["Uno", "Dos", "Tres"])
    expect(state().hasOlder).toBe(false)
  })
})
