/**
 * Inventario de una producción: los artículos.
 *
 * Ver `openspec/specs/production-inventory/spec.md`. Rebanada 22, bloque de inventario.
 *
 * **Una fila es un objeto físico**, igual que una unidad de existencia en un almacén y por la misma
 * razón: hay que saber dónde está cada cosa y en qué estado consta. La diferencia con el almacén es
 * de quién es: una unidad de almacén se renta y vuelve; un artículo de producción se compra, se usa
 * en un set, aparece en una jornada y acaba entregado o devuelto.
 *
 * ## Los ocho estados, y qué pasa a qué
 *
 * La spec **enumera** los ocho y no dice ni una palabra de las transiciones. El criterio está
 * adoptado —leído del departamento de arte— y vive en `TRANSITIONS`, **como dato y en un solo
 * sitio**: repartirlo en condicionales por los manejadores es como acaba habiendo dos reglas que se
 * contradicen y ninguna que se pueda leer entera.
 *
 * | Regla | Qué dice |
 * |---|---|
 * | `Disponible ↔ Almacenado` | Libre en ambos sentidos. Guardar y sacar del guardado |
 * | `* → Dañado · Incompleto · Perdido · Robado` | Las cosas se rompen y se pierden en cualquier momento, incluso guardadas |
 * | `Dañado · Incompleto · Perdido · Robado → Disponible · Almacenado` | Nada de eso es terminal: se reparó, apareció la pieza, estaba debajo de una mesa |
 * | `* → Devuelto` | Volvió a su dueño y salió de las manos de la producción |
 * | `Devuelto → nada` | **El único terminal** |
 *
 * ## «Entregado» es inalcanzable, y eso es deliberado
 *
 * No se pone a mano **nunca**: se llega ahí completando una nota de entrega, que se verifica pieza
 * por pieza y la firman las dos partes. Las notas son de la rebanada 22 y **no entran en esta
 * ronda**, así que hoy ningún camino lleva a `delivered` — y es correcto que así sea. Un estado que
 * significa «lo firmó quien lo recibió» puesto con un botón sería exactamente la mentira que la
 * verificación por líneas existe para impedir.
 *
 * La prueba lo fija: `delivered` es el único estado sin entrada, y `returned` el único sin salida.
 *
 * ## El código se acuña, no se pide
 *
 * Doce caracteres del alfabeto de Crockford, como `productCode()` y `unitCode()` en el almacén.
 * Siendo **generado por el sistema** no repite el agujero de H-90 —que es el de comprobar la
 * disponibilidad de un identificador elegido por una persona con las políticas puestas, sin ver las
 * filas de otras empresas—: aquí nadie elige, así que no hay nada que comprobar antes de insertar y
 * la garantía es el índice único.
 */

import {
  buildPage,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
  UnprocessableError,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import {
  productionCategories,
  productionContinuities,
  productionItemImages,
  productionItems,
  productionProps,
  productionRecordings,
  productions,
  productionSetItems,
  productionSets,
  uploads,
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
import { loadProduction } from "./productions.ts"

/** En el orden del enumerado del motor, para que las dos listas se lean igual. */
export const ITEM_STATUSES = [
  "available",
  "stored",
  "delivered",
  "returned",
  "damaged",
  "incomplete",
  "lost",
  "robbed",
] as const

export type ItemStatus = (typeof ITEM_STATUSES)[number]

/**
 * A qué puede pasar cada estado. **La tabla, como dato, y en un solo sitio.**
 *
 * Se escribe entera y explícita en lugar de derivarse de las reglas: derivada, leerla obliga a
 * ejecutar mentalmente la derivación, y el día que alguien quiera saber si un artículo perdido
 * puede marcarse robado tiene que reconstruir el razonamiento en vez de mirar una fila.
 *
 * **Ningún estado se lista a sí mismo.** Quedarse donde se está no es un cambio de estado, y
 * admitirlo silenciosamente haría que una pantalla que reenvía el estado actual dejara rastro de un
 * cambio que no ocurrió.
 *
 * `delivered` no aparece en ninguna lista de destinos: ver la cabecera del módulo.
 */
const TRANSITIONS: Readonly<Record<ItemStatus, readonly ItemStatus[]>> = {
  available: ["stored", "returned", "damaged", "incomplete", "lost", "robbed"],
  stored: ["available", "returned", "damaged", "incomplete", "lost", "robbed"],
  // Ya no está en manos de la producción: o se rompe donde esté, o vuelve a su dueño.
  delivered: ["returned", "damaged", "incomplete", "lost", "robbed"],
  // El único terminal.
  returned: [],
  damaged: ["available", "stored", "returned", "incomplete", "lost", "robbed"],
  incomplete: ["available", "stored", "returned", "damaged", "lost", "robbed"],
  lost: ["available", "stored", "returned", "damaged", "incomplete", "robbed"],
  robbed: ["available", "stored", "returned", "damaged", "incomplete", "lost"],
}

/** Si el cambio está permitido. **La única lectura de la tabla**, para que no haya una segunda. */
export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** Los destinos legales desde un estado, para que la pantalla no tenga que adivinarlos. */
export function transitionsFrom(from: ItemStatus): readonly ItemStatus[] {
  return TRANSITIONS[from]
}

// ─── Lo que viaja ────────────────────────────────────────────────────────────

export interface ItemImageRecord {
  readonly uploadId: string
  readonly url: string
  readonly thumbnailUrl: string | null
  readonly position: number
}

export interface ItemRecord {
  readonly id: string
  readonly productionId: string
  readonly categoryId: string | null
  readonly categoryName: string | null
  readonly shoppingId: string | null
  readonly name: string
  readonly description: string
  readonly code: string
  readonly status: ItemStatus
  readonly isInventoriable: boolean
  /** A dónde puede ir desde donde está. Sale de la misma tabla que decide. */
  readonly allowedStatuses: readonly ItemStatus[]
  readonly images: readonly ItemImageRecord[]
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** El artículo localizado por su etiqueta, con lo que hace falta para saber qué se tiene delante. */
export interface ItemLocation extends ItemRecord {
  readonly productionName: string
}

/**
 * Dónde se está usando un artículo.
 *
 * La spec pide tres sitios —notas de entrega, sets y jornadas— y aquí van **dos**: las notas de
 * entrega son de la rebanada 22 y no existen todavía, así que enumerarlas devolvería siempre la
 * lista vacía y eso se lee como «no está en ninguna nota», que es una afirmación que hoy nadie
 * puede hacer. Se declara el hueco en lugar de rellenarlo con un cero.
 */
export interface ItemUsage {
  readonly sets: readonly { id: string; name: string }[]
  readonly recordings: readonly { id: string; name: string; continuityId: string }[]
}

// ─── Consulta ────────────────────────────────────────────────────────────────

/**
 * Qué se puede pedir del inventario.
 *
 * Los tres filtros que la spec nombra —«filtrarse por estado, categoría y compra de origen»— y los
 * cuatro campos de búsqueda, incluido **el nombre de la categoría**, que es el escenario escrito:
 * «se busca por el nombre de una categoría → aparecen los artículos clasificados en ella».
 *
 * El orden por defecto es el nombre y no la fecha de alta: un inventario se recorre buscando una
 * cosa concreta, no mirando lo último que entró.
 */
export const itemQuery: QuerySchema = {
  filters: {
    status: { type: "enum", values: [...ITEM_STATUSES], label: "Estado" },
    categoryId: { type: "id", label: "Categoría" },
    shoppingId: { type: "id", label: "Compra de origen" },
    isInventoriable: { type: "boolean", label: "Inventariable" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["name", "description", "code", "categoryName"],
  sortable: ["name", "code", "status", "createdAt"],
  defaultSort: [{ field: "name", direction: "asc" }],
}

/**
 * El nombre de la categoría, como subconsulta correlacionada.
 *
 * Es lo que hace buscable un campo que vive en otra tabla sin meter una unión en el recuento: el
 * `count(*)` del sobre de paginación y la página de filas usan la **misma** condición, y una unión
 * obligaría a repetirla dos veces con el riesgo de que se separen.
 */
const categoryName = sql<string>`(
  select c.name from ${productionCategories} c where c.id = ${productionItems.categoryId}
)`

const mapping = {
  fields: {
    status: productionItems.status,
    categoryId: productionItems.categoryId,
    shoppingId: productionItems.shoppingId,
    isInventoriable: productionItems.isInventoriable,
    name: productionItems.name,
    code: productionItems.code,
    createdAt: productionItems.createdAt,
  },
  searchable: [
    productionItems.name,
    productionItems.description,
    productionItems.code,
    categoryName,
  ],
  tiebreak: productionItems.id,
}

export async function listItems(
  actor: Actor,
  companyId: string,
  productionId: string,
  query: ParsedQuery,
): Promise<Page<ItemRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const where = and(
      eq(productionItems.productionId, productionId),
      isNull(productionItems.deletedAt),
      ...collectionConditions(query, mapping),
    )

    const [total] = await tx.select({ value: count() }).from(productionItems).where(where)

    const rows = await tx
      .select({ item: productionItems, categoryName })
      .from(productionItems)
      .where(where)
      .orderBy(...collectionOrder(query, mapping))
      .limit(limit)
      .offset(offset)

    const images = await imagesOf(
      tx,
      rows.map((row) => row.item.id),
    )

    return buildPage(
      rows.map((row) => toRecord(row.item, row.categoryName, images.get(row.item.id) ?? [])),
      total?.value ?? 0,
      page,
      limit,
    )
  })
}

export async function getItem(
  actor: Actor,
  companyId: string,
  productionId: string,
  itemId: string,
): Promise<ItemRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    return detailOf(tx, productionId, itemId)
  })
}

/**
 * Localiza un artículo por el código de su etiqueta.
 *
 * **Acotado a la empresa y no a una producción**, y es lo que el escenario pide: «se obtiene el
 * artículo con su estado **y su producción**». Quien lee una etiqueta pegada a una silla en una
 * bodega de arte no sabe de qué rodaje es —para eso la lee—, así que exigirle la producción de
 * antemano convierte la consulta en algo que sólo puede hacer quien ya sabe la respuesta.
 */
export async function findItemByCode(
  actor: Actor,
  companyId: string,
  code: string,
): Promise<ItemLocation> {
  return withRequester(actor, async (tx) => {
    const [row] = await tx
      .select({ item: productionItems, categoryName, productionName: productions.name })
      .from(productionItems)
      .innerJoin(productions, eq(productions.id, productionItems.productionId))
      .where(
        and(
          eq(productionItems.code, code.trim().toUpperCase()),
          eq(productions.companyId, companyId),
          isNull(productionItems.deletedAt),
          isNull(productions.deletedAt),
        ),
      )
      .limit(1)

    if (!row) throw new NotFoundError("Ningún artículo tiene ese código")

    const images = await imagesOf(tx, [row.item.id])

    return {
      ...toRecord(row.item, row.categoryName, images.get(row.item.id) ?? []),
      productionName: row.productionName,
    }
  })
}

/**
 * Dónde se está usando un artículo: sets y jornadas.
 *
 * «SHALL consultarse **antes** de eliminarlo o de cambiar su estado, para no romper trabajo en
 * curso», dice la spec, y por eso es una consulta propia y no un campo del detalle: se pregunta en
 * el momento de decidir, no cada vez que se pinta la ficha.
 *
 * Las jornadas se alcanzan por la utilería: artículo → utilería → continuidad → jornada. Se
 * devuelve también la continuidad porque es lo que hay que abrir para quitarlo de ahí; decir «se usa
 * en la jornada del martes» sin decir en cuál de sus continuidades deja el trabajo a medias.
 */
export async function itemUsage(
  actor: Actor,
  companyId: string,
  productionId: string,
  itemId: string,
): Promise<ItemUsage> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadItem(tx, productionId, itemId)

    const sets = await tx
      .select({ id: productionSets.id, name: productionSets.name })
      .from(productionSetItems)
      .innerJoin(productionSets, eq(productionSets.id, productionSetItems.setId))
      .where(and(eq(productionSetItems.itemId, itemId), isNull(productionSets.deletedAt)))
      .orderBy(asc(productionSets.name))

    const recordings = await tx
      .select({
        id: productionRecordings.id,
        name: productionRecordings.name,
        continuityId: productionContinuities.id,
      })
      .from(productionProps)
      .innerJoin(
        productionContinuities,
        eq(productionContinuities.id, productionProps.continuityId),
      )
      .innerJoin(
        productionRecordings,
        eq(productionRecordings.id, productionContinuities.recordingId),
      )
      .where(and(eq(productionProps.itemId, itemId), isNull(productionRecordings.deletedAt)))
      .orderBy(asc(productionRecordings.name))

    return { sets, recordings }
  })
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export interface CreateItemInput {
  readonly name: string
  readonly description?: string | undefined
  readonly categoryId?: string | null | undefined
  readonly shoppingId?: string | null | undefined
  readonly isInventoriable?: boolean | undefined
}

export async function createItem(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: CreateItemInput,
): Promise<ItemRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    if (input.categoryId != null) await assertCategory(tx, productionId, input.categoryId)

    const [created] = await tx
      .insert(productionItems)
      .values({
        id: newId(),
        productionId,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        // Acuñado, nunca recibido. Ver la cabecera del módulo.
        code: itemCode(),
        categoryId: input.categoryId ?? null,
        shoppingId: input.shoppingId ?? null,
        ...(input.isInventoriable === undefined ? {} : { isInventoriable: input.isInventoriable }),
      })
      .returning()

    if (!created) throw new Error("la inserción del artículo no devolvió fila")
    return detailOf(tx, productionId, created.id)
  })
}

export interface UpdateItemInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
  /** `null` lo desclasifica; omitirlo lo deja como está. */
  readonly categoryId?: string | null | undefined
  readonly shoppingId?: string | null | undefined
  readonly isInventoriable?: boolean | undefined
}

/**
 * Edita un artículo. **El código y el estado no se tocan por aquí.**
 *
 * El código está impreso en una etiqueta pegada al objeto, así que cambiarlo dejaría la etiqueta
 * mintiendo; el estado tiene su propia operación porque tiene su propia tabla de transiciones y su
 * propio permiso, y admitirlo en el parche general sería la vía por la que un artículo llega a
 * `entregado` sin que nadie firme nada.
 */
export async function updateItem(
  actor: Actor,
  companyId: string,
  productionId: string,
  itemId: string,
  input: UpdateItemInput,
): Promise<ItemRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadItem(tx, productionId, itemId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description.trim()
    if (input.isInventoriable !== undefined) patch.isInventoriable = input.isInventoriable
    if (input.shoppingId !== undefined) patch.shoppingId = input.shoppingId

    if (input.categoryId !== undefined) {
      if (input.categoryId !== null) await assertCategory(tx, productionId, input.categoryId)
      patch.categoryId = input.categoryId
    }

    if (Object.keys(patch).length > 0) {
      await tx.update(productionItems).set(patch).where(eq(productionItems.id, itemId))
    }

    return detailOf(tx, productionId, itemId)
  })
}

/**
 * Cambia el estado de un artículo, contra la tabla de transiciones.
 *
 * El rechazo dice **a dónde sí se puede ir** y no sólo que no se puede: quien recibe «no se puede
 * pasar de devuelto a disponible» sin la lista se queda sin saber si el problema es el destino o el
 * origen.
 *
 * ## La atribución no se guarda, y no por descuido
 *
 * La spec pide que el cambio «quede registrado con su autor y su instante». El instante lo da
 * `updated_at`; **el autor no tiene dónde escribirse**: `production_items` no lleva columna de
 * atribución y no existe una tabla de eventos del artículo —el almacén sí la tiene,
 * `warehouse_stock_events`, y ahí es donde se ve lo que falta aquí—. Queda anotado en
 * `HALLAZGOS.md` H-171 con lo que costaría cerrarlo, que es una migración.
 */
export async function changeItemStatus(
  actor: Actor,
  companyId: string,
  productionId: string,
  itemId: string,
  status: ItemStatus,
): Promise<ItemRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const current = await loadItem(tx, productionId, itemId)

    if (!canTransition(current.status, status)) {
      const allowed = transitionsFrom(current.status)
      throw new UnprocessableError(
        allowed.length === 0
          ? `Un artículo ${LABELS[current.status]} ya no cambia de estado: es el final del recorrido.`
          : `Un artículo ${LABELS[current.status]} no puede pasar a ${LABELS[status]}. ` +
            `Desde donde está sólo cabe: ${allowed.map((one) => LABELS[one]).join(", ")}.`,
      )
    }

    await tx
      .update(productionItems)
      .set({ status, updatedAt: new Date() })
      .where(eq(productionItems.id, itemId))

    return detailOf(tx, productionId, itemId)
  })
}

/** Cómo se nombra cada estado en un mensaje dirigido a una persona. */
const LABELS: Readonly<Record<ItemStatus, string>> = {
  available: "disponible",
  stored: "almacenado",
  delivered: "entregado",
  returned: "devuelto",
  damaged: "dañado",
  incomplete: "incompleto",
  lost: "perdido",
  robbed: "robado",
}

export interface ItemImagesInput {
  readonly uploadIds: readonly string[]
}

/**
 * Sustituye la galería de un artículo.
 *
 * Es la misma maquinaria que la galería de producto del almacén, incluido **el diferencial que
 * distingue en lugar de intersecar** (`DEFECTS.md` L-01): lo que sigue en la colección no se toca,
 * y sólo lo que se retiró es candidato a soltarse. No se reescribe aquí: se llama a
 * `media/collections.ts`, que existe precisamente para que el segundo llamante no copie la regla.
 *
 * Sin portada, a diferencia del almacén: `production_item_images` no tiene la columna, y un artículo
 * de utilería se enseña con su primera foto — que es lo que el orden ya decide.
 */
export async function setItemImages(
  actor: Actor,
  companyId: string,
  productionId: string,
  itemId: string,
  input: ItemImagesInput,
): Promise<ItemRecord> {
  const { record, released } = await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadItem(tx, productionId, itemId)

    const existing = await tx
      .select()
      .from(productionItemImages)
      .where(eq(productionItemImages.itemId, itemId))
      .orderBy(asc(productionItemImages.position))

    const diff = diffCollection(
      existing.map((row) => row.uploadId),
      input.uploadIds,
    )

    await assertUsableImages(tx, companyId, diff.next)

    if (diff.removed.length > 0) {
      await tx
        .delete(productionItemImages)
        .where(
          and(
            eq(productionItemImages.itemId, itemId),
            inArray(productionItemImages.uploadId, [...diff.removed]),
          ),
        )
    }

    for (const [position, uploadId] of diff.next.entries()) {
      if (diff.added.includes(uploadId)) {
        await tx.insert(productionItemImages).values({ id: newId(), itemId, uploadId, position })
        continue
      }

      await tx
        .update(productionItemImages)
        .set({ position, updatedAt: new Date() })
        .where(
          and(
            eq(productionItemImages.itemId, itemId),
            eq(productionItemImages.uploadId, uploadId),
          ),
        )
    }

    return {
      record: await detailOf(tx, productionId, itemId),
      // Va **después** de haber quitado las filas: la comprobación de referencias mira el estado de
      // esta transacción, y hecha antes diría que la foto sigue en uso.
      released: await releaseUploads(tx, diff.removed),
    }
  })

  await sweepObjects(released)
  return record
}

/**
 * Da de baja un artículo y lo retira de donde estuviera referenciado.
 *
 * «SHALL retirarlo de los sets y de las continuidades que lo referenciaban, **sin eliminar ni los
 * sets ni las continuidades**.»
 *
 * ## Por qué se escribe a mano habiendo cascadas declaradas
 *
 * `production_set_items.item_id` y `production_props.item_id` propagan en cascada, pero **la baja es
 * lógica**: se escribe `deleted_at` y no se borra ninguna fila, así que el motor no propaga nada. Un
 * artículo dado de baja seguiría figurando en sus sets y en su utilería, apareciendo en la
 * composición de un set que ya no lo tiene. Las cascadas declaradas son la red para el día que se
 * borre de verdad; la retirada de aquí es la que ocurre hoy.
 *
 * La utilería se **elimina** en vez de quedarse sin artículo porque no puede quedarse sin él: la
 * restricción `production_props_item_xor_video` exige artículo **o** video, nunca ninguno. Es lo que
 * la spec del video ya describe para su lado —«su referencia a ese video desaparece»— y la
 * continuidad sobrevive igual.
 */
export async function deleteItem(
  actor: Actor,
  companyId: string,
  productionId: string,
  itemId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadItem(tx, productionId, itemId)

    await tx.delete(productionSetItems).where(eq(productionSetItems.itemId, itemId))
    await tx.delete(productionProps).where(eq(productionProps.itemId, itemId))

    await tx
      .update(productionItems)
      .set({ deletedAt: new Date() })
      .where(eq(productionItems.id, itemId))
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/**
 * Alfabeto sin caracteres ambiguos.
 *
 * El mismo que el del almacén, y por el mismo motivo: sin `I`, `L`, `O` ni `U`. Los tres primeros se
 * confunden con `1` y `0` en una etiqueta impresa y dictada por teléfono; el cuarto se evita porque
 * produce palabras que nadie quiere leer en un código de inventario. Es el alfabeto de Crockford.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const CODE_LENGTH = 12

/**
 * El código identificativo de un artículo.
 *
 * Doce caracteres son sesenta bits: la colisión es despreciable con miles de millones de filas, y
 * **la garantía no es ésa, es el índice único** — si alguna vez colisionara, la inserción falla y la
 * operación entera se revierte. Falla ruidosamente, que es lo contrario de dos sillas compartiendo
 * etiqueta.
 */
function itemCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("")
}

/**
 * La categoría es de esta producción.
 *
 * Las claves foráneas se comprueban con los permisos del dueño de la tabla y **se saltan las
 * políticas de fila**, así que el motor aceptaría la categoría de otra producción —y de otra
 * empresa—. Se corta aquí, que es la capa que sabe de quién es la producción. Es la misma cautela
 * que `categories.ts` toma con el rol.
 */
async function assertCategory(
  tx: Transaction,
  productionId: string,
  categoryId: string,
): Promise<void> {
  const [row] = await tx
    .select({ id: productionCategories.id })
    .from(productionCategories)
    .where(
      and(
        eq(productionCategories.id, categoryId),
        eq(productionCategories.productionId, productionId),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La categoría no existe en esta producción")
}

export async function loadItem(tx: Transaction, productionId: string, itemId: string) {
  const [row] = await tx
    .select()
    .from(productionItems)
    .where(
      and(
        eq(productionItems.id, itemId),
        eq(productionItems.productionId, productionId),
        isNull(productionItems.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El artículo no existe")
  return row
}

/** Las galerías de un puñado de artículos, en **una** consulta. */
async function imagesOf(
  tx: Transaction,
  itemIds: readonly string[],
): Promise<Map<string, ItemImageRecord[]>> {
  const wanted = [...new Set(itemIds)]
  if (wanted.length === 0) return new Map()

  const rows = await tx
    .select({
      itemId: productionItemImages.itemId,
      uploadId: productionItemImages.uploadId,
      position: productionItemImages.position,
      url: uploads.url,
      variants: uploads.variants,
    })
    .from(productionItemImages)
    .innerJoin(uploads, eq(uploads.id, productionItemImages.uploadId))
    .where(inArray(productionItemImages.itemId, wanted))
    .orderBy(asc(productionItemImages.position))

  const byItem = new Map<string, ItemImageRecord[]>()
  for (const row of rows) {
    const list = byItem.get(row.itemId) ?? []
    list.push({
      uploadId: row.uploadId,
      url: row.url,
      thumbnailUrl: row.variants?.thumbnail ?? null,
      position: row.position,
    })
    byItem.set(row.itemId, list)
  }

  return byItem
}

/** El artículo tal y como se devuelve tras leerlo o escribirlo. */
async function detailOf(
  tx: Transaction,
  productionId: string,
  itemId: string,
): Promise<ItemRecord> {
  const [row] = await tx
    .select({ item: productionItems, categoryName })
    .from(productionItems)
    .where(
      and(
        eq(productionItems.id, itemId),
        eq(productionItems.productionId, productionId),
        isNull(productionItems.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El artículo no existe")

  const images = await imagesOf(tx, [itemId])
  return toRecord(row.item, row.categoryName, images.get(itemId) ?? [])
}

function toRecord(
  row: typeof productionItems.$inferSelect,
  category: string | null,
  images: readonly ItemImageRecord[],
): ItemRecord {
  return {
    id: row.id,
    productionId: row.productionId,
    categoryId: row.categoryId,
    categoryName: category,
    shoppingId: row.shoppingId,
    name: row.name,
    description: row.description,
    code: row.code,
    status: row.status,
    isInventoriable: row.isInventoriable,
    allowedStatuses: transitionsFrom(row.status),
    images,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
