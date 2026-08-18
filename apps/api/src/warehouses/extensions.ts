/**
 * Extensión de una renta.
 *
 * Ver `openspec/specs/quotations/spec.md`. Una renta **no se alarga editándola**: su equipo está
 * fuera y su composición está congelada, precisamente para que nadie suelte por descuido el vínculo
 * de una cámara que está en un rodaje.
 *
 * Se crea una cotización nueva, enlazada a la original, que **recibe los vínculos vivos** de las
 * unidades que continúan. La unidad no pasa un instante por «disponible»: si pasara, otra cotización
 * podría llevársela entre el suelte y la reserva, y el equipo estaría prometido dos veces mientras
 * sigue en la calle.
 *
 * ## Por qué nace en renta y no en borrador
 *
 * El primer esbozo la hacía nacer `in_progress` y traspasar al pasar a `in_rent`. No se sostiene:
 * **la cantidad de una línea es cuántas unidades sujeta**, no una columna. Una extensión en borrador
 * sin vínculos vale cero, y no se puede negociar un precio que no se ve. Y con los vínculos ya
 * traspasados, un estado `in_progress` proyecta `in_quote` mientras las unidades están `rented`, de
 * modo que la verificación de coherencia la marcaría con razón.
 *
 * Nace `in_rent`, en una sola transacción, y todos los invariantes se sostienen en cada instante.
 * El precio se ajusta después: por eso la congelación con equipo fuera deja pasar los importes.
 *
 * ## Qué se copia y qué no
 *
 * Se copian la tarifa de cada línea, su periodicidad y el bloque fiscal: el régimen no cambia entre
 * periodos y volver a teclearlo es trabajo sin decisión detrás.
 *
 * **No se copia el precio negociado**, que es «el total de la línea para el periodo completo»:
 * arrastrar el importe pactado para dos semanas a una extensión de un mes sería cobrar mal y
 * parecer que alguien lo decidió. Tampoco las condiciones de pago —anticipo, descuento, depósito—,
 * que son de aquel trato y no de éste.
 */

import { newId, UnprocessableError } from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import {
  warehouseQuoteLines,
  warehouseQuotes,
  warehouseStockReservations,
  warehouseStockUnits,
} from "@tfv/db/schema"
import { and, eq, inArray, isNull } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { loadQuote, nextFolio, type QuoteRecord, quoteCode, toRecord } from "./quotes.ts"
import { recordEvents } from "./stock.ts"
import { loadWarehouse } from "./warehouses.ts"

export interface ExtensionInput {
  readonly startsOn: Date
  readonly endsOn: Date
  readonly name?: string | undefined
  readonly description?: string | undefined
  /** Las unidades que **siguen fuera**. Lo que no figure aquí se queda con la renta original. */
  readonly unitIds: readonly string[]
}

export async function extendRental(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  quoteId: string,
  input: ExtensionInput,
): Promise<QuoteRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const original = await loadQuote(tx, warehouseId, quoteId)

    if (original.type !== "rent") {
      throw new UnprocessableError("Sólo se extiende una cotización de renta")
    }
    if (input.unitIds.length === 0) {
      throw new UnprocessableError("Hay que decir qué equipo sigue fuera")
    }
    if (input.endsOn <= input.startsOn) {
      throw new UnprocessableError("La ventana de la extensión termina antes de empezar")
    }

    // Sólo continúa lo que **está fuera y es de esta renta**. Lo primero porque extender no saca
    // equipo de la nave; lo segundo porque los vínculos que se traspasan tienen que ser suyos.
    const held = await tx
      .select({
        reservationId: warehouseStockReservations.id,
        unitId: warehouseStockUnits.id,
        measurementId: warehouseStockUnits.measurementId,
        lineId: warehouseStockReservations.quoteLineId,
        status: warehouseStockUnits.status,
      })
      .from(warehouseStockReservations)
      .innerJoin(
        warehouseStockUnits,
        eq(warehouseStockUnits.id, warehouseStockReservations.stockUnitId),
      )
      .where(
        and(
          eq(warehouseStockReservations.quoteId, quoteId),
          isNull(warehouseStockReservations.releasedAt),
          inArray(warehouseStockUnits.id, [...input.unitIds]),
        ),
      )

    const missing = input.unitIds.length - held.length
    if (missing > 0) {
      throw new UnprocessableError(
        `${missing === 1 ? "Una unidad no salió" : `${missing} unidades no salieron`} con esta renta. ` +
          "Sólo se extiende lo que ya está fuera.",
      )
    }

    const inside = held.filter((row) => row.status !== "rented")
    if (inside.length > 0) {
      throw new UnprocessableError(
        "El equipo de esta cotización todavía no ha salido de la nave. Una extensión alarga una " +
          "renta en curso, no la adelanta.",
      )
    }

    const [extension] = await tx
      .insert(warehouseQuotes)
      .values({
        id: newId(),
        warehouseId,
        clientId: original.clientId,
        responsibleId: original.responsibleId ?? actor.userId,
        code: quoteCode(),
        folio: await nextFolio(tx, warehouseId),
        name: input.name ?? original.name,
        description: input.description ?? "",
        type: "rent",
        status: "in_rent",
        extendsQuoteId: quoteId,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        roundDays: original.roundDays,
        roundDirection: original.roundDirection,
        clientContacts: original.clientContacts,
        sellerContacts: original.sellerContacts,
        taxes: original.taxes,
      })
      .returning()

    if (!extension) throw new Error("La extensión no se insertó")

    await transferLinks(tx, original.id, extension.id, held, actor.userId)
    return toRecord(extension)
  })
}

/**
 * Mueve los vínculos vivos a las líneas de la extensión, agrupando por medida.
 *
 * El `update` cambia de dueño una fila que **sigue viva**: `released_at` no se toca y la unidad no
 * cambia de estado. El índice único parcial `(stock_unit_id) where released_at is null` se respeta
 * porque no hay fila nueva, y por eso no existe el instante en que la unidad está libre.
 */
async function transferLinks(
  tx: Transaction,
  originalId: string,
  extensionId: string,
  held: readonly { reservationId: string; unitId: string; measurementId: string }[],
  actorId: string,
): Promise<void> {
  const sources = await tx
    .select({
      id: warehouseQuoteLines.id,
      measurementId: warehouseQuoteLines.measurementId,
      productPriceId: warehouseQuoteLines.productPriceId,
      frequency: warehouseQuoteLines.frequency,
      position: warehouseQuoteLines.position,
      positionProduct: warehouseQuoteLines.positionProduct,
    })
    .from(warehouseQuoteLines)
    .where(eq(warehouseQuoteLines.quoteId, originalId))

  const byMeasurement = new Map<string, typeof held>()
  for (const row of held) {
    byMeasurement.set(row.measurementId, [...(byMeasurement.get(row.measurementId) ?? []), row])
  }

  for (const [measurementId, units] of byMeasurement) {
    const source = sources.find((line) => line.measurementId === measurementId)
    const lineId = newId()

    await tx.insert(warehouseQuoteLines).values({
      id: lineId,
      quoteId: extensionId,
      measurementId,
      productPriceId: source?.productPriceId ?? null,
      // El precio negociado **no** se copia: es el total de un periodo que ya no es éste.
      price: null,
      frequency: source?.frequency ?? "weekly",
      position: source?.position ?? 0,
      positionProduct: source?.positionProduct ?? 0,
    })

    await tx
      .update(warehouseStockReservations)
      .set({ quoteId: extensionId, quoteLineId: lineId, updatedAt: new Date() })
      .where(
        inArray(
          warehouseStockReservations.id,
          units.map((row) => row.reservationId),
        ),
      )

    // La unidad no cambia de estado; cambia de dueño. Es el hecho que hay que poder auditar el día
    // que alguien pregunte por qué una cámara responde a un documento distinto del que la sacó.
    await recordEvents(
      tx,
      units.map((row) => ({ unitId: row.unitId, from: "rented" as const, to: "rented" as const })),
      "quote_reservation",
      actorId,
      "Extensión de renta",
      extensionId,
    )
  }
}
