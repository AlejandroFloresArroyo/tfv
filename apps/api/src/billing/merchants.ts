/**
 * Perfiles de facturación y alta de comercio.
 *
 * Ver `openspec/specs/merchant-onboarding/spec.md` y la rebanada 11.
 *
 * Éste es el **otro** flujo de dinero: lo que una empresa le cobra a sus propios compradores. El
 * modelo es de cargo con destino —el comprador paga a la plataforma, la plataforma retiene su
 * comisión y transfiere el resto—, así que sin cuenta de comercio registrada no hay a dónde
 * transferir y la tienda pública no puede vender.
 *
 * ## La regla que se olvida
 *
 * Una empresa puede tener varios perfiles, y **sólo el primario cobra**. Un perfil activo que no
 * sea el primario no habilita nada, y la spec le dedica un escenario entero porque es la clase de
 * cosa que parece funcionar hasta que alguien marca otro como primario y las ventas se paran.
 *
 * ## El orden importa
 *
 * El alta ante el procesador ocurre **antes** de escribir nada. Si falla, no queda perfil a medias:
 * es el escenario «un fallo del procesador no deja el perfil a medias», y la única forma de
 * cumplirlo es no haber escrito todavía.
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
import {
  CHARGING_MERCHANT_STATUSES,
  isOfLegalAge,
  type MerchantStatus,
} from "@tfv/contracts/billing"
import { db, withRequester } from "@tfv/db"
import {
  type MerchantBank,
  type MerchantBusiness,
  type MerchantRepresentative,
  merchantPayments,
  merchantProfiles,
} from "@tfv/db/schema"
import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm"
import { env } from "../env.ts"
import { collectionConditions, collectionOrder, windowOf } from "../runtime/collection.ts"
import { paymentProvider } from "./provider.ts"
import type { Actor } from "./subscriptions.ts"

// ─── Lo que sale ─────────────────────────────────────────────────────────────

export interface MerchantProfileRecord {
  readonly id: string
  readonly alias: string
  readonly addressId: string | null
  readonly business: MerchantBusiness
  readonly bank: MerchantBank
  readonly representative: MerchantRepresentative
  readonly status: MerchantStatus
  readonly verificationStatus: "pending" | "verified" | "disabled"
  readonly canAcceptCharges: boolean
  readonly canReceivePayouts: boolean
  readonly isPrimary: boolean
  readonly externalAccountId: string | null
  readonly termsAcceptedAt: Date | null
  readonly notes: string | null
  readonly createdAt: Date
}

/**
 * Lo que la tienda pública puede saber.
 *
 * **Sin datos fiscales ni bancarios.** La spec lo pide con esas palabras: quien pregunta desde una
 * tienda sólo necesita saber si se puede cobrar, y darle la razón social y la CLABE de la empresa
 * sería filtrar sus datos a cualquiera que abra el escaparate.
 */
export interface OperatingProfile {
  readonly exists: boolean
  readonly canCharge: boolean
  readonly status: MerchantStatus | null
  readonly verificationStatus: "pending" | "verified" | "disabled" | null
}

// ─── Consulta ────────────────────────────────────────────────────────────────

export const merchantProfileQuery: QuerySchema = {
  filters: {
    status: { type: "enum", values: ["pending", "limited", "active", "inactive"], label: "Estado" },
    isPrimary: { type: "boolean", label: "Primario" },
    createdAt: { type: "date", range: true, label: "Alta" },
  },
  searchable: ["alias"],
  sortable: ["alias", "createdAt"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
}

const profileMapping = {
  fields: {
    status: merchantProfiles.status,
    isPrimary: merchantProfiles.isPrimary,
    alias: merchantProfiles.alias,
    createdAt: merchantProfiles.createdAt,
  },
  searchable: [merchantProfiles.alias],
  tiebreak: merchantProfiles.id,
}

export async function listProfiles(
  actor: Actor,
  companyId: string,
  query: ParsedQuery,
): Promise<Page<MerchantProfileRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    const where = and(
      eq(merchantProfiles.companyId, companyId),
      isNull(merchantProfiles.deletedAt),
      ...collectionConditions(query, profileMapping),
    )

    const [total] = await tx.select({ value: count() }).from(merchantProfiles).where(where)

    const rows = await tx
      .select()
      .from(merchantProfiles)
      .where(where)
      .orderBy(...collectionOrder(query, profileMapping))
      .limit(limit)
      .offset(offset)

    return buildPage(rows.map(toRecord), total?.value ?? 0, page, limit)
  })
}

// ─── Alta ────────────────────────────────────────────────────────────────────

export interface CreateProfileInput {
  readonly alias: string
  readonly addressId?: string | undefined
  readonly business: MerchantBusiness
  readonly bank: MerchantBank
  readonly representative: MerchantRepresentative
}

/**
 * Crea un perfil y da de alta su cuenta de comercio.
 *
 * Las dos validaciones que la spec exige **antes** de hablar con el procesador —CLABE de dieciocho
 * dígitos y representante mayor de edad— se comprueban aquí aunque el esquema de entrada ya las
 * mire: el esquema protege la ruta HTTP, y esta función también la llama el asistente por pasos y
 * cualquier cosa que venga después.
 *
 * El primer perfil de una empresa queda primario automáticamente. Sin eso, dar de alta el primero y
 * olvidarse de marcarlo dejaría la tienda sin cobrar por una casilla que nadie sabía que existía.
 */
export async function createProfile(
  actor: Actor,
  companyId: string,
  input: CreateProfileInput,
  origin: { readonly ip: string },
): Promise<MerchantProfileRecord> {
  assertBank(input.bank)
  assertRepresentative(input.representative)

  const existing = await db
    .select({ id: merchantProfiles.id })
    .from(merchantProfiles)
    .where(and(eq(merchantProfiles.companyId, companyId), isNull(merchantProfiles.deletedAt)))
    .limit(1)

  const isFirst = existing.length === 0
  const termsAcceptedAt = new Date()

  // Primero el procesador. Si falla, no hay perfil a medias que limpiar después.
  const account = await paymentProvider().createConnectedAccount({
    companyId,
    legalName: input.business.legalName,
    taxId: input.business.taxId,
    ...(input.business.email === undefined ? {} : { email: input.business.email }),
    clabe: input.bank.clabe,
    currency: input.bank.currency,
    country: input.bank.country,
    holder: input.bank.holder,
    termsAcceptedAt,
    termsAcceptedIp: origin.ip,
  })

  const id = newId()

  await withRequester(actor, async (tx) => {
    await tx.insert(merchantProfiles).values({
      id,
      companyId,
      alias: input.alias,
      ...(input.addressId === undefined ? {} : { addressId: input.addressId }),
      business: input.business,
      bank: input.bank,
      representative: input.representative,
      // Limitado tras el alta, no activo: lo dice la spec, y es lo honesto — el procesador todavía
      // no ha confirmado que la cuenta pueda operar plenamente.
      status: "limited",
      verificationStatus: account.requirementsPending ? "pending" : "verified",
      canAcceptCharges: account.canAcceptCharges,
      canReceivePayouts: account.canReceivePayouts,
      isPrimary: isFirst,
      externalAccountId: account.id,
      termsAcceptedAt,
      termsAcceptedIp: origin.ip,
    })
  })

  return requireProfile(actor, companyId, id)
}

// ─── Modificación ────────────────────────────────────────────────────────────

export interface UpdateProfileInput {
  readonly alias?: string | undefined
  readonly addressId?: string | null | undefined
  readonly business?: MerchantBusiness | undefined
  readonly bank?: MerchantBank | undefined
  readonly representative?: MerchantRepresentative | undefined
  readonly notes?: string | null | undefined
}

/**
 * Modifica un perfil y propaga al procesador lo que le afecta.
 *
 * Sólo se le habla al procesador cuando cambia algo que él conoce —datos del negocio o cuenta
 * bancaria—. Renombrar el alias es cosa de aquí, y mandarlo fuera sería una llamada de red por un
 * campo que allí no existe.
 */
export async function updateProfile(
  actor: Actor,
  companyId: string,
  profileId: string,
  input: UpdateProfileInput,
): Promise<MerchantProfileRecord> {
  const current = await requireProfile(actor, companyId, profileId)

  if (input.bank) assertBank(input.bank)
  if (input.representative) assertRepresentative(input.representative)

  const business = input.business ?? current.business
  const bank = input.bank ?? current.bank

  const touchesProcessor = input.business !== undefined || input.bank !== undefined
  if (touchesProcessor && current.externalAccountId) {
    await paymentProvider().updateConnectedAccount(current.externalAccountId, {
      companyId,
      legalName: business.legalName,
      taxId: business.taxId,
      ...(business.email === undefined ? {} : { email: business.email }),
      clabe: bank.clabe,
      currency: bank.currency,
      country: bank.country,
      holder: bank.holder,
      termsAcceptedAt: current.termsAcceptedAt ?? new Date(),
      termsAcceptedIp: "",
    })
  }

  await withRequester(actor, async (tx) => {
    await tx
      .update(merchantProfiles)
      .set({
        ...(input.alias === undefined ? {} : { alias: input.alias }),
        ...(input.addressId === undefined ? {} : { addressId: input.addressId }),
        ...(input.business === undefined ? {} : { business: input.business }),
        ...(input.bank === undefined ? {} : { bank: input.bank }),
        ...(input.representative === undefined ? {} : { representative: input.representative }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      })
      .where(eq(merchantProfiles.id, profileId))
  })

  return requireProfile(actor, companyId, profileId)
}

/**
 * Marca un perfil como primario y desmarca el anterior.
 *
 * Las dos escrituras van en la misma transacción y **en ese orden**: el índice único parcial de la
 * tabla no admite dos primarios, así que marcar antes de desmarcar fallaría siempre.
 */
export async function setPrimaryProfile(
  actor: Actor,
  companyId: string,
  profileId: string,
): Promise<MerchantProfileRecord> {
  await requireProfile(actor, companyId, profileId)

  await withRequester(actor, async (tx) => {
    await tx
      .update(merchantProfiles)
      .set({ isPrimary: false })
      .where(
        and(
          eq(merchantProfiles.companyId, companyId),
          eq(merchantProfiles.isPrimary, true),
          ne(merchantProfiles.id, profileId),
        ),
      )

    await tx
      .update(merchantProfiles)
      .set({ isPrimary: true })
      .where(eq(merchantProfiles.id, profileId))
  })

  return requireProfile(actor, companyId, profileId)
}

// ─── Baja ────────────────────────────────────────────────────────────────────

/** Los estados en los que hay dinero en camino que todavía no se ha liquidado. */
const IN_FLIGHT = ["created", "requires_action", "processing", "disputed"] as const

/**
 * Da de baja un perfil, su cuenta de comercio y, si era el primario, promueve a otro.
 *
 * No se puede borrar con **transferencias pendientes de liquidar**: la cuenta de destino
 * desaparecería con dinero en camino hacia ella, y ese dinero no tendría a dónde llegar ni forma de
 * reclamarse.
 */
export async function deleteProfile(
  actor: Actor,
  companyId: string,
  profileId: string,
): Promise<void> {
  const current = await requireProfile(actor, companyId, profileId)

  const [pending] = await db
    .select({ value: count() })
    .from(merchantPayments)
    .where(
      and(
        eq(merchantPayments.merchantProfileId, profileId),
        inArray(merchantPayments.status, [...IN_FLIGHT]),
      ),
    )

  if ((pending?.value ?? 0) > 0) {
    throw new ConflictError(
      `Este perfil tiene ${pending?.value} cobro(s) sin liquidar. Espera a que se cierren antes de darlo de baja.`,
    )
  }

  if (current.externalAccountId) {
    await paymentProvider().deleteConnectedAccount(current.externalAccountId)
  }

  await withRequester(actor, async (tx) => {
    await tx
      .update(merchantProfiles)
      .set({ deletedAt: new Date(), isPrimary: false })
      .where(eq(merchantProfiles.id, profileId))

    if (!current.isPrimary) return

    // Al irse el primario, alguien tiene que cobrar. Se promueve el más antiguo de los que quedan,
    // que es el criterio menos sorprendente: el que llevaba más tiempo operando.
    const [heir] = await tx
      .select({ id: merchantProfiles.id })
      .from(merchantProfiles)
      .where(and(eq(merchantProfiles.companyId, companyId), isNull(merchantProfiles.deletedAt)))
      .orderBy(asc(merchantProfiles.createdAt))
      .limit(1)

    if (heir) {
      await tx
        .update(merchantProfiles)
        .set({ isPrimary: true })
        .where(eq(merchantProfiles.id, heir.id))
    }
  })
}

// ─── Verificación ────────────────────────────────────────────────────────────

/**
 * Enlace al formulario del procesador para completar la documentación.
 *
 * Vuelve a la pantalla de facturación de la empresa, que es lo que la spec pide: dejar a alguien en
 * la portada del procesador tras entregar sus papeles es perderlo.
 */
export async function verificationLink(
  actor: Actor,
  companyId: string,
  profileId: string,
): Promise<{ readonly url: string }> {
  const profile = await requireProfile(actor, companyId, profileId)

  if (!profile.externalAccountId) {
    throw new UnprocessableError(
      "Este perfil todavía no tiene cuenta de comercio, así que no hay nada que verificar",
    )
  }

  const back = `${env.BILLING_RETURN_ORIGIN}/c/${companyId}/settings/billing`
  return paymentProvider().createAccountLink({
    accountId: profile.externalAccountId,
    returnUrl: back,
    refreshUrl: back,
  })
}

// ─── El perfil operativo ─────────────────────────────────────────────────────

/**
 * Cuál es el perfil con el que esta empresa puede cobrar.
 *
 * Tres condiciones a la vez: **primario**, en estado activo o limitado, y con cuenta de comercio
 * registrada. Faltando una sola, no se cobra — y la que más se olvida es la primera.
 *
 * No usa `withRequester`: la consulta la hace también la tienda pública, que no tiene sesión. Lo que
 * la protege es lo que devuelve, que no incluye ni un dato fiscal ni bancario.
 */
export async function operatingProfile(companyId: string): Promise<OperatingProfile> {
  const [row] = await db
    .select({
      status: merchantProfiles.status,
      verificationStatus: merchantProfiles.verificationStatus,
      externalAccountId: merchantProfiles.externalAccountId,
    })
    .from(merchantProfiles)
    .where(
      and(
        eq(merchantProfiles.companyId, companyId),
        eq(merchantProfiles.isPrimary, true),
        isNull(merchantProfiles.deletedAt),
      ),
    )
    .limit(1)

  if (!row) {
    return { exists: false, canCharge: false, status: null, verificationStatus: null }
  }

  return {
    exists: true,
    canCharge: CHARGING_MERCHANT_STATUSES.includes(row.status) && row.externalAccountId !== null,
    status: row.status,
    verificationStatus: row.verificationStatus,
  }
}

/** Lo mismo, en forma de compuerta. La usa la creación de una sesión de pago del comprador. */
export async function assertCanCharge(companyId: string): Promise<void> {
  const profile = await operatingProfile(companyId)
  if (profile.canCharge) return

  throw new UnprocessableError(
    profile.exists
      ? "El comercio de esta empresa no está habilitado para cobros todavía. Completa su verificación."
      : "Esta empresa no tiene un perfil de facturación primario, así que no puede cobrar.",
  )
}

// ─── Libro de ingresos ───────────────────────────────────────────────────────

export interface MerchantPaymentRecord {
  readonly id: string
  readonly grossAmount: string
  readonly platformFee: string
  readonly netAmount: string
  readonly currency: string
  readonly method: string | null
  readonly status: string
  readonly merchantProfileId: string | null
  readonly buyerId: string | null
  readonly createdAt: Date
}

export const merchantPaymentQuery: QuerySchema = {
  filters: {
    status: {
      type: "enum",
      values: [
        "created",
        "requires_action",
        "processing",
        "paid",
        "failed",
        "refunded",
        "disputed",
        "canceled",
      ],
      label: "Estado",
    },
    createdAt: { type: "date", range: true, label: "Fecha" },
  },
  searchable: [],
  sortable: ["createdAt"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
}

const merchantPaymentMapping = {
  fields: { status: merchantPayments.status, createdAt: merchantPayments.createdAt },
  tiebreak: merchantPayments.id,
}

/** Lo que la empresa ha cobrado de sus compradores, con la comisión y el neto por separado. */
export async function listMerchantPayments(
  actor: Actor,
  companyId: string,
  query: ParsedQuery,
): Promise<Page<MerchantPaymentRecord>> {
  const { limit, offset, page } = windowOf(query)

  return withRequester(actor, async (tx) => {
    const where = and(
      eq(merchantPayments.companyId, companyId),
      ...collectionConditions(query, merchantPaymentMapping),
    )

    const [total] = await tx.select({ value: count() }).from(merchantPayments).where(where)

    const rows = await tx
      .select()
      .from(merchantPayments)
      .where(where)
      .orderBy(...collectionOrder(query, merchantPaymentMapping), desc(merchantPayments.createdAt))
      .limit(limit)
      .offset(offset)

    return buildPage(
      rows.map(
        (row): MerchantPaymentRecord => ({
          id: row.id,
          grossAmount: row.grossAmount,
          platformFee: row.platformFee,
          netAmount: row.netAmount,
          currency: row.currency,
          method: row.method,
          status: row.status,
          merchantProfileId: row.merchantProfileId,
          buyerId: row.buyerId,
          createdAt: row.createdAt,
        }),
      ),
      total?.value ?? 0,
      page,
      limit,
    )
  })
}

// ─── Ayudas ──────────────────────────────────────────────────────────────────

function assertBank(bank: MerchantBank): void {
  if (!/^\d{18}$/.test(bank.clabe)) {
    throw new UnprocessableError("La clave interbancaria son dieciocho dígitos")
  }
}

function assertRepresentative(representative: MerchantRepresentative): void {
  if (!isOfLegalAge(representative.birthdate)) {
    throw new UnprocessableError("El representante legal debe ser mayor de edad")
  }
}

export async function requireProfile(
  actor: Actor,
  companyId: string,
  profileId: string,
): Promise<MerchantProfileRecord> {
  const row = await withRequester(actor, async (tx) => {
    const [found] = await tx
      .select()
      .from(merchantProfiles)
      .where(
        and(
          eq(merchantProfiles.id, profileId),
          eq(merchantProfiles.companyId, companyId),
          isNull(merchantProfiles.deletedAt),
        ),
      )
      .limit(1)

    return found
  })

  if (!row) throw new NotFoundError("No se encontró el perfil de facturación")
  return toRecord(row)
}

function toRecord(row: typeof merchantProfiles.$inferSelect): MerchantProfileRecord {
  return {
    id: row.id,
    alias: row.alias,
    addressId: row.addressId,
    business: row.business,
    bank: row.bank,
    representative: row.representative,
    status: row.status,
    verificationStatus: row.verificationStatus,
    canAcceptCharges: row.canAcceptCharges,
    canReceivePayouts: row.canReceivePayouts,
    isPrimary: row.isPrimary,
    externalAccountId: row.externalAccountId,
    termsAcceptedAt: row.termsAcceptedAt,
    notes: row.notes,
    createdAt: row.createdAt,
  }
}
