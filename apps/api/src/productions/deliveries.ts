/**
 * Notas de entrega de una producción.
 *
 * Ver `openspec/specs/production-inventory/spec.md`, requisitos «Notas de entrega de una
 * producción» a «Eliminar una nota». Rebanada 22, bloque de entregas.
 *
 * Una nota es **el documento con el que un lote de objetos físicos cambia de manos**. No es una
 * lista de la compra: cada pieza se verifica por separado, con quien la verificó y cuándo, porque
 * lo que se discute tres semanas después nunca es el total, es una silla concreta.
 *
 * ## Salida y devolución, el mismo motor
 *
 * La nota lleva **dirección** desde la `0030`. Una de salida entrega —al cerrarla los artículos
 * quedan `delivered`—; una de devolución recoge —al cerrarla cada línea dice en qué estado vuelve:
 * devuelto, dañado, incompleto, perdido o robado—. Antes la vuelta se hacía a mano artículo por
 * artículo, que es el paso que se olvida cuando la nota trae doce.
 *
 * Es la misma entidad y no dos porque es el mismo recorrido: componer, verificar pieza por pieza,
 * firmar y cerrar. Lo único que cambia es a qué estado deja el objeto.
 *
 * ## Las firmas no bloquean el cierre
 *
 * **Decisión de producto, y va contra la lectura literal de la spec.** La spec dice que una nota
 * completada «SHALL registrar la firma de quien entrega y la de quien recibe»; si eso se
 * implementara como condición de cierre, en un set —donde se firma en papel constantemente— habría
 * notas que no se pueden cerrar nunca y artículos atrapados en `delivered` para siempre.
 *
 * Así que se cierra con **las líneas verificadas**, que es la comprobación que sí protege algo, y
 * la firma es evidencia que puede llegar después o no llegar nunca. Lo que sí se cumple entero es
 * la otra mitad del requisito: **una vez escrita es inmutable**, y el documento dice si se firmó y
 * quién.
 *
 * Quien entrega es un usuario (`signed_by_id`); quien recibe es **texto libre**
 * (`receiver_name`), porque suele ser alguien de fuera del sistema — el chofer, la dueña de la
 * bodega, el del rancho donde se guarda el vestuario.
 *
 * ## «Entregado» sólo lo pone una nota verificada
 *
 * La tabla de transiciones de `items.ts` no admite `delivered` como destino desde ningún estado, y
 * eso es deliberado: es inalcanzable por el cambio manual. El único camino es el cierre de aquí, y
 * por eso el cierre no consulta `canTransition` sino `canDeliver`, que es su propia regla y está
 * escrita al lado de la otra para que se lean juntas.
 */

import {
  buildPage,
  ConflictError,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
  UnprocessableError,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import {
  productionDeliveries,
  productionDeliveryLines,
  productionItems,
  users,
} from "@tfv/db/schema"
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import {
  canDeliver,
  canTransition,
  type ItemStatus,
  recordItemEvent,
  STATUS_LABELS,
} from "./items.ts"
import { loadProduction } from "./productions.ts"

/** En el orden del enumerado del motor, para que las dos listas se lean igual. */
export const DELIVERY_STATUSES = ["pending", "in_progress", "completed", "canceled"] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export const DELIVERY_DIRECTIONS = ["outbound", "inbound"] as const
export type DeliveryDirection = (typeof DELIVERY_DIRECTIONS)[number]

/**
 * En qué estado puede volver una pieza.
 *
 * Cinco de los ocho del artículo. `available` y `stored` no están: una devolución dice **de qué
 * manera volvió** la cosa, no dónde se guarda después —eso es otro gesto—. `delivered` tampoco, por
 * razones obvias.
 */
export const RETURN_CONDITIONS = [
  "returned",
  "damaged",
  "incomplete",
  "lost",
  "robbed",
] as const satisfies readonly ItemStatus[]

export type ReturnCondition = (typeof RETURN_CONDITIONS)[number]

/** Los estados en los que una nota **retiene** sus artículos. Ver H-172. */
const OPEN_STATUSES: readonly DeliveryStatus[] = ["pending", "in_progress"]

// ─── Lo que viaja ────────────────────────────────────────────────────────────

export interface DeliveryLineRecord {
  readonly id: string
  readonly deliveryId: string
  readonly itemId: string
  readonly itemName: string
  readonly itemCode: string
  readonly itemStatus: ItemStatus
  readonly isVerified: boolean
  readonly verifiedById: string | null
  readonly verifiedByName: string | null
  readonly verifiedAt: Date | null
  readonly returnCondition: ReturnCondition | null
}

/** Cuántas piezas hay, cuántas están verificadas y cuántas faltan. */
export interface DeliveryCounts {
  readonly total: number
  readonly verified: number
  readonly pending: number
}

export interface DeliveryRecord {
  readonly id: string
  readonly productionId: string
  readonly name: string
  readonly description: string
  readonly status: DeliveryStatus
  readonly direction: DeliveryDirection
  readonly responsibleId: string | null
  readonly responsibleName: string | null
  readonly signedById: string | null
  readonly signedByName: string | null
  readonly signatureUploadId: string | null
  readonly receiverName: string | null
  readonly receiverSignatureUploadId: string | null
  readonly signedAt: Date | null
  /** Si la nota lleva firma. Es lo que el documento tiene que decir, y no obliga a mirar tres campos. */
  readonly isSigned: boolean
  readonly counts: DeliveryCounts
  readonly lines: readonly DeliveryLineRecord[]
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** Una nota en la que figura un artículo, para la consulta de dónde se usa. */
export interface DeliveryUse {
  readonly id: string
  readonly name: string
  readonly status: DeliveryStatus
  readonly direction: DeliveryDirection
}

// ─── Consulta ────────────────────────────────────────────────────────────────

export const deliveryQuery: QuerySchema = {
  filters: {
    status: { type: "enum", values: [...DELIVERY_STATUSES], label: "Estado" },
    direction: { type: "enum", values: [...DELIVERY_DIRECTIONS], label: "Dirección" },
    responsibleId: { type: "id", label: "Responsable" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["name", "description"],
  sortable: ["name", "status", "createdAt"],
  // Lo último que se abrió es lo que se está entregando hoy. Al revés que el inventario, que se
  // recorre buscando una cosa concreta y por eso ordena por nombre.
  defaultSort: [{ field: "createdAt", direction: "desc" }],
}

const mapping = {
  fields: {
    status: productionDeliveries.status,
    direction: productionDeliveries.direction,
    responsibleId: productionDeliveries.responsibleId,
    name: productionDeliveries.name,
    createdAt: productionDeliveries.createdAt,
  },
  searchable: [productionDeliveries.name, productionDeliveries.description],
  tiebreak: productionDeliveries.id,
}

export async function listDeliveries(
  actor: Actor,
  companyId: string,
  productionId: string,
  query: ParsedQuery,
): Promise<Page<DeliveryRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const where = and(
      eq(productionDeliveries.productionId, productionId),
      isNull(productionDeliveries.deletedAt),
      ...collectionConditions(query, mapping),
    )

    const [total] = await tx.select({ value: count() }).from(productionDeliveries).where(where)

    const rows = await tx
      .select()
      .from(productionDeliveries)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    const lines = await linesOf(
      tx,
      rows.map((row) => row.id),
    )
    const names = await namesOf(tx, rows.flatMap(peopleOf))

    return buildPage(
      rows.map((row) => toRecord(row, lines.get(row.id) ?? [], names)),
      total?.value ?? 0,
      page,
      limit,
    )
  })
}

export async function getDelivery(
  actor: Actor,
  companyId: string,
  productionId: string,
  deliveryId: string,
): Promise<DeliveryRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    return detailOf(tx, productionId, deliveryId)
  })
}

/**
 * Las notas sin cerrar en las que figura un artículo.
 *
 * Es la mitad que le faltaba a `itemUsage`, y la que el `409` de H-172 enumera. Se devuelven
 * **todas** las notas, no sólo las abiertas: quien pregunta dónde se usa una cosa quiere saber
 * también por qué nota salió hace un mes.
 */
export async function deliveriesOfItem(
  tx: Transaction,
  itemId: string,
): Promise<readonly DeliveryUse[]> {
  return tx
    .select({
      id: productionDeliveries.id,
      name: productionDeliveries.name,
      status: productionDeliveries.status,
      direction: productionDeliveries.direction,
    })
    .from(productionDeliveryLines)
    .innerJoin(
      productionDeliveries,
      eq(productionDeliveries.id, productionDeliveryLines.deliveryId),
    )
    .where(and(eq(productionDeliveryLines.itemId, itemId), isNull(productionDeliveries.deletedAt)))
    .orderBy(desc(productionDeliveries.createdAt))
}

/**
 * Las notas **sin cerrar** que retienen un artículo. Cierra H-172.
 *
 * La comprobación vive aquí y no en el motor porque en el motor **no puede vivir**: el
 * `ON DELETE restrict` que `production_delivery_lines.item_id` declara sólo se evalúa ante un
 * `DELETE` de la fila referenciada, y la baja de un artículo es lógica —un `UPDATE` que escribe
 * `deleted_at`—. La barrera está declarada, se lee como si protegiera, y no puede dispararse.
 */
export async function openDeliveriesHolding(
  tx: Transaction,
  itemId: string,
): Promise<readonly DeliveryUse[]> {
  const all = await deliveriesOfItem(tx, itemId)
  return all.filter((one) => OPEN_STATUSES.includes(one.status))
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export interface CreateDeliveryInput {
  readonly name: string
  readonly description?: string | undefined
  readonly direction?: DeliveryDirection | undefined
  readonly responsibleId?: string | null | undefined
}

export async function createDelivery(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: CreateDeliveryInput,
): Promise<DeliveryRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const [created] = await tx
      .insert(productionDeliveries)
      .values({
        id: newId(),
        productionId,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        ...(input.direction === undefined ? {} : { direction: input.direction }),
        responsibleId: input.responsibleId ?? null,
      })
      .returning()

    if (!created) throw new Error("la inserción de la nota no devolvió fila")
    return detailOf(tx, productionId, created.id)
  })
}

export interface UpdateDeliveryInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
  readonly responsibleId?: string | null | undefined
}

/**
 * Edita el encabezado de una nota. **Ni el estado ni la dirección se tocan por aquí.**
 *
 * El estado tiene sus propias operaciones —componer, cerrar, cancelar—, cada una con su regla. La
 * dirección se fija al abrirla y no cambia: una nota de salida a medio verificar que se convierte
 * en devolución dejaría las líneas ya verificadas afirmando algo que nadie comprobó.
 */
export async function updateDelivery(
  actor: Actor,
  companyId: string,
  productionId: string,
  deliveryId: string,
  input: UpdateDeliveryInput,
): Promise<DeliveryRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadDelivery(tx, productionId, deliveryId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description.trim()
    if (input.responsibleId !== undefined) patch.responsibleId = input.responsibleId

    if (Object.keys(patch).length > 0) {
      await tx
        .update(productionDeliveries)
        .set(patch)
        .where(eq(productionDeliveries.id, deliveryId))
    }

    return detailOf(tx, productionId, deliveryId)
  })
}

/**
 * Establece de una vez el conjunto completo de artículos de una nota.
 *
 * «Creando las líneas que falten y eliminando las que sobren», dice la spec, y esa forma importa:
 * **las líneas que siguen no se tocan**. Rehacerlas todas borraría la verificación de las que ya se
 * comprobaron sin que nadie la deshiciera, que es el mismo defecto de forma que `diffCollection`
 * existe para evitar en las galerías (`DEFECTS.md` L-01).
 *
 * Componer pone la nota **en curso**: es el inicio de la verificación, no un paso aparte.
 */
export async function setDeliveryItems(
  actor: Actor,
  companyId: string,
  productionId: string,
  deliveryId: string,
  itemIds: readonly string[],
): Promise<DeliveryRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const delivery = await loadDelivery(tx, productionId, deliveryId)

    if (delivery.status === "completed" || delivery.status === "canceled") {
      throw new UnprocessableError(
        `Una nota ${DELIVERY_LABELS[delivery.status]} ya no se compone. Su lista es lo que quedó firmado.`,
      )
    }

    const wanted = [...new Set(itemIds)]
    await assertItemsOfProduction(tx, productionId, wanted)

    const existing = await tx
      .select({ id: productionDeliveryLines.id, itemId: productionDeliveryLines.itemId })
      .from(productionDeliveryLines)
      .where(eq(productionDeliveryLines.deliveryId, deliveryId))

    const held = new Set(existing.map((row) => row.itemId))
    const removed = existing.filter((row) => !wanted.includes(row.itemId))

    if (removed.length > 0) {
      await tx.delete(productionDeliveryLines).where(
        inArray(
          productionDeliveryLines.id,
          removed.map((row) => row.id),
        ),
      )
    }

    const added = wanted.filter((itemId) => !held.has(itemId))
    if (added.length > 0) {
      await tx
        .insert(productionDeliveryLines)
        .values(added.map((itemId) => ({ id: newId(), deliveryId, itemId })))
    }

    // Componer **es** el inicio de la verificación. Una nota vacía vuelve a pendiente: no hay nada
    // que verificar, y dejarla «en curso» diría que alguien está comprobando una lista sin piezas.
    await tx
      .update(productionDeliveries)
      .set({ status: wanted.length === 0 ? "pending" : "in_progress", updatedAt: new Date() })
      .where(eq(productionDeliveries.id, deliveryId))

    return detailOf(tx, productionId, deliveryId)
  })
}

/** Quita una sola línea, sin recomponer la lista entera. */
export async function removeDeliveryLine(
  actor: Actor,
  companyId: string,
  productionId: string,
  deliveryId: string,
  lineId: string,
): Promise<DeliveryRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const delivery = await loadDelivery(tx, productionId, deliveryId)

    if (delivery.status === "completed" || delivery.status === "canceled") {
      throw new UnprocessableError(
        `Una nota ${DELIVERY_LABELS[delivery.status]} ya no se compone. Su lista es lo que quedó firmado.`,
      )
    }

    await loadLine(tx, deliveryId, lineId)
    await tx.delete(productionDeliveryLines).where(eq(productionDeliveryLines.id, lineId))

    return detailOf(tx, productionId, deliveryId)
  })
}

export interface VerifyLineInput {
  readonly isVerified: boolean
  /** Obligatoria al verificar en una nota de devolución; rechazada en una de salida. */
  readonly returnCondition?: ReturnCondition | undefined
}

/**
 * Verifica una línea, o deshace su verificación.
 *
 * Deshacerla **borra la atribución**, que es lo que la spec pide literalmente: una línea que vuelve
 * a pendiente conservando quién la verificó diría que alguien la comprobó y sigue sin comprobar.
 *
 * En una nota de devolución, verificar exige decir **en qué estado vuelve la pieza**. Es el momento
 * en que alguien la tiene en la mano, y es el único momento en que esa pregunta se puede contestar;
 * dejarla para el cierre acaba en las doce marcadas igual.
 */
export async function verifyDeliveryLine(
  actor: Actor,
  companyId: string,
  productionId: string,
  deliveryId: string,
  lineId: string,
  input: VerifyLineInput,
): Promise<DeliveryRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const delivery = await loadDelivery(tx, productionId, deliveryId)
    await loadLine(tx, deliveryId, lineId)

    if (delivery.status === "completed" || delivery.status === "canceled") {
      throw new UnprocessableError(
        `Una nota ${DELIVERY_LABELS[delivery.status]} ya no se verifica.`,
      )
    }

    if (input.isVerified) {
      if (delivery.direction === "inbound" && input.returnCondition === undefined) {
        throw new UnprocessableError(
          "En una devolución hay que decir en qué estado vuelve la pieza: " +
            `${RETURN_CONDITIONS.map((one) => STATUS_LABELS[one]).join(", ")}.`,
        )
      }

      if (delivery.direction === "outbound" && input.returnCondition !== undefined) {
        throw new UnprocessableError(
          "Una nota de salida no declara en qué estado vuelve nada: todavía no ha vuelto.",
        )
      }

      await tx
        .update(productionDeliveryLines)
        .set({
          isVerified: true,
          verifiedById: actor.userId,
          verifiedAt: new Date(),
          returnCondition: input.returnCondition ?? null,
        })
        .where(eq(productionDeliveryLines.id, lineId))
    } else {
      await tx
        .update(productionDeliveryLines)
        .set({ isVerified: false, verifiedById: null, verifiedAt: null, returnCondition: null })
        .where(eq(productionDeliveryLines.id, lineId))
    }

    return detailOf(tx, productionId, deliveryId)
  })
}

/**
 * Cierra la nota y mueve sus artículos, **en una sola transacción**.
 *
 * Los dos escenarios de la spec son las dos mitades de lo mismo: al completarse los artículos pasan
 * a su estado nuevo, y un fallo a mitad no deja «la nota en curso y tres artículos ya movidos».
 * `withRequester` abre la transacción y cualquier excepción de aquí adentro la revierte entera —
 * incluidas las escrituras que ya se habían ejecutado—.
 *
 * El estado destino depende de la dirección: `delivered` en una salida, y en una devolución **el
 * que su propia línea declara**.
 */
export async function completeDelivery(
  actor: Actor,
  companyId: string,
  productionId: string,
  deliveryId: string,
): Promise<DeliveryRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const delivery = await loadDelivery(tx, productionId, deliveryId)

    if (delivery.status !== "in_progress") {
      throw new UnprocessableError(
        `Sólo se cierra una nota en curso, y ésta está ${DELIVERY_LABELS[delivery.status]}.`,
      )
    }

    const lines = await tx
      .select()
      .from(productionDeliveryLines)
      .where(eq(productionDeliveryLines.deliveryId, deliveryId))

    if (lines.length === 0) {
      throw new UnprocessableError("Una nota sin artículos no se cierra: no entrega nada.")
    }

    const missing = lines.filter((line) => !line.isVerified).length
    if (missing > 0) {
      // El número **en el mensaje**, que es lo que la spec pide: «e indicar cuántas faltan».
      throw new UnprocessableError(
        missing === 1
          ? "Falta 1 pieza por verificar. La nota no se cierra hasta que estén todas."
          : `Faltan ${missing} piezas por verificar. La nota no se cierra hasta que estén todas.`,
      )
    }

    const itemsById = await itemsOf(
      tx,
      lines.map((line) => line.itemId),
    )

    for (const line of lines) {
      const item = itemsById.get(line.itemId)
      if (!item) throw new NotFoundError("El artículo de una línea ya no existe")

      const target: ItemStatus =
        delivery.direction === "outbound" ? "delivered" : (line.returnCondition as ItemStatus)

      if (delivery.direction === "outbound") {
        if (!canDeliver(item.status)) {
          throw new UnprocessableError(
            `«${item.name}» está ${STATUS_LABELS[item.status]} y no se puede entregar. ` +
              "Quítalo de la nota o corrige su estado antes de cerrarla.",
          )
        }
      } else if (!canTransition(item.status, target)) {
        throw new UnprocessableError(
          `«${item.name}» está ${STATUS_LABELS[item.status]} y no puede volver como ` +
            `${STATUS_LABELS[target]}.`,
        )
      }

      await tx
        .update(productionItems)
        .set({ status: target, updatedAt: new Date() })
        .where(eq(productionItems.id, item.id))

      await recordItemEvent(tx, {
        itemId: item.id,
        fromStatus: item.status,
        toStatus: target,
        reason: delivery.direction === "outbound" ? "delivery" : "return",
        actorId: actor.userId,
        causeId: deliveryId,
      })
    }

    await tx
      .update(productionDeliveries)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(productionDeliveries.id, deliveryId))

    return detailOf(tx, productionId, deliveryId)
  })
}

/** Descarta una nota. Los artículos no se mueven: nunca llegaron a salir. */
export async function cancelDelivery(
  actor: Actor,
  companyId: string,
  productionId: string,
  deliveryId: string,
): Promise<DeliveryRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const delivery = await loadDelivery(tx, productionId, deliveryId)

    if (delivery.status === "completed") {
      throw new UnprocessableError(
        "Una nota completada no se cancela: lo que se entregó ya se entregó. Elimínala si hay que deshacerlo.",
      )
    }

    await tx
      .update(productionDeliveries)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(productionDeliveries.id, deliveryId))

    return detailOf(tx, productionId, deliveryId)
  })
}

export interface SignDeliveryInput {
  readonly receiverName: string
  readonly signatureUploadId?: string | null | undefined
  readonly receiverSignatureUploadId?: string | null | undefined
}

/**
 * Registra las firmas. **Se escriben una vez y no se corrigen.**
 *
 * Quien entrega es el actor —tiene cuenta, y su identidad ya la garantiza la sesión—; quien recibe
 * es texto libre, porque puede no existir en el sistema. Los dos trazos son imágenes ya subidas y
 * ambos son opcionales: en un set se firma en papel, y el nombre de quien recibió con la fecha ya
 * es más de lo que la nota tenía antes.
 *
 * El `409` es deliberado y no un `422`: no es que lo enviado esté mal, es que hay algo que ya no
 * admite cambios. Es la misma respuesta que da editar una entidad congelada en el resto del sistema.
 */
export async function signDelivery(
  actor: Actor,
  companyId: string,
  productionId: string,
  deliveryId: string,
  input: SignDeliveryInput,
): Promise<DeliveryRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const delivery = await loadDelivery(tx, productionId, deliveryId)

    if (delivery.signedAt) {
      throw new ConflictError(
        "Esta nota ya está firmada, y una firma no se modifica. Es lo que la hace valer como evidencia.",
      )
    }

    if (delivery.status !== "completed") {
      throw new UnprocessableError(
        "Se firma lo que ya se entregó: cierra la nota antes de recoger las firmas.",
      )
    }

    await tx
      .update(productionDeliveries)
      .set({
        signedById: actor.userId,
        signatureUploadId: input.signatureUploadId ?? null,
        receiverName: input.receiverName.trim(),
        receiverSignatureUploadId: input.receiverSignatureUploadId ?? null,
        signedAt: new Date(),
      })
      .where(eq(productionDeliveries.id, deliveryId))

    return detailOf(tx, productionId, deliveryId)
  })
}

/**
 * Da de baja una nota y **devuelve sus artículos**.
 *
 * «Los artículos que hubieran quedado en estado entregado **por esa nota** SHALL volver a
 * disponible.» Las dos condiciones son necesarias y ninguna sobra: se comprueba que el artículo
 * siga `delivered` —si se rompió después, sigue roto y eliminar la nota no lo repara— y que fuera
 * **esta** nota la que lo dejó ahí, lo cual se sabe mirando su último evento. Sin lo segundo, borrar
 * una nota vieja desharía la entrega vigente de otra.
 *
 * Las líneas se van por la cascada declarada, que aquí sí se dispara: `production_delivery_lines`
 * cuelga de la nota con `on delete cascade` y la nota se da de baja lógica... así que **no** se
 * dispara, y se borran a mano. Es exactamente la trampa de H-172, del otro lado.
 */
export async function deleteDelivery(
  actor: Actor,
  companyId: string,
  productionId: string,
  deliveryId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadDelivery(tx, productionId, deliveryId)

    const lines = await tx
      .select({ itemId: productionDeliveryLines.itemId })
      .from(productionDeliveryLines)
      .where(eq(productionDeliveryLines.deliveryId, deliveryId))

    const itemsById = await itemsOf(
      tx,
      lines.map((line) => line.itemId),
    )

    for (const line of lines) {
      const item = itemsById.get(line.itemId)
      if (item?.status !== "delivered") continue
      if (!(await wasDeliveredBy(tx, item.id, deliveryId))) continue

      await tx
        .update(productionItems)
        .set({ status: "available", updatedAt: new Date() })
        .where(eq(productionItems.id, item.id))

      await recordItemEvent(tx, {
        itemId: item.id,
        fromStatus: "delivered",
        toStatus: "available",
        reason: "delivery",
        actorId: actor.userId,
        causeId: deliveryId,
        note: "Se eliminó la nota que lo había entregado",
      })
    }

    // La nota se da de baja **lógica**, así que la cascada declarada sobre las líneas no se dispara.
    await tx
      .delete(productionDeliveryLines)
      .where(eq(productionDeliveryLines.deliveryId, deliveryId))

    await tx
      .update(productionDeliveries)
      .set({ deletedAt: new Date() })
      .where(eq(productionDeliveries.id, deliveryId))
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/** Cómo se nombra cada estado de nota en un mensaje dirigido a una persona. */
const DELIVERY_LABELS: Readonly<Record<DeliveryStatus, string>> = {
  pending: "pendiente",
  in_progress: "en curso",
  completed: "completada",
  canceled: "cancelada",
}

export async function loadDelivery(tx: Transaction, productionId: string, deliveryId: string) {
  const [row] = await tx
    .select()
    .from(productionDeliveries)
    .where(
      and(
        eq(productionDeliveries.id, deliveryId),
        eq(productionDeliveries.productionId, productionId),
        isNull(productionDeliveries.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La nota de entrega no existe")
  return row
}

async function loadLine(tx: Transaction, deliveryId: string, lineId: string) {
  const [row] = await tx
    .select()
    .from(productionDeliveryLines)
    .where(
      and(
        eq(productionDeliveryLines.id, lineId),
        eq(productionDeliveryLines.deliveryId, deliveryId),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La línea no existe en esta nota")
  return row
}

/**
 * La línea de una nota, localizada por el código de la etiqueta del artículo.
 *
 * Es el gesto de verificar de verdad: se escanea lo que se tiene en la mano y la pantalla dice si
 * está en la lista. Preguntar por el identificador de la línea obligaría a buscarla antes con los
 * ojos, que es justo lo que la etiqueta existe para evitar.
 */
export async function findDeliveryLineByCode(
  actor: Actor,
  companyId: string,
  productionId: string,
  deliveryId: string,
  code: string,
): Promise<DeliveryLineRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadDelivery(tx, productionId, deliveryId)

    const [row] = await tx
      .select({ line: productionDeliveryLines, item: productionItems })
      .from(productionDeliveryLines)
      .innerJoin(productionItems, eq(productionItems.id, productionDeliveryLines.itemId))
      .where(
        and(
          eq(productionDeliveryLines.deliveryId, deliveryId),
          eq(productionItems.code, code.trim().toUpperCase()),
        ),
      )
      .limit(1)

    if (!row) throw new NotFoundError("Ese código no figura en esta nota")

    const names = await namesOf(tx, row.line.verifiedById ? [row.line.verifiedById] : [])
    return toLine(row.line, row.item, names)
  })
}

/** ¿Fue **esta** nota la que dejó el artículo entregado? Se lee de su historial. */
async function wasDeliveredBy(
  tx: Transaction,
  itemId: string,
  deliveryId: string,
): Promise<boolean> {
  const [row] = await tx.execute<{ cause_id: string | null }>(sql`
    select cause_id from production_item_events
    where item_id = ${itemId} and to_status = 'delivered'
    order by occurred_at desc, id desc
    limit 1
  `)

  return row?.cause_id === deliveryId
}

/**
 * Los artículos son de esta producción.
 *
 * Las claves foráneas se comprueban con los permisos del dueño de la tabla y **se saltan las
 * políticas de fila**, así que el motor aceptaría el artículo de otra producción —y de otra
 * empresa—. Se corta aquí, que es la capa que sabe de quién es la producción. Es la misma cautela
 * que `items.ts` toma con la categoría.
 */
async function assertItemsOfProduction(
  tx: Transaction,
  productionId: string,
  itemIds: readonly string[],
): Promise<void> {
  if (itemIds.length === 0) return

  const rows = await tx
    .select({ id: productionItems.id })
    .from(productionItems)
    .where(
      and(
        inArray(productionItems.id, [...itemIds]),
        eq(productionItems.productionId, productionId),
        isNull(productionItems.deletedAt),
      ),
    )

  if (rows.length !== itemIds.length) {
    throw new NotFoundError("Algún artículo no existe en esta producción")
  }
}

async function itemsOf(
  tx: Transaction,
  itemIds: readonly string[],
): Promise<Map<string, typeof productionItems.$inferSelect>> {
  const wanted = [...new Set(itemIds)]
  if (wanted.length === 0) return new Map()

  const rows = await tx
    .select()
    .from(productionItems)
    .where(and(inArray(productionItems.id, wanted), isNull(productionItems.deletedAt)))

  return new Map(rows.map((row) => [row.id, row]))
}

/** Las líneas de un puñado de notas, en **una** consulta. */
async function linesOf(
  tx: Transaction,
  deliveryIds: readonly string[],
): Promise<Map<string, DeliveryLineRecord[]>> {
  const wanted = [...new Set(deliveryIds)]
  if (wanted.length === 0) return new Map()

  const rows = await tx
    .select({ line: productionDeliveryLines, item: productionItems })
    .from(productionDeliveryLines)
    .innerJoin(productionItems, eq(productionItems.id, productionDeliveryLines.itemId))
    .where(inArray(productionDeliveryLines.deliveryId, wanted))
    .orderBy(asc(productionItems.name), asc(productionDeliveryLines.id))

  const names = await namesOf(
    tx,
    rows.flatMap((row) => (row.line.verifiedById ? [row.line.verifiedById] : [])),
  )

  const byDelivery = new Map<string, DeliveryLineRecord[]>()
  for (const row of rows) {
    const list = byDelivery.get(row.line.deliveryId) ?? []
    list.push(toLine(row.line, row.item, names))
    byDelivery.set(row.line.deliveryId, list)
  }

  return byDelivery
}

/** Los nombres de las personas que la nota menciona, para no enseñar identificadores en crudo. */
async function namesOf(
  tx: Transaction,
  userIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, string>> {
  const wanted = [...new Set(userIds.filter((id): id is string => id !== null))]
  if (wanted.length === 0) return new Map()

  const rows = await tx
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, wanted))

  return new Map(rows.map((row) => [row.id, row.name]))
}

function peopleOf(row: typeof productionDeliveries.$inferSelect): (string | null)[] {
  return [row.responsibleId, row.signedById]
}

function toLine(
  line: typeof productionDeliveryLines.$inferSelect,
  item: typeof productionItems.$inferSelect,
  names: ReadonlyMap<string, string>,
): DeliveryLineRecord {
  return {
    id: line.id,
    deliveryId: line.deliveryId,
    itemId: item.id,
    itemName: item.name,
    itemCode: item.code,
    itemStatus: item.status,
    isVerified: line.isVerified,
    verifiedById: line.verifiedById,
    verifiedByName: line.verifiedById ? (names.get(line.verifiedById) ?? null) : null,
    verifiedAt: line.verifiedAt,
    returnCondition: line.returnCondition,
  }
}

function toRecord(
  row: typeof productionDeliveries.$inferSelect,
  lines: readonly DeliveryLineRecord[],
  names: ReadonlyMap<string, string>,
): DeliveryRecord {
  const verified = lines.filter((line) => line.isVerified).length

  return {
    id: row.id,
    productionId: row.productionId,
    name: row.name,
    description: row.description,
    status: row.status,
    direction: row.direction,
    responsibleId: row.responsibleId,
    responsibleName: row.responsibleId ? (names.get(row.responsibleId) ?? null) : null,
    signedById: row.signedById,
    signedByName: row.signedById ? (names.get(row.signedById) ?? null) : null,
    signatureUploadId: row.signatureUploadId,
    receiverName: row.receiverName,
    receiverSignatureUploadId: row.receiverSignatureUploadId,
    signedAt: row.signedAt,
    isSigned: row.signedAt !== null,
    counts: { total: lines.length, verified, pending: lines.length - verified },
    lines,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** La nota tal y como se devuelve tras leerla o escribirla. */
export async function detailOf(
  tx: Transaction,
  productionId: string,
  deliveryId: string,
): Promise<DeliveryRecord> {
  const row = await loadDelivery(tx, productionId, deliveryId)
  const lines = await linesOf(tx, [row.id])
  const names = await namesOf(tx, peopleOf(row))
  return toRecord(row, lines.get(row.id) ?? [], names)
}
