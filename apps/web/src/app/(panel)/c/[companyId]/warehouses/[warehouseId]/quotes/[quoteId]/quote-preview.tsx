"use client"

import {
  computeQuotation,
  type QuotationBreakdown,
  type QuotationLineInput,
  type QuotePaymentTerms,
  type QuoteTaxes,
} from "@tfv/contracts/quotation"
import { createContext, type ReactNode, useContext, useMemo, useState } from "react"
import type { QuoteLineRow, QuoteRow } from "../../../warehouse.ts"

/**
 * La cotización que el constructor está calculando ahora mismo.
 *
 * Existe por un problema que sólo se ve editando: el panel de importes vive en otra columna, así
 * que mientras no hubiera nada que lo conectara **enseñaba lo guardado mientras las líneas
 * enseñaban lo que se está escribiendo**. Dos cifras a un palmo de distancia diciendo cosas
 * distintas, que es exactamente el defecto que el motor compartido evita en la otra dirección.
 *
 * ## Por qué compone aquí y no en cada panel
 *
 * Son cuatro los formularios que mueven las mismas cifras: la **identidad** —que trae la ventana de
 * fechas—, las líneas, las condiciones de pago y los impuestos. Si cada uno calculara su
 * previsualización con su trozo y lo guardado de los otros tres, volveríamos a tener varias
 * versiones de la misma cuenta —que es H-14 otra vez, un paso antes del motor: no en el cálculo,
 * sino en **qué entrada se le arma**.
 *
 * Aquí hay una sola entrada. Cada panel publica su parte, este componente junta las cuatro y llama
 * a `computeQuotation` una vez. Lo que sale lo leen todos, incluido el editor para sus totales de
 * línea.
 *
 * ## Por qué la ventana entra aquí y no se lee de lo guardado
 *
 * Porque **cambiarla cambia los días que cobra cada línea**. Leída del documento del servidor, mover
 * la fecha de fin dejaba las líneas cobrando los días de antes hasta que el guardado volviera: los
 * mismos «catorce días» debajo de una ventana que ya dice diez. Publicada, el desglose entero —días
 * aplicados, importe de línea y total— se rehace con la ventana que se está escribiendo.
 *
 * ## Quién enciende el aviso de «sin guardar»
 *
 * El editor de líneas, que es el único con botón, y la identidad **mientras su guardado automático
 * tenga algo pendiente**. Los dos mueven los importes de línea que el editor tiene delante, así que
 * callarlo dejaría el panel de la otra columna diciendo otra cifra. Las condiciones de pago y los
 * impuestos no lo encienden: se guardan al perder el foco y un cartel que parpadea a cada campo
 * enseña a ignorarlo justo antes del día en que importe.
 */

/** La ventana de fechas y su redondeo. Es lo que decide cuántos días cobra cada línea. */
export interface QuoteWindow {
  readonly startsOn: Date | null
  readonly endsOn: Date | null
  readonly roundDays: boolean
  readonly roundDirection: "up" | "down"
}

interface Slices {
  readonly window: QuoteWindow
  readonly lines: readonly QuotationLineInput[]
  readonly payment: QuotePaymentTerms | null
  readonly taxes: QuoteTaxes | null
  readonly linesDirty: boolean
  readonly windowPending: boolean
}

export interface Preview {
  readonly breakdown: QuotationBreakdown | null
  readonly dirty: boolean
}

export interface Publish {
  readonly window: (window: QuoteWindow, pending: boolean) => void
  readonly lines: (lines: readonly QuotationLineInput[], dirty: boolean) => void
  readonly payment: (payment: QuotePaymentTerms | null) => void
  readonly taxes: (taxes: QuoteTaxes | null) => void
}

const PreviewContext = createContext<Preview>({ breakdown: null, dirty: false })
const PublishContext = createContext<Publish>({
  window: () => {},
  lines: () => {},
  payment: () => {},
  taxes: () => {},
})

export function QuotePreview({
  quote,
  lines,
  collected,
  children,
}: {
  quote: QuoteRow
  /** Lo guardado. Es lo que se previsualiza mientras nadie haya tocado nada. */
  lines: readonly QuoteLineRow[]
  /**
   * Lo **cobrado**, tal y como lo contó el servidor.
   *
   * Viaja porque el motor lo necesita para el saldo y no se puede deducir del documento: son filas
   * de otra tabla. Sin él, la previsualización enseñaba cero cobrado y **hacía desaparecer el
   * bloque de cobro** en cuanto se tocaba cualquier cosa.
   */
  collected?: string | undefined
  children: ReactNode
}) {
  const [slices, setSlices] = useState<Slices>(() => ({
    window: windowOf(quote),
    lines: lineInputs(lines),
    payment: quote.paymentTerms,
    taxes: quote.taxes,
    linesDirty: false,
    windowPending: false,
  }))

  // Los publicadores son estables, así que un panel puede llamarlos sin resuscribirse en cada tecla.
  const publish = useMemo<Publish>(
    () => ({
      window: (next, pending) =>
        setSlices((current) => ({ ...current, window: next, windowPending: pending })),
      lines: (next, dirty) =>
        setSlices((current) => ({ ...current, lines: next, linesDirty: dirty })),
      payment: (payment) => setSlices((current) => ({ ...current, payment })),
      taxes: (taxes) => setSlices((current) => ({ ...current, taxes })),
    }),
    [],
  )

  const preview = useMemo<Preview>(() => {
    const dirty = slices.linesDirty || slices.windowPending
    try {
      return {
        breakdown: computeQuotation({
          type: quote.type,
          startsOn: slices.window.startsOn,
          endsOn: slices.window.endsOn,
          roundDays: slices.window.roundDays,
          roundDirection: slices.window.roundDirection,
          lines: slices.lines,
          ...(slices.payment ? { payment: slices.payment } : {}),
          ...(slices.taxes ? { taxes: slices.taxes } : {}),
          ...(collected === undefined ? {} : { collected }),
        }),
        dirty,
      }
    } catch {
      // Un borrador a medias puede no ser calculable todavía. No se rompe la pantalla por eso.
      return { breakdown: null, dirty }
    }
  }, [quote.type, slices, collected])

  return (
    <PublishContext.Provider value={publish}>
      <PreviewContext.Provider value={preview}>{children}</PreviewContext.Provider>
    </PublishContext.Provider>
  )
}

export function usePreviewedQuote(): Preview {
  return useContext(PreviewContext)
}

export function usePublishPreview(): Publish {
  return useContext(PublishContext)
}

/** La ventana guardada. Es de donde parte la previsualización mientras nadie la haya tocado. */
function windowOf(quote: QuoteRow): QuoteWindow {
  return {
    startsOn: quote.startsOn ? new Date(quote.startsOn) : null,
    endsOn: quote.endsOn ? new Date(quote.endsOn) : null,
    roundDays: quote.roundDays,
    roundDirection: quote.roundDirection,
  }
}

/**
 * Las líneas guardadas, tal y como las quiere el motor.
 *
 * Cada línea viaja con **su tarifa ya resuelta por el servidor** —la misma con la que calculó—, así
 * que aquí no se vuelve a consultar el catálogo ni a decidir qué precio manda. Ver H-14.
 */
function lineInputs(lines: readonly QuoteLineRow[]): QuotationLineInput[] {
  return lines.map((line, index) => ({
    id: line.id,
    productId: line.productId,
    measurementId: line.measurementId,
    quantity: line.quantity,
    frequency: line.frequency,
    basePrice: line.basePrice,
    ...(line.rent ? { rent: line.rent } : {}),
    ...(line.penalty ? { penalty: line.penalty } : {}),
    ...(line.price === null ? {} : { linePrice: line.price }),
    position: line.position ?? index,
    positionProduct: line.positionProduct ?? index,
  }))
}
