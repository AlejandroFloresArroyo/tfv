/**
 * Idempotencia: el enganche y el almacén.
 *
 * Ver `openspec/specs/api-conventions/spec.md`, requisito «Las mutaciones de dinero son
 * idempotentes». La parte pura —la huella del cuerpo y la decisión— vive en
 * `packages/contracts/src/idempotency.ts`; aquí está lo que necesita base de datos y petición HTTP.
 *
 * ## El orden de las tres cosas que ocurren
 *
 * ```
 *   reclamar ──libre──> el manejador corre ──2xx──> guardar la respuesta
 *      │                        │
 *      │                        └──error──> soltar la clave
 *      │
 *      ├──ocupada, mismo cuerpo, terminada──> devolver lo de la primera vez
 *      ├──ocupada, mismo cuerpo, en curso───> 409 «todavía en curso»
 *      └──ocupada, otro cuerpo──────────────> 409 «clave reutilizada»
 * ```
 *
 * **Reclamar es un `insert`, no un `select`.** Entre mirar si la clave existe y escribirla cabe la
 * otra petición, y las dos cobrarían: la exclusión la da el índice único de la migración `0026`, que
 * es del motor y por tanto resistente a la concurrencia. Es la misma decisión que el alta de
 * contrapartes deja escrita en `companies/counterparties.ts`.
 *
 * ## Qué se guarda
 *
 * - **Del cuerpo de entrada, sólo su huella.** No hace falta el cuerpo para decidir si es el mismo,
 *   y guardarlo copiaría a una tabla auxiliar los importes y los datos personales que ya están en
 *   su sitio, con otro plazo de retención y otra política.
 * - **Del cuerpo de salida, el cuerpo entero.** Aquí no hay alternativa: el requisito es devolver
 *   *lo mismo*, y reconstruirlo pediría lógica de cada endpoint —que es justo lo que un mecanismo
 *   genérico no puede tener—. Lo que sí se acota es el riesgo: sólo se guarda la respuesta de una
 *   petición correcta, sólo la alcanza su propio actor (política `propietario` de la `0026`), y
 *   caduca en horas.
 *
 * ## Lo que no se guarda: los errores
 *
 * Un `422` por existencia insuficiente o un `500` **sueltan la clave**. Guardarlos convertiría un
 * fallo pasajero en uno permanente: el cliente reintentaría con su misma clave y recibiría el mismo
 * error para siempre, sin forma de completar la operación salvo inventarse otra clave — que es
 * exactamente lo que la clave existe para que no tenga que hacer.
 */

import { createHash } from "node:crypto"
import {
  canonicalize,
  decideIdempotency,
  IDEMPOTENCY_HEADER,
  IdempotencyInFlightError,
  IdempotencyKeyReusedError,
  type IdempotencyRecord,
  idempotencyKeySchema,
  newId,
  ValidationError,
} from "@tfv/contracts"
import { type Requester, withRequester, withSystem } from "@tfv/db"
import { idempotencyKeys } from "@tfv/db/schema"
import { and, eq, isNull, lt, or } from "drizzle-orm"
import type { Context, MiddlewareHandler } from "hono"
import { env } from "../env.ts"
import type { RegisteredRoute } from "./route.ts"

/**
 * Huella de la petición entera, no sólo de su cuerpo.
 *
 * El método y el camino van dentro a propósito: la misma clave en dos endpoints distintos tiene que
 * leerse como «otra petición» y rechazarse, no devolver la respuesta de uno a quien llamó al otro.
 * El camino es el **declarado** —`/companies/{companyId}/…`— más los parámetros ya resueltos, de
 * modo que dos empresas distintas den huellas distintas aunque la ruta sea la misma.
 */
export function fingerprintOf(method: string, path: string, body: unknown): string {
  return createHash("sha256")
    .update(`${method.toUpperCase()}\n${path}\n${canonicalize(body)}`)
    .digest("hex")
}

/**
 * El cuerpo tal y como se comparará.
 *
 * Se lee como texto —que **el motor cachea**, así que el validador de la ruta lo reutiliza sin
 * volver a consumir el flujo— y se intenta interpretar como JSON para poder normalizar el orden de
 * las claves. Lo que no sea JSON se compara tal cual: sigue siendo determinista, sólo que sin la
 * tolerancia al orden.
 */
async function bodyOf(c: Context): Promise<unknown> {
  const raw = await c.req.text()
  if (raw === "") return undefined

  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

// ─── Almacén ─────────────────────────────────────────────────────────────────

interface Scope {
  readonly requester: Requester
  readonly companyId: string | null
  readonly key: string
}

interface Claim {
  readonly id: string
  readonly record: IdempotencyRecord | null
}

/**
 * Intenta quedarse con la clave.
 *
 * Devuelve `record: null` cuando la reclamó esta petición, y el registro existente cuando ya era de
 * otra. La lectura de después del conflicto va en la **misma transacción**: leerla fuera dejaría un
 * hueco en el que el barrido de caducadas podría borrar la fila que se acaba de encontrar ocupada.
 *
 * Lo vencido se trata como inexistente y se sustituye. Sin eso, una clave caducada que el barrido
 * todavía no visitó bloquearía la petición con un `409` que nadie puede resolver.
 */
async function claim(scope: Scope, endpoint: string, fingerprint: string): Promise<Claim> {
  return withRequester(scope.requester, async (tx) => {
    const mine = newId() as string
    const expiresAt = new Date(Date.now() + env.IDEMPOTENCY_RETENTION_HOURS * 3_600_000)

    await tx
      .delete(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, scope.key),
          scope.companyId === null
            ? isNull(idempotencyKeys.companyId)
            : eq(idempotencyKeys.companyId, scope.companyId),
          lt(idempotencyKeys.expiresAt, new Date()),
        ),
      )

    const inserted = await tx
      .insert(idempotencyKeys)
      .values({
        id: mine,
        key: scope.key,
        actorId: scope.requester.userId,
        companyId: scope.companyId,
        endpoint,
        fingerprint,
        expiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyKeys.id })

    if (inserted.length > 0) return { id: mine, record: null }

    const [existing] = await tx
      .select({
        id: idempotencyKeys.id,
        fingerprint: idempotencyKeys.fingerprint,
        completedAt: idempotencyKeys.completedAt,
        responseStatus: idempotencyKeys.responseStatus,
        responseBody: idempotencyKeys.responseBody,
      })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, scope.key),
          eq(idempotencyKeys.actorId, scope.requester.userId),
          scope.companyId === null
            ? isNull(idempotencyKeys.companyId)
            : eq(idempotencyKeys.companyId, scope.companyId),
        ),
      )

    // No debería poder pasar —el conflicto dice que la fila está—, pero si la política no la deja
    // ver, tratarla como libre sería peor: se ejecutaría dos veces. Se trata como en curso.
    if (!existing) return { id: mine, record: EN_CURSO_DESCONOCIDO }

    return { id: existing.id, record: existing }
  })
}

/** Registro centinela: hay algo con esa clave y no se puede leer. Se contesta «en curso». */
const EN_CURSO_DESCONOCIDO: IdempotencyRecord = {
  fingerprint: "",
  completedAt: null,
  responseStatus: null,
  responseBody: null,
}

async function complete(scope: Scope, id: string, status: number, body: unknown): Promise<void> {
  await withRequester(scope.requester, async (tx) => {
    await tx
      .update(idempotencyKeys)
      .set({ responseStatus: status, responseBody: body ?? null, completedAt: new Date() })
      .where(eq(idempotencyKeys.id, id))
  })
}

async function release(scope: Scope, id: string): Promise<void> {
  await withRequester(scope.requester, async (tx) => {
    await tx.delete(idempotencyKeys).where(eq(idempotencyKeys.id, id))
  })
}

/**
 * Borra lo vencido y lo que quedó reclamado sin terminar.
 *
 * Lo segundo es el caso del proceso que se cayó entre reclamar y responder: la clave queda
 * reclamada y sin resultado, y **contestaría «todavía en curso» durante todo el plazo de
 * retención** — un día entero en el que el cliente no puede completar su operación ni con la misma
 * clave ni, si es obediente, con otra. Por eso el abandono se mide en minutos y la retención en
 * horas: son dos plazos que responden a preguntas distintas.
 *
 * Corre por la vía de sistema porque tiene que alcanzar las claves de todo el mundo, y no hay
 * sesión de nadie detrás de un trabajo periódico. La política `sistema` de la migración `0026` es la
 * que se lo permite; ver `apps/api/src/jobs/handlers.ts` para el registro del trabajo.
 */
export async function sweepIdempotencyKeys(abandonedAfterMs: number): Promise<number> {
  const abandonedBefore = new Date(Date.now() - abandonedAfterMs)

  const borradas = await withSystem(SWEEP_OPERATION, [], async (tx) =>
    tx
      .delete(idempotencyKeys)
      .where(
        or(
          lt(idempotencyKeys.expiresAt, new Date()),
          and(isNull(idempotencyKeys.completedAt), lt(idempotencyKeys.createdAt, abandonedBefore)),
        ),
      )
      .returning({ id: idempotencyKeys.id }),
  )

  return borradas.length
}

const SWEEP_OPERATION = "idempotencia.caducar-claves"

// ─── Enganche ────────────────────────────────────────────────────────────────

/**
 * El middleware que corresponde a una ruta, o nada si no declaró idempotencia.
 *
 * Se monta **después del guardián**: necesita el actor, y sin sesión la clave no se podría acotar a
 * nadie. Que eso se cumpla no depende del orden en que se monten las cosas: `defineRoute` no deja
 * declarar idempotente una ruta pública.
 */
export function idempotencyFor(route: RegisteredRoute): MiddlewareHandler | null {
  if (!route.idempotent) return null

  const method = route.config.method.toUpperCase()

  return async (c, next) => {
    // El middleware se monta por camino, y un camino puede tener más de un verbo. Sin esto, la
    // lectura del mismo recurso pasaría por aquí y leería un encabezado que no es suyo.
    if (c.req.method.toUpperCase() !== method) return next()

    const raw = c.req.header(IDEMPOTENCY_HEADER)
    if (!raw) return next()

    const parsed = idempotencyKeySchema.safeParse(raw)
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((issue) => ({
          key: IDEMPOTENCY_HEADER,
          message: issue.message,
        })),
      )
    }

    const session = c.get("session")
    const scope: Scope = {
      requester: { userId: session.userId, sessionId: session.sessionId },
      companyId: c.req.param("companyId") ?? null,
      key: parsed.data,
    }

    const endpoint = `${method} ${c.req.path}`
    const fingerprint = fingerprintOf(method, c.req.path, await bodyOf(c))
    const claimed = await claim(scope, endpoint, fingerprint)
    const decision = decideIdempotency(claimed.record, fingerprint)

    switch (decision.kind) {
      case "mismatch":
        throw new IdempotencyKeyReusedError()

      case "in_flight":
        throw new IdempotencyInFlightError()

      case "replay":
        c.header("idempotent-replay", "true")
        return decision.body === null
          ? c.body(null, decision.status as 204)
          : c.json(decision.body, decision.status as 200)

      case "proceed":
        break
    }

    try {
      await next()
    } catch (error) {
      // Un fallo no previsto suelta la clave por la misma razón que un error de dominio: lo que
      // pasó no es un resultado que repetir.
      await release(scope, claimed.id)
      throw error
    }

    const status = c.res.status

    if (status < 200 || status >= 300) {
      await release(scope, claimed.id)
      return
    }

    // `clone()` y no `text()`: consumir el cuerpo aquí dejaría al cliente sin respuesta.
    const text = await c.res.clone().text()
    await complete(scope, claimed.id, status, text === "" ? null : safeParse(text))
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
