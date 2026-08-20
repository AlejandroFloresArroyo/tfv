/**
 * El documento de un plan de trabajo.
 *
 * Ver `openspec/specs/pdf-documents/spec.md` y el requisito «Documento y enlace del plan».
 *
 * Es la **segunda** familia de documentos que se sirve, y no construye maquinaria nueva: reutiliza
 * la referencia firmada de `reference.ts` —donde `work-plan` ya tenía su código de familia desde el
 * primer día— y entra por el mismo `switch` de `documents.ts` y el mismo enlace público. Una segunda
 * forma de compartir sería una segunda superficie sin sesión que auditar.
 *
 * El reparto es el mismo que en la cotización: este módulo **lee**, `composeWorkPlanDocument` —que
 * es pura y vive en `@tfv/contracts`— dispone, y el navegador dibuja. Por eso previsualizar,
 * imprimir y descargar no pueden diferir: no hay dos representaciones que mantener de acuerdo.
 *
 * ## El ámbito del sobre es la producción
 *
 * La referencia lleva tres identificadores —empresa, ámbito y documento—. Aquí el ámbito es la
 * **producción** y el documento el **plan**, igual que allí eran el almacén y la cotización. Así el
 * enlace queda acotado sin necesitar una tabla que alguien tenga que limpiar.
 */

import {
  composeWorkPlanDocument,
  type DocumentParty,
  NotFoundError,
  sceneLabel,
  toInstant,
  toNullableInstant,
  type WorkPlanDocument,
  type WorkPlanScene,
  type WorkPlanTaskInput,
} from "@tfv/contracts"
import { type Transaction, withRequester, withSystem } from "@tfv/db"
import {
  companies,
  productionCategories,
  productionChapters,
  productionCharacters,
  productionScenes,
  productions,
  productionTaskActivities,
  productionTasks,
  type productionWorkflows,
  users,
} from "@tfv/db/schema"
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { loadProduction } from "../productions/productions.ts"
import { loadWorkflow } from "../productions/workflows.ts"
import { DOCUMENT_NOT_FOUND, type DocumentReference, signReference } from "./reference.ts"

/** El documento y el enlace con el que se comparte. */
export interface WorkPlanDocumentResult {
  readonly document: WorkPlanDocument
  readonly reference: string
}

/**
 * El documento de un plan, para quien tiene sesión.
 *
 * Devuelve además la referencia del enlace público, porque quien mira el documento es quien lo va a
 * repartir al equipo. Es estable: pedirlo dos veces da el mismo enlace.
 */
export async function workPlanDocument(
  actor: Actor,
  companyId: string,
  productionId: string,
  workflowId: string,
): Promise<WorkPlanDocumentResult> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const workflow = await loadWorkflow(tx, productionId, workflowId)

    return {
      document: await compose(tx, companyId, productionId, workflow),
      reference: signReference({
        kind: "work-plan",
        companyId,
        scopeId: productionId,
        documentId: workflowId,
      }),
    }
  })
}

/**
 * El documento por su enlace, para quien no tiene cuenta.
 *
 * **El alcance sale del sobre firmado, no de la petición.** La empresa que se declara aquí es la que
 * nosotros metimos en la referencia al emitirla, así que `withSystem` no confía en quien llama:
 * declara lo que ya firmó. Las políticas del motor siguen aplicándose, que es la diferencia con
 * eludirlas — y lo que hace que un fallo en este archivo no pueda enseñar el plan de otra empresa.
 *
 * Un plan dado de baja sale por donde una referencia inventada: `404`, sin decir cuál de las dos
 * cosas era.
 */
export async function workPlanDocumentByReference(
  reference: DocumentReference,
): Promise<WorkPlanDocument> {
  return withSystem("documento_publico", [reference.companyId], async (tx) => {
    try {
      const workflow = await loadWorkflow(tx, reference.scopeId, reference.documentId)
      return await compose(tx, reference.companyId, reference.scopeId, workflow)
    } catch {
      throw new NotFoundError(DOCUMENT_NOT_FOUND)
    }
  })
}

// ─── Composición ─────────────────────────────────────────────────────────────

async function compose(
  tx: Transaction,
  companyId: string,
  productionId: string,
  workflow: typeof productionWorkflows.$inferSelect,
): Promise<WorkPlanDocument> {
  const [issuer, production, scene, responsibleName, tasks] = await Promise.all([
    issuerOf(tx, companyId),
    productionOf(tx, productionId),
    sceneOf(tx, workflow.sceneId),
    nameOf(tx, workflow.responsibleId),
    tasksOf(tx, workflow.id),
  ])

  return composeWorkPlanDocument({
    identity: {
      code: workflow.code,
      status: workflow.status,
      observations: workflow.observations,
      // La columna admite nulo por herencia del trasvase; el servicio siempre la escribe. El
      // documento la declara obligatoria para que la hoja no tenga que decidir qué imprimir.
      scheduledFor: toInstant(workflow.scheduledFor ?? workflow.createdAt),
      endsAt: toNullableInstant(workflow.endsAt),
      generatedAt: new Date().toISOString(),
    },
    issuer,
    production,
    scene,
    responsibleName,
    tasks,
  })
}

async function issuerOf(tx: Transaction, companyId: string): Promise<DocumentParty> {
  const [row] = await tx
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  return { name: row?.name ?? "", contacts: [] }
}

async function productionOf(
  tx: Transaction,
  productionId: string,
): Promise<{ id: string; name: string }> {
  const [row] = await tx
    .select({ id: productions.id, name: productions.name })
    .from(productions)
    .where(eq(productions.id, productionId))
    .limit(1)

  if (!row) throw new NotFoundError(DOCUMENT_NOT_FOUND)
  return row
}

async function sceneOf(tx: Transaction, sceneId: string | null): Promise<WorkPlanScene | null> {
  if (sceneId === null) return null

  const [row] = await tx
    .select({
      id: productionScenes.id,
      name: productionScenes.name,
      index: productionScenes.index,
      chapterName: productionChapters.name,
      chapterIndex: productionChapters.index,
    })
    .from(productionScenes)
    .innerJoin(productionChapters, eq(productionChapters.id, productionScenes.chapterId))
    .where(and(eq(productionScenes.id, sceneId), isNull(productionScenes.deletedAt)))
    .limit(1)

  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    label: sceneLabel(row.chapterIndex, row.index),
    chapterName: row.chapterName,
  }
}

async function nameOf(tx: Transaction, userId: string | null): Promise<string | null> {
  if (userId === null) return null

  const [row] = await tx
    .select({ name: users.name, lastname: users.lastname })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!row) return null
  const full = [row.name, row.lastname].join(" ").trim()
  return full === "" ? null : full
}

/**
 * Las tareas del plan, con lo que el documento nombra.
 *
 * El recuento de actividades viene en la misma tanda y no una consulta por tarea: un plan de
 * cuarenta tareas serían cuarenta y una consultas para imprimir una hoja.
 */
async function tasksOf(tx: Transaction, workflowId: string): Promise<WorkPlanTaskInput[]> {
  const rows = await tx
    .select({
      id: productionTasks.id,
      title: productionTasks.title,
      description: productionTasks.description,
      status: productionTasks.status,
      scheduledFor: productionTasks.scheduledFor,
      endsAt: productionTasks.endsAt,
      responsibleName: users.name,
      responsibleLastname: users.lastname,
      categoryName: productionCategories.name,
      characterName: productionCharacters.name,
    })
    .from(productionTasks)
    .leftJoin(users, eq(users.id, productionTasks.responsibleId))
    .leftJoin(productionCategories, eq(productionCategories.id, productionTasks.categoryId))
    .leftJoin(productionCharacters, eq(productionCharacters.id, productionTasks.characterId))
    .where(and(eq(productionTasks.workflowId, workflowId), isNull(productionTasks.deletedAt)))
    .orderBy(asc(productionTasks.scheduledFor), asc(productionTasks.createdAt))

  const activities = await activityTally(
    tx,
    rows.map((row) => row.id),
  )

  return rows.map((row) => {
    const tally = activities.get(row.id)
    const responsible = [row.responsibleName ?? "", row.responsibleLastname ?? ""].join(" ").trim()

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      scheduledFor: toNullableInstant(row.scheduledFor),
      endsAt: toNullableInstant(row.endsAt),
      responsibleName: responsible === "" ? null : responsible,
      categoryName: row.categoryName,
      characterName: row.characterName,
      activityCount: tally?.total ?? 0,
      completedActivities: tally?.completed ?? 0,
    }
  })
}

/** Actividades por tarea, total y completadas, en una sola consulta agrupada. */
async function activityTally(
  tx: Transaction,
  taskIds: readonly string[],
): Promise<Map<string, { total: number; completed: number }>> {
  const tally = new Map<string, { total: number; completed: number }>()
  if (taskIds.length === 0) return tally

  const rows = await tx
    .select({
      taskId: productionTaskActivities.taskId,
      status: productionTaskActivities.status,
      value: count(),
    })
    .from(productionTaskActivities)
    .where(
      and(
        inArray(productionTaskActivities.taskId, taskIds),
        isNull(productionTaskActivities.deletedAt),
      ),
    )
    .groupBy(productionTaskActivities.taskId, productionTaskActivities.status)

  for (const row of rows) {
    const current = tally.get(row.taskId) ?? { total: 0, completed: 0 }
    tally.set(row.taskId, {
      total: current.total + row.value,
      completed: current.completed + (row.status === "completed" ? row.value : 0),
    })
  }

  return tally
}
