/**
 * Piezas comunes a todas las tablas.
 *
 * Ver `openspec/project.md` D-02 a D-05 y `openspec/specs/api-conventions/spec.md`.
 *
 * Aquí viven las tres convenciones que toda tabla cumple —identificador, marcas de tiempo y
 * borrado— más los tipos de dinero. Definirlas una vez evita que cada tabla las reinvente con
 * matices distintos, que es como acaba habiendo tres formatos de fecha en la misma base.
 */

import { char, numeric, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * Clave primaria.
 *
 * El valor lo genera la aplicación con `newId()` de `@tfv/contracts`, no la base: así el código
 * conoce el identificador antes de escribir, que es lo que permite construir en una sola
 * transacción entidades que se referencian entre sí.
 */
export const primaryId = () => uuid("id").primaryKey()

/** Referencia a otra entidad. El comportamiento de propagación se declara en cada caso. */
export const reference = (column: string) => uuid(column)

/**
 * Marcas de tiempo.
 *
 * Siempre con zona horaria: un `timestamp` sin zona guarda una hora sin decir de dónde, y eso
 * acaba en un desfase de seis horas que nadie sabe explicar.
 */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

/**
 * Borrado lógico, para las entidades de negocio.
 *
 * Toda lectura de colección excluye lo borrado salvo que se pida lo contrario, y **los índices
 * únicos de estas tablas son parciales**: un correo o un identificador legible liberado por una
 * baja vuelve a estar disponible.
 */
export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}

/**
 * Importe.
 *
 * Decimal exacto de dos posiciones. Nunca coma flotante. En el transporte viaja como cadena
 * decimal, y `@tfv/contracts/money` es lo único que debe operar con él.
 */
export const money = (column: string) => numeric(column, { precision: 14, scale: 2 })

/** Porcentaje con cuatro decimales, suficiente para retenciones como `10.6667`. */
export const percent = (column: string) => numeric(column, { precision: 7, scale: 4 })

/**
 * Identificador de la pila anterior: veinticuatro caracteres hexadecimales.
 *
 * Sólo en las tablas cuyas entidades aparecen en URLs públicas ya compartidas. Se retira cuando
 * dejen de circular enlaces antiguos. Ver `openspec/project.md` D-04.
 */
export const legacyId = () => char("legacy_id", { length: 24 })
