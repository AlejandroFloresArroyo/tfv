"use client"

import type { QuotationBreakdown } from "@tfv/contracts/quotation"
import { createContext, type ReactNode, useContext, useMemo, useState } from "react"

/**
 * El desglose que el constructor está calculando ahora mismo.
 *
 * Existe por un problema que sólo se ve editando: el panel de importes vive en la columna de al
 * lado del editor, así que mientras no hubiera nada que lo conectara **enseñaba lo guardado
 * mientras las líneas enseñaban lo que se está escribiendo**. Dos cifras a un palmo de distancia
 * diciendo cosas distintas, que es exactamente el defecto que el motor compartido evita en la otra
 * dirección.
 *
 * El editor publica aquí su previsualización y el panel la consume. No hay estado duplicado: el
 * origen sigue siendo uno, sólo que ahora lo leen los dos sitios que lo enseñan.
 */

interface Preview {
  readonly breakdown: QuotationBreakdown | null
  /** Hay cambios sin guardar: lo que se ve no es todavía lo que hay en el servidor. */
  readonly dirty: boolean
}

const EMPTY: Preview = { breakdown: null, dirty: false }

const PreviewContext = createContext<Preview>(EMPTY)
const PublishContext = createContext<(preview: Preview) => void>(() => {})

export function QuotePreview({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<Preview>(EMPTY)

  // El publicador es estable, así que el editor puede llamarlo sin re-suscribirse en cada tecla.
  const publish = useMemo(() => setPreview, [])

  return (
    <PublishContext.Provider value={publish}>
      <PreviewContext.Provider value={preview}>{children}</PreviewContext.Provider>
    </PublishContext.Provider>
  )
}

export function usePreviewedQuote(): Preview {
  return useContext(PreviewContext)
}

export function usePublishPreview(): (preview: Preview) => void {
  return useContext(PublishContext)
}
