/**
 * Almacenes.
 *
 * Ver `openspec/specs/warehouses-and-storage/spec.md`. Rebanada 12.
 *
 * Un almacén es el establecimiento desde el que una empresa renta y vende equipo, y es **la raíz de
 * todo el servicio**: ubicaciones, categorías, productos, listas de precios, cotizaciones y pedidos
 * cuelgan de él. Una empresa puede tener varios.
 *
 * ## La habilitación se comprueba, no se supone
 *
 * Crear un almacén exige que la empresa tenga contratado el servicio. No es lo mismo que el
 * permiso: el permiso dice qué puede hacer una persona dentro de la empresa, y la habilitación dice
 * qué ha contratado la empresa. Alguien con todos los permisos de una empresa sin almacenes no debe
 * poder crear uno — y sin esta comprobación podría, porque la compuerta sólo mira permisos.
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
import { isOrderClosed, ORDER_STATUSES } from "@tfv/contracts/order-status"
import { isClosed, QUOTE_STATUSES } from "@tfv/contracts/quote-status"
import { type Transaction, withRequester } from "@tfv/db"
import {
  companies,
  companyServices,
  services,
  warehouseCategories,
  warehouseOrders,
  warehousePriceLists,
  warehouseProducts,
  warehouseQuotes,
  warehouseStorages,
  warehouses,
} from "@tfv/db/schema"
import { and, count, eq, inArray, isNull } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"

/** La clave del servicio en el catálogo. Es la que gobierna la habilitación. */
const SERVICE = "warehouses"

export interface WarehouseRecord {
  readonly id: string
  readonly companyId: string
  readonly name: string
  readonly description: string
  readonly slug: string | null
  readonly isPublished: boolean
  readonly priority: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Qué se puede pedir de la colección de almacenes.
 *
 * **El orden por defecto son tres criterios y no uno.** La prioridad la fija quien administra, y
 * empata en cuanto dos almacenes valen lo mismo —que es lo normal, porque casi nadie la toca—; la
 * fecha desempata poniendo lo nuevo arriba, y el nombre desempata a los creados el mismo día. Sin
 * los tres, el listado cambia de orden entre visitas sin que nadie haya tocado nada.
 */
export const warehouseQuery: QuerySchema = {
  filters: {
    isPublished: { type: "boolean", label: "Publicación" },
  },
  searchable: ["name", "description"],
  sortable: ["name", "priority", "createdAt"],
  defaultSort: [
    { field: "priority", direction: "desc" },
    { field: "createdAt", direction: "desc" },
    { field: "name", direction: "asc" },
  ],
}

const mapping = {
  fields: {
    isPublished: warehouses.isPublished,
    name: warehouses.name,
    priority: warehouses.priority,
    createdAt: warehouses.createdAt,
  },
  searchable: [warehouses.name, warehouses.description],
  tiebreak: warehouses.id,
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function listWarehouses(
  actor: Actor,
  companyId: string,
  query: ParsedQuery,
): Promise<Page<WarehouseRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)

    const where = and(
      eq(warehouses.companyId, companyId),
      isNull(warehouses.deletedAt),
      ...collectionConditions(query, mapping),
    )

    const [total] = await tx.select({ value: count() }).from(warehouses).where(where)

    const rows = await tx
      .select()
      .from(warehouses)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    return buildPage(rows.map(toRecord), total?.value ?? 0, page, limit)
  })
}

export async function getWarehouse(
  actor: Actor,
  companyId: string,
  warehouseId: string,
): Promise<WarehouseRecord> {
  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    return toRecord(await loadWarehouse(tx, companyId, warehouseId))
  })
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export interface CreateWarehouseInput {
  readonly name: string
  readonly description?: string | undefined
  readonly priority?: string | undefined
  readonly isPublished?: boolean | undefined
}

export async function createWarehouse(
  actor: Actor,
  companyId: string,
  input: CreateWarehouseInput,
): Promise<WarehouseRecord> {
  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    await assertServiceEnabled(tx, companyId)

    const [created] = await tx
      .insert(warehouses)
      .values({
        id: newId(),
        companyId,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        slug: await freeSlug(tx, input.name),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.isPublished === undefined ? {} : { isPublished: input.isPublished }),
      })
      .returning()

    if (!created) throw new Error("la inserción del almacén no devolvió fila")
    return toRecord(created)
  })
}

export interface UpdateWarehouseInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
  readonly priority?: string | undefined
  readonly isPublished?: boolean | undefined
  /**
   * El identificador legible, cuando se cambia a mano.
   *
   * Se rechaza si ya está ocupado en lugar de añadirle un sufijo: al crear, el sufijo es una
   * comodidad porque nadie eligió el identificador; al cambiarlo, alguien ha escrito uno concreto y
   * darle otro distinto en silencio es no hacer lo que pidió.
   */
  readonly slug?: string | undefined
}

export async function updateWarehouse(
  actor: Actor,
  companyId: string,
  warehouseId: string,
  input: UpdateWarehouseInput,
): Promise<WarehouseRecord> {
  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    const current = await loadWarehouse(tx, companyId, warehouseId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description.trim()
    if (input.priority !== undefined) patch.priority = input.priority
    if (input.isPublished !== undefined) patch.isPublished = input.isPublished

    if (input.slug !== undefined) {
      const slug = slugify(input.slug, "almacen")
      if (slug !== current.slug) await assertSlugFree(tx, slug)
      patch.slug = slug
    }

    if (Object.keys(patch).length === 0) return toRecord(current)

    const [updated] = await tx
      .update(warehouses)
      .set(patch)
      .where(eq(warehouses.id, warehouseId))
      .returning()

    if (!updated) throw new NotFoundError("El almacén no existe")
    return toRecord(updated)
  })
}

/**
 * Los estados que cuentan como trabajo en curso.
 *
 * Derivados, no copiados: lo que no está cerrado está abierto. Una lista escrita a mano aquí se
 * quedaría vieja el día que se añada un estado, y lo haría en silencio — de menos, dejando dar de
 * baja un almacén con equipo fuera.
 */
const OPEN_QUOTES = QUOTE_STATUSES.filter((status) => !isClosed(status))
const OPEN_ORDERS = ORDER_STATUSES.filter((status) => !isOrderClosed(status))

/** Lo que se lleva por delante dar de baja un almacén, para poder enumerarlo antes. */
export interface DeletionScope {
  readonly storages: number
  readonly categories: number
  readonly products: number
  readonly priceLists: number
  /** Todas, para enumerar lo que deja de estar accesible. */
  readonly quotes: number
  readonly orders: number
  /** Las que además **impiden** la baja, para poder decirlo antes de que nadie confirme. */
  readonly openQuotes: number
  readonly openOrders: number
}

/**
 * Cotizaciones y pedidos del almacén, en total y en curso.
 *
 * Los cuenta la misma función que enumera y la que decide si se puede dar de baja: si fueran dos
 * consultas parecidas, el día que una cambie el diálogo enseñaría un número y la baja aplicaría
 * otro.
 */
async function commerceCounts(
  tx: Transaction,
  warehouseId: string,
): Promise<{ quotes: number; orders: number; openQuotes: number; openOrders: number }> {
  const [quotes] = await tx
    .select({ value: count() })
    .from(warehouseQuotes)
    .where(and(eq(warehouseQuotes.warehouseId, warehouseId), isNull(warehouseQuotes.deletedAt)))

  const [openQuotes] = await tx
    .select({ value: count() })
    .from(warehouseQuotes)
    .where(
      and(
        eq(warehouseQuotes.warehouseId, warehouseId),
        isNull(warehouseQuotes.deletedAt),
        inArray(warehouseQuotes.status, OPEN_QUOTES),
      ),
    )

  const [orders] = await tx
    .select({ value: count() })
    .from(warehouseOrders)
    .where(and(eq(warehouseOrders.warehouseId, warehouseId), isNull(warehouseOrders.deletedAt)))

  const [openOrders] = await tx
    .select({ value: count() })
    .from(warehouseOrders)
    .where(
      and(
        eq(warehouseOrders.warehouseId, warehouseId),
        isNull(warehouseOrders.deletedAt),
        inArray(warehouseOrders.status, OPEN_ORDERS),
      ),
    )

  return {
    quotes: quotes?.value ?? 0,
    orders: orders?.value ?? 0,
    openQuotes: openQuotes?.value ?? 0,
    openOrders: openOrders?.value ?? 0,
  }
}

export async function deletionScope(
  actor: Actor,
  companyId: string,
  warehouseId: string,
): Promise<DeletionScope> {
  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    await loadWarehouse(tx, companyId, warehouseId)

    const [storages] = await tx
      .select({ value: count() })
      .from(warehouseStorages)
      .where(eq(warehouseStorages.warehouseId, warehouseId))

    const [categories] = await tx
      .select({ value: count() })
      .from(warehouseCategories)
      .where(eq(warehouseCategories.warehouseId, warehouseId))

    const [products] = await tx
      .select({ value: count() })
      .from(warehouseProducts)
      .where(
        and(
          eq(warehouseProducts.warehouseId, warehouseId),
          isNull(warehouseProducts.deletedAt),
          // Las variantes y los accesorios se cuentan con su padre: enumerar «catorce productos»
          // cuando son cuatro con tres variantes cada uno asusta sin informar.
          isNull(warehouseProducts.parentId),
        ),
      )

    const [priceLists] = await tx
      .select({ value: count() })
      .from(warehousePriceLists)
      .where(
        and(
          eq(warehousePriceLists.warehouseId, warehouseId),
          isNull(warehousePriceLists.deletedAt),
        ),
      )

    return {
      ...(await commerceCounts(tx, warehouseId)),
      storages: storages?.value ?? 0,
      categories: categories?.value ?? 0,
      products: products?.value ?? 0,
      priceLists: priceLists?.value ?? 0,
    }
  })
}

/**
 * Da de baja un almacén.
 *
 * **Borrado lógico**, y sin cascada escrita a mano. El contenido deja de ser accesible porque toda
 * lectura parte del almacén y el almacén ya no está: no hace falta recorrer nada. Es exactamente lo
 * que la implementación anterior hacía mal —veinte funciones de borrado, tres de ellas borrando de
 * la tabla de empresas usando el identificador de otra entidad (`DEFECTS.md` C-08)—.
 *
 * **Falta impedir la baja con trabajo en curso.** La spec lo exige, y necesita las cotizaciones
 * (14) y los pedidos (15): hoy no hay nada que consultar, y fingir la comprobación sería peor que
 * declararla pendiente.
 */
export async function deleteWarehouse(
  actor: Actor,
  companyId: string,
  warehouseId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    await loadWarehouse(tx, companyId, warehouseId)

    /**
     * La baja no se lleva por delante trabajo en curso.
     *
     * Sin esta comprobación se podía dar de baja un almacén con una renta y el equipo en la calle:
     * el documento que dice quién lo tiene deja de ser accesible, y con él la única forma de
     * reclamarlo. La rebanada 12 la dejó anotada esperando a que existieran cotizaciones y pedidos;
     * ya existen.
     */
    const { openQuotes, openOrders } = await commerceCounts(tx, warehouseId)

    if (openQuotes > 0 || openOrders > 0) {
      const pending = [
        openQuotes > 0 ? `${openQuotes} cotización${openQuotes === 1 ? "" : "es"} en curso` : null,
        openOrders > 0 ? `${openOrders} pedido${openOrders === 1 ? "" : "s"} en curso` : null,
      ].filter((part) => part !== null)

      throw new ConflictError(
        `Este almacén tiene ${pending.join(" y ")}. Ciérralos o cancélalos antes de darlo de baja.`,
      )
    }

    await tx.update(warehouses).set({ deletedAt: new Date() }).where(eq(warehouses.id, warehouseId))
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/**
 * La empresa tiene contratado el servicio de almacenes.
 *
 * Se comprueba al crear y no al leer: retirar un servicio **conserva sus datos**, así que un
 * almacén existente sigue siendo consultable aunque la empresa deje de tener el servicio. Lo que no
 * puede es crecer.
 */
async function assertServiceEnabled(tx: Transaction, companyId: string): Promise<void> {
  const [enabled] = await tx
    .select({ id: companyServices.id })
    .from(companyServices)
    .innerJoin(services, eq(services.id, companyServices.serviceId))
    .where(and(eq(companyServices.companyId, companyId), eq(services.keycode, SERVICE)))
    .limit(1)

  if (!enabled) {
    throw new UnprocessableError("Esta empresa no tiene contratado el servicio de almacenes")
  }
}

/**
 * El identificador legible es único **en toda la plataforma**, no por empresa.
 *
 * Es lo que aparece en la dirección de una tienda pública, y ahí no hay empresa que lo acote.
 */
async function freeSlug(tx: Transaction, name: string): Promise<string> {
  const base = slugify(name, "almacen")

  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = slugCandidate(base, attempt)

    const [taken] = await tx
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(eq(warehouses.slug, candidate), isNull(warehouses.deletedAt)))
      .limit(1)

    if (!taken) return candidate
  }

  throw new UnprocessableError("Demasiados almacenes con ese nombre")
}

async function assertSlugFree(tx: Transaction, slug: string): Promise<void> {
  const [taken] = await tx
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.slug, slug), isNull(warehouses.deletedAt)))
    .limit(1)

  if (taken) throw new ConflictError("Ese identificador legible ya está ocupado")
}

/**
 * La empresa está al alcance del solicitante.
 *
 * Fuera del alcance, el motor no devuelve la fila y esto responde `404`. No `403`: decir «existe
 * pero no puedes» confirma que existe, y eso ya es información sobre otra empresa.
 */
async function assertCompany(tx: Transaction, companyId: string): Promise<void> {
  const [company] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
    .limit(1)

  if (!company) throw new NotFoundError("La empresa no existe")
}

export async function loadWarehouse(tx: Transaction, companyId: string, warehouseId: string) {
  const [row] = await tx
    .select()
    .from(warehouses)
    .where(
      and(
        eq(warehouses.id, warehouseId),
        eq(warehouses.companyId, companyId),
        isNull(warehouses.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El almacén no existe")
  return row
}

function toRecord(row: typeof warehouses.$inferSelect): WarehouseRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: row.description,
    slug: row.slug,
    isPublished: row.isPublished,
    priority: row.priority,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
