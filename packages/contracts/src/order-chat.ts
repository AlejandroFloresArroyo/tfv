/**
 * La conversación del pedido, en lo que el servidor y el navegador comparten.
 *
 * Ver `openspec/specs/order-chat/spec.md`. Rebanada 16.
 *
 * Aquí sólo vive lo que las dos orillas tienen que entender **igual**: los dos lados del mostrador,
 * el cursor con el que se recupera lo perdido y quién puede tocar qué. Con dos copias, el día que
 * una cambie la pantalla ofrecería un botón que el servidor rechaza, o pediría el historial desde
 * un punto que el servidor lee de otra manera.
 *
 * ## Por qué el cursor lleva instante **e** identificador
 *
 * El instante solo no basta: dos mensajes del mismo milisegundo son indistinguibles, y un cursor
 * que no sabe cuál de los dos ya entregó o repite uno o se salta el otro. Saltárselo es perder un
 * mensaje, que es lo único que una conversación no puede hacer.
 */

/** Los dos lados del mostrador, más los avisos que publica el propio sistema. */
export const CHAT_SIDES = ["client", "provider", "system"] as const
export type ChatSide = (typeof CHAT_SIDES)[number]

/** Lo que un lado escribe se lee del otro. El sistema no espera respuesta de nadie. */
export function oppositeSide(side: ChatSide): ChatSide | null {
  if (side === "client") return "provider"
  if (side === "provider") return "client"
  return null
}

/** Tanto como cabe en una observación de pedido. Lo de más largo es un documento, no un mensaje. */
export const MESSAGE_MAX_LENGTH = 4000

/**
 * El cuerpo tal y como se guarda.
 *
 * Recortar en el cliente y en el servidor con la misma función es lo que evita que el botón de
 * enviar se habilite con un mensaje que el servidor va a rechazar por vacío.
 */
export function normalizeMessageBody(raw: string): string {
  return raw.trim().slice(0, MESSAGE_MAX_LENGTH)
}

// ─── Cursor ──────────────────────────────────────────────────────────────────

export interface ChatCursor {
  readonly at: Date
  readonly id: string
}

/** El identificador más pequeño posible. Abre la ventana por su principio. */
const MIN_ID = "00000000-0000-0000-0000-000000000000"

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** El cursor en el transporte: milisegundos, un punto, e identificador. */
export function encodeChatCursor(cursor: ChatCursor): string {
  return `${cursor.at.getTime()}.${cursor.id}`
}

/**
 * Lee un cursor recibido.
 *
 * **Lo que no se entiende vale nulo**, y quien lo recibe empieza por el principio. Adivinar un
 * instante haría desaparecer en silencio todo lo anterior a él, que es la peor forma de fallar que
 * tiene una conversación: sin error y sin mensajes.
 */
export function decodeChatCursor(raw: string): ChatCursor | null {
  const separator = raw.indexOf(".")
  if (separator <= 0) return null

  const millis = Number(raw.slice(0, separator))
  const id = raw.slice(separator + 1)

  if (!Number.isSafeInteger(millis) || millis < 0) return null
  if (!ID_PATTERN.test(id)) return null

  return { at: new Date(millis), id }
}

/**
 * Retrocede el cursor para volver a mirar una ventana ya mirada.
 *
 * Es lo que cierra la carrera entre escribir y leer. Una escritura que **confirma** después de que
 * la lectura tomó su instante nunca aparecería por delante del cursor, y quedaría por detrás para
 * siempre: el mensaje existe en la base y no llega a la pantalla de nadie.
 *
 * Volver a entregar un mensaje ya entregado no cuesta nada —quien lo recibe reconcilia por
 * identificador—, así que el solape es barato y la alternativa es perder mensajes.
 */
export function rewindChatCursor(raw: string, millis: number): string {
  const cursor = decodeChatCursor(raw)
  if (!cursor) return ""

  const at = new Date(Math.max(0, cursor.at.getTime() - millis))
  return encodeChatCursor({ at, id: MIN_ID })
}

// ─── Autoría ─────────────────────────────────────────────────────────────────

/** Quién mira la conversación: su cuenta y el lado por el que entra. */
export interface ChatParticipant {
  readonly userId: string
  readonly side: ChatSide
}

/** Lo mínimo de un mensaje para decidir si es de quien lo mira. */
export interface OwnableMessage {
  readonly side: ChatSide
  readonly authorId: string | null
  readonly deletedAt: Date | null
}

/**
 * ¿Puede editarlo quien lo mira?
 *
 * Se compara la **persona**, no el lado: los acuses de lectura son por lado porque a quien
 * pregunta le importa si *el almacén* lo vio, pero reescribir lo que dijo un compañero es otra
 * cosa. Un mensaje del sistema no lo edita nadie: es la constancia de un hito del pedido.
 */
export function canEditMessage(message: OwnableMessage, viewer: ChatParticipant): boolean {
  if (message.side === "system") return false
  if (message.deletedAt) return false
  return message.authorId !== null && message.authorId === viewer.userId
}

/** Lo mismo que editar: sólo los propios, y nunca los del sistema. */
export function canDeleteMessage(message: OwnableMessage, viewer: ChatParticipant): boolean {
  return canEditMessage(message, viewer)
}
