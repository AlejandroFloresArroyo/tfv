/**
 * Clientes y proveedores.
 *
 * Ver `openspec/specs/clients-and-providers/spec.md`.
 *
 * Con quién comercia una empresa, visto desde los dos lados del mostrador. Una contraparte puede
 * representar a otra empresa del sistema, a una persona del sistema, o a alguien externo del que
 * sólo se guardan datos sueltos — de ahí que convivan las referencias con la copia.
 *
 * ## El aprovisionamiento en pareja
 *
 * Cuando la empresa A le compra a la B se crean **dos** registros: un cliente en B que representa a
 * A, y un proveedor en A que representa a B. Y tiene que ser idempotente, porque la segunda compra
 * entre las mismas empresas no debe duplicar nada.
 *
 * La idempotencia **no se comprueba antes de escribir**: la garantiza un índice único parcial y se
 * escribe con resolución de conflicto. Comprobar y luego insertar deja una ventana entre las dos
 * cosas, y dos compras simultáneas —que es exactamente lo que pasa cuando alguien pulsa dos veces—
 * crearían dos parejas.
 */

import {
  buildPage,
  ConflictError,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
  UnprocessableError,
} from "@tfv/contracts"
import { db, type Transaction, withRequester, withSystem } from "@tfv/db"
import {
  type CounterpartySnapshot,
  companies,
  counterparties,
  users,
  warehouseOrders,
  warehouseQuotes,
} from "@tfv/db/schema"
import { and, count, eq, isNull, notInArray, or, sql } from "drizzle-orm"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import type { Actor } from "./companies.ts"

export type CounterpartyRole = "client" | "provider"

// La copia de datos la define el esquema: es su columna, y dos definiciones divergen.
export type { CounterpartySnapshot }

export interface CounterpartyRecord {
  readonly id: string
  readonly role: CounterpartyRole
  readonly alias: string
  readonly userId: string | null
  readonly counterpartyCompanyId: string | null
  readonly snapshot: CounterpartySnapshot
  readonly createdAt: Date
  readonly updatedAt: Date
}

// ─── Gestión desde la empresa ────────────────────────────────────────────────

/**
 * Qué se puede pedir de una cartera.
 *
 * El registro de búsqueda de la spec decía «alias, nombre y apellido del usuario». Media cartera no
 * tiene usuario —son externos, y ese es justo el caso que la entidad existe para admitir—, así que
 * buscar por el usuario dejaría fuera precisamente a quien no está en la plataforma. Se busca sobre
 * el alias y sobre los datos copiados, que es donde vive el nombre en los dos casos.
 *
 * Los datos copiados viven en una columna JSON, así que la búsqueda extrae cada campo con `->>`.
 * No es una consulta indexable; con carteras de cientos habrá que añadir un índice de expresión, y
 * `app.norm` se declaró inmutable precisamente para que ese día no haya que reescribir nada.
 */
export const counterpartyQuery: QuerySchema = {
  filters: {
    /** `?userId=null` responde «los que no están en la plataforma». */
    userId: { type: "id", label: "Cuenta" },
    counterpartyCompanyId: { type: "id", label: "Empresa" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["alias", "name", "lastname", "email", "companyName"],
  sortable: ["alias", "createdAt"],
  defaultSort: [{ field: "alias", direction: "asc" }],
}

const snapshotField = (key: string) => sql`${counterparties.snapshot} ->> ${key}`

const counterpartyMapping = {
  fields: {
    userId: counterparties.userId,
    counterpartyCompanyId: counterparties.counterpartyCompanyId,
    alias: counterparties.alias,
    createdAt: counterparties.createdAt,
  },
  searchable: [
    counterparties.alias,
    snapshotField("name"),
    snapshotField("lastname"),
    snapshotField("email"),
    snapshotField("companyName"),
  ],
  tiebreak: counterparties.id,
}

export async function listCounterparties(
  actor: Actor,
  companyId: string,
  role: CounterpartyRole,
  query: ParsedQuery,
): Promise<Page<CounterpartyRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)

    // El papel **no** es un filtro de la gramática: es una colección distinta, con su propio
    // permiso. Que se pudiera cambiar desde la URL convertiría el permiso de proveedores en la
    // llave de la cartera de clientes.
    const where = and(
      eq(counterparties.companyId, companyId),
      eq(counterparties.role, role),
      isNull(counterparties.deletedAt),
      ...collectionConditions(query, counterpartyMapping),
    )

    const [total] = await tx.select({ value: count() }).from(counterparties).where(where)

    const rows = await tx
      .select()
      .from(counterparties)
      .where(where)
      .orderBy(...collectionOrder(query, counterpartyMapping))
      .limit(limit)
      .offset(offset)

    return buildPage(rows.map(toRecord), total?.value ?? 0, page, limit)
  })
}

export interface CreateCounterpartyInput {
  readonly role: CounterpartyRole
  readonly alias: string
  /** Correo de quien representa, si está en el sistema. Sin él, es una contraparte externa. */
  readonly email?: string | undefined
  readonly snapshot?: CounterpartySnapshot | undefined
}

/**
 * Da de alta una contraparte a mano.
 *
 * Si el correo corresponde a una cuenta, la contraparte queda **atada** a ella; si no, se guarda
 * como externa con sus datos copiados. Las dos son válidas: media cartera de clientes de una casa
 * de renta no tiene cuenta en la plataforma, y obligar a crearla para poder facturarles convertiría
 * un alta en un trámite.
 */
export async function createCounterparty(
  actor: Actor,
  companyId: string,
  input: CreateCounterpartyInput,
): Promise<CounterpartyRecord> {
  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)

    const email = input.email?.trim().toLowerCase()
    const userId = email ? await findUserId(email) : null

    if (userId) {
      const [existing] = await tx
        .select({ id: counterparties.id })
        .from(counterparties)
        .where(
          and(
            eq(counterparties.companyId, companyId),
            eq(counterparties.role, input.role),
            eq(counterparties.userId, userId),
            isNull(counterparties.counterpartyCompanyId),
            isNull(counterparties.deletedAt),
          ),
        )
        .limit(1)

      if (existing) throw new ConflictError("Esa contraparte ya está dada de alta")
    }

    const [created] = await tx
      .insert(counterparties)
      .values({
        id: newId(),
        companyId,
        role: input.role,
        alias: input.alias.trim(),
        userId,
        snapshot: { ...(email ? { email } : {}), ...input.snapshot },
      })
      .returning()

    if (!created) throw new Error("la inserción de la contraparte no devolvió fila")
    return toRecord(created)
  })
}

export interface UpdateCounterpartyInput {
  readonly alias?: string | undefined
  readonly snapshot?: CounterpartySnapshot | undefined
}

export async function updateCounterparty(
  actor: Actor,
  companyId: string,
  counterpartyId: string,
  input: UpdateCounterpartyInput,
): Promise<CounterpartyRecord> {
  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    const current = await loadCounterparty(tx, companyId, counterpartyId)

    const patch: Record<string, unknown> = {}
    if (input.alias !== undefined) patch.alias = input.alias.trim()
    // La copia se funde, no se sustituye: una edición parcial no debe borrar el resto de los datos.
    if (input.snapshot !== undefined) patch.snapshot = { ...current.snapshot, ...input.snapshot }

    if (Object.keys(patch).length === 0) return toRecord(current)

    const [updated] = await tx
      .update(counterparties)
      .set(patch)
      .where(eq(counterparties.id, counterpartyId))
      .returning()

    if (!updated) throw new NotFoundError("La contraparte no existe")
    return toRecord(updated)
  })
}

/**
 * Da de baja una contraparte.
 *
 * **Borrado lógico**, porque su nombre aparece en cotizaciones y pedidos ya emitidos: borrarla de
 * verdad dejaría documentos históricos apuntando al vacío.
 *
 * La comprobación de «no se elimina si está en uso» llega con los documentos que la usarían —
 * cotizaciones (14) y pedidos (15)—. Hasta entonces no hay nada que consultar, y fingir la
 * comprobación sería peor que declararla pendiente.
 */
/**
 * Da de baja una contraparte.
 *
 * **No se da de baja con documentos vigentes.** Una cotización abierta o un pedido en curso nombran
 * a su cliente, y borrarlo deja documentos con consecuencias apuntando a una ficha que ya no está:
 * quien los mire dentro de seis meses no sabrá con quién se comerció.
 *
 * Los documentos **cerrados no cuentan**: una venta de hace dos años no debe impedir limpiar la
 * cartera, y su copia de los datos del cliente vive en el propio documento.
 *
 * Esta comprobación estuvo declarada como pendiente desde la rebanada 10, cuando no existía nada
 * que consultar. Fingirla entonces habría sido peor que declararla.
 */
export async function deleteCounterparty(
  actor: Actor,
  companyId: string,
  counterpartyId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)
    await loadCounterparty(tx, companyId, counterpartyId)

    const live = await liveDocuments(tx, counterpartyId)
    if (live.quotes + live.orders > 0) {
      throw new UnprocessableError(
        `Esta contraparte figura en ${describe(live)}. Cierra o reasigna esos documentos antes ` +
          "de darla de baja.",
      )
    }

    await tx
      .update(counterparties)
      .set({ deletedAt: new Date() })
      .where(eq(counterparties.id, counterpartyId))
  })
}

/** Cotizaciones y pedidos **abiertos** que nombran a la contraparte. */
async function liveDocuments(
  tx: Transaction,
  counterpartyId: string,
): Promise<{ quotes: number; orders: number }> {
  const [quotes] = await tx
    .select({ value: count() })
    .from(warehouseQuotes)
    .where(
      and(
        eq(warehouseQuotes.clientId, counterpartyId),
        notInArray(warehouseQuotes.status, ["completed", "sold", "canceled"]),
        isNull(warehouseQuotes.deletedAt),
      ),
    )

  const [orders] = await tx
    .select({ value: count() })
    .from(warehouseOrders)
    .where(
      and(
        or(
          eq(warehouseOrders.clientId, counterpartyId),
          eq(warehouseOrders.providerId, counterpartyId),
        ),
        notInArray(warehouseOrders.status, ["finished", "canceled"]),
        isNull(warehouseOrders.deletedAt),
      ),
    )

  return { quotes: quotes?.value ?? 0, orders: orders?.value ?? 0 }
}

/** «dos cotizaciones y un pedido abiertos», para que el mensaje diga qué mirar. */
function describe(live: { quotes: number; orders: number }): string {
  const parts: string[] = []
  if (live.quotes > 0) {
    parts.push(
      live.quotes === 1 ? "una cotización abierta" : `${live.quotes} cotizaciones abiertas`,
    )
  }
  if (live.orders > 0) {
    parts.push(live.orders === 1 ? "un pedido en curso" : `${live.orders} pedidos en curso`)
  }
  return parts.join(" y ")
}

// ─── Aprovisionamiento automático ────────────────────────────────────────────

/**
 * Registra la relación entre dos empresas, en los dos sentidos y de una vez.
 *
 * La llaman las operaciones entre arrendatarios —la compra de una producción a un almacén, la
 * materialización de un pedido— y **no la pide nadie a mano**: es consecuencia de comerciar, no una
 * acción de nadie.
 *
 * Por eso corre con la vía de sistema y no con la del solicitante: escribe en **dos** empresas, y
 * quien realiza la compra sólo pertenece a una. El alcance se declara explícito, así que las
 * políticas siguen aplicándose y escribir en una tercera empresa fallaría.
 */
export async function provisionPair(
  seller: { readonly companyId: string; readonly name: string },
  buyer: { readonly companyId: string; readonly name: string },
): Promise<void> {
  await withSystem("aprovisionar_contrapartes", [seller.companyId, buyer.companyId], async (tx) => {
    // Un cliente en la vendedora que representa a la compradora…
    await upsertPair(tx, seller.companyId, "client", buyer)
    // …y un proveedor en la compradora que representa a la vendedora.
    await upsertPair(tx, buyer.companyId, "provider", seller)
  })
}

async function upsertPair(
  tx: Transaction,
  ownerCompanyId: string,
  role: CounterpartyRole,
  other: { readonly companyId: string; readonly name: string },
): Promise<void> {
  await tx
    .insert(counterparties)
    .values({
      id: newId(),
      companyId: ownerCompanyId,
      role,
      alias: other.name,
      counterpartyCompanyId: other.companyId,
      snapshot: { companyName: other.name },
    })
    // La idempotencia la garantiza el índice único parcial, no una comprobación previa. Repetir la
    // compra reutiliza la contraparte sin tocarla.
    .onConflictDoNothing()
}

/**
 * Registra a un comprador de tienda pública como cliente de la empresa.
 *
 * Misma idea que la pareja, con una sola dirección: quien compra en la tienda de una empresa pasa a
 * ser su cliente, y una segunda compra no crea otro.
 */
export async function provisionBuyer(
  companyId: string,
  buyer: { readonly userId: string; readonly alias: string; readonly email?: string },
): Promise<void> {
  await withSystem("registrar_comprador", [companyId], async (tx) => {
    await tx
      .insert(counterparties)
      .values({
        id: newId(),
        companyId,
        role: "client",
        alias: buyer.alias,
        userId: buyer.userId,
        snapshot: buyer.email ? { email: buyer.email } : {},
      })
      .onConflictDoNothing()
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/**
 * Busca la cuenta de un correo.
 *
 * **Fuera de la transacción del solicitante**, y es deliberado: quien se da de alta como cliente no
 * comparte empresa con quien lo da de alta, así que las políticas ocultan su fila y la consulta
 * saldría vacía. Es la misma situación que al incorporar a un miembro.
 *
 * Sólo sale de aquí el identificador. Ningún dato del perfil ajeno cruza esta función; lo único que
 * revela es si ese correo tiene cuenta, y eso ya lo sabe quien lo está escribiendo.
 */
async function findUserId(email: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1)

  return user?.id ?? null
}

async function assertCompany(tx: Transaction, companyId: string): Promise<void> {
  const [company] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
    .limit(1)

  if (!company) throw new NotFoundError("La empresa no existe")
}

async function loadCounterparty(tx: Transaction, companyId: string, counterpartyId: string) {
  const [row] = await tx
    .select()
    .from(counterparties)
    .where(
      and(
        eq(counterparties.id, counterpartyId),
        eq(counterparties.companyId, companyId),
        isNull(counterparties.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La contraparte no existe")
  return row
}

function toRecord(row: typeof counterparties.$inferSelect): CounterpartyRecord {
  return {
    id: row.id,
    role: row.role,
    alias: row.alias,
    userId: row.userId,
    counterpartyCompanyId: row.counterpartyCompanyId,
    snapshot: row.snapshot,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
