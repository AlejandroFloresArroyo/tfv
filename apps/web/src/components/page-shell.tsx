import type { ReactNode } from "react"

/**
 * Contenedor de página con sus ranuras.
 *
 * Una sola definición del ancho máximo, del relleno y de la separación entre encabezado y
 * contenido. Repartida por cada pantalla, esa decisión se desincroniza en la tercera.
 */
export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <main
      id="contenido"
      className="mx-auto w-full max-w-(--breakpoint-desktop) flex-1 px-4 py-6 tablet:px-6 tablet:py-8"
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* La voz de display: en este mundo algo en la pantalla es grande y manda, y el título de
            la página es ese algo. La expansión sale del eje de ancho de la propia familia. */}
          <h1 className="display text-h2 text-content">{title}</h1>
          {subtitle ? <p className="mt-1 text-body1 text-content-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>

      {children}
    </main>
  )
}
