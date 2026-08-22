/**
 * El rodaje, en lo que se puede probar sin un navegador.
 *
 * Dos transformaciones puras, las dos sobre datos que ya llegaron de la API:
 *
 * - **El reparto pendiente.** `assignCharacters` es aditiva —nunca quita a quien ya tiene
 *   continuidad, `apps/api/src/productions/continuity.ts:475`—, así que la pantalla tiene que
 *   distinguir quién ya está de quién falta, y no ofrecer a quien ya está como si desmarcarlo
 *   fuera a quitarlo.
 * - **La utilería por tipo.** Cada pieza es de un artículo o de un video, nunca de los dos a la
 *   vez —la restricción `production_props_item_xor_video` del motor, y del lado del servidor un
 *   camino por tipo en vez de uno que reciba los dos—. Aquí se comprueba que la pantalla respeta
 *   esa forma al agrupar: un video nunca aparece entre los artículos, y al revés.
 */

import { describe, expect, it } from "vitest"
import type { CharacterRow, ContinuityRow, PropRow } from "../../production.ts"
import { castRoster, partitionProps } from "./rodaje-logic.ts"

function character(id: string, name: string): CharacterRow {
  return {
    id,
    productionId: "p1",
    name,
    description: "",
    imageUploadId: null,
    imageUrl: null,
    imageThumbnailUrl: null,
    responsibleId: null,
    responsibleName: null,
    continuityCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function continuity(id: string, characterId: string | null): ContinuityRow {
  return {
    id,
    recordingId: "r1",
    characterId,
    characterName: null,
    responsibleId: null,
    responsibleName: null,
    props: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function prop(id: string, kind: PropRow["kind"]): PropRow {
  return {
    id,
    continuityId: "c1",
    kind,
    itemId: kind === "item" ? "i1" : null,
    videoId: kind === "video" ? "v1" : null,
    name: kind === "item" ? "Chamarra de mezclilla" : "Referencia de peinado",
    code: kind === "item" ? "ABCD1234EFGH" : null,
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

describe("el reparto pendiente de una jornada", () => {
  const elena = character("elena", "Elena")
  const tomas = character("tomas", "Tomás")
  const marta = character("marta", "Marta")

  it("separa a quien ya tiene continuidad de quien todavía no", () => {
    const roster = castRoster([elena, tomas, marta], [continuity("c1", "tomas")])

    expect(roster.assigned.map((one) => one.id)).toEqual(["tomas"])
    expect(roster.available.map((one) => one.id)).toEqual(["elena", "marta"])
  })

  it("una continuidad sin personaje no oculta a nadie", () => {
    const roster = castRoster([elena], [continuity("c1", null)])

    expect(roster.available.map((one) => one.id)).toEqual(["elena"])
  })

  it("con el reparto entero asignado no queda nadie disponible", () => {
    const roster = castRoster(
      [elena, tomas],
      [continuity("c1", "elena"), continuity("c2", "tomas")],
    )

    expect(roster.available).toHaveLength(0)
    expect(roster.assigned).toHaveLength(2)
  })
})

describe("la utilería de una continuidad, por tipo", () => {
  it("separa artículos de videos sin mezclarlos", () => {
    const chamarra = prop("p1", "item")
    const referencia = prop("p2", "video")

    const partition = partitionProps([chamarra, referencia])

    expect(partition.items).toEqual([chamarra])
    expect(partition.videos).toEqual([referencia])
  })

  it("sin utilería, las dos listas están vacías", () => {
    expect(partitionProps([])).toEqual({ items: [], videos: [] })
  })

  it("varios artículos y ningún video quedan todos del lado de los artículos", () => {
    const uno = prop("p1", "item")
    const dos = prop("p2", "item")

    const partition = partitionProps([uno, dos])

    expect(partition.items).toHaveLength(2)
    expect(partition.videos).toHaveLength(0)
  })
})
