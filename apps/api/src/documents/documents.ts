/**
 * Documentos generados.
 *
 * Ver `openspec/specs/pdf-documents/spec.md`.
 *
 * La spec describe **seis familias** de documentos. Aquí están las cuatro que hoy tienen algo
 * detrás —la cotización, la nota de entrega, el plan de trabajo y el presupuesto— y el reparto por
 * el que entrarán las otras dos: el recibo de venta y el instructivo de armado, con Pixit (24 a 26).
 *
 * El presupuesto es la única que **no tiene entidad**: es una lectura derivada de una producción, y
 * su referencia señala la producción dos veces. Ver `budgets.ts`.
 *
 * El reparto vive en un `switch` sobre la familia que trae la referencia firmada, y no en una tabla
 * de manejadores registrables, por lo mismo que el registro de rutas: **se lee de arriba abajo y
 * dice exactamente qué está servido**. Una familia sin manejador no es un enlace que falle raro,
 * es un `404` como cualquier otro.
 */

import {
  type BudgetDocument,
  type DeliveryNoteDocument,
  NotFoundError,
  type QuoteDocument,
  type WorkPlanDocument,
} from "@tfv/contracts"
import { budgetDocumentByReference } from "./budgets.ts"
import { deliveryNoteByReference } from "./delivery-notes.ts"
import { quoteDocumentByReference } from "./quotes.ts"
import { DOCUMENT_NOT_FOUND, verifyReference } from "./reference.ts"
import { workPlanDocumentByReference } from "./work-plans.ts"

/**
 * Lo que se sirve por un enlace público.
 *
 * **Unión discriminada por `kind`**, que es como el navegador elige qué hoja dibujar: quien la
 * consume tiene que mirar la etiqueta antes de leer nada, en vez de dar por hecho la cotización
 * porque era la única. Añadir una familia es añadir un miembro aquí y un caso en el `switch`; las
 * dos que faltan esperan a sus rebanadas.
 */
export type PublicDocument =
  | QuoteDocument
  | DeliveryNoteDocument
  | WorkPlanDocument
  | BudgetDocument

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

    case "work-plan":
      return workPlanDocumentByReference(reference)

    case "budget":
      return budgetDocumentByReference(reference)

    // Las otras dos familias esperan a Pixit. Mientras tanto, su referencia no se puede ni emitir
    // —nadie llama a `signReference` con ellas— y aquí no hay nada que servir.
    default:
      throw new NotFoundError(DOCUMENT_NOT_FOUND)
  }
}
