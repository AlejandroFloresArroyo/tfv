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
 * Ahora hay tres formularios que mueven las mismas cifras: las líneas, las condiciones de pago y
 * los impuestos. Si cada uno calculara su previsualización con su trozo y lo guardado de los otros
 * dos, volveríamos a tener varias versiones de la misma cuenta —que es H-14 otra vez, un paso antes
 * del motor: no en el cálculo, sino en **qué entrada se le arma**.
 *
 * Aquí hay una sola entrada. Cada panel publica su parte, este componente junta las tres y llama a
 * `computeQuotation` una vez. Lo que sale lo leen todos, incluido el editor para sus totales de
 * línea.
 *
 * El aviso de «sin guardar» lo enciende **sólo el editor de líneas**, que es el único con botón.
 * Los otros dos se guardan solos, y un cartel que aparece y desaparece a cada campo enseña a
 * ignorarlo justo antes del día en que importe.
 */

interface Slices {
  readonly lines: readonly QuotationLineInput[]
  readonly payment: QuotePaymentTerms | null
  readonly taxes: QuoteTaxes | null
  readonly dirty: boolean
}

export interface Preview {
  readonly breakdown: QuotationBreakdown | null
  readonly dirty: boolean
}

export interface Publish {
  readonly lines: (lines: readonly QuotationLineInput[], dirty: boolean) => void
  readonly payment: (payment: QuotePaymentTerms | null) => void
  readonly taxes: (taxes: QuoteTaxes | null) => void
}

const PreviewContext = createContext<Preview>({ breakdown: null, dirty: false })
const PublishContext = createContext<Publish>({
  lines: () => {},
  payment: () => {},
  taxes: () => {},
})

export function QuotePreview({
  quote,
  lines,
  children,
}: {
  quote: QuoteRow
  /** Lo guardado. Es lo que se previsualiza mientras nadie haya tocado nada. */
  lines: readonly QuoteLineRow[]
  children: ReactNode
}) {
  const [slices, setSlices] = useState<Slices>(() => ({
    lines: lineInputs(lines),
    payment: quote.paymentTerms,
    taxes: quote.taxes,
    dirty: false,
  }))

  // Los publicadores son estables, así que un panel puede llamarlos sin resuscribirse en cada tecla.
  const publish = useMemo<Publish>(
    () => ({
      lines: (next, dirty) => setSlices((current) => ({ ...current, lines: next, dirty })),
      payment: (payment) => setSlices((current) => ({ ...current, payment })),
      taxes: (taxes) => setSlices((current) => ({ ...current, taxes })),
    }),
    [],
  )

  const preview = useMemo<Preview>(() => {
    try {
      return {
        breakdown: computeQuotation({
          type: quote.type,
          startsOn: quote.startsOn ? new Date(quote.startsOn) : null,
          endsOn: quote.endsOn ? new Date(quote.endsOn) : null,
          roundDays: quote.roundDays,
          roundDirection: quote.roundDirection,
          lines: slices.lines,
          ...(slices.payment ? { payment: slices.payment } : {}),
          ...(slices.taxes ? { taxes: slices.taxes } : {}),
        }),
        dirty: slices.dirty,
      }
    } catch {
      // Un borrador a medias puede no ser calculable todavía. No se rompe la pantalla por eso.
      return { breakdown: null, dirty: slices.dirty }
    }
  }, [quote, slices])

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
