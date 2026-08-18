import { Badge, type BadgeTone } from "@tfv/ui"
import { getTranslations } from "next-intl/server"
import type { QuoteStatus } from "../../warehouse.ts"

/**
 * El tono dice en qué fase está, no si es «bueno».
 *
 * Cancelada es peligro y completada es éxito, pero **en renta es aviso**: hay equipo fuera de la
 * nave, que es la situación que alguien tiene que vigilar. Pintarla de verde por estar «avanzada»
 * escondería justo lo que hay que mirar.
 */
const STATUS_TONE: Record<QuoteStatus, BadgeTone> = {
  pre_quote: "neutral",
  pending: "neutral",
  in_progress: "accent",
  in_rent: "warning",
  completed: "success",
  sold: "success",
  canceled: "danger",
}

export async function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const t = await getTranslations("warehouses.quotes")
  return <Badge tone={STATUS_TONE[status]}>{t(`state.${status}`)}</Badge>
}

export async function QuoteTypeBadge({ type }: { type: "rent" | "sale" }) {
  const t = await getTranslations("warehouses.quotes")
  return <Badge>{t(`kind.${type}`)}</Badge>
}
