/**
 * Documentos generados.
 *
 * Ver `openspec/specs/pdf-documents/spec.md`.
 *
 * Un documento es **una vista de los datos vigentes**, no una copia guardada: se compone en el
 * momento de mirarlo, a partir de la entidad y —cuando los tiene— de sus importes congelados. Por
 * eso lo que vive aquí es la composición, que es pura, y no el archivo.
 *
 * Se decidió componer e imprimir **desde el navegador**, sin servicio de composición aparte. Eso
 * deja el reparto así: el servidor arma este modelo —que es el que decide qué dice el documento— y
 * el navegador lo dibuja y lo manda a la impresora. Las tres acciones de la spec —previsualizar,
 * imprimir y descargar— parten del mismo modelo y del mismo dibujo, así que **no pueden diferir**:
 * no hay dos representaciones que mantener de acuerdo.
 *
 * El modelo vive en los contratos, y no en la API, porque lo produce el servidor y lo consume el
 * navegador. Declararlo dos veces es como acaban divergiendo el importe que se calcula y el que se
 * imprime.
 */

import { formatMoney, money, sum } from "./money.ts"
import type {
  QuotationBreakdown,
  QuoteContact,
  QuotePaymentTerms,
  QuoteTaxes,
  RentFrequency,
} from "./quotation.ts"
import { RENT_FREQUENCIES } from "./quotation.ts"
import type { QuoteStatus, TradeType } from "./quote-status.ts"
import { slugify } from "./slug.ts"

/**
 * Las seis familias de documentos que el sistema produce.
 *
 * Conjunto cerrado, como el catálogo de permisos: un documento nuevo se declara aquí y se ve en la
 * revisión. Hoy sólo la cotización tiene composición; las otras cinco esperan a las rebanadas que
 * traen sus entidades —nota de entrega y plan de trabajo a producciones (20 y 22), presupuesto a la
 * 22, recibo e instructivo a Pixit (24 a 26)—.
 */
export const DOCUMENT_KINDS = [
  "quote",
  "delivery-note",
  "budget",
  "work-plan",
  "sale-receipt",
  "assembly-guide",
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

// ─── Nombre del archivo ──────────────────────────────────────────────────────

/** Lo que hace falta para nombrar el archivo que se descarga. */
export interface DocumentFileName {
  /** Cómo se llama el documento, ya traducido. La traducción es trabajo de quien lo enseña. */
  readonly label: string
  /** El folio, el código, o lo que identifique a este documento entre los de su familia. */
  readonly reference: string
  /** El instante de generación, en la hora de quien lo descarga. */
  readonly at: Date
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0")
}

/**
 * El nombre del archivo descargado.
 *
 * Lleva **el instante** además del folio porque un documento se regenera: dos descargas del mismo
 * folio con una semana de diferencia son dos papeles distintos, y con el mismo nombre el segundo
 * pisa al primero en la carpeta de descargas justo cuando hace falta comparar.
 *
 * La hora es la **local** de quien descarga, no la del servidor: es la que esa persona reconoce al
 * ordenar sus archivos por fecha.
 */
export function documentFileName({ label, reference, at }: DocumentFileName): string {
  const stamp =
    `${at.getFullYear()}${twoDigits(at.getMonth() + 1)}${twoDigits(at.getDate())}` +
    `-${twoDigits(at.getHours())}${twoDigits(at.getMinutes())}`

  const name = reference.trim() ? `${slugify(label)}-${slugify(reference)}` : slugify(label)

  return `${name}-${stamp}.pdf`
}

// ─── El pie que identifica ───────────────────────────────────────────────────

/**
 * El pie de identificación que todo documento lleva.
 *
 * La spec pide dos cosas: **quién lo produjo** y **desde qué dirección se generó**. La segunda es
 * la que permite volver al documento vivo desde una hoja impresa, que es lo que se tiene delante
 * cuando aparece una discrepancia.
 */
export interface DocumentStamp {
  readonly system: string
  readonly address: string
  readonly generatedAt: string
}

/**
 * Compone el pie a partir de la dirección desde la que se está mirando.
 *
 * Se le quitan la consulta y el fragmento: no aportan nada al documento y sí arrastran a la hoja
 * impresa lo que llevara la dirección —de dónde vino quien la abrió, por ejemplo—.
 */
export function documentStamp(system: string, url: string, generatedAt: Date): DocumentStamp {
  const [address = url] = url.split(/[?#]/)
  return { system, address, generatedAt: generatedAt.toISOString() }
}

// ─── Partes e identidad ──────────────────────────────────────────────────────

/** Quién emite o quién recibe, tal y como aparece en el documento. */
export interface DocumentParty {
  readonly name: string
  readonly taxId?: string | undefined
  readonly email?: string | undefined
  readonly phone?: string | undefined
  readonly address?: string | undefined
  readonly contacts: readonly QuoteContact[]
}

/** Identidad del documento: de qué documento y de qué momento se trata. */
export interface DocumentIdentity {
  readonly folio: string
  readonly code: string
  readonly name: string
  readonly description: string
  readonly status: QuoteStatus
  /** Cuándo se emitió la cotización. */
  readonly issuedOn: string
  /** Cuándo se compuso **este** documento. Las dos fechas juntas son la trazabilidad. */
  readonly generatedAt: string
}

// ─── Cotización ──────────────────────────────────────────────────────────────

/** Una línea de la cotización, con lo que el documento necesita nombrar. */
export interface QuoteDocumentLine {
  readonly id: string
  readonly productId: string
  readonly productName: string
  readonly productCode: string
  readonly measurementName: string
  readonly frequency: RentFrequency
  readonly quantity: number
  readonly position: number
  readonly positionProduct: number
}

export interface QuoteDocumentInput {
  readonly identity: DocumentIdentity
  readonly issuer: DocumentParty
  readonly client: DocumentParty | null
  readonly type: TradeType
  readonly startsOn: string | null
  readonly endsOn: string | null
  readonly lines: readonly QuoteDocumentLine[]
  readonly breakdown: QuotationBreakdown
  readonly payment: QuotePaymentTerms | null
  readonly taxes: QuoteTaxes | null
  readonly terms: string | null
  readonly observations: string | null
  readonly message: string | null
}

/** Una fila del documento: la línea con los importes que le corresponden, si los enseña. */
export interface QuoteDocumentRow {
  readonly lineId: string
  readonly productName: string
  readonly productCode: string
  readonly measurementName: string
  readonly quantity: number
  readonly frequency: RentFrequency
  readonly appliedDays?: string | undefined
  /** Ausente con precio negociado, con descuento fijo por producto, o sin precio fijado. */
  readonly unitCost?: string | undefined
  /** Ausente cuando el documento no enseña importes por línea, o la línea no está en el desglose. */
  readonly total?: string | undefined
  readonly discount?: string | undefined
  /** Nadie le puso precio. El total es cero porque falta, no porque sea gratis. */
  readonly unpriced: boolean
}

/** Las líneas de un producto, juntas y con su subtotal. */
export interface QuoteDocumentGroup {
  readonly productId: string
  readonly productName: string
  readonly productCode: string
  readonly lines: readonly QuoteDocumentRow[]
  /** Ausente cuando el documento no enseña importes por línea. */
  readonly subtotal?: string | undefined
}

/** La ventana de una renta, con las frecuencias que se aplicaron dentro de ella. */
export interface QuoteDocumentPeriod {
  readonly startsOn: string
  readonly endsOn: string
  readonly days: number
  readonly frequencies: readonly RentFrequency[]
}

export interface QuoteDocument {
  readonly kind: "quote"
  readonly identity: DocumentIdentity
  readonly issuer: DocumentParty
  readonly client: DocumentParty | null
  readonly type: TradeType
  /** Nula en una venta: no hay ventana que mostrar. */
  readonly period: QuoteDocumentPeriod | null
  readonly groups: readonly QuoteDocumentGroup[]
  /**
   * Si las líneas llevan importe.
   *
   * Con precio por paquete no lo llevan: lo pactado es el paquete, y enseñar los importes de línea
   * invita a sumarlos y a discutir una cifra que no se cobra.
   */
  readonly showsLineAmounts: boolean
  /** Lo que suman las líneas **visibles**. Es la cifra que el lector puede comprobar a mano. */
  readonly linesTotal: string
  /**
   * ¿Cuadra lo que se ve con lo que se cobra?
   *
   * La spec lo exige —«la suma de las líneas visibles SHALL cuadrar con el total mostrado»— y por
   * eso se informa en lugar de darse por hecho: un documento que no cuadra es un defecto, y quien
   * lo compone tiene que poder verlo antes que el cliente.
   */
  readonly reconciles: boolean
  readonly breakdown: QuotationBreakdown
  readonly payment: QuotePaymentTerms | null
  readonly taxes: QuoteTaxes | null
  readonly terms: string | null
  readonly observations: string | null
  readonly message: string | null
}

/**
 * Compone el documento de una cotización.
 *
 * **No calcula importes.** Los recibe del desglose, que es el del motor —congelado si la cotización
 * lo está, recalculado si sigue abierta—. Lo que hace aquí es disponerlos: agrupar por producto,
 * conservar el orden establecido y comprobar que lo que se enseña sumado cuadra con el total.
 *
 * Los subtotales de grupo se suman **de las filas visibles**, no se copian del desglose. Si un día
 * las dos cifras dejaran de coincidir, el documento seguiría cuadrando consigo mismo y `reconciles`
 * lo diría, en lugar de imprimir una columna que no suma su propio pie.
 */
export function composeQuoteDocument(input: QuoteDocumentInput): QuoteDocument {
  const showsLineAmounts = input.breakdown.packagePrice === undefined
  const amounts = new Map(input.breakdown.lines.map((line) => [line.lineId, line]))

  const ordered = [...input.lines].sort(
    (a, b) => a.positionProduct - b.positionProduct || a.position - b.position,
  )

  const groups: QuoteDocumentGroup[] = []
  const byProduct = new Map<string, QuoteDocumentGroup & { lines: QuoteDocumentRow[] }>()

  for (const line of ordered) {
    const amount = amounts.get(line.id)

    const row: QuoteDocumentRow = {
      lineId: line.id,
      productName: line.productName,
      productCode: line.productCode,
      measurementName: line.measurementName,
      quantity: line.quantity,
      frequency: line.frequency,
      unpriced: amount?.unpriced ?? false,
      ...(amount ? { appliedDays: amount.appliedDays } : {}),
      ...(showsLineAmounts && amount
        ? {
            total: amount.total,
            discount: amount.discount,
            ...(amount.unitCost === undefined ? {} : { unitCost: amount.unitCost }),
          }
        : {}),
    }

    const existing = byProduct.get(line.productId)
    if (existing) {
      existing.lines.push(row)
      continue
    }

    const group = {
      productId: line.productId,
      productName: line.productName,
      productCode: line.productCode,
      lines: [row],
    }
    byProduct.set(line.productId, group)
    groups.push(group)
  }

  const visible = groups.flatMap((group) => group.lines)
  const linesTotal = sum(visible.map((row) => money(row.total ?? "0.00")))

  return {
    kind: "quote",
    identity: input.identity,
    issuer: input.issuer,
    client: input.client,
    type: input.type,
    period: periodOf(input),
    groups: groups.map((group) => ({
      ...group,
      ...(showsLineAmounts
        ? { subtotal: formatMoney(sum(group.lines.map((row) => money(row.total ?? "0.00")))) }
        : {}),
    })),
    showsLineAmounts,
    linesTotal: formatMoney(linesTotal),
    // Con precio por paquete no hay nada que cuadrar: las líneas no llevan importe y el total
    // mostrado es el del paquete.
    reconciles: !showsLineAmounts || formatMoney(linesTotal) === input.breakdown.linesTotal,
    breakdown: input.breakdown,
    payment: input.payment,
    taxes: input.taxes,
    terms: input.terms,
    observations: input.observations,
    message: input.message,
  }
}

/**
 * La ventana de la renta, con las frecuencias que de verdad se aplicaron.
 *
 * Las frecuencias salen de las líneas y no de la cotización porque **son de la línea**: una misma
 * renta puede llevar una cámara por semana y un tripié por día, y decir «semanal» a secas sería
 * decir algo que no se cumple en la mitad del documento.
 */
function periodOf(input: QuoteDocumentInput): QuoteDocumentPeriod | null {
  if (input.type !== "rent" || !input.startsOn || !input.endsOn) return null

  const used = new Set(input.lines.map((line) => line.frequency))

  return {
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    days: input.breakdown.days,
    frequencies: RENT_FREQUENCIES.filter((frequency) => used.has(frequency)),
  }
}
