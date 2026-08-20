"use client"

import { cn, Drawer, DrawerContent, DrawerTrigger } from "@tfv/ui"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useRef, useState } from "react"

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

const PREFERENCIA = "tfv_pizarra"

/** La calibración de escritorio del sistema: ancho y puntero fino, las dos a la vez. */
const ESCRITORIO = "(min-width: 64rem) and (pointer: fine)"

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
  // En escritorio con puntero fino la pizarra es **persistente**: no-modal, se trabaja con ella
  // abierta, elegir no la cierra, y la elección se recuerda. En tacto sigue modal y autoescondida.
  const [persistent, setPersistent] = useState(false)
  const asa = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    const media = window.matchMedia(ESCRITORIO)
    const aplicar = () => {
      setPersistent(media.matches)
      // Al entrar al escritorio, la preferencia guardada decide; abierta salvo cierre recordado.
      if (media.matches) setOpen(localStorage.getItem(PREFERENCIA) !== "cerrada")
    }
    aplicar()
    media.addEventListener("change", aplicar)
    return () => media.removeEventListener("change", aplicar)
  }, [])

  function cambiar(siguiente: boolean) {
    setOpen(siguiente)
    // Sólo el escritorio recuerda: en tacto el autoescondido es la regla y no hay nada que guardar.
    if (persistent) localStorage.setItem(PREFERENCIA, siguiente ? "abierta" : "cerrada")
  }

  // Elegir un destino cierra el cajón **en tacto**. Se observa la ruta en lugar de envolver cada
  // enlace: un envoltorio olvidado sería un cajón que a veces se queda abierto encima de la
  // pantalla nueva. En escritorio persistente, elegir navega y la pizarra se queda.
  //
  // La primera pasada se salta a propósito: en el montaje este efecto corre en el mismo commit que
  // el de arriba, con `persistent` todavía en falso, y cerraría lo que aquél acaba de abrir.
  const primeraRuta = useRef(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: la ruta es el disparador, no una lectura.
  useEffect(() => {
    if (primeraRuta.current) {
      primeraRuta.current = false
      return
    }
    if (!persistent) setOpen(false)
  }, [pathname])

  // El empuje: el estado del cajón se publica en `<html>` y el CSS de `empuje-pizarra` hace el
  // resto. Va en la raíz y no en un contexto de React porque quien se mueve es un armazón de
  // servidor que no puede suscribirse a nada.
  useEffect(() => {
    const raiz = document.documentElement
    if (open) raiz.setAttribute("data-pizarra", "abierta")
    else raiz.removeAttribute("data-pizarra")
    return () => raiz.removeAttribute("data-pizarra")
  }, [open])

  return (
    // No-modal en persistente: la página sigue viva al lado —sin trampa de foco ni velo—, que es
    // la diferencia entre un panel con el que se trabaja y un diálogo que interrumpe.
    <Drawer open={open} onOpenChange={cambiar} modal={!persistent}>
      {/* Sólo icono: el nombre de la empresa vive ahora en la barra superior, que es cromo que
          siempre está. El nombre accesible dice la acción —abrir o cerrar—, que es lo que un botón
          de icono debe decir. */}
      <DrawerTrigger
        ref={asa}
        aria-label={open ? t("shell.closeMenu") : t("shell.openMenu")}
        title={open ? t("shell.closeMenu") : t("shell.openMenu")}
        className={cn(
          "fixed bottom-4 left-4 z-(--z-nav) grid size-12 place-items-center rounded-2xl",
          "border border-edge bg-panel/85 text-content backdrop-blur-sm",
          "shadow-[0_8px_24px_-12px_rgb(0_0_0/0.4)]",
          "transition-colors duration-200 ease-[--ease-out-soft]",
          "hover:bg-panel-hover data-[state=open]:border-accent data-[state=open]:text-tinta-aparta",
        )}
      >
        {open ? (
          <PanelLeftClose className="size-5" aria-hidden="true" />
        ) : (
          <PanelLeftOpen className="size-5" aria-hidden="true" />
        )}
      </DrawerTrigger>

      <DrawerContent
        label={label}
        closeLabel={t("shell.closeMenu")}
        header={header}
        // Persistente: tocar fuera no cierra —se está trabajando al lado— y el foco no se roba al
        // abrir, porque abrir es el estado de reposo del escritorio, no una interrupción.
        // El foco vuelve al asa al cerrar —es lo accesible—, pero lo devolvemos nosotros con
        // `preventScroll`: el retorno por defecto deja que el navegador acomode el scroll para
        // revelar el foco, y eso saltaba la página cientos de píxeles al cerrar.
        onCloseAutoFocus={(event: Event) => {
          event.preventDefault()
          asa.current?.focus({ preventScroll: true })
        }}
        {...(persistent
          ? {
              onInteractOutside: (event: Event) => event.preventDefault(),
              onOpenAutoFocus: (event: Event) => event.preventDefault(),
            }
          : {})}
      >
        <nav aria-label={label}>{children}</nav>
      </DrawerContent>
    </Drawer>
  )
}
