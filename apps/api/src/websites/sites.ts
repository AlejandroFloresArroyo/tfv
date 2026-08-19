/**
 * Sitios de una empresa.
 *
 * Ver `openspec/specs/websites/spec.md`. Rebanada 19.
 *
 * Un sitio es la tienda pública de una empresa: un nombre, una identidad visual, una **vertical**
 * que decide qué páginas se sirven, y una **fuente de catálogo** de la que sale lo que se vende.
 * Aquí está la mitad que exige sesión y permiso; la que atiende a quien no tiene cuenta vive en
 * `storefront.ts`, y las dos no se mezclan a propósito.
 *
 * ## El identificador legible no se acota por empresa
 *
 * Es **el subdominio**, y en un nombre de host no hay empresa que acote nada: dos sitios con el
 * mismo identificador serían dos tiendas peleándose por la misma dirección. Por eso la unicidad es
 * de plataforma —índice único sobre la tabla entera— y la comprobación de disponibilidad mira todos
 * los sitios, no los de quien pregunta.
 *
 * ## Al crear se añade sufijo; al cambiarlo se rechaza
 *
 * La misma regla que en almacenes y por lo mismo: al crear nadie eligió el identificador —sale del
 * nombre—, así que un sufijo es una comodidad; al cambiarlo alguien ha escrito uno concreto, y
 * darle otro en silencio es no hacer lo que pidió.
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
  type WebsiteVertical,
} from "@tfv/contracts"
import { storefrontAddress, verticalOf } from "@tfv/contracts/storefront"
import { type Transaction, withRequester } from "@tfv/db"
import {
  companies,
  companyServices,
  globalCategories,
  pixitStores,
  services,
  warehouses,
  websites,
} from "@tfv/db/schema"
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { env } from "../env.ts"
import {
  assertUsableImages,
  diffSingle,
  type ImageRef,
  imageRefs,
  releaseUploads,
  sweepObjects,
} from "../media/collections.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"

/** La clave del servicio en el catálogo. Es la que gobierna la habilitación. */
const SERVICE = "websites"

export interface WebsiteRecord {
  readonly id: string
  readonly companyId: string
  readonly name: string
  readonly description: string
  readonly slug: string
  readonly isPublished: boolean
  readonly categoryId: string | null
  /** La vertical, derivada de la clave estable de la categoría. Ver `computed-fields`. */
  readonly vertical: WebsiteVertical
  readonly warehouseId: string | null
  readonly pixitStoreId: string | null
  readonly logoUploadId: string | null
  readonly logoUrl: string | null
  readonly iconUploadId: string | null
  readonly iconUrl: string | null
  /** Dónde se sirve. Derivados del identificador legible, no almacenados. */
  readonly subdomain: string
  readonly address: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

export const websiteQuery: QuerySchema = {
  filters: {
    isPublished: { type: "boolean", label: "Publicación" },
  },
  searchable: ["name", "description", "slug"],
  sortable: ["name", "createdAt"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
}

const mapping = {
  fields: {
    isPublished: websites.isPublished,
    name: websites.name,
    createdAt: websites.createdAt,
  },
  searchable: [websites.name, websites.description, websites.slug],
  tiebreak: websites.id,
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function listWebsites(
  actor: Actor,
  companyId: string,
  query: ParsedQuery,
): Promise<Page<WebsiteRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)

    const where = and(
      eq(websites.companyId, companyId),
      isNull(websites.deletedAt),
      ...collectionConditions(query, mapping),
    )

    const [total] = await tx.select({ value: count() }).from(websites).where(where)

    const rows = await tx
      .select()
      .from(websites)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    return buildPage(await decorate(tx, rows), total?.value ?? 0, page, limit)
  })
}

export async function getWebsite(
  actor: Actor,
  companyId: string,
  websiteId: string,
): Promise<WebsiteRecord> {
  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    const row = await loadWebsite(tx, companyId, websiteId)
    const [record] = await decorate(tx, [row])
    if (!record) throw new Error("la decoración del sitio no devolvió fila")
    return record
  })
}

/**
 * Si un identificador legible está libre.
 *
 * Devuelve además el que se usaría, ya normalizado: quien escribe «Renta del Sur» en el campo
 * quiere saber que va a quedarse con `renta-del-sur`, y no enterarse al guardar.
 */
export async function slugAvailability(
  actor: Actor,
  companyId: string,
  raw: string,
): Promise<{ readonly slug: string; readonly available: boolean }> {
  const slug = slugify(raw, "sitio")

  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    return { slug, available: !(await slugTaken(tx, slug)) }
  })
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export interface CreateWebsiteInput {
  readonly name: string
  readonly description?: string | undefined
  readonly categoryId?: string | null | undefined
  readonly warehouseId?: string | null | undefined
  readonly pixitStoreId?: string | null | undefined
  readonly logoUploadId?: string | null | undefined
  readonly iconUploadId?: string | null | undefined
  readonly isPublished?: boolean | undefined
}

export async function createWebsite(
  actor: Actor,
  companyId: string,
  input: CreateWebsiteInput,
): Promise<WebsiteRecord> {
  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    await assertServiceEnabled(tx, companyId)
    await assertSources(tx, companyId, input.warehouseId ?? null, input.pixitStoreId ?? null)

    const images = [input.logoUploadId ?? null, input.iconUploadId ?? null].filter(
      (id): id is string => id !== null,
    )
    if (images.length > 0) await assertUsableImages(tx, companyId, images)

    const [created] = await tx
      .insert(websites)
      .values({
        id: newId(),
        companyId,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        slug: await freeSlug(tx, input.name),
        categoryId: input.categoryId ?? null,
        warehouseId: input.warehouseId ?? null,
        pixitStoreId: input.pixitStoreId ?? null,
        logoUploadId: input.logoUploadId ?? null,
        iconUploadId: input.iconUploadId ?? null,
        ...(input.isPublished === undefined ? {} : { isPublished: input.isPublished }),
      })
      .returning()

    if (!created) throw new Error("la inserción del sitio no devolvió fila")

    const [record] = await decorate(tx, [created])
    if (!record) throw new Error("la decoración del sitio no devolvió fila")
    return record
  })
}

export interface UpdateWebsiteInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
  readonly slug?: string | undefined
  readonly categoryId?: string | null | undefined
  readonly warehouseId?: string | null | undefined
  readonly pixitStoreId?: string | null | undefined
  readonly logoUploadId?: string | null | undefined
  readonly iconUploadId?: string | null | undefined
  /** Publicar y despublicar. Despublicar retira la tienda de su subdominio, sin borrar nada. */
  readonly isPublished?: boolean | undefined
}

export async function updateWebsite(
  actor: Actor,
  companyId: string,
  websiteId: string,
  input: UpdateWebsiteInput,
): Promise<WebsiteRecord> {
  const { record, released } = await withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    const current = await loadWebsite(tx, companyId, websiteId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description.trim()
    if (input.isPublished !== undefined) patch.isPublished = input.isPublished
    if (input.categoryId !== undefined) patch.categoryId = input.categoryId

    if (input.warehouseId !== undefined || input.pixitStoreId !== undefined) {
      const warehouseId = input.warehouseId === undefined ? current.warehouseId : input.warehouseId
      const pixitStoreId =
        input.pixitStoreId === undefined ? current.pixitStoreId : input.pixitStoreId

      await assertSources(tx, companyId, warehouseId, pixitStoreId)
      if (input.warehouseId !== undefined) patch.warehouseId = input.warehouseId
      if (input.pixitStoreId !== undefined) patch.pixitStoreId = input.pixitStoreId
    }

    if (input.slug !== undefined) {
      const slug = slugify(input.slug, "sitio")
      if (slug !== current.slug && (await slugTaken(tx, slug))) {
        throw new ConflictError("Ese identificador ya lo usa otro sitio")
      }
      patch.slug = slug
    }

    const logo =
      input.logoUploadId === undefined
        ? undefined
        : diffSingle(current.logoUploadId, input.logoUploadId)
    const icon =
      input.iconUploadId === undefined
        ? undefined
        : diffSingle(current.iconUploadId, input.iconUploadId)

    if (logo !== undefined) {
      await assertUsableImages(tx, companyId, logo.added)
      patch.logoUploadId = input.logoUploadId
    }
    if (icon !== undefined) {
      await assertUsableImages(tx, companyId, icon.added)
      patch.iconUploadId = input.iconUploadId
    }

    const row =
      Object.keys(patch).length === 0
        ? current
        : ((
            await tx
              .update(websites)
              .set({ ...patch, updatedAt: new Date() })
              .where(eq(websites.id, websiteId))
              .returning()
          )[0] ?? current)

    const [record] = await decorate(tx, [row])
    if (!record) throw new Error("la decoración del sitio no devolvió fila")

    return {
      record,
      released: await releaseUploads(tx, [...(logo?.removed ?? []), ...(icon?.removed ?? [])]),
    }
  })

  await sweepObjects(released)
  return record
}

/**
 * Baja lógica del sitio.
 *
 * **La fuente no se toca**: el almacén y su catálogo siguen intactos, que es lo que la spec exige.
 * Y el identificador legible **queda libre por construcción**, porque el índice único sólo mira las
 * filas vivas: no hace falta vaciar la columna, y vaciarla perdería el rastro de qué dirección
 * servía este sitio.
 *
 * Las personalizaciones cuelgan del sitio con borrado en cascada en el motor, y la baja lógica no
 * las alcanza — quedan huérfanas de un sitio invisible, que es lo mismo que estar borradas para
 * todo lo que las lee por su sitio.
 */
export async function deleteWebsite(
  actor: Actor,
  companyId: string,
  websiteId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    await loadWebsite(tx, companyId, websiteId)

    await tx
      .update(websites)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(websites.id, websiteId))
  })
}

// ─── Ayudas ──────────────────────────────────────────────────────────────────

async function assertCompany(tx: Transaction, companyId: string): Promise<void> {
  const [company] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
    .limit(1)

  if (!company) throw new NotFoundError("La empresa no existe")
}

/**
 * La empresa tiene contratado el servicio de sitios.
 *
 * Se comprueba al crear y no al leer, igual que en almacenes: retirar un servicio **conserva sus
 * datos**. Lo que no conserva es que la tienda se sirva — eso lo decide la tercera compuerta de la
 * resolución pública, que sí mira en cada petición.
 */
async function assertServiceEnabled(tx: Transaction, companyId: string): Promise<void> {
  const [enabled] = await tx
    .select({ id: companyServices.id })
    .from(companyServices)
    .innerJoin(services, eq(services.id, companyServices.serviceId))
    .where(and(eq(companyServices.companyId, companyId), eq(services.keycode, SERVICE)))
    .limit(1)

  if (!enabled) {
    throw new UnprocessableError("Esta empresa no tiene contratado el servicio de sitios")
  }
}

/**
 * La fuente del catálogo es de esta empresa.
 *
 * Una fuente de otra empresa responde **que no existe**, no que no se puede: distinguirlo
 * confirmaría que existe, que es justo lo que un identificador ajeno intenta averiguar. Es la misma
 * respuesta que da `assertUsableImages` con un archivo de otro arrendatario.
 *
 * La comprobación no se puede dejar a la clave foránea: apunta a la tabla, no a la empresa, y
 * aceptaría alegremente el almacén del vecino.
 */
async function assertSources(
  tx: Transaction,
  companyId: string,
  warehouseId: string | null,
  pixitStoreId: string | null,
): Promise<void> {
  if (warehouseId !== null) {
    const [row] = await tx
      .select({ id: warehouses.id })
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
  }

  if (pixitStoreId !== null) {
    const [row] = await tx
      .select({ id: pixitStores.id })
      .from(pixitStores)
      .where(
        and(
          eq(pixitStores.id, pixitStoreId),
          eq(pixitStores.companyId, companyId),
          isNull(pixitStores.deletedAt),
        ),
      )
      .limit(1)

    if (!row) throw new NotFoundError("La tienda no existe")
  }
}

export async function loadWebsite(tx: Transaction, companyId: string, websiteId: string) {
  const [row] = await tx
    .select()
    .from(websites)
    .where(
      and(
        eq(websites.id, websiteId),
        eq(websites.companyId, companyId),
        isNull(websites.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El sitio no existe")
  return row
}

/**
 * El identificador está ocupado.
 *
 * **Lo pregunta el motor y no esta consulta**, y ésa es toda la diferencia. El identificador es
 * único en toda la plataforma —es el subdominio— pero una consulta ordinaria corre con las
 * políticas puestas y sólo ve los sitios de quien pregunta: uno ocupado por otra empresa se vería
 * libre, se insertaría, y el índice único lo rechazaría con un `500` que no dice nada en vez de con
 * el `409` que la spec pide.
 *
 * No es hipotético: se comprobó contra la base, y el mismo hueco alcanza hoy a los almacenes y a
 * los productos (`HALLAZGOS.md` H-90). `app.website_slug_taken` es `security definer` justo por
 * esto, y no revela más que la ocupación de un subdominio — que se averigua abriendo la dirección.
 */
async function slugTaken(tx: Transaction, slug: string): Promise<boolean> {
  const rows = await tx.execute<{ taken: boolean }>(
    sql`select app.website_slug_taken(${slug}) as taken`,
  )

  return rows[0]?.taken === true
}

async function freeSlug(tx: Transaction, name: string): Promise<string> {
  const base = slugify(name, "sitio")

  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = slugCandidate(base, attempt)
    if (!(await slugTaken(tx, candidate))) return candidate
  }

  throw new ConflictError("No se pudo derivar un identificador libre para este sitio")
}

/**
 * Los campos calculados del sitio: su vertical y su dirección.
 *
 * La vertical sale de la **clave estable** de la categoría, no de su nombre: renombrar «Tienda de
 * almacén» a «Renta de equipo» no puede cambiar qué páginas sirve el sitio.
 */
async function decorate(
  tx: Transaction,
  rows: readonly (typeof websites.$inferSelect)[],
): Promise<WebsiteRecord[]> {
  if (rows.length === 0) return []

  const categoryIds = [
    ...new Set(rows.map((row) => row.categoryId).filter((id): id is string => id !== null)),
  ]

  const keynames = new Map<string, string | null>()
  if (categoryIds.length > 0) {
    const categories = await tx
      .select({ id: globalCategories.id, keyname: globalCategories.keyname })
      .from(globalCategories)
      .where(inArray(globalCategories.id, categoryIds))

    for (const category of categories) keynames.set(category.id, category.keyname)
  }

  const images = await imageRefs(tx, [
    ...rows.map((row) => row.logoUploadId),
    ...rows.map((row) => row.iconUploadId),
  ])

  return rows.map((row) => toRecord(row, keynames, images))
}

function toRecord(
  row: typeof websites.$inferSelect,
  keynames: ReadonlyMap<string, string | null>,
  images: ReadonlyMap<string, ImageRef>,
): WebsiteRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: row.description,
    slug: row.slug,
    isPublished: row.isPublished,
    categoryId: row.categoryId,
    vertical: verticalOf(row.categoryId === null ? null : keynames.get(row.categoryId)),
    warehouseId: row.warehouseId,
    pixitStoreId: row.pixitStoreId,
    logoUploadId: row.logoUploadId,
    logoUrl: row.logoUploadId === null ? null : (images.get(row.logoUploadId)?.url ?? null),
    iconUploadId: row.iconUploadId,
    iconUrl: row.iconUploadId === null ? null : (images.get(row.iconUploadId)?.url ?? null),
    subdomain: row.slug,
    address: storefrontAddress(row.slug, env.SITES_DOMAIN),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
