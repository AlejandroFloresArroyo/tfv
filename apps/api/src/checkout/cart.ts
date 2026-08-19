/**
 * El carrito de una tienda pública: qué cuesta y cuánto hay.
 *
 * Ver `openspec/specs/storefront-checkout/spec.md` —«Los precios se resuelven en el servidor»,
 * «Validación de existencia antes de cobrar» y «Carrito de la tienda de almacén»—. Rebanada 18.
 *
 * ## El navegador manda qué, nunca cuánto vale
 *
 * `CartItemInput` no tiene campo de precio, y no es descuido: «No SHALL aceptar precios enviados por
 * el navegador». La forma más segura de cumplirlo es que el precio no quepa en el tipo que entra.
 *
 * ## De dónde sale el precio, y por qué de ahí
 *
 * Del **mismo sitio del que salió el que el comprador vio**: `storefrontProduct`, la función con la
 * que la tienda pinta la ficha. Es lo que hace imposible que el escaparate diga una cifra y el cobro
 * otra, y de paso resuelve la visibilidad —publicado, no provisional, vivo y del almacén de este
 * sitio— sin escribir aquí una segunda copia de esa intersección, que es justo lo que
 * `websites/storefront.ts` deja advertido que no debe hacerse.
 *
 * Cuesta una resolución de tienda por producto distinto del carrito. Es el precio de no tener dos
 * definiciones de «qué producto alcanza la tienda», y se paga a gusto: la que se queda corta el día
 * que diverjan es la de aquí, y el síntoma sería vender algo que la tienda no enseña.
 *
 * Al precio del producto se le suma el **ajuste de la medida**, que es la precedencia que declara
 * `warehouse-catalog`: una «Cabeza con óptica» no vale lo mismo que el cuerpo suelto. La ficha
 * pública todavía no lo enseña por medida —anotado en `HALLAZGOS.md` H-104—, así que el carrito lo
 * pone delante antes de pagar.
 */

import type { Money, ShippingItem } from "@tfv/contracts"
import {
  add,
  type CartItemInput,
  type CheckoutTradeType,
  compare,
  formatMoney,
  money,
  multiply,
  NotFoundError,
  UnprocessableError,
  ZERO,
} from "@tfv/contracts"
import type { Transaction } from "@tfv/db"
import { withSystem } from "@tfv/db"
import {
  warehouseMeasurements,
  warehouseProducts,
  warehouseStockUnits,
  websites,
} from "@tfv/db/schema"
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm"
import {
  resolveStorefront,
  type StorefrontProductDetail,
  storefrontProduct,
} from "../websites/storefront.ts"

/** La operación declarada al motor. Aparece en los claims y acota lo que se puede tocar. */
export const CART_OPERATION = "tienda_publica.carrito"

/**
 * Por qué una tienda no puede cobrar hoy.
 *
 * **El mismo texto para todos los motivos que son de configuración de la empresa.** «El motivo del
 * rechazo SHALL ser comprensible para el comprador sin revelar la configuración interna»: que la
 * suscripción esté vencida, que el servicio no esté habilitado o que falte el perfil de facturación
 * son asuntos de la empresa, y decirle a quien compra cuál de los tres es contarle cómo está montada
 * la tienda. Quien tiene que enterarse es quien la administra, y para eso están la portada de la
 * tienda —que sí distingue— y el panel.
 */
export const CANNOT_CHARGE = "Esta tienda no puede procesar pagos en este momento"

/** Lo que la tienda resuelta deja disponible para la compra. No sale nunca por la API. */
export interface ServingStore {
  readonly websiteId: string
  readonly slug: string
  readonly name: string
  readonly companyId: string
  readonly warehouseId: string
}

/**
 * Resuelve la tienda que sirve un subdominio y **atraviesa sus tres compuertas**.
 *
 * Las compuertas no se comprueban aquí: se comprueban llamando a `resolveStorefront`, que es donde
 * viven. Escribirlas otra vez habría dejado dos definiciones de «suscripción vigente», y la segunda
 * sería la que decide si se cobra o no — que es el peor sitio posible para una copia.
 *
 * Lo que sí se resuelve aquí son los identificadores: la empresa y el almacén, que la tienda pública
 * no publica porque son de la trastienda y la compra necesita porque es quien cobra y quien aparta.
 */
export async function withStore<T>(
  slug: string,
  work: (tx: Transaction, store: ServingStore) => Promise<T>,
): Promise<T> {
  const resolution = await resolveStorefront(slug)

  // Una tienda que hoy no se sirve no dice por qué a quien intenta comprar en ella.
  if (resolution.status !== "ready") throw new UnprocessableError(CANNOT_CHARGE)
  if (resolution.site.vertical !== "warehouse") {
    throw new NotFoundError("Esta tienda todavía no vende en línea")
  }

  const companyId = await companyOf(slug)
  if (!companyId) throw new NotFoundError("La tienda no existe")

  return withSystem(CART_OPERATION, [companyId], async (tx) => {
    const [row] = await tx
      .select({
        id: websites.id,
        slug: websites.slug,
        name: websites.name,
        companyId: websites.companyId,
        warehouseId: websites.warehouseId,
      })
      .from(websites)
      .where(
        and(eq(websites.slug, slug), eq(websites.isPublished, true), isNull(websites.deletedAt)),
      )
      .limit(1)

    // Despublicar el sitio entre las dos consultas es una carrera, y la respuesta correcta es la
    // misma que si nunca hubiera existido.
    if (!row || row.warehouseId === null) throw new NotFoundError("La tienda no existe")

    return work(tx, {
      websiteId: row.id,
      slug: row.slug,
      name: row.name,
      companyId: row.companyId,
      warehouseId: row.warehouseId,
    })
  })
}

/**
 * Qué empresa sirve este subdominio.
 *
 * Fuera de cualquier alcance declarado, porque **la empresa es justo lo que se está averiguando**.
 * `app.public_website` es `security definer`, comprueba dentro la publicación y responde a esta
 * única pregunta. Ver la migración `0019`.
 */
async function companyOf(slug: string): Promise<string | null> {
  return withSystem(`${CART_OPERATION}.resolver`, [], async (tx) => {
    const rows = await tx.execute<{ company_id: string | null }>(
      sql`select app.public_website(${slug}) as company_id`,
    )
    return rows[0]?.company_id ?? null
  })
}

// ─── Lo que se compra ────────────────────────────────────────────────────────

/** Una línea del carrito, ya valorada por el servidor. */
export interface CartLine {
  readonly kind: "warehouse_measurement"
  /** La medida. Es lo que se aparta y lo que se sirve. */
  readonly refId: string
  readonly productId: string
  readonly productName: string
  readonly measurementName: string
  /** Lo que aparecerá en el pedido y en la sesión de pago. */
  readonly name: string
  readonly unitPrice: string
  readonly quantity: number
  readonly total: string
  /** Cuántas unidades hay disponibles ahora mismo. La compra las apartará. */
  readonly available: number
  readonly coverUrl: string | null
}

export interface PricedCart {
  readonly store: ServingStore
  readonly lines: readonly CartLine[]
}

/**
 * Valora el carrito contra el catálogo publicado.
 *
 * **No aparta nada y no comprueba existencia**: informa de cuánta hay, que es lo que el carrito
 * enseña. Quien decide si se puede servir es la reserva, con las filas bloqueadas, porque entre
 * mirar y apartar cabe otro comprador.
 */
export async function priceCart(
  slug: string,
  type: CheckoutTradeType,
  items: readonly CartItemInput[],
): Promise<PricedCart> {
  if (items.length === 0) throw new UnprocessableError("El carrito está vacío")

  const foreign = items.find((item) => item.kind !== "warehouse_measurement")
  if (foreign) {
    // La vertical de mosaicos comparte envolvente y no comparte contenido: sus artículos son
    // productos de Pixit o mosaicos configurados, y su catálogo es la rebanada 24. Ver H-107.
    throw new UnprocessableError("Esta tienda sólo vende artículos de su almacén")
  }

  const requested = normalize(items)

  const { store, measurements } = await withStore(slug, async (tx, store) => ({
    store,
    measurements: await measurementsOf(
      tx,
      store.warehouseId,
      requested.map((item) => item.refId),
    ),
  }))

  // La ficha pública de cada producto distinto: es la compuerta de visibilidad y el precio que el
  // comprador vio, resueltos por la misma función que pinta la tienda.
  const details = new Map<string, StorefrontProductDetail>()
  for (const productId of new Set(measurements.map((row) => row.productId))) {
    details.set(productId, await storefrontProduct(slug, productId))
  }

  const lines = requested.map((item) => {
    const measurement = measurements.find((row) => row.id === item.refId)
    if (!measurement) throw new NotFoundError("Uno de los artículos ya no está a la venta")

    const detail = details.get(measurement.productId)
    if (!detail?.measurements.some((row) => row.id === measurement.id)) {
      throw new NotFoundError("Uno de los artículos ya no está a la venta")
    }

    assertTradeable(detail, type)

    const unitPrice = priceOf(detail, measurement.priceDifference)
    return {
      kind: "warehouse_measurement" as const,
      refId: measurement.id,
      productId: detail.id,
      productName: detail.name,
      measurementName: measurement.name,
      name: `${detail.name} · ${measurement.name}`,
      unitPrice: formatMoney(unitPrice),
      quantity: item.quantity,
      total: formatMoney(multiply(unitPrice, item.quantity)),
      available: measurement.available,
      coverUrl: detail.coverUrl,
    }
  })

  return { store, lines }
}

/**
 * Une las líneas repetidas y rechaza las cantidades imposibles.
 *
 * Dos líneas de la misma medida son **una** de la suma: dejarlas separadas haría que la reserva
 * apartara para cada una por su cuenta y que la comprobación de existencia mirara la mitad del
 * pedido cada vez.
 */
function normalize(items: readonly CartItemInput[]): readonly CartItemInput[] {
  const merged = new Map<string, CartItemInput>()

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new UnprocessableError("La cantidad de cada artículo tiene que ser un entero positivo")
    }

    const previous = merged.get(item.refId)
    merged.set(
      item.refId,
      previous ? { ...previous, quantity: previous.quantity + item.quantity } : item,
    )
  }

  return [...merged.values()]
}

/**
 * El producto se puede comprar en la modalidad elegida.
 *
 * «El sistema SHALL rechazar añadir un producto que no esté disponible para la modalidad elegida».
 *
 * La renta se rechaza siempre, y no por descuido: su tarifa sale de una lista de precios, y una
 * lista se aplica a un cliente concreto. Quien mira una tienda pública no tiene ninguna, así que
 * cobrarle una renta significaría **inventarle una tarifa** — que es exactamente lo que la ficha
 * pública se niega a hacer cuando decide no enseñar importes de renta. Anotado en H-105.
 */
function assertTradeable(detail: StorefrontProductDetail, type: CheckoutTradeType): void {
  if (type === "rent") {
    throw new UnprocessableError(
      "Esta tienda no cotiza rentas en línea. Escríbenos y te preparamos una cotización.",
    )
  }

  if (!detail.availableForSale) {
    throw new UnprocessableError(`«${detail.name}» no está a la venta`)
  }
}

/**
 * El precio de la medida: el del producto más su ajuste.
 *
 * Un producto sin precio **no se puede cobrar**. La ficha lo enseña como «consultar» —un cero no es
 * un precio, es la ausencia de uno— y aquí eso se traduce en un rechazo con motivo, no en una compra
 * de cero pesos.
 */
function priceOf(detail: StorefrontProductDetail, priceDifference: string): Money {
  if (detail.price === null) {
    throw new UnprocessableError(`«${detail.name}» no tiene precio publicado`)
  }

  const amount = add(money(detail.price), money(priceDifference))
  if (compare(amount, ZERO) <= 0) {
    throw new UnprocessableError(`«${detail.name}» no tiene precio publicado`)
  }

  return amount
}

// ─── Consulta ────────────────────────────────────────────────────────────────

interface MeasurementRow {
  readonly id: string
  readonly productId: string
  readonly name: string
  readonly priceDifference: string
  readonly available: number
}

/**
 * Las medidas pedidas, con su ajuste de precio y cuántas unidades tienen disponibles.
 *
 * El recuento sale de la misma tabla que después se bloquea para apartar, así que lo que enseña el
 * carrito y lo que la reserva encuentra son la misma cifra separadas por unos milisegundos —los que
 * caben entre mirar y comprar, que es donde vive la carrera que la reserva resuelve.
 */
async function measurementsOf(
  tx: Transaction,
  warehouseId: string,
  ids: readonly string[],
): Promise<readonly MeasurementRow[]> {
  if (ids.length === 0) return []

  const rows = await tx
    .select({
      id: warehouseMeasurements.id,
      productId: warehouseMeasurements.productId,
      name: warehouseMeasurements.name,
      priceDifference: warehouseMeasurements.priceDifference,
    })
    .from(warehouseMeasurements)
    .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
    .where(
      and(
        inArray(warehouseMeasurements.id, [...ids]),
        eq(warehouseProducts.warehouseId, warehouseId),
        isNull(warehouseMeasurements.deletedAt),
      ),
    )

  const counts = await availabilityOf(
    tx,
    rows.map((row) => row.id),
  )

  return rows.map((row) => ({ ...row, available: counts.get(row.id) ?? 0 }))
}

/** Cuántas unidades disponibles tiene cada medida. */
export async function availabilityOf(
  tx: Transaction,
  measurementIds: readonly string[],
): Promise<Map<string, number>> {
  if (measurementIds.length === 0) return new Map()

  const rows = await tx
    .select({ measurementId: warehouseStockUnits.measurementId, total: count() })
    .from(warehouseStockUnits)
    .where(
      and(
        inArray(warehouseStockUnits.measurementId, [...measurementIds]),
        eq(warehouseStockUnits.status, "available"),
        isNull(warehouseStockUnits.deletedAt),
      ),
    )
    .groupBy(warehouseStockUnits.measurementId)

  return new Map(rows.map((row) => [row.measurementId, Number(row.total)]))
}

// ─── Envío ───────────────────────────────────────────────────────────────────

/**
 * Los artículos del carrito, como los espera el cálculo de envío.
 *
 * Las dimensiones y el peso son de la **medida**, que es la caja que se manda: el producto describe
 * qué es y la medida, cuánto ocupa. Una medida sin medidas declaradas viaja sin ellas, y el motor
 * hace lo que la spec manda —calcular sin peso volumétrico— en lugar de suponer un bulto.
 */
export async function shippingItemsOf(
  tx: Transaction,
  lines: readonly { refId: string; quantity: number }[],
): Promise<readonly ShippingItem[]> {
  if (lines.length === 0) return []

  const rows = await tx
    .select({
      id: warehouseMeasurements.id,
      dimensions: warehouseMeasurements.dimensions,
      lengthUnit: warehouseMeasurements.lengthUnit,
      massUnit: warehouseMeasurements.massUnit,
    })
    .from(warehouseMeasurements)
    .where(
      inArray(
        warehouseMeasurements.id,
        lines.map((line) => line.refId),
      ),
    )

  return lines.map((line) => {
    const row = rows.find((candidate) => candidate.id === line.refId)
    const dimensions = row?.dimensions ?? {}

    return {
      id: line.refId,
      quantity: line.quantity,
      lengthUnit: row?.lengthUnit ?? "cm",
      weightUnit: row?.massUnit ?? "kg",
      ...(dimensions.length === undefined ? {} : { length: String(dimensions.length) }),
      ...(dimensions.width === undefined ? {} : { width: String(dimensions.width) }),
      ...(dimensions.height === undefined ? {} : { height: String(dimensions.height) }),
      ...(dimensions.weight === undefined ? {} : { weight: String(dimensions.weight) }),
    }
  })
}
