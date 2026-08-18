/**
 * Pagos cobrados contra una cotización.
 *
 * Ver `openspec/specs/quotations/spec.md`, requisito «Registro de pago contra la cotización».
 *
 * ## Qué distingue esto del anticipo
 *
 * El **anticipo** vive en las condiciones de pago: es lo que se pactó, y por eso mueve el total del
 * documento. Un pago de aquí es dinero que **entró**. Pactar no es cobrar, y confundirlos hace que
 * el sistema no sepa responder a la única pregunta que importa cuando alguien llama preguntando por
 * su cuenta: cuánto falta.
 *
 * De ahí que el saldo se cuente desde el **bruto** y no desde el total: el total ya descontó el
 * anticipo pactado, y volver a descontar lo cobrado contaría dos veces el mismo dinero cuando el
 * anticipo se cobra, que es el caso normal.
 *
 * ## Se cobra también con la cotización cerrada
 *
 * Al revés que las líneas y las condiciones. Una renta que terminó se sigue pagando, y un documento
 * que no admite el cobro obligaría a reabrirlo —que es justamente lo que no se puede hacer— o a
 * llevar la cuenta fuera del sistema.
 *
 * ## Sin comprobantes, a propósito
 *
 * La spec pide que el comprobante sea consultable y **eso no se cumple todavía**: no existe
 * almacenamiento de ficheros. La tabla de comprobantes está en el esquema esperando a la rebanada
 * que lo traiga. Se decidió que el registro entrara antes, porque llevar la cuenta a mano mientras
 * tanto es peor que llevarla sin el papel escaneado.
 */

import { NotFoundError, newId } from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import { users, warehouseQuotePayments } from "@tfv/db/schema"
import { desc, eq } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { loadQuote } from "./quotes.ts"
import { loadWarehouse } from "./warehouses.ts"

export const PAYMENT_METHODS = ["card", "cash", "transfer"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export interface PaymentRecord {
  readonly id: string
  readonly quoteId: string
  readonly amount: string
  readonly method: PaymentMethod
  readonly description: string | null
  readonly paidById: string | null
  /** Quién lo registró, por su nombre. Un identificador no dice nada en un listado de cobros. */
  readonly paidByName: string | null
  readonly createdAt: Date
}

export interface PaymentInput {
  readonly amount: string
  readonly method: PaymentMethod
  readonly description?: string | undefined
}

/**
 * Los pagos de una cotización, del más reciente al más antiguo.
 *
 * Ese orden y no el contrario: quien abre la ficha quiere ver lo último que entró.
 */
export async function listPayments(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
): Promise<PaymentRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadQuote(tx, warehouseId, quoteId)
    return readPayments(tx, quoteId)
  })
}

export async function registerPayment(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
  input: PaymentInput,
): Promise<PaymentRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    // Sin `assertOpen`: cobrar es lo único que una cotización cerrada sigue admitiendo.
    await loadQuote(tx, warehouseId, quoteId)

    const id = newId()
    await tx.insert(warehouseQuotePayments).values({
      id,
      quoteId,
      amount: input.amount,
      method: input.method,
      description: input.description ?? null,
      paidById: actor.userId,
    })

    const [payment] = await readPayments(tx, quoteId, id)
    if (!payment) throw new NotFoundError("El pago no se pudo leer después de registrarlo")
    return payment
  })
}

/**
 * Da de baja un pago.
 *
 * **Es una baja, no una reversa.** Sin asiento contable detrás, un importe mal tecleado y sin
 * manera de corregirlo es peor que la pérdida de historia; el día que exista un libro de verdad,
 * esto pasa a ser un movimiento en sentido contrario y esta función desaparece.
 */
export async function deletePayment(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
  paymentId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadQuote(tx, warehouseId, quoteId)

    const [removed] = await tx
      .delete(warehouseQuotePayments)
      .where(eq(warehouseQuotePayments.id, paymentId))
      .returning({ id: warehouseQuotePayments.id, quoteId: warehouseQuotePayments.quoteId })

    if (!removed || removed.quoteId !== quoteId) {
      throw new NotFoundError("El pago no existe en esta cotización")
    }
  })
}

async function readPayments(
  tx: Transaction,
  quoteId: string,
  paymentId?: string,
): Promise<PaymentRecord[]> {
  const rows = await tx
    .select({ payment: warehouseQuotePayments, paidByName: users.name })
    .from(warehouseQuotePayments)
    .leftJoin(users, eq(users.id, warehouseQuotePayments.paidById))
    .where(
      paymentId === undefined
        ? eq(warehouseQuotePayments.quoteId, quoteId)
        : eq(warehouseQuotePayments.id, paymentId),
    )
    .orderBy(desc(warehouseQuotePayments.createdAt))

  return rows.map((row) => ({
    id: row.payment.id,
    quoteId: row.payment.quoteId,
    amount: row.payment.amount,
    method: row.payment.method,
    description: row.payment.description,
    paidById: row.payment.paidById,
    paidByName: row.paidByName,
    createdAt: row.payment.createdAt,
  }))
}
