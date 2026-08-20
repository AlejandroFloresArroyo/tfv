import { Badge, type BadgeTone } from "@tfv/ui"
import { getTranslations } from "next-intl/server"
import type { DeliveryDirection, DeliveryStatus } from "../../production.ts"

/**
 * La temperatura de cada estado de una nota.
 *
 * Los cuatro caen **exactamente** sobre las glosas de `DESIGN.md`, sin forzar ninguna: pendiente es
 * borrador sin comprometer, en curso es en proceso, completada es entregado y aprobado, cancelada
 * es rechazado. Cuando el mapa sale así de limpio suele ser señal de que los estados de la entidad
 * están bien nombrados.
 */
const STATUS_TONE: Record<DeliveryStatus, BadgeTone> = {
  pending: "reposo",
  in_progress: "curso",
  completed: "firme",
  canceled: "alto",
}

export async function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  const t = await getTranslations("productions.deliveries")
  return <Badge tone={STATUS_TONE[status]}>{t(`state.${status}`)}</Badge>
}

/**
 * Salida o devolución.
 *
 * **Sin temperatura**, y a propósito: la dirección no es un estado, es de qué clase de documento se
 * trata. Darle color la pondría a competir con el estado, que es lo que sí cambia y lo que sí hay
 * que vigilar. Es la misma decisión que toma el almacén con renta o venta.
 */
export async function DeliveryDirectionBadge({ direction }: { direction: DeliveryDirection }) {
  const t = await getTranslations("productions.deliveries")
  return <Badge>{t(`way.${direction}`)}</Badge>
}
