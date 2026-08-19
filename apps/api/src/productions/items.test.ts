/**
 * Inventario de una producción, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/production-inventory/spec.md`. Rebanada 22,
 * bloque de inventario.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { describe, expect, it } from "vitest"
import { canTransition, ITEM_STATUSES, type ItemStatus } from "./items.ts"

// ─── La tabla de transiciones ────────────────────────────────────────────────

/**
 * Las ocho por las ocho, sin excepción.
 *
 * La spec enumera los estados y **no dice qué pasa a qué**; el criterio está adoptado y escrito en
 * `items.ts`. Se ejerce entero —sesenta y cuatro celdas— y no por muestreo: una tabla de
 * transiciones probada a medias es igual de peligrosa que ninguna, porque lo que se cuela es
 * justamente la celda que nadie escribió.
 */
describe("la tabla de transiciones", () => {
  const INCIDENTS: readonly ItemStatus[] = ["damaged", "incomplete", "lost", "robbed"]

  /**
   * Lo esperado, escrito **desde las reglas** y no desde la tabla, para que no se prueben iguales.
   *
   * Las reglas **se suman, no se excluyen**: que un artículo dañado se repare y vuelva a disponible
   * no impide devolverlo dañado a su dueño, que es lo que se hace con la utilería rentada que se
   * rompió. Escribirlas como cascada —la primera que casa decide— es el error que esta prueba
   * cometió en su primera versión, y dio cuatro celdas de diferencia: las cuatro incidencias hacia
   * «devuelto».
   */
  function shouldAllow(from: ItemStatus, to: ItemStatus): boolean {
    // Quedarse donde se está no es una transición: no figura en la tabla.
    if (from === to) return false
    // «Devuelto» es el único terminal: volvió a su dueño y salió de las manos de la producción.
    if (from === "returned") return false
    // «Entregado» no se pone a mano nunca: es consecuencia de cerrar una nota de entrega.
    if (to === "delivered") return false

    // Se rompe y se pierde en cualquier momento, incluso guardado.
    if (INCIDENTS.includes(to)) return true
    // Se devuelve desde donde esté: el dueño lo recupera igual roto que entero.
    if (to === "returned") return true
    // Disponible ↔ Almacenado, libre en ambos sentidos.
    if (from === "available" || from === "stored") return to === "available" || to === "stored"
    // Nada de eso es terminal: se reparó, apareció la pieza, estaba debajo de una mesa.
    if (INCIDENTS.includes(from)) return to === "available" || to === "stored"
    // Entregado ya no está en manos de la producción: no vuelve al inventario con un botón.
    return false
  }

  it("cubre las sesenta y cuatro celdas con el criterio adoptado", () => {
    expect(ITEM_STATUSES).toHaveLength(8)

    const wrong: string[] = []
    for (const from of ITEM_STATUSES) {
      for (const to of ITEM_STATUSES) {
        if (canTransition(from, to) !== shouldAllow(from, to)) wrong.push(`${from} → ${to}`)
      }
    }

    expect(wrong).toEqual([])
  })

  it("«devuelto» no tiene salida, y es el único que no la tiene", () => {
    const sinSalida = ITEM_STATUSES.filter((from) =>
      ITEM_STATUSES.every((to) => !canTransition(from, to)),
    )

    expect(sinSalida).toEqual(["returned"])
  })

  it("«entregado» no tiene entrada, y es el único que no la tiene", () => {
    // Deliberado: se llega ahí cerrando una nota de entrega, que se verifica pieza por pieza y se
    // firma. Las notas son de la rebanada 22 y no entran en esta ronda, así que hoy es inalcanzable.
    const sinEntrada = ITEM_STATUSES.filter((to) =>
      ITEM_STATUSES.every((from) => !canTransition(from, to)),
    )

    expect(sinEntrada).toEqual(["delivered"])
  })
})
