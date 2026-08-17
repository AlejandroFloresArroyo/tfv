/**
 * Clientes y proveedores.
 *
 * Ver `openspec/specs/clients-and-providers/spec.md`.
 *
 * Con quién comercia una empresa, visto desde los dos lados del mostrador. Es la misma estructura,
 * discriminada por su papel, porque cuando la empresa A le compra a la B se crea **una pareja**:
 * un cliente en B y un proveedor en A.
 *
 * Una contraparte puede representar a una persona del sistema, a otra empresa del sistema, o a
 * alguien externo del que sólo se guardan datos sueltos. De ahí que convivan las referencias con
 * la información copiada: la copia es lo que permite registrar a quien no está en la plataforma, y
 * lo que conserva cómo eran los datos en el momento del alta.
 *
 * Vía hasta la empresa: columna directa.
 */

import { relations, sql } from "drizzle-orm"
import { index, jsonb, pgEnum, pgTable, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { primaryId, reference, softDelete, timestamps } from "./_shared.ts"
import { companies, users } from "./identity.ts"
import { uploads } from "./media.ts"

export const counterpartyRole = pgEnum("counterparty_role", ["client", "provider"])

/**
 * Datos copiados en el momento del alta, para las contrapartes que no están en el sistema.
 *
 * Los campos llevan `| undefined` explícito: con `exactOptionalPropertyTypes`, «ausente» y
 * «presente con valor indefinido» son tipos distintos, y lo que llega de un esquema de ruta es lo
 * segundo. Sin ello, cada llamada tendría que limpiar el objeto antes de escribirlo.
 */
export interface CounterpartySnapshot {
  readonly name?: string | undefined
  readonly lastname?: string | undefined
  readonly email?: string | undefined
  readonly phone?: string | undefined
  readonly companyName?: string | undefined
  readonly taxId?: string | undefined
  readonly address?: string | undefined
}

export const counterparties = pgTable(
  "counterparties",
  {
    id: primaryId(),

    /** La empresa dueña del registro. */
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    role: counterpartyRole("role").notNull(),

    alias: varchar("alias", { length: 160 }).notNull(),

    /** A quién representa, cuando está en el sistema. */
    userId: reference("user_id").references(() => users.id, { onDelete: "set null" }),
    counterpartyCompanyId: reference("counterparty_company_id").references(() => companies.id, {
      onDelete: "set null",
    }),

    /** Copia de los datos, para las externas y como registro histórico. */
    snapshot: jsonb("snapshot").$type<CounterpartySnapshot>().notNull().default({}),

    imageUploadId: reference("image_upload_id").references(() => uploads.id, {
      onDelete: "set null",
    }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    /**
     * Hace idempotente el aprovisionamiento automático entre empresas.
     *
     * Con esta restricción, el alta se escribe como inserción con resolución de conflicto y no
     * hace falta comprobar antes si existe: órdenes sucesivas reutilizan la contraparte.
     */
    uniqueIndex("counterparties_company_pair_unique")
      .on(table.companyId, table.role, table.counterpartyCompanyId)
      .where(sql`counterparty_company_id IS NOT NULL AND deleted_at IS NULL`),
    /** Y lo mismo para las contrapartes que representan a una persona suelta. */
    uniqueIndex("counterparties_user_pair_unique")
      .on(table.companyId, table.role, table.userId)
      .where(sql`user_id IS NOT NULL AND counterparty_company_id IS NULL AND deleted_at IS NULL`),
    index("counterparties_company_idx").on(table.companyId, table.role, table.alias),
  ],
)

export const counterpartiesRelations = relations(counterparties, ({ one }) => ({
  company: one(companies, {
    fields: [counterparties.companyId],
    references: [companies.id],
    relationName: "counterparty_owner",
  }),
  counterpartyCompany: one(companies, {
    fields: [counterparties.counterpartyCompanyId],
    references: [companies.id],
    relationName: "counterparty_represents",
  }),
  user: one(users, { fields: [counterparties.userId], references: [users.id] }),
  image: one(uploads, { fields: [counterparties.imageUploadId], references: [uploads.id] }),
}))
