/**
 * La tienda pública de un almacén.
 *
 * Ver `openspec/specs/public-storefronts/spec.md` y `websites/spec.md`. Rebanada 19.
 *
 * **Este archivo es la única superficie del servicio que atiende a quien no tiene cuenta.** Todo lo
 * que salga de aquí lo puede leer cualquiera con un navegador, y por eso no reutiliza los registros
 * del catálogo interno: compone los suyos, campo a campo, con lo que hace falta para vender y nada
 * más. Reutilizar `ProductRecord` habría sido más corto y habría publicado el costo el día que
 * alguien le añadiera un campo.
 *
 * ## Cómo se llega hasta los datos sin identidad
 *
 * En dos tiempos, y la separación es la garantía:
 *
 * 1. `app.public_website` —`security definer`, en la migración `0019`— dice **qué empresa** sirve
 *    este subdominio publicado. Es lo único que corre fuera del aislamiento, responde a una sola
 *    pregunta y devuelve un identificador.
 * 2. Todo lo demás corre por `withSystem` con **esa** empresa declarada, así que las políticas del
 *    motor siguen aplicándose igual que en cualquier petición de usuario. Un error en este archivo
 *    no puede enseñar datos de otra empresa.
 *
 * Es la misma forma que el enlace público de un documento, donde el alcance sale del sobre firmado.
 * Aquí sale del subdominio, verificado contra la tabla.
 *
 * ## Publicado no es lo mismo que visible
 *
 * Un almacén tiene `is_published`, un producto tiene `is_published` y `available_for_sale`, y un
 * producto **provisional no se publica nunca**. Lo que la tienda enseña es la intersección, y esa
 * intersección se escribe **una vez** —en `visible()`— y la usan tanto el listado como la ficha.
 * Escrita dos veces, un día una de las dos se queda corta y el producto que no se alcanza por el
 * listado se alcanza escribiendo su dirección.
 */

import {
  buildPage,
  NotFoundError,
  type Page,
  type ParsedQuery,
  type QuerySchema,
} from "@tfv/contracts"
import { verticalOf, type WebsiteVertical } from "@tfv/contracts/storefront"
import { type Transaction, withSystem } from "@tfv/db"
import {
  companyServices,
  companySubscriptions,
  globalCategories,
  services,
  uploads,
  warehouseCategories,
  warehouseMeasurements,
  warehouseProductImages,
  warehouseProducts,
  warehouses,
  websites,
} from "@tfv/db/schema"
import { and, asc, count, eq, gt, inArray, isNull, or, type SQL, sql } from "drizzle-orm"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { categorySubtree } from "../warehouses/categories.ts"

/** La operación declarada al motor. Aparece en `request.jwt.claims` y acota lo que se puede tocar. */
const OPERATION = "tienda_publica"

/**
 * El mismo mensaje para todos los caminos de fallo de la resolución.
 *
 * «Un sitio despublicado se comporta como inexistente **y no revela que el sitio exista**»: para
 * eso, las dos respuestas tienen que ser la misma, hasta el texto. Es la misma decisión que toma el
 * enlace público de un documento con las referencias inventadas y las alteradas.
 */
const SITE_NOT_FOUND = "La tienda no existe"

/** Por qué una tienda que existe no se está sirviendo. Cada motivo tiene su propia página. */
export type UnavailableReason = "subscription" | "service"

export interface StorefrontCategory {
  readonly id: string
  readonly parentId: string | null
  readonly name: string
  readonly slug: string | null
}

/** La identidad de la tienda: lo que pinta la navegación, el pie y los metadatos de cada página. */
export interface StorefrontSite {
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly vertical: WebsiteVertical
  readonly logoUrl: string | null
  readonly iconUrl: string | null
  /**
   * Las categorías de la fuente, para navegar el catálogo.
   *
   * Viajan con la identidad y no en una ruta propia porque **son la navegación**: la tienda las
   * necesita en todas sus páginas, y una ruta más sería una petición más en cada carga para un
   * dato que no cambia entre ellas.
   */
  readonly categories: readonly StorefrontCategory[]
}

export type StorefrontResolution =
  | { readonly status: "ready"; readonly site: StorefrontSite }
  | { readonly status: "unavailable"; readonly reason: UnavailableReason }

/**
 * Lo que el sitio resuelto deja disponible para las demás lecturas públicas.
 *
 * No sale nunca por la API: la tienda no tiene por qué conocer el identificador de la empresa ni el
 * del almacén, que son de la trastienda.
 */
interface ResolvedSite {
  readonly companyId: string
  readonly warehouseId: string | null
  readonly vertical: WebsiteVertical
}

// ─── Las tres compuertas ─────────────────────────────────────────────────────

/**
 * Resuelve la tienda que sirve un subdominio, o dice por qué no.
 *
 * Las tres compuertas, en orden, y **cada fallo con su propia salida** porque el motivo importa: no
 * es lo mismo un sitio que no existe que uno cuya empresa dejó de pagar.
 *
 * La primera responde `404`; las otras dos devuelven `unavailable` con su motivo y **sin un solo
 * dato del sitio**. La diferencia no es cosmética: la primera compuerta protege de que se pueda
 * averiguar qué subdominios están tomados por sitios sin publicar, y las otras dos describen una
 * tienda que ya es pública y hoy no se sirve.
 */
export async function resolveStorefront(slug: string): Promise<StorefrontResolution> {
  try {
    const site = await withSite(slug, (tx, row, resolved) => composeSite(tx, row, resolved))
    return { status: "ready", site }
  } catch (error) {
    // Las compuertas dos y tres no son un error de la petición: la tienda existe y hoy no se
    // sirve. Se traduce aquí, y no en el manejador, para que las tres salidas de la resolución
    // vivan en la misma función y se puedan leer juntas.
    if (error instanceof StorefrontUnavailable) {
      return { status: "unavailable", reason: error.reason }
    }
    throw error
  }
}

/**
 * El catálogo publicado de la tienda.
 *
 * Una vertical que no sea la de almacén no tiene catálogo que servir, y responde `404` como
 * cualquier otra dirección que no existe: la página en construcción no es un catálogo vacío.
 */
export async function storefrontProducts(
  slug: string,
  query: ParsedQuery,
): Promise<Page<StorefrontProduct>> {
  const { limit, offset, page } = windowOf(query)

  return serving(slug, async (tx, _row, site) => {
    const warehouseId = await sourceOf(tx, site)

    const where = and(
      visible(warehouseId),
      isNull(warehouseProducts.parentId),
      await categoryCondition(tx, query),
      ...collectionConditions(withoutCategory(query), mapping),
    )

    const [total] = await tx.select({ value: count() }).from(warehouseProducts).where(where)

    const rows = await tx
      .select()
      .from(warehouseProducts)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    const covers = await coversOf(
      tx,
      rows.map((row) => row.id),
    )

    return buildPage(
      rows.map((row) => toCard(row, covers.get(row.id) ?? null)),
      total?.value ?? 0,
      page,
      limit,
    )
  })
}

/**
 * La ficha de un producto, por su identificador o por su identificador legible.
 *
 * Las dos vías pasan por **la misma** condición de visibilidad, que es lo que hace que escribir la
 * dirección a mano no alcance nada que el listado no enseñe.
 */
export async function storefrontProduct(
  slug: string,
  handle: string,
): Promise<StorefrontProductDetail> {
  return serving(slug, async (tx, _row, site) => {
    const warehouseId = await sourceOf(tx, site)

    const [product] = await tx
      .select()
      .from(warehouseProducts)
      .where(and(visible(warehouseId), isNull(warehouseProducts.parentId), byHandle(handle)))
      .limit(1)

    if (!product) throw new NotFoundError(PRODUCT_NOT_FOUND)

    // Las variantes y accesorios pasan por la misma criba: una variante sin publicar no se enseña
    // por venir colgada de un producto que sí lo está.
    const children = await tx
      .select()
      .from(warehouseProducts)
      .where(and(visible(warehouseId), eq(warehouseProducts.parentId, product.id)))

    const covers = await coversOf(tx, [product.id, ...children.map((row) => row.id)])
    const kind = (relation: "variant" | "accessory") =>
      children
        .filter((row) => row.relationToParent === relation)
        .map((row) => toCard(row, covers.get(row.id) ?? null))

    return {
      ...toCard(product, covers.get(product.id) ?? null),
      images: await imagesOf(tx, product.id),
      measurements: await measurementsOf(tx, product.id),
      variants: kind("variant"),
      accessories: kind("accessory"),
    }
  })
}

// ─── Lo que sale a la calle ──────────────────────────────────────────────────

const PRODUCT_NOT_FOUND = "El producto no existe"

/**
 * Un producto en la rejilla del catálogo.
 *
 * Compuesto campo a campo **a propósito**. La tentación es devolver el registro del catálogo
 * interno quitándole dos campos, y eso convierte cada columna nueva del catálogo en una fuga: el
 * día que alguien añada `proveedor` o `margen`, aparecería aquí sin que nadie lo decidiera. Así, lo
 * que no está escrito no sale.
 */
export interface StorefrontProduct {
  readonly id: string
  readonly slug: string | null
  readonly name: string
  readonly description: string
  /** El precio de venta. Nulo cuando el producto no se vende o no tiene precio que enseñar. */
  readonly price: string | null
  readonly availableForSale: boolean
  readonly availableForRent: boolean
  readonly categoryId: string | null
  readonly coverUrl: string | null
}

export interface StorefrontImage {
  readonly url: string
  readonly thumbnailUrl: string | null
  readonly position: number
  readonly isCover: boolean
}

/** La medida, sólo con su nombre: lo que hace falta para elegir, sin nada de la nave. */
export interface StorefrontMeasurement {
  readonly id: string
  readonly name: string
}

export interface StorefrontProductDetail extends StorefrontProduct {
  readonly images: readonly StorefrontImage[]
  readonly measurements: readonly StorefrontMeasurement[]
  readonly variants: readonly StorefrontProduct[]
  readonly accessories: readonly StorefrontProduct[]
}

/**
 * El precio que se enseña.
 *
 * **El de venta y sólo el de venta.** El de renta sale de una lista de precios, y una lista se
 * aplica a un cliente concreto: quien mira la tienda sin identificarse no tiene ninguna, así que
 * enseñarle un importe de renta significaría inventarle una tarifa. Es la misma precedencia que
 * declara `resolveSalePrice`, aplicada al único caso que aquí se puede resolver.
 *
 * Un cero **no es un precio**, es la ausencia de uno, y sale como nulo para que la tienda pueda
 * decir «consultar» en vez de «$0.00».
 */
function priceOf(row: typeof warehouseProducts.$inferSelect): string | null {
  if (!row.availableForSale) return null
  return Number(row.price) === 0 ? null : row.price
}

function toCard(
  row: typeof warehouseProducts.$inferSelect,
  coverUrl: string | null,
): StorefrontProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    price: priceOf(row),
    availableForSale: row.availableForSale,
    availableForRent: row.availableForRent,
    categoryId: row.categoryId,
    coverUrl,
  }
}

// ─── Consulta ────────────────────────────────────────────────────────────────

/**
 * Lo que la tienda pública deja pedir.
 *
 * Mucho más corto que el del catálogo interno, y esa diferencia es el requisito: aquí no se puede
 * filtrar por ubicación, ni por responsable, ni por publicación —que es lo que la tienda decide y
 * no quien pregunta—. Un filtro no declarado responde `400` y no la colección entera.
 */
export const storefrontQuery: QuerySchema = {
  filters: {
    categoryId: { type: "id", label: "Categoría" },
    availableForSale: { type: "boolean", label: "Venta" },
    availableForRent: { type: "boolean", label: "Renta" },
  },
  searchable: ["name", "description"],
  sortable: ["name", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
}

const mapping = {
  fields: {
    availableForSale: warehouseProducts.availableForSale,
    availableForRent: warehouseProducts.availableForRent,
    name: warehouseProducts.name,
    createdAt: warehouseProducts.createdAt,
  },
  searchable: [warehouseProducts.name, warehouseProducts.description],
  tiebreak: warehouseProducts.id,
}

async function categoryCondition(tx: Transaction, query: ParsedQuery) {
  const filter = query.filters.categoryId
  if (filter?.kind !== "eq") return undefined

  const subtree = await categorySubtree(tx, String(filter.value))
  if (subtree.length === 0) return eq(warehouseProducts.categoryId, String(filter.value))

  return inArray(warehouseProducts.categoryId, subtree)
}

function withoutCategory(query: ParsedQuery): ParsedQuery {
  if (!query.filters.categoryId) return query

  const { categoryId: _ignored, ...rest } = query.filters
  return { ...query, filters: rest }
}

// ─── La intersección, escrita una vez ────────────────────────────────────────

/**
 * Qué producto alcanza la tienda pública.
 *
 * Cuatro condiciones, y ninguna es redundante:
 *
 * - **del almacén que es la fuente del sitio**, no de la empresa: una empresa con dos naves tiene
 *   dos catálogos, y la tienda de una no enseña el de la otra;
 * - **publicado**, que es la decisión explícita de sacarlo a la calle;
 * - **no provisional**, porque el alta a la carrera desde una cotización no se publica nunca — lo
 *   dice el modelo, y aquí se comprueba en vez de confiar en que nadie ponga las dos marcas;
 * - **vivo**, que un producto dado de baja tampoco se vende.
 *
 * Está aquí y en un solo sitio porque la usan el listado y la ficha, y dos copias divergen: la
 * primera vez que una se quede corta, el producto que no aparece en el listado se alcanza
 * escribiendo su dirección — que es exactamente el fallo que este encargo pedía comprobar.
 */
/**
 * Un identificador, tal y como el motor lo reconoce.
 *
 * La comprobación no es cosmética. `warehouse_products.id` es `uuid`, y comparar esa columna con
 * `panel-led-bicolor` **no devuelve vacío: revienta la consulta** con un error de conversión, que
 * sale por el manejador como un `500`. La ficha por identificador legible —que la spec exige— no
 * funcionaría nunca, y el síntoma sería un error del servidor en la dirección más normal de la
 * tienda.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Por identificador **o** por identificador legible, que es lo que pide `api-conventions`.
 *
 * Sin ambigüedad posible: los dos alfabetos no se solapan, porque `slugify` nunca produce algo con
 * la forma de un identificador —lleva guiones en otras posiciones y no está acotado a hexadecimal—.
 */
function byHandle(handle: string): SQL | undefined {
  if (UUID.test(handle)) {
    return or(eq(warehouseProducts.id, handle), eq(warehouseProducts.slug, handle))
  }
  return eq(warehouseProducts.slug, handle)
}

function visible(warehouseId: string): SQL | undefined {
  return and(
    eq(warehouseProducts.warehouseId, warehouseId),
    eq(warehouseProducts.isPublished, true),
    eq(warehouseProducts.isProvisional, false),
    isNull(warehouseProducts.deletedAt),
  )
}

// ─── Resolución ──────────────────────────────────────────────────────────────

/**
 * Abre la transacción de la tienda: resuelve el sitio, atraviesa las compuertas, y sólo entonces
 * ejecuta el trabajo.
 *
 * Todas las lecturas públicas pasan por aquí, y ésa es la razón de que exista: una lectura que se
 * saltara la resolución serviría el catálogo de una empresa cuya suscripción venció.
 */
async function withSite<T>(
  slug: string,
  work: (tx: Transaction, row: typeof websites.$inferSelect, site: ResolvedSite) => Promise<T>,
): Promise<T> {
  const companyId = await publicWebsiteCompany(slug)
  if (!companyId) throw new NotFoundError(SITE_NOT_FOUND)

  return withSystem(OPERATION, [companyId], async (tx) => {
    const [row] = await tx
      .select()
      .from(websites)
      .where(
        and(eq(websites.slug, slug), eq(websites.isPublished, true), isNull(websites.deletedAt)),
      )
      .limit(1)

    // La función del motor acaba de decir que existe; no llegar aquí sería una carrera con quien lo
    // despublica en este instante, y entonces la respuesta correcta es la misma que si no existiera.
    if (!row) throw new NotFoundError(SITE_NOT_FOUND)

    const blocked = await closedGate(tx, row.companyId)
    if (blocked) throw new StorefrontUnavailable(blocked)

    return work(tx, row, {
      companyId: row.companyId,
      warehouseId: row.warehouseId,
      vertical: verticalOf(await keynameOf(tx, row.categoryId)),
    })
  })
}

/**
 * Como `withSite`, pero para todo lo que **no es la resolución**.
 *
 * Sólo la portada distingue «no existe» de «existe y hoy no se sirve», porque sólo ella tiene una
 * página que enseñar por cada motivo. Para el catálogo y la ficha, una compuerta cerrada es una
 * dirección que no está sirviendo nada, y eso es un `404`: devolver una lista vacía diría que la
 * tienda funciona y hoy no tiene productos, que es otra cosa distinta y lleva a otra pantalla.
 */
async function serving<T>(
  slug: string,
  work: (tx: Transaction, row: typeof websites.$inferSelect, site: ResolvedSite) => Promise<T>,
): Promise<T> {
  try {
    return await withSite(slug, work)
  } catch (error) {
    if (error instanceof StorefrontUnavailable) throw new NotFoundError(SITE_NOT_FOUND)
    throw error
  }
}

/**
 * La tienda existe y hoy no se sirve.
 *
 * No es un `DomainError` del contrato: no hay ningún código de estado que signifique «esta tienda
 * está suspendida», y forzarlo dentro de `403` o `422` obligaría a la interfaz a distinguirlo del
 * resto de los `403` por el texto del mensaje. Lo transporta el manejador como parte de la
 * respuesta, que es donde la spec quiere que esté: «una página propia en lugar de un error
 * genérico».
 */
export class StorefrontUnavailable extends Error {
  readonly reason: UnavailableReason

  constructor(reason: UnavailableReason) {
    super(`La tienda no está disponible: ${reason}`)
    this.name = "StorefrontUnavailable"
    this.reason = reason
  }
}

/**
 * Qué empresa sirve este subdominio, preguntándoselo al motor.
 *
 * Fuera de cualquier alcance declarado, porque **la empresa es justo lo que se está averiguando**.
 * `app.public_website` es `security definer`, responde a esta única pregunta y comprueba dentro la
 * publicación: un sitio sin publicar y un subdominio libre son el mismo nulo.
 */
async function publicWebsiteCompany(slug: string): Promise<string | null> {
  return withSystem(`${OPERATION}.resolver`, [], async (tx) => {
    const rows = await tx.execute<{ company_id: string | null }>(
      sql`select app.public_website(${slug}) as company_id`,
    )

    return rows[0]?.company_id ?? null
  })
}

/**
 * Las compuertas dos y tres, en orden. Nada si la tienda se puede servir.
 *
 * El orden importa para el mensaje que ve el visitante: si la empresa ni paga ni tiene el servicio,
 * lo que hay que decirle a quien la administra es lo primero.
 */
async function closedGate(tx: Transaction, companyId: string): Promise<UnavailableReason | null> {
  if (!(await hasLiveSubscription(tx, companyId))) return "subscription"
  if (!(await hasService(tx, companyId))) return "service"
  return null
}

/**
 * La suscripción de la empresa está vigente.
 *
 * Vigente son los estados en los que la plataforma da servicio —`trialing` y `active`— más
 * `past_due` **mientras dure la gracia**: «un fallo transitorio de tarjeta no corta el servicio», y
 * la implementación anterior tumbaba la tienda ante el primer rechazo (`DEFECTS.md` M-08). Una
 * cancelación programada al final del periodo sigue en `active` y por tanto sigue sirviendo, que es
 * lo que la spec pide con «mientras el periodo siga vigente conserva todas sus funciones».
 *
 * **Sin ninguna suscripción, la tienda no se sirve.** Es el criterio literal de la spec, y se deja
 * escrito aquí porque hoy no hay forma de contratar una: la rebanada 11 no está. Anotado como
 * `HALLAZGOS.md` H-92 — cuando llegue, esta función tiene que converger con la suya en lugar de
 * quedarse como una segunda definición de «vigente».
 */
async function hasLiveSubscription(tx: Transaction, companyId: string): Promise<boolean> {
  const now = new Date()

  const [row] = await tx
    .select({ id: companySubscriptions.id })
    .from(companySubscriptions)
    .where(
      and(
        eq(companySubscriptions.companyId, companyId),
        or(
          inArray(companySubscriptions.status, ["trialing", "active"]),
          and(
            eq(companySubscriptions.status, "past_due"),
            gt(companySubscriptions.gracePeriodEndsAt, now),
          ),
        ),
      ),
    )
    .limit(1)

  return row !== undefined
}

async function hasService(tx: Transaction, companyId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: companyServices.id })
    .from(companyServices)
    .innerJoin(services, eq(services.id, companyServices.serviceId))
    .where(and(eq(companyServices.companyId, companyId), eq(services.keycode, "websites")))
    .limit(1)

  return row !== undefined
}

/**
 * El almacén del que sale el catálogo.
 *
 * Se comprueba que **siga publicado**: despublicar el almacén retira su tienda sin tocar el sitio,
 * que es lo que la spec quiere decir con «sólo se publica lo que la fuente publica». Sin fuente
 * utilizable no hay catálogo, y eso es un `404`, no una lista vacía — una lista vacía diría que la
 * tienda existe y hoy no vende nada, que es otra cosa.
 */
async function sourceOf(tx: Transaction, site: ResolvedSite): Promise<string> {
  if (site.vertical !== "warehouse" || site.warehouseId === null) {
    throw new NotFoundError(PRODUCT_NOT_FOUND)
  }

  const [warehouse] = await tx
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.id, site.warehouseId), isNull(warehouses.deletedAt)))
    .limit(1)

  if (!warehouse) throw new NotFoundError(PRODUCT_NOT_FOUND)
  return warehouse.id
}

async function keynameOf(tx: Transaction, categoryId: string | null): Promise<string | null> {
  if (categoryId === null) return null

  const [row] = await tx
    .select({ keyname: globalCategories.keyname })
    .from(globalCategories)
    .where(eq(globalCategories.id, categoryId))
    .limit(1)

  return row?.keyname ?? null
}

async function composeSite(
  tx: Transaction,
  row: typeof websites.$inferSelect,
  site: ResolvedSite,
): Promise<StorefrontSite> {
  const ids = [row.logoUploadId, row.iconUploadId].filter((id): id is string => id !== null)
  const files =
    ids.length === 0
      ? []
      : await tx
          .select({ id: uploads.id, url: uploads.url })
          .from(uploads)
          .where(inArray(uploads.id, ids))

  const urlOf = (id: string | null) =>
    id === null ? null : (files.find((file) => file.id === id)?.url ?? null)

  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    vertical: site.vertical,
    logoUrl: urlOf(row.logoUploadId),
    iconUrl: urlOf(row.iconUploadId),
    categories:
      site.vertical === "warehouse" && site.warehouseId !== null
        ? await categoriesOf(tx, site.warehouseId)
        : [],
  }
}

async function categoriesOf(tx: Transaction, warehouseId: string): Promise<StorefrontCategory[]> {
  const rows = await tx
    .select({
      id: warehouseCategories.id,
      parentId: warehouseCategories.parentId,
      name: warehouseCategories.name,
      slug: warehouseCategories.slug,
    })
    .from(warehouseCategories)
    .where(eq(warehouseCategories.warehouseId, warehouseId))
    .orderBy(asc(warehouseCategories.name))

  return rows
}

async function coversOf(
  tx: Transaction,
  productIds: readonly string[],
): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map()

  const rows = await tx
    .select({
      productId: warehouseProductImages.productId,
      url: uploads.url,
      variants: uploads.variants,
    })
    .from(warehouseProductImages)
    .innerJoin(uploads, eq(uploads.id, warehouseProductImages.uploadId))
    .where(
      and(
        inArray(warehouseProductImages.productId, [...productIds]),
        eq(warehouseProductImages.isCover, true),
      ),
    )

  return new Map(rows.map((row) => [row.productId, row.variants?.thumbnail ?? row.url]))
}

async function imagesOf(tx: Transaction, productId: string): Promise<StorefrontImage[]> {
  const rows = await tx
    .select({
      position: warehouseProductImages.position,
      isCover: warehouseProductImages.isCover,
      url: uploads.url,
      variants: uploads.variants,
    })
    .from(warehouseProductImages)
    .innerJoin(uploads, eq(uploads.id, warehouseProductImages.uploadId))
    .where(eq(warehouseProductImages.productId, productId))
    .orderBy(asc(warehouseProductImages.position))

  return rows.map((row) => ({
    url: row.url,
    thumbnailUrl: row.variants?.thumbnail ?? null,
    position: row.position,
    isCover: row.isCover,
  }))
}

/**
 * Las medidas, **sin sus unidades**.
 *
 * El catálogo interno acompaña cada medida del recuento de unidades por estado —disponibles, en
 * cotización, rentadas, dañadas—. Eso es la nave, no el escaparate: dice cuánto equipo tiene la
 * empresa y en qué condición está. Aquí sólo va el nombre, que es lo que hace falta para elegir
 * entre «Cuerpo» y «Kit con óptica».
 *
 * La disponibilidad real que pide `public-storefronts` —«ve que hay dos disponibles»— llega con el
 * carrito, en la rebanada 18: hoy no hay nada que hacer con el número, y publicar existencias es
 * una decisión que no debe tomarse como efecto secundario de otra cosa.
 */
async function measurementsOf(
  tx: Transaction,
  productId: string,
): Promise<StorefrontMeasurement[]> {
  return tx
    .select({ id: warehouseMeasurements.id, name: warehouseMeasurements.name })
    .from(warehouseMeasurements)
    .where(
      and(eq(warehouseMeasurements.productId, productId), isNull(warehouseMeasurements.deletedAt)),
    )
    .orderBy(asc(warehouseMeasurements.name))
}
