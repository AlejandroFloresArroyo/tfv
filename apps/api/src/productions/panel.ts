/**
 * El panel de una producción.
 *
 * Ver `openspec/specs/production-management/spec.md`, requisito «Panel de la producción». Rebanada
 * 20.
 *
 * La spec pide cuatro cosas y sólo cuatro: número de capítulos y escenas, jornadas de rodaje por
 * estado, planes de trabajo por estado, y la diferencia entre lo presupuestado y lo gastado. Eso es
 * lo que hay aquí, ni una cifra más.
 *
 * ## Por qué el panel resume cosas que esta rebanada no construye
 *
 * Porque el panel **no es dueño de nada**: es una lectura sobre tablas que ya existen desde la
 * `0002`. Capítulos y escenas son de la rebanada 21; jornadas, de la parte de continuidad; el
 * presupuesto, de la 22. Ninguna tiene todavía su módulo, y aun así sus filas se pueden contar.
 *
 * La alternativa era dejar el panel para después. No compensa: el resumen es lo primero que ve
 * quien abre una producción, y devolver ceros de verdad es más honesto —y más útil el día que otra
 * rebanada empiece a llenarlas— que no devolver nada. Lo que **no** se hace es inventar cifras: el
 * presupuesto se calcula con la fórmula que la spec transcribe, y ninguna otra.
 *
 * ## El presupuesto es una resta, no una entidad
 *
 * `production-budget` lo dice y lo transcribe:
 *
 * ```
 * totalPresupuestado = Σ importe de las anclas
 * totalGastado       = Σ importe de las compras
 * diferencia         = totalPresupuestado − totalGastado
 * ```
 *
 * La resta se hace con la aritmética decimal de `@tfv/contracts`, no con coma flotante ni con la
 * suma del motor pasada a número: es dinero, y la regla del proyecto no tiene excepciones. Sumar en
 * SQL sí —`numeric` es exacto—, pero lo que vuelve es una cadena decimal y como tal se trata.
 */

import { formatMoney, money, subtract } from "@tfv/contracts"
import { withRequester } from "@tfv/db"
import {
  productionAnchors,
  productionChapters,
  productionRecordings,
  productionScenes,
  productionShoppings,
  productionWorkflows,
} from "@tfv/db/schema"
import { and, count, eq, isNull, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { loadProduction } from "./productions.ts"
import { WORKFLOW_STATUSES, type WorkflowStatus } from "./workflows.ts"

/** Los tres estados de una jornada de rodaje. Vienen del modelo, no de aquí. */
export const RECORDING_STATUSES = ["draft", "ongoing", "completed"] as const

export type RecordingStatus = (typeof RECORDING_STATUSES)[number]

export interface ProductionPanel {
  readonly chapters: number
  readonly scenes: number
  readonly recordings: Readonly<Record<RecordingStatus, number>>
  readonly workflows: Readonly<Record<WorkflowStatus, number>>
  /** Los tres importes, como cadena decimal. La diferencia puede ser negativa. */
  readonly budget: {
    readonly anchored: string
    readonly spent: string
    readonly difference: string
  }
}

export async function productionPanel(
  actor: Actor,
  companyId: string,
  productionId: string,
): Promise<ProductionPanel> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const [chapters] = await tx
      .select({ value: count() })
      .from(productionChapters)
      .where(
        and(
          eq(productionChapters.productionId, productionId),
          isNull(productionChapters.deletedAt),
        ),
      )

    const [scenes] = await tx
      .select({ value: count() })
      .from(productionScenes)
      .innerJoin(productionChapters, eq(productionChapters.id, productionScenes.chapterId))
      .where(
        and(
          eq(productionChapters.productionId, productionId),
          isNull(productionScenes.deletedAt),
          isNull(productionChapters.deletedAt),
        ),
      )

    const recordingRows = await tx
      .select({ status: productionRecordings.status, value: count() })
      .from(productionRecordings)
      .where(
        and(
          eq(productionRecordings.productionId, productionId),
          isNull(productionRecordings.deletedAt),
        ),
      )
      .groupBy(productionRecordings.status)

    const workflowRows = await tx
      .select({ status: productionWorkflows.status, value: count() })
      .from(productionWorkflows)
      .where(
        and(
          eq(productionWorkflows.productionId, productionId),
          isNull(productionWorkflows.deletedAt),
        ),
      )
      .groupBy(productionWorkflows.status)

    // `coalesce` en el motor: sin filas, `sum` devuelve nulo, y un presupuesto vacío es cero, no
    // «no se sabe».
    const [anchored] = await tx
      .select({ value: sql<string>`coalesce(sum(${productionAnchors.amount}), 0)::text` })
      .from(productionAnchors)
      .where(
        and(eq(productionAnchors.productionId, productionId), isNull(productionAnchors.deletedAt)),
      )

    const [spent] = await tx
      .select({ value: sql<string>`coalesce(sum(${productionShoppings.amount}), 0)::text` })
      .from(productionShoppings)
      .where(
        and(
          eq(productionShoppings.productionId, productionId),
          isNull(productionShoppings.deletedAt),
        ),
      )

    const budgeted = money(anchored?.value ?? "0")
    const executed = money(spent?.value ?? "0")

    return {
      chapters: chapters?.value ?? 0,
      scenes: scenes?.value ?? 0,
      recordings: tally(RECORDING_STATUSES, recordingRows),
      workflows: tally(WORKFLOW_STATUSES, workflowRows),
      budget: {
        anchored: formatMoney(budgeted),
        spent: formatMoney(executed),
        difference: formatMoney(subtract(budgeted, executed)),
      },
    }
  })
}

/**
 * El desglose completo, con los estados sin filas en cero.
 *
 * `computed-fields` lo exige para el desglose de tareas y vale igual aquí: un panel que omite los
 * estados vacíos obliga a quien lo pinta a saberse la lista, y el día que aparezca un estado nuevo
 * la pantalla lo ignoraría en silencio.
 */
function tally<T extends string>(
  statuses: readonly T[],
  rows: readonly { status: string; value: number }[],
): Record<T, number> {
  const result = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<T, number>
  for (const row of rows) {
    if ((statuses as readonly string[]).includes(row.status)) result[row.status as T] = row.value
  }
  return result
}
