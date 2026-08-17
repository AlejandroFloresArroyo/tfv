import { Boxes, Clapperboard, Globe, Grid3x3, MapPin, Warehouse } from "lucide-react"
import type { ComponentType, SVGProps } from "react"

type Icon = ComponentType<SVGProps<SVGSVGElement>>

/**
 * Los cinco servicios de la plataforma, del lado de la interfaz.
 *
 * La lista de qué está habilitado la manda el servidor; esto sólo dice cómo se dibuja cada uno. Un
 * servicio que llegue sin entrada aquí se pinta con el icono genérico y con el nombre que venga de
 * la API, en lugar de romper la navegación.
 */
export const SERVICE_ICONS: Record<string, Icon> = {
  warehouses: Warehouse,
  productions: Clapperboard,
  pixit: Grid3x3,
  websites: Globe,
  locations: MapPin,
}

export const FALLBACK_SERVICE_ICON: Icon = Boxes

/** La rebanada que trae cada servicio, para que la pantalla en obra diga cuál es. */
export const SERVICE_SLICE: Record<string, string> = {
  warehouses: "12",
  productions: "20",
  pixit: "24",
  websites: "19",
  locations: "27",
}

export function isKnownService(keycode: string): boolean {
  return keycode in SERVICE_ICONS
}
