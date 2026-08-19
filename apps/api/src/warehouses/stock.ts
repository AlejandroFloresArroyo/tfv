/**
 * Unidades de existencia.
 *
 * Ver `openspec/specs/stock-units/spec.md`. Rebanada 12.
 *
 * **Una fila es un objeto físico.** No un contador, no un saldo: la cámara concreta que está en la
 * caja `BOX7` y que tiene pegada una etiqueta con su código. Es la decisión de modelado más
 * consecuente del servicio, y la correcta para este negocio: cuando rentas equipo necesitas saber
 * *cuál* de las tres cámaras salió, quién la tiene y en qué estado volvió. Un contador no responde
 * a eso.
 *
 * De ahí se sigue todo lo demás: reservar es marcar unidades concretas, la disponibilidad es un
 * recuento por estado, y las etiquetas impresas son parte del flujo de trabajo real.
 *
 * ## Los once estados, en tres grupos
 *
 * | Grupo | Estados | Qué significan juntos |
 * |---|---|---|
 * | **Compromiso** | disponible, en cotización, en pedido | Reversibles, y los dos últimos los mueve un documento |
 * | **Salida** | rentada, vendida, gastada | La unidad no está en la nave |
 * | **Incidencia** | perdida, dañada, robada, incompleta, modificada | Está o no está, pero no sirve |
 *
 * Las dos reglas que separan estos grupos son el núcleo de este módulo, y las dos existen para que
 * el inventario y los documentos no se contradigan:
 *
 * - **Un compromiso vigente bloquea el cambio manual.** Liberar una unidad reservada se hace
 *   deshaciendo el compromiso, no marcándola disponible por detrás — o la cotización seguiría
 *   diciendo que la tiene.
 * - **Una salida definitiva no vuelve.** Una unidad vendida, perdida, robada o gastada no se
 *   recupera con un cambio de estado; una de incidencia sí, porque se repara.
 */

import {
  buildPage,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
  UnprocessableError,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import {
  users,
  warehouseMeasurements,
  warehouseProducts,
  warehouseStockEvents,
  warehouseStockUnits,
  warehouseStorages,
} from "@tfv/db/schema"
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { loadWarehouse } from "./warehouses.ts"

export const STOCK_STATUSES = [
  "available",
  "in_quote",
  "in_order",
  "rented",
  "sold",
  "lost",
  "damaged",
  "robbed",
  "incomplete",
  "modified",
  "expense",
] as const

export type StockStatus = (typeof STOCK_STATUSES)[number]

export const STOCK_REASONS = [
  "manual",
  "quote_reservation",
  "quote_release",
  "quote_status",
  "order",
  "storefront_sale",
  "rental_return",
  "created",
] as const

export type StockReason = (typeof STOCK_REASONS)[number]

/**
 * Comprometida por un documento vigente.
 *
 * **Sólo estas dos.** «Rentada» también es un compromiso en el sentido comercial, pero la unidad ya
 * salió de la nave: marcarla perdida o dañada al volver es exactamente lo que hay que poder hacer a
 * mano, y bloquearlo dejaría el inventario sin forma de registrar lo que de verdad pasó.
 */
const COMMITTED: readonly StockStatus[] = ["in_quote", "in_order"]

/**
 * Salidas definitivas: la unidad ya no vuelve al inventario.
 *
 * Se distinguen de las incidencias —dañada, incompleta, modificada— en que aquéllas se reparan y
 * vuelven. Una vendida no vuelve, y una perdida que aparece se da de alta otra vez: es una unidad
 * distinta con su etiqueta nueva, porque la vieja lleva meses fuera del inventario.
 */
const TERMINAL: readonly StockStatus[] = ["sold", "lost", "robbed", "expense"]

export function isCommitted(status: StockStatus): boolean {
  return COMMITTED.includes(status)
}

export function isTerminal(status: StockStatus): boolean {
  return TERMINAL.includes(status)
}

export interface StockUnitRecord {
  readonly id: string
  readonly measurementId: string
  readonly code: string
  readonly status: StockStatus
  readonly createdByReservation: boolean
  /** Cuándo llegó de verdad lo que se acuñó. Nulo mientras siga pendiente. Ver `DEFECTS.md` M-04. */
  readonly arrivedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** Dónde vive una unidad, para la búsqueda por código de etiqueta. */
export interface StockUnitLocation extends StockUnitRecord {
  readonly measurementName: string
  readonly productId: string
  readonly productName: string
  readonly productCode: string
  readonly storageId: string | null
  readonly storageCode: string | null
  readonly storageName: string | null
}

export interface StockEventRecord {
  readonly id: string
  readonly fromStatus: StockStatus | null
  readonly toStatus: StockStatus
  readonly reason: StockReason
  readonly actorId: string | null
  /**
   * Quién lo provocó, por su nombre.
   *
   * Viaja con el evento porque la alternativa era pedir el padrón de la empresa —`companies.users.
   * view`, un permiso de otro dominio que no implica el de existencias, y paginado a noventa y
   * seis— sólo para traducir un identificador (H-33). Es lo mismo que la línea de cotización hace
   * con su producto.
   *
   * **Nulo cuando no hay persona detrás**: lo movió un documento, o la siembra. Y nulo también si
   * quien lo movió ya no está al alcance de quien mira, que es lo que hace la política de lectura
   * del padrón: el cambio consta y su responsable no se nombra.
   */
  readonly actorName: string | null
  readonly causeId: string | null
  readonly note: string | null
  readonly occurredAt: Date
}

// ─── Consulta ────────────────────────────────────────────────────────────────

/**
 * Qué se puede pedir de las unidades de una medida.
 *
 * Sin búsqueda por texto: la spec las enumera entre los recursos que no la admiten, y con razón —
 * una unidad no tiene nombre, tiene código, y para eso está la localización por código.
 */
export const stockQuery: QuerySchema = {
  filters: {
    status: { type: "enum", values: [...STOCK_STATUSES], set: true, label: "Estado" },
    createdByReservation: { type: "boolean", label: "Acuñada por reserva" },
  },
  searchable: [],
  sortable: ["code", "status", "createdAt"],
  defaultSort: [{ field: "code", direction: "asc" }],
}

const mapping = {
  fields: {
    status: warehouseStockUnits.status,
    createdByReservation: warehouseStockUnits.createdByReservation,
    code: warehouseStockUnits.code,
    createdAt: warehouseStockUnits.createdAt,
  },
  tiebreak: warehouseStockUnits.id,
}

export async function listUnits(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  measurementId: string,
  query: ParsedQuery,
): Promise<Page<StockUnitRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadMeasurement(tx, warehouseId, measurementId)

    const where = and(
      eq(warehouseStockUnits.measurementId, measurementId),
      isNull(warehouseStockUnits.deletedAt),
      ...collectionConditions(query, mapping),
    )

    const [total] = await tx.select({ value: count() }).from(warehouseStockUnits).where(where)

    const rows = await tx
      .select()
      .from(warehouseStockUnits)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    return buildPage(rows.map(toRecord), total?.value ?? 0, page, limit)
  })
}

/**
 * Localiza una unidad por el código de su etiqueta.
 *
 * Es la consulta del escáner: alguien apunta a una caja en la nave y necesita saber qué es, dónde
 * debería estar y en qué estado consta. Devuelve el camino entero —producto, medida, ubicación—
 * porque el código por sí solo no dice nada a quien lo lee.
 */
export async function findByCode(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  code: string,
): Promise<StockUnitLocation> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const [row] = await tx
      .select({
        unit: warehouseStockUnits,
        measurementName: warehouseMeasurements.name,
        productId: warehouseProducts.id,
        productName: warehouseProducts.name,
        productCode: warehouseProducts.code,
        storageId: warehouseStorages.id,
        storageCode: warehouseStorages.code,
        storageName: warehouseStorages.name,
      })
      .from(warehouseStockUnits)
      .innerJoin(
        warehouseMeasurements,
        eq(warehouseMeasurements.id, warehouseStockUnits.measurementId),
      )
      .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
      .leftJoin(warehouseStorages, eq(warehouseStorages.id, warehouseProducts.storageId))
      .where(
        and(
          eq(warehouseStockUnits.code, code.trim().toUpperCase()),
          eq(warehouseProducts.warehouseId, warehouseId),
          isNull(warehouseStockUnits.deletedAt),
        ),
      )
      .limit(1)

    if (!row) throw new NotFoundError("Ninguna unidad tiene ese código")

    return {
      ...toRecord(row.unit),
      measurementName: row.measurementName,
      productId: row.productId,
      productName: row.productName,
      productCode: row.productCode,
      storageId: row.storageId,
      storageCode: row.storageCode,
      storageName: row.storageName,
    }
  })
}

/** El historial de una unidad, de lo más reciente a lo más antiguo. */
export async function unitHistory(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  unitId: string,
): Promise<StockEventRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadUnit(tx, warehouseId, unitId)

    const rows = await tx
      .select({
        event: warehouseStockEvents,
        actorName: users.name,
        actorLastname: users.lastname,
        actorUsername: users.username,
      })
      .from(warehouseStockEvents)
      // Externa: un evento sin persona detrás —lo movió un documento— sigue siendo un evento, y
      // uno cuyo autor ya no se alcanza tampoco puede desaparecer del historial.
      .leftJoin(users, eq(users.id, warehouseStockEvents.actorId))
      .where(eq(warehouseStockEvents.stockUnitId, unitId))
      .orderBy(desc(warehouseStockEvents.occurredAt))

    return rows.map(({ event, ...actor }) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      reason: event.reason,
      actorId: event.actorId,
      actorName: displayName(actor),
      causeId: event.causeId,
      note: event.note,
      occurredAt: event.occurredAt,
    }))
  })
}

/**
 * El nombre con el que se presenta a quien provocó un cambio.
 *
 * Nombre y apellido, y el usuario cuando la cuenta no tiene ninguno de los dos —una invitación
 * aceptada sin completar el perfil—: enseñar un hueco donde va un responsable se lee como si el
 * cambio no tuviera dueño, que es exactamente lo contrario de lo que dice el dato.
 */
function displayName(actor: {
  actorName: string | null
  actorLastname: string | null
  actorUsername: string | null
}): string | null {
  const full = [actor.actorName, actor.actorLastname]
    .filter((part) => part !== null && part.trim() !== "")
    .join(" ")
    .trim()

  return full === "" ? (actor.actorUsername ?? null) : full
}

// ─── Alta ────────────────────────────────────────────────────────────────────

/**
 * Da de alta unidades para una medida.
 *
 * Una o veinte: es la misma operación, porque son la misma fila repetida. Cada una recibe su propio
 * código —dos unidades de la misma medida son indistinguibles físicamente y **registros
 * distintos**— y nace disponible.
 */
export async function createUnits(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  measurementId: string,
  quantity: number,
): Promise<StockUnitRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadMeasurement(tx, warehouseId, measurementId)

    const rows = await tx
      .insert(warehouseStockUnits)
      .values(
        Array.from({ length: quantity }, () => ({
          id: newId(),
          measurementId,
          code: unitCode(),
        })),
      )
      .returning()

    await recordEvents(
      tx,
      rows.map((row) => ({ unitId: row.id, from: null, to: "available" as StockStatus })),
      "created",
      actor.userId,
    )

    return rows.map(toRecord)
  })
}

// ─── Cambio de estado ────────────────────────────────────────────────────────

export interface ChangeStatusInput {
  /** Unidades concretas. Ausente: todas las de la medida. */
  readonly unitIds?: readonly string[] | undefined
  readonly status: StockStatus
  readonly note?: string | undefined
}

/**
 * Cambia el estado de una unidad, de varias, o de todas las de una medida.
 *
 * **Atómica.** Si una sola no admite el cambio, no cambia ninguna. La spec lo exige y la razón es
 * práctica: una modificación masiva que aplica la mitad deja a quien la lanzó sin saber qué mitad,
 * y repetirla no es idempotente.
 *
 * Las comprobaciones se hacen **sobre todas antes de escribir nada**, no una por una mientras se
 * escribe. Aunque la transacción revertiría igual, comprobar antes permite decir en el mensaje
 * cuántas y cuáles fallan, en lugar de sólo la primera.
 */
export async function changeStatus(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  measurementId: string,
  input: ChangeStatusInput,
): Promise<StockUnitRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadMeasurement(tx, warehouseId, measurementId)

    const units = await tx
      .select()
      .from(warehouseStockUnits)
      .where(
        and(
          eq(warehouseStockUnits.measurementId, measurementId),
          isNull(warehouseStockUnits.deletedAt),
          ...(input.unitIds ? [inArray(warehouseStockUnits.id, [...input.unitIds])] : []),
        ),
      )

    if (input.unitIds && units.length !== input.unitIds.length) {
      throw new NotFoundError("Alguna de las unidades no existe en esta medida")
    }
    if (units.length === 0) return []

    assertAllowed(units, input.status)

    const now = new Date()
    await tx
      .update(warehouseStockUnits)
      .set({ status: input.status, updatedAt: now })
      .where(
        inArray(
          warehouseStockUnits.id,
          units.map((row) => row.id),
        ),
      )

    await recordEvents(
      tx,
      units.map((row) => ({ unitId: row.id, from: row.status, to: input.status })),
      "manual",
      actor.userId,
      input.note,
    )

    const updated = await tx
      .select()
      .from(warehouseStockUnits)
      .where(
        inArray(
          warehouseStockUnits.id,
          units.map((row) => row.id),
        ),
      )

    return updated.map(toRecord)
  })
}

/**
 * Qué impide un cambio manual de estado.
 *
 * Dos reglas, y las dos existen para que el inventario y los documentos no se contradigan. Se
 * comprueban juntas y se informa de todas las unidades que fallan, no de la primera.
 */
function assertAllowed(
  units: readonly (typeof warehouseStockUnits.$inferSelect)[],
  next: StockStatus,
): void {
  const comprometidas = units.filter((row) => isCommitted(row.status))
  if (comprometidas.length > 0) {
    throw new UnprocessableError(
      `${comprometidas.length === 1 ? "Una unidad está comprometida" : `${comprometidas.length} unidades están comprometidas`} en un documento vigente (${comprometidas
        .map((row) => row.code)
        .join(", ")}). Deshaz el compromiso en lugar de cambiar su estado.`,
    )
  }

  // Una salida definitiva no se deshace con un cambio de estado. Las incidencias sí: se reparan.
  const terminales = units.filter((row) => isTerminal(row.status) && row.status !== next)
  if (terminales.length > 0) {
    throw new UnprocessableError(
      `${terminales.length === 1 ? "Una unidad salió definitivamente del inventario" : `${terminales.length} unidades salieron definitivamente del inventario`} (${terminales
        .map((row) => row.code)
        .join(", ")}). Da de alta una unidad nueva en su lugar.`,
    )
  }
}

// ─── Baja ────────────────────────────────────────────────────────────────────

/**
 * Da de baja unidades.
 *
 * **Borrado lógico**, porque una unidad aparece en pedidos y cotizaciones ya emitidos: borrarla de
 * verdad dejaría documentos históricos apuntando al vacío. Deja de contar en el inventario y sigue
 * apareciendo donde ya se mencionó.
 *
 * Una unidad comprometida no se da de baja: primero se deshace el compromiso.
 */
export async function deleteUnits(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  measurementId: string,
  unitIds: readonly string[],
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadMeasurement(tx, warehouseId, measurementId)

    const units = await tx
      .select()
      .from(warehouseStockUnits)
      .where(
        and(
          eq(warehouseStockUnits.measurementId, measurementId),
          inArray(warehouseStockUnits.id, [...unitIds]),
          isNull(warehouseStockUnits.deletedAt),
        ),
      )

    if (units.length !== unitIds.length) {
      throw new NotFoundError("Alguna de las unidades no existe en esta medida")
    }

    const comprometidas = units.filter((row) => isCommitted(row.status))
    if (comprometidas.length > 0) {
      throw new UnprocessableError(
        `No se pueden dar de baja unidades comprometidas (${comprometidas
          .map((row) => row.code)
          .join(", ")}). Deshaz el compromiso primero.`,
      )
    }

    await tx
      .update(warehouseStockUnits)
      .set({ deletedAt: new Date() })
      .where(
        inArray(
          warehouseStockUnits.id,
          units.map((row) => row.id),
        ),
      )
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/** Mismo alfabeto que el código de producto: sin caracteres que se confundan en una etiqueta. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

function unitCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("")
}

/**
 * Escribe el rastro de un cambio de estado.
 *
 * **Todo** cambio deja rastro, incluida el alta: sin el momento inicial, el historial de una unidad
 * empieza en su segundo estado y no se puede reconstruir de dónde salió. El motivo distingue quién
 * lo provocó —una persona, una cotización, una venta pública— porque «pasó a rentada» sin saber por
 * qué no sirve para cuadrar nada.
 */
export async function recordEvents(
  tx: Transaction,
  changes: readonly { unitId: string; from: StockStatus | null; to: StockStatus }[],
  reason: StockReason,
  actorId: string | null,
  note?: string | undefined,
  causeId?: string | undefined,
): Promise<void> {
  if (changes.length === 0) return

  await tx.insert(warehouseStockEvents).values(
    changes.map((change) => ({
      id: newId(),
      stockUnitId: change.unitId,
      fromStatus: change.from,
      toStatus: change.to,
      reason,
      actorId,
      causeId: causeId ?? null,
      note: note ?? null,
    })),
  )
}

/** La medida existe y pertenece a un producto de este almacén. */
async function loadMeasurement(tx: Transaction, warehouseId: string, measurementId: string) {
  const [row] = await tx
    .select({ id: warehouseMeasurements.id })
    .from(warehouseMeasurements)
    .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
    .where(
      and(
        eq(warehouseMeasurements.id, measurementId),
        eq(warehouseProducts.warehouseId, warehouseId),
        isNull(warehouseMeasurements.deletedAt),
        isNull(warehouseProducts.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La medida no existe")
  return row
}

async function loadUnit(tx: Transaction, warehouseId: string, unitId: string) {
  const [row] = await tx
    .select({ id: warehouseStockUnits.id })
    .from(warehouseStockUnits)
    .innerJoin(
      warehouseMeasurements,
      eq(warehouseMeasurements.id, warehouseStockUnits.measurementId),
    )
    .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
    .where(and(eq(warehouseStockUnits.id, unitId), eq(warehouseProducts.warehouseId, warehouseId)))
    .limit(1)

  if (!row) throw new NotFoundError("La unidad no existe")
  return row
}

/**
 * Lo acuñado que sigue sin llegar, por almacén.
 *
 * Acuñar es prestación (`DEFECTS.md` M-04): cuando una cotización pide más de lo que hay, el
 * almacén lo trae de fuera. Esta es la otra mitad — la lista de lo comprometido que todavía no está
 * en el estante.
 *
 * **No es un filtro de la colección de unidades y es a propósito.** La maquinaria genérica compara
 * una columna con un valor, y esto son dos: nació acuñada **y** no ha llegado. Escribirlo como
 * filtro habría pedido doblar esa maquinaria, que toma columnas enteras por un motivo bien
 * explicado en `runtime/collection.ts`. Además, «pendientes de llegar» es una pregunta con nombre
 * propio y merece una ruta que se pueda permisar y probar por sí sola.
 */
export async function listPendingArrivals(
  actor: Actor,
  companyId: string,
  warehouseId: string,
): Promise<StockUnitRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const rows = await tx
      .select({ unit: warehouseStockUnits })
      .from(warehouseStockUnits)
      .innerJoin(
        warehouseMeasurements,
        eq(warehouseMeasurements.id, warehouseStockUnits.measurementId),
      )
      .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
      .where(
        and(
          eq(warehouseProducts.warehouseId, warehouseId),
          eq(warehouseStockUnits.createdByReservation, true),
          isNull(warehouseStockUnits.arrivedAt),
          isNull(warehouseStockUnits.deletedAt),
        ),
      )
      .orderBy(warehouseStockUnits.createdAt)

    return rows.map((row) => toRecord(row.unit))
  })
}

/**
 * Confirma que el equipo acuñado llegó.
 *
 * **No borra la marca de acuñada**, y eso no es un descuido: que la unidad naciera de un compromiso
 * sin respaldo físico sigue siendo cierto para siempre, y es lo que hace auditable el descuadre. Lo
 * que cambia es que deja de estar pendiente, con la fecha en que dejó de estarlo.
 *
 * Confirmar dos veces no mueve la fecha: la primera es la que vale, y volver a pulsar el botón no
 * puede reescribir cuándo llegó algo.
 */
export async function confirmArrival(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  unitIds: readonly string[],
): Promise<StockUnitRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const units = await tx
      .select({ id: warehouseStockUnits.id })
      .from(warehouseStockUnits)
      .innerJoin(
        warehouseMeasurements,
        eq(warehouseMeasurements.id, warehouseStockUnits.measurementId),
      )
      .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
      .where(
        and(
          eq(warehouseProducts.warehouseId, warehouseId),
          inArray(warehouseStockUnits.id, [...unitIds]),
          isNull(warehouseStockUnits.deletedAt),
        ),
      )

    if (units.length !== unitIds.length) {
      throw new NotFoundError("Alguna de las unidades no existe en este almacén")
    }

    const now = new Date()
    await tx
      .update(warehouseStockUnits)
      .set({ arrivedAt: now, updatedAt: now })
      .where(
        and(
          inArray(
            warehouseStockUnits.id,
            units.map((row) => row.id),
          ),
          isNull(warehouseStockUnits.arrivedAt),
        ),
      )

    const updated = await tx
      .select()
      .from(warehouseStockUnits)
      .where(
        inArray(
          warehouseStockUnits.id,
          units.map((row) => row.id),
        ),
      )

    return updated.map(toRecord)
  })
}

function toRecord(row: typeof warehouseStockUnits.$inferSelect): StockUnitRecord {
  return {
    id: row.id,
    measurementId: row.measurementId,
    code: row.code,
    status: row.status,
    createdByReservation: row.createdByReservation,
    arrivedAt: row.arrivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
