/**
 * La bandeja, las preferencias y los dispositivos.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md` y la rebanada 09.
 *
 * Todo lo de aquí es **del usuario, no de la empresa**: su bandeja, sus canales, sus navegadores. Por
 * eso ninguna ruta declara permiso y ninguna cuelga de `:companyId` —un permiso sólo significa algo
 * dentro de una empresa, y esto no lo está—. Lo que acota es la identidad, y la hace cumplir el
 * motor: la política de las tres tablas es «las mías».
 *
 * ## Contador de no leídas y aviso de novedades no son lo mismo
 *
 * El contador dice cuántas quedan por leer. El aviso de novedades dice cuántas **llegaron desde que
 * cerró la bandeja**, que es otra pregunta: una sin leer de hace un mes ya la vio pasar. De ahí que
 * haga falta guardar cuándo la abrió por última vez, y no baste con contar.
 */

import {
  buildPage,
  ForbiddenError,
  isActivityMessageKey,
  NotFoundError,
  newId,
  type Page,
} from "@tfv/contracts"
import { withRequester } from "@tfv/db"
import { notificationDeliveries, notificationPreferences, pushDevices, users } from "@tfv/db/schema"
import { and, count, desc, eq, gt, isNotNull, isNull, ne } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { type Category, CHANNELS, type Channel, configuredChannels } from "./delivery.ts"

export type InboxFilter = "unread" | "read" | "archived" | "all"

export interface InboxItem {
  readonly id: string
  readonly kind: string
  /** El nombre de la entidad afectada. Es dato, así que viaja escrito. */
  readonly title: string
  /**
   * Qué pasó, como clave del catálogo y sus parámetros.
   *
   * No viaja redactado: el sobre se pinta en el navegador de quien lo lee, y es allí donde se sabe
   * en qué idioma (`HALLAZGOS.md` H-153).
   */
  readonly bodyKey: string
  readonly bodyParams: Record<string, string | number>
  readonly url: string
  readonly payload: Record<string, unknown>
  readonly readAt: Date | null
  readonly archivedAt: Date | null
  readonly createdAt: Date
}

export interface InboxCounts {
  readonly unread: number
  /** Cuántas llegaron desde la última vez que abrió la bandeja. */
  readonly news: number
}

/**
 * La bandeja de quien pregunta, de más reciente a más antigua.
 *
 * Se ve lo encolado y lo entregado. Una entrega que espera al despachador **ya existe** para su
 * destinatario: esconderla hasta que un trabajo la marque sería una bandeja que va por detrás de lo
 * que pasó. Lo que no se ve es lo que se saltó por preferencia, que es constancia de que no se
 * envió, no un aviso.
 */
export async function listInbox(
  actor: Actor,
  filter: InboxFilter,
  page: number,
  limit: number,
): Promise<Page<InboxItem>> {
  return withRequester(actor, async (tx) => {
    const where = and(
      eq(notificationDeliveries.recipientId, actor.userId),
      eq(notificationDeliveries.channel, "inbox"),
      ne(notificationDeliveries.status, "skipped_by_preference"),
      ...conditionsFor(filter),
    )

    const rows = await tx
      .select()
      .from(notificationDeliveries)
      .where(where)
      .orderBy(desc(notificationDeliveries.createdAt), desc(notificationDeliveries.id))
      .limit(limit)
      .offset((page - 1) * limit)

    const [total] = await tx.select({ value: count() }).from(notificationDeliveries).where(where)

    return buildPage(rows.map(toItem), total?.value ?? 0, page, limit)
  })
}

function conditionsFor(filter: InboxFilter) {
  switch (filter) {
    case "unread":
      return [isNull(notificationDeliveries.archivedAt), isNull(notificationDeliveries.readAt)]
    case "read":
      return [isNull(notificationDeliveries.archivedAt), isNotNull(notificationDeliveries.readAt)]
    case "archived":
      return [isNotNull(notificationDeliveries.archivedAt)]
    case "all":
      return [isNull(notificationDeliveries.archivedAt)]
  }
}

/** El contador de no leídas y el aviso de novedades. */
export async function inboxCounts(actor: Actor): Promise<InboxCounts> {
  return withRequester(actor, async (tx) => {
    const [sinLeer] = await tx
      .select({ value: count() })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.recipientId, actor.userId),
          eq(notificationDeliveries.channel, "inbox"),
          ne(notificationDeliveries.status, "skipped_by_preference"),
          isNull(notificationDeliveries.archivedAt),
          isNull(notificationDeliveries.readAt),
        ),
      )

    const [perfil] = await tx
      .select({ inboxOpenedAt: users.inboxOpenedAt })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1)

    const desde = perfil?.inboxOpenedAt ?? null

    // Sin haberla abierto nunca, todo lo que hay es novedad.
    const [novedades] = await tx
      .select({ value: count() })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.recipientId, actor.userId),
          eq(notificationDeliveries.channel, "inbox"),
          ne(notificationDeliveries.status, "skipped_by_preference"),
          isNull(notificationDeliveries.archivedAt),
          desde ? gt(notificationDeliveries.createdAt, desde) : undefined,
        ),
      )

    return { unread: sinLeer?.value ?? 0, news: novedades?.value ?? 0 }
  })
}

/**
 * Marca la bandeja como abierta, y devuelve el contador ya sin novedades.
 *
 * El requisito dice que el indicador «se reinicia cuando el contador disminuye». Se reinicia al
 * abrirla, que es lo que de verdad significa haberlas visto pasar: leer una a una no es la única
 * forma de haberse enterado.
 */
export async function openInbox(actor: Actor): Promise<InboxCounts> {
  await withRequester(actor, async (tx) => {
    await tx.update(users).set({ inboxOpenedAt: new Date() }).where(eq(users.id, actor.userId))
  })

  return inboxCounts(actor)
}

/** Marca una notificación como leída o como no leída. */
export async function setRead(actor: Actor, id: string, read: boolean): Promise<InboxItem> {
  return patch(actor, id, { readAt: read ? new Date() : null })
}

/** Archiva o desarchiva. Archivar la saca de las activas y no la borra. */
export async function setArchived(actor: Actor, id: string, archived: boolean): Promise<InboxItem> {
  return patch(actor, id, { archivedAt: archived ? new Date() : null })
}

/**
 * Escribe **sólo** el estado de lectura o de archivo.
 *
 * La política de la tabla acota la fila —«la mía»— y no puede acotar las columnas, porque una
 * política es por fila. Que no se toque nada más lo sostiene esta función, y por eso es la única
 * que escribe aquí.
 */
async function patch(
  actor: Actor,
  id: string,
  values: { readAt?: Date | null; archivedAt?: Date | null },
): Promise<InboxItem> {
  return withRequester(actor, async (tx) => {
    const [row] = await tx
      .update(notificationDeliveries)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(notificationDeliveries.id, id),
          eq(notificationDeliveries.recipientId, actor.userId),
          eq(notificationDeliveries.channel, "inbox"),
        ),
      )
      .returning()

    if (!row) throw new NotFoundError("La notificación no existe")
    return toItem(row)
  })
}

function toItem(row: typeof notificationDeliveries.$inferSelect): InboxItem {
  const payload = row.payload ?? {}

  return {
    id: row.id,
    kind: row.kind,
    title: texto(payload.title),
    bodyKey: isActivityMessageKey(payload.bodyKey) ? payload.bodyKey : "",
    bodyParams: parametros(payload.bodyParams),
    url: typeof payload.url === "string" ? payload.url : "/",
    payload,
    readAt: row.readAt,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
  }
}

/**
 * Los parámetros del aviso, saneados uno a uno.
 *
 * «El cuerpo SHALL sanearse de cualquier marcado antes de mostrarse.» Ahora el cuerpo es una frase
 * de nuestro catálogo con huecos, así que **el marcado sólo puede entrar por los huecos**: el
 * nombre de un producto que alguien escribió con negritas, el correo de un miembro. Se sanea aquí,
 * al leer, y no al escribir: lo guardado es el dato de la entidad tal y como la persona lo escribió.
 *
 * Lo que no sea texto ni número se descarta en lugar de convertirse. Un objeto interpolado en una
 * frase se lee «[object Object]», y prefiero un hueco vacío a esa cadena en la bandeja de alguien.
 */
function parametros(value: unknown): Record<string, string | number> {
  if (typeof value !== "object" || value === null) return {}

  const limpios: Record<string, string | number> = {}
  for (const [clave, valor] of Object.entries(value as Record<string, unknown>)) {
    if (typeof valor === "number") limpios[clave] = valor
    else if (typeof valor === "string") limpios[clave] = texto(valor)
  }

  return limpios
}

/**
 * Un texto sin marcado.
 *
 * Se quitan etiquetas y se compactan los espacios que dejan.
 */
export function texto(value: unknown): string {
  if (typeof value !== "string") return ""

  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// ─── Preferencias ────────────────────────────────────────────────────────────

export interface PreferenceRecord {
  readonly category: Category
  readonly channel: Channel
  readonly enabled: boolean
  /** Falso cuando el canal no se puede apagar: lo crítico de cuenta y la propia bandeja. */
  readonly editable: boolean
}

export const CATEGORIES: readonly Category[] = ["account", "activity", "billing", "stock"]

/**
 * Las preferencias de quien pregunta, con las que nunca ha tocado incluidas.
 *
 * Devolver sólo las guardadas obligaría a la interfaz a saber cuál es el valor por omisión, y ése es
 * el tipo de conocimiento que acaba divergiendo entre el navegador y el servidor.
 */
export async function listPreferences(actor: Actor): Promise<readonly PreferenceRecord[]> {
  const guardadas = await withRequester(actor, async (tx) =>
    tx
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, actor.userId)),
  )

  const porClave = new Map(guardadas.map((row) => [`${row.category}:${row.channel}`, row.enabled]))

  return CATEGORIES.flatMap((category) =>
    CHANNELS.map((channel) => ({
      category,
      channel,
      enabled: porClave.get(`${category}:${channel}`) ?? true,
      editable: isEditable(category, channel),
    })),
  )
}

/**
 * La bandeja no se apaga, y lo crítico de cuenta tampoco sale del correo.
 *
 * Lo segundo lo exige la spec —«las notificaciones críticas de cuenta SHALL entregarse siempre por
 * correo, con independencia de las preferencias»—; lo primero es decisión nuestra: la bandeja es el
 * registro de lo que pasó, y lo que se elige es si **además** se avisa hacia fuera.
 */
function isEditable(category: Category, channel: Channel): boolean {
  if (channel === "inbox") return false
  return !(category === "account" && channel === "email")
}

export async function setPreference(
  actor: Actor,
  category: Category,
  channel: Channel,
  enabled: boolean,
): Promise<PreferenceRecord> {
  if (!isEditable(category, channel)) {
    throw new ForbiddenError(
      channel === "inbox"
        ? "La bandeja no se puede apagar: es el registro de lo que ocurrió"
        : "Los avisos de cuenta se envían siempre por correo",
    )
  }

  await withRequester(actor, async (tx) => {
    await tx
      .insert(notificationPreferences)
      .values({ id: newId(), userId: actor.userId, category, channel, enabled })
      .onConflictDoUpdate({
        target: [
          notificationPreferences.userId,
          notificationPreferences.category,
          notificationPreferences.channel,
        ],
        set: { enabled, updatedAt: new Date() },
      })
  })

  return { category, channel, enabled, editable: true }
}

// ─── Dispositivos ────────────────────────────────────────────────────────────

export interface DeviceRecord {
  readonly id: string
  readonly userAgent: string | null
  readonly lastSeenAt: Date | null
  readonly createdAt: Date
}

/**
 * Registra el navegador que autorizó los avisos.
 *
 * **El mismo dispositivo dos veces no duplica**, y quien lo garantiza es el índice único sobre la
 * credencial: registrar de nuevo actualiza la fila que ya había. Comprobar antes de insertar dejaría
 * una ventana entre las dos cosas, y dos pestañas autorizando a la vez crearían dos filas.
 *
 * Si la credencial ya estaba a nombre de otra persona —un navegador compartido en el que alguien
 * cierra sesión y entra otro— pasa a ser de quien la registra ahora. Es la única lectura correcta:
 * el aviso llegaría a esa pantalla, y la pantalla ya es de otra persona.
 */
export async function registerDevice(
  actor: Actor,
  token: string,
  userAgent?: string,
): Promise<DeviceRecord> {
  return withRequester(actor, async (tx) => {
    const [row] = await tx
      .insert(pushDevices)
      .values({
        id: newId(),
        userId: actor.userId,
        token,
        userAgent: userAgent ?? null,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: pushDevices.token,
        set: {
          userId: actor.userId,
          userAgent: userAgent ?? null,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning()

    if (!row) throw new Error("el registro del dispositivo no devolvió fila")
    return toDevice(row)
  })
}

export async function listDevices(actor: Actor): Promise<readonly DeviceRecord[]> {
  return withRequester(actor, async (tx) => {
    const rows = await tx
      .select()
      .from(pushDevices)
      .where(eq(pushDevices.userId, actor.userId))
      .orderBy(desc(pushDevices.createdAt))

    return rows.map(toDevice)
  })
}

export async function revokeDevice(actor: Actor, id: string): Promise<void> {
  const borradas = await withRequester(actor, async (tx) =>
    tx
      .delete(pushDevices)
      .where(and(eq(pushDevices.id, id), eq(pushDevices.userId, actor.userId)))
      .returning({ id: pushDevices.id }),
  )

  if (borradas.length === 0) throw new NotFoundError("El dispositivo no existe")
}

function toDevice(row: typeof pushDevices.$inferSelect): DeviceRecord {
  return {
    id: row.id,
    userAgent: row.userAgent,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
  }
}

/** Los canales con proveedor, para que la pantalla no ofrezca lo que no puede cumplir. */
export function availableChannels(): readonly Channel[] {
  return configuredChannels()
}
