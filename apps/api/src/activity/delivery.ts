/**
 * A quién se avisa, por dónde, y qué pasa cuando el proveedor no está.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md` y la rebanada 09.
 *
 * ## La audiencia la decide el permiso
 *
 * «La misma clave de permiso que **autoriza** una acción **selecciona** a quién se le notifica.» En
 * la implementación anterior el catálogo de permisos sólo hacía lo segundo —era un selector de
 * audiencia con aspecto de control de acceso (`DEFECTS.md` S-07)—; desde la rebanada 05 hace lo
 * primero, y aquí vuelve a hacer lo segundo. Que sean la misma clave es lo que impide que alguien
 * reciba avisos de algo que no puede ver.
 *
 * ## Dos fases, y por qué
 *
 * | Fase | Dónde corre | Qué escribe |
 * |---|---|---|
 * | Reparto | En la transacción de la mutación | Una entrega de **bandeja** por destinatario |
 * | Entrega | En el despachador | Marca la de bandeja, y abre las de empuje y correo |
 *
 * La bandeja se escribe con la mutación porque su destino es nuestra propia base: no hay proveedor
 * que pueda estar caído, y una bandeja que tarda en aparecer es una bandeja en la que no se confía.
 * Lo que sale hacia fuera se decide después, y por dos motivos que no son el mismo:
 *
 * 1. **Las preferencias de otra persona no se pueden leer desde su transacción.** La política de
 *    `notification_preferences` es «las mías», y quien crea una cotización no es quien la recibe.
 *    Consultarlas en el reparto obligaría a abrirlas a media empresa.
 * 2. Un aviso por empuje o por correo **sí** depende de un tercero, y eso no puede colgar de una
 *    operación de negocio.
 *
 * ## Lo que aquí no está, y dónde está la costura
 *
 * **No hay proveedor de empuje ni de correo.** Los dos necesitan configuración externa —claves VAPID
 * o una cuenta de un servicio de correo— que este entorno no tiene, y fingirla habría dado tres
 * canales a medias en lugar de uno que funciona. La costura es `registerTransport`: el día que haya
 * proveedor, se registra y las entregas que ya están encoladas —las de recuperación de contraseña y
 * verificación de correo llevan encoladas desde la rebanada 04— empiezan a salir sin tocar nada más.
 *
 * Lo que **sí** está escrito de ese lado es *cuándo* se le habla al proveedor de una persona:
 * `syncRecipient` se llama antes del primer envío de cada pasada y cuando cambia el perfil. Eso es
 * decisión nuestra y se prueba con un transporte de mentira; lo que falta es la cuenta del otro lado
 * (`HALLAZGOS.md` H-155, que corrige el alcance que H-80 daba por bloqueado).
 *
 * Mientras no lo haya, una entrega de un canal sin transporte **se queda en la cola**. No se marca
 * fallida: no ha fallado nada, falta un proveedor, y llenar la lista de fallos de cosas que no son
 * fallos es la forma de que nadie vuelva a mirarla.
 */

import { newId, type PermissionKey } from "@tfv/contracts"
import { type Transaction, withElevated, withSystem } from "@tfv/db"
import {
  companyMembers,
  notificationDeliveries,
  notificationPreferences,
  roles,
  uploads,
  users,
} from "@tfv/db/schema"
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm"
import { enqueue } from "../jobs/queue.ts"
import { rootLogger } from "../runtime/logger.ts"

export type Channel = "inbox" | "push" | "email"

export const CHANNELS: readonly Channel[] = ["inbox", "push", "email"]

/**
 * Categorías de notificación, que es sobre lo que se elige canal.
 *
 * No son los tipos: nadie quiere decidir once veces si le avisan. La spec dice «por categoría» y
 * los tipos del catálogo caen en cuatro.
 */
export type Category = "account" | "activity" | "billing" | "stock"

/**
 * El catálogo de tipos de la spec, con su categoría y si es crítico de cuenta.
 *
 * **Lo crítico se entrega por correo pase lo que pase.** Un enlace de recuperación que no llega
 * porque alguien apagó los correos hace un año deja a la persona sin forma de entrar, y la
 * preferencia que lo apagó no se escribió pensando en esto.
 */
export const NOTIFICATION_KINDS: Readonly<
  Record<string, { readonly category: Category; readonly critical?: boolean }>
> = {
  welcome: { category: "account" },
  invitation: { category: "account", critical: true },
  temporary_access: { category: "account", critical: true },
  password_recovery: { category: "account", critical: true },
  email_verification: { category: "account", critical: true },
  email_change_verification: { category: "account", critical: true },
  prospect_acknowledged: { category: "account" },
  activity: { category: "activity" },
  stock_coherence: { category: "stock" },
  invoice_paid: { category: "billing" },
  invoice_upcoming: { category: "billing" },
  payment_failed: { category: "billing", critical: true },
  subscription_changed: { category: "billing" },
  subscription_ended: { category: "billing" },
}

export function categoryOf(kind: string): Category {
  return NOTIFICATION_KINDS[kind]?.category ?? "activity"
}

export function isCritical(kind: string): boolean {
  return NOTIFICATION_KINDS[kind]?.critical === true
}

// ─── Audiencia ───────────────────────────────────────────────────────────────

export interface AudienceInput {
  readonly companyId: string
  /** Las claves que la acción declara. Vacío: sólo los propietarios. */
  readonly permissions: readonly PermissionKey[]
  /** Quien actuó. No se avisa a sí mismo. */
  readonly exclude?: string | undefined
}

/**
 * Quién debe enterarse.
 *
 * Los propietarios **siempre**, tengan el rol que tengan —incluido uno vacío—, porque la propiedad
 * no es un permiso sino la vía por la que se eluden todos. Los demás, sólo si su rol concede
 * **todas** las claves declaradas: con dos permisos y uno concedido, no pertenece a la audiencia.
 *
 * La membresía desactivada no cuenta. Conserva el registro y pierde el acceso, y avisarle de algo
 * que ya no puede abrir es enseñarle una puerta cerrada.
 */
export async function audienceFor(
  tx: Transaction,
  input: AudienceInput,
): Promise<readonly string[]> {
  const rows = await tx
    .select({
      userId: companyMembers.userId,
      isOwner: companyMembers.isOwner,
      permissions: roles.permissions,
    })
    .from(companyMembers)
    .leftJoin(roles, eq(roles.id, companyMembers.roleId))
    .where(
      and(
        eq(companyMembers.companyId, input.companyId),
        eq(companyMembers.isActive, true),
        input.exclude ? ne(companyMembers.userId, input.exclude) : undefined,
      ),
    )

  const audiencia = rows.filter((row) => {
    if (row.isOwner) return true
    const granted = new Set(row.permissions ?? [])
    return input.permissions.length > 0 && input.permissions.every((key) => granted.has(key))
  })

  // Una persona puede aparecer una sola vez por empresa, pero el conjunto lo deja escrito.
  return [...new Set(audiencia.map((row) => row.userId))]
}

// ─── Reparto ─────────────────────────────────────────────────────────────────

export interface DeliveryInput {
  readonly recipients: readonly string[]
  readonly kind: string
  readonly activityId?: string | undefined
  readonly payload: Record<string, unknown>
}

/**
 * Deja una entrega de bandeja por destinatario, dentro de la transacción que llama.
 *
 * Es lo que hace que el aviso sea inseparable de lo que lo originó: si la mutación se revierte, no
 * queda ni el asiento ni el aviso.
 */
export async function enqueueInbox(tx: Transaction, input: DeliveryInput): Promise<number> {
  if (input.recipients.length === 0) return 0

  await tx.insert(notificationDeliveries).values(
    input.recipients.map((recipientId) => ({
      id: newId(),
      recipientId,
      channel: "inbox" as const,
      kind: input.kind,
      activityId: input.activityId ?? null,
      payload: input.payload,
    })),
  )

  return input.recipients.length
}

// ─── Transportes ─────────────────────────────────────────────────────────────

export interface Delivery {
  readonly id: string
  readonly recipientId: string | null
  readonly channel: Channel
  readonly kind: string
  readonly payload: Record<string, unknown>
  readonly attempts: number
}

/**
 * Los datos del destinatario que el proveedor necesita para poder dirigirse a él.
 *
 * Los cuatro que la spec nombra —nombre, correo, teléfono y avatar— y el identificador con el que
 * los relacionamos. Ni uno más: lo que sale de aquí sale **fuera**, y un campo de más es un campo
 * que un tercero guarda sin que nadie haya decidido que lo guarde.
 */
export interface Recipient {
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly phone: string
  readonly avatarUrl: string | null
}

/** Lo que sabe entregar por un canal. Lanzar es fallar, y fallar se reintenta. */
export interface Transport {
  send(delivery: Delivery): Promise<void>
  /**
   * Da de alta al destinatario, o pone al día lo que el proveedor sabe de él.
   *
   * Opcional porque no todo canal tiene destinatarios que dar de alta: la bandeja escribe en una
   * fila nuestra y no necesita presentar a nadie.
   *
   * **Es una sola operación y no dos**, y por eso no se llama `create`. «El destinatario SHALL
   * crearse la primera vez que se le envíe algo, sin exigir un alta previa» y «los datos SHALL
   * actualizarse cuando cambien en el perfil» son la misma llamada vista en dos momentos; partirla
   * obligaría a preguntar antes si existe, que es una carrera y un viaje de más.
   *
   * **No guardamos copia de lo que el proveedor ya sabe.** La lista de destinatarios es suya —se
   * puede tocar desde su panel— y una tabla espejo nuestra empezaría a mentir el primer día que
   * alguien la tocara. Lo que sí es nuestro es **cuándo** se le cuenta: antes del primer envío de
   * cada pasada, y al cambiar el perfil.
   */
  syncRecipient?(recipient: Recipient): Promise<void>
}

const transports = new Map<Channel, Transport>()

/**
 * La bandeja se entrega sola: su destino es una fila de esta misma base.
 *
 * Existe como transporte y no como caso especial para que el camino sea uno solo. Un canal con
 * excepciones acaba teniendo dos formas de fallar.
 */
registerTransport("inbox", { send: async () => {} })

export function registerTransport(channel: Channel, transport: Transport): void {
  transports.set(channel, transport)
}

export function transportFor(channel: Channel): Transport | undefined {
  return transports.get(channel)
}

/** Sólo para las pruebas: deja los transportes como estaban, con la bandeja puesta. */
export function resetTransports(): void {
  transports.clear()
  registerTransport("inbox", { send: async () => {} })
}

// ─── Entrega ─────────────────────────────────────────────────────────────────

export interface DeliveryReport {
  readonly sent: number
  readonly failed: number
  readonly skipped: number
  /** Encoladas de un canal sin proveedor. No es un fallo: falta configuración. */
  readonly waiting: number
  readonly fanned: number
  /** Destinatarios presentados al proveedor en esta pasada, antes de su primer envío. */
  readonly introduced: number
}

/**
 * Entrega lo que esté encolado.
 *
 * Corre en el despachador, con la operación declarada: es la única vía que puede leer las
 * preferencias de otra persona, y lo hace sin exponerlas —de aquí no sale nada más que la decisión—.
 *
 * **No duplica.** La condición de la toma es `status = 'queued'`, y marcarla es parte de la misma
 * pasada: una entrega ya enviada no vuelve a entrar, que es lo que la spec pide del reintento.
 */
export async function deliverQueued(limit = 100): Promise<DeliveryReport> {
  const pendientes = await withSystem("avisos.entregar", [], async (tx) =>
    tx
      .select({
        id: notificationDeliveries.id,
        recipientId: notificationDeliveries.recipientId,
        channel: notificationDeliveries.channel,
        kind: notificationDeliveries.kind,
        payload: notificationDeliveries.payload,
        attempts: notificationDeliveries.attempts,
        activityId: notificationDeliveries.activityId,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.status, "queued"))
      .limit(limit),
  )

  let sent = 0
  let failed = 0
  let skipped = 0
  let waiting = 0
  let fanned = 0
  let introduced = 0

  // A quién se ha presentado ya **en esta pasada**. Sin esto, una tanda de cien avisos para la misma
  // persona serían cien altas idénticas seguidas. Entre pasadas sí se repite, y está bien que se
  // repita: quien sabe si el destinatario sigue existiendo es el proveedor, no nosotros.
  const presentados = new Set<string>()

  for (const pendiente of pendientes) {
    const transport = transportFor(pendiente.channel)

    if (!transport) {
      waiting++
      continue
    }

    if (await isSkippedByPreference(pendiente.recipientId, pendiente.channel, pendiente.kind)) {
      await mark(pendiente.id, "skipped_by_preference", null)
      skipped++
      continue
    }

    try {
      // «El primer envío crea al destinatario»: va **antes** del envío y dentro del mismo `try`,
      // porque un proveedor que no admite al destinatario tampoco va a admitir el aviso, y el modo
      // de fallo correcto es el mismo — se anota y se reintenta.
      if (await introduce(transport, pendiente.recipientId, presentados)) introduced++

      await transport.send(pendiente as Delivery)
      await mark(pendiente.id, "sent", null)
      sent++

      // La bandeja es además el disparador de lo que sale hacia fuera: al quedar entregada, se
      // abren las de empuje y correo de quien las quiera.
      if (pendiente.channel === "inbox") {
        fanned += await fanOut(pendiente)
      }
    } catch (error) {
      // Un fallo del proveedor **no** hace fallar nada más: se anota en su fila y se reintenta en la
      // vuelta siguiente del despachador.
      const causa = error instanceof Error ? error.message : String(error)
      await mark(pendiente.id, "failed", causa)
      failed++
      rootLogger.warn("entrega fallida", { canal: pendiente.channel, tipo: pendiente.kind, causa })
    }
  }

  return { sent, failed, skipped, waiting, fanned, introduced }
}

// ─── El destinatario, ante el proveedor ──────────────────────────────────────

/** El trabajo que pone al día los datos de una persona. */
export const RECIPIENT_SYNC = "avisos.sincronizar-destinatario"

/**
 * Presenta al destinatario antes de enviarle nada, si el canal tiene a quién presentárselo.
 *
 * Devuelve si hubo presentación, para poder contarlas. Un aviso sin destinatario con cuenta —el
 * acuse a quien deja sus datos en el formulario público— no tiene a nadie que dar de alta, y el
 * destino le viaja en el sobre.
 */
async function introduce(
  transport: Transport,
  recipientId: string | null,
  presentados: Set<string>,
): Promise<boolean> {
  if (!transport.syncRecipient || !recipientId || presentados.has(recipientId)) return false

  const recipient = await loadRecipient(recipientId)
  if (!recipient) return false

  await transport.syncRecipient(recipient)
  presentados.add(recipientId)
  return true
}

/**
 * Cuenta a todos los proveedores cómo se llama ahora esta persona.
 *
 * Se llama cuando el perfil cambia, y no en la petición que lo cambia: hablar con un tercero dentro
 * de la transacción que guarda un nombre haría que el nombre no se guardara porque el proveedor no
 * contesta. Va por el despachador, con sus reintentos ya escritos.
 *
 * Devuelve a cuántos canales se le contó. Cero es la respuesta normal hoy: no hay ninguno con
 * proveedor (`HALLAZGOS.md` H-80).
 */
export async function syncRecipientEverywhere(userId: string): Promise<number> {
  const recipient = await loadRecipient(userId)
  if (!recipient) return 0

  let contados = 0
  for (const channel of CHANNELS) {
    const transport = transportFor(channel)
    if (!transport?.syncRecipient) continue

    await transport.syncRecipient(recipient)
    contados++
  }

  return contados
}

/**
 * Encola la sincronización de una persona.
 *
 * La clave de unicidad hace que dos cambios seguidos de perfil no dejen dos trabajos: el que espera
 * leerá el perfil cuando corra, así que ya lleva el segundo cambio dentro.
 */
export async function scheduleRecipientSync(userId: string): Promise<void> {
  await enqueue({
    kind: RECIPIENT_SYNC,
    payload: { userId },
    dedupeKey: `${RECIPIENT_SYNC}:${userId}`,
  })
}

/**
 * Los cuatro datos que la spec nombra, más con qué relacionarlos.
 *
 * Va por la vía elevada, y el motivo es el mismo que en el recorrido de almacenes del despachador:
 * **no cabe en el alcance de nadie**. La política de lectura de `users` deja ver al que pregunta y a
 * quien comparte empresa con él, y aquí no pregunta nadie —es un trabajo de fondo— ni hay empresa
 * que declarar: el destinatario de un aviso de cuenta puede no pertenecer a ninguna.
 *
 * La alternativa era abrir `users` a toda operación de sistema, que es estrictamente más ancho: esto
 * lee **una fila y cinco columnas**, y son justo las que la spec manda sincronizar.
 */
async function loadRecipient(userId: string): Promise<Recipient | null> {
  const [row] = await withElevated(
    "leer los datos del destinatario para sincronizarlos con el proveedor de avisos",
    async (tx) =>
      tx
        .select({
          userId: users.id,
          name: users.name,
          lastname: users.lastname,
          email: users.email,
          phone: users.phone,
          avatarUrl: uploads.url,
        })
        .from(users)
        .leftJoin(uploads, eq(uploads.id, users.avatarUploadId))
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1),
  )

  if (!row) return null

  return {
    userId: row.userId,
    name: [row.name, row.lastname].filter(Boolean).join(" "),
    email: row.email,
    phone: row.phone,
    avatarUrl: row.avatarUrl ?? null,
  }
}

/**
 * Devuelve a la cola lo que falló, para que el despachador lo reintente.
 *
 * Se hace en una pasada aparte y no al fallar, porque reintentar dentro de la misma vuelta es
 * reintentar contra el mismo proveedor caído.
 */
export async function requeueFailed(limit = 100, maxAttempts = 5): Promise<number> {
  return withSystem("avisos.entregar", [], async (tx) => {
    const candidatas = await tx
      .select({ id: notificationDeliveries.id })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.status, "failed"),
          sql`${notificationDeliveries.attempts} < ${maxAttempts}`,
        ),
      )
      .limit(limit)

    if (candidatas.length === 0) return 0

    const rows = await tx
      .update(notificationDeliveries)
      .set({ status: "queued", updatedAt: new Date() })
      .where(
        inArray(
          notificationDeliveries.id,
          candidatas.map((fila) => fila.id),
        ),
      )
      .returning({ id: notificationDeliveries.id })

    return rows.length
  })
}

async function mark(id: string, status: string, error: string | null): Promise<void> {
  await withSystem("avisos.entregar", [], async (tx) => {
    await tx
      .update(notificationDeliveries)
      .set({
        status: status as "sent" | "failed" | "skipped_by_preference",
        attempts: sql`${notificationDeliveries.attempts} + 1`,
        lastError: error,
        ...(status === "sent" ? { sentAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(notificationDeliveries.id, id))
  })
}

/**
 * ¿Lo quiere por ese canal?
 *
 * Sin fila, sí: el valor por omisión es recibir. Una preferencia ausente no puede significar «no»,
 * o nadie recibiría nada hasta configurarlo.
 *
 * La bandeja no se apaga, y es una decisión: es el registro de lo que pasó, no un aviso. Lo que se
 * elige es si **además** se avisa por empuje o por correo.
 */
async function isSkippedByPreference(
  recipientId: string | null,
  channel: Channel,
  kind: string,
): Promise<boolean> {
  if (channel === "inbox" || recipientId === null) return false
  if (isCritical(kind) && channel === "email") return false

  const [row] = await withSystem("avisos.entregar", [], async (tx) =>
    tx
      .select({ enabled: notificationPreferences.enabled })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, recipientId),
          eq(notificationPreferences.category, categoryOf(kind)),
          eq(notificationPreferences.channel, channel),
        ),
      )
      .limit(1),
  )

  return row?.enabled === false
}

/** Abre las entregas hacia fuera de quien las quiera, para los canales que tengan proveedor. */
async function fanOut(inbox: {
  readonly recipientId: string | null
  readonly kind: string
  readonly activityId: string | null
  readonly payload: Record<string, unknown>
}): Promise<number> {
  if (!inbox.recipientId) return 0

  const salientes = CHANNELS.filter(
    (channel) => channel !== "inbox" && transportFor(channel) !== undefined,
  )
  if (salientes.length === 0) return 0

  const queridos: Channel[] = []
  for (const channel of salientes) {
    if (!(await isSkippedByPreference(inbox.recipientId, channel, inbox.kind))) {
      queridos.push(channel)
    }
  }
  if (queridos.length === 0) return 0

  await withSystem("avisos.entregar", [], async (tx) => {
    await tx.insert(notificationDeliveries).values(
      queridos.map((channel) => ({
        id: newId(),
        recipientId: inbox.recipientId,
        channel,
        kind: inbox.kind,
        activityId: inbox.activityId,
        payload: inbox.payload,
      })),
    )
  })

  return queridos.length
}

/** Cuántas entregas hay sin resolver. Lo usa el resumen del trabajo. */
export async function countQueued(): Promise<number> {
  return withSystem("avisos.entregar", [], async (tx) => {
    const rows = await tx
      .select({ id: notificationDeliveries.id })
      .from(notificationDeliveries)
      .where(
        and(eq(notificationDeliveries.status, "queued"), isNull(notificationDeliveries.sentAt)),
      )

    return rows.length
  })
}

/** Los canales que tienen proveedor. Lo que no esté aquí se queda encolado. */
export function configuredChannels(): readonly Channel[] {
  return CHANNELS.filter((channel) => transports.has(channel))
}
