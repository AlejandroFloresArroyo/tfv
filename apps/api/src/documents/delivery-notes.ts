/**
 * El documento de una nota de entrega.
 *
 * Ver `openspec/specs/pdf-documents/spec.md` y `production-inventory`, requisito «Documento y
 * enlace de la nota». Es la segunda familia de documentos que tiene entidad detrás.
 *
 * Reutiliza **entera** la maquinaria de la cotización: la misma referencia firmada
 * (`reference.ts`), la misma puerta pública (`documents.ts`) y la misma división de trabajo —el
 * servidor arma el modelo, el navegador lo dibuja—. No se construye una segunda: dos formas de
 * firmar un enlace es como acaba habiendo una que caduca y otra que no.
 *
 * ## Qué es el ámbito de la referencia
 *
 * `scopeId` es **la producción**, como en la cotización lo es el almacén. La referencia queda
 * `(delivery-note, empresa, producción, nota)`, y el enlace es estable: pedirlo dos veces da lo
 * mismo.
 *
 * ## Los trazos de las firmas viajan como direcciones, no como identificadores
 *
 * Quien abre el enlace no tiene sesión y no puede resolver un `uploadId` contra nada. Se resuelven
 * aquí, a la vez que el resto del documento, que es también lo que garantiza que la hoja impresa y
 * la de pantalla enseñen lo mismo.
 */

import {
  composeDeliveryNoteDocument,
  type DeliveryNoteDocument,
  type DeliveryNoteRow,
  type DocumentParty,
  NotFoundError,
  toInstant,
} from "@tfv/contracts"
import { type Transaction, withRequester, withSystem } from "@tfv/db"
import {
  companies,
  companyAddresses,
  productionCategories,
  type productionDeliveries,
  productionDeliveryLines,
  productionItems,
  productions,
  uploads,
  users,
} from "@tfv/db/schema"
import { and, asc, eq, inArray } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { loadDelivery } from "../productions/deliveries.ts"
import { loadProduction } from "../productions/productions.ts"
import { DOCUMENT_NOT_FOUND, type DocumentReference, signReference } from "./reference.ts"

/** El documento y el enlace con el que se comparte. */
export interface DeliveryNoteDocumentResult {
  readonly document: DeliveryNoteDocument
  readonly reference: string
}

/**
 * El documento de una nota, para quien tiene sesión.
 *
 * Devuelve además la referencia del enlace público, porque quien mira el documento es quien lo va a
 * mandar — al chofer, a la bodega, a quien recibió.
 */
export async function deliveryNoteDocument(
  actor: Actor,
  companyId: string,
  productionId: string,
  deliveryId: string,
): Promise<DeliveryNoteDocumentResult> {
  return withRequester(actor, async (tx) => {
    const production = await loadProduction(tx, companyId, productionId)
    const delivery = await loadDelivery(tx, productionId, deliveryId)

    return {
      document: await compose(tx, companyId, production.name, delivery),
      reference: signReference({
        kind: "delivery-note",
        companyId,
        scopeId: productionId,
        documentId: deliveryId,
      }),
    }
  })
}

/**
 * El documento de una nota, para quien llega por el enlace y no tiene cuenta.
 *
 * **El alcance sale del sobre firmado, no de la petición**, igual que en la cotización:
 * `withSystem` no está confiando en quien llama, está declarando lo que nosotros mismos firmamos al
 * emitir el enlace. Las políticas del motor siguen puestas, que es lo que hace que un error de este
 * archivo no pueda enseñar la nota de otra empresa.
 *
 * Una nota dada de baja sale por donde una referencia inventada: `404`, sin decir cuál de las dos
 * cosas era.
 */
export async function deliveryNoteByReference(
  reference: DocumentReference,
): Promise<DeliveryNoteDocument> {
  return withSystem("documento_publico", [reference.companyId], async (tx) => {
    try {
      const [production] = await tx
        .select({ name: productions.name })
        .from(productions)
        .where(eq(productions.id, reference.scopeId))
        .limit(1)

      const delivery = await loadDelivery(tx, reference.scopeId, reference.documentId)
      return await compose(tx, reference.companyId, production?.name ?? "", delivery)
    } catch {
      throw new NotFoundError(DOCUMENT_NOT_FOUND)
    }
  })
}

// ─── Composición ─────────────────────────────────────────────────────────────

async function compose(
  tx: Transaction,
  companyId: string,
  productionName: string,
  delivery: typeof productionDeliveries.$inferSelect,
): Promise<DeliveryNoteDocument> {
  const [issuer, lines, people, signatures] = await Promise.all([
    issuerOf(tx, companyId),
    linesOf(tx, delivery.id),
    namesOf(tx, [delivery.responsibleId, delivery.signedById]),
    signatureUrls(tx, [delivery.signatureUploadId, delivery.receiverSignatureUploadId]),
  ])

  return composeDeliveryNoteDocument({
    identity: {
      name: delivery.name,
      description: delivery.description,
      status: delivery.status,
      direction: delivery.direction,
      generatedAt: new Date().toISOString(),
    },
    issuer,
    productionName,
    responsibleName: delivery.responsibleId ? (people.get(delivery.responsibleId) ?? null) : null,
    lines,
    signatures: {
      isSigned: delivery.signedAt !== null,
      deliveredByName: delivery.signedById ? (people.get(delivery.signedById) ?? null) : null,
      receiverName: delivery.receiverName,
      signedAt: delivery.signedAt ? toInstant(delivery.signedAt) : null,
      deliveredSignatureUrl: delivery.signatureUploadId
        ? (signatures.get(delivery.signatureUploadId) ?? null)
        : null,
      receiverSignatureUrl: delivery.receiverSignatureUploadId
        ? (signatures.get(delivery.receiverSignatureUploadId) ?? null)
        : null,
    },
  })
}

/** Quién emite: la empresa, con su domicilio principal. Sin contactos: una nota no los declara. */
async function issuerOf(tx: Transaction, companyId: string): Promise<DocumentParty> {
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
    contacts: [],
  }
}

/**
 * Las piezas de la nota, por nombre.
 *
 * Por nombre y no por el orden en que se fueron añadiendo: quien coteja la hoja contra una caja
 * abierta lee buscando, y buscar en una lista sin orden es leerla entera cada vez.
 */
async function linesOf(tx: Transaction, deliveryId: string): Promise<readonly DeliveryNoteRow[]> {
  const rows = await tx
    .select({
      line: productionDeliveryLines,
      item: productionItems,
      categoryName: productionCategories.name,
    })
    .from(productionDeliveryLines)
    .innerJoin(productionItems, eq(productionItems.id, productionDeliveryLines.itemId))
    .leftJoin(productionCategories, eq(productionCategories.id, productionItems.categoryId))
    .where(eq(productionDeliveryLines.deliveryId, deliveryId))
    .orderBy(asc(productionItems.name), asc(productionDeliveryLines.id))

  const verifiers = await namesOf(
    tx,
    rows.map((row) => row.line.verifiedById),
  )

  return rows.map((row) => ({
    lineId: row.line.id,
    itemName: row.item.name,
    itemCode: row.item.code,
    categoryName: row.categoryName,
    itemStatus: row.item.status,
    isVerified: row.line.isVerified,
    verifiedByName: row.line.verifiedById ? (verifiers.get(row.line.verifiedById) ?? null) : null,
    verifiedAt: row.line.verifiedAt ? toInstant(row.line.verifiedAt) : null,
    returnCondition: row.line.returnCondition,
  }))
}

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

/** Los trazos, resueltos a direcciones: quien abre el enlace no puede resolver un identificador. */
async function signatureUrls(
  tx: Transaction,
  uploadIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, string>> {
  const wanted = [...new Set(uploadIds.filter((id): id is string => id !== null))]
  if (wanted.length === 0) return new Map()

  const rows = await tx
    .select({ id: uploads.id, url: uploads.url })
    .from(uploads)
    .where(inArray(uploads.id, wanted))

  return new Map(rows.map((row) => [row.id, row.url]))
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
