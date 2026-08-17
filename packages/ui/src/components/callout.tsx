import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../lib/cn.ts"

export type CalloutTone = "info" | "success" | "warning" | "danger"

const TONES: Record<CalloutTone, { box: string; icon: typeof Info }> = {
  info: {
    box: "border-blue-3 bg-blue-0 text-blue-9 dark:border-blue-8 dark:bg-blue-9/25 dark:text-blue-1",
    icon: Info,
  },
  success: {
    box: "border-green-3 bg-green-0 text-green-9 dark:border-green-8 dark:bg-green-9/25 dark:text-green-1",
    icon: CheckCircle2,
  },
  warning: {
    box: "border-yellow-3 bg-yellow-0 text-yellow-9 dark:border-yellow-8 dark:bg-yellow-9/25 dark:text-yellow-1",
    icon: AlertTriangle,
  },
  danger: {
    box: "border-red-3 bg-red-0 text-red-9 dark:border-red-8 dark:bg-red-9/25 dark:text-red-1",
    icon: XCircle,
  },
}

export interface CalloutProps {
  tone?: CalloutTone
  children: ReactNode
  className?: string
  /**
   * Anuncia el mensaje en cuanto aparece.
   *
   * Se activa para los errores de envío de un formulario: sin esto, quien navega con lector de
   * pantalla envía, no oye nada, y no tiene forma de saber que la página cambió.
   */
  live?: boolean
}

export function Callout({ tone = "info", children, className, live }: CalloutProps) {
  const { box, icon: Icon } = TONES[tone]

  return (
    <div
      role={live ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-sm border px-3 py-2.5 text-body2",
        box,
        className,
      )}
    >
      <Icon className="mt-px size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
