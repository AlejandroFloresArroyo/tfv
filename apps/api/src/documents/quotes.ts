/**
 * El documento de una cotización.
 *
 * Ver `openspec/specs/pdf-documents/spec.md`, requisitos «El documento refleja los datos vigentes»
 * y «Contenido de la cotización».
 *
 * Este módulo **no calcula importes ni los dispone**. Lee de la base lo que el documento nombra
 * —las partes, las líneas con su producto y su medida— y se lo entrega a `composeQuoteDocument`,
 * que es pura y vive en `@tfv/contracts` porque el navegador dibuja lo que ésta compone.
 *
 * Los importes salen de `breakdownOf`, que es la misma función que alimenta la ficha: **congelados
 * si la cotización lo está, recalculados si sigue abierta**. Es exactamente el requisito de los
 * datos vigentes, y por eso no se reimplementa aquí — una segunda lectura del catálogo daría un
 * documento que contradice a la pantalla desde la que se imprimió (`HALLAZGOS.md` H-14).
 */

import {
  composeQuoteDocument,
  type DocumentParty,
  NotFoundError,
  type QuoteDocument,
  toInstant,
} from "@tfv/contracts"
import { type Transaction, withRequester, withSystem } from "@tfv/db"
import {
  companies,
  companyAddresses,
  counterparties,
  warehouseMeasurements,
  warehouseProducts,
  warehouseQuoteLines,
  type warehouseQuotes,
} from "@tfv/db/schema"
import { and, eq } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { breakdownOf } from "../warehouses/quote-pricing.ts"
import { loadQuote } from "../warehouses/quotes.ts"
import { reservedByLine } from "../warehouses/reservations.ts"
import { loadWarehouse } from "../warehouses/warehouses.ts"
import { DOCUMENT_NOT_FOUND, type DocumentReference, signReference } from "./reference.ts"

/** El documento y el enlace con el que se comparte. */
export interface QuoteDocumentResult {
  readonly document: QuoteDocument
  readonly reference: string
}

/**
 * El documento de una cotización, para quien tiene sesión.
 *
 * Devuelve además la referencia del enlace público, porque quien mira el documento es quien lo va a
 * mandar. Es estable: pedirlo dos veces da el mismo enlace.
 */
export async function quoteDocument(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
): Promise<QuoteDocumentResult> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const quote = await loadQuote(tx, warehouseId, quoteId)

    return {
      document: await compose(tx, companyId, quote),
      reference: signReference({
        kind: "quote",
        companyId,
        scopeId: warehouseId,
        documentId: quoteId,
      }),
    }
  })
}

/**
 * El documento de una cotización, para quien llega por el enlace y no tiene cuenta.
 *
 * **El alcance sale del sobre firmado, no de la petición.** La empresa que se declara aquí es la
 * que nosotros metimos en la referencia al emitirla, así que `withSystem` no está confiando en
 * quien llama: está declarando lo que ya firmó. Las políticas del motor siguen aplicándose, que es
 * la diferencia con eludirlas — y lo que hace que un fallo en este archivo no pueda enseñar el
 * documento de otra empresa.
 *
 * Una cotización dada de baja sale por donde una referencia inventada: `404`, sin decir cuál de las
 * dos cosas era.
 */
export async function quoteDocumentByReference(
  reference: DocumentReference,
): Promise<QuoteDocument> {
  return withSystem("documento_publico", [reference.companyId], async (tx) => {
    const quote = await loadDocumentQuote(tx, reference)
    return compose(tx, reference.companyId, quote)
  })
}

/** La cotización del sobre. Cualquier tropiezo es el mismo `404` que una referencia inventada. */
async function loadDocumentQuote(tx: Transaction, reference: DocumentReference) {
  try {
    return await loadQuote(tx, reference.scopeId, reference.documentId)
  } catch {
    throw new NotFoundError(DOCUMENT_NOT_FOUND)
  }
}

// ─── Composición ─────────────────────────────────────────────────────────────

async function compose(
  tx: Transaction,
  companyId: string,
  quote: typeof warehouseQuotes.$inferSelect,
): Promise<QuoteDocument> {
  const [issuer, client, lines, breakdown] = await Promise.all([
    issuerOf(tx, companyId, quote),
    clientOf(tx, quote),
    linesOf(tx, quote.id),
    breakdownOf(tx, quote),
  ])

  return composeQuoteDocument({
    identity: {
      folio: quote.folio ?? "",
      code: quote.code,
      name: quote.name,
      description: quote.description,
      status: quote.status,
      issuedOn: toInstant(quote.createdAt),
      generatedAt: new Date().toISOString(),
    },
    issuer,
    client,
    type: quote.type,
    startsOn: quote.startsOn ? toInstant(quote.startsOn) : null,
    endsOn: quote.endsOn ? toInstant(quote.endsOn) : null,
    lines,
    breakdown,
    payment: quote.paymentTerms,
    taxes: quote.taxes,
    terms: quote.terms,
    observations: quote.observations,
    message: quote.message,
  })
}

/** Quién emite: la empresa, con su domicilio principal y los contactos que la cotización declara. */
async function issuerOf(
  tx: Transaction,
  companyId: string,
  quote: typeof warehouseQuotes.$inferSelect,
): Promise<DocumentParty> {
  const [company] = await tx
    .select({ name: companies.name, email: companies.email })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  const [address] = await tx
    .select()
    .from(companyAddresses)
    .where(and(eq(companyAddresses.companyId, companyId), eq(companyAddresses.isPrimary, true)))
    .limit(1)

  const line = address ? formatAddress(address) : ""

  return {
    name: company?.name ?? "",
    ...(company?.email ? { email: company.email } : {}),
    ...(line ? { address: line } : {}),
    contacts: quote.sellerContacts,
  }
}

/**
 * A quién va: la contraparte, por su copia de datos.
 *
 * Se lee **sin excluir las dadas de baja**: el documento es histórico, y una cotización de hace un
 * año no debe quedarse sin cliente porque alguien limpió la cartera. Es la misma razón por la que
 * la contraparte guarda una copia de los datos en lugar de apuntar sólo a la empresa.
 */
async function clientOf(
  tx: Transaction,
  quote: typeof warehouseQuotes.$inferSelect,
): Promise<DocumentParty | null> {
  if (!quote.clientId) return null

  const [row] = await tx
    .select({ alias: counterparties.alias, snapshot: counterparties.snapshot })
    .from(counterparties)
    .where(eq(counterparties.id, quote.clientId))
    .limit(1)

  if (!row) return null

  const person = [row.snapshot.name, row.snapshot.lastname].filter(Boolean).join(" ").trim()

  return {
    name: row.snapshot.companyName || person || row.alias,
    ...(row.snapshot.taxId ? { taxId: row.snapshot.taxId } : {}),
    ...(row.snapshot.email ? { email: row.snapshot.email } : {}),
    ...(row.snapshot.phone ? { phone: row.snapshot.phone } : {}),
    ...(row.snapshot.address ? { address: row.snapshot.address } : {}),
    contacts: quote.clientContacts,
  }
}

/**
 * Las líneas, con lo que el documento nombra y **la cantidad que de verdad sujetan**.
 *
 * La cantidad no se lee de una columna: es cuántas unidades tiene apartadas la línea, la misma
 * cifra que ve el almacén y con la que se calculó el importe. Ver `stock-reservation`.
 */
async function linesOf(tx: Transaction, quoteId: string) {
  const rows = await tx
    .select({
      id: warehouseQuoteLines.id,
      frequency: warehouseQuoteLines.frequency,
      position: warehouseQuoteLines.position,
      positionProduct: warehouseQuoteLines.positionProduct,
      measurementName: warehouseMeasurements.name,
      productId: warehouseProducts.id,
      productName: warehouseProducts.name,
      productCode: warehouseProducts.code,
    })
    .from(warehouseQuoteLines)
    .innerJoin(
      warehouseMeasurements,
      eq(warehouseMeasurements.id, warehouseQuoteLines.measurementId),
    )
    .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
    .where(eq(warehouseQuoteLines.quoteId, quoteId))
    .orderBy(warehouseQuoteLines.positionProduct, warehouseQuoteLines.position)

  const reserved = await reservedByLine(tx, quoteId)

  return rows.map((row) => ({ ...row, quantity: (reserved.get(row.id) ?? []).length }))
}

/** El domicilio en una línea, saltándose lo que esté vacío. */
function formatAddress(address: typeof companyAddresses.$inferSelect): string {
  const street = [address.street, address.number].filter(Boolean).join(" ").trim()
  const postal = address.postalCode ? `C.P. ${address.postalCode}` : ""

  return [street, address.colony, address.city, address.state, postal, address.country]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ")
}
