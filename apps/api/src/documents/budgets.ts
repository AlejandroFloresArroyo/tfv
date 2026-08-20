/**
 * El documento del presupuesto de una producción.
 *
 * Ver `openspec/specs/pdf-documents/spec.md` y el requisito «Documento del presupuesto» de
 * `production-budget`: la hoja muestra «anclas y compras con sus totales y su diferencia».
 *
 * Es la **cuarta** familia de documentos que se sirve, y no construye maquinaria nueva: `budget` ya
 * tenía su código de familia en `reference.ts` desde el primer día, y entra por el mismo `switch`
 * de `documents.ts` y el mismo enlace público que la cotización, la nota de entrega y el plan de
 * trabajo. Una segunda forma de compartir sería una segunda superficie sin sesión que auditar.
 *
 * ## El presupuesto no es una entidad, y la referencia lo dice
 *
 * El sobre firmado lleva tres identificadores —empresa, ámbito y documento—. En las otras familias
 * el tercero es una fila: la cotización, la nota, el plan. Aquí **no hay fila que señalar**: el
 * presupuesto es una lectura derivada de una producción entera. Así que el ámbito y el documento
 * son los dos la producción, que es exactamente lo que este documento es —el presupuesto **de**
 * esa producción— y deja el enlace estable sin inventar una tabla para poder firmarlo.
 *
 * ## La hoja no lleva filtros
 *
 * La lectura del presupuesto sí acepta filtros, y devuelve los totales del filtro junto a los
 * generales. El documento **no**: quien recibe un enlace público no ve la barra de filtros ni sabe
 * cuál se aplicó, y una hoja cuyos totales dependen de un parámetro invisible es una hoja de la que
 * no se puede uno fiar. Se imprime la producción entera.
 */

import {
  type BudgetDocument,
  composeBudgetDocument,
  NotFoundError,
  toNullableInstant,
} from "@tfv/contracts"
import { type Transaction, withRequester, withSystem } from "@tfv/db"
import { companies, type productions } from "@tfv/db/schema"
import { eq } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { budgetContents } from "../productions/budget.ts"
import { loadProduction } from "../productions/productions.ts"
import { DOCUMENT_NOT_FOUND, type DocumentReference, signReference } from "./reference.ts"

/** El documento y el enlace con el que se comparte. */
export interface BudgetDocumentResult {
  readonly document: BudgetDocument
  readonly reference: string
}

/**
 * El presupuesto como documento, para quien tiene sesión.
 *
 * Devuelve además la referencia del enlace público, porque quien mira el presupuesto es quien lo va
 * a mandar a la productora. Es estable: pedirlo dos veces da el mismo enlace.
 */
export async function budgetDocument(
  actor: Actor,
  companyId: string,
  productionId: string,
): Promise<BudgetDocumentResult> {
  return withRequester(actor, async (tx) => {
    const production = await loadProduction(tx, companyId, productionId)

    return {
      document: await compose(tx, companyId, production),
      reference: signReference({
        kind: "budget",
        companyId,
        scopeId: productionId,
        documentId: productionId,
      }),
    }
  })
}

/**
 * El documento por su enlace, para quien no tiene cuenta.
 *
 * **El alcance sale del sobre firmado, no de la petición.** La empresa que se declara aquí es la
 * que nosotros metimos en la referencia al emitirla, así que `withSystem` no confía en quien llama:
 * declara lo que ya firmó. Las políticas del motor siguen aplicándose.
 *
 * Una producción dada de baja sale por donde una referencia inventada: `404`, sin decir cuál de las
 * dos cosas era.
 */
export async function budgetDocumentByReference(
  reference: DocumentReference,
): Promise<BudgetDocument> {
  return withSystem("documento_publico", [reference.companyId], async (tx) => {
    try {
      const production = await loadProduction(tx, reference.companyId, reference.documentId)
      return await compose(tx, reference.companyId, production)
    } catch {
      throw new NotFoundError(DOCUMENT_NOT_FOUND)
    }
  })
}

// ─── Composición ─────────────────────────────────────────────────────────────

async function compose(
  tx: Transaction,
  companyId: string,
  production: typeof productions.$inferSelect,
): Promise<BudgetDocument> {
  const [issuerName, contents] = await Promise.all([
    issuerOf(tx, companyId),
    budgetContents(tx, production.id),
  ])

  return composeBudgetDocument({
    identity: {
      productionName: production.name,
      startsOn: toNullableInstant(production.startsOn),
      endsOn: toNullableInstant(production.endsOn),
      generatedAt: new Date().toISOString(),
    },
    issuer: { name: issuerName },
    production: { id: production.id, name: production.name },
    anchors: contents.anchors.map((anchor) => ({
      id: anchor.id,
      name: anchor.name,
      description: anchor.description,
      amount: anchor.amount,
      categoryId: anchor.categoryId,
      categoryName: anchor.categoryName,
      responsibleName: anchor.responsibleName,
    })),
    shoppings: contents.shoppings.map((shopping) => ({
      id: shopping.id,
      name: shopping.name,
      observations: shopping.observations,
      amount: shopping.amount,
      kind: shopping.kind,
      method: shopping.method,
      cardLast4: shopping.cardLast4,
      isDeductible: shopping.isDeductible,
      occurredOn: toNullableInstant(shopping.occurredOn),
      providerName: shopping.providerName,
      categoryId: shopping.categoryId,
      categoryName: shopping.categoryName,
      responsibleName: shopping.responsibleName,
      itemCount: shopping.items.length,
    })),
  })
}

async function issuerOf(tx: Transaction, companyId: string): Promise<string> {
  const [row] = await tx
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  return row?.name ?? ""
}
