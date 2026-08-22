import { type ApiResult, apiGet } from "~/lib/api.server.ts"
import type { ProductionBreakdown } from "../../../production.ts"
import { type BreakdownLevels, resolveBreakdownLevels } from "./chapter-scene-data.ts"

/**
 * La versión de servidor de `resolveBreakdownLevels`: una sola llamada a `/breakdown`, y la
 * resolución pura sobre lo que responda. La usan las dos pantallas —la del nivel principal y la de
 * un nodo concreto—, así que vive aparte de ambas.
 *
 * Separado de `chapter-scene-data.ts` por lo mismo que separa a `category-data.ts` de `tree.ts`: lo
 * de aquí necesita `next/headers` a través de `apiGet`, y eso no se puede probar con `vitest` fuera
 * de una petición real. Lo que sí se prueba —`resolveBreakdownLevels`— no depende de esto.
 */

export type ApiFailureResult = Extract<ApiResult<unknown>, { ok: false }>

/** Que el nodo no esté en la estructura se trata como el `404` de la API: esta app no tiene otro. */
export const BREAKDOWN_NODE_NOT_FOUND: ApiFailureResult = {
  ok: false,
  status: 404,
  message: "El capítulo o la escena no existen",
}

export interface BreakdownLevelsResult extends BreakdownLevels {
  readonly failure: ApiFailureResult | null
}

export async function loadBreakdownLevels(
  companyId: string,
  productionId: string,
  nodeId?: string,
): Promise<BreakdownLevelsResult> {
  const result = await apiGet<ProductionBreakdown>(
    `/companies/${companyId}/productions/${productionId}/breakdown`,
  )

  if (!result.ok) return { roots: [], path: [], children: [], failure: result }

  const levels = resolveBreakdownLevels(result.data, nodeId)
  const failure = nodeId !== undefined && levels.path.length === 0 ? BREAKDOWN_NODE_NOT_FOUND : null

  return { ...levels, failure }
}
