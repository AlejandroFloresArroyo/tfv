import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "../lib/cn.ts"

/**
 * Las temperaturas del sistema, en el mismo orden y con los mismos nombres que los tokens.
 *
 * No son una paleta de marca inventada: son las fuentes de luz con las que esta industria trabaja.
 * Tungsteno a 3200 K, HMI a 5600 K, la magenta de la hora mágica, el rojo de la luz de seguridad.
 * Cada estado toma una, así que el color dice algo antes de que nadie lea la etiqueta.
 *
 * Los cinco últimos nombres son los del sistema anterior y siguen funcionando para que las
 * pantallas ya escritas no se rompan.
 */
export type Tint =
  | "reposo"
  | "curso"
  | "firme"
  | "aparta"
  | "cuida"
  | "alto"
  | "leido"
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"

const TINTS: Record<Tint, { tint: string; ink: string; luz: string }> = {
  reposo: { tint: "tint-reposo", ink: "text-tinta-reposo", luz: "bg-luz-reposo" },
  curso: { tint: "tint-curso", ink: "text-tinta-curso", luz: "bg-luz-curso" },
  firme: { tint: "tint-firme", ink: "text-tinta-firme", luz: "bg-luz-firme" },
  aparta: { tint: "tint-aparta", ink: "text-tinta-aparta", luz: "bg-luz-aparta" },
  cuida: { tint: "tint-cuida", ink: "text-tinta-cuida", luz: "bg-luz-cuida" },
  alto: { tint: "tint-alto", ink: "text-tinta-alto", luz: "bg-luz-alto" },
  leido: { tint: "tint-leido", ink: "text-tinta-leido", luz: "bg-luz-leido" },
  neutral: { tint: "tint-reposo", ink: "text-tinta-reposo", luz: "bg-luz-reposo" },
  accent: { tint: "tint-aparta", ink: "text-tinta-aparta", luz: "bg-luz-aparta" },
  success: { tint: "tint-firme", ink: "text-tinta-firme", luz: "bg-luz-firme" },
  warning: { tint: "tint-cuida", ink: "text-tinta-cuida", luz: "bg-luz-cuida" },
  danger: { tint: "tint-alto", ink: "text-tinta-alto", luz: "bg-luz-alto" },
}

/** Compatibilidad: el nombre que usaban las pantallas ya escritas. */
export type BadgeTone = Tint

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** La temperatura de la que sale el degradado. Sin ella la tarjeta es neutra. */
  tint?: Tint | undefined
  /**
   * La tarjeta reacciona al ratón.
   *
   * Sólo para las que llevan a algún sitio. Encender una tarjeta de sólo lectura enseña a la gente
   * a desconfiar de la señal, que es peor que no tenerla.
   */
  live?: boolean | undefined
}

/**
 * Superficie. La unidad de agrupación de todo el panel.
 *
 * Lleva su degradado teñido, su filo superior de luz y su sombra. Al pasar el ratón —si es viva—
 * suben el degradado y el borde, **y nada se mueve**: en una rejilla densa una tarjeta que se
 * levanta obliga al ojo a recolocar todo lo que tiene al lado.
 */
export function Panel({ tint, live = false, className, ...rest }: PanelProps) {
  return (
    <div
      className={cn("card", tint && TINTS[tint].tint, live && "card-live", className)}
      {...rest}
    />
  )
}

export function Separator({ className, ...rest }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn("border-0 border-edge border-t", className)} {...rest} />
}

/**
 * Marca de estado.
 *
 * Un punto de la temperatura pura junto al nombre del estado, siempre los dos. El color acelera la
 * lectura de quien ya conoce el sistema; el nombre es lo que lo hace utilizable por quien no, y
 * por quien no distingue el ámbar del verde. Once estados de unidad y cuatro tipos de pedido no
 * caben en una paleta que alguien pueda memorizar.
 */
export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tint
  className?: string
  children: ReactNode
}) {
  const { ink, luz, tint } = TINTS[tone]

  return (
    <span
      className={cn(
        // `w-fit` y no sólo `inline-flex`: dentro de una columna flexible los hijos se estiran en
        // el eje transversal, y una insignia estirada de borde a borde deja de leerse como marca y
        // se lee como barra de relleno.
        "inline-flex w-fit items-center gap-1.5 rounded-md border border-edge px-2 py-1 legend",
        "bg-[color-mix(in_oklab,var(--luz)_14%,var(--panel))]",
        tint,
        ink,
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", luz)} aria-hidden="true" />
      {children}
    </span>
  )
}

/**
 * Marcador de contenido que aún no llegó.
 *
 * Con `aria-hidden`: para un lector de pantalla, describir cajas grises no es información. Lo que
 * anuncia la espera es el `role="status"` de quien lo envuelve.
 */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-panel-sunken", className)}
      {...rest}
    />
  )
}

/**
 * Iniciales de una persona o empresa, como sustituto de imagen.
 *
 * Toma las iniciales de hasta dos palabras. No intenta ser listo con nombres compuestos: acierta en
 * el caso común y no estorba en el resto.
 */
export function Avatar({
  name,
  className,
  size = "md",
}: {
  name: string
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?"

  const sizes = { sm: "size-7 text-body4", md: "size-9 text-body3", lg: "size-12 text-body1" }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-lg bg-accent font-bold text-on-accent",
        sizes[size],
        className,
      )}
    >
      {initials}
    </span>
  )
}

/**
 * La casilla de una hoja de llamado: un hecho duro con su nombre encima.
 *
 * Es la pieza de la que está hecha la cabecera de un llamado —día 4 de 18, citación 06:30, salida
 * del sol 07:12— y aquí sirve para lo mismo: un dato que no cambia mientras miras la pantalla. El
 * número va grande y en la voz de display, porque en un llamado el dato se busca de un vistazo
 * desde el otro lado de la mesa.
 */
export function Fact({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: ReactNode
  hint?: string | undefined
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="legend text-content-faint">{label}</span>
      <span className="display text-h3 text-content tnum">{value}</span>
      {hint ? <span className="text-body3 text-content-muted">{hint}</span> : null}
    </div>
  )
}

export interface StatCardProps extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "title"> {
  label: string
  value: ReactNode
  /** La dirección del dato. Una cantidad sin ella obliga a recordar la de ayer. */
  trend?: string | undefined
  tint?: Tint | undefined
  live?: boolean | undefined
}

/**
 * La tarjeta de tablero: una cifra grande, su nombre y su temperatura.
 *
 * Es lo que pide un tablero — que la magnitud se lea antes que la etiqueta— y es donde el degradado
 * hace su trabajo: la temperatura dice de qué es la cifra antes de leerla.
 */
export function StatCard({
  label,
  value,
  trend,
  tint = "reposo",
  live = false,
  className,
  ...rest
}: StatCardProps) {
  return (
    <Panel tint={tint} live={live} className={cn("flex flex-col gap-2 p-5", className)} {...rest}>
      <span className="legend text-content-faint">{label}</span>
      <span className="display text-h1 text-content tnum">{value}</span>
      {trend ? <span className={cn("text-body3", TINTS[tint].ink)}>{trend}</span> : null}
    </Panel>
  )
}
