/**
 * Lo que se puede escribir de un producto de almacén, dicho una sola vez.
 *
 * Estos esquemas vivían dentro de las rutas de la API. Se mudan aquí porque el asistente de
 * producto valida **paso a paso**, y validar por paso sin compartir las reglas obliga a escribirlas
 * dos veces: una en el servidor y otra en el navegador. Dos copias de una regla son dos reglas en
 * cuanto alguien toca una — y la que se queda vieja es siempre la del cliente, que es la que decide
 * si el usuario puede seguir.
 *
 * Es el mismo argumento por el que el motor de precios de una cotización vive en este paquete y no
 * en cada lado.
 *
 * **Estos esquemas describen la entrada, no la autorización.** Qué campos puede tocar quien envía
 * el formulario se sigue comprobando en el servidor, clave por clave: el catálogo reparte la
 * edición del producto en once permisos, y ninguno de ellos se puede deducir del cuerpo.
 */

import { z } from "zod"

// ─── Vocabulario ─────────────────────────────────────────────────────────────

export const MEASUREMENT_KINDS = ["box", "envelope", "clothing", "accessory", "other"] as const
export const LENGTH_UNITS = ["cm", "m", "in", "ft"] as const
export const MASS_UNITS = ["g", "kg", "lb", "oz"] as const

export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number]
export type LengthUnit = (typeof LENGTH_UNITS)[number]
export type MassUnit = (typeof MASS_UNITS)[number]

// ─── Importes ────────────────────────────────────────────────────────────────

/**
 * Un importe se escribe, no se calcula: cadena decimal con dos decimales como mucho.
 *
 * Nunca `z.number()`. Un importe que pasa por coma flotante deja de ser exacto en el momento en que
 * lo hace, y aquí es donde entra al sistema.
 */
export const amount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Importe con dos decimales como mucho, y sin separador de millar")

/** Igual, admitiendo resta: la diferencia de precio de una medida puede quitar. */
export const signedAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Importe con dos decimales como mucho, y sin separador de millar")

// ─── Medidas ─────────────────────────────────────────────────────────────────

export const dimensionsInput = z.object({
  height: z.number().optional(),
  width: z.number().optional(),
  length: z.number().optional(),
  weight: z.number().optional(),
})

/** Ficha de sastrería: todos los campos opcionales, porque casi nadie los rellena todos. */
export const clothingInput = z.object({
  garment: z.string().max(120).optional(),
  size: z.string().max(60).optional(),
  custom: z.string().max(500).optional(),
  measurements: z.record(z.string(), z.number()).optional(),
})

export const measurementInput = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(MEASUREMENT_KINDS).optional(),
  priceDifference: signedAmount.optional(),
  dimensions: dimensionsInput.optional(),
  lengthUnit: z.enum(LENGTH_UNITS).optional(),
  massUnit: z.enum(MASS_UNITS).optional(),
  clothing: clothingInput.optional(),
  /** No es un número guardado: **materializa unidades**. Sin fila no hay nada que etiquetar. */
  initialQuantity: z.number().int().min(0).max(1000).optional(),
})

/**
 * Corregir una medida.
 *
 * `initialQuantity` no está, y su ausencia es la decisión: la cantidad inicial creó unidades
 * físicas con su código y su etiqueta. Cambiarla después no puede significar «que haya otras
 * tantas» sin decidir cuáles se destruyen. Las unidades se dan de alta y de baja por su cuenta.
 */
export const measurementPatchInput = measurementInput.omit({ initialQuantity: true }).partial()

// ─── Productos ───────────────────────────────────────────────────────────────

/** Variantes y accesorios: el mismo cuerpo. Lo que los distingue es la relación, no los datos. */
export const productChildInput = z.object({
  name: z.string().trim().min(1).max(250),
  description: z.string().max(8000).optional(),
  internalCode: z.string().max(80).optional(),
  cost: amount.optional(),
  price: amount.optional(),
  measurements: z.array(measurementInput).max(50).optional(),
})

export const createProductInput = z.object({
  name: z.string().trim().min(1).max(250),
  description: z.string().max(8000).optional(),
  internalCode: z.string().max(80).optional(),
  cost: amount.optional(),
  price: amount.optional(),
  usesPriceLists: z.boolean().optional(),
  availableForSale: z.boolean().optional(),
  availableForRent: z.boolean().optional(),
  storageId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  globalCategoryId: z.string().nullable().optional(),
  responsibleId: z.string().nullable().optional(),
  isPublished: z.boolean().optional(),
  /** Alta provisional desde una cotización: mientras lo sea no se publica. */
  isProvisional: z.boolean().optional(),
  measurements: z.array(measurementInput).max(50).optional(),
  variants: z.array(productChildInput).max(50).optional(),
  accessories: z.array(productChildInput).max(50).optional(),
})

export const updateProductInput = z.object({
  name: z.string().trim().min(1).max(250).optional(),
  description: z.string().max(8000).optional(),
  internalCode: z.string().max(80).nullable().optional(),
  cost: amount.optional(),
  price: amount.optional(),
  usesPriceLists: z.boolean().optional(),
  availableForSale: z.boolean().optional(),
  availableForRent: z.boolean().optional(),
  storageId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  globalCategoryId: z.string().nullable().optional(),
  responsibleId: z.string().nullable().optional(),
  isPublished: z.boolean().optional(),
  /** Retirarla es convertirlo en producto de catálogo, y eso pide su clave. */
  isProvisional: z.boolean().optional(),
  slug: z.string().trim().min(1).max(280).optional(),
})

export type MeasurementInput = z.infer<typeof measurementInput>
export type MeasurementPatchInput = z.infer<typeof measurementPatchInput>
export type ProductChildInput = z.infer<typeof productChildInput>
export type CreateProductInput = z.infer<typeof createProductInput>
export type UpdateProductInput = z.infer<typeof updateProductInput>
