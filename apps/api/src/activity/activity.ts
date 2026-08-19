/**
 * La bitácora de la empresa.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md` y la rebanada 09.
 *
 * ## El asiento va **dentro** de la transacción de la mutación
 *
 * Es el cambio de fondo respecto de la implementación anterior, donde la actividad se emitía sin
 * esperarla y sus errores se descartaban: una operación podía completarse sin dejar rastro, y nadie
 * lo sabía. Aquí `recordActivity` recibe la transacción de quien muta. De ahí salen las dos mitades
 * del requisito, y ninguna cuesta código: si la mutación se revierte no hay asiento, y si el asiento
 * no se puede escribir la mutación no se confirma.
 *
 * Por eso la firma pide `tx` y no un actor. Una función que abriera su propia transacción sería
 * exactamente la que la spec prohíbe.
 *
 * ## Y una acción denegada no registra nada
 *
 * Sale gratis por dónde vive la compuerta de permisos: en el middleware, antes del manejador
 * (rebanada 05). Un `403` no llega a ejecutar nada, así que no hay nada que registrar. Si la
 * comprobación viviera dentro del manejador, esta propiedad dependería de que cada uno se acordara
 * de comprobar antes de escribir.
 *
 * ## Lo que se guarda no es una frase, y a dónde lleva no se escribe a mano
 *
 * Dos correcciones de esta vuelta, y las dos son de forma antes que de código:
 *
 * - El asiento guarda **una clave del catálogo y sus parámetros** (`@tfv/contracts/activity`). Con
 *   un campo de texto libre, lo que se acaba guardando es español —pasó aquí y pasó en la
 *   conversación del pedido—, y con ello la bitácora y la bandeja eran las dos únicas pantallas que
 *   no cambiaban de idioma (`HALLAZGOS.md` H-153).
 * - La referencia navegable sale de `activityTarget()` y **no se puede pasar desde fuera**. Cuando
 *   cada llamada la escribía, las tres que había apuntaban a pantallas inexistentes y pulsar
 *   cualquier aviso era caer en un `404` (H-154). Quitar el parámetro es lo que impide que vuelva.
 */

import {
  type ActivityMessage,
  activityTarget,
  buildPage,
  newId,
  type Page,
  type ParsedQuery,
  type PermissionKey,
  type QuerySchema,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import { companies, companyActivities, users } from "@tfv/db/schema"
import { and, count, desc, eq, inArray, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { audienceFor, enqueueInbox } from "./delivery.ts"

export type ActivityAction = "create" | "update" | "delete"

export type ActivityOrigin =
  | "web"
  | "mobile"
  | "api"
  | "integration"
  | "automation"
  | "system"
  | "other"

export interface ActivityInput {
  readonly companyId: string
  readonly action: ActivityAction
  /** La tabla afectada. Es lo que permite filtrar por tipo de entidad sin adivinar por el título. */
  readonly entity: string
  readonly entityId?: string | undefined
  /** Cómo se llama, para reconocerla sin abrirla. */
  readonly entityLabel?: string | undefined
  /**
   * Qué se hizo, como **clave del catálogo y sus parámetros**.
   *
   * No admite una frase, y ésa es toda la corrección de H-153: mientras hubo un campo de texto
   * libre, lo que se guardó fue español. El tipo obliga a que los parámetros sean exactamente los
   * que la clave declara, así que un aviso que dijera «incorporó a » no llega a compilar.
   */
  readonly message: ActivityMessage
  readonly description?: string | undefined
  readonly origin?: ActivityOrigin | undefined
  readonly serviceId?: string | undefined
  /**
   * Las claves que autorizan la acción, que son las que seleccionan la audiencia.
   *
   * Se guardan separadas por espacio en una sola columna. Son una o dos, se leen siempre juntas y
   * nunca se consulta una suelta; una tabla aparte para eso sería una unión más en cada listado.
   */
  readonly permissions?: readonly PermissionKey[] | undefined
  readonly performedById: string
  /** Verdadero cuando quien actuó lo hizo como administración de plataforma sobre empresa ajena. */
  readonly performedAsPlatformAdmin?: boolean | undefined
}

export interface ActivityRecord {
  readonly id: string
  readonly companyId: string
  readonly action: ActivityAction
  readonly entity: string
  readonly entityId: string | null
  readonly entityLabel: string
  readonly messageKey: string
  readonly messageParams: Record<string, string | number>
  readonly description: string
  readonly url: string
  readonly origin: ActivityOrigin
  readonly permissions: readonly string[]
  readonly performedById: string | null
  readonly performedAsPlatformAdmin: boolean
  readonly createdAt: Date
  readonly actorName: string
  readonly companyName: string
}

/**
 * Escribe el asiento y deja repartidos sus avisos. Devuelve el identificador del asiento.
 *
 * **El autor no recibe el suyo.** Lo dice la spec y es lo que separa una bitácora de un buzón de
 * ruido: quien acaba de guardar algo no necesita que se lo cuenten. El asiento sí queda, y él lo ve
 * en la bitácora como todos.
 */
export async function recordActivity(tx: Transaction, input: ActivityInput): Promise<string> {
  const id = newId()
  const url = activityTarget(input)

  await tx.insert(companyActivities).values({
    id,
    companyId: input.companyId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    entityLabel: (input.entityLabel ?? "").slice(0, 200),
    messageKey: input.message.key,
    messageParams: input.message.params,
    description: input.description ?? "",
    url,
    origin: input.origin ?? "web",
    permission: input.permissions?.join(" ").slice(0, 120) ?? null,
    performedById: input.performedById,
    performedAsPlatformAdmin: input.performedAsPlatformAdmin ?? false,
    serviceId: input.serviceId ?? null,
  })

  const audiencia = await audienceFor(tx, {
    companyId: input.companyId,
    permissions: input.permissions ?? [],
    exclude: input.performedById,
  })

  await enqueueInbox(tx, {
    recipients: audiencia,
    kind: "activity",
    activityId: id,
    payload: {
      // «Un título con el nombre de la entidad afectada, un cuerpo que indique **quién hizo qué**,
      // y una referencia que lleve a la entidad al pulsarla». Las tres cosas, en el sobre.
      //
      // El cuerpo viaja como clave y parámetros, no redactado: el mismo sobre se pinta en la
      // bandeja de quien la abre y —el día que haya proveedor— sale por empuje, y no tienen por qué
      // leerse en el mismo idioma. Lo único que se resuelve aquí es **el nombre de quien actuó**,
      // porque eso sí es un dato y el sobre viaja lejos de la fila que podría dar el nombre.
      title: input.entityLabel ?? "",
      bodyKey: input.message.key,
      bodyParams: { ...input.message.params, actor: await actorName(tx, input.performedById) },
      url,
      companyId: input.companyId,
      action: input.action,
      entity: input.entity,
    },
  })

  return id
}

/** Cómo se llama quien actuó. Sin nombre ni apellidos, su correo; sin nada, la cadena vacía. */
async function actorName(tx: Transaction, userId: string): Promise<string> {
  const [actor] = await tx
    .select({ name: users.name, lastname: users.lastname, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return [actor?.name, actor?.lastname].filter(Boolean).join(" ") || actor?.email || ""
}

// ─── Consulta ────────────────────────────────────────────────────────────────

/**
 * Qué se puede pedir de la bitácora.
 *
 * Los cuatro filtros que la spec nombra —servicio, tipo de acción, autor y rango de fechas—, ni uno
 * más. La gramática es cerrada: pedir por un campo que no esté aquí responde `400` nombrándolo.
 */
export const activityQuery: QuerySchema = {
  // Se busca por el **nombre de la entidad**, y no por lo que se hizo con ella: lo que se hizo ya no
  // es texto sino una clave (H-153), y buscar «company.updated» no es buscar. Para eso está el
  // filtro de acción, que es la pregunta que esa búsqueda intentaba responder.
  searchable: ["entityLabel"],
  sortable: ["createdAt"],
  filters: {
    action: { type: "enum", values: ["create", "update", "delete"], label: "acción" },
    entity: { type: "string", set: true },
    serviceId: { type: "id" },
    performedById: { type: "id" },
    createdAt: { type: "date", range: true },
  },
  defaultSort: [{ field: "createdAt", direction: "desc" }],
}

/** La bitácora de una empresa. */
export async function listCompanyActivity(
  actor: Actor,
  companyId: string,
  query: ParsedQuery,
): Promise<Page<ActivityRecord>> {
  return withRequester(actor, async (tx) => {
    const conditions = [
      eq(companyActivities.companyId, companyId),
      ...collectionConditions(query, mapping),
    ]

    return read(tx, and(...conditions), query)
  })
}

/**
 * La actividad propia, a través de todas las empresas.
 *
 * Sin `companyId`: son los asientos de quien pregunta, estén donde estén. Las políticas ya acotan lo
 * visible a sus empresas, así que la consulta no repite ese filtro — y si algún día alguien dejara
 * una empresa, sus asientos de allí dejan de salir sin que nadie tenga que acordarse.
 */
export async function listMyActivity(
  actor: Actor,
  query: ParsedQuery,
): Promise<Page<ActivityRecord>> {
  return withRequester(actor, async (tx) => {
    const conditions = [
      eq(companyActivities.performedById, actor.userId),
      ...collectionConditions(query, mapping),
    ]

    return read(tx, and(...conditions), query)
  })
}

const mapping = {
  fields: {
    action: companyActivities.action,
    entity: companyActivities.entity,
    serviceId: companyActivities.serviceId,
    performedById: companyActivities.performedById,
    createdAt: companyActivities.createdAt,
    entityLabel: companyActivities.entityLabel,
  },
  searchable: [companyActivities.entityLabel],
  tiebreak: companyActivities.id,
}

async function read(
  tx: Transaction,
  where: ReturnType<typeof and>,
  query: ParsedQuery,
): Promise<Page<ActivityRecord>> {
  const window = windowOf(query)

  const rows = await tx
    .select({
      activity: companyActivities,
      actorName: sql<string>`coalesce(nullif(trim(${users.name} || ' ' || ${users.lastname}), ''), ${users.email}, '')`,
      companyName: sql<string>`coalesce(${companies.name}, '')`,
    })
    .from(companyActivities)
    .leftJoin(users, eq(users.id, companyActivities.performedById))
    .leftJoin(companies, eq(companies.id, companyActivities.companyId))
    .where(where)
    .orderBy(...collectionOrder(query, mapping))
    .limit(window.limit)
    .offset(window.offset)

  const [total] = await tx.select({ value: count() }).from(companyActivities).where(where)

  return buildPage(rows.map(toRecord), total?.value ?? 0, window.page, window.limit)
}

function toRecord(row: {
  activity: typeof companyActivities.$inferSelect
  actorName: string
  companyName: string
}): ActivityRecord {
  const a = row.activity

  return {
    id: a.id,
    companyId: a.companyId,
    action: a.action,
    entity: a.entity,
    entityId: a.entityId,
    entityLabel: a.entityLabel,
    messageKey: a.messageKey,
    messageParams: a.messageParams,
    description: a.description,
    url: a.url,
    origin: a.origin,
    permissions: a.permission ? a.permission.split(" ").filter(Boolean) : [],
    performedById: a.performedById,
    performedAsPlatformAdmin: a.performedAsPlatformAdmin,
    createdAt: a.createdAt,
    actorName: row.actorName,
    companyName: row.companyName,
  }
}

/** Los asientos de una entidad concreta, para la ficha. */
export async function activityOf(
  actor: Actor,
  companyId: string,
  entity: string,
  entityIds: readonly string[],
  limit = 20,
): Promise<readonly ActivityRecord[]> {
  if (entityIds.length === 0) return []

  return withRequester(actor, async (tx) => {
    const rows = await tx
      .select({
        activity: companyActivities,
        actorName: sql<string>`coalesce(nullif(trim(${users.name} || ' ' || ${users.lastname}), ''), ${users.email}, '')`,
        companyName: sql<string>`coalesce(${companies.name}, '')`,
      })
      .from(companyActivities)
      .leftJoin(users, eq(users.id, companyActivities.performedById))
      .leftJoin(companies, eq(companies.id, companyActivities.companyId))
      .where(
        and(
          eq(companyActivities.companyId, companyId),
          eq(companyActivities.entity, entity),
          inArray(companyActivities.entityId, [...entityIds]),
        ),
      )
      .orderBy(desc(companyActivities.createdAt))
      .limit(limit)

    return rows.map(toRecord)
  })
}
