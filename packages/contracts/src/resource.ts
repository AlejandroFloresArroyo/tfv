/**
 * Forma común del recurso.
 *
 * Ver `openspec/specs/api-conventions/spec.md`.
 *
 * Toda entidad expuesta por la API lleva estos campos, con el mismo nombre y el mismo formato en
 * todos los dominios. Las fechas van en ISO 8601, en UTC y con la zona explícita.
 */

import { z } from "zod"
import type { Id } from "./ids.ts"

export interface Resource {
  readonly id: Id
  readonly createdAt: string
  readonly updatedAt: string
}

/** Las entidades con borrado lógico exponen además su fecha de baja, nula mientras estén vigentes. */
export interface SoftDeletableResource extends Resource {
  readonly deletedAt: string | null
}

// ─── Esquemas reutilizables ──────────────────────────────────────────────────

/** Instante en ISO 8601, UTC, con la zona explícita. */
export const instantSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)) && /[Zz]|[+-]\d{2}:\d{2}$/.test(value), {
    message: "Debe ser una fecha ISO 8601 con zona horaria explícita",
  })

/** Identificador opaco. Ningún consumidor debe depender de su estructura interna. */
export const idSchema = z.string().min(1)

/** Importe como cadena decimal de dos posiciones. Nunca como número. */
export const moneySchema = z
  .string()
  .regex(/^-?\d+\.\d{2}$/, "Debe ser un importe decimal con dos posiciones")

/** Porcentaje como cadena decimal de hasta cuatro posiciones. `"16"` es dieciséis por ciento. */
export const percentSchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, "Debe ser un porcentaje decimal")

export const resourceSchema = z.object({
  id: idSchema,
  createdAt: instantSchema,
  updatedAt: instantSchema,
})

export const softDeletableResourceSchema = resourceSchema.extend({
  deletedAt: instantSchema.nullable(),
})

/** Convierte una fecha del motor de datos a la representación del transporte. */
export function toInstant(date: Date): string {
  return date.toISOString()
}

export function toNullableInstant(date: Date | null): string | null {
  return date === null ? null : date.toISOString()
}
