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

export interface QuoteContact {
  name: string
  phone?: string
  position?: string
}

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
  frequency: "daily" | "weekly" | "monthly"
  quantity: number
  unitIds: string[]
  position: number
  positionProduct: number
}

/** Todos los importes son cadenas decimales. Nunca se convierten a número para operar con ellos. */
export interface QuoteBreakdown {
  version: 1
  days: number
  lines: {
    lineId: string
    productId: string
    quantity: number
    appliedDays: string
    unitCost: string
    unitDiscount: string
    total: string
    penalty: string
    fee: string
    totalWithFee: string
  }[]
  groups: { productId: string; lineIds: string[]; subtotal: string }[]
  linesTotal: string
  additionals: string
  subtotal: string
  discount: string
  base: string
  taxes: {
    key: string
    concept: string
    effect: "increase" | "decrease"
    rate?: string
    amount: string
  }[]
  taxTotal: string
  net: string
  fees: string
  feesSpread: boolean
  gross: string
  advance: string
  total: string
  penalty: string
}
