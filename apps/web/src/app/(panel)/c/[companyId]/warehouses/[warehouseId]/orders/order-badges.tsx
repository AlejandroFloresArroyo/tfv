import { Badge, type BadgeTone } from "@tfv/ui"
import { getTranslations } from "next-intl/server"
import type { OrderStatus } from "../../warehouse.ts"

/**
 * El estado de un pedido, con su tono.
 *
 * Los tonos no son decoración: separan lo que espera decisión —pendiente— de lo que ya está en
 * marcha y de lo que terminó, que es lo que se busca al recorrer una bandeja de treinta.
 */
const TONES: Record<OrderStatus, BadgeTone> = {
  pending: "warning",
  accepted: "accent",
  delivered: "accent",
  finished: "success",
  canceled: "neutral",
}

export async function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = await getTranslations("warehouses.orders")
  return <Badge tone={TONES[status]}>{t(`state.${status}`)}</Badge>
}
