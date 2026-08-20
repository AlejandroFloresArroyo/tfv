"use client"

import { cn, Drawer, DrawerContent, DrawerTrigger } from "@tfv/ui"
import { Clapperboard } from "lucide-react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useState } from "react"

/**
 * La pizarra flotante: la navegación del panel como cajón autoescondido.
 *
 * Sustituye a la columna fija y a la fila superior que la precedieron, y la razón es de espacio de
 * trabajo: en una iPad apaisada la columna comía 232 píxeles de cada pantalla, y en vertical la
 * fila comía dos barras de alto. Aquí el contenido ocupa siempre el ancho completo, y la
 * navegación vive detrás de un asa.
 *
 * ## Las decisiones que importan
 *
 * - **El asa va abajo a la izquierda.** Es la zona del pulgar en una tablet sostenida con dos
 *   manos, y el orden de dispositivos del producto empieza en iPad. Arriba habría que estirar la
 *   mano; en el borde derecho chocaría con el pulgar que desplaza.
 * - **Autoescondido siempre, sin estado que recordar.** El cajón se cierra al elegir, con `Escape`
 *   y tocando el velo. No hay modo «fijado»: un cajón que a veces se queda abierto convierte cada
 *   llegada a la pantalla en una pregunta.
 * - **Es un diálogo de verdad** (Radix): trampa de foco, `Escape`, foco devuelto al asa al cerrar,
 *   y el resto de la página inerte para un lector de pantalla. Un cajón hecho a mano falla justo
 *   en eso, y falla en silencio.
 * - **El deslizamiento es cambio de estado explícito, no hover.** La regla del mundo —al pasar el
 *   ratón sólo cambia el color— queda intacta: esto se mueve porque se pidió, igual que el diálogo
 *   sube desde el borde en un teléfono.
 */

export function FloatingNav({
  label,
  header,
  children,
}: {
  /** Nombre accesible del asa y del cajón. */
  label: string
  /** La identidad de arriba del cajón: empresa y su selector, o el título del área. */
  header: ReactNode
  children: ReactNode
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Elegir un destino cierra el cajón. Se observa la ruta en lugar de envolver cada enlace: los
  // enlaces ya existen en tres grupos distintos, y un envoltorio olvidado sería un cajón que a
  // veces se queda abierto encima de la pantalla nueva.
  // biome-ignore lint/correctness/useExhaustiveDependencies: la ruta es el disparador, no una lectura.
  useEffect(() => setOpen(false), [pathname])

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        aria-label={label}
        title={t("shell.openMenu")}
        className={cn(
          // Vidrio sobre el lienzo, como la barra superior: la misma familia de cromo. Lleva el
          // nombre de la empresa por dos razones que convergen: cerrado el cajón, en ningún otro
          // sitio se ve en qué empresa estás —y hay cuentas con varias—; y una claqueta sola es
          // un icono críptico, mientras que una pastilla con nombre dice qué abre.
          "fixed bottom-4 left-4 z-(--z-nav) flex h-12 items-center gap-2.5 rounded-2xl",
          "px-3.5 tablet:pr-4",
          "border border-edge bg-panel/85 text-content backdrop-blur-sm",
          "shadow-[0_8px_24px_-12px_rgb(0_0_0/0.4)]",
          "transition-colors duration-200 ease-[--ease-out-soft]",
          "hover:bg-panel-hover data-[state=open]:border-accent data-[state=open]:text-tinta-aparta",
        )}
      >
        <Clapperboard className="size-5 shrink-0" aria-hidden="true" />
        {/* En teléfono el nombre cede el sitio: la pastilla entera taparía la esquina de trabajo. */}
        <span className="hidden max-w-[13rem] truncate text-body2 font-semibold tablet:block">
          {label}
        </span>
      </DrawerTrigger>

      <DrawerContent label={label} closeLabel={t("shell.closeMenu")} header={header}>
        <nav aria-label={label}>{children}</nav>
      </DrawerContent>
    </Drawer>
  )
}
