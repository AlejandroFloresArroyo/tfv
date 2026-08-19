import type { BadgeTone } from "@tfv/ui"

/**
 * Lo que la pantalla de plan lee de la API.
 *
 * Vive aparte de la página porque lo comparten la página —de servidor— y las acciones —de cliente—,
 * y `page.tsx` no puede importarse desde el navegador.
 */

export interface PlanPrice {
  readonly id: string
  readonly interval: string
  readonly intervalCount: number
  /** Cadena decimal. Nunca número: es dinero. */
  readonly unitAmount: string
  readonly currency: string
}

export interface PlanFeature {
  readonly key: string
  readonly name: string
  readonly value?: string | number | boolean
}

export interface Plan {
  readonly id: string
  readonly tier: number
  readonly title: string
  readonly description: string
  readonly isIndividual: boolean
  readonly isRecommended: boolean
  readonly features: readonly PlanFeature[]
  readonly prices: readonly PlanPrice[]
}

export interface Subscription {
  readonly id: string
  readonly status: string
  readonly planId: string
  readonly planTier: number
  readonly planTitle: string
  readonly seats: number
  readonly cancelAtPeriodEnd: boolean
  readonly periodStart: string | null
  readonly periodEnd: string | null
  readonly gracePeriodEndsAt: string | null
  readonly discountPercent: string | null
  readonly promotionCode: string | null
  readonly interval: string
  readonly isOperating: boolean
}

export interface Entitlements {
  readonly companyId: string
  readonly services: readonly string[]
  readonly subscription: Subscription | null
}

export function priceFor(plan: Plan, interval: string): PlanPrice | undefined {
  return plan.prices.find((price) => price.interval === interval)
}

/**
 * De qué color va cada estado.
 *
 * Pago pendiente es **aviso, no error**: la empresa sigue funcionando durante la gracia, y pintarlo
 * en rojo diría lo contrario de lo que pasa.
 */
export function statusTone(status: string): BadgeTone {
  if (status === "active" || status === "trialing") return "success"
  if (status === "past_due") return "warning"
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    return "danger"
  }
  return "neutral"
}
