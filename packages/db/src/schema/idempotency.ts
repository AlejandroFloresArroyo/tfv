/**
 * Claves de idempotencia.
 *
 * Ver `openspec/specs/api-conventions/spec.md`, requisito «Las mutaciones de dinero son
 * idempotentes», y `packages/contracts/src/idempotency.ts` para la parte pura.
 *
 * ## Por qué es una tabla y no un mapa en memoria
 *
 * Lo que el requisito pide es que **la segunda petición devuelva el resultado de la primera**. Un
 * mapa en memoria lo cumple mientras el proceso viva y sea uno solo: se pierde al reiniciar y no lo
 * comparten dos instancias. El caso que esto existe para cubrir es precisamente el reintento que
 * llega después de que algo se cayó — que es cuando el mapa ya no está.
 *
 * Y la unicidad tiene que ser una **restricción del motor**, no una comprobación de la aplicación:
 * dos peticiones simultáneas con la misma clave las mira las dos, las dos ven que no hay nada, y
 * las dos cobran. El índice único convierte esa carrera en un conflicto que se puede atender.
 *
 * ## Vía hasta la empresa, y por qué la clave no es global
 *
 * Aquí se guarda **un cuerpo de respuesta ya calculado**. Si la clave fuese global, quien acierte o
 * adivine la clave de otro recibiría su respuesta —datos de otra empresa, servidos por el mecanismo
 * que existe para evitar cobros dobles—. Por eso la unicidad y el aislamiento son sobre la terna
 * **(actor, empresa, clave)** y no sobre la clave sola: repetir la clave de otro no encuentra nada
 * y la petición sigue su curso normal, con sus propios permisos.
 *
 * La empresa es nula en las mutaciones que no cuelgan de una —las de la cuenta propia—, y por eso
 * el índice único se declara `nulls not distinct`: con la regla de fábrica, dos nulos se consideran
 * distintos y la clave dejaría de deduplicar justo en ese caso.
 *
 * ## Qué se guarda, y qué no
 *
 * - **Del cuerpo de entrada, sólo su huella.** No hace falta el cuerpo para decidir si es el mismo,
 *   y guardarlo duplicaría en una tabla auxiliar los datos personales y los importes que ya están
 *   en su sitio.
 * - **Del cuerpo de salida, el cuerpo entero.** Aquí no hay alternativa: el requisito es devolver
 *   *lo mismo*, y reconstruirlo pediría lógica de cada endpoint. Lo que sí se acota es el riesgo:
 *   sólo se guarda la respuesta de una petición **correcta**, sólo la alcanza el mismo actor en la
 *   misma empresa, y `expires_at` la borra en horas — no en meses.
 */

import {
  char,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"
import { primaryId, reference, timestamps } from "./_shared.ts"
import { companies, users } from "./identity.ts"

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: primaryId(),

    /** La clave que puso el cliente. Opaca: sólo se compara. */
    key: varchar("key", { length: 200 }).notNull(),

    /**
     * Quién la usó.
     *
     * Obligatorio. Una clave sin actor no se puede acotar a nadie, así que el motor sólo admite
     * declarar idempotencia en rutas que exigen credencial — lo comprueba `defineRoute` al cargar.
     */
    actorId: reference("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** La empresa de la ruta, si la lleva. Nula en las mutaciones de la cuenta propia. */
    companyId: reference("company_id").references(() => companies.id, { onDelete: "cascade" }),

    /**
     * Qué se pidió, para poder leerlo cuando algo no cuadre.
     *
     * No participa en la decisión: **va dentro de la huella**, de modo que la misma clave en dos
     * endpoints distintos es «otro cuerpo» y se rechaza, en lugar de devolver la respuesta de uno
     * al que pidió el otro.
     */
    endpoint: text("endpoint").notNull(),

    /** Huella del método, el camino y el cuerpo. Nunca el cuerpo. */
    fingerprint: char("fingerprint", { length: 64 }).notNull(),

    /** Nulos mientras la primera petición sigue en curso. */
    responseStatus: smallint("response_status"),
    responseBody: jsonb("response_body"),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),

    /**
     * Cuándo deja de valer.
     *
     * El plazo de retención es configurable y lo barre un trabajo periódico
     * (`idempotencia.caducar-claves`). Se guarda en la fila y no se deduce de `created_at` para que
     * cambiar el plazo no reescriba el significado de lo ya guardado.
     */
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),

    ...timestamps,
  },
  (table) => [
    // Por donde el barrido busca lo vencido.
    index("idempotency_keys_expiry_idx").on(table.expiresAt),
    // La unicidad de la terna se declara en la migración, que es donde cabe `nulls not distinct`.
    index("idempotency_keys_actor_idx").on(table.actorId, table.createdAt),
  ],
)
