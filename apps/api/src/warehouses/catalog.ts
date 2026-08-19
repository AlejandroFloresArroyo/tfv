/**
 * Catálogo de un almacén.
 *
 * Ver `openspec/specs/warehouse-catalog/spec.md`. Rebanada 12.
 *
 * Tres niveles que conviene no confundir:
 *
 * | Nivel | Qué es | Ejemplo |
 * |---|---|---|
 * | **Producto** | El artículo del catálogo | «Cámara Sony FX6» |
 * | **Medida** | La variante mensurable a la que se lleva existencia | «Cuerpo», «Kit con óptica» |
 * | **Unidad** | Un objeto físico concreto | La cámara con número de serie tal |
 *
 * ## El cambio de fondo de esta rebanada
 *
 * **Crear un producto con toda su estructura es atómico.** La implementación anterior creaba de
 * forma recursiva medidas, unidades, tarifas, variantes y accesorios **sin transacción**, así que
 * un fallo a mitad dejaba un producto incompleto: existente, listable, y con la mitad de sus
 * medidas. Eso no se detecta mirando; se detecta semanas después, cuando alguien cotiza y las
 * cuentas no salen.
 *
 * Aquí toda la estructura entra en una sola transacción. Si falla la segunda variante, no queda
 * creado el producto ni ninguna de sus medidas, existencias o variantes.
 *
 * ## Variantes y accesorios son productos hijos
 *
 * Y heredan del padre almacén, ubicación, clasificación y responsable **en el momento de crearse**,
 * pudiendo divergir después. Es lo que evita reclasificar veinte variantes a mano — y por eso
 * reclasificar al padre se propaga a todo el subárbol.
 */

import {
  buildPage,
  ConflictError,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
  slugCandidate,
  slugify,
  UnprocessableError,
} from "@tfv/contracts"
import {
  LENGTH_UNITS,
  type LengthUnit,
  MASS_UNITS,
  type MassUnit,
  MEASUREMENT_KINDS,
  type MeasurementKind,
} from "@tfv/contracts/catalog"
import { type Transaction, withRequester } from "@tfv/db"
import {
  type ClothingSheet,
  type Dimensions,
  uploads,
  warehouseMeasurements,
  warehouseProductImages,
  warehouseProducts,
  warehouseStockUnits,
} from "@tfv/db/schema"
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import {
  assertUsableImages,
  diffCollection,
  releaseUploads,
  sweepObjects,
} from "../media/collections.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { categorySubtree } from "./categories.ts"
import { recordEvents } from "./stock.ts"
import { loadWarehouse } from "./warehouses.ts"

export type ProductRelation = "variant" | "accessory"

export type { LengthUnit, MassUnit, MeasurementKind }
/**
 * El vocabulario de las medidas vive en el contrato compartido.
 *
 * Se re-exporta desde aquí para no obligar a cada llamante a saber de dónde viene. La lista está
 * también en el motor, como tipo enumerado; ésa es la copia que no se puede evitar, porque el
 * navegador no puede importar el esquema de la base.
 */
export { LENGTH_UNITS, MASS_UNITS, MEASUREMENT_KINDS }

export interface ProductRecord {
  readonly id: string
  readonly warehouseId: string
  readonly parentId: string | null
  readonly relationToParent: ProductRelation | null
  readonly name: string
  readonly description: string
  readonly internalCode: string | null
  readonly code: string
  readonly cost: string
  readonly price: string
  readonly usesPriceLists: boolean
  readonly availableForSale: boolean
  readonly availableForRent: boolean
  readonly storageId: string | null
  readonly categoryId: string | null
  readonly globalCategoryId: string | null
  readonly responsibleId: string | null
  readonly slug: string | null
  readonly isPublished: boolean
  /** Alta provisional desde una cotización, pendiente de completarse. */
  readonly isProvisional: boolean
  /**
   * La portada, en tamaño de celda, o nada.
   *
   * Viaja con el producto en los listados porque es para lo que existe una portada: la rejilla del
   * catálogo enseña una foto por producto y no puede pedir la galería de cada uno.
   */
  readonly coverUrl: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** Una foto de la galería, con lo que la pantalla necesita para pintarla. */
export interface ProductImageRecord {
  readonly uploadId: string
  readonly url: string
  /** El derivado de celda. Nulo cuando el navegador que la subió no supo producirlo. */
  readonly thumbnailUrl: string | null
  readonly position: number
  readonly isCover: boolean
}

export interface MeasurementRecord {
  readonly id: string
  readonly productId: string
  readonly name: string
  readonly kind: MeasurementKind
  readonly priceDifference: string
  readonly dimensions: Dimensions
  readonly lengthUnit: LengthUnit
  readonly massUnit: MassUnit
  readonly clothing: ClothingSheet | null
  /** Cuántas unidades hay en cada estado. Es lo que el detalle presenta como disponibilidad. */
  readonly units: Readonly<Record<string, number>>
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** El producto con su estructura, que es como lo presenta la vista de detalle. */
export interface ProductDetail extends ProductRecord {
  readonly measurements: readonly MeasurementRecord[]
  readonly variants: readonly ProductRecord[]
  readonly accessories: readonly ProductRecord[]
  readonly images: readonly ProductImageRecord[]
}

// ─── Consulta ────────────────────────────────────────────────────────────────

/**
 * Qué se puede pedir del catálogo.
 *
 * `categoryId` filtra **incluyendo las descendientes**, como exige la spec: filtrar por
 * «Iluminación» tiene que traer lo clasificado en «LED · Paneles». Esa expansión no la hace la
 * gramática genérica —no sabe qué campos son jerárquicos—, así que se resuelve aquí antes de
 * construir la condición.
 */
export const productQuery: QuerySchema = {
  filters: {
    categoryId: { type: "id", label: "Categoría" },
    globalCategoryId: { type: "id", label: "Categoría global" },
    storageId: { type: "id", label: "Ubicación" },
    isPublished: { type: "boolean", label: "Publicación" },
    /** La bandeja de lo que se dio de alta a la carrera y está pendiente de completarse. */
    isProvisional: { type: "boolean", label: "Provisional" },
    availableForSale: { type: "boolean", label: "Venta" },
    availableForRent: { type: "boolean", label: "Renta" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["name", "description", "slug", "code"],
  sortable: ["name", "code", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
}

const mapping = {
  fields: {
    categoryId: warehouseProducts.categoryId,
    globalCategoryId: warehouseProducts.globalCategoryId,
    storageId: warehouseProducts.storageId,
    isPublished: warehouseProducts.isPublished,
    isProvisional: warehouseProducts.isProvisional,
    availableForSale: warehouseProducts.availableForSale,
    availableForRent: warehouseProducts.availableForRent,
    name: warehouseProducts.name,
    code: warehouseProducts.code,
    createdAt: warehouseProducts.createdAt,
  },
  searchable: [
    warehouseProducts.name,
    warehouseProducts.description,
    warehouseProducts.slug,
    warehouseProducts.code,
  ],
  tiebreak: warehouseProducts.id,
}

/**
 * Lista el catálogo. **Sólo los productos raíz.**
 *
 * Las variantes y los accesorios se consultan desde su padre: un producto con tres variantes es un
 * elemento del catálogo, no cuatro. Sin esto, buscar «cámara» devuelve la misma cámara cuatro veces
 * y el recuento del listado deja de significar nada.
 */
export async function listProducts(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  query: ParsedQuery,
): Promise<Page<ProductRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const where = and(
      eq(warehouseProducts.warehouseId, warehouseId),
      isNull(warehouseProducts.parentId),
      isNull(warehouseProducts.deletedAt),
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
      rows.map((row) => withCover(toProductRecord(row), covers)),
      total?.value ?? 0,
      page,
      limit,
    )
  })
}

function withCover(record: ProductRecord, covers: ReadonlyMap<string, string>): ProductRecord {
  return { ...record, coverUrl: covers.get(record.id) ?? null }
}

export async function getProduct(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  productId: string,
): Promise<ProductDetail> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    return getStructure(tx, warehouseId, productId)
  })
}

// ─── Alta con estructura ─────────────────────────────────────────────────────

export interface MeasurementInput {
  readonly name: string
  readonly kind?: MeasurementKind | undefined
  readonly priceDifference?: string | undefined
  readonly dimensions?: Dimensions | undefined
  readonly lengthUnit?: LengthUnit | undefined
  readonly massUnit?: MassUnit | undefined
  readonly clothing?: ClothingSheet | undefined
  /** Cuántas unidades materializar. Ausente o cero: la medida existe sin existencias. */
  readonly initialQuantity?: number | undefined
}

/**
 * Corregir una medida.
 *
 * Todo opcional salvo lo que no está: **la cantidad inicial no se puede corregir**. Creó unidades
 * físicas, cada una con su código y su etiqueta impresa; «que ahora sean cinco en vez de tres» no
 * dice cuáles se destruyen. Las unidades se dan de alta y de baja por su cuenta.
 */
export interface MeasurementPatch {
  readonly name?: string | undefined
  readonly kind?: MeasurementKind | undefined
  readonly priceDifference?: string | undefined
  readonly dimensions?: Dimensions | undefined
  readonly lengthUnit?: LengthUnit | undefined
  readonly massUnit?: MassUnit | undefined
  readonly clothing?: ClothingSheet | undefined
}

export interface ChildInput {
  readonly name: string
  readonly description?: string | undefined
  readonly internalCode?: string | undefined
  readonly cost?: string | undefined
  readonly price?: string | undefined
  readonly measurements?: readonly MeasurementInput[] | undefined
}

export interface CreateProductInput {
  readonly name: string
  readonly description?: string | undefined
  readonly internalCode?: string | undefined
  readonly cost?: string | undefined
  readonly price?: string | undefined
  readonly usesPriceLists?: boolean | undefined
  readonly availableForSale?: boolean | undefined
  readonly availableForRent?: boolean | undefined
  readonly storageId?: string | null | undefined
  readonly categoryId?: string | null | undefined
  readonly globalCategoryId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
  readonly isPublished?: boolean | undefined
  /** Alta provisional desde una cotización: mientras lo sea, no se publica. */
  readonly isProvisional?: boolean | undefined
  readonly measurements?: readonly MeasurementInput[] | undefined
  readonly variants?: readonly ChildInput[] | undefined
  readonly accessories?: readonly ChildInput[] | undefined
}

/**
 * Crea un producto con toda su estructura, **en una transacción**.
 *
 * Es el criterio de aceptación de la rebanada: un fallo a mitad no deja nada. La transacción la
 * abre `withRequester`, así que basta con que todo el trabajo ocurra dentro del callback — y por
 * eso las inserciones de hijos y medidas se hacen aquí y no llamando a `createProduct` otra vez,
 * que abriría transacciones anidadas y rompería la propiedad.
 */
export async function createProduct(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  input: CreateProductInput,
): Promise<ProductDetail> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)

    const productId = newId()
    const [product] = await tx
      .insert(warehouseProducts)
      .values({
        id: productId,
        warehouseId,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        internalCode: input.internalCode?.trim() || null,
        code: productCode(),
        slug: await freeSlug(tx, input.name),
        ...(input.cost === undefined ? {} : { cost: input.cost }),
        ...(input.price === undefined ? {} : { price: input.price }),
        ...(input.usesPriceLists === undefined ? {} : { usesPriceLists: input.usesPriceLists }),
        ...(input.availableForSale === undefined
          ? {}
          : { availableForSale: input.availableForSale }),
        ...(input.availableForRent === undefined
          ? {}
          : { availableForRent: input.availableForRent }),
        // Un producto provisional no se publica, aunque se pida. La marca es lo que impide que un
        // alta hecha a la carrera delante de un cliente acabe en la tienda pública.
        isProvisional: input.isProvisional ?? false,
        isPublished: input.isProvisional ? false : (input.isPublished ?? false),
        storageId: input.storageId ?? null,
        categoryId: input.categoryId ?? null,
        globalCategoryId: input.globalCategoryId ?? null,
        // Si no se indica otro, el responsable es quien lo creó. Un producto sin responsable no
        // tiene a quién preguntarle cuando falta.
        responsibleId: input.responsibleId ?? actor.userId,
      })
      .returning()

    if (!product) throw new Error("la inserción del producto no devolvió fila")

    for (const measurement of input.measurements ?? []) {
      await insertMeasurement(tx, productId, measurement, actor.userId)
    }

    for (const [relation, children] of [
      ["variant", input.variants ?? []],
      ["accessory", input.accessories ?? []],
    ] as const) {
      for (const child of children) {
        await insertChild(tx, product, relation, child, actor.userId)
      }
    }

    const created = await getStructure(tx, warehouseId, productId)
    return created
  })
}

// ─── Edición ─────────────────────────────────────────────────────────────────

export interface UpdateProductInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
  readonly internalCode?: string | null | undefined
  readonly cost?: string | undefined
  readonly price?: string | undefined
  readonly usesPriceLists?: boolean | undefined
  readonly availableForSale?: boolean | undefined
  readonly availableForRent?: boolean | undefined
  readonly storageId?: string | null | undefined
  readonly categoryId?: string | null | undefined
  readonly globalCategoryId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
  readonly isPublished?: boolean | undefined
  /** Retirar la marca provisional es **convertirlo en producto de catálogo**. Ver la ruta. */
  readonly isProvisional?: boolean | undefined
  readonly slug?: string | undefined
}

/**
 * Edita un producto.
 *
 * **La reclasificación se propaga a todo el subárbol.** Categoría, categoría global y ubicación son
 * los tres campos que los hijos heredan, y cambiarlos en el padre los cambia en las variantes y los
 * accesorios a cualquier profundidad. Es lo que evita reclasificar veinte variantes a mano, que es
 * exactamente el trabajo que la herencia existe para ahorrar.
 *
 * El resto de campos **no** se propaga: el nombre, el precio y la disponibilidad de una variante
 * son suyos, y ése es el sentido de que sea una variante.
 *
 * El código identificativo no se toca nunca. Está impreso en la etiqueta.
 */
export async function updateProduct(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  productId: string,
  input: UpdateProductInput,
): Promise<ProductDetail> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const current = await loadProduct(tx, warehouseId, productId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description.trim()
    if (input.internalCode !== undefined) patch.internalCode = input.internalCode?.trim() || null
    if (input.cost !== undefined) patch.cost = input.cost
    if (input.price !== undefined) patch.price = input.price
    if (input.usesPriceLists !== undefined) patch.usesPriceLists = input.usesPriceLists
    if (input.availableForSale !== undefined) patch.availableForSale = input.availableForSale
    if (input.availableForRent !== undefined) patch.availableForRent = input.availableForRent
    if (input.responsibleId !== undefined) patch.responsibleId = input.responsibleId
    if (input.isProvisional !== undefined) patch.isProvisional = input.isProvisional

    // Mientras siga provisional no se publica. Es la única prohibición que necesita la marca: sin
    // publicar no llega a la tienda, y ahí es donde un alta a medias haría daño de verdad.
    const provisional = input.isProvisional ?? current.isProvisional
    if (input.isPublished !== undefined) {
      if (input.isPublished && provisional) {
        throw new ConflictError(
          "Un producto provisional no se publica. Complétalo y retira la marca antes.",
        )
      }
      patch.isPublished = input.isPublished
    }

    if (input.slug !== undefined) {
      const slug = slugify(input.slug, "producto")
      if (slug !== current.slug) await assertSlugFree(tx, slug)
      patch.slug = slug
    }

    const inherited: Record<string, unknown> = {}
    if (input.storageId !== undefined) inherited.storageId = input.storageId
    if (input.categoryId !== undefined) inherited.categoryId = input.categoryId
    if (input.globalCategoryId !== undefined) inherited.globalCategoryId = input.globalCategoryId

    if (Object.keys(patch).length > 0 || Object.keys(inherited).length > 0) {
      await tx
        .update(warehouseProducts)
        .set({ ...patch, ...inherited })
        .where(eq(warehouseProducts.id, productId))
    }

    if (Object.keys(inherited).length > 0) {
      const descendants = await descendantIds(tx, productId)
      const others = descendants.filter((id) => id !== productId)

      if (others.length > 0) {
        await tx
          .update(warehouseProducts)
          .set(inherited)
          .where(inArray(warehouseProducts.id, others))
      }
    }

    return getStructure(tx, warehouseId, productId)
  })
}

// ─── Baja ────────────────────────────────────────────────────────────────────

export interface ProductDeletionScope {
  /** Él mismo incluido. */
  readonly products: number
  readonly measurements: number
  readonly units: number
}

export async function productDeletionScope(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  productId: string,
): Promise<ProductDeletionScope> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadProduct(tx, warehouseId, productId)

    const products = await descendantIds(tx, productId)
    const measurements = await measurementIds(tx, products)

    const units =
      measurements.length === 0
        ? 0
        : ((
            await tx
              .select({ value: count() })
              .from(warehouseStockUnits)
              .where(
                and(
                  inArray(warehouseStockUnits.measurementId, measurements),
                  isNull(warehouseStockUnits.deletedAt),
                ),
              )
          )[0]?.value ?? 0)

    return { products: products.length, measurements: measurements.length, units }
  })
}

/**
 * Da de baja un producto y su estructura.
 *
 * **Borrado lógico en las tres tablas**, y por eso el recorrido sí es explícito: una cascada del
 * motor borraría de verdad, y aquí las filas tienen que sobrevivir porque aparecen en cotizaciones
 * y pedidos ya emitidos. Lo que no hay es una cascada escrita a mano *que borre*: se marca una
 * fecha sobre un conjunto de identificadores que la propia base calculó.
 *
 * **Falta la comprobación de compromisos.** La spec exige rechazar la baja cuando alguna unidad
 * esté reservada en una cotización o un pedido en curso, y eso necesita las rebanadas 14 y 15. Hoy
 * no hay nada que consultar.
 */
export async function deleteProduct(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  productId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadProduct(tx, warehouseId, productId)

    const now = new Date()
    const products = await descendantIds(tx, productId)
    const measurements = await measurementIds(tx, products)

    if (measurements.length > 0) {
      await tx
        .update(warehouseStockUnits)
        .set({ deletedAt: now })
        .where(inArray(warehouseStockUnits.measurementId, measurements))

      await tx
        .update(warehouseMeasurements)
        .set({ deletedAt: now })
        .where(inArray(warehouseMeasurements.id, measurements))
    }

    await tx
      .update(warehouseProducts)
      .set({ deletedAt: now, storageId: null })
      .where(inArray(warehouseProducts.id, products))
  })
}

// ─── Medidas ─────────────────────────────────────────────────────────────────

export async function addMeasurement(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  productId: string,
  input: MeasurementInput,
): Promise<MeasurementRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadProduct(tx, warehouseId, productId)

    const id = await insertMeasurement(tx, productId, input, actor.userId)
    const [record] = await measurementsOf(tx, productId, [id])
    if (!record) throw new Error("la medida recién creada no se pudo leer")
    return record
  })
}

/**
 * Corregir una medida sin tocar sus unidades.
 *
 * Existe por lo que costaba no tenerla: una errata en el nombre sólo se podía arreglar borrando la
 * medida y volviéndola a crear, y eso **borra sus unidades** —objetos físicos con su código
 * impreso en una etiqueta pegada a cada uno—.
 *
 * **Criterio adoptado, y anotado**: la protege `warehouses.products.measurement_create`. No hay
 * clave propia para corregir, el catálogo de permisos está cerrado en las 255 migradas, y
 * ampliarlo es decisión de producto. Quien puede añadir una medida puede corregir la que añadió;
 * la alternativa —exigir la de borrado— pediría el permiso de la operación destructiva para hacer
 * la que no lo es.
 */
/**
 * Añadir una variante o un accesorio a un producto que ya existe.
 *
 * La creación con estructura completa deja crear los hijos **en el mismo acto que el padre**, y era
 * la única forma que había. Pero una variante nace casi siempre después: llega la cámara negra
 * cuando la gris lleva un año en la nave. La spec ya lo daba por supuesto —«**WHEN** se le crea una
 * variante»— sin exigir que fuera en la misma operación.
 *
 * Hereda lo mismo que un hijo creado con su padre, y por el mismo motivo: **copiando**, no
 * refiriendo. Poder divergir es lo que hace que una variante sea una variante.
 */
export async function addChild(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  productId: string,
  relation: ProductRelation,
  input: ChildInput,
): Promise<ProductRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    const parent = await loadProduct(tx, warehouseId, productId)

    const childId = await insertChild(tx, parent, relation, input, actor.userId)
    return toProductRecord(await loadProduct(tx, warehouseId, childId))
  })
}

export async function updateMeasurement(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  productId: string,
  measurementId: string,
  input: MeasurementPatch,
): Promise<MeasurementRecord> {
  return withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadProduct(tx, warehouseId, productId)

    // La pertenencia al producto se comprueba aquí y no en la condición del `update`: una medida de
    // otro producto tiene que responder «no existe», no «no se cambió nada».
    const [measurement] = await tx
      .select({ id: warehouseMeasurements.id })
      .from(warehouseMeasurements)
      .where(
        and(
          eq(warehouseMeasurements.id, measurementId),
          eq(warehouseMeasurements.productId, productId),
          isNull(warehouseMeasurements.deletedAt),
        ),
      )
      .limit(1)

    if (!measurement) throw new NotFoundError("La medida no existe")

    await tx
      .update(warehouseMeasurements)
      .set({
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.priceDifference === undefined ? {} : { priceDifference: input.priceDifference }),
        ...(input.dimensions === undefined ? {} : { dimensions: input.dimensions }),
        ...(input.lengthUnit === undefined ? {} : { lengthUnit: input.lengthUnit }),
        ...(input.massUnit === undefined ? {} : { massUnit: input.massUnit }),
        ...(input.clothing === undefined ? {} : { clothing: input.clothing }),
        updatedAt: new Date(),
      })
      .where(eq(warehouseMeasurements.id, measurementId))

    const [record] = await measurementsOf(tx, productId, [measurementId])
    if (!record) throw new Error("la medida recién corregida no se pudo leer")
    return record
  })
}

export async function deleteMeasurement(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  productId: string,
  measurementId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadProduct(tx, warehouseId, productId)

    const [measurement] = await tx
      .select({ id: warehouseMeasurements.id })
      .from(warehouseMeasurements)
      .where(
        and(
          eq(warehouseMeasurements.id, measurementId),
          eq(warehouseMeasurements.productId, productId),
          isNull(warehouseMeasurements.deletedAt),
        ),
      )
      .limit(1)

    if (!measurement) throw new NotFoundError("La medida no existe")

    const now = new Date()
    await tx
      .update(warehouseStockUnits)
      .set({ deletedAt: now })
      .where(eq(warehouseStockUnits.measurementId, measurementId))

    await tx
      .update(warehouseMeasurements)
      .set({ deletedAt: now })
      .where(eq(warehouseMeasurements.id, measurementId))
  })
}

// ─── Fotos ───────────────────────────────────────────────────────────────────

export interface ProductImagesInput {
  /** La galería entera, **en el orden en que se enseña**. Lo que no venga, deja de estar. */
  readonly uploadIds: readonly string[]
  /** Cuál se enseña en el listado. Ausente, se conserva la que hubiera; si no, la primera. */
  readonly coverUploadId?: string | null | undefined
}

/**
 * Sustituye la galería de un producto.
 *
 * Es el requisito «Sustituir una colección de archivos» aplicado: se envía la colección entera y el
 * servidor **diferencia**. Se envía entera y no «añade ésta, quita aquélla» porque el orden es parte
 * de la colección, y un orden que se compone de operaciones sueltas acaba dependiendo de en qué
 * orden lleguen.
 *
 * Lo que queda fuera de la galería se suelta con las tres salvaguardas de `media/collections.ts`:
 * no se toca lo que sigue estando, ni lo que otra entidad referencia, ni un marcador de posición.
 *
 * **La portada existe siempre que haya fotos.** Un producto con galería y sin portada obligaría a
 * cada listado a inventarse cuál enseñar, y dos listados se inventarían cosas distintas.
 */
export async function setProductImages(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  productId: string,
  input: ProductImagesInput,
): Promise<ProductDetail> {
  const { detail, released } = await withRequester(actor, async (tx) => {
    await loadWarehouse(tx, companyId, warehouseId)
    await loadProduct(tx, warehouseId, productId)

    const existing = await tx
      .select()
      .from(warehouseProductImages)
      .where(eq(warehouseProductImages.productId, productId))
      .orderBy(asc(warehouseProductImages.position))

    const diff = diffCollection(
      existing.map((row) => row.uploadId),
      input.uploadIds,
    )

    await assertUsableImages(tx, companyId, diff.next)

    if (diff.removed.length > 0) {
      await tx
        .delete(warehouseProductImages)
        .where(
          and(
            eq(warehouseProductImages.productId, productId),
            inArray(warehouseProductImages.uploadId, [...diff.removed]),
          ),
        )
    }

    // La portada se apaga en **una** sentencia antes de encender la nueva: el índice único parcial
    // se comprueba al terminar cada sentencia, y apagar y encender fila a fila deja un instante con
    // dos portadas que el motor rechaza con razón.
    await tx
      .update(warehouseProductImages)
      .set({ isCover: false })
      .where(
        and(
          eq(warehouseProductImages.productId, productId),
          eq(warehouseProductImages.isCover, true),
        ),
      )

    for (const [position, uploadId] of diff.next.entries()) {
      if (diff.added.includes(uploadId)) {
        await tx
          .insert(warehouseProductImages)
          .values({ id: newId(), productId, uploadId, position })
        continue
      }

      await tx
        .update(warehouseProductImages)
        .set({ position, updatedAt: new Date() })
        .where(
          and(
            eq(warehouseProductImages.productId, productId),
            eq(warehouseProductImages.uploadId, uploadId),
          ),
        )
    }

    const cover = chooseCover(diff.next, input.coverUploadId, existing)
    if (cover !== null) {
      await tx
        .update(warehouseProductImages)
        .set({ isCover: true })
        .where(
          and(
            eq(warehouseProductImages.productId, productId),
            eq(warehouseProductImages.uploadId, cover),
          ),
        )
    }

    return {
      detail: await getStructure(tx, warehouseId, productId),
      // Va **después** de haber quitado las filas de la galería: la comprobación de referencias mira
      // el estado de esta transacción, y hecha antes diría que la foto sigue en uso.
      released: await releaseUploads(tx, diff.removed),
    }
  })

  await sweepObjects(released)
  return detail
}

/**
 * Cuál es la portada.
 *
 * Lo elegido manda; si no se eligió, sigue la que ya lo era mientras siga en la galería; y si no,
 * la primera. Elegir una que no está en la colección es no elegir: se ignora en lugar de rechazar,
 * porque la pantalla puede quitar una foto y mandar su elección anterior en el mismo envío.
 */
function chooseCover(
  next: readonly string[],
  chosen: string | null | undefined,
  existing: readonly { uploadId: string; isCover: boolean }[],
): string | null {
  if (next.length === 0) return null
  if (chosen != null && next.includes(chosen)) return chosen

  const current = existing.find((row) => row.isCover)?.uploadId
  if (current !== undefined && next.includes(current)) return current

  return next[0] ?? null
}

/** La galería de un producto, en su orden. */
async function imagesOf(tx: Transaction, productId: string): Promise<ProductImageRecord[]> {
  const rows = await tx
    .select({
      uploadId: warehouseProductImages.uploadId,
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
    uploadId: row.uploadId,
    url: row.url,
    thumbnailUrl: row.variants?.thumbnail ?? null,
    position: row.position,
    isCover: row.isCover,
  }))
}

/**
 * La portada de cada producto de una lista, en una sola consulta.
 *
 * Una por producto en el bucle serían cincuenta consultas para pintar una rejilla de cincuenta.
 */
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

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/**
 * Alfabeto sin caracteres ambiguos.
 *
 * Sin `I`, `L`, `O` ni `U`: los tres primeros se confunden con `1` y `0` en una etiqueta impresa y
 * dictada por teléfono, y el cuarto se evita porque genera palabras que nadie quiere en un código
 * de inventario. Es el alfabeto de Crockford, y existe exactamente por este problema.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const CODE_LENGTH = 12

/**
 * Un código identificativo de producto o de unidad.
 *
 * Doce caracteres del alfabeto son sesenta bits: la probabilidad de colisión sigue siendo
 * despreciable con miles de millones de filas. **Y la garantía no es ésta, es el índice único**: si
 * alguna vez colisionara, la inserción falla y la operación entera se revierte. Falla ruidosamente,
 * que es lo contrario de dos productos compartiendo etiqueta.
 */
function productCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("")
}

async function insertMeasurement(
  tx: Transaction,
  productId: string,
  input: MeasurementInput,
  actorId: string,
): Promise<string> {
  const measurementId = newId()

  await tx.insert(warehouseMeasurements).values({
    id: measurementId,
    productId,
    name: input.name.trim(),
    ...(input.kind === undefined ? {} : { kind: input.kind }),
    ...(input.priceDifference === undefined ? {} : { priceDifference: input.priceDifference }),
    ...(input.dimensions === undefined ? {} : { dimensions: input.dimensions }),
    ...(input.lengthUnit === undefined ? {} : { lengthUnit: input.lengthUnit }),
    ...(input.massUnit === undefined ? {} : { massUnit: input.massUnit }),
    clothing: input.clothing ?? null,
  })

  // La cantidad inicial **materializa unidades**: no es un número guardado, son filas. Una unidad
  // es un objeto físico, y sin fila no hay nada que etiquetar, mover ni reservar.
  const quantity = input.initialQuantity ?? 0
  if (quantity > 0) {
    const units = await tx
      .insert(warehouseStockUnits)
      .values(
        Array.from({ length: quantity }, () => ({
          id: newId(),
          measurementId,
          code: productCode(),
        })),
      )
      .returning({ id: warehouseStockUnits.id })

    // El alta también deja rastro. Sin el momento inicial, el historial de una unidad empieza en su
    // segundo estado y no se puede reconstruir de dónde salió.
    await recordEvents(
      tx,
      units.map((unit) => ({ unitId: unit.id, from: null, to: "available" as const })),
      "created",
      actorId,
    )
  }

  return measurementId
}

/**
 * Inserta un hijo con lo que hereda del padre.
 *
 * La herencia es **una copia en el momento de crearse**, no una referencia: la variante puede
 * divergir después, y eso es lo que la hace una variante y no una vista del padre.
 */
async function insertChild(
  tx: Transaction,
  parent: typeof warehouseProducts.$inferSelect,
  relation: ProductRelation,
  input: ChildInput,
  actorId: string,
): Promise<string> {
  const childId = newId()

  await tx.insert(warehouseProducts).values({
    id: childId,
    warehouseId: parent.warehouseId,
    parentId: parent.id,
    relationToParent: relation,
    name: input.name.trim(),
    description: input.description?.trim() ?? "",
    internalCode: input.internalCode?.trim() || null,
    code: productCode(),
    slug: await freeSlug(tx, input.name),
    ...(input.cost === undefined ? {} : { cost: input.cost }),
    ...(input.price === undefined ? {} : { price: input.price }),
    storageId: parent.storageId,
    categoryId: parent.categoryId,
    globalCategoryId: parent.globalCategoryId,
    responsibleId: parent.responsibleId,
  })

  for (const measurement of input.measurements ?? []) {
    await insertMeasurement(tx, childId, measurement, actorId)
  }

  return childId
}

/**
 * Expande el filtro de categoría a su subárbol.
 *
 * `query-and-pagination` lo exige: filtrar por «Iluminación» incluye lo clasificado en «LED» y en
 * «Paneles». La gramática genérica no puede hacerlo porque no sabe qué campos son jerárquicos; se
 * resuelve aquí, y el filtro se retira del conjunto genérico para que no se aplique dos veces.
 */
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

async function descendantIds(tx: Transaction, productId: string): Promise<string[]> {
  const result = await tx.execute(sql`
    with recursive descendientes as (
      select id from warehouse_products where id = ${productId}
      union all
      select p.id
      from warehouse_products p
      join descendientes d on p.parent_id = d.id
    )
    select id from descendientes
  `)

  return (result as unknown as { id: string }[]).map((row) => row.id)
}

async function measurementIds(tx: Transaction, productIds: readonly string[]): Promise<string[]> {
  if (productIds.length === 0) return []

  const rows = await tx
    .select({ id: warehouseMeasurements.id })
    .from(warehouseMeasurements)
    .where(
      and(
        inArray(warehouseMeasurements.productId, [...productIds]),
        isNull(warehouseMeasurements.deletedAt),
      ),
    )

  return rows.map((row) => row.id)
}

/** Las medidas de un producto, cada una con cuántas unidades tiene en cada estado. */
async function measurementsOf(
  tx: Transaction,
  productId: string,
  only?: readonly string[],
): Promise<MeasurementRecord[]> {
  const rows = await tx
    .select()
    .from(warehouseMeasurements)
    .where(
      and(
        eq(warehouseMeasurements.productId, productId),
        isNull(warehouseMeasurements.deletedAt),
        ...(only ? [inArray(warehouseMeasurements.id, [...only])] : []),
      ),
    )

  if (rows.length === 0) return []

  const counts = await tx
    .select({
      measurementId: warehouseStockUnits.measurementId,
      status: warehouseStockUnits.status,
      value: count(),
    })
    .from(warehouseStockUnits)
    .where(
      and(
        inArray(
          warehouseStockUnits.measurementId,
          rows.map((row) => row.id),
        ),
        isNull(warehouseStockUnits.deletedAt),
      ),
    )
    .groupBy(warehouseStockUnits.measurementId, warehouseStockUnits.status)

  const byMeasurement = new Map<string, Record<string, number>>()
  for (const row of counts) {
    const entry = byMeasurement.get(row.measurementId) ?? {}
    entry[row.status] = row.value
    byMeasurement.set(row.measurementId, entry)
  }

  return rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    name: row.name,
    kind: row.kind,
    priceDifference: row.priceDifference,
    dimensions: row.dimensions,
    lengthUnit: row.lengthUnit,
    massUnit: row.massUnit,
    clothing: row.clothing,
    units: byMeasurement.get(row.id) ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

async function getStructure(
  tx: Transaction,
  warehouseId: string,
  productId: string,
): Promise<ProductDetail> {
  const product = await loadProduct(tx, warehouseId, productId)

  const children = await tx
    .select()
    .from(warehouseProducts)
    .where(and(eq(warehouseProducts.parentId, productId), isNull(warehouseProducts.deletedAt)))

  const covers = await coversOf(tx, [productId, ...children.map((row) => row.id)])
  const child = (relation: ProductRelation) =>
    children
      .filter((row) => row.relationToParent === relation)
      .map((row) => withCover(toProductRecord(row), covers))

  return {
    ...withCover(toProductRecord(product), covers),
    measurements: await measurementsOf(tx, productId),
    variants: child("variant"),
    accessories: child("accessory"),
    images: await imagesOf(tx, productId),
  }
}

/** El identificador legible es único en toda la plataforma: aparece en la dirección de una tienda. */
async function freeSlug(tx: Transaction, name: string): Promise<string> {
  const base = slugify(name, "producto")

  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = slugCandidate(base, attempt)

    const [taken] = await tx
      .select({ id: warehouseProducts.id })
      .from(warehouseProducts)
      .where(and(eq(warehouseProducts.slug, candidate), isNull(warehouseProducts.deletedAt)))
      .limit(1)

    if (!taken) return candidate
  }

  throw new UnprocessableError("Demasiados productos con ese nombre")
}

async function assertSlugFree(tx: Transaction, slug: string): Promise<void> {
  const [taken] = await tx
    .select({ id: warehouseProducts.id })
    .from(warehouseProducts)
    .where(and(eq(warehouseProducts.slug, slug), isNull(warehouseProducts.deletedAt)))
    .limit(1)

  if (taken) throw new ConflictError("Ese identificador legible ya está ocupado")
}

async function loadProduct(tx: Transaction, warehouseId: string, productId: string) {
  const [row] = await tx
    .select()
    .from(warehouseProducts)
    .where(
      and(
        eq(warehouseProducts.id, productId),
        eq(warehouseProducts.warehouseId, warehouseId),
        isNull(warehouseProducts.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El producto no existe")
  return row
}

function toProductRecord(row: typeof warehouseProducts.$inferSelect): ProductRecord {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    parentId: row.parentId,
    relationToParent: row.relationToParent,
    name: row.name,
    description: row.description,
    internalCode: row.internalCode,
    code: row.code,
    cost: row.cost,
    price: row.price,
    usesPriceLists: row.usesPriceLists,
    availableForSale: row.availableForSale,
    availableForRent: row.availableForRent,
    storageId: row.storageId,
    categoryId: row.categoryId,
    globalCategoryId: row.globalCategoryId,
    responsibleId: row.responsibleId,
    slug: row.slug,
    isPublished: row.isPublished,
    isProvisional: row.isProvisional,
    // La rellena `withCover` cuando quien lee necesita enseñarla: la portada sale de otra tabla, y
    // traerla fila a fila serían tantas consultas como productos tenga la rejilla.
    coverUrl: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
