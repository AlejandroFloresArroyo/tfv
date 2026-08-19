/**
 * Bitácora de la administración de plataforma.
 *
 * Ver `openspec/specs/access-control/spec.md`, «El administrador de plataforma cruza empresas».
 *
 * ## Por qué no cabe en `company_activities`
 *
 * Porque aquella tabla tiene `company_id` **no nulo**, y ésa es su virtud: es lo que permite que su
 * política se exprese contra el alcance del arrendatario y que la bitácora de una empresa sea suya.
 * Aflojarla a nula para que quepa una acción que no pertenece a ninguna empresa convertiría el
 * predicado de aislamiento en un caso especial, y un caso especial en un predicado de aislamiento
 * es exactamente por donde se filtra.
 *
 * Y hay acciones de plataforma que **no ocurren dentro de ninguna empresa**: aceptar un prospecto
 * crea una cuenta que todavía no pertenece a nadie. Atribuirla a una empresa cualquiera sería
 * mentir en el asiento.
 *
 * Así que son dos bitácoras con la misma forma y distinto alcance: lo que se hace *dentro* de una
 * empresa queda en la suya —marcado con `performed_as_platform_admin`, que ya existe—, y lo que se
 * hace *sobre la plataforma* queda aquí.
 *
 * Vía hasta la empresa: **ninguna, a propósito**. No es una tabla de arrendatario. Su única
 * política es la de plataforma.
 */

import { index, pgTable, text, varchar } from "drizzle-orm/pg-core"
import { primaryId, reference, timestamps } from "./_shared.ts"
import { activityAction } from "./activity.ts"
import { users } from "./identity.ts"

export const platformActivities = pgTable(
  "platform_activities",
  {
    id: primaryId(),

    action: activityAction("action").notNull(),
    /** La tabla afectada, para poder filtrar por tipo de entidad sin adivinar por el título. */
    entity: varchar("entity", { length: 80 }).notNull(),
    entityId: reference("entity_id"),
    /** Etiqueta legible que identifica la entidad sin tener que abrirla. */
    entityLabel: varchar("entity_label", { length: 200 }).notNull().default(""),

    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),

    /**
     * Quién lo hizo.
     *
     * Se conserva la fila aunque la cuenta se dé de baja —`set null`—, porque el asiento sirve
     * justamente para responder qué pasó cuando ya nadie está para contarlo.
     */
    performedById: reference("performed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    ...timestamps,
  },
  (table) => [
    index("platform_activities_created_idx").on(table.createdAt),
    index("platform_activities_actor_idx").on(table.performedById, table.createdAt),
    index("platform_activities_entity_idx").on(table.entity, table.entityId),
  ],
)
