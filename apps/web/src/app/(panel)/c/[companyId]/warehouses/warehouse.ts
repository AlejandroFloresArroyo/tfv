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
  /** Alta hecha a la carrera desde una cotización, pendiente de completarse. */
  isProvisional: boolean
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

/** Los estados de un pedido de almacén, en el orden de su ciclo. */
export const ORDER_STATUSES = ["pending", "accepted", "delivered", "finished", "canceled"] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export interface OrderRow {
  id: string
  warehouseId: string
  code: string
  name: string
  observations: string
  origin: "production" | "storefront"
  type: "rent" | "sale"
  status: OrderStatus
  quoteId: string | null
  purchaseOrderId: string | null
  buyerOrderId: string | null
  clientId: string | null
  providerId: string | null
  canceledAt: string | null
  canceledById: string | null
  cancelReason: string | null
  /** Mensajes de la conversación que este lado no ha leído. */
  unread: number
  createdAt: string
  updatedAt: string
}

export interface OrderLineRow {
  id: string
  orderId: string
  measurementId: string
  measurementName: string
  productId: string
  productName: string
  productCode: string
  quantity: number
  /** Unidades libres de la medida. Es lo que decide si la línea cabe al aceptar. */
  available: number
  position: number
}

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
  /** La renta que ésta extiende, si lo es. Encadenable. */
  extendsQuoteId: string | null
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
  /** Precio negociado: el total de la línea para el periodo. Manda sobre la tarifa sin borrarla. */
  price: string | null
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

// ─── Unidades de existencia ──────────────────────────────────────────────────

/**
 * Una unidad es **un objeto físico**, no un contador.
 *
 * Ver `openspec/specs/stock-units/spec.md`. De ahí sale que la pantalla de una medida sea una tabla
 * de filas con código propio y no una casilla con un número: la cámara concreta que está en la caja
 * `BOX7` y que lleva pegada su etiqueta.
 */
export interface StockUnitRow {
  id: string
  measurementId: string
  /** Doce caracteres del alfabeto de Crockford. Es lo que va impreso y lo que se dicta. */
  code: string
  status: StockStatus
  /** Acuñada porque una cotización pidió más de las que había. Auditable, y por eso se enseña. */
  createdByReservation: boolean
  createdAt: string
  updatedAt: string
}

// ─── Listas de precios ───────────────────────────────────────────────────────

export interface PriceListRow {
  id: string
  warehouseId: string
  name: string
  description: string
  /**
   * Cuántos productos tienen tarifa en ella, contados por el servidor.
   *
   * Es lo que hace visible el alcance de eliminarla: la confirmación puede decir a cuántos
   * productos se les quita el precio en lugar de advertir en abstracto de que «puede afectar».
   */
  productCount: number
  createdAt: string
  updatedAt: string
}

/** Quién provocó un cambio de estado. El motivo escrito va aparte, en `note`. */
export const STOCK_REASONS = [
  "manual",
  "quote_reservation",
  "quote_release",
  "quote_status",
  "order",
  "storefront_sale",
  "rental_return",
  "created",
] as const

export type StockReason = (typeof STOCK_REASONS)[number]

export interface StockEventRow {
  id: string
  /** Nulo en el alta: antes de existir la unidad no estaba en ningún estado. */
  fromStatus: StockStatus | null
  toStatus: StockStatus
  reason: StockReason
  actorId: string | null
  /** La cotización o el pedido que lo causó, cuando lo hubo. */
  causeId: string | null
  note: string | null
  occurredAt: string
}

/**
 * La tarifa de un producto en una lista.
 *
 * Los tres importes viajan como **cadena decimal** y aquí se quedan como tal. Renta y penalización
 * pueden ser fijas o por periodicidad; cuál manda lo dice `isFixed` y no la presencia de importes.
 */
export interface ProductPriceRow {
  id: string
  priceListId: string
  productId: string
  sale: string
  rent: RateSchedule
  penalty: RateSchedule
  createdAt: string
  updatedAt: string
}
