import { Badge, type BadgeTone } from "@tfv/ui"
import { getTranslations } from "next-intl/server"
import type { ItemStatus } from "../../production.ts"

/**
 * La temperatura de cada estado de un artículo.
 *
 * Ocho estados y siete temperaturas, así que hay colisiones — **y son deliberadas**. La temperatura
 * dice la *clase de situación*; el nombre, que siempre viaja al lado, dice cuál exactamente. Es lo
 * que `DESIGN.md` llama la regla del color que no viaja solo, y es lo que hace que ocho etiquetas
 * se puedan leer de un vistazo sin memorizar ocho colores.
 *
 * | Temperatura | Qué clase de situación |
 * |---|---|
 * | `firme` | Está y se puede usar |
 * | `reposo` | Sin compromiso activo: guardado en una caja, o devuelto a su dueño |
 * | `aparta` | Comprometido y fuera de la bodega |
 * | `cuida` | Está, pero con algo mal |
 * | `alto` | No está, y no por decisión de nadie |
 *
 * Dos elecciones que no son obvias:
 *
 * **`delivered` va en oro y no en verde**, aunque `DESIGN.md` glose `firme` como «entregado». En un
 * inventario la primera pregunta no es si el trámite salió bien, es **si la cosa está**; el oro es
 * el estado propio de TFV para la pieza física comprometida, y entregado es exactamente eso. Con
 * `firme` compartiría color con `available`, que es justo la distinción que hay que ver.
 *
 * **`stored` y `returned` comparten `reposo`** porque comparten lo que importa: ninguno de los dos
 * está en juego. Uno está en una caja aquí y el otro se fue para siempre, y eso lo dice el nombre.
 *
 * Y coincide con el almacén en lo que ya estaba decidido allí: dañado e incompleto son aviso,
 * perdido y robado son peligro. Dos criterios distintos para el mismo objeto físico en dos
 * pantallas del mismo sistema es la asimetría que después nadie sabe explicar.
 */
const STATUS_TONE: Record<ItemStatus, BadgeTone> = {
  available: "firme",
  stored: "reposo",
  delivered: "aparta",
  returned: "reposo",
  damaged: "cuida",
  incomplete: "cuida",
  lost: "alto",
  robbed: "alto",
}

export async function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const t = await getTranslations("productions.items")
  return <Badge tone={STATUS_TONE[status]}>{t(`state.${status}`)}</Badge>
}

/** La misma marca, para las pantallas de cliente que no pueden esperar a una traducción. */
export function itemStatusTone(status: ItemStatus): BadgeTone {
  return STATUS_TONE[status]
}
