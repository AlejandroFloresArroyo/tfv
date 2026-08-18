import type {
  QuotationBreakdown,
  QuoteContact,
  QuotePaymentTerms,
  QuoteTaxes,
  RateSchedule,
  RentFrequency,
} from "@tfv/contracts/quotation"

export interface WarehouseRow {
  id: string
  companyId: string
  name: string
  description: string
  slug: string | null
  isPublished: boolean
  priority: string
  createdAt: string
  updatedAt: string
}

export interface StorageRow {
  id: string
  warehouseId: string
  parentId: string | null
  kind: "floor" | "area" | "aisle" | "section" | "bay" | "rack" | "shelf" | "pallet" | "box" | "bin"
  code: string
  name: string
  color: string | null
  icon: string | null
  childCount: number
  productCount: number
  createdAt: string
  updatedAt: string
}

export interface CategorySummary {
  id: string
  name: string
}

export interface ProductRow {
  id: string
  warehouseId: string
  parentId: string | null
  relationToParent: "variant" | "accessory" | null
  name: string
  description: string
  internalCode: string | null
  code: string
  cost: string
  price: string
  usesPriceLists: boolean
  availableForSale: boolean
  availableForRent: boolean
  storageId: string | null
  categoryId: string | null
  globalCategoryId: string | null
  responsibleId: string | null
  slug: string | null
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

export const STOCK_STATUSES = [
  "available",
  "in_quote",
  "in_order",
  "rented",
  "sold",
  "lost",
  "damaged",
  "robbed",
  "incomplete",
  "modified",
  "expense",
] as const

export type StockStatus = (typeof STOCK_STATUSES)[number]

export interface MeasurementRow {
  id: string
  productId: string
  name: string
  kind: "box" | "envelope" | "clothing" | "accessory" | "other"
  priceDifference: string
  dimensions: { height?: number; width?: number; length?: number; weight?: number }
  lengthUnit: "cm" | "m" | "in" | "ft"
  massUnit: "g" | "kg" | "lb" | "oz"
  clothing: {
    garment?: string
    size?: string
    custom?: string
    measurements?: Record<string, number>
  } | null
  units: Partial<Record<StockStatus, number>>
  createdAt: string
  updatedAt: string
}

export interface ProductDetail extends ProductRow {
  measurements: MeasurementRow[]
  variants: ProductRow[]
  accessories: ProductRow[]
}

export interface ItemsEnvelope<T> {
  items: T[]
}

// ─── Cotizaciones ────────────────────────────────────────────────────────────

export const QUOTE_STATUSES = [
  "pre_quote",
  "pending",
  "in_progress",
  "in_rent",
  "completed",
  "sold",
  "canceled",
] as const

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

export type { QuoteContact, RateSchedule, RentFrequency } from "@tfv/contracts/quotation"

export interface QuoteRow {
  id: string
  warehouseId: string
  orderId: string | null
  clientId: string | null
  responsibleId: string | null
  code: string
  folio: string
  name: string
  description: string
  type: "rent" | "sale"
  status: QuoteStatus
  priority: string
  startsOn: string | null
  endsOn: string | null
  roundDays: boolean
  roundDirection: "up" | "down"
  clientContacts: QuoteContact[]
  sellerContacts: QuoteContact[]
  paymentTerms: QuotePaymentTerms | null
  taxes: QuoteTaxes | null
  alert: string | null
  message: string | null
  terms: string | null
  observations: string | null
  createdAt: string
  updatedAt: string
}

export interface QuoteLineRow {
  id: string
  quoteId: string
  measurementId: string
  measurementName: string
  productId: string
  productName: string
  productCode: string
  productPriceId: string | null
  frequency: RentFrequency
  /** La tarifa con la que el servidor calculó esta línea. El constructor previsualiza con ella. */
  basePrice: string
  rent?: RateSchedule
  penalty?: RateSchedule
  /** Unidades libres de la medida, sin contar las de esta línea. */
  available: number
  quantity: number
  unitIds: string[]
  position: number
  positionProduct: number
}

/**
 * El desglose, tal y como lo produce el motor.
 *
 * Es **el tipo del paquete compartido**, no una copia. Copiarlo aquí dejaría a la pantalla
 * describiendo una forma que puede dejar de ser la que llega, y el desajuste se vería como un
 * importe vacío en lugar de como un error de compilación.
 */
export type QuoteBreakdown = QuotationBreakdown
