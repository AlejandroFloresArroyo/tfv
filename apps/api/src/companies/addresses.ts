/**
 * Libretas de direcciones.
 *
 * Ver `openspec/specs/addresses/spec.md`.
 *
 * Dos libretas con el mismo comportamiento y distinto dueño: la de un usuario y la de una empresa.
 * Comparten columnas y reglas, así que comparten código; lo único que cambia es de quién cuelgan y
 * quién puede tocarlas.
 *
 * ## La regla de la primaria
 *
 * «Como máximo una primaria por libreta» **lo garantiza el motor**, con un índice único parcial
 * sobre las filas marcadas. La aplicación no puede dejar dos aunque se equivoque: la segunda
 * inserción falla.
 *
 * Lo que sí hace la aplicación son las tres consecuencias de esa regla, y las tres van **dentro de
 * la misma transacción** que la escritura que las provoca:
 *
 * - la primera dirección de una libreta vacía nace primaria;
 * - marcar una desmarca la anterior;
 * - eliminar la primaria promueve a otra, de forma determinista.
 *
 * Fuera de la transacción, entre desmarcar y marcar hay un instante sin primaria — y ese instante
 * es el que usa el cálculo de envío para decidir que no hay origen.
 */

import { NotFoundError, newId } from "@tfv/contracts"
import { type Transaction, withRequester } from "@tfv/db"
import { companies, companyAddresses, userAddresses } from "@tfv/db/schema"
import { and, asc, eq, isNull, ne } from "drizzle-orm"
import type { Actor } from "./companies.ts"

export interface AddressInput {
  readonly label?: string | undefined
  readonly street?: string | undefined
  readonly number?: string | undefined
  readonly colony?: string | undefined
  readonly city?: string | undefined
  readonly state?: string | undefined
  readonly country?: string | undefined
  readonly countryCode?: string | undefined
  readonly postalCode?: string | undefined
  readonly latitude?: string | null | undefined
  readonly longitude?: string | null | undefined
  readonly isPrimary?: boolean | undefined
}

export interface AddressRecord {
  readonly id: string
  readonly label: string
  readonly street: string
  readonly number: string
  readonly colony: string
  readonly city: string
  readonly state: string
  readonly country: string
  readonly countryCode: string
  readonly postalCode: string
  readonly latitude: string | null
  readonly longitude: string | null
  readonly isPrimary: boolean
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Qué libreta se está tocando.
 *
 * Las dos tablas son gemelas, así que en lugar de duplicar cada operación se pasa cuál y por dónde
 * se filtra. Duplicarlas dejaría dos sitios donde arreglar la regla de la primaria.
 */
type Book =
  | { readonly kind: "user"; readonly userId: string }
  | { readonly kind: "company"; readonly companyId: string }

function tableOf(book: Book) {
  return book.kind === "user" ? userAddresses : companyAddresses
}

function ownerFilter(book: Book) {
  return book.kind === "user"
    ? eq(userAddresses.userId, book.userId)
    : eq(companyAddresses.companyId, book.companyId)
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function listAddresses(actor: Actor, book: Book): Promise<AddressRecord[]> {
  return withRequester(actor, async (tx) => {
    if (book.kind === "company") await assertCompany(tx, book.companyId)

    // La primaria primero: es la que casi siempre se busca, y así el listado no obliga a leerlo
    // entero para encontrarla.
    const rows = await tx
      .select()
      .from(tableOf(book))
      .where(ownerFilter(book))
      .orderBy(asc(tableOf(book).createdAt))

    return rows.map(toRecord).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  })
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export async function createAddress(
  actor: Actor,
  book: Book,
  input: AddressInput,
): Promise<AddressRecord> {
  return withRequester(actor, async (tx) => {
    if (book.kind === "company") await assertCompany(tx, book.companyId)

    const table = tableOf(book)
    const existing = await tx.select({ id: table.id }).from(table).where(ownerFilter(book)).limit(1)

    // «La primera dirección se marca sola»: una libreta vacía no puede quedarse sin primaria por
    // olvidar la casilla.
    const isPrimary = input.isPrimary === true || existing.length === 0

    if (isPrimary) await clearPrimary(tx, book, null)

    const id = newId()
    const [created] = await tx
      .insert(table)
      .values({
        id,
        ...(book.kind === "user" ? { userId: book.userId } : { companyId: book.companyId }),
        ...columnsOf(input),
        isPrimary,
      })
      .returning()

    if (!created) throw new Error("la inserción de la dirección no devolvió fila")
    return toRecord(created)
  })
}

export async function updateAddress(
  actor: Actor,
  book: Book,
  addressId: string,
  input: AddressInput,
): Promise<AddressRecord> {
  return withRequester(actor, async (tx) => {
    if (book.kind === "company") await assertCompany(tx, book.companyId)

    const table = tableOf(book)
    const current = await loadAddress(tx, book, addressId)

    // Desmarcar la anterior **antes** de marcar ésta: al revés, el índice único rechazaría la
    // segunda primaria y la operación fallaría con un error del motor en lugar de funcionar.
    if (input.isPrimary === true && !current.isPrimary) await clearPrimary(tx, book, addressId)

    const patch = {
      ...columnsOf(input),
      // Quitar la marca a mano dejaría la libreta sin primaria. Para cambiarla se marca otra.
      ...(input.isPrimary === true ? { isPrimary: true } : {}),
    }

    if (Object.keys(patch).length === 0) return toRecord(current)

    const [updated] = await tx.update(table).set(patch).where(eq(table.id, addressId)).returning()
    if (!updated) throw new NotFoundError("La dirección no existe")

    return toRecord(updated)
  })
}

/**
 * Elimina una dirección y, si era la primaria, promueve otra.
 *
 * La sustituta es **la más antigua de las que quedan**, no una cualquiera: la spec pide que sea
 * determinista, y con un criterio arbitrario dos ejecuciones sobre los mismos datos darían libretas
 * distintas.
 */
export async function deleteAddress(actor: Actor, book: Book, addressId: string): Promise<void> {
  await withRequester(actor, async (tx) => {
    if (book.kind === "company") await assertCompany(tx, book.companyId)

    const table = tableOf(book)
    const current = await loadAddress(tx, book, addressId)

    await tx.delete(table).where(eq(table.id, addressId))

    if (!current.isPrimary) return

    const [heir] = await tx
      .select({ id: table.id })
      .from(table)
      .where(ownerFilter(book))
      .orderBy(asc(table.createdAt))
      .limit(1)

    // Sin herederas, la libreta queda vacía y sin primaria. Es un estado válido.
    if (heir) await tx.update(table).set({ isPrimary: true }).where(eq(table.id, heir.id))
  })
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

/**
 * Retira la marca de primaria de la libreta.
 *
 * `except` evita tocar la fila que va a quedarse con la marca, que si no perdería la suya en el
 * mismo movimiento.
 */
async function clearPrimary(tx: Transaction, book: Book, except: string | null): Promise<void> {
  const table = tableOf(book)

  await tx
    .update(table)
    .set({ isPrimary: false })
    .where(
      and(ownerFilter(book), eq(table.isPrimary, true), ...(except ? [ne(table.id, except)] : [])),
    )
}

async function loadAddress(tx: Transaction, book: Book, addressId: string) {
  const table = tableOf(book)

  const [address] = await tx
    .select()
    .from(table)
    .where(and(eq(table.id, addressId), ownerFilter(book)))
    .limit(1)

  // Una dirección de otra libreta responde igual que una inexistente: distinguirlas confirmaría
  // que existe, y una libreta ajena no es asunto de quien pregunta.
  if (!address) throw new NotFoundError("La dirección no existe")
  return address
}

async function assertCompany(tx: Transaction, companyId: string): Promise<void> {
  const [company] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
    .limit(1)

  if (!company) throw new NotFoundError("La empresa no existe")
}

/** Sólo las columnas que llegan. Un `undefined` significa «no lo toques», no «bórralo». */
function columnsOf(input: AddressInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  if (input.label !== undefined) patch.label = input.label.trim()
  if (input.street !== undefined) patch.street = input.street.trim()
  if (input.number !== undefined) patch.number = input.number.trim()
  if (input.colony !== undefined) patch.colony = input.colony.trim()
  if (input.city !== undefined) patch.city = input.city.trim()
  if (input.state !== undefined) patch.state = input.state.trim()
  if (input.country !== undefined) patch.country = input.country.trim()
  if (input.countryCode !== undefined) patch.countryCode = input.countryCode.trim().toUpperCase()
  if (input.postalCode !== undefined) patch.postalCode = input.postalCode.trim()
  if (input.latitude !== undefined) patch.latitude = input.latitude
  if (input.longitude !== undefined) patch.longitude = input.longitude

  return patch
}

/**
 * Las dos tablas son gemelas en todo salvo su columna de dueño, y aquí sólo se leen las comunes.
 * Escribir el tipo como el de una de ellas obligaría a convertir en cada llamada; nombrar lo que
 * de verdad se usa deja que las dos encajen.
 */
type AddressColumns = Omit<typeof companyAddresses.$inferSelect, "companyId">

function toRecord(row: AddressColumns): AddressRecord {
  return {
    id: row.id,
    label: row.label,
    street: row.street,
    number: row.number,
    colony: row.colony,
    city: row.city,
    state: row.state,
    country: row.country,
    countryCode: row.countryCode,
    postalCode: row.postalCode,
    latitude: row.latitude,
    longitude: row.longitude,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export type { Book as AddressBook }
