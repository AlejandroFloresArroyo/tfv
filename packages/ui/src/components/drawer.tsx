"use client"

import { X } from "lucide-react"
import { Dialog as Primitive } from "radix-ui"
import type { ComponentPropsWithoutRef } from "react"
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
  /**
   * Si la ventana se puede cerrar. En falso —el estado «siempre abierta» de las pantallas
   * anchas— la equis no se pinta: un botón de cerrar que no cierra enseña a desconfiar.
   */
  closable?: boolean | undefined
}

export function DrawerContent({
  label,
  closeLabel,
  closable = true,
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
          // Anclada bajo la barra y a toda la altura disponible: el asa se esconde mientras está
          // abierta, así que no hay que dejarle sitio.
          "fixed top-[4.25rem] bottom-4 z-(--z-dialog) flex w-[19rem] max-w-[calc(100vw-2rem)] flex-col",
          // Junto al contenido, no clavada al borde: ocupa el margen libre del contenido centrado
          // (`max(1rem, margen − 20rem)`), la mitad exacta de la cuenta cuyo otro lado es el
          // empuje de `empuje-pizarra`. En pantallas anchas queda pegada al contenido sin mover
          // nada; en estrechas cae al borde y el empuje pone la diferencia.
          "left-[max(1rem,calc((100vw-min(100vw,80rem))/2-20rem))]",
          "overflow-hidden rounded-2xl",
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

        {/* Sin título: la identidad vive en la barra superior y repetirla aquí era ruido. La
            equis es el único cierre, alineada al canto. */}
        {closable ? (
          <div className="flex items-center justify-end px-2 pt-2">
            <Primitive.Close
              aria-label={closeLabel}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-content-faint transition-colors hover:bg-panel-hover hover:text-content"
            >
              <X className="size-4" aria-hidden="true" />
            </Primitive.Close>
          </div>
        ) : null}

        <div className={cn("min-h-0 flex-1 overflow-y-auto p-3", closable ? "pt-0" : "pt-3")}>
          {children}
        </div>
      </Primitive.Content>
    </Primitive.Portal>
  )
}
