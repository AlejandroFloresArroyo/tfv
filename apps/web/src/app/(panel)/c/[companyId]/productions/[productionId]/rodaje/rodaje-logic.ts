/**
 * Lógica pura del rodaje.
 *
 * Aquí y no en el componente, por la misma razón que `components/collection/params.ts`: son
 * transformaciones sobre datos que ya llegaron, y comprobarlas no necesita un navegador.
 */

import type { CharacterRow, ContinuityRow, PropRow } from "../../production.ts"

/**
 * El reparto de una jornada, partido en quien ya tiene continuidad y quien todavía no.
 *
 * `assignCharacters` es **aditiva**: nunca quita a quien ya está asignado
 * (`apps/api/src/productions/continuity.ts`, la función del mismo nombre). Por eso quien ya tiene
 * continuidad se enseña aparte, sin casilla que desmarcar — desmarcarla no lo quitaría, y parecería
 * que sí. Quitar a alguien es otra acción, sobre su propia continuidad.
 */
export function castRoster(
  characters: readonly CharacterRow[],
  continuities: readonly ContinuityRow[],
): { readonly assigned: readonly CharacterRow[]; readonly available: readonly CharacterRow[] } {
  const already = new Set(
    continuities
      .map((continuity) => continuity.characterId)
      .filter((id): id is string => id !== null),
  )

  return {
    assigned: characters.filter((character) => already.has(character.id)),
    available: characters.filter((character) => !already.has(character.id)),
  }
}

/**
 * La utilería de una continuidad, partida por tipo.
 *
 * Cada pieza es de un artículo **o** de un video, nunca de los dos — lo garantiza el servidor con
 * un camino por tipo, no una comprobación que se pueda olvidar. Aquí se respeta esa forma al
 * agrupar en vez de mezclarlas en una sola lista, donde un video podría acabar leído como artículo.
 */
export function partitionProps(props: readonly PropRow[]): {
  readonly items: readonly PropRow[]
  readonly videos: readonly PropRow[]
} {
  return {
    items: props.filter((prop) => prop.kind === "item"),
    videos: props.filter((prop) => prop.kind === "video"),
  }
}
