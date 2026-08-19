/**
 * Apartar y soltar unidades para una compra de tienda pública.
 *
 * Ver `openspec/specs/storefront-checkout/spec.md` —«Las existencias se reservan al crear la sesión»
 * y «La reserva caduca con la sesión»—. Rebanada 18, y corrige `DEFECTS.md` M-10.
 *
 * ## El defecto que esto cierra
 *
 * La pila anterior **seleccionaba** unidades para la compra y no las marcaba: dos compradores podían
 * pagar por la misma cámara, y el segundo se enteraba cuando alguien iba a la nave a buscarla. Y los
 * checkouts pendientes **no caducaban nunca**, así que el inventario que alguien apartó y no pagó se
 * quedaba fuera del catálogo para siempre.
 *
 * ## Por qué no reutiliza la reserva de cotizaciones
 *
 * `warehouses/reservations.ts` reconcilia **por diferencia** contra una línea de cotización que se
 * edita muchas veces, y proyecta el estado de la unidad desde el estado del documento. Una compra no
 * se edita: nace con lo que se apartó y termina en pagada, cancelada o caducada. Lo que sí se
 * comparte —y es lo que importa— es la **tabla**, con su índice único parcial
 * `(stock_unit_id) where released_at is null`: la garantía de que una unidad no se compromete dos
 * veces no depende de que nadie se equivoque, sino del motor.
 *
 * La diferencia visible es la columna: una reserva de compra lleva `checkout_id` y `expires_at`, y
 * ninguna cotización. Son excluyentes por construcción.
 */

import { newId, UnprocessableError } from "@tfv/contracts"
import type { Transaction } from "@tfv/db"
import { warehouseStockReservations, warehouseStockUnits } from "@tfv/db/schema"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { recordEvents, type StockStatus } from "../warehouses/stock.ts"

export interface ReserveRequest {
  readonly measurementId: string
  readonly quantity: number
  /** Para poder decir qué artículo no se puede servir, y no sólo que algo falló. */
  readonly label: string
}

/**
 * Aparta las unidades de una compra, o rechaza diciendo qué falta.
 *
 * `for update skip locked` es la pieza del escenario «Dos compradores no se llevan la misma unidad».
 * Sin él, la segunda transacción **espera** a la primera y acaba tomando las mismas filas o fallando
 * por espera; con él, salta lo que ya está bloqueado y coge lo siguiente. Si no queda nada, el
 * rechazo es por existencia insuficiente, que es la verdad.
 *
 * **Nunca acuña inventario.** La reserva de cotizaciones puede hacerlo con autorización explícita de
 * quien atiende el mostrador (`DEFECTS.md` M-04); aquí no hay a quién pedírsela —del otro lado hay
 * un desconocido con una tarjeta— y crear una cámara porque alguien la pagó sería exactamente el
 * descuadre que aquella autorización existe para evitar.
 */
export async function reserveForCheckout(
  tx: Transaction,
  checkoutId: string,
  buyerId: string,
  expiresAt: Date,
  requests: readonly ReserveRequest[],
): Promise<readonly string[]> {
  const taken: string[] = []

  for (const request of requests) {
    const candidates = await tx.execute<{ id: string }>(sql`
      select id from ${warehouseStockUnits}
       where measurement_id = ${request.measurementId}
         and status = 'available'
         and deleted_at is null
       order by created_at, id
       limit ${request.quantity}
       for update skip locked
    `)

    const chosen = [...candidates].map((row) => row.id)

    if (chosen.length < request.quantity) {
      throw new UnprocessableError(
        `No hay existencia suficiente de «${request.label}»: se pidieron ${request.quantity} ` +
          `y ${chosen.length === 0 ? "no queda ninguna" : `sólo quedan ${chosen.length}`}.`,
        { measurementId: request.measurementId, available: chosen.length },
      )
    }

    await tx.insert(warehouseStockReservations).values(
      chosen.map((stockUnitId) => ({
        id: newId(),
        stockUnitId,
        checkoutId,
        expiresAt,
      })),
    )

    await tx
      .update(warehouseStockUnits)
      .set({ status: "in_order", updatedAt: new Date() })
      .where(inArray(warehouseStockUnits.id, chosen))

    await recordEvents(
      tx,
      chosen.map((unitId) => ({
        unitId,
        from: "available" as StockStatus,
        to: "in_order" as const,
      })),
      "order",
      buyerId,
      "Apartada por una compra en tienda pública",
      checkoutId,
    )

    taken.push(...chosen)
  }

  return taken
}

/**
 * Suelta lo que una compra tenía apartado y devuelve las unidades al catálogo.
 *
 * El cambio de estado sólo alcanza a las que siguen en `in_order`: si alguien las movió por otro
 * camino —una incidencia, una baja—, devolverlas a disponible sería deshacer una decisión que se
 * tomó después. El vínculo sí se suelta entero, porque la compra ya no reclama nada.
 */
export async function releaseCheckout(
  tx: Transaction,
  checkoutId: string,
  actorId: string | null,
  note: string,
): Promise<number> {
  const held = await tx
    .select({
      id: warehouseStockReservations.id,
      stockUnitId: warehouseStockReservations.stockUnitId,
    })
    .from(warehouseStockReservations)
    .where(
      and(
        eq(warehouseStockReservations.checkoutId, checkoutId),
        isNull(warehouseStockReservations.releasedAt),
      ),
    )

  if (held.length === 0) return 0

  await tx
    .update(warehouseStockReservations)
    .set({ releasedAt: new Date() })
    .where(
      inArray(
        warehouseStockReservations.id,
        held.map((row) => row.id),
      ),
    )

  const units = await tx
    .update(warehouseStockUnits)
    .set({ status: "available", updatedAt: new Date() })
    .where(
      and(
        inArray(
          warehouseStockUnits.id,
          held.map((row) => row.stockUnitId),
        ),
        eq(warehouseStockUnits.status, "in_order"),
      ),
    )
    .returning({ id: warehouseStockUnits.id })

  await recordEvents(
    tx,
    units.map((row) => ({
      unitId: row.id,
      from: "in_order" as StockStatus,
      to: "available" as const,
    })),
    "order",
    actorId,
    note,
    checkoutId,
  )

  return units.length
}

/**
 * Lleva lo apartado al estado definitivo: vendido o rentado.
 *
 * «Las unidades apartadas SHALL pasar a vendidas cuando la compra sea de venta, y a rentadas cuando
 * sea de renta». La venta **suelta el vínculo** —la unidad salió del inventario y no vuelve— y la
 * renta lo conserva, porque es lo único que dice qué equipo hay que reclamar en el retorno. Es la
 * misma regla que proyecta una cotización, y por el mismo motivo.
 */
export async function settleCheckout(
  tx: Transaction,
  checkoutId: string,
  type: "sale" | "rent",
  actorId: string | null,
): Promise<readonly string[]> {
  const held = await tx
    .select({
      id: warehouseStockReservations.id,
      stockUnitId: warehouseStockReservations.stockUnitId,
      status: warehouseStockUnits.status,
    })
    .from(warehouseStockReservations)
    .innerJoin(
      warehouseStockUnits,
      eq(warehouseStockUnits.id, warehouseStockReservations.stockUnitId),
    )
    .where(
      and(
        eq(warehouseStockReservations.checkoutId, checkoutId),
        isNull(warehouseStockReservations.releasedAt),
      ),
    )

  if (held.length === 0) return []

  const settled: StockStatus = type === "rent" ? "rented" : "sold"

  await tx
    .update(warehouseStockUnits)
    .set({ status: settled, updatedAt: new Date() })
    .where(
      inArray(
        warehouseStockUnits.id,
        held.map((row) => row.stockUnitId),
      ),
    )

  await recordEvents(
    tx,
    held.map((row) => ({ unitId: row.stockUnitId, from: row.status, to: settled })),
    "storefront_sale",
    actorId,
    undefined,
    checkoutId,
  )

  if (settled === "sold") {
    await tx
      .update(warehouseStockReservations)
      .set({ releasedAt: new Date() })
      .where(
        inArray(
          warehouseStockReservations.id,
          held.map((row) => row.id),
        ),
      )
  }

  return held.map((row) => row.stockUnitId)
}
