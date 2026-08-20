"use client"

import {
  cn,
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@tfv/ui"
import { ChevronsUpDown } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ProfileCompany } from "~/lib/session.ts"

/**
 * El selector de empresa, en la barra superior.
 *
 * Vive aquí y no en la pizarra por una razón de wayfinding: con la pizarra cerrada —que es su
 * estado normal en tacto— el nombre de la empresa tiene que verse en el cromo que siempre está, no
 * detrás de un botón. Y cambiar de empresa es una acción de barra de estado, no de navegación de
 * secciones.
 */
export function CompanySwitcher({ companies }: { companies: readonly ProfileCompany[] }) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()

  /*
   * La empresa activa se deriva de la ruta **aquí, en cliente**, y no en la barra de servidor: el
   * armazón del panel persiste entre navegaciones, así que lo que el servidor leyera del camino se
   * congelaría en la primera pantalla —que con más de una empresa es el selector, sin empresa—.
   * `usePathname` sí cambia con cada navegación.
   */
  const companyId = pathname.match(/^\/c\/([^/]+)/)?.[1]
  const company = companyId ? companies.find((candidate) => candidate.id === companyId) : undefined

  /** La sección dentro de la empresa: `/c/<id>/warehouses/x` → `warehouses/x`. */
  const section = pathname.split("/").slice(3).join("/")

  /**
   * Cambiar de empresa conserva la sección **cuando la destino también la tiene**.
   *
   * Las secciones de servicio dependen de lo contratado, así que se comprueba; el directorio y la
   * configuración existen en toda empresa, así que se conservan sin preguntar. Es el requisito
   * «Cambio de empresa» de `app-shell`.
   */
  function switchTo(targetId: string) {
    const target = companies.find((candidate) => candidate.id === targetId)
    if (!target) return

    const keycode = section.split("/")[0]
    const universal = keycode === "directory" || keycode === "settings"
    const equivalent =
      universal || (keycode && target.services.some((service) => service.keycode === keycode))
        ? `/c/${target.id}/${section}`
        : `/c/${target.id}`

    router.push(equivalent)
  }

  if (!company) return null

  if (companies.length === 1) {
    return (
      <>
        <Divisor />
        <span className="hidden min-w-0 truncate text-body2 font-semibold text-content tablet:block">
          {company.name}
        </span>
      </>
    )
  }

  return (
    <>
      <Divisor />
      <Menu>
        <MenuTrigger
          className={cn(
            "flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left",
            "transition-colors hover:bg-panel-hover",
          )}
        >
          <span className="min-w-0 max-w-[14rem] truncate text-body2 font-semibold text-content">
            {company.name}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-content-faint" aria-hidden="true" />
        </MenuTrigger>

        <MenuContent align="start" className="w-64">
          <MenuLabel>{t("shell.switchCompany")}</MenuLabel>
          <MenuRadioGroup value={company.id} onValueChange={switchTo}>
            {companies.map((candidate) => (
              <MenuRadioItem key={candidate.id} value={candidate.id}>
                {candidate.name}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
    </>
  )
}

/** La coma entre la marca y la empresa. Vive aquí para esconderse cuando el selector no pinta. */
function Divisor() {
  return <span aria-hidden="true" className="h-6 w-px shrink-0 bg-edge" />
}
