/**
 * Prospectos: quien deja sus datos sin crear cuenta.
 *
 * Ver `openspec/specs/user-accounts/spec.md`, «Captura pública de prospectos» y «Aceptación de un
 * prospecto». Rebanada 10.
 *
 * ## Por qué no es una cuenta a medias
 *
 * La tentación es crear el usuario desactivado y ya. No: una cuenta a medias es una cuenta que
 * alguien acaba pudiendo usar, y además ocupa el correo —de modo que quien luego quiera registrarse
 * de verdad se encuentra con que «ya existe»—. Un prospecto es una intención de contacto y vive en
 * su propia tabla hasta que alguien decide convertirlo.
 *
 * ## Aceptar no lo borra
 *
 * Se marca con quién lo aceptó y qué cuenta salió de él. La bandeja de pendientes son los que no
 * tienen `acceptedAt`, así que **sale de ella por construcción** —que es lo que la implementación
 * anterior no llegaba a hacer (`DEFECTS.md` L-02)— y el rastro de por dónde entró cada cuenta se
 * conserva.
 */

import {
  buildPage,
  ConflictError,
  NotFoundError,
  newId,
  type Page,
  type ParsedQuery,
  type QuerySchema,
} from "@tfv/contracts"
import { db } from "@tfv/db"
import { notificationDeliveries, prospects } from "@tfv/db/schema"
import { and, count, desc, eq, isNull, sql } from "drizzle-orm"
import { invite } from "./accounts.ts"
import { announceDevLink } from "./dev-links.ts"

export const prospectQuery: QuerySchema = {
  filters: { createdAt: { type: "date", range: true, label: "Recibido" } },
  searchable: ["name", "lastname", "email", "companyName", "message"],
  sortable: ["createdAt", "name", "email"],
  defaultSort: [{ field: "createdAt", direction: "desc" }],
}

export interface ProspectRecord {
  readonly id: string
  readonly name: string
  readonly lastname: string
  readonly email: string
  readonly phone: string | null
  readonly companyName: string
  readonly message: string
  readonly acceptedAt: Date | null
  readonly acceptedById: string | null
  readonly userId: string | null
  readonly createdAt: Date
}

export interface CaptureInput {
  readonly name: string
  readonly lastname?: string | undefined
  readonly email: string
  readonly phone?: string | undefined
  readonly companyName?: string | undefined
  readonly message?: string | undefined
}

/**
 * La captura pública. **Sin sesión y sin cuenta.**
 *
 * Escribe por la vía sin solicitante, como el registro: quien rellena el formulario no tiene
 * identidad que propagar. Lo que se guarda es lo que escribió, sin más consecuencia.
 *
 * El acuse se encola en la misma transacción. Si el envío fallara después, el prospecto ya está
 * registrado —que es lo que importa: perder el aviso es molesto, perder el contacto es perder al
 * cliente.
 */
export async function captureProspect(input: CaptureInput): Promise<ProspectRecord> {
  return db.transaction(async (tx) => {
    const id = newId()
    const [row] = await tx
      .insert(prospects)
      .values({
        id,
        name: input.name.trim(),
        lastname: input.lastname?.trim() ?? "",
        email: input.email.trim().toLowerCase(),
        phone: input.phone?.trim() || null,
        companyName: input.companyName?.trim() ?? "",
        message: input.message?.trim() ?? "",
      })
      .returning()

    if (!row) throw new Error("El prospecto no se insertó")

    await tx.insert(notificationDeliveries).values({
      id: newId(),
      // Sin cuenta: el destino va en el sobre, no en un usuario que no existe.
      recipientId: null,
      channel: "email",
      kind: "prospect_acknowledged",
      payload: { email: row.email, name: row.name },
    })

    return toRecord(row)
  })
}

/**
 * La bandeja de pendientes.
 *
 * Sólo los que nadie ha aceptado ni descartado. Los aceptados conservan su fila para poder decir
 * de dónde salió cada cuenta, pero no vuelven a pedir atención.
 */
export async function listProspects(query: ParsedQuery): Promise<Page<ProspectRecord>> {
  const limit = Math.min(Math.max(query.limit ?? 25, 1), 100)
  const page = Math.max(query.page ?? 1, 1)
  const offset = (page - 1) * limit

  const where = and(
    isNull(prospects.acceptedAt),
    isNull(prospects.deletedAt),
    searchCondition(query),
  )

  const [total] = await db.select({ value: count() }).from(prospects).where(where)
  const rows = await db
    .select()
    .from(prospects)
    .where(where)
    .orderBy(desc(prospects.createdAt), prospects.id)
    .limit(limit)
    .offset(offset)

  return buildPage(rows.map(toRecord), total?.value ?? 0, page, limit)
}

export interface UpdateProspectInput {
  readonly name?: string | undefined
  readonly lastname?: string | undefined
  readonly email?: string | undefined
  readonly phone?: string | null | undefined
  readonly companyName?: string | undefined
  readonly message?: string | undefined
}

/** Corrige lo que llegó mal escrito. Un correo con una errata no se convierte en cuenta. */
export async function updateProspect(
  prospectId: string,
  input: UpdateProspectInput,
): Promise<ProspectRecord> {
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.lastname !== undefined) patch.lastname = input.lastname.trim()
  if (input.email !== undefined) patch.email = input.email.trim().toLowerCase()
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
  if (input.companyName !== undefined) patch.companyName = input.companyName.trim()
  if (input.message !== undefined) patch.message = input.message.trim()

  const [row] = await db
    .update(prospects)
    .set(patch)
    .where(and(eq(prospects.id, prospectId), isNull(prospects.deletedAt)))
    .returning()

  if (!row) throw new NotFoundError("El prospecto no existe")
  return toRecord(row)
}

/** Descarta un contacto que no lleva a ninguna parte. Baja lógica: el rastro se conserva. */
export async function discardProspect(prospectId: string): Promise<void> {
  const [row] = await db
    .update(prospects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(prospects.id, prospectId), isNull(prospects.deletedAt)))
    .returning({ id: prospects.id })

  if (!row) throw new NotFoundError("El prospecto no existe")
}

export interface AcceptedProspect {
  readonly prospect: ProspectRecord
  readonly userId: string
  /** El enlace de un solo uso. **No sale nunca en la respuesta**: sólo se encola su envío. */
  readonly token: string
}

/**
 * Convierte un prospecto en cuenta.
 *
 * Reutiliza `invite`, que es quien sabe crear una cuenta **verificada y sin contraseña** con su
 * enlace de un solo uso — existe desde la rebanada 04 y no se reimplementa aquí.
 *
 * Un correo que ya tiene cuenta **se rechaza** en lugar de reutilizarla: aceptar un prospecto
 * significa dar de alta a alguien, y si ya está dado de alta lo que hay que hacer es otra cosa
 * —invitarlo a una empresa, por ejemplo—. Reutilizar en silencio haría creer que se creó una cuenta
 * nueva y dejaría al prospecto marcado como resuelto sin que nadie lo estuviera.
 */
export async function acceptProspect(
  prospectId: string,
  acceptedById: string,
): Promise<AcceptedProspect> {
  return db.transaction(async (tx) => {
    const [prospect] = await tx
      .select()
      .from(prospects)
      .where(and(eq(prospects.id, prospectId), isNull(prospects.deletedAt)))

    if (!prospect) throw new NotFoundError("El prospecto no existe")
    if (prospect.acceptedAt) throw new ConflictError("Este prospecto ya se aceptó")

    const outcome = await invite(
      {
        email: prospect.email,
        name: prospect.name,
        ...(prospect.lastname === "" ? {} : { lastname: prospect.lastname }),
      },
      tx,
    )

    if (outcome.kind === "existing") {
      throw new ConflictError(
        "Ya hay una cuenta con ese correo. Si quieres darle acceso a una empresa, invítala desde ella.",
      )
    }

    await tx.insert(notificationDeliveries).values({
      id: newId(),
      recipientId: outcome.userId,
      channel: "email",
      kind: "prospect_accepted",
      payload: { token: outcome.token },
    })

    const [updated] = await tx
      .update(prospects)
      .set({
        acceptedAt: new Date(),
        acceptedById,
        userId: outcome.userId,
        updatedAt: new Date(),
      })
      .where(eq(prospects.id, prospectId))
      .returning()

    if (!updated) throw new Error("El prospecto no se actualizó")

    announceDevLink("prospect_accepted", outcome.token, prospect.email)
    return { prospect: toRecord(updated), userId: outcome.userId, token: outcome.token }
  })
}

function searchCondition(query: ParsedQuery) {
  const term = query.search?.trim()
  if (!term) return undefined
  const pattern = `%${term.toLowerCase()}%`
  return sql`(
    lower(${prospects.name}) like ${pattern}
    or lower(${prospects.lastname}) like ${pattern}
    or lower(${prospects.email}) like ${pattern}
    or lower(${prospects.companyName}) like ${pattern}
    or lower(${prospects.message}) like ${pattern}
  )`
}

function toRecord(row: typeof prospects.$inferSelect): ProspectRecord {
  return {
    id: row.id,
    name: row.name,
    lastname: row.lastname,
    email: row.email,
    phone: row.phone,
    companyName: row.companyName,
    message: row.message,
    acceptedAt: row.acceptedAt,
    acceptedById: row.acceptedById,
    userId: row.userId,
    createdAt: row.createdAt,
  }
}
