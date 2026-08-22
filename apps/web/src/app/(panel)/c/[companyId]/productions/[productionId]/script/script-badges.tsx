import { Badge, type BadgeTone } from "@tfv/ui"
import { getTranslations } from "next-intl/server"
import type { SyncStatus } from "../../production.ts"

/**
 * La temperatura de cada estado de extracción.
 *
 * `completed` cae **exactamente** sobre `leido` de `DESIGN.md` — «extraído por el modelo, sin
 * revisar», hora mágica—, que es justo lo que significa: el guion tiene una extracción vigente y
 * nadie la ha repasado todavía. `not_extracted` es reposo — sin comprometer, y es donde vive todo
 * guion hoy, porque la extracción es la rebanada 21 y no existe—. `queued` y `running` son curso —
 * en proceso—, y `failed` es alto — bloqueado.
 */
const SYNC_TONE: Record<SyncStatus, BadgeTone> = {
  not_extracted: "reposo",
  queued: "curso",
  running: "curso",
  completed: "leido",
  failed: "alto",
}

export async function SyncStatusBadge({ status }: { status: SyncStatus }) {
  const t = await getTranslations("productions.script")
  return <Badge tone={SYNC_TONE[status]}>{t(`syncStatus.${status}`)}</Badge>
}
