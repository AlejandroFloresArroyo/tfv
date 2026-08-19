/**
 * Las tres compuertas, y por qué son tres.
 *
 * Ver `openspec/specs/subscriptions-and-entitlements/spec.md`, requisitos «Habilitación de
 * servicios por clave» y «Las tres compuertas son independientes».
 *
 * | Compuerta | Pregunta | Dónde vive |
 * |---|---|---|
 * | Suscripción | ¿La empresa está al corriente? | aquí |
 * | Habilitación | ¿Tiene contratado ese servicio? | aquí |
 * | Permiso | ¿El rol de esta persona lo autoriza? | `auth/authorization.ts` |
 *
 * **Superar una no implica superar las otras**, y la spec dedica un requisito entero a decirlo
 * porque es fácil colapsarlas por descuido: un propietario elude el permiso y sigue sin tener el
 * servicio contratado; un servicio contratado no le da permiso a nadie.
 *
 * ## De dónde sale el servicio de una operación
 *
 * De la propia clave de permiso. Toda clave se lee `<servicio>.<recurso>.<acción>` y su primer
 * nivel **es** `services.keycode` —lo dice el catálogo—, salvo `companies`, que es el núcleo común
 * y no un servicio contratable.
 *
 * Derivarlo así en lugar de declararlo ruta por ruta es lo que cumple «la comprobación SHALL
 * realizarse en el servidor en cada operación del servicio»: no hay ninguna operación de servicio
 * que se pueda escribir sin que la compuerta la mire, ni forma de olvidarse de declararla. Es la
 * misma lección que `defineRoute`, donde olvidar el gancho de autenticación dejaba la ruta abierta
 * (`DEFECTS.md` S-05).
 */

import { DomainError, PERMISSION_CATALOG, type PermissionKey } from "@tfv/contracts"
import { OPERATING_STATUSES, type SubscriptionStatus } from "@tfv/contracts/billing"
import { db } from "@tfv/db"
import { companyServices, companySubscriptions, services, subscriptionPlans } from "@tfv/db/schema"
import { and, eq, ne } from "drizzle-orm"
import { env } from "../env.ts"

/** El núcleo común. Sus permisos no dependen de tener nada contratado. */
const CORE = "companies"

/** Las claves de servicio del catálogo, que son las mismas que `services.keycode`. */
export const SERVICE_KEYCODES: readonly string[] = Object.keys(PERMISSION_CATALOG).filter(
  (key) => key !== CORE,
)

/** Qué servicio hay que tener contratado para ejercer esta clave. Nulo si es del núcleo. */
export function serviceOf(permission: PermissionKey | string): string | null {
  const service = permission.split(".")[0]
  if (service === undefined || service === CORE) return null
  return SERVICE_KEYCODES.includes(service) ? service : null
}

// ─── Errores ─────────────────────────────────────────────────────────────────

/**
 * La empresa no tiene contratado el servicio.
 *
 * `403` y no `404`: a diferencia de pedir el recurso de otro arrendatario, aquí no hay nada que
 * ocultar —la empresa es suya— y lo que necesita saber quien lo pide es que le falta contratar
 * algo. El código lo distingue del permiso, que es lo que permite a la interfaz decir cuál de las
 * dos cosas falta en lugar de un «no tienes permiso» que despista.
 */
export class ServiceNotEnabledError extends DomainError {
  readonly status = 403 as const
  readonly code = "service_not_enabled"

  constructor(keycode: string) {
    super(`Esta empresa no tiene contratado el servicio «${keycode}»`, { service: keycode })
  }
}

/**
 * La empresa no tiene suscripción vigente.
 *
 * Su código propio es lo que hace que la interfaz pueda presentar «la selección de plan de forma
 * bloqueante», que es lo que la spec pide con esas palabras, en lugar de un error genérico.
 */
export class SubscriptionRequiredError extends DomainError {
  readonly status = 403 as const
  readonly code = "subscription_required"

  constructor(reason: "sin_suscripcion" | "vencida") {
    super(
      reason === "sin_suscripcion"
        ? "Esta empresa no tiene ninguna suscripción. Elige un plan para continuar."
        : "La suscripción de esta empresa terminó. Elige un plan para continuar.",
      { reason },
    )
  }
}

// ─── Estado de la suscripción ────────────────────────────────────────────────

export interface SubscriptionState {
  readonly id: string
  readonly status: SubscriptionStatus
  readonly planId: string
  readonly planTier: number
  readonly planTitle: string
  readonly seats: number
  readonly cancelAtPeriodEnd: boolean
  readonly periodStart: Date | null
  readonly periodEnd: Date | null
  readonly gracePeriodEndsAt: Date | null
  readonly discountPercent: string | null
  readonly promotionCode: string | null
  readonly externalSubscriptionId: string | null
  readonly interval: string
  /** ¿La empresa conserva sus funciones ahora mismo? */
  readonly isOperating: boolean
}

/**
 * ¿Conserva sus funciones?
 *
 * Tres condiciones, y la tercera es la que corrige `DEFECTS.md` M-08: en pago pendiente la empresa
 * **sigue operando** mientras dure la gracia. La pila anterior eliminaba la suscripción ante el
 * primer fallo de cobro y tumbaba la empresa entera —y sus tiendas públicas— por un rechazo
 * transitorio de tarjeta.
 *
 * Cancelar tampoco corta nada: la cancelación surte efecto al terminar el periodo pagado, así que
 * lo que manda es la fecha y no la marca.
 */
export function isOperating(
  row: {
    readonly status: SubscriptionStatus
    readonly periodEnd: Date | null
    readonly gracePeriodEndsAt: Date | null
  },
  now: Date = new Date(),
): boolean {
  if (!OPERATING_STATUSES.includes(row.status)) return false

  if (row.status === "past_due") {
    // Sin plazo de gracia anotado no se puede afirmar que siga vigente. Se toma el fin de periodo,
    // que es lo que había pagado.
    const until = row.gracePeriodEndsAt ?? row.periodEnd
    return until === null || until.getTime() > now.getTime()
  }

  return row.periodEnd === null || row.periodEnd.getTime() > now.getTime()
}

// ─── Resolución ──────────────────────────────────────────────────────────────

export interface Entitlements {
  readonly companyId: string
  /** Claves de los servicios contratados. */
  readonly services: readonly string[]
  readonly subscription: SubscriptionState | null
}

/**
 * Lo que una empresa tiene contratado, en una consulta por compuerta.
 *
 * No se juntan en una sola: la habilitación se pregunta en cada operación de servicio y la
 * suscripción sólo donde hace falta. Traer las dos siempre pagaría el segundo viaje en la ruta
 * caliente para tirarlo.
 */
export async function resolveEntitlements(companyId: string): Promise<Entitlements> {
  const [enabled, subscription] = await Promise.all([
    enabledServices(companyId),
    readSubscription(companyId),
  ])

  return { companyId, services: enabled, subscription }
}

export async function enabledServices(companyId: string): Promise<readonly string[]> {
  const rows = await db
    .select({ keycode: services.keycode })
    .from(companyServices)
    .innerJoin(services, eq(services.id, companyServices.serviceId))
    .where(and(eq(companyServices.companyId, companyId), eq(services.isDisabled, false)))

  return rows.map((row) => row.keycode)
}

/**
 * La suscripción vigente de una empresa, o nula.
 *
 * «Vigente» aquí es «no cancelada»: una cancelada terminó y no dice nada del presente. El índice
 * único de la tabla garantiza que no haya dos.
 */
export async function readSubscription(companyId: string): Promise<SubscriptionState | null> {
  const [row] = await db
    .select({
      id: companySubscriptions.id,
      status: companySubscriptions.status,
      planId: companySubscriptions.planId,
      planTier: subscriptionPlans.tier,
      planTitle: subscriptionPlans.title,
      seats: companySubscriptions.seats,
      cancelAtPeriodEnd: companySubscriptions.cancelAtPeriodEnd,
      periodStart: companySubscriptions.periodStart,
      periodEnd: companySubscriptions.periodEnd,
      gracePeriodEndsAt: companySubscriptions.gracePeriodEndsAt,
      discountPercent: companySubscriptions.discountPercent,
      promotionCode: companySubscriptions.promotionCode,
      externalSubscriptionId: companySubscriptions.externalSubscriptionId,
      interval: companySubscriptions.interval,
    })
    .from(companySubscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, companySubscriptions.planId))
    .where(
      and(
        eq(companySubscriptions.companyId, companyId),
        ne(companySubscriptions.status, "canceled"),
      ),
    )
    .limit(1)

  if (!row) return null

  return { ...row, isOperating: isOperating(row) }
}

// ─── Las compuertas ──────────────────────────────────────────────────────────

/**
 * ¿Tiene habilitado el servicio, por su clave?
 *
 * Por **clave** y no por identificador, que es lo que la spec pide con esas palabras: el
 * identificador de un servicio es distinto en cada base y no se puede escribir en el código.
 */
export async function hasService(companyId: string, keycode: string): Promise<boolean> {
  const [row] = await db
    .select({ id: companyServices.id })
    .from(companyServices)
    .innerJoin(services, eq(services.id, companyServices.serviceId))
    .where(
      and(
        eq(companyServices.companyId, companyId),
        eq(services.keycode, keycode),
        eq(services.isDisabled, false),
      ),
    )
    .limit(1)

  return row !== undefined
}

export async function assertServiceEnabled(companyId: string, keycode: string): Promise<void> {
  if (!(await hasService(companyId, keycode))) throw new ServiceNotEnabledError(keycode)
}

/**
 * Exige suscripción vigente.
 *
 * Se usa donde la spec lo nombra —y, cuando la compuerta está encendida, en toda operación de
 * negocio—.
 */
export async function assertSubscriptionOperating(companyId: string): Promise<void> {
  const subscription = await readSubscription(companyId)
  if (!subscription) throw new SubscriptionRequiredError("sin_suscripcion")
  if (!subscription.isOperating) throw new SubscriptionRequiredError("vencida")
}

/**
 * ¿Se exige suscripción en toda operación de negocio?
 *
 * **Llega apagada, y eso no es que esté sin hacer.** La compuerta funciona y está probada en las
 * dos posiciones; lo que falta para encenderla es que las empresas tengan suscripción, y eso lo
 * trae el trasvase de datos de la rebanada 30. Encendida hoy, ninguna empresa existente podría
 * abrir nada — ni siquiera para contratar. Ver `HALLAZGOS.md` H-86.
 *
 * El interruptor de prueba imita al del procesador: devuelve cómo deshacerlo, de modo que una
 * prueba no pueda dejarla puesta para las siguientes.
 */
let gateOverride: boolean | null = null

export function subscriptionGateOn(): boolean {
  return gateOverride ?? env.BILLING_SUBSCRIPTION_GATE
}

export function useSubscriptionGate(on: boolean): () => void {
  const previous = gateOverride
  gateOverride = on
  return () => {
    gateOverride = previous
  }
}
