import type { ReactNode } from "react"

/** Encabezado común de las pantallas de acceso: un título y una frase que explique qué se pide. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-h3 font-bold tracking-tight text-content">{title}</h1>
        {subtitle ? <p className="text-body1 text-content-muted">{subtitle}</p> : null}
      </div>

      {children}

      {footer ? <div className="text-body2 text-content-muted">{footer}</div> : null}
    </div>
  )
}
