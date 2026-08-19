/**
 * La conversación de un pedido de almacén.
 *
 * Ver `openspec/specs/order-chat/spec.md`. Rebanada 16.
 *
 * Dos lados del mostrador —quien pidió el equipo y quien lo surte— hablando dentro del pedido, para
 * lo que siempre acaba haciendo falta: ajustar una cantidad, avisar de un retraso, confirmar una
 * recogida.
 *
 * ## Sin conexión persistente, y a propósito
 *
 * La spec pide conexión persistente autenticada con difusión entre instancias. Aquí no la hay: el
 * transporte que la sostendría —canal de tiempo real gestionado o notificación entre instancias del
 * motor de datos— exige configuración externa que este entorno no tiene, y media conexión a medio
 * funcionar es peor que ninguna. Ver `HALLAZGOS.md` H-60.
 *
 * Lo que entra en su lugar es **todo lo que no depende del transporte**, y es la mayor parte: el
 * historial con cursor, el envío optimista con su reconciliación, los acuses por lado, la edición y
 * el borrado de lo propio, los mensajes del sistema y la pertenencia al pedido. Quien lo consume
 * pregunta por lo nuevo desde donde se quedó, que es exactamente lo que hará al reconectar el día
 * que haya conexión.
 *
 * ## Dos cursores, porque son dos preguntas distintas
 *
 * - **Hacia atrás** —el historial— se camina por identificador. Los identificadores son ordenables
 *   por tiempo, así que el más antiguo que ya tienes es el sitio exacto por donde seguir.
 * - **Hacia adelante** —lo nuevo— se camina por instante de modificación, porque no basta con los
 *   mensajes nuevos: hay que enterarse de los que se **editaron** y los que se **borraron**, y ésos
 *   son viejos. El instante se compara truncado al milisegundo, que es la precisión que sobrevive
 *   al viaje de ida y vuelta; comparar el valor crudo repetiría el mismo mensaje en cada consulta.
 *
 * ## Aislamiento
 *
 * Las dos capas de siempre. El manejador comprueba que el pedido es de este almacén y que el
 * mensaje es de este pedido; el motor, con la política de `warehouse_order_messages`, no enseña la
 * conversación a quien no es parte del pedido — y ésa es la que sigue en pie si alguna vez se
 * escribe una ruta que se olvide de la primera.
 */

import {
  type ChatCursor,
  type ChatSide,
  canEditMessage,
  decodeChatCursor,
  encodeChatCursor,
  ForbiddenError,
  isId,
  MESSAGE_MAX_LENGTH,
  NotFoundError,
  newId,
  normalizeMessageBody,
  oppositeSide,
  UnprocessableError,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import { users, warehouseOrderMessages, warehouseOrders, warehouses } from "@tfv/db/schema"
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { loadWarehouse } from "./warehouses.ts"

/** Cuántos mensajes por vuelta. Una pantalla de conversación no dibuja más. */
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export interface ChatMessageRecord {
  readonly id: string
  readonly orderId: string
  readonly side: ChatSide
  readonly authorId: string | null
  /**
   * Quién lo escribió, si quien pregunta puede saberlo.
   *
   * Nulo cuando el motor no le enseña esa cuenta: un usuario se lee a sí mismo y a quien comparte
   * empresa con él, así que **el otro lado no tiene nombre**. No es un hueco a tapar: la pantalla
   * lo sustituye por el lado, que es lo que de verdad importa aquí —«el almacén», «el cliente»—.
   */
  readonly authorName: string | null
  readonly body: string
  readonly replyToId: string | null
  readonly readByClientAt: Date | null
  readonly readByProviderAt: Date | null
  readonly editedAt: Date | null
  readonly deletedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface ConversationPage {
  readonly items: readonly ChatMessageRecord[]
  /** El lado por el que mira quien pregunta. La pantalla lo necesita para saber qué es «mío». */
  readonly side: ChatSide
  readonly hasMore: boolean
  /** El identificador por el que seguir hacia atrás. Nulo cuando ya no queda historial. */
  readonly olderCursor: string | null
  /** Por dónde pedir lo nuevo la próxima vez. */
  readonly syncCursor: string
  /** Mensajes del otro lado que este lado no ha leído. */
  readonly unread: number
}

export interface ConversationQuery {
  /** Identificador del mensaje más antiguo que ya se tiene. Pide el trozo anterior. */
  readonly before?: string | undefined
  /** Cursor de sincronización. Pide lo escrito, editado o borrado desde entonces. */
  readonly since?: string | undefined
  readonly limit?: number | undefined
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/**
 * Lee la conversación.
 *
 * Con `since` devuelve **incrementos** en orden natural —lo más antiguo primero—, incluidos los
 * mensajes editados y los borrados, porque quien los tenga en pantalla necesita enterarse. Sin él
 * devuelve **historial**, del más reciente al más antiguo, ya sin lo borrado.
 */
export async function readConversation(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  orderId: string,
  query: ConversationQuery = {},
): Promise<ConversationPage> {
  const limit = boundLimit(query.limit)

  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const order = await loadOrder(tx, warehouseId, orderId)
    const side = await requireSide(tx, order)

    const rows =
      query.since === undefined
        ? await readHistory(tx, orderId, query.before, limit)
        : await readUpdates(tx, orderId, decodeChatCursor(query.since), limit)

    const items = rows.map(toRecord)
    const hasMore = items.length === limit
    const last = items.at(-1)

    return {
      items,
      side,
      hasMore,
      olderCursor: query.since === undefined && hasMore ? (last?.id ?? null) : null,
      syncCursor: await syncPoint(tx, orderId, query, items),
      unread: await countUnread(tx, orderId, side),
    }
  })
}

/** El trozo anterior del historial, del más reciente al más antiguo. */
function readHistory(tx: Transaction, orderId: string, before: string | undefined, limit: number) {
  return selectMessages(tx)
    .where(
      and(
        eq(warehouseOrderMessages.orderId, orderId),
        isNull(warehouseOrderMessages.deletedAt),
        // Los identificadores ordenan por tiempo: el más antiguo que ya se tiene es el sitio
        // exacto por donde seguir, sin instantes que redondear ni empates que deshacer.
        // Lo que no tiene forma de identificador **se ignora**: llega a la base como uuid
        // inválido y la respuesta sería un 500 sobre una petición que sólo estaba mal escrita.
        before && isId(before) ? lt(warehouseOrderMessages.id, before) : undefined,
      ),
    )
    .orderBy(desc(warehouseOrderMessages.id))
    .limit(limit)
}

/**
 * Lo escrito, editado o borrado desde el cursor.
 *
 * El instante se compara **truncado al milisegundo** porque es la precisión con la que el cursor
 * vuelve: la base guarda microsegundos y el viaje por el transporte los pierde. Comparando el valor
 * crudo, un mensaje cuyos microsegundos no son cero quedaría siempre por delante de su propio
 * cursor y se entregaría en cada consulta, para siempre.
 */
function readUpdates(tx: Transaction, orderId: string, since: ChatCursor | null, limit: number) {
  return selectMessages(tx)
    .where(
      and(
        eq(warehouseOrderMessages.orderId, orderId),
        since
          ? sql`(date_trunc('milliseconds', ${warehouseOrderMessages.updatedAt}), ${warehouseOrderMessages.id}) > (${since.at.toISOString()}::timestamptz, ${since.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(
      sql`date_trunc('milliseconds', ${warehouseOrderMessages.updatedAt}) asc`,
      asc(warehouseOrderMessages.id),
    )
    .limit(limit)
}

function selectMessages(tx: Transaction) {
  return (
    tx
      .select({
        message: warehouseOrderMessages,
        authorName: users.name,
        authorLastname: users.lastname,
        authorUsername: users.username,
      })
      .from(warehouseOrderMessages)
      // A la izquierda porque **el otro lado no se lee**: la política de identidad enseña las cuentas
      // de quien comparte empresa, y las dos partes de un pedido no la comparten.
      .leftJoin(users, eq(users.id, warehouseOrderMessages.authorId))
      .$dynamic()
  )
}

/**
 * Hasta dónde ha visto quien pregunta.
 *
 * En incrementos avanza con lo entregado, y se queda quieto cuando no hubo nada: avanzarlo hasta
 * «ahora» sin haber leído nada abriría la ventana por la que se pierde un mensaje que estaba
 * confirmándose.
 *
 * En historial es el punto más alto de **toda** la conversación, no el de la página: lo que no se
 * ha cargado tampoco hace falta seguirlo, y se cargará ya al día cuando se pida hacia atrás.
 */
async function syncPoint(
  tx: Transaction,
  orderId: string,
  query: ConversationQuery,
  items: readonly ChatMessageRecord[],
): Promise<string> {
  if (query.since !== undefined) {
    const last = items.at(-1)
    return last ? encodeChatCursor({ at: last.updatedAt, id: last.id }) : query.since
  }

  const [top] = await tx
    .select({ id: warehouseOrderMessages.id, updatedAt: warehouseOrderMessages.updatedAt })
    .from(warehouseOrderMessages)
    .where(eq(warehouseOrderMessages.orderId, orderId))
    .orderBy(
      sql`date_trunc('milliseconds', ${warehouseOrderMessages.updatedAt}) desc`,
      desc(warehouseOrderMessages.id),
    )
    .limit(1)

  // Sin mensajes no hay punto al que volver, y el vacío significa «desde el principio». Inventar
  // uno con el reloj de este proceso escondería lo que se escriba con un reloj ligeramente atrasado.
  return top ? encodeChatCursor({ at: top.updatedAt, id: top.id }) : ""
}

/** Lo que este lado tiene sin leer. Es por lado y no por persona: ver la spec. */
async function countUnread(tx: Transaction, orderId: string, side: ChatSide): Promise<number> {
  const other = oppositeSide(side)
  if (!other) return 0

  const [row] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(warehouseOrderMessages)
    .where(
      and(
        eq(warehouseOrderMessages.orderId, orderId),
        eq(warehouseOrderMessages.side, other),
        isNull(warehouseOrderMessages.deletedAt),
        unreadBy(side),
      ),
    )

  return row?.value ?? 0
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export interface SendMessageInput {
  readonly body: string
  readonly replyToId?: string | undefined
  /**
   * La referencia temporal de quien envía.
   *
   * Vuelve tal cual junto al mensaje persistido, y **sólo a quien envió**: es lo que permite pintar
   * el mensaje antes de que el servidor lo confirme y sustituirlo después sin duplicarlo. A otro
   * participante no le sirve de nada y le diría cómo llama quien escribe a sus borradores.
   */
  readonly clientRef?: string | undefined
}

export interface SentMessage {
  readonly message: ChatMessageRecord
  readonly clientRef: string | null
}

export async function sendMessage(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  orderId: string,
  input: SendMessageInput,
): Promise<SentMessage> {
  const body = normalizeMessageBody(input.body)
  if (body === "") throw new UnprocessableError("Un mensaje sin texto no se envía")

  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const order = await loadOrder(tx, warehouseId, orderId)
    const side = await requireSide(tx, order)

    // La respuesta ha de ser a un mensaje **de esta conversación**. Sin comprobarlo, el hilo
    // apuntaría a un mensaje de otro pedido y la pantalla lo pediría sin poder verlo nunca.
    if (input.replyToId) await requireMessage(tx, orderId, input.replyToId)

    const now = new Date()
    const [row] = await tx
      .insert(warehouseOrderMessages)
      .values({
        id: newId(),
        orderId,
        side,
        authorId: actor.userId,
        body,
        replyToId: input.replyToId ?? null,
        // Los instantes los pone la aplicación y no la base: el cursor viaja en milisegundos, y un
        // valor con microsegundos no vuelve igual que se fue.
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (!row) throw new Error("El mensaje no se insertó")

    return {
      message: toRecord({
        message: row,
        authorName: null,
        authorLastname: null,
        authorUsername: null,
      }),
      clientRef: input.clientRef ?? null,
    }
  })
}

export async function editMessage(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  orderId: string,
  messageId: string,
  body: string,
): Promise<ChatMessageRecord> {
  const text = normalizeMessageBody(body)
  if (text === "") throw new UnprocessableError("Un mensaje sin texto no se envía")

  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const order = await loadOrder(tx, warehouseId, orderId)
    const side = await requireSide(tx, order)
    const message = await requireMessage(tx, orderId, messageId)

    if (!canEditMessage(message, { userId: actor.userId, side })) {
      throw new ForbiddenError("Sólo se editan los mensajes propios")
    }

    const now = new Date()
    const [row] = await tx
      .update(warehouseOrderMessages)
      .set({ body: text, editedAt: now, updatedAt: now })
      .where(eq(warehouseOrderMessages.id, messageId))
      .returning()

    if (!row) throw new Error("El mensaje no se actualizó")
    return toRecord({ message: row, authorName: null, authorLastname: null, authorUsername: null })
  })
}

/**
 * Borra un mensaje propio.
 *
 * Baja lógica: la fila se queda con su cuerpo y se marca. Lo que desaparece es el mensaje de la
 * conversación —el historial ya no lo trae y el cuerpo no vuelve a viajar—, no el rastro de que
 * alguien escribió algo y lo retiró.
 */
export async function deleteMessage(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  orderId: string,
  messageId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const order = await loadOrder(tx, warehouseId, orderId)
    const side = await requireSide(tx, order)
    const message = await requireMessage(tx, orderId, messageId)

    if (!canEditMessage(message, { userId: actor.userId, side })) {
      throw new ForbiddenError("Sólo se borran los mensajes propios")
    }

    const now = new Date()
    await tx
      .update(warehouseOrderMessages)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(warehouseOrderMessages.id, messageId))
  })
}

export interface ReadReceipt {
  readonly read: number
  readonly unread: number
  readonly syncCursor: string
}

/**
 * Marca como leído lo pendiente **del lado** de quien lee.
 *
 * Que lea una persona lo marca para todos los suyos, que es lo que la spec pide y lo que el cliente
 * quiere saber: si *el almacén* lo vio, no quién concretamente.
 *
 * El instante de modificación se mueve con el acuse, y por eso el otro lado se entera por el mismo
 * cursor con el que se entera de los mensajes. Sin eso, el acuse sería invisible hasta que alguien
 * escribiera algo.
 */
export async function markConversationRead(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  orderId: string,
): Promise<ReadReceipt> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const order = await loadOrder(tx, warehouseId, orderId)
    const side = await requireSide(tx, order)
    const other = oppositeSide(side)

    if (!other) return { read: 0, unread: 0, syncCursor: await syncPoint(tx, orderId, {}, []) }

    const now = new Date()
    const marked = await tx
      .update(warehouseOrderMessages)
      .set({
        ...(side === "client" ? { readByClientAt: now } : { readByProviderAt: now }),
        updatedAt: now,
      })
      .where(
        and(
          eq(warehouseOrderMessages.orderId, orderId),
          eq(warehouseOrderMessages.side, other),
          isNull(warehouseOrderMessages.deletedAt),
          unreadBy(side),
        ),
      )
      .returning({ id: warehouseOrderMessages.id })

    return {
      read: marked.length,
      unread: await countUnread(tx, orderId, side),
      syncCursor: await syncPoint(tx, orderId, {}, []),
    }
  })
}

// ─── Mensajes del sistema ────────────────────────────────────────────────────

/**
 * Publica un hito del pedido en su conversación.
 *
 * Se llama **dentro de la transacción que cambia el pedido**: un aviso que se publicara aparte
 * podría quedar contando una aceptación que se revirtió.
 *
 * El texto va en español y se guarda tal cual. El modelo sólo tiene cuerpo libre, así que no hay
 * dónde guardar una clave que la interfaz traduzca — queda anotado en `HALLAZGOS.md` H-61.
 */
export async function publishSystemMessage(
  tx: Transaction,
  orderId: string,
  body: string,
): Promise<void> {
  const now = new Date()
  await tx.insert(warehouseOrderMessages).values({
    id: newId(),
    orderId,
    side: "system",
    authorId: null,
    body: normalizeMessageBody(body),
    createdAt: now,
    updatedAt: now,
  })
}

// ─── Interno ─────────────────────────────────────────────────────────────────

/**
 * Por qué lado entra quien pregunta.
 *
 * **Se lo pregunta al motor en lugar de calcularlo.** Si el almacén se le enseña, es quien surte;
 * si la contraparte del pedido es suya, es quien pidió. Las dos respuestas salen de las mismas
 * políticas que gobiernan todo lo demás, así que no pueden decir una cosa distinta de la que dice
 * el aislamiento.
 *
 * Nulo cuando no es de ninguno de los dos lados — que no debería ocurrir, porque entonces el pedido
 * tampoco se le enseñaría.
 */
export async function resolveChatSide(
  tx: Transaction,
  order: { readonly warehouseId: string; readonly clientId: string | null },
): Promise<ChatSide | null> {
  const [own] = await tx
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.id, order.warehouseId), isNull(warehouses.deletedAt)))
    .limit(1)

  if (own) return "provider"

  if (order.clientId) {
    const rows = await tx.execute<{ mine: boolean }>(
      sql`select app.is_my_counterparty(${order.clientId}::uuid) as mine`,
    )
    if (rows[0]?.mine) return "client"
  }

  return null
}

async function requireSide(
  tx: Transaction,
  order: { readonly warehouseId: string; readonly clientId: string | null },
): Promise<ChatSide> {
  const side = await resolveChatSide(tx, order)
  // Mismo `404` que un pedido inexistente: quien no es parte no debe poder distinguir «no existe»
  // de «existe y no es tuyo».
  if (!side) throw new NotFoundError("El pedido no existe en este almacén")
  return side
}

/**
 * El pedido, comprobando que es **de este almacén**.
 *
 * Se lee aquí y no en el módulo de pedidos para que la dependencia vaya en un solo sentido: el
 * ciclo del pedido publica hitos en la conversación, así que la conversación no puede depender de
 * él sin cerrar un círculo entre los dos.
 */
async function loadOrder(tx: Transaction, warehouseId: string, orderId: string) {
  const [order] = await tx
    .select({
      id: warehouseOrders.id,
      warehouseId: warehouseOrders.warehouseId,
      clientId: warehouseOrders.clientId,
    })
    .from(warehouseOrders)
    .where(
      and(
        eq(warehouseOrders.id, orderId),
        eq(warehouseOrders.warehouseId, warehouseId),
        isNull(warehouseOrders.deletedAt),
      ),
    )
    .limit(1)

  if (!order) throw new NotFoundError("El pedido no existe en este almacén")
  return order
}

/** El mensaje, comprobando que es **de este pedido**. Lo demás es alcanzar conversaciones ajenas. */
async function requireMessage(tx: Transaction, orderId: string, messageId: string) {
  const [message] = await tx
    .select()
    .from(warehouseOrderMessages)
    .where(
      and(
        eq(warehouseOrderMessages.id, messageId),
        eq(warehouseOrderMessages.orderId, orderId),
        isNull(warehouseOrderMessages.deletedAt),
      ),
    )
    .limit(1)

  if (!message) throw new NotFoundError("El mensaje no existe en esta conversación")
  return message
}

function unreadBy(side: ChatSide) {
  return side === "client"
    ? isNull(warehouseOrderMessages.readByClientAt)
    : isNull(warehouseOrderMessages.readByProviderAt)
}

function boundLimit(limit: number | undefined): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

interface MessageRow {
  readonly message: typeof warehouseOrderMessages.$inferSelect
  readonly authorName: string | null
  readonly authorLastname: string | null
  readonly authorUsername: string | null
}

function toRecord(row: MessageRow): ChatMessageRecord {
  const { message } = row
  const full = [row.authorName, row.authorLastname].filter(Boolean).join(" ").trim()

  return {
    id: message.id,
    orderId: message.orderId,
    side: message.side,
    authorId: message.authorId,
    authorName: full || row.authorUsername || null,
    // Un mensaje borrado viaja **sin cuerpo**: quien lo tenía en pantalla necesita saber que
    // desapareció, no volver a leerlo.
    body: message.deletedAt ? "" : message.body,
    replyToId: message.replyToId,
    readByClientAt: message.readByClientAt,
    readByProviderAt: message.readByProviderAt,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  }
}

export { MESSAGE_MAX_LENGTH }
