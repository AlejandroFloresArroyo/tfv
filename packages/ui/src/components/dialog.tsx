"use client"

import { X } from "lucide-react"
import { Dialog as Primitive } from "radix-ui"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { cn } from "../lib/cn.ts"

/**
 * Diálogo.
 *
 * Envuelve el primitivo de Radix en lugar de construirlo. Lo que hace correcto a un diálogo no es
 * la caja: es la trampa de foco, la devolución del foco al disparador al cerrar, el `aria-modal`,
 * el cierre con `Escape`, y que el resto de la página quede inerte para un lector de pantalla.
 * Hacerlo mal no se ve —el diálogo se pinta igual— y deja la aplicación inservible con teclado.
 *
 * Aquí sólo se define el aspecto y las tres cosas que sí son decisión nuestra:
 *
 * - **El título es obligatorio**, y es el nombre accesible del diálogo. Sin él, un lector de
 *   pantalla anuncia «diálogo» y nada más.
 * - **Debajo del ancho de tableta ocupa el borde inferior**, no el centro. Un diálogo centrado en
 *   un teléfono queda bajo el teclado en cuanto se toca un campo.
 * - **Se puede impedir el cierre** mientras hay un envío en curso, para que no se pierda lo escrito
 *   por un `Escape` accidental.
 */

export const Dialog = Primitive.Root
export const DialogTrigger = Primitive.Trigger
export const DialogClose = Primitive.Close

export type DialogSize = "sm" | "md" | "lg"

const SIZES: Record<DialogSize, string> = {
  sm: "tablet:max-w-100",
  md: "tablet:max-w-140",
  lg: "tablet:max-w-180",
}

export interface DialogContentProps extends ComponentPropsWithoutRef<typeof Primitive.Content> {
  title: string
  description?: string | undefined
  size?: DialogSize | undefined
  /** Mientras es cierto, `Escape` y el velo no cierran. Para no perder un formulario a medias. */
  locked?: boolean | undefined
  footer?: ReactNode | undefined
  /**
   * Etiqueta del botón de cierre, para lectores de pantalla.
   *
   * Obligatoria: el sistema de diseño no habla ningún idioma, y la aplicación se sirve en dos. Una
   * cadena por defecto aquí sería una cadena sin traducir en producción, y de las que nadie ve
   * porque sólo se anuncian.
   */
  closeLabel: string
}

export function DialogContent({
  title,
  description,
  size = "md",
  locked = false,
  footer,
  closeLabel,
  className,
  children,
  ...rest
}: DialogContentProps) {
  // Las tres vías de cierre involuntario, tapadas sólo mientras hace falta. Las claves se omiten
  // en lugar de pasarse como `undefined`: con `exactOptionalPropertyTypes` no es lo mismo «sin
  // manejador» que «manejador indefinido».
  const block = (event: Event) => event.preventDefault()
  const guards = locked
    ? { onEscapeKeyDown: block, onPointerDownOutside: block, onInteractOutside: block }
    : {}

  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-(--z-overlay) bg-overlay" />

      <Primitive.Content
        {...guards}
        className={cn(
          "fixed z-(--z-dialog) flex flex-col gap-4 rule-hard bg-panel p-5",
          // La única sombra del sistema, y está justificada: el diálogo flota sobre contenido vivo
          // y el filete solo no basta para decir qué capa está encima. Lleva desplazamiento y
          // difuminado reales, no un halo de color a cero.
          "shadow-[0_8px_28px_rgb(0_0_0/0.22)] dark:shadow-[0_8px_28px_rgb(0_0_0/0.6)]",
          // Teléfono: pegado abajo, a todo el ancho. Tableta en adelante: centrado.
          "inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto",
          "tablet:inset-x-auto tablet:bottom-auto tablet:top-1/2 tablet:left-1/2",
          "tablet:w-[calc(100vw-2rem)] tablet:-translate-x-1/2 tablet:-translate-y-1/2",
          SIZES[size],
          className,
        )}
        {...rest}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Primitive.Title className="text-h3 font-bold text-content">{title}</Primitive.Title>
            {description ? (
              <Primitive.Description className="mt-1 text-body2 text-content-muted">
                {description}
              </Primitive.Description>
            ) : null}
          </div>

          {locked ? null : (
            <Primitive.Close
              aria-label={closeLabel}
              className="-mr-1 -mt-1 grid size-[var(--control-h-sm)] shrink-0 place-items-center text-content-faint transition-colors hover:bg-panel-hover hover:text-content"
            >
              <X className="size-4" aria-hidden="true" />
            </Primitive.Close>
          )}
        </div>

        <div className="min-w-0">{children}</div>

        {footer ? <div className="flex flex-wrap justify-end gap-2 pt-1">{footer}</div> : null}
      </Primitive.Content>
    </Primitive.Portal>
  )
}
