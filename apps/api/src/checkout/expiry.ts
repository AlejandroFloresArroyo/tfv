/**
 * El recolector de compras caducadas.
 *
 * Ver `openspec/specs/storefront-checkout/spec.md`, requisito «La reserva caduca con la sesión».
 * Rebanada 18, y es la otra mitad de la corrección `DEFECTS.md` M-10.
 *
 * ## Por qué hace falta
 *
 * En la pila anterior los checkouts pendientes **no caducaban nunca**. Cada carrito abandonado en la
 * pasarela de pago se llevaba unidades del catálogo para siempre: nadie las había comprado, nadie
 * podía comprarlas, y nadie sabía por qué la tienda decía que no quedaban.
 *
 * ## Cómo respeta una materialización en curso
 *
 * No con una comprobación previa, que dejaría una ventana entre mirar y escribir, sino con la
 * condición metida **en el propio `update`**: sólo pasa a caducada la que sigue pendiente y sin
 * marca de materialización. Si un cobro está cuajando en este instante, tiene la fila bloqueada; el
 * barrido espera, entra después, y encuentra una compra completada que ya no cumple la condición. La
 * que no consigue la fila no suelta nada — soltar el inventario de una compra recién cobrada sería
 * devolver a la estantería lo que acaba de salir por la puerta.
 */

import { withElevated, withSystem } from "@tfv/db"
import { checkouts } from "@tfv/db/schema"
import { and, eq, isNull, lt } from "drizzle-orm"
import { rootLogger } from "../runtime/logger.ts"
import { releaseCheckout } from "./reservations.ts"

const OPERATION = "tienda_publica.caducidad"

export interface SweepReport {
  readonly expired: number
  readonly released: number
}

/**
 * Caduca las compras cuya sesión venció y devuelve su inventario al catálogo.
 *
 * La lista se lee por la vía elevada porque **no cabe en el alcance de nadie**: recorre todas las
 * empresas, y para declarar el alcance habría que conocerlo antes. Es una lectura de dos columnas y
 * lleva su motivo escrito. Cada caducidad sí declara su empresa, así que las políticas siguen
 * aplicándose sobre todo lo que se escribe.
 */
export async function sweepExpiredCheckouts(now: Date = new Date()): Promise<SweepReport> {
  const due = await withElevated(
    "enumerar las compras cuya sesión de pago caducó, que abarcan todas las empresas",
    async (tx) =>
      tx
        .select({ id: checkouts.id, companyId: checkouts.companyId })
        .from(checkouts)
        .where(
          and(
            eq(checkouts.status, "pending"),
            isNull(checkouts.fulfilledAt),
            lt(checkouts.expiresAt, now),
          ),
        ),
  )

  let expired = 0
  let released = 0

  for (const checkout of due) {
    const freed = await withSystem(OPERATION, [checkout.companyId], async (tx) => {
      const [updated] = await tx
        .update(checkouts)
        .set({ status: "expired" })
        .where(
          and(
            eq(checkouts.id, checkout.id),
            eq(checkouts.status, "pending"),
            isNull(checkouts.fulfilledAt),
          ),
        )
        .returning({ id: checkouts.id })

      if (!updated) return null

      return releaseCheckout(
        tx,
        checkout.id,
        null,
        "La sesión de pago caducó sin completarse y se liberó el inventario",
      )
    })

    if (freed === null) continue

    expired += 1
    released += freed
  }

  if (expired > 0) {
    rootLogger.info("compras caducadas", { compras: expired, unidades: released })
  }

  return { expired, released }
}

/**
 * Da por perdida una compra sin esperar a que caduque, y suelta lo que tenía apartado.
 *
 * La usa el manejador del cobro rechazado: si el procesador ya dijo que no, esperar media hora a la
 * caducidad retiraría inventario del catálogo por nada.
 *
 * Sin actor, y no es un descuido: **no lo hizo nadie**. Lo hizo el procesador, y atribuírselo al
 * comprador diría en el historial de la unidad que él la soltó, que es otra cosa. La misma condición
 * que el barrido va dentro del `update`, por el mismo motivo.
 */
export async function abandonCheckout(checkoutId: string, reason: string): Promise<boolean> {
  const [row] = await withElevated(
    "averiguar de qué empresa es la compra que el procesador acaba de rechazar",
    async (tx) =>
      tx
        .select({ companyId: checkouts.companyId })
        .from(checkouts)
        .where(eq(checkouts.id, checkoutId))
        .limit(1),
  )

  if (!row) return false

  return withSystem(OPERATION, [row.companyId], async (tx) => {
    const [updated] = await tx
      .update(checkouts)
      .set({ status: "canceled" })
      .where(
        and(
          eq(checkouts.id, checkoutId),
          eq(checkouts.status, "pending"),
          isNull(checkouts.fulfilledAt),
        ),
      )
      .returning({ id: checkouts.id })

    if (!updated) return false

    await releaseCheckout(tx, checkoutId, null, reason)
    return true
  })
}
