/**
 * Producciones.
 *
 * Ver `openspec/specs/production-management/spec.md`. Rebanada 20, y las primeras del servicio de
 * producciones.
 *
 * Una producción es el proyecto audiovisual, y es **la raíz de todo el servicio**: guion,
 * capítulos, escenas, personajes, sets, videos, jornadas, continuidad, inventario, planes de
 * trabajo, presupuesto y compras a almacenes cuelgan de ella. Una empresa puede tener varias.
 *
 * ## La habilitación no se comprueba aquí, y es correcto
 *
 * «Crear una producción SHALL exigir que la empresa tenga habilitado el servicio», dice la spec, y
 * se cumple **sin una línea en este módulo**: la compuerta vive en el guardián y deriva el servicio
 * del primer nivel de la clave de permiso —`productions.productions.create` → `productions`—, así
 * que la cubre igual que a las otras veinte rutas del servicio. Ver `billing/entitlements.ts`.
 *
 * Repetirla aquí no añadiría una segunda capa: añadiría una comprobación **inalcanzable**, porque
 * el guardián responde `403 service_not_enabled` antes de que el manejador exista. Y una
 * comprobación que nunca corre es peor que ninguna, porque se lee como si protegiera.
 *
 * ## La baja no borra nada de nadie
 *
 * `DEFECTS.md` C-08: la implementación anterior tenía veinte funciones de borrado escritas a mano y
 * **tres de ellas borraban de la tabla de empresas** usando el identificador de otra entidad. Dar
 * de baja una producción se llevaba por delante la empresa. Aquí la baja es lógica y toca una sola
 * fila: el contenido deja de ser accesible porque toda lectura parte de la producción, y la
 * producción ya no está. No hay cascada que escribir, así que no hay cascada que equivocar.
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
import { type Transaction, withRequester } from "@tfv/db"
import {
  companies,
  productionChapters,
  productionCharacters,
  productionItems,
  productionPurchaseOrders,
  productionRecordings,
  productionScenes,
  productionScripts,
  productionSets,
  productions,
  productionVideos,
  productionWorkflows,
  warehouseOrders,
} from "@tfv/db/schema"
import { and, count, eq, isNull } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import type { Actor } from "../companies/companies.ts"
import {
  assertUsableImages,
  diffSingle,
  type ImageRef,
  imageRefs,
  releaseUploads,
  sweepObjects,
} from "../media/collections.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"

export interface ProductionRecord {
  readonly id: string
  readonly companyId: string
  readonly name: string
  readonly description: string
  readonly slug: string | null
  readonly isPublished: boolean
  readonly startsOn: Date | null
  readonly endsOn: Date | null
  readonly imageUploadId: string | null
  /** La dirección de la imagen, y su derivado de celda. Nulas cuando no hay imagen. */
  readonly imageUrl: string | null
  readonly imageThumbnailUrl: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Qué se puede pedir de la colección de producciones.
 *
 * Los filtros son los de la spec —«filtros por fechas y estado de publicación»—, y las fechas
 * admiten intervalo porque la pregunta real de una productora es «qué se rueda este trimestre», no
 * «qué empieza exactamente el día 4».
 *
 * **El orden por defecto es la fecha de alta y no la de rodaje**, aunque la segunda parezca más
 * natural. Una producción se registra mucho antes de tener fechas, así que ordenar por inicio
 * pondría a la cabeza —o a la cola, según el motor coloque los nulos— justo las que todavía no se
 * ruedan. Quien quiera el calendario lo pide, y para eso `startsOn` es ordenable.
 */
export const productionQuery: QuerySchema = {
  filters: {
    isPublished: { type: "boolean", label: "Publicación" },
    startsOn: { type: "date", range: true, label: "Inicio" },
    endsOn: { type: "date", range: true, label: "Fin" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["name", "description"],
  sortable: ["name", "startsOn", "endsOn", "createdAt"],
  defaultSort: [
    { field: "createdAt", direction: "desc" },
    { field: "name", direction: "asc" },
  ],
}

const mapping = {
  fields: {
    isPublished: productions.isPublished,
    name: productions.name,
    startsOn: productions.startsOn,
    endsOn: productions.endsOn,
    createdAt: productions.createdAt,
  },
  searchable: [productions.name, productions.description],
  tiebreak: productions.id,
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function listProductions(
  actor: Actor,
  companyId: string,
  query: ParsedQuery,
): Promise<Page<ProductionRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)

    const where = and(
      eq(productions.companyId, companyId),
      isNull(productions.deletedAt),
      ...collectionConditions(query, mapping),
    )

    const [total] = await tx.select({ value: count() }).from(productions).where(where)

    const rows = await tx
      .select()
      .from(productions)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    const images = await imageRefs(
      tx,
      rows.map((row) => row.imageUploadId),
    )

    return buildPage(
      rows.map((row) => toRecord(row, images)),
      total?.value ?? 0,
      page,
      limit,
    )
  })
}

export async function getProduction(
  actor: Actor,
  companyId: string,
  productionId: string,
): Promise<ProductionRecord> {
  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    const row = await loadProduction(tx, companyId, productionId)
    return toRecord(row, await imageRefs(tx, [row.imageUploadId]))
  })
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export interface CreateProductionInput {
  readonly name: string
  readonly description?: string | undefined
  readonly startsOn?: string | null | undefined
  readonly endsOn?: string | null | undefined
  readonly isPublished?: boolean | undefined
  readonly imageUploadId?: string | null | undefined
}

export async function createProduction(
  actor: Actor,
  companyId: string,
  input: CreateProductionInput,
): Promise<ProductionRecord> {
  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)

    const startsOn = toDate(input.startsOn)
    const endsOn = toDate(input.endsOn)
    assertOrdered(startsOn, endsOn)

    const image = input.imageUploadId ?? null
    if (image !== null) await assertUsableImages(tx, companyId, [image])

    const [created] = await tx
      .insert(productions)
      .values({
        id: newId(),
        companyId,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        // Siempre lo tiene, se publique o no: la restricción del motor exige identificador legible
        // para publicar, y derivarlo sólo al marcar la casilla dejaría el alta de una producción
        // publicada dependiendo del orden en que se escriban dos columnas.
        slug: await freeSlug(tx, input.name),
        imageUploadId: image,
        startsOn,
        endsOn,
        ...(input.isPublished === undefined ? {} : { isPublished: input.isPublished }),
      })
      .returning()

    if (!created) throw new Error("la inserción de la producción no devolvió fila")
    return toRecord(created, await imageRefs(tx, [created.imageUploadId]))
  })
}

export interface UpdateProductionInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
  /** `null` retira la fecha; omitirla la deja como está. */
  readonly startsOn?: string | null | undefined
  readonly endsOn?: string | null | undefined
  readonly isPublished?: boolean | undefined
  /**
   * El identificador legible, cuando se cambia a mano.
   *
   * Se rechaza si ya está ocupado en lugar de añadirle un sufijo: al crear, el sufijo es una
   * comodidad porque nadie eligió el identificador; al cambiarlo, alguien ha escrito uno concreto y
   * darle otro distinto en silencio es no hacer lo que pidió.
   */
  readonly slug?: string | undefined
  /** `null` la retira, que es distinto de omitirla —eso la deja como está—. */
  readonly imageUploadId?: string | null | undefined
}

export async function updateProduction(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: UpdateProductionInput,
): Promise<ProductionRecord> {
  const { record, released } = await withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    const current = await loadProduction(tx, companyId, productionId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description.trim()
    if (input.isPublished !== undefined) patch.isPublished = input.isPublished

    // Las dos fechas se comparan **después** de aplicar el parche, no contra las que llegaron:
    // mover sólo el fin tiene que comprobarse contra el inicio guardado, o corregir una fecha de
    // una en una sería imposible sin reenviar las dos.
    const startsOn = input.startsOn === undefined ? current.startsOn : toDate(input.startsOn)
    const endsOn = input.endsOn === undefined ? current.endsOn : toDate(input.endsOn)
    assertOrdered(startsOn, endsOn)
    if (input.startsOn !== undefined) patch.startsOn = startsOn
    if (input.endsOn !== undefined) patch.endsOn = endsOn

    if (input.slug !== undefined) {
      const slug = slugify(input.slug, "produccion")
      if (slug !== current.slug) await assertSlugFree(tx, slug)
      patch.slug = slug
    }

    // La imagen se resuelve con el mismo diferencial que una colección de una sola foto: asignar la
    // que ya estaba no retira nada, y quitarla sin poner otra sí.
    const image =
      input.imageUploadId === undefined
        ? undefined
        : diffSingle(current.imageUploadId, input.imageUploadId)

    if (image !== undefined) {
      await assertUsableImages(tx, companyId, image.added)
      patch.imageUploadId = input.imageUploadId
    }

    if (Object.keys(patch).length === 0) {
      return {
        record: toRecord(current, await imageRefs(tx, [current.imageUploadId])),
        released: undefined,
      }
    }

    const [updated] = await tx
      .update(productions)
      .set(patch)
      .where(eq(productions.id, productionId))
      .returning()

    if (!updated) throw new NotFoundError("La producción no existe")

    return {
      record: toRecord(updated, await imageRefs(tx, [updated.imageUploadId])),
      // Después de haber escrito la columna: la comprobación de referencias mira el estado de esta
      // transacción, y hecha antes diría que la imagen anterior sigue en uso.
      released: image === undefined ? undefined : await releaseUploads(tx, image.removed),
    }
  })

  if (released !== undefined) await sweepObjects(released)
  return record
}

// ─── Baja ────────────────────────────────────────────────────────────────────

/**
 * Lo que se lleva por delante dar de baja una producción, para poder enumerarlo antes.
 *
 * La spec lo exige —«SHALL enumerar previamente el alcance»— y la producción es **la mayor cascada
 * del sistema**: su propia spec la describe así. Enumerar «se perderá el contenido» sin decir cuál
 * no es una advertencia, es una fórmula.
 */
export interface ProductionScope {
  readonly scripts: number
  readonly chapters: number
  readonly scenes: number
  readonly characters: number
  readonly sets: number
  readonly videos: number
  readonly items: number
  readonly recordings: number
  readonly workflows: number
  /** Todas, para enumerar lo que deja de estar accesible. */
  readonly purchaseOrders: number
  /** Las que además **impiden** la baja, para poder decirlo antes de que nadie confirme. */
  readonly openPurchaseOrders: number
  readonly unreturnedOrders: number
}

/**
 * Lo que impide la baja, contado por la misma función que la decide.
 *
 * Son dos cosas distintas y la spec las nombra por separado: **órdenes de compra en curso** —un
 * trato abierto con otra empresa— y **equipo rentado sin devolver** —material físico de otra
 * empresa que hoy está en manos de esta producción—. La segunda es la cara: dar de baja la
 * producción esconde el documento que dice quién tiene el equipo, y con él la única forma de
 * reclamarlo.
 *
 * El equipo fuera se cuenta sobre `warehouse_orders`, que pertenecen a **la empresa del almacén**,
 * no a ésta. Se alcanzan porque la política de esa tabla admite explícitamente la vía de la orden
 * de compra (`app.reaches_purchase_order`, migración `0005`). No se consulta la cotización del
 * almacén, que es su documento interno: `delivered` ya significa «salió y no ha vuelto», y
 * `finished` significa que volvió.
 */
async function blockingCounts(
  tx: Transaction,
  productionId: string,
): Promise<{ openPurchaseOrders: number; unreturnedOrders: number }> {
  const [open] = await tx
    .select({ value: count() })
    .from(productionPurchaseOrders)
    .where(
      and(
        eq(productionPurchaseOrders.productionId, productionId),
        isNull(productionPurchaseOrders.deletedAt),
        eq(productionPurchaseOrders.status, "open"),
      ),
    )

  const [unreturned] = await tx
    .select({ value: count() })
    .from(warehouseOrders)
    .innerJoin(
      productionPurchaseOrders,
      eq(productionPurchaseOrders.id, warehouseOrders.purchaseOrderId),
    )
    .where(
      and(
        eq(productionPurchaseOrders.productionId, productionId),
        isNull(warehouseOrders.deletedAt),
        eq(warehouseOrders.status, "delivered"),
      ),
    )

  return { openPurchaseOrders: open?.value ?? 0, unreturnedOrders: unreturned?.value ?? 0 }
}

export async function productionScope(
  actor: Actor,
  companyId: string,
  productionId: string,
): Promise<ProductionScope> {
  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    await loadProduction(tx, companyId, productionId)

    const owned = async (table: OwnedTable) => ownedCount(tx, table, productionId)

    const [scenes] = await tx
      .select({ value: count() })
      .from(productionScenes)
      .innerJoin(productionChapters, eq(productionChapters.id, productionScenes.chapterId))
      .where(
        and(
          eq(productionChapters.productionId, productionId),
          isNull(productionScenes.deletedAt),
          isNull(productionChapters.deletedAt),
        ),
      )

    return {
      ...(await blockingCounts(tx, productionId)),
      scripts: await owned(productionScripts),
      chapters: await owned(productionChapters),
      scenes: scenes?.value ?? 0,
      characters: await owned(productionCharacters),
      sets: await owned(productionSets),
      videos: await owned(productionVideos),
      items: await owned(productionItems),
      recordings: await owned(productionRecordings),
      workflows: await owned(productionWorkflows),
      purchaseOrders: await owned(productionPurchaseOrders),
    }
  })
}

export async function deleteProduction(
  actor: Actor,
  companyId: string,
  productionId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    await loadProduction(tx, companyId, productionId)

    const { openPurchaseOrders, unreturnedOrders } = await blockingCounts(tx, productionId)

    if (openPurchaseOrders > 0 || unreturnedOrders > 0) {
      const pending = [
        openPurchaseOrders > 0
          ? `${openPurchaseOrders} orden${openPurchaseOrders === 1 ? "" : "es"} de compra en curso`
          : null,
        unreturnedOrders > 0
          ? `${unreturnedOrders} pedido${unreturnedOrders === 1 ? "" : "s"} de almacén con equipo sin devolver`
          : null,
      ].filter((part) => part !== null)

      throw new ConflictError(
        `Esta producción tiene ${pending.join(" y ")}. Ciérralos o cancélalos antes de darla de baja.`,
      )
    }

    /**
     * Una sola fila, y ninguna más.
     *
     * Es la corrección de C-08. La tentación es recorrer la cascada a mano «para dejarlo limpio», y
     * es exactamente lo que produjo el defecto anterior: una función de borrado por entidad, con el
     * identificador equivocado en tres de ellas.
     */
    await tx
      .update(productions)
      .set({ deletedAt: new Date() })
      .where(eq(productions.id, productionId))
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/**
 * Cuántas filas vivas cuelgan de la producción en una de sus tablas hijas.
 *
 * Toma la tabla por su forma —lleva `production_id` y `deleted_at`— y no por una unión de tipos
 * concretos: son nueve tablas de dos módulos distintos, y enumerarlas en la firma obligaría a
 * tocarla cada vez que el servicio gane una.
 */
type OwnedTable = PgTable & { productionId: PgColumn; deletedAt: PgColumn }

async function ownedCount(
  tx: Transaction,
  table: OwnedTable,
  productionId: string,
): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(table)
    .where(and(eq(table.productionId, productionId), isNull(table.deletedAt)))

  return row?.value ?? 0
}

/** Una fecha del transporte, o nula. `null` la retira; la cadena vacía también. */
function toDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null || value === "") return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new UnprocessableError("La fecha no es válida")
  return parsed
}

/**
 * La fecha de fin no precede a la de inicio.
 *
 * También lo comprueba el motor —`productions_dates_ordered`, migración `0022`—, y no sobra: aquí
 * se responde `422` con el campo señalado, y allí se garantiza para quien escriba por otra vía. La
 * de arriba es la que se lee; la de abajo es la que se cumple.
 */
function assertOrdered(startsOn: Date | null, endsOn: Date | null): void {
  if (startsOn === null || endsOn === null) return
  if (endsOn.getTime() < startsOn.getTime()) {
    throw new UnprocessableError("La fecha de fin no puede ser anterior a la de inicio")
  }
}

/**
 * El identificador legible es único **en toda la plataforma**, no por empresa.
 *
 * Es lo que aparece en la dirección del directorio público de producciones, y ahí no hay empresa
 * que lo acote.
 */
async function freeSlug(tx: Transaction, name: string): Promise<string> {
  const base = slugify(name, "produccion")

  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = slugCandidate(base, attempt)

    const [taken] = await tx
      .select({ id: productions.id })
      .from(productions)
      .where(and(eq(productions.slug, candidate), isNull(productions.deletedAt)))
      .limit(1)

    if (!taken) return candidate
  }

  throw new UnprocessableError("Demasiadas producciones con ese nombre")
}

async function assertSlugFree(tx: Transaction, slug: string): Promise<void> {
  const [taken] = await tx
    .select({ id: productions.id })
    .from(productions)
    .where(and(eq(productions.slug, slug), isNull(productions.deletedAt)))
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

export async function loadProduction(tx: Transaction, companyId: string, productionId: string) {
  const [row] = await tx
    .select()
    .from(productions)
    .where(
      and(
        eq(productions.id, productionId),
        eq(productions.companyId, companyId),
        isNull(productions.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La producción no existe")
  return row
}

function toRecord(
  row: typeof productions.$inferSelect,
  images: ReadonlyMap<string, ImageRef> = new Map(),
): ProductionRecord {
  const image = row.imageUploadId === null ? undefined : images.get(row.imageUploadId)

  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: row.description,
    slug: row.slug,
    isPublished: row.isPublished,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    imageUploadId: row.imageUploadId,
    imageUrl: image?.url ?? null,
    imageThumbnailUrl: image?.thumbnailUrl ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
