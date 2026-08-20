/**
 * Documentos generados.
 *
 * Ver `openspec/specs/pdf-documents/spec.md`.
 *
 * La spec describe **seis familias** de documentos. Aquí están las dos que hoy tienen entidad detrás
 * —la cotización y la nota de entrega— y el reparto por el que entrarán las otras cuatro: plan de
 * trabajo y presupuesto con la 22, recibo de venta e instructivo de armado con Pixit (24 a 26).
 *
 * El reparto vive en un `switch` sobre la familia que trae la referencia firmada, y no en una tabla
 * de manejadores registrables, por lo mismo que el registro de rutas: **se lee de arriba abajo y
 * dice exactamente qué está servido**. Una familia sin manejador no es un enlace que falle raro,
 * es un `404` como cualquier otro.
 */

import { type DeliveryNoteDocument, NotFoundError, type QuoteDocument } from "@tfv/contracts"
import { deliveryNoteByReference } from "./delivery-notes.ts"
import { quoteDocumentByReference } from "./quotes.ts"
import { DOCUMENT_NOT_FOUND, verifyReference } from "./reference.ts"

/**
 * Lo que se sirve por un enlace público.
 *
 * **Unión discriminada por `kind`**, que es como el navegador elige qué dibujar. Con dos miembros
 * ya se comporta como tal: quien la consume tiene que mirar la etiqueta antes de leer nada, en vez
 * de dar por hecho la cotización porque era la única.
 */
export type PublicDocument = QuoteDocument | DeliveryNoteDocument

/**
 * Resuelve el documento al que apunta una referencia pública.
 *
 * **Es la única puerta sin sesión de este módulo.** Todo lo que no verifique —referencia inventada,
 * alterada, de una familia que todavía no existe, o de un documento dado de baja— sale por el mismo
 * sitio y con el mismo mensaje.
 */
export async function publicDocument(raw: string): Promise<PublicDocument> {
  const reference = verifyReference(raw)
  if (!reference) throw new NotFoundError(DOCUMENT_NOT_FOUND)

  switch (reference.kind) {
    case "quote":
      return quoteDocumentByReference(reference)

    case "delivery-note":
      return deliveryNoteByReference(reference)

    // Las otras cuatro familias esperan a sus rebanadas. Mientras tanto, su referencia no se puede
    // ni emitir —nadie llama a `signReference` con ellas— y aquí no hay nada que servir.
    default:
      throw new NotFoundError(DOCUMENT_NOT_FOUND)
  }
}
