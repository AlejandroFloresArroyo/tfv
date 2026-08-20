"use client"

import { X } from "lucide-react"
import { Dialog as Primitive } from "radix-ui"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { cn } from "../lib/cn.ts"

/**
 * Ventana flotante de navegación: un diálogo que flota junto a su asa, no una barra.
 *
 * Envuelve el primitivo de Radix por las mismas razones que el diálogo: la trampa de foco, el
 * cierre con `Escape`, el foco devuelto al disparador y la página inerte detrás no se improvisan,
 * y hacerlos mal no se ve.
 *
 * Dos decisiones de forma:
 *
 * - **Es ventana, no barra.** Flota despegada de los bordes con su radio, su filo de luz y su
 *   sombra de capa — la familia del menú y el diálogo, no un panel de borde a borde.
 * - **El velo es transparente.** El contenido no se oscurece: se hace a un lado (el empuje vive en
 *   `empuje-pizarra` y lo gobierna quien la abre). Tocar fuera sigue cerrando, porque el velo
 *   sigue ahí atrapando el gesto; lo que ya no hace es teatro.
 */

export const Drawer = Primitive.Root
export const DrawerTrigger = Primitive.Trigger

export interface DrawerContentProps extends ComponentPropsWithoutRef<typeof Primitive.Content> {
  /** Nombre accesible del cajón. Sin él, un lector de pantalla anuncia «diálogo» y nada más. */
  label: string
  /** Etiqueta del botón de cierre. Obligatoria: el sistema de diseño no habla ningún idioma. */
  closeLabel: string
  /** La identidad de arriba: quién es este cajón. */
  header?: ReactNode | undefined
}

export function DrawerContent({
  label,
  closeLabel,
  header,
  className,
  children,
  ...rest
}: DrawerContentProps) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-(--z-overlay) bg-transparent" />

      <Primitive.Content
        aria-label={label}
        className={cn(
          // Anclada justo debajo de la barra superior: en escritorio vive abierta la mayor parte del
          // tiempo, y tapar la campana o la cuenta todo el día no es convivir con el cromo.
          "fixed top-[4.25rem] left-4 z-(--z-dialog) flex w-[19rem] max-w-[calc(100vw-2rem)] flex-col",
          "max-h-[calc(100dvh-10rem)] overflow-hidden rounded-2xl",
          "border border-edge bg-panel-raised/95 backdrop-blur-md",
          "shadow-[0_24px_64px_-16px_rgb(0_0_0/0.45)] dark:shadow-[0_24px_64px_-16px_rgb(0_0_0/0.85)]",
          "data-[state=open]:enter-rise",
          className,
        )}
        {...rest}
      >
        {/* El filo superior de luz de las tarjetas: es lo que separa una ventana de un rectángulo. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-edge-control to-transparent"
        />

        <div className="flex items-start justify-between gap-2 border-edge border-b p-4">
          <div className="min-w-0 flex-1">{header}</div>
          <Primitive.Close
            aria-label={closeLabel}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-content-faint transition-colors hover:bg-panel-hover hover:text-content"
          >
            <X className="size-4" aria-hidden="true" />
          </Primitive.Close>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </Primitive.Content>
    </Primitive.Portal>
  )
}
