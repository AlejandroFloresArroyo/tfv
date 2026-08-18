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
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
  type QuotePaymentTerms,
  type QuoteTaxes,
  UnprocessableError,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import { counterparties, type QuoteContact, warehouseQuotes, warehouses } from "@tfv/db/schema"
import { and, count, eq, isNull } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { loadWarehouse } from "./warehouses.ts"

export const QUOTE_STATUSES = [
  "pre_quote",
  "pending",
  "in_progress",
  "in_rent",
  "completed",
  "sold",
  "canceled",
] as const

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

export const TRADE_TYPES = ["rent", "sale"] as const
export type TradeType = (typeof TRADE_TYPES)[number]

export const ROUND_DIRECTIONS = ["up", "down"] as const

/**
 * Estados cerrados: el documento terminó, con efecto o sin él.
 *
 * De aquí no se sale. Reabrir una cotización completada significaría recalcular importes que el
 * cliente ya firmó y volver a comprometer equipo que ya salió.
 */
const CLOSED: readonly QuoteStatus[] = ["completed", "sold", "canceled"]

/**
 * Las transiciones previstas. Lo que no está aquí responde `409`.
 *
 * Hacia atrás entre estados abiertos **sí** se puede —una cotización en progreso que el cliente
 * deja en el aire vuelve a pendiente—, porque nada se ha consumido todavía. Lo que no se deshace
 * es cerrar.
 */
const TRANSITIONS: Readonly<Record<QuoteStatus, readonly QuoteStatus[]>> = {
  pre_quote: ["pending", "in_progress", "canceled"],
  pending: ["pre_quote", "in_progress", "canceled"],
  in_progress: ["pending", "in_rent", "completed", "sold", "canceled"],
  in_rent: ["completed", "canceled"],
  completed: [],
  sold: [],
  canceled: [],
}

/** Estados que sólo tienen sentido en un tipo de cotización. */
const TYPE_ONLY: Partial<Record<QuoteStatus, TradeType>> = {
  in_rent: "rent",
  sold: "sale",
}

/** Desde aquí, una renta necesita su ventana de fechas: hay equipo comprometido para unos días. */
const NEEDS_WINDOW: readonly QuoteStatus[] = ["in_progress", "in_rent", "completed"]

export function isClosed(status: QuoteStatus): boolean {
  return CLOSED.includes(status)
}

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
}

/**
 * Crea una cotización.
 *
 * Nace **pendiente**: sin líneas no hay nada que preparar. Aportarlas es una operación aparte, y es
 * la que la lleva a en progreso.
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
        status: "pending",
        startsOn: input.startsOn ?? null,
        endsOn: input.endsOn ?? null,
        roundDays: input.roundDays ?? false,
        roundDirection: input.roundDirection ?? "up",
      })
      .returning()

    if (!row) throw new Error("La cotización no se insertó")
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
    if (quote.type === "rent" && NEEDS_WINDOW.includes(next) && !(quote.startsOn && quote.endsOn)) {
      throw new UnprocessableError(
        "Una cotización de renta necesita sus fechas de inicio y fin para avanzar",
      )
    }

    return toRecord(await patch(tx, quoteId, { status: next }))
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

function assertOpen(status: QuoteStatus): void {
  if (isClosed(status)) {
    throw new ConflictError("Una cotización cerrada no se modifica")
  }
}

// ─── Baja ────────────────────────────────────────────────────────────────────

export async function deleteQuote(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadQuote(tx, warehouseId, quoteId)

    await tx
      .update(warehouseQuotes)
      .set({ deletedAt: new Date() })
      .where(eq(warehouseQuotes.id, quoteId))
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
