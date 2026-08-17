/**
 * Cliente de base de datos.
 *
 * Ver `openspec/specs/access-control/spec.md`, requisito de aislamiento en dos capas.
 *
 * Hay **tres vías de acceso deliberadamente separadas**, y la distinción es de seguridad:
 *
 * | Vía | Rol | Políticas | Para qué |
 * |---|---|---|---|
 * | `withRequester` | `authenticated` | **Se aplican** | Peticiones de usuario |
 * | `withSystem` | `authenticated` | **Se aplican**, con alcance declarado | Operaciones entre empresas |
 * | `withElevated` | el rol de conexión | Se eluden | Migraciones y mantenimiento |
 *
 * ## Cómo llega la identidad al motor
 *
 * `auth.uid()` lee `current_setting('request.jwt.claims')`. Con una conexión directa —que es lo que
 * usa Drizzle, sin pasar por la capa de datos de Supabase— **nadie fija ese valor por nosotros**:
 * hay que hacerlo en cada transacción.
 *
 * Se fija como parámetro **local**, así que vuelve a su valor anterior al terminar la transacción y
 * no se filtra a la siguiente petición que reutilice la misma conexión del grupo.
 *
 * ## Por qué esto es una segunda capa de verdad
 *
 * Comprobado contra la base: un rol `authenticated` **sin claims no ve ninguna fila**. Si algún
 * camino olvida propagar la identidad, la consulta sale vacía en lugar de salir completa. El modo
 * de fallo es cerrado, que es la única forma en que una defensa en profundidad sirve de algo.
 *
 * ## Revocación
 *
 * El motor no se cree la identidad del token: la resuelve viva en cada transacción con `app.uid()`,
 * que devuelve nulo si la sesión se cerró o la cuenta dejó de estar vigente. Por eso el solicitante
 * tiene que traer su sesión y no sólo su usuario. Ver `drizzle/0006_session_revocation.sql`.
 */

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { DATABASE_URL, POOL_SIZE } from "./env.ts"
import * as schema from "./schema/index.ts"

const client = postgres(DATABASE_URL, { max: POOL_SIZE })

export const db = drizzle(client, { schema })

export type Database = typeof db
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

/**
 * Quién realiza la operación, tal y como lo verá el motor.
 *
 * **La sesión es obligatoria.** Sin ella el motor no puede comprobar que sigue viva, y cerrar sesión
 * no surtiría efecto hasta que caducara el token. Un solicitante sin sesión resuelve identidad nula
 * y no ve ni escribe nada: el olvido falla cerrado.
 *
 * No lleva «es administrador de plataforma» a propósito. Lo resuelve el motor con
 * `app.is_platform_admin()`; traerlo desde la aplicación invitaría a alguien a confiar en un valor
 * que la aplicación puede equivocarse al calcular.
 */
export interface Requester {
  readonly userId: string
  readonly sessionId: string
}

/**
 * Ejecuta una transacción en nombre de un solicitante.
 *
 * Las empresas **no se pasan**: las resuelve el motor con `app.member_of()`, leyendo las membresías
 * activas del usuario que declaran los claims. Pasarlas desde la aplicación permitiría que un fallo
 * en el código ampliara el alcance, que es justo lo que esta capa evita.
 */
export async function withRequester<T>(
  requester: Requester,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role authenticated`)
    await setClaims(tx, {
      sub: requester.userId,
      session_id: requester.sessionId,
      role: "authenticated",
    })
    return work(tx)
  })
}

/**
 * Ejecuta una transacción como operación del sistema, sobre un conjunto explícito de empresas.
 *
 * Lo usan el abanico de compras entre arrendatarios, la materialización de pedidos y los trabajos en
 * segundo plano. **Las políticas siguen aplicándose**: el alcance declarado se suma a las
 * membresías, no las sustituye, así que escribir en una empresa que no se nombró falla.
 *
 * Es la diferencia con eludir las políticas usando una credencial de servicio, que desactivaría el
 * aislamiento para toda la operación y convertiría el alcance en un comentario.
 */
export async function withSystem<T>(
  operation: string,
  scope: readonly string[],
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role authenticated`)
    await setClaims(tx, {
      role: "authenticated",
      app_scope: [...scope],
      app_operation: operation,
    })
    return work(tx)
  })
}

/**
 * Ejecuta con el rol de conexión, **sin políticas**.
 *
 * Sólo para migraciones, mantenimiento y siembra. Nunca para atender una petición: el nombre es
 * largo y explícito a propósito, para que aparezca en cualquier revisión de código.
 */
export async function withElevated<T>(
  reason: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.elevated_reason', ${reason}, true)`)
    return work(tx)
  })
}

/**
 * Fija los claims de la transacción.
 *
 * El tercer argumento en verdadero los hace locales: al confirmar o revertir vuelven a su valor
 * anterior. Sin eso, la siguiente petición que reutilizara la conexión heredaría la identidad de la
 * anterior — un fallo de aislamiento silencioso y muy difícil de encontrar.
 */
function setClaims(tx: Transaction, claims: Record<string, unknown>) {
  return tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`)
}

/** Comprueba que la base responde. La usan el endpoint de salud y el arranque. */
export async function ping(): Promise<void> {
  await client`select 1`
}

export async function closeConnection(): Promise<void> {
  await client.end()
}

export * as schema from "./schema/index.ts"
