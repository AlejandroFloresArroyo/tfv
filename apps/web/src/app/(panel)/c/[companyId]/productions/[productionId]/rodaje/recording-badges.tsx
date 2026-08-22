import { Badge, type BadgeTone } from "@tfv/ui"
import { getTranslations } from "next-intl/server"
import type { RecordingKind, RecordingStatus } from "../../production.ts"

/**
 * La temperatura de una jornada.
 *
 * Es la misma correspondencia que ya usa el calendario de planes de trabajo
 * (`workflows/calendar/calendar-view.tsx`, `RECORDING_TINT`), y aquí se repite en vez de
 * importarse: el calendario pinta la rejilla con clases de fondo (`bg-luz-*`) para sus puntos, y
 * esta pantalla necesita la insignia con nombre (`Badge`), que es otro componente. La
 * correspondencia semántica es la que hay que mantener igual, no el código que la aplica.
 *
 * | Estado | Significa | Temperatura |
 * |---|---|---|
 * | `draft` | Programada, sin reparto todavía | `reposo` |
 * | `ongoing` | Con reparto asignado, en curso | `curso` |
 * | `completed` | Cerrada | `firme` |
 */
const STATUS_TONE: Record<RecordingStatus, BadgeTone> = {
  draft: "reposo",
  ongoing: "curso",
  completed: "firme",
}

export async function RecordingStatusBadge({ status }: { status: RecordingStatus }) {
  const t = await getTranslations("productions.recordingStatus")
  return <Badge tone={STATUS_TONE[status]}>{t(status)}</Badge>
}

export function recordingStatusTone(status: RecordingStatus): BadgeTone {
  return STATUS_TONE[status]
}

export async function RecordingKindBadge({ kind }: { kind: RecordingKind }) {
  const t = await getTranslations("productions.recordings.kind")
  return <Badge tone="neutral">{t(kind)}</Badge>
}
