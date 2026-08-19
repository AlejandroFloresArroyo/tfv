import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "../lib/cn.ts"

/**
 * Superficie. La unidad de agrupación visual de todo el panel.
 *
 * Se separa del lienzo por **escalón de valor y filete**, nunca por sombra ni por esquina
 * redondeada. Es la regla que más cambia el aspecto de la aplicación respecto del sistema anterior,
 * y la que responde a que las superficies no se distinguían: una sombra difusa sugiere separación,
 * un filete la afirma.
 */
export function Panel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rule bg-panel", className)} {...rest} />
}

export function Separator({ className, ...rest }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn("rule-t border-0", className)} {...rest} />
}

/**
 * La escalera semántica, en el mismo orden y con los mismos nombres que los tokens.
 *
 * Los cinco primeros nombres son los del sistema anterior y siguen funcionando para que las
 * pantallas ya escritas no se rompan. Los siete de abajo son los de este mundo, y dos de ellos no
 * existían: `aparta`, que es el estado propio de TFV —la unidad física apartada contra una
 * cotización—, y `leido`, que es lo que el modelo extrajo del guion y falta revisar.
 */
export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "reposo"
  | "curso"
  | "firme"
  | "aparta"
  | "cuida"
  | "alto"
  | "leido"

const TONES: Record<BadgeTone, { mark: string; ink: string }> = {
  reposo: { mark: "text-marca-reposo", ink: "text-tinta-reposo" },
  curso: { mark: "text-marca-curso", ink: "text-tinta-curso" },
  firme: { mark: "text-marca-firme", ink: "text-tinta-firme" },
  aparta: { mark: "text-marca-aparta", ink: "text-tinta-aparta" },
  cuida: { mark: "text-marca-cuida", ink: "text-tinta-cuida" },
  alto: { mark: "text-marca-alto", ink: "text-tinta-alto" },
  leido: { mark: "text-marca-leido", ink: "text-tinta-leido" },
  // Vocabulario anterior, mapeado a la escalera.
  neutral: { mark: "text-marca-reposo", ink: "text-tinta-reposo" },
  accent: { mark: "text-marca-curso", ink: "text-tinta-curso" },
  success: { mark: "text-marca-firme", ink: "text-tinta-firme" },
  warning: { mark: "text-marca-cuida", ink: "text-tinta-cuida" },
  danger: { mark: "text-marca-alto", ink: "text-tinta-alto" },
}

/**
 * Marca de estado.
 *
 * No es un chip de color de fondo: es una **muesca trazada** junto al nombre del estado. Los dos
 * juntos, siempre, y por dos razones que apuntan al mismo sitio.
 *
 * La primera es de accesibilidad y no se negocia: quien no distingue el verde del ámbar tiene que
 * poder leer en qué estado está una cotización. Un chip que sólo se diferencia por su tinte deja a
 * esa persona fuera.
 *
 * La segunda es de oficio: once estados de unidad y cuatro tipos de pedido no caben en una paleta
 * que alguien pueda memorizar. Quien entra por primera vez no tiene que aprenderse ninguna leyenda
 * si la leyenda viaja pegada a la marca.
 *
 * La muesca se llena cuando el estado es **terminal** —entregado, pagado, rechazado—: un estado
 * del que ya no se sale se dibuja macizo, y uno en el que todavía se puede intervenir se dibuja
 * hueco. Se lee sin leer.
 */
export function Badge({
  tone = "neutral",
  filled = false,
  className,
  children,
}: {
  tone?: BadgeTone
  /** Estado terminal: la muesca se dibuja maciza en lugar de hueca. */
  filled?: boolean
  className?: string
  children: ReactNode
}) {
  const { mark, ink } = TONES[tone]

  return (
    <span className={cn("inline-flex items-center gap-1.5 apparatus", ink, className)}>
      <span className={cn("detent", mark, filled && "detent-filled")} aria-hidden="true" />
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
    <div aria-hidden="true" className={cn("animate-pulse bg-panel-hover", className)} {...rest} />
  )
}

/**
 * Iniciales de una persona o empresa, como sustituto de imagen.
 *
 * Cuadrada, no circular. En este mundo no hay una sola esquina redondeada, y el círculo del sistema
 * anterior era además la única forma que no se alineaba con nada: junto a una tabla de filas
 * rectas, un disco flota.
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

  const sizes = { sm: "size-6 text-body4", md: "size-8 text-body3", lg: "size-12 text-body1" }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center bg-accent font-bold text-on-accent tabular-nums",
        sizes[size],
        className,
      )}
    >
      {initials}
    </span>
  )
}

/**
 * El raíl de claves.
 *
 * La única pieza móvil de la composición: una columna estrecha que corre junto al contenido y lleva
 * las claves de cada bloque, con una muesca cortada donde cambia el pie. Es lo que sustituye a la
 * pila de tarjetas del sistema anterior — en vez de N cajas flotando, un solo cuerpo con sus
 * divisiones marcadas al margen.
 *
 * En tacto el raíl va arriba y en horizontal, porque una columna de dos centímetros a la izquierda
 * de una iPad es espacio que el pulgar no alcanza y que la tabla necesita.
 */
export function Rail({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={cn(
        // El filete se declara por lado en cada calibración en vez de ponerse y quitarse: una
        // utilidad que escribe la forma abreviada `border-bottom` no se cancela de forma fiable
        // con `border-b-0`, porque las dos viven en la misma capa y gana el orden del archivo.
        "flex flex-row gap-0 overflow-x-auto max-laptop:rule-b",
        "laptop:w-44 laptop:shrink-0 laptop:flex-col laptop:overflow-visible laptop:rule-r",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

/**
 * Una clave del raíl.
 *
 * El estado es una marca, como en todo el sistema: hueca en reposo, maciza en la posición activa,
 * y la activa lleva además la rúbrica de marca. El oro no es decoración aquí — es lo único que
 * dice dónde estás.
 */
export function RailKey({
  active = false,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLButtonElement> & { active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex shrink-0 items-center gap-2 px-3 text-left apparatus",
        "h-[var(--control-h)] whitespace-nowrap",
        "transition-colors duration-150 ease-[--ease-out-soft]",
        active ? "text-content" : "text-content-muted hover:text-content",
        className,
      )}
      {...rest}
    >
      <span
        className={cn("detent", active ? "detent-filled text-rubric-ink" : "text-marca-reposo")}
        aria-hidden="true"
      />
      {children}
    </button>
  )
}
