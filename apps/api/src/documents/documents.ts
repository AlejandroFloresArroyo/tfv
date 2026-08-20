/**
 * Documentos generados.
 *
 * Ver `openspec/specs/pdf-documents/spec.md`.
 *
 * La spec describe **seis familias** de documentos. Aquí está la única que hoy tiene entidad detrás
 * —la cotización— y el reparto por el que entrarán las otras cinco: nota de entrega y plan de
 * trabajo con producciones (20 y 22), presupuesto con la 22, recibo de venta e instructivo de
 * armado con Pixit (24 a 26).
 *
 * El reparto vive en un `switch` sobre la familia que trae la referencia firmada, y no en una tabla
 * de manejadores registrables, por lo mismo que el registro de rutas: **se lee de arriba abajo y
 * dice exactamente qué está servido**. Una familia sin manejador no es un enlace que falle raro,
 * es un `404` como cualquier otro.
 */

import { NotFoundError, type QuoteDocument, type WorkPlanDocument } from "@tfv/contracts"
import { quoteDocumentByReference } from "./quotes.ts"
import { DOCUMENT_NOT_FOUND, verifyReference } from "./reference.ts"
import { workPlanDocumentByReference } from "./work-plans.ts"

/**
 * Lo que se sirve por un enlace público.
 *
 * Ya es la unión discriminada que se anunciaba: **`kind` es lo que el navegador mira** para elegir
 * qué hoja dibujar, y añadir una familia es añadir un miembro aquí y un caso en el `switch`. Las
 * cuatro que faltan esperan a sus rebanadas.
 */
export type PublicDocument = QuoteDocument | WorkPlanDocument

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

    case "work-plan":
      return workPlanDocumentByReference(reference)

    // Las otras cuatro familias esperan a sus rebanadas. Mientras tanto, su referencia no se puede
    // ni emitir —nadie llama a `signReference` con ellas— y aquí no hay nada que servir.
    default:
      throw new NotFoundError(DOCUMENT_NOT_FOUND)
  }
}
