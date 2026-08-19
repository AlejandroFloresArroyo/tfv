import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../lib/cn.ts"

export type CalloutTone = "info" | "success" | "warning" | "danger"

/**
 * Aviso.
 *
 * Caja rayada, sin relleno tintado. El sistema anterior pintaba el fondo del color del tono y el
 * texto de una variante oscura del mismo, que es la disposición por defecto de la categoría y trae
 * dos problemas: obliga a mantener veinte pares fondo/texto medidos en dos temas, y hace que un
 * aviso largo se lea sobre un color en vez de sobre el papel.
 *
 * Aquí el tono vive en el **icono y la marca**, y el texto se queda en la tinta normal. El icono
 * no es adorno: es la señal que no depende del color, y por eso cada tono tiene una forma distinta
 * —círculo, palomita, triángulo, aspa— y no el mismo icono repintado.
 */
const TONES: Record<CalloutTone, { ink: string; icon: typeof Info }> = {
  info: { ink: "text-tinta-curso", icon: Info },
  success: { ink: "text-tinta-firme", icon: CheckCircle2 },
  warning: { ink: "text-tinta-cuida", icon: AlertTriangle },
  danger: { ink: "text-tinta-alto", icon: XCircle },
}

export interface CalloutProps {
  tone?: CalloutTone
  children: ReactNode
  className?: string
  /**
   * Nombre del tono, en el idioma de la aplicación.
   *
   * El sistema de diseño no habla ningún idioma —la aplicación se sirve en dos—, así que la palabra
   * la pone quien lo usa. Sin ella el aviso sigue siendo correcto: la forma del icono ya distingue
   * los cuatro tonos sin recurrir al color.
   */
  label?: string | undefined
  /**
   * Anuncia el mensaje en cuanto aparece.
   *
   * Se activa para los errores de envío de un formulario: sin esto, quien navega con lector de
   * pantalla envía, no oye nada, y no tiene forma de saber que la página cambió.
   */
  live?: boolean
}

export function Callout({ tone = "info", children, className, label, live }: CalloutProps) {
  const { ink, icon: Icon } = TONES[tone]

  return (
    <div
      role={live ? "alert" : undefined}
      className={cn("rule flex items-start gap-2.5 bg-panel px-3 py-2.5 text-body2", className)}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", ink)} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-content">
        {label ? <span className={cn("mb-0.5 block apparatus", ink)}>{label}</span> : null}
        {children}
      </div>
    </div>
  )
}
