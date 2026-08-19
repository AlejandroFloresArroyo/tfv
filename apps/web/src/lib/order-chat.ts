"use client"

import {
  type ChatSide,
  canDeleteMessage,
  canEditMessage,
  normalizeMessageBody,
  rewindChatCursor,
} from "@tfv/contracts"
import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "./api.client.ts"

/**
 * La conversación del pedido, del lado del navegador.
 *
 * Ver `openspec/specs/order-chat/spec.md`.
 *
 * ## El transporte está detrás de una costura
 *
 * Todo lo que la pantalla necesita saber del transporte cabe en `ChatTransport`: pedir historial,
 * pedir lo nuevo desde un punto, escribir, editar, borrar y marcar leído. Hoy lo cumple una
 * consulta periódica —`createPollingTransport`—; el día que haya conexión persistente se escribe
 * otro que cumpla lo mismo y **la pantalla no se entera**. Eso es lo que separa cambiar una pieza
 * de reescribir la conversación entera.
 *
 * ## La reconciliación vive fuera de React
 *
 * Lo que hay que comprobar de un chat —que el mensaje propio no se duplique, que un envío fallido
 * no borre lo escrito, que lo perdido vuelva— no necesita un navegador. Vive en `createChatStore`,
 * que es una función y se prueba como tal; el componente sólo cablea eventos.
 */

// ─── Lo que viaja ────────────────────────────────────────────────────────────

export interface ChatMessage {
  readonly id: string
  readonly orderId: string
  readonly side: ChatSide
  readonly authorId: string | null
  readonly authorName: string | null
  readonly body: string
  readonly replyToId: string | null
  readonly readByClientAt: string | null
  readonly readByProviderAt: string | null
  readonly editedAt: string | null
  readonly deletedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ConversationPage {
  readonly items: readonly ChatMessage[]
  readonly side: ChatSide
  readonly hasMore: boolean
  readonly olderCursor: string | null
  readonly syncCursor: string
  readonly unread: number
}

export interface SentMessage {
  readonly message: ChatMessage
  readonly clientRef: string | null
}

/** La costura. Lo que la conversación necesita del mundo, y nada más. */
export interface ChatTransport {
  history(options: { readonly before?: string | undefined }): Promise<ConversationPage>
  updates(since: string): Promise<ConversationPage>
  send(input: {
    readonly body: string
    readonly clientRef: string
    readonly replyToId?: string | undefined
  }): Promise<SentMessage>
  edit(messageId: string, body: string): Promise<ChatMessage>
  remove(messageId: string): Promise<void>
  markRead(): Promise<void>
}

// ─── Lo que ve la pantalla ───────────────────────────────────────────────────

export interface TimelineEntry {
  readonly id: string
  readonly side: ChatSide
  readonly authorId: string | null
  readonly authorName: string | null
  readonly body: string
  readonly createdAt: string
  readonly editedAt: string | null
  readonly readByClientAt: string | null
  readonly readByProviderAt: string | null
  /** Escrito y todavía sin confirmar. Se pinta en cuanto se escribe: el envío es optimista. */
  readonly pending: boolean
  /** El envío no llegó. El texto se conserva, y se puede reintentar. */
  readonly failed: boolean
  readonly mine: boolean
  readonly canEdit: boolean
  readonly canDelete: boolean
}

export type ChatStatus = "loading" | "live" | "retrying"

export interface ChatSnapshot {
  readonly timeline: readonly TimelineEntry[]
  readonly side: ChatSide
  readonly unread: number
  readonly status: ChatStatus
  /** Consultas fallidas seguidas. Es lo que espacia los reintentos. */
  readonly attempt: number
  readonly hasOlder: boolean
  readonly loadingOlder: boolean
  readonly error: string | null
}

/**
 * Cuánto se retrocede el cursor al preguntar por lo nuevo.
 *
 * Cierra la carrera entre escribir y leer: un mensaje que **confirma** en la base después de que
 * la consulta tomó su instante no aparecería nunca por delante del cursor. Volver a recibir lo ya
 * recibido no cuesta nada —se reconcilia por identificador—; perder un mensaje sí.
 */
const OVERLAP_MS = 2_000

/** Espaciado progresivo de los reintentos, con techo. */
export function backoffDelay(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt))
}

/**
 * Mezcla lo que llega con lo que hay.
 *
 * Por identificador, que además ordena por tiempo: da igual si un mensaje llega por el historial,
 * por la consulta de lo nuevo o por la confirmación del propio envío. **Lo borrado se retira**, que
 * es la forma que tiene el aviso de borrado de llegar sin conexión persistente.
 */
export function mergeMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): readonly ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]))

  for (const message of incoming) {
    if (message.deletedAt) byId.delete(message.id)
    else byId.set(message.id, message)
  }

  return [...byId.values()].sort((left, right) => (left.id < right.id ? -1 : 1))
}

// ─── El núcleo, sin React ────────────────────────────────────────────────────

interface PendingMessage {
  readonly ref: string
  readonly body: string
  readonly replyToId: string | null
  failed: boolean
}

export interface ChatStore {
  /** Primera carga: historial y punto de sincronización. */
  open(): Promise<void>
  /** Una vuelta de consulta: lo escrito, editado o borrado desde donde se quedó. */
  poll(): Promise<void>
  /** El trozo anterior del historial. */
  older(): Promise<void>
  send(body: string, replyToId?: string): Promise<void>
  retry(ref: string): Promise<void>
  edit(messageId: string, body: string): Promise<void>
  remove(messageId: string): Promise<void>
  markRead(): Promise<void>
  snapshot(): ChatSnapshot
}

export function createChatStore(options: {
  readonly transport: ChatTransport
  readonly viewerId: string
  readonly notify: (snapshot: ChatSnapshot) => void
}): ChatStore {
  const { transport, viewerId, notify } = options

  let messages: readonly ChatMessage[] = []
  let pending: PendingMessage[] = []
  let side: ChatSide = "provider"
  let unread = 0
  let status: ChatStatus = "loading"
  let attempt = 0
  let cursor = ""
  let olderCursor: string | null = null
  let hasOlder = false
  let loadingOlder = false
  let error: string | null = null
  /**
   * Queda cola por vaciar.
   *
   * Mientras la haya se pregunta por el cursor exacto y no por el retrocedido: retroceder con cola
   * pendiente sería volver a empezar en cada vuelta y no llegar nunca al final.
   */
  let draining = false

  function build(): ChatSnapshot {
    const viewer = { userId: viewerId, side }

    const confirmed: TimelineEntry[] = messages.map((message) => ({
      id: message.id,
      side: message.side,
      authorId: message.authorId,
      authorName: message.authorName,
      body: message.body,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      readByClientAt: message.readByClientAt,
      readByProviderAt: message.readByProviderAt,
      pending: false,
      failed: false,
      mine: message.authorId !== null && message.authorId === viewerId,
      canEdit: canEditMessage(
        { side: message.side, authorId: message.authorId, deletedAt: null },
        viewer,
      ),
      canDelete: canDeleteMessage(
        { side: message.side, authorId: message.authorId, deletedAt: null },
        viewer,
      ),
    }))

    // Lo pendiente va al final: es lo último que se escribió, y ahí es donde la vista lo espera.
    const waiting: TimelineEntry[] = pending.map((draft) => ({
      id: draft.ref,
      side,
      authorId: viewerId,
      authorName: null,
      body: draft.body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      readByClientAt: null,
      readByProviderAt: null,
      pending: true,
      failed: draft.failed,
      mine: true,
      canEdit: false,
      canDelete: false,
    }))

    return {
      timeline: [...confirmed, ...waiting],
      side,
      unread,
      status,
      attempt,
      hasOlder,
      loadingOlder,
      error,
    }
  }

  const emit = () => notify(build())

  function apply(page: ConversationPage): void {
    messages = mergeMessages(messages, page.items)
    side = page.side
    unread = page.unread
    settle(page.items)
  }

  /**
   * Retira los borradores que la consulta ya trajo confirmados.
   *
   * Es la carrera fina del envío optimista: el servidor guardó el mensaje, la consulta periódica lo
   * trae, y la respuesta al envío todavía no ha vuelto. Sin esto se ve dos veces —el borrador y el
   * confirmado— hasta que llega. Se emparejan por autor y texto, que es lo único que hay: la
   * referencia temporal es de quien envía y el servidor no la guarda.
   */
  function settle(incoming: readonly ChatMessage[]): void {
    if (pending.length === 0) return

    const mios = incoming.filter((message) => message.authorId === viewerId && !message.deletedAt)
    if (mios.length === 0) return

    // Uno por uno: quien manda dos veces el mismo texto tiene dos borradores, y sólo se cierra el
    // que la consulta trajo.
    const disponibles = mios.map((message) => message.body)
    pending = pending.filter((draft) => {
      const encaja = disponibles.indexOf(draft.body)
      if (encaja === -1 || draft.failed) return true
      disponibles.splice(encaja, 1)
      return false
    })
  }

  const store: ChatStore = {
    async open() {
      status = "loading"
      error = null
      emit()

      try {
        const page = await transport.history({})
        apply(page)
        cursor = page.syncCursor
        olderCursor = page.olderCursor
        hasOlder = page.hasMore
        draining = false
        status = "live"
        attempt = 0
      } catch (failure) {
        status = "retrying"
        attempt += 1
        error = describe(failure)
      }

      emit()
    },

    async poll() {
      // Con cola pendiente, por el cursor exacto; sin ella, un poco por detrás.
      const since = draining ? cursor : rewindChatCursor(cursor, OVERLAP_MS)

      try {
        const page = await transport.updates(since)
        apply(page)
        cursor = page.syncCursor
        draining = page.hasMore
        status = "live"
        attempt = 0
        error = null
      } catch (failure) {
        status = "retrying"
        attempt += 1
        error = describe(failure)
      }

      emit()
    },

    async older() {
      if (!olderCursor || loadingOlder) return
      loadingOlder = true
      emit()

      try {
        const page = await transport.history({ before: olderCursor })
        apply(page)
        olderCursor = page.olderCursor
        hasOlder = page.hasMore
      } catch (failure) {
        error = describe(failure)
      } finally {
        loadingOlder = false
        emit()
      }
    },

    async send(body: string, replyToId?: string) {
      const text = normalizeMessageBody(body)
      if (text === "") return

      const draft: PendingMessage = {
        ref: `borrador-${crypto.randomUUID()}`,
        body: text,
        replyToId: replyToId ?? null,
        failed: false,
      }
      pending = [...pending, draft]
      emit()

      await deliver(draft)
    },

    async retry(ref: string) {
      const draft = pending.find((entry) => entry.ref === ref)
      if (!draft) return

      draft.failed = false
      emit()
      await deliver(draft)
    },

    async edit(messageId: string, body: string) {
      const text = normalizeMessageBody(body)
      if (text === "") return

      try {
        const message = await transport.edit(messageId, text)
        messages = mergeMessages(messages, [message])
        error = null
      } catch (failure) {
        error = describe(failure)
      }
      emit()
    },

    async remove(messageId: string) {
      try {
        await transport.remove(messageId)
        messages = messages.filter((message) => message.id !== messageId)
        error = null
      } catch (failure) {
        error = describe(failure)
      }
      emit()
    },

    async markRead() {
      if (unread === 0) return
      try {
        await transport.markRead()
        unread = 0
      } catch (failure) {
        error = describe(failure)
      }
      emit()
    },

    snapshot: build,
  }

  /**
   * Entrega un borrador.
   *
   * Al confirmarse, el borrador se retira y entra el mensaje persistido: es lo que evita verlo dos
   * veces. Al fallar **no se revierte** —el texto se queda donde está, marcado—, porque tirar lo
   * que alguien acaba de escribir es la peor manera de contarle que hubo un problema.
   */
  async function deliver(draft: PendingMessage): Promise<void> {
    try {
      const sent = await transport.send({
        body: draft.body,
        clientRef: draft.ref,
        ...(draft.replyToId ? { replyToId: draft.replyToId } : {}),
      })

      messages = mergeMessages(messages, [sent.message])
      pending = pending.filter((entry) => entry.ref !== (sent.clientRef ?? draft.ref))
      error = null
    } catch (failure) {
      draft.failed = true
      error = describe(failure)
    }

    emit()
  }

  emit()
  return store
}

function describe(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure)
}

// ─── El transporte de hoy: consulta periódica ────────────────────────────────

/**
 * Consulta periódica contra la API.
 *
 * No es la conexión persistente que pide la spec —ver `HALLAZGOS.md` H-60—, pero cumple el mismo
 * contrato: pregunta desde donde se quedó y devuelve lo escrito, editado y borrado desde entonces.
 * Sustituirlo es escribir otro `ChatTransport`.
 */
export function createPollingTransport(base: string): ChatTransport {
  return {
    history: (options) =>
      api<ConversationPage>(
        `${base}/messages${options.before ? `?before=${encodeURIComponent(options.before)}` : ""}`,
      ),
    updates: (since) =>
      api<ConversationPage>(`${base}/messages?since=${encodeURIComponent(since)}`),
    send: (input) => api<SentMessage>(`${base}/messages`, { method: "POST", body: input }),
    edit: (messageId, body) =>
      api<ChatMessage>(`${base}/messages/${messageId}`, { method: "PATCH", body: { body } }),
    remove: (messageId) => api(`${base}/messages/${messageId}`, { method: "DELETE" }),
    markRead: () => api(`${base}/messages/read`, { method: "POST", body: {} }),
  }
}

// ─── El cableado con React ───────────────────────────────────────────────────

export interface OrderChat extends ChatSnapshot {
  readonly send: (body: string) => void
  readonly retry: (ref: string) => void
  readonly edit: (messageId: string, body: string) => void
  readonly remove: (messageId: string) => void
  readonly markRead: () => void
  readonly older: () => void
}

/**
 * Engancha la conversación a un componente.
 *
 * El compás lo lleva el hook y no el núcleo: así el núcleo se prueba llamando a `poll()` sin
 * relojes de mentira, y aquí sólo queda decidir **cuándo** se llama. Se llama antes si la pestaña
 * está a la vista, y se espacia progresivamente mientras la red no conteste.
 */
export function useOrderChat(options: {
  readonly base: string
  readonly viewerId: string
  readonly interval?: number
  readonly transport?: ChatTransport
}): OrderChat {
  const { base, viewerId, interval = 4_000 } = options

  const [snapshot, setSnapshot] = useState<ChatSnapshot>(() => ({
    timeline: [],
    side: "provider",
    unread: 0,
    status: "loading",
    attempt: 0,
    hasOlder: false,
    loadingOlder: false,
    error: null,
  }))

  /**
   * El almacén, atado a **su** conversación.
   *
   * Pasar de un pedido a otro reutiliza este componente —el enrutador no lo desmonta si ocupa el
   * mismo sitio del árbol—, y un almacén que sobreviviera a ese salto enseñaría los mensajes del
   * pedido anterior hasta que la primera carga los sustituyera. Se compara la dirección y se
   * empieza de cero cuando cambia.
   */
  const store = useRef<{ base: string; chat: ChatStore } | null>(null)
  const transport = options.transport
  if (!store.current || store.current.base !== base) {
    store.current = {
      base,
      chat: createChatStore({
        transport: transport ?? createPollingTransport(base),
        viewerId,
        notify: setSnapshot,
      }),
    }
  }

  useEffect(() => {
    // El almacén de **esta** conversación, tomado una vez: así un compás que quedara en marcha no
    // puede acabar preguntando por el pedido anterior.
    const chat = store.current?.base === base ? store.current.chat : null
    if (!chat) return

    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      if (!alive) return
      await chat.poll()
      if (!alive) return
      // El espaciado sale del propio estado: mientras la red no conteste, se pregunta menos.
      const next = chat.snapshot()
      timer = setTimeout(tick, next.status === "retrying" ? backoffDelay(next.attempt) : interval)
    }

    void chat.open().then(() => {
      if (alive) timer = setTimeout(tick, interval)
    })

    // Volver a la pestaña es el momento en que alguien quiere ver lo que se perdió.
    const onVisible = () => {
      if (document.visibilityState === "visible") void chat.poll()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
    // Al montar y al cambiar de conversación: el compás no depende del estado.
  }, [base, interval])

  const send = useCallback((body: string) => void store.current?.chat.send(body), [])
  const retry = useCallback((ref: string) => void store.current?.chat.retry(ref), [])
  const edit = useCallback(
    (messageId: string, body: string) => void store.current?.chat.edit(messageId, body),
    [],
  )
  const remove = useCallback((messageId: string) => void store.current?.chat.remove(messageId), [])
  const markRead = useCallback(() => void store.current?.chat.markRead(), [])
  const older = useCallback(() => void store.current?.chat.older(), [])

  return { ...snapshot, send, retry, edit, remove, markRead, older }
}
