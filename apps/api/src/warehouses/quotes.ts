/**
 * Cotizaciones.
 *
 * Ver `openspec/specs/quotations/spec.md`. Rebanadas 13 y 14.
 *
 * El documento comercial del servicio: qué equipo, para cuándo, a qué precio y bajo qué
 * condiciones. Es lo que el cliente recibe, aprueba y a veces firma, así que sus cuatro bloques
 * —identidad, líneas, condiciones de pago e impuestos— se editan por separado, con su propio
 * permiso cada uno, porque los gestionan personas distintas.
 *
 * Dos cosas viven fuera de este archivo a propósito:
 *
 * - **El cálculo de los importes**, en `@tfv/contracts`, porque es una función pura que corre igual
 *   en el navegador y aquí.
 * - **El efecto sobre el inventario**, en `reservations.ts`, porque su corrección se razona sola.
 *
 * Lo que sí vive aquí es la **máquina de estados**, y el hecho de que cambiar de estado mueve el
 * inventario en la misma transacción.
 */

import {
  buildPage,
  ConflictError,
  isClosed,
  NotFoundError,
  needsWindow,
  newId,
  type Page,
  type ParsedQuery,
  QUOTE_STATUSES,
  type QuerySchema,
  type QuotationBreakdown,
  type QuotePaymentTerms,
  type QuoteStatus,
  type QuoteTaxes,
  type RateSchedule,
  type RentFrequency,
  resolveRate,
  TRADE_TYPES,
  TRANSITIONS,
  type TradeType,
  TYPE_ONLY,
  UnprocessableError,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import {
  counterparties,
  type QuoteContact,
  warehouseMeasurements,
  warehouseProductPrices,
  warehouseProducts,
  warehouseQuoteLines,
  warehouseQuotes,
  warehouseStockUnits,
  warehouses,
} from "@tfv/db/schema"
import { and, count, eq, inArray, isNull } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { breakdownOf, computeOf } from "./quote-pricing.ts"
import {
  checkCoherence,
  type Discrepancy,
  heldByQuote,
  pendingReturn,
  projectQuote,
  reconcileLine,
  registerReturn,
  releaseLine,
  reservedByLine,
  type UnitReturn,
} from "./reservations.ts"
import type { StockStatus } from "./stock.ts"
import { loadWarehouse } from "./warehouses.ts"

/**
 * La máquina de estados vive en `@tfv/contracts`.
 *
 * La interfaz ofrece sólo las transiciones posibles, así que necesita el mismo mapa que aplicamos
 * aquí. Se reexporta para que las rutas la sigan tomando de su servicio.
 */
export {
  allowedTransitions,
  isClosed,
  needsWindow,
  QUOTE_STATUSES,
  type QuoteStatus,
  RENT_FREQUENCIES,
  type RentFrequency,
  ROUND_DIRECTIONS,
  TRADE_TYPES,
  TRANSITIONS,
  type TradeType,
  TYPE_ONLY,
} from "@tfv/contracts"

export interface QuoteRecord {
  readonly id: string
  readonly warehouseId: string
  readonly orderId: string | null
  readonly clientId: string | null
  readonly responsibleId: string | null
  readonly code: string
  readonly folio: string
  readonly name: string
  readonly description: string
  readonly type: TradeType
  readonly status: QuoteStatus
  readonly priority: string
  readonly startsOn: Date | null
  readonly endsOn: Date | null
  readonly roundDays: boolean
  readonly roundDirection: "up" | "down"
  readonly clientContacts: readonly QuoteContact[]
  readonly sellerContacts: readonly QuoteContact[]
  readonly paymentTerms: QuotePaymentTerms | null
  readonly taxes: QuoteTaxes | null
  readonly alert: string | null
  readonly message: string | null
  readonly terms: string | null
  readonly observations: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

// ─── Consulta ────────────────────────────────────────────────────────────────

export const quoteQuery: QuerySchema = {
  filters: {
    status: { type: "enum", values: [...QUOTE_STATUSES], set: true, label: "Estado" },
    type: { type: "enum", values: [...TRADE_TYPES], label: "Tipo" },
    clientId: { type: "id", label: "Cliente" },
    responsibleId: { type: "id", label: "Responsable" },
    startsOn: { type: "date", range: true, label: "Inicio" },
    endsOn: { type: "date", range: true, label: "Fin" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["name", "description", "folio"],
  sortable: ["priority", "createdAt", "name", "folio"],
  defaultSort: [
    { field: "priority", direction: "desc" },
    { field: "createdAt", direction: "desc" },
  ],
}

const mapping = {
  fields: {
    status: warehouseQuotes.status,
    type: warehouseQuotes.type,
    clientId: warehouseQuotes.clientId,
    responsibleId: warehouseQuotes.responsibleId,
    startsOn: warehouseQuotes.startsOn,
    endsOn: warehouseQuotes.endsOn,
    createdAt: warehouseQuotes.createdAt,
    priority: warehouseQuotes.priority,
    name: warehouseQuotes.name,
    folio: warehouseQuotes.folio,
  },
  searchable: [warehouseQuotes.name, warehouseQuotes.description, warehouseQuotes.folio],
  tiebreak: warehouseQuotes.id,
}

export async function listQuotes(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  query: ParsedQuery,
): Promise<Page<QuoteRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const where = and(
      eq(warehouseQuotes.warehouseId, warehouseId),
      isNull(warehouseQuotes.deletedAt),
      ...collectionConditions(query, mapping),
    )

    const [total] = await tx.select({ value: count() }).from(warehouseQuotes).where(where)

    const rows = await tx
      .select()
      .from(warehouseQuotes)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    return buildPage(rows.map(toRecord), total?.value ?? 0, page, limit)
  })
}

export async function getQuote(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
): Promise<QuoteRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    return toRecord(await loadQuote(tx, warehouseId, quoteId))
  })
}

// ─── Alta ────────────────────────────────────────────────────────────────────

export interface CreateQuoteInput {
  readonly clientId?: string | undefined
  readonly responsibleId?: string | undefined
  readonly type: TradeType
  readonly name?: string | undefined
  readonly description?: string | undefined
  readonly startsOn?: Date | undefined
  readonly endsOn?: Date | undefined
  readonly roundDays?: boolean | undefined
  readonly roundDirection?: "up" | "down" | undefined
  readonly lines?: readonly QuoteLineInput[] | undefined
  readonly allowMinting?: boolean | undefined
}

/**
 * Crea una cotización.
 *
 * Nace **en el estado que corresponde**: con líneas, en progreso —ya hay equipo apartado y algo que
 * preparar—; sin ellas, pendiente. Y con líneas, el alta y la reserva se confirman juntas: si el
 * equipo no alcanza, no queda ni la cotización.
 *
 * El responsable por omisión es quien la crea. Es lo que hace que una cotización tenga siempre a
 * alguien detrás sin obligar a elegirlo en el formulario más común.
 */
export async function createQuote(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  input: CreateQuoteInput,
): Promise<QuoteRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    if (input.clientId) await assertClient(tx, companyId, input.clientId)

    const withLines = (input.lines ?? []).length > 0
    const status: QuoteStatus = withLines ? "in_progress" : "pending"
    if (withLines) assertWindow(input.type, status, input.startsOn ?? null, input.endsOn ?? null)

    const [row] = await tx
      .insert(warehouseQuotes)
      .values({
        id: newId(),
        warehouseId,
        clientId: input.clientId ?? null,
        responsibleId: input.responsibleId ?? actor.userId,
        code: quoteCode(),
        folio: await nextFolio(tx, warehouseId),
        name: input.name ?? "",
        description: input.description ?? "",
        type: input.type,
        status,
        startsOn: input.startsOn ?? null,
        endsOn: input.endsOn ?? null,
        roundDays: input.roundDays ?? false,
        roundDirection: input.roundDirection ?? "up",
      })
      .returning()

    if (!row) throw new Error("La cotización no se insertó")

    if (withLines) {
      await applyLines(tx, row.id, warehouseId, input.lines ?? [], {
        actorId: actor.userId,
        allowMinting: input.allowMinting ?? false,
      })
    }

    return toRecord(row)
  })
}

// ─── Edición ─────────────────────────────────────────────────────────────────

export interface UpdateQuoteInput {
  readonly clientId?: string | null | undefined
  readonly name?: string | undefined
  readonly description?: string | undefined
  readonly startsOn?: Date | null | undefined
  readonly endsOn?: Date | null | undefined
  readonly roundDays?: boolean | undefined
  readonly roundDirection?: "up" | "down" | undefined
  readonly alert?: string | null | undefined
  readonly message?: string | null | undefined
  readonly terms?: string | null | undefined
  readonly observations?: string | null | undefined
}

export async function updateQuote(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
  input: UpdateQuoteInput,
): Promise<QuoteRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const quote = await loadQuote(tx, warehouseId, quoteId)
    assertOpen(quote.status)

    if (input.clientId) await assertClient(tx, companyId, input.clientId)

    return toRecord(await patch(tx, quoteId, input))
  })
}

export async function setContacts(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
  input: {
    readonly clientContacts?: readonly QuoteContact[] | undefined
    readonly sellerContacts?: readonly QuoteContact[] | undefined
  },
): Promise<QuoteRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const quote = await loadQuote(tx, warehouseId, quoteId)
    assertOpen(quote.status)

    return toRecord(
      await patch(tx, quoteId, {
        ...(input.clientContacts ? { clientContacts: [...input.clientContacts] } : {}),
        ...(input.sellerContacts ? { sellerContacts: [...input.sellerContacts] } : {}),
      }),
    )
  })
}

export async function setPaymentTerms(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
  paymentTerms: QuotePaymentTerms | null,
): Promise<QuoteRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const quote = await loadQuote(tx, warehouseId, quoteId)
    assertOpen(quote.status)

    return toRecord(await patch(tx, quoteId, { paymentTerms }))
  })
}

export async function setTaxes(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
  taxes: QuoteTaxes | null,
): Promise<QuoteRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const quote = await loadQuote(tx, warehouseId, quoteId)
    assertOpen(quote.status)

    return toRecord(await patch(tx, quoteId, { taxes }))
  })
}

export async function setResponsible(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
  responsibleId: string,
): Promise<QuoteRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const quote = await loadQuote(tx, warehouseId, quoteId)
    assertOpen(quote.status)

    return toRecord(await patch(tx, quoteId, { responsibleId }))
  })
}

// ─── Estado ──────────────────────────────────────────────────────────────────

/**
 * Cambia el estado de una cotización.
 *
 * Tres comprobaciones antes de escribir, y las tres devuelven códigos distintos a propósito: una
 * transición no prevista es `409` —el documento está en otro sitio—, y una renta sin fechas es
 * `422` —la transición existe, pero al documento le falta un dato—.
 */
export async function changeQuoteStatus(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
  next: QuoteStatus,
): Promise<QuoteRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const quote = await loadQuote(tx, warehouseId, quoteId)

    assertTransition(quote.status, next, quote.type)
    assertWindow(quote.type, next, quote.startsOn, quote.endsOn)

    // Congelar **antes** de proyectar. Cerrar suelta el vínculo de lo vendido y lo cancelado, y la
    // cantidad de una línea es cuántas unidades tiene apartadas: calcular después congelaría ceros.
    const frozen =
      isClosed(next) && !quote.computed
        ? { computed: await computeOf(tx, quote), computedAt: new Date() }
        : {}

    // El estado y el inventario se confirman **juntos**: si algo falla, ni uno ni otro cambian.
    const updated = await patch(tx, quoteId, { status: next, ...frozen })
    await projectQuote(tx, quoteId, next, quote.type, actor.userId)

    return toRecord(updated)
  })
}

function assertTransition(current: QuoteStatus, next: QuoteStatus, type: TradeType): void {
  if (current === next) return

  const only = TYPE_ONLY[next]
  if (only && only !== type) {
    throw new ConflictError(
      `El estado «${next}» sólo existe en las cotizaciones de ${only === "rent" ? "renta" : "venta"}`,
    )
  }

  if (!TRANSITIONS[current].includes(next)) {
    throw new ConflictError(
      isClosed(current)
        ? "Una cotización cerrada no se reabre"
        : `No se puede pasar de «${current}» a «${next}»`,
    )
  }
}

/** Desde en progreso, una renta necesita su ventana: hay equipo comprometido para unos días. */
function assertWindow(
  type: TradeType,
  status: QuoteStatus,
  startsOn: Date | null,
  endsOn: Date | null,
): void {
  if (!needsWindow(status, type)) return
  if (startsOn && endsOn) return

  throw new UnprocessableError(
    "Una cotización de renta necesita sus fechas de inicio y fin para avanzar",
  )
}

function assertOpen(status: QuoteStatus): void {
  if (isClosed(status)) {
    throw new ConflictError("Una cotización cerrada no se modifica")
  }
}

// ─── Baja ────────────────────────────────────────────────────────────────────

/**
 * Da de baja una cotización y libera lo que tuviera apartado.
 *
 * **No se elimina con equipo sin devolver.** Una renta cuyo equipo sigue fuera no puede
 * desaparecer: el vínculo con la cotización es lo único que dice qué hay que reclamar y a quién.
 * Primero se registra el retorno.
 *
 * Lo vendido se respeta: ya no tiene vínculo vivo —la venta lo soltó al cerrarse— y sigue vendido.
 */
export async function deleteQuote(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadQuote(tx, warehouseId, quoteId)

    const outstanding = await pendingReturn(tx, quoteId)
    if (outstanding > 0) {
      throw new UnprocessableError(
        `Hay ${outstanding === 1 ? "una unidad" : `${outstanding} unidades`} sin devolver. ` +
          "Registra el retorno del equipo antes de dar de baja la cotización.",
      )
    }

    const lines = await tx
      .select({ id: warehouseQuoteLines.id })
      .from(warehouseQuoteLines)
      .where(eq(warehouseQuoteLines.quoteId, quoteId))

    for (const line of lines) {
      await releaseLine(tx, line.id, { actorId: actor.userId, quoteId })
    }

    await tx
      .update(warehouseQuotes)
      .set({ deletedAt: new Date(), orderId: null })
      .where(eq(warehouseQuotes.id, quoteId))
  })
}

// ─── Retorno y coherencia ────────────────────────────────────────────────────

export interface HeldUnit {
  readonly id: string
  readonly code: string
  readonly status: StockStatus
  readonly productName: string
  readonly measurementName: string
}

/**
 * El equipo que la cotización tiene apartado ahora mismo.
 *
 * Lo pide el registro del retorno —que exige nombrar unidad por unidad—, y con él la ficha puede
 * decir qué salió de la nave. Es la lista de vínculos vivos, así que lo ya devuelto no aparece.
 */
export async function quoteUnits(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
): Promise<HeldUnit[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadQuote(tx, warehouseId, quoteId)
    return heldByQuote(tx, quoteId)
  })
}

/**
 * Registra el retorno del equipo de una cotización de renta.
 *
 * Se puede registrar en varias tandas: el equipo no siempre vuelve el mismo día.
 */
export async function returnUnits(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
  units: readonly UnitReturn[],
): Promise<QuoteRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const quote = await loadQuote(tx, warehouseId, quoteId)

    if (quote.type !== "rent") {
      throw new UnprocessableError("Sólo vuelve el equipo de una cotización de renta")
    }

    await registerReturn(tx, quoteId, units, actor.userId)
    return toRecord(quote)
  })
}

/** La verificación de coherencia entre las reservas y el inventario de un almacén. */
export async function reservationCoherence(
  actor: Actor,
  companyId: string,
  warehouseId: string,
): Promise<Discrepancy[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    return checkCoherence(tx, warehouseId)
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/** Mismo alfabeto que el resto de códigos: sin caracteres que se confundan al dictarlos. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

function quoteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("")
}

/**
 * El folio siguiente del almacén.
 *
 * Es un número correlativo, y por eso hay que serializar la asignación: se toma el bloqueo de la
 * fila del almacén antes de contar, de modo que dos altas simultáneas no lean el mismo total. Es
 * una operación de baja frecuencia —se crean cotizaciones a mano—, así que serializar por almacén
 * no cuesta nada y evita tener que explicar por qué a veces falla la segunda.
 *
 * Cuenta **también las dadas de baja**, para que el correlativo no reutilice un número que ya
 * apareció en un documento impreso.
 */
async function nextFolio(tx: Transaction, warehouseId: string): Promise<string> {
  await tx
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(eq(warehouses.id, warehouseId))
    .for("update")

  const [total] = await tx
    .select({ value: count() })
    .from(warehouseQuotes)
    .where(eq(warehouseQuotes.warehouseId, warehouseId))

  return `COT-${String((total?.value ?? 0) + 1).padStart(4, "0")}`
}

async function patch(
  tx: Transaction,
  quoteId: string,
  values: Partial<typeof warehouseQuotes.$inferInsert>,
) {
  const [row] = await tx
    .update(warehouseQuotes)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(warehouseQuotes.id, quoteId))
    .returning()

  if (!row) throw new NotFoundError("La cotización no existe")
  return row
}

/** El cliente existe, es de esta empresa y es una contraparte de cliente. */
async function assertClient(tx: Transaction, companyId: string, clientId: string): Promise<void> {
  const [row] = await tx
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(
      and(
        eq(counterparties.id, clientId),
        eq(counterparties.companyId, companyId),
        isNull(counterparties.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El cliente no existe")
}

export async function loadQuote(tx: Transaction, warehouseId: string, quoteId: string) {
  const [row] = await tx
    .select()
    .from(warehouseQuotes)
    .where(
      and(
        eq(warehouseQuotes.id, quoteId),
        eq(warehouseQuotes.warehouseId, warehouseId),
        isNull(warehouseQuotes.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La cotización no existe")
  return row
}

function toRecord(row: typeof warehouseQuotes.$inferSelect): QuoteRecord {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    orderId: row.orderId,
    clientId: row.clientId,
    responsibleId: row.responsibleId,
    code: row.code,
    folio: row.folio ?? "",
    name: row.name,
    description: row.description,
    type: row.type,
    status: row.status,
    priority: row.priority ?? "0",
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    roundDays: row.roundDays,
    roundDirection: row.roundDirection,
    clientContacts: row.clientContacts,
    sellerContacts: row.sellerContacts,
    paymentTerms: row.paymentTerms,
    taxes: row.taxes,
    alert: row.alert,
    message: row.message,
    terms: row.terms,
    observations: row.observations,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─── Líneas ──────────────────────────────────────────────────────────────────

export interface QuoteLineRecord {
  readonly id: string
  readonly quoteId: string
  readonly measurementId: string
  /**
   * El producto y la medida, por su nombre.
   *
   * Van en la línea y no se consultan aparte por la misma razón que la localización por código
   * devuelve el camino entero: un identificador no le dice nada a quien lee el documento, y
   * resolverlos uno a uno convertiría una cotización de doce líneas en trece peticiones.
   */
  readonly measurementName: string
  readonly productId: string
  readonly productName: string
  readonly productCode: string
  readonly productPriceId: string | null
  readonly frequency: RentFrequency
  /**
   * La tarifa con la que se calculó esta línea, ya resuelta.
   *
   * Viaja con la línea porque el constructor previsualiza los importes mientras se edita, y tiene
   * que partir **exactamente** de lo que el servidor usó. Resolverla por su cuenta —o resolverla
   * contra otra lista de precios— produce un total distinto del que se acaba de guardar.
   */
  readonly basePrice: string
  readonly rent?: RateSchedule | undefined
  readonly penalty?: RateSchedule | undefined
  /** Unidades libres de esa medida, **sin contar las de esta línea**. El tope es ésta más aquéllas. */
  readonly available: number
  /** No es una columna: es **cuántas unidades tiene apartadas**. Ver `stock-reservation`. */
  readonly quantity: number
  readonly unitIds: readonly string[]
  readonly position: number
  readonly positionProduct: number
}

export interface QuoteLineInput {
  /** Presente: la línea ya existe y se actualiza. Ausente: se crea. */
  readonly id?: string | undefined
  readonly measurementId: string
  readonly quantity: number
  readonly frequency?: RentFrequency | undefined
  readonly productPriceId?: string | null | undefined
  readonly position?: number | undefined
  readonly positionProduct?: number | undefined
}

export async function listLines(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
): Promise<QuoteLineRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadQuote(tx, warehouseId, quoteId)
    return readLines(tx, quoteId)
  })
}

/**
 * Establece **de una vez** el conjunto completo de líneas de una cotización.
 *
 * Crea las nuevas, actualiza las presentes y elimina las ausentes, reconciliando las reservas de
 * cada una. Es una sola operación y no tres porque el conjunto es lo que tiene sentido: aplicar la
 * mitad dejaría una cotización que no es ni la de antes ni la que se pidió.
 *
 * **Todo en una transacción.** Si una línea no encuentra existencia, se revierte entera: ni las
 * líneas ni las reservas quedan a medias. Es el escenario que la spec llama «un fallo deja las
 * líneas como estaban», y es la razón de que la reconciliación viva aquí y no en el cliente.
 */
export async function setLines(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
  input: readonly QuoteLineInput[],
  allowMinting: boolean,
): Promise<QuoteLineRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const quote = await loadQuote(tx, warehouseId, quoteId)
    assertOpen(quote.status)

    await applyLines(tx, quoteId, warehouseId, input, { actorId: actor.userId, allowMinting })
    return readLines(tx, quoteId)
  })
}

/**
 * La reconciliación propiamente dicha, sin abrir transacción.
 *
 * Vive aparte porque el alta de una cotización con líneas la necesita dentro de **su** transacción:
 * crear la cotización y apartar su equipo tienen que confirmarse juntos.
 */
async function applyLines(
  tx: Transaction,
  quoteId: string,
  warehouseId: string,
  input: readonly QuoteLineInput[],
  options: { readonly actorId: string; readonly allowMinting: boolean },
): Promise<void> {
  const existing = await tx
    .select()
    .from(warehouseQuoteLines)
    .where(eq(warehouseQuoteLines.quoteId, quoteId))

  const known = new Map(existing.map((row) => [row.id, row]))
  const kept = new Set<string>()

  for (const [index, line] of input.entries()) {
    await assertMeasurement(tx, warehouseId, line.measurementId)
    if (line.productPriceId) await assertPrice(tx, warehouseId, line.productPriceId)

    const current = line.id ? known.get(line.id) : undefined
    if (line.id && !current) throw new NotFoundError("Alguna línea no existe en esta cotización")

    const values = {
      measurementId: line.measurementId,
      productPriceId: line.productPriceId ?? null,
      frequency: line.frequency ?? "weekly",
      position: line.position ?? index,
      positionProduct: line.positionProduct ?? index,
    }

    const lineId = current?.id ?? newId()
    if (current) {
      await tx
        .update(warehouseQuoteLines)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(warehouseQuoteLines.id, lineId))
    } else {
      await tx.insert(warehouseQuoteLines).values({ id: lineId, quoteId, ...values })
    }
    kept.add(lineId)

    await reconcileLine(tx, lineId, line.quantity, {
      quoteId,
      measurementId: line.measurementId,
      actorId: options.actorId,
      allowMinting: options.allowMinting,
    })
  }

  const dropped = existing.filter((row) => !kept.has(row.id))
  for (const row of dropped) {
    await releaseLine(tx, row.id, { actorId: options.actorId, quoteId })
  }
  if (dropped.length > 0) {
    await tx.delete(warehouseQuoteLines).where(
      inArray(
        warehouseQuoteLines.id,
        dropped.map((row) => row.id),
      ),
    )
  }
}

async function readLines(tx: Transaction, quoteId: string): Promise<QuoteLineRecord[]> {
  const rows = await tx
    .select({
      line: warehouseQuoteLines,
      measurementName: warehouseMeasurements.name,
      priceDifference: warehouseMeasurements.priceDifference,
      productId: warehouseProducts.id,
      productName: warehouseProducts.name,
      productCode: warehouseProducts.code,
      productPrice: warehouseProducts.price,
      rate: warehouseProductPrices,
    })
    .from(warehouseQuoteLines)
    .innerJoin(
      warehouseMeasurements,
      eq(warehouseMeasurements.id, warehouseQuoteLines.measurementId),
    )
    .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
    .leftJoin(
      warehouseProductPrices,
      eq(warehouseProductPrices.id, warehouseQuoteLines.productPriceId),
    )
    .where(eq(warehouseQuoteLines.quoteId, quoteId))
    .orderBy(warehouseQuoteLines.positionProduct, warehouseQuoteLines.position)

  const reserved = await reservedByLine(tx, quoteId)
  const free = await freeUnits(
    tx,
    rows.map((row) => row.line.measurementId),
  )

  return rows.map(({ line, priceDifference, productPrice, rate, ...names }) => {
    const unitIds = reserved.get(line.id) ?? []
    return {
      id: line.id,
      quoteId: line.quoteId,
      measurementId: line.measurementId,
      ...names,
      productPriceId: line.productPriceId,
      frequency: line.frequency,
      // La misma regla que usa el motor al calcular. Ver `resolveRate` y `quote-pricing.ts`.
      ...resolveRate({ productPrice, priceDifference, ...(rate ? { listed: rate } : {}) }),
      available: free.get(line.measurementId) ?? 0,
      quantity: unitIds.length,
      unitIds,
      position: line.position,
      positionProduct: line.positionProduct,
    }
  })
}

/** Unidades disponibles por medida. Las que no aparecen no tienen ninguna. */
async function freeUnits(
  tx: Transaction,
  measurementIds: readonly string[],
): Promise<Map<string, number>> {
  if (measurementIds.length === 0) return new Map()

  const rows = await tx
    .select({ measurementId: warehouseStockUnits.measurementId, value: count() })
    .from(warehouseStockUnits)
    .where(
      and(
        inArray(warehouseStockUnits.measurementId, [...measurementIds]),
        eq(warehouseStockUnits.status, "available"),
        isNull(warehouseStockUnits.deletedAt),
      ),
    )
    .groupBy(warehouseStockUnits.measurementId)

  return new Map(rows.map((row) => [row.measurementId, row.value]))
}

/** La medida existe y pertenece a un producto de este almacén. */
async function assertMeasurement(
  tx: Transaction,
  warehouseId: string,
  measurementId: string,
): Promise<void> {
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
}

/** La tarifa existe y es de un producto de este almacén. */
async function assertPrice(
  tx: Transaction,
  warehouseId: string,
  productPriceId: string,
): Promise<void> {
  const [row] = await tx
    .select({ id: warehouseProductPrices.id })
    .from(warehouseProductPrices)
    .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseProductPrices.productId))
    .where(
      and(
        eq(warehouseProductPrices.id, productPriceId),
        eq(warehouseProducts.warehouseId, warehouseId),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La tarifa no existe")
}

// ─── Importes ────────────────────────────────────────────────────────────────

/**
 * El desglose de una cotización, con cada paso intermedio.
 *
 * Es **la única fuente del importe**. La interfaz consume esta misma cadena a través de la función
 * pura de los contratos, así que previsualizar y guardar dan lo mismo; y nada de lo que llegue del
 * navegador entra en el cálculo, que es lo que corrige `DEFECTS.md` M-06.
 */
export async function quoteBreakdown(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
): Promise<QuotationBreakdown> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    return breakdownOf(tx, await loadQuote(tx, warehouseId, quoteId))
  })
}
