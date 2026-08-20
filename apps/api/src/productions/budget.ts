/**
 * El presupuesto de una producción: anclas, compras y la resta.
 *
 * Ver `openspec/specs/production-budget/spec.md`. Rebanada 22, lo último que le quedaba.
 *
 * ```
 * Ancla   →  una partida presupuestada: lo previsto
 * Compra  →  un gasto realizado: lo ejecutado
 * ```
 *
 * ## El presupuesto no se guarda en ninguna parte
 *
 * «No SHALL existir un total persistido que pueda quedar desincronizado.» Aquí eso significa que no
 * hay tabla de presupuesto, no hay columna de total y no hay nada que actualizar al registrar una
 * compra: `readBudget` suma las dos colecciones **en el momento**, con `budgetAmounts`, que es la
 * misma función pura que usa el navegador. Registrar un gasto mueve la diferencia porque la
 * diferencia **es** la resta, no porque alguien se acuerde de recalcularla.
 *
 * ## Los totales del filtro y los del conjunto, en la misma respuesta
 *
 * «Así puede verse el peso de una categoría sin perder de vista el conjunto.» La lectura devuelve
 * dos juegos de importes: los de lo filtrado y los de la producción entera. Devolver sólo los
 * primeros obligaría a la pantalla a hacer una segunda petición sin filtros para poder decir «de
 * cuánto», y las dos peticiones pueden ver estados distintos de la base.
 *
 * ## Un artículo pertenece como máximo a una compra
 *
 * No es una restricción del motor —`production_items.shopping_id` es una referencia normal— sino la
 * forma de la relación: **uno a muchos vista del lado equivocado**. Asignar un artículo a la compra
 * B lo retira de la A porque la columna es una sola, y eso hace que `setShoppingItems` sea un
 * movimiento entre dos filas de la misma tabla: se sueltan las que salen y se toman las que entran,
 * **en la misma transacción**. Partirlo dejaría un instante en el que un artículo no está en
 * ninguna de las dos compras, y un fallo entre las dos escrituras lo dejaría ahí para siempre.
 *
 * ## Eliminar una compra: la cascada declarada no se dispara
 *
 * La baja de una compra es **lógica** —`deleted_at`—, así que ni el `ON DELETE set null` de
 * `production_items.shopping_id` ni ninguna otra cascada declarada sobre esta fila corren nunca. Es
 * exactamente la trampa de `HALLAZGOS.md` H-172 y H-203, y por eso las dos cosas que la spec pide
 * —soltar los artículos sin eliminarlos y borrar las facturas— están escritas a mano aquí.
 */

import {
  type BudgetAmounts,
  type BudgetCategory,
  budgetAmounts,
  budgetByCategory,
  buildPage,
  NotFoundError,
  newId,
  optionalPartialCardId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
  SHOPPING_KINDS,
  SHOPPING_METHODS,
  type ShoppingKind,
  type ShoppingMethod,
  UnprocessableError,
} from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import {
  counterparties,
  productionAnchors,
  productionAttachments,
  productionCategories,
  productionItems,
  productionShoppings,
  uploads,
  users,
} from "@tfv/db/schema"
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { assertUsableFiles, releaseUploads, sweepObjects } from "../media/collections.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { loadProduction } from "./productions.ts"

export type { ShoppingKind, ShoppingMethod }
export { SHOPPING_KINDS, SHOPPING_METHODS }

// ─── Registros ───────────────────────────────────────────────────────────────

/** Un archivo colgado de un ancla o de una compra: su comprobante, su factura. */
export interface BudgetAttachment {
  readonly id: string
  readonly uploadId: string
  readonly name: string
  readonly url: string
  readonly kind: string
  readonly createdAt: Date
}

export interface AnchorRecord {
  readonly id: string
  readonly productionId: string
  readonly name: string
  readonly description: string
  /** Cadena decimal. El dinero nunca es coma flotante, ni aquí ni en el transporte. */
  readonly amount: string
  readonly categoryId: string | null
  readonly categoryName: string | null
  readonly responsibleId: string | null
  readonly responsibleName: string | null
  readonly attachments: readonly BudgetAttachment[]
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** Un artículo del inventario que entró con esta compra. */
export interface ShoppingItem {
  readonly id: string
  readonly name: string
  readonly code: string
}

export interface ShoppingRecord {
  readonly id: string
  readonly productionId: string
  readonly name: string
  readonly observations: string
  readonly amount: string
  readonly kind: ShoppingKind
  readonly method: ShoppingMethod
  /**
   * Los últimos dígitos de la tarjeta. **Nunca el número completo.**
   *
   * Lo garantiza el tipo en la entrada —`optionalPartialCardId` no sabe convertir dieciséis
   * dígitos— y no un comentario sobre la columna.
   */
  readonly cardLast4: string | null
  readonly isDeductible: boolean
  readonly occurredOn: Date | null
  readonly providerId: string | null
  readonly providerName: string | null
  readonly categoryId: string | null
  readonly categoryName: string | null
  readonly responsibleId: string | null
  readonly responsibleName: string | null
  /**
   * El pedido de almacén cuya liquidación generó esta compra, si vino por ahí.
   *
   * La columna es de la rebanada 23 y este módulo **sólo la respeta**: se lee y se devuelve para
   * que la trazabilidad exista desde el primer día, y no se escribe desde ninguna ruta de aquí.
   */
  readonly warehouseOrderId: string | null
  readonly items: readonly ShoppingItem[]
  readonly attachments: readonly BudgetAttachment[]
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * El presupuesto: las dos colecciones, sus sumas y la diferencia.
 *
 * `filtered` son los importes de lo que se está mirando; `overall`, los de la producción entera.
 * Sin filtros los dos coinciden, y coinciden porque se calculan igual, no porque uno copie al otro.
 */
export interface BudgetRecord {
  readonly anchors: readonly AnchorRecord[]
  readonly shoppings: readonly ShoppingRecord[]
  readonly filtered: BudgetAmounts
  readonly overall: BudgetAmounts
  readonly categories: readonly BudgetCategory[]
}

// ─── Consulta ────────────────────────────────────────────────────────────────

/**
 * Qué se puede pedir de las anclas.
 *
 * «Las anclas SHALL poder buscarse por nombre, descripción y nombre de su categoría», y filtrarse
 * «por categoría, responsable y rango de fechas». Los tres campos de búsqueda están declarados: el
 * tercero no es una columna de esta tabla, y por eso el mapa lo resuelve con una expresión.
 */
export const anchorQuery: QuerySchema = {
  filters: {
    categoryId: { type: "id", label: "Categoría" },
    responsibleId: { type: "id", label: "Responsable" },
    createdAt: { type: "date", range: true, label: "Fecha" },
  },
  searchable: ["name", "description", "categoryName"],
  sortable: ["name", "amount", "createdAt"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
}

const anchorMapping = {
  fields: {
    categoryId: productionAnchors.categoryId,
    responsibleId: productionAnchors.responsibleId,
    createdAt: productionAnchors.createdAt,
    name: productionAnchors.name,
    amount: productionAnchors.amount,
  },
  searchable: [
    productionAnchors.name,
    productionAnchors.description,
    /**
     * El nombre de la categoría, resuelto en la propia condición.
     *
     * `searchable` admite expresiones y no sólo columnas, y aquí eso es justo lo que hace falta: el
     * tercer campo que la spec pide no está en esta tabla. Una subconsulta correlacionada lo trae
     * sin unir —una unión cambiaría el recuento cuando la categoría falta— y `coalesce` deja que un
     * ancla sin clasificar siga entrando por los otros dos campos en vez de desaparecer.
     */
    sql`coalesce((select ${productionCategories.name} from ${productionCategories} where ${productionCategories.id} = ${productionAnchors.categoryId}), '')`,
  ],
  tiebreak: productionAnchors.id,
}

/**
 * Qué se puede pedir de las compras.
 *
 * Todo lo que la spec enumera: categoría, responsable y rango de fechas como las anclas, y además
 * tipo, método de pago, proveedor y si son deducibles. El rango va sobre `occurredOn` —la fecha del
 * gasto— y no sobre el alta: quien filtra un trimestre pregunta por cuándo se gastó.
 */
export const shoppingQuery: QuerySchema = {
  filters: {
    categoryId: { type: "id", label: "Categoría" },
    responsibleId: { type: "id", label: "Responsable" },
    providerId: { type: "id", label: "Proveedor" },
    kind: { type: "enum", values: SHOPPING_KINDS, set: true, label: "Tipo" },
    method: { type: "enum", values: SHOPPING_METHODS, set: true, label: "Método de pago" },
    isDeductible: { type: "boolean", label: "Deducible" },
    occurredOn: { type: "date", range: true, label: "Fecha" },
  },
  searchable: ["name"],
  sortable: ["name", "amount", "occurredOn", "createdAt"],
  defaultSort: [
    { field: "occurredOn", direction: "desc" },
    { field: "createdAt", direction: "desc" },
  ],
}

const shoppingMapping = {
  fields: {
    categoryId: productionShoppings.categoryId,
    responsibleId: productionShoppings.responsibleId,
    providerId: productionShoppings.providerId,
    kind: productionShoppings.kind,
    method: productionShoppings.method,
    isDeductible: productionShoppings.isDeductible,
    occurredOn: productionShoppings.occurredOn,
    name: productionShoppings.name,
    amount: productionShoppings.amount,
    createdAt: productionShoppings.createdAt,
  },
  searchable: [productionShoppings.name],
  tiebreak: productionShoppings.id,
}

// ─── Anclas ──────────────────────────────────────────────────────────────────

export async function listAnchors(
  actor: Actor,
  companyId: string,
  productionId: string,
  query: ParsedQuery,
): Promise<Page<AnchorRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const where = and(
      eq(productionAnchors.productionId, productionId),
      isNull(productionAnchors.deletedAt),
      ...collectionConditions(query, anchorMapping),
    )

    const [total] = await tx.select({ value: count() }).from(productionAnchors).where(where)

    const rows = await tx
      .select()
      .from(productionAnchors)
      .where(where)
      .orderBy(...collectionOrder(query, anchorMapping))
      .limit(limit)
      .offset(offset)

    return buildPage(await decorateAnchors(tx, rows), total?.value ?? 0, page, limit)
  })
}

export async function getAnchor(
  actor: Actor,
  companyId: string,
  productionId: string,
  anchorId: string,
): Promise<AnchorRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const row = await loadAnchor(tx, productionId, anchorId)

    const [record] = await decorateAnchors(tx, [row])
    if (!record) throw new NotFoundError("El ancla no existe")
    return record
  })
}

export interface CreateAnchorInput {
  readonly name: string
  readonly description?: string | undefined
  readonly amount: string
  readonly categoryId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

export async function createAnchor(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: CreateAnchorInput,
): Promise<AnchorRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const name = input.name.trim()
    if (name === "") throw new UnprocessableError("El ancla necesita un nombre")

    const categoryId = await resolveCategory(tx, productionId, input.categoryId ?? null)

    const [created] = await tx
      .insert(productionAnchors)
      .values({
        id: newId(),
        productionId,
        name,
        description: input.description?.trim() ?? "",
        amount: assertAmount(input.amount),
        categoryId,
        responsibleId: input.responsibleId ?? null,
      })
      .returning()

    if (!created) throw new Error("la inserción del ancla no devolvió fila")
    return (await decorateAnchors(tx, [created]))[0] as AnchorRecord
  })
}

export interface UpdateAnchorInput {
  readonly name?: string | undefined
  readonly description?: string | undefined
  readonly amount?: string | undefined
  readonly categoryId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

export async function updateAnchor(
  actor: Actor,
  companyId: string,
  productionId: string,
  anchorId: string,
  input: UpdateAnchorInput,
): Promise<AnchorRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const current = await loadAnchor(tx, productionId, anchorId)

    const patch: Record<string, unknown> = {}

    if (input.name !== undefined) {
      const name = input.name.trim()
      if (name === "") throw new UnprocessableError("El ancla necesita un nombre")
      patch.name = name
    }
    if (input.description !== undefined) patch.description = input.description.trim()
    if (input.amount !== undefined) patch.amount = assertAmount(input.amount)
    if (input.responsibleId !== undefined) patch.responsibleId = input.responsibleId
    if (input.categoryId !== undefined) {
      patch.categoryId = await resolveCategory(tx, productionId, input.categoryId)
    }

    if (Object.keys(patch).length === 0) {
      return (await decorateAnchors(tx, [current]))[0] as AnchorRecord
    }

    patch.updatedAt = new Date()

    const [updated] = await tx
      .update(productionAnchors)
      .set(patch)
      .where(eq(productionAnchors.id, anchorId))
      .returning()

    if (!updated) throw new NotFoundError("El ancla no existe")
    return (await decorateAnchors(tx, [updated]))[0] as AnchorRecord
  })
}

/**
 * Da de baja un ancla.
 *
 * Lógica, porque el modelo le da columna. Sus comprobantes **sí** se recorren, y no por gusto: un
 * archivo suelto ocupa espacio en el almacén de objetos y no lo libera nadie. Es lo mismo que hace
 * la baja de una tarea.
 */
export async function deleteAnchor(
  actor: Actor,
  companyId: string,
  productionId: string,
  anchorId: string,
): Promise<void> {
  const released = await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadAnchor(tx, productionId, anchorId)

    const attachments = await tx
      .select({ uploadId: productionAttachments.uploadId })
      .from(productionAttachments)
      .where(eq(productionAttachments.anchorId, anchorId))

    await tx.delete(productionAttachments).where(eq(productionAttachments.anchorId, anchorId))

    await tx
      .update(productionAnchors)
      .set({ deletedAt: new Date() })
      .where(eq(productionAnchors.id, anchorId))

    return releaseUploads(
      tx,
      attachments.map((row) => row.uploadId),
    )
  })

  await sweepObjects(released)
}

// ─── Compras ─────────────────────────────────────────────────────────────────

export async function listShoppings(
  actor: Actor,
  companyId: string,
  productionId: string,
  query: ParsedQuery,
): Promise<Page<ShoppingRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const where = and(
      eq(productionShoppings.productionId, productionId),
      isNull(productionShoppings.deletedAt),
      ...collectionConditions(query, shoppingMapping),
    )

    const [total] = await tx.select({ value: count() }).from(productionShoppings).where(where)

    const rows = await tx
      .select()
      .from(productionShoppings)
      .where(where)
      .orderBy(...collectionOrder(query, shoppingMapping))
      .limit(limit)
      .offset(offset)

    return buildPage(await decorateShoppings(tx, rows), total?.value ?? 0, page, limit)
  })
}

export async function getShopping(
  actor: Actor,
  companyId: string,
  productionId: string,
  shoppingId: string,
): Promise<ShoppingRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const row = await loadShopping(tx, productionId, shoppingId)

    const [record] = await decorateShoppings(tx, [row])
    if (!record) throw new NotFoundError("La compra no existe")
    return record
  })
}

export interface CreateShoppingInput {
  readonly name: string
  readonly observations?: string | undefined
  readonly amount: string
  readonly kind?: ShoppingKind | undefined
  readonly method?: ShoppingMethod | undefined
  readonly cardLast4?: string | null | undefined
  readonly isDeductible?: boolean | undefined
  readonly occurredOn?: string | null | undefined
  readonly providerId?: string | null | undefined
  readonly categoryId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

export async function createShopping(
  actor: Actor,
  companyId: string,
  productionId: string,
  input: CreateShoppingInput,
): Promise<ShoppingRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const name = input.name.trim()
    if (name === "") throw new UnprocessableError("La compra necesita un nombre")

    const categoryId = await resolveCategory(tx, productionId, input.categoryId ?? null)
    const providerId = await resolveProvider(tx, companyId, input.providerId ?? null)
    const method = input.method ?? "cash"

    const [created] = await tx
      .insert(productionShoppings)
      .values({
        id: newId(),
        productionId,
        name,
        observations: input.observations?.trim() ?? "",
        amount: assertAmount(input.amount),
        kind: input.kind ?? "shopping",
        method,
        cardLast4: assertCard(method, input.cardLast4),
        isDeductible: input.isDeductible ?? false,
        occurredOn: optionalDate(input.occurredOn),
        providerId,
        categoryId,
        responsibleId: input.responsibleId ?? null,
      })
      .returning()

    if (!created) throw new Error("la inserción de la compra no devolvió fila")
    return (await decorateShoppings(tx, [created]))[0] as ShoppingRecord
  })
}

export interface UpdateShoppingInput {
  readonly name?: string | undefined
  readonly observations?: string | undefined
  readonly amount?: string | undefined
  readonly kind?: ShoppingKind | undefined
  readonly method?: ShoppingMethod | undefined
  readonly cardLast4?: string | null | undefined
  readonly isDeductible?: boolean | undefined
  readonly occurredOn?: string | null | undefined
  readonly providerId?: string | null | undefined
  readonly categoryId?: string | null | undefined
  readonly responsibleId?: string | null | undefined
}

export async function updateShopping(
  actor: Actor,
  companyId: string,
  productionId: string,
  shoppingId: string,
  input: UpdateShoppingInput,
): Promise<ShoppingRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const current = await loadShopping(tx, productionId, shoppingId)

    const patch: Record<string, unknown> = {}

    if (input.name !== undefined) {
      const name = input.name.trim()
      if (name === "") throw new UnprocessableError("La compra necesita un nombre")
      patch.name = name
    }
    if (input.observations !== undefined) patch.observations = input.observations.trim()
    if (input.amount !== undefined) patch.amount = assertAmount(input.amount)
    if (input.kind !== undefined) patch.kind = input.kind
    if (input.isDeductible !== undefined) patch.isDeductible = input.isDeductible
    if (input.occurredOn !== undefined) patch.occurredOn = optionalDate(input.occurredOn)
    if (input.responsibleId !== undefined) patch.responsibleId = input.responsibleId

    if (input.categoryId !== undefined) {
      patch.categoryId = await resolveCategory(tx, productionId, input.categoryId)
    }
    if (input.providerId !== undefined) {
      patch.providerId = await resolveProvider(tx, companyId, input.providerId)
    }

    /**
     * El método y la tarjeta se resuelven juntos.
     *
     * Cambiar a efectivo **borra** la identificación parcial: dejarla ahí diría que un pago en
     * efectivo se hizo con una tarjeta que termina en 4242. Y declarar tarjeta sin mandar dígitos
     * conserva los que hubiera, porque la spec no los exige.
     */
    const method = input.method ?? current.method
    if (input.method !== undefined) patch.method = method
    if (input.method !== undefined || input.cardLast4 !== undefined) {
      patch.cardLast4 = assertCard(method, input.cardLast4 ?? current.cardLast4)
    }

    if (Object.keys(patch).length === 0) {
      return (await decorateShoppings(tx, [current]))[0] as ShoppingRecord
    }

    patch.updatedAt = new Date()

    const [updated] = await tx
      .update(productionShoppings)
      .set(patch)
      .where(eq(productionShoppings.id, shoppingId))
      .returning()

    if (!updated) throw new NotFoundError("La compra no existe")
    return (await decorateShoppings(tx, [updated]))[0] as ShoppingRecord
  })
}

/**
 * Establece de una vez el conjunto de artículos que incorporó una compra.
 *
 * «El sistema SHALL permitir establecer ese conjunto de una vez», y «un artículo SHALL pertenecer
 * como máximo a una compra: asignarlo a otra SHALL retirarlo de la anterior».
 *
 * Las dos frases son **la misma escritura**, y por eso van en una sola transacción: los que salen
 * se sueltan (`shopping_id` a nulo) y los que entran se toman, incluidos los que estaban en otra
 * compra. Entre las dos escrituras hay un instante en el que un artículo no figura en ninguna de
 * las dos; fuera de la transacción ese instante sería visible, y un fallo lo dejaría permanente.
 *
 * Soltar **no elimina**: el artículo sigue en el inventario, sin compra asignada. Es el mismo
 * requisito que gobierna la baja de la compra.
 */
export async function setShoppingItems(
  actor: Actor,
  companyId: string,
  productionId: string,
  shoppingId: string,
  itemIds: readonly string[],
): Promise<ShoppingRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    const shopping = await loadShopping(tx, productionId, shoppingId)

    const wanted = [...new Set(itemIds)]
    await assertItemsOfProduction(tx, productionId, wanted)

    const held = await tx
      .select({ id: productionItems.id })
      .from(productionItems)
      .where(and(eq(productionItems.shoppingId, shoppingId), isNull(productionItems.deletedAt)))

    const released = held.map((row) => row.id).filter((id) => !wanted.includes(id))

    if (released.length > 0) {
      await tx
        .update(productionItems)
        .set({ shoppingId: null, updatedAt: new Date() })
        .where(inArray(productionItems.id, released))
    }

    if (wanted.length > 0) {
      // Sin excluir los que ya estaban: la escritura es idempotente y excluirlos costaría una
      // comparación más para ahorrar una asignación que no cambia nada.
      await tx
        .update(productionItems)
        .set({ shoppingId, updatedAt: new Date() })
        .where(inArray(productionItems.id, wanted))
    }

    return (await decorateShoppings(tx, [shopping]))[0] as ShoppingRecord
  })
}

/**
 * Da de baja una compra, y suelta lo que colgaba de ella.
 *
 * «Eliminar una compra SHALL dejar sin compra asignada a sus artículos, **sin eliminarlos**, y
 * SHALL eliminar sus facturas adjuntas.»
 *
 * Las dos cosas van escritas a mano porque la baja es **lógica**: `production_items.shopping_id`
 * declara `ON DELETE set null` y `production_attachments.shopping_id` declara `ON DELETE cascade`,
 * y **ninguna de las dos se dispara** contra un `UPDATE` que escribe `deleted_at`. Es la lección de
 * `HALLAZGOS.md` H-172 y H-203: toda cascada declarada sobre una tabla con borrado lógico es
 * decorativa.
 *
 * El orden importa: primero se sueltan los artículos y se borran las facturas, y **después** se da
 * de baja la compra. Al revés, un fallo a media transacción dejaría artículos apuntando a una
 * compra que ya nadie puede abrir.
 */
export async function deleteShopping(
  actor: Actor,
  companyId: string,
  productionId: string,
  shoppingId: string,
): Promise<void> {
  const released = await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await loadShopping(tx, productionId, shoppingId)

    // Los artículos **sobreviven**: se quedan en el inventario sin compra asignada.
    await tx
      .update(productionItems)
      .set({ shoppingId: null, updatedAt: new Date() })
      .where(eq(productionItems.shoppingId, shoppingId))

    const attachments = await tx
      .select({ uploadId: productionAttachments.uploadId })
      .from(productionAttachments)
      .where(eq(productionAttachments.shoppingId, shoppingId))

    await tx.delete(productionAttachments).where(eq(productionAttachments.shoppingId, shoppingId))

    await tx
      .update(productionShoppings)
      .set({ deletedAt: new Date() })
      .where(eq(productionShoppings.id, shoppingId))

    return releaseUploads(
      tx,
      attachments.map((row) => row.uploadId),
    )
  })

  await sweepObjects(released)
}

// ─── Adjuntos: comprobantes y facturas ───────────────────────────────────────

/** A qué cuelga un adjunto del presupuesto. Exactamente uno de los dos, nunca los dos. */
export type AttachmentOwner =
  | { readonly anchorId: string; readonly shoppingId: null }
  | { readonly anchorId: null; readonly shoppingId: string }

/**
 * Cuelga un archivo de un ancla o de una compra.
 *
 * Repetir el mismo archivo devuelve **el que ya estaba** en lugar de fallar: los comprobantes de un
 * ancla son un conjunto, no una cuenta. Es la misma decisión que en los adjuntos de una tarea.
 */
export async function attachToBudget(
  actor: Actor,
  companyId: string,
  productionId: string,
  owner: AttachmentOwner,
  uploadId: string,
): Promise<BudgetAttachment> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await assertOwnerExists(tx, productionId, owner)
    await assertUsableFiles(tx, companyId, [uploadId])

    const belongs =
      owner.anchorId === null
        ? eq(productionAttachments.shoppingId, owner.shoppingId)
        : eq(productionAttachments.anchorId, owner.anchorId)

    const [existing] = await tx
      .select()
      .from(productionAttachments)
      .where(and(belongs, eq(productionAttachments.uploadId, uploadId)))
      .limit(1)

    const row =
      existing ??
      (
        await tx
          .insert(productionAttachments)
          .values({
            id: newId(),
            anchorId: owner.anchorId,
            shoppingId: owner.shoppingId,
            uploadId,
          })
          .returning()
      )[0]

    if (!row) throw new Error("la inserción del adjunto no devolvió fila")
    return (await decorateAttachments(tx, [row]))[0] as BudgetAttachment
  })
}

/**
 * Retira un comprobante o una factura.
 *
 * La fila se borra de verdad —no tiene columna de baja lógica— y **después** se barre el archivo si
 * quedó sin referencias. El barrido va fuera de la transacción porque habla con el almacén de
 * objetos, que no participa de ella.
 */
export async function detachFromBudget(
  actor: Actor,
  companyId: string,
  productionId: string,
  owner: AttachmentOwner,
  attachmentId: string,
): Promise<void> {
  const released = await withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)
    await assertOwnerExists(tx, productionId, owner)

    const belongs =
      owner.anchorId === null
        ? eq(productionAttachments.shoppingId, owner.shoppingId)
        : eq(productionAttachments.anchorId, owner.anchorId)

    const [row] = await tx
      .select()
      .from(productionAttachments)
      .where(and(eq(productionAttachments.id, attachmentId), belongs))
      .limit(1)

    if (!row) throw new NotFoundError("El adjunto no existe")

    await tx.delete(productionAttachments).where(eq(productionAttachments.id, attachmentId))
    return releaseUploads(tx, [row.uploadId])
  })

  await sweepObjects(released)
}

// ─── La lectura del presupuesto ──────────────────────────────────────────────

/**
 * El presupuesto de una producción, derivado en el momento.
 *
 * Las dos colecciones llegan **completas y filtradas** —no paginadas—: el presupuesto es una vista
 * de conjunto, y una página de veinticuatro anclas cuya suma no es el total sería peor que no
 * enseñar la suma. Quien quiera recorrerlas de una en una tiene las dos colecciones paginadas al
 * lado.
 *
 * Los totales generales se calculan con **una consulta agregada por colección** y no recorriendo
 * filas: la producción entera puede tener miles de compras y el total no necesita ninguna de ellas.
 */
export async function readBudget(
  actor: Actor,
  companyId: string,
  productionId: string,
  anchors: ParsedQuery,
  shoppings: ParsedQuery,
): Promise<BudgetRecord> {
  return withRequester(actor, async (tx) => {
    await loadProduction(tx, companyId, productionId)

    const anchorWhere = and(
      eq(productionAnchors.productionId, productionId),
      isNull(productionAnchors.deletedAt),
      ...collectionConditions(anchors, anchorMapping),
    )

    const shoppingWhere = and(
      eq(productionShoppings.productionId, productionId),
      isNull(productionShoppings.deletedAt),
      ...collectionConditions(shoppings, shoppingMapping),
    )

    const [anchorRows, shoppingRows, overallAnchors, overallShoppings] = await Promise.all([
      tx
        .select()
        .from(productionAnchors)
        .where(anchorWhere)
        .orderBy(...collectionOrder(anchors, anchorMapping)),
      tx
        .select()
        .from(productionShoppings)
        .where(shoppingWhere)
        .orderBy(...collectionOrder(shoppings, shoppingMapping)),
      totalOf(tx, productionAnchors.amount, productionAnchors, anchorScope(productionId)),
      totalOf(tx, productionShoppings.amount, productionShoppings, shoppingScope(productionId)),
    ])

    const [anchorRecords, shoppingRecords] = await Promise.all([
      decorateAnchors(tx, anchorRows),
      decorateShoppings(tx, shoppingRows),
    ])

    return {
      anchors: anchorRecords,
      shoppings: shoppingRecords,
      filtered: budgetAmounts(anchorRecords, shoppingRecords),
      // Los generales no pasan por los registros: son dos sumas del motor.
      overall: budgetAmounts([{ amount: overallAnchors }], [{ amount: overallShoppings }]),
      categories: budgetByCategory(anchorRecords, shoppingRecords),
    }
  })
}

function anchorScope(productionId: string) {
  return and(eq(productionAnchors.productionId, productionId), isNull(productionAnchors.deletedAt))
}

function shoppingScope(productionId: string) {
  return and(
    eq(productionShoppings.productionId, productionId),
    isNull(productionShoppings.deletedAt),
  )
}

/**
 * La suma de una columna de dinero, hecha por el motor.
 *
 * `coalesce` porque `sum` de cero filas es nulo, y un nulo aquí acabaría siendo un `NaN` tres capas
 * más arriba. Sale como cadena decimal, que es como el dinero viaja en todo el sistema.
 */
async function totalOf(
  tx: Transaction,
  column: typeof productionAnchors.amount | typeof productionShoppings.amount,
  table: typeof productionAnchors | typeof productionShoppings,
  where: ReturnType<typeof and>,
): Promise<string> {
  const [row] = await tx
    .select({ value: sql<string>`coalesce(sum(${column}), 0)::text` })
    .from(table)
    .where(where)

  return row?.value ?? "0"
}

// ─── Lo que el documento necesita ────────────────────────────────────────────

/** Las dos colecciones enteras de una producción, sin filtros. Lo usa el documento. */
export async function budgetContents(
  tx: Transaction,
  productionId: string,
): Promise<{ anchors: AnchorRecord[]; shoppings: ShoppingRecord[] }> {
  const [anchorRows, shoppingRows] = await Promise.all([
    tx
      .select()
      .from(productionAnchors)
      .where(anchorScope(productionId))
      .orderBy(desc(productionAnchors.amount), asc(productionAnchors.id)),
    tx
      .select()
      .from(productionShoppings)
      .where(shoppingScope(productionId))
      .orderBy(asc(productionShoppings.occurredOn), asc(productionShoppings.createdAt)),
  ])

  const [anchors, shoppings] = await Promise.all([
    decorateAnchors(tx, anchorRows),
    decorateShoppings(tx, shoppingRows),
  ])

  return { anchors, shoppings }
}

// ─── Decoración ──────────────────────────────────────────────────────────────

async function decorateAnchors(
  tx: Transaction,
  rows: readonly (typeof productionAnchors.$inferSelect)[],
): Promise<AnchorRecord[]> {
  if (rows.length === 0) return []

  const [names, categories, attachments] = await Promise.all([
    userNames(
      tx,
      rows.map((row) => row.responsibleId),
    ),
    categoryNames(
      tx,
      rows.map((row) => row.categoryId),
    ),
    attachmentsOf(
      tx,
      productionAttachments.anchorId,
      rows.map((row) => row.id),
    ),
  ])

  return rows.map((row) => ({
    id: row.id,
    productionId: row.productionId,
    name: row.name,
    description: row.description,
    amount: row.amount,
    categoryId: row.categoryId,
    categoryName: row.categoryId === null ? null : (categories.get(row.categoryId) ?? null),
    responsibleId: row.responsibleId,
    responsibleName: row.responsibleId === null ? null : (names.get(row.responsibleId) ?? null),
    attachments: attachments.get(row.id) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

async function decorateShoppings(
  tx: Transaction,
  rows: readonly (typeof productionShoppings.$inferSelect)[],
): Promise<ShoppingRecord[]> {
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)

  const [names, categories, providers, items, attachments] = await Promise.all([
    userNames(
      tx,
      rows.map((row) => row.responsibleId),
    ),
    categoryNames(
      tx,
      rows.map((row) => row.categoryId),
    ),
    providerNames(
      tx,
      rows.map((row) => row.providerId),
    ),
    itemsOf(tx, ids),
    attachmentsOf(tx, productionAttachments.shoppingId, ids),
  ])

  return rows.map((row) => ({
    id: row.id,
    productionId: row.productionId,
    name: row.name,
    observations: row.observations,
    amount: row.amount,
    kind: row.kind,
    method: row.method,
    cardLast4: row.cardLast4,
    isDeductible: row.isDeductible,
    occurredOn: row.occurredOn,
    providerId: row.providerId,
    providerName: row.providerId === null ? null : (providers.get(row.providerId) ?? null),
    categoryId: row.categoryId,
    categoryName: row.categoryId === null ? null : (categories.get(row.categoryId) ?? null),
    responsibleId: row.responsibleId,
    responsibleName: row.responsibleId === null ? null : (names.get(row.responsibleId) ?? null),
    warehouseOrderId: row.warehouseOrderId,
    items: items.get(row.id) ?? [],
    attachments: attachments.get(row.id) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

async function decorateAttachments(
  tx: Transaction,
  rows: readonly (typeof productionAttachments.$inferSelect)[],
): Promise<BudgetAttachment[]> {
  if (rows.length === 0) return []

  const files = await tx
    .select({ id: uploads.id, url: uploads.url, fileName: uploads.fileName, kind: uploads.kind })
    .from(uploads)
    .where(
      inArray(
        uploads.id,
        rows.map((row) => row.uploadId),
      ),
    )

  const byId = new Map(files.map((file) => [file.id, file]))

  return rows.map((row) => {
    const file = byId.get(row.uploadId)
    return {
      id: row.id,
      uploadId: row.uploadId,
      name: file?.fileName ?? "",
      url: file?.url ?? "",
      kind: file?.kind ?? "file",
      createdAt: row.createdAt,
    }
  })
}

async function attachmentsOf(
  tx: Transaction,
  column: typeof productionAttachments.anchorId | typeof productionAttachments.shoppingId,
  ownerIds: readonly string[],
): Promise<Map<string, BudgetAttachment[]>> {
  const grouped = new Map<string, BudgetAttachment[]>()
  if (ownerIds.length === 0) return grouped

  const rows = await tx
    .select()
    .from(productionAttachments)
    .where(inArray(column, ownerIds))
    .orderBy(asc(productionAttachments.createdAt))

  const decorated = await decorateAttachments(tx, rows)

  rows.forEach((row, index) => {
    const owner = column === productionAttachments.anchorId ? row.anchorId : row.shoppingId
    const record = decorated[index]
    if (owner === null || record === undefined) return
    const bucket = grouped.get(owner)
    if (bucket) bucket.push(record)
    else grouped.set(owner, [record])
  })

  return grouped
}

/** Los artículos que incorporó cada compra del lote, en una consulta. */
async function itemsOf(
  tx: Transaction,
  shoppingIds: readonly string[],
): Promise<Map<string, ShoppingItem[]>> {
  const grouped = new Map<string, ShoppingItem[]>()
  if (shoppingIds.length === 0) return grouped

  const rows = await tx
    .select({
      shoppingId: productionItems.shoppingId,
      id: productionItems.id,
      name: productionItems.name,
      code: productionItems.code,
    })
    .from(productionItems)
    .where(and(inArray(productionItems.shoppingId, shoppingIds), isNull(productionItems.deletedAt)))
    .orderBy(asc(productionItems.name), asc(productionItems.id))

  for (const row of rows) {
    if (row.shoppingId === null) continue
    const bucket = grouped.get(row.shoppingId)
    const record = { id: row.id, name: row.name, code: row.code }
    if (bucket) bucket.push(record)
    else grouped.set(row.shoppingId, [record])
  }

  return grouped
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

async function userNames(
  tx: Transaction,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))]
  if (wanted.length === 0) return new Map()

  const rows = await tx
    .select({ id: users.id, name: users.name, lastname: users.lastname })
    .from(users)
    .where(inArray(users.id, wanted))

  return new Map(rows.map((row) => [row.id, [row.name, row.lastname].join(" ").trim()]))
}

async function categoryNames(
  tx: Transaction,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))]
  if (wanted.length === 0) return new Map()

  const rows = await tx
    .select({ id: productionCategories.id, name: productionCategories.name })
    .from(productionCategories)
    .where(inArray(productionCategories.id, wanted))

  return new Map(rows.map((row) => [row.id, row.name]))
}

async function providerNames(
  tx: Transaction,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))]
  if (wanted.length === 0) return new Map()

  const rows = await tx
    .select({ id: counterparties.id, alias: counterparties.alias })
    .from(counterparties)
    .where(inArray(counterparties.id, wanted))

  return new Map(rows.map((row) => [row.id, row.alias]))
}

function assertAmount(input: string): string {
  const trimmed = input.trim()
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new UnprocessableError("El importe no es válido")
  }
  return trimmed
}

/**
 * La identificación parcial sólo tiene sentido con tarjeta.
 *
 * Con cualquier otro método se guarda nulo, sin protestar: mandar cuatro dígitos junto a un pago en
 * efectivo es un formulario que no limpió su campo, no un intento de nada. Con tarjeta, el valor
 * pasa por `optionalPartialCardId`, que **no sabe** convertir un número completo.
 */
function assertCard(method: ShoppingMethod, input: string | null | undefined): string | null {
  if (method !== "card") return null
  try {
    return optionalPartialCardId(input)
  } catch {
    throw new UnprocessableError("De la tarjeta sólo se guardan los últimos cuatro dígitos")
  }
}

function optionalDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null || value === "") return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new UnprocessableError("La fecha no es válida")
  return parsed
}

/**
 * Que la categoría sea **de esta producción**.
 *
 * Resolver por identificador a secas dejaría clasificar una compra con la taxonomía de otra
 * empresa, que es la misma familia de fallo que la jornada rodando la escena ajena
 * (`HALLAZGOS.md` H-188).
 */
async function resolveCategory(
  tx: Transaction,
  productionId: string,
  categoryId: string | null,
): Promise<string | null> {
  if (categoryId === null) return null

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

  if (!row) throw new NotFoundError("La categoría no existe")
  return row.id
}

/** Y que el proveedor sea **de esta empresa**, y proveedor y no cliente. */
async function resolveProvider(
  tx: Transaction,
  companyId: string,
  providerId: string | null,
): Promise<string | null> {
  if (providerId === null) return null

  const [row] = await tx
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(
      and(
        eq(counterparties.id, providerId),
        eq(counterparties.companyId, companyId),
        eq(counterparties.role, "provider"),
        isNull(counterparties.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El proveedor no existe")
  return row.id
}

/**
 * Que los artículos sean **de esta producción**.
 *
 * Sin esto, componer una compra con el identificador de un artículo de otra producción se lo
 * llevaría: la columna admite cualquier artículo. Es la misma comprobación que hace la nota de
 * entrega al componer su lista.
 */
async function assertItemsOfProduction(
  tx: Transaction,
  productionId: string,
  itemIds: readonly string[],
): Promise<void> {
  if (itemIds.length === 0) return

  const rows = await tx
    .select({ id: productionItems.id })
    .from(productionItems)
    .where(
      and(
        inArray(productionItems.id, itemIds),
        eq(productionItems.productionId, productionId),
        isNull(productionItems.deletedAt),
      ),
    )

  if (rows.length !== itemIds.length) {
    throw new UnprocessableError("Algún artículo no es de esta producción")
  }
}

async function assertOwnerExists(
  tx: Transaction,
  productionId: string,
  owner: AttachmentOwner,
): Promise<void> {
  if (owner.anchorId === null) await loadShopping(tx, productionId, owner.shoppingId)
  else await loadAnchor(tx, productionId, owner.anchorId)
}

export async function loadAnchor(tx: Transaction, productionId: string, anchorId: string) {
  const [row] = await tx
    .select()
    .from(productionAnchors)
    .where(
      and(
        eq(productionAnchors.id, anchorId),
        eq(productionAnchors.productionId, productionId),
        isNull(productionAnchors.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("El ancla no existe")
  return row
}

export async function loadShopping(tx: Transaction, productionId: string, shoppingId: string) {
  const [row] = await tx
    .select()
    .from(productionShoppings)
    .where(
      and(
        eq(productionShoppings.id, shoppingId),
        eq(productionShoppings.productionId, productionId),
        isNull(productionShoppings.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La compra no existe")
  return row
}
