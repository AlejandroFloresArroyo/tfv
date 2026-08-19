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
import {
  Building2,
  ChevronsUpDown,
  CreditCard,
  Handshake,
  History,
  LayoutDashboard,
  MapPin,
  Package,
  Receipt,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { can } from "~/lib/can.ts"
import { FALLBACK_SERVICE_ICON, isKnownService, SERVICE_ICONS } from "~/lib/services.ts"
import type { ProfileCompany } from "~/lib/session.ts"

/**
 * Navegación de la empresa.
 *
 * Muestra **sólo los servicios habilitados**, que es lo que pide `app-shell`. Y lo dice la propia
 * spec: ocultar no es proteger. Lo que impide entrar es el guardián del servidor; esto sólo evita
 * enseñar puertas que no abren.
 *
 * Al cambiar de empresa se conserva la sección cuando la destino también la tiene, y se cae a su
 * portada cuando no. Es el requisito «Cambio de empresa», y es la razón de que este componente
 * necesite conocer todas las empresas y no sólo la activa.
 */
export function CompanyNav({
  company,
  companies,
}: {
  company: ProfileCompany
  companies: readonly ProfileCompany[]
}) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()

  /** La sección dentro de la empresa: `/c/<id>/warehouses/x` → `warehouses/x`. */
  const section = pathname.split("/").slice(3).join("/")

  /** Con quién comercia la empresa. No depende de ningún servicio: toda empresa tiene cartera. */
  const directory = [
    {
      section: "directory/clients",
      href: `/c/${company.id}/directory/clients`,
      label: t("directory.clients.title"),
      icon: <Handshake className="size-4" aria-hidden="true" />,
      permission: "companies.clients.view",
    },
    {
      section: "directory/providers",
      href: `/c/${company.id}/directory/providers`,
      label: t("directory.providers.title"),
      icon: <Truck className="size-4" aria-hidden="true" />,
      permission: "companies.providers.view",
    },
  ].filter((entry) => can(company, entry.permission))

  const settings = [
    {
      section: "settings/company",
      href: `/c/${company.id}/settings/company`,
      label: t("companies.manage.nav"),
      icon: <Building2 className="size-4" aria-hidden="true" />,
      permission: "companies.companies.view",
    },
    {
      section: "settings/members",
      href: `/c/${company.id}/settings/members`,
      label: t("settings.members"),
      icon: <Users className="size-4" aria-hidden="true" />,
      permission: "companies.users.view",
    },
    {
      section: "settings/roles",
      href: `/c/${company.id}/settings/roles`,
      label: t("settings.roles"),
      icon: <ShieldCheck className="size-4" aria-hidden="true" />,
      permission: "companies.roles.view",
    },
    {
      section: "settings/addresses",
      href: `/c/${company.id}/settings/addresses`,
      label: t("addresses.title"),
      icon: <MapPin className="size-4" aria-hidden="true" />,
      permission: "companies.addresses.view",
    },
    {
      // El plan, los perfiles de facturación y los cobros comparten `companies.billings.*`: el
      // catálogo está cerrado en las 255 claves migradas y no tiene ninguna de suscripciones. Ver
      // `HALLAZGOS.md` H-84.
      section: "settings/plan",
      href: `/c/${company.id}/settings/plan`,
      label: t("billing.plan.nav"),
      icon: <Sparkles className="size-4" aria-hidden="true" />,
      permission: "companies.billings.view",
    },
    {
      section: "settings/billing",
      href: `/c/${company.id}/settings/billing`,
      label: t("billing.profiles.nav"),
      icon: <CreditCard className="size-4" aria-hidden="true" />,
      permission: "companies.billings.view",
    },
    {
      section: "settings/payments",
      href: `/c/${company.id}/settings/payments`,
      label: t("billing.payments.nav"),
      icon: <Receipt className="size-4" aria-hidden="true" />,
      permission: "companies.billings.view",
    },
    {
      // Las tarifas de envío tampoco tienen clave propia entre las 255 (H-96): se exige la de ver
      // la empresa, que es de lo que son —configuración suya, del mismo rango que su comisión—.
      section: "settings/shipping",
      href: `/c/${company.id}/settings/shipping`,
      label: t("shipping.nav"),
      icon: <Package className="size-4" aria-hidden="true" />,
      permission: "companies.companies.view",
    },
    {
      // La bitácora no tiene clave propia en el catálogo —está cerrado en las 255 migradas— y se
      // exige la de ver la empresa, que es exactamente el alcance de lo que enseña.
      section: "settings/activity",
      href: `/c/${company.id}/settings/activity`,
      label: t("activity.title"),
      icon: <History className="size-4" aria-hidden="true" />,
      permission: "companies.companies.view",
    },
  ].filter((entry) => can(company, entry.permission))

  /**
   * Cambiar de empresa conserva la sección **cuando la destino también la tiene**.
   *
   * Hay dos maneras de tenerla. Las secciones de servicio dependen de lo contratado, así que se
   * comprueba; el directorio y la configuración existen en toda empresa, así que se conservan sin
   * preguntar. Antes caían a la portada por no ser un servicio, y cambiar de empresa desde
   * «Miembros» dejaba a la persona en otro sitio sin haber pedido moverse.
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

  return (
    <nav
      aria-label={company.name}
      className="shrink-0 border-edge border-b px-4 py-3 laptop:w-58 laptop:border-r laptop:border-b-0 laptop:px-3 laptop:py-5"
    >
      {companies.length > 1 ? (
        <Menu>
          <MenuTrigger
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left",
              "transition-colors hover:bg-panel-hover",
            )}
          >
            <span className="min-w-0 flex-1 truncate text-body2 font-bold text-content">
              {company.name}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-content-faint" aria-hidden="true" />
          </MenuTrigger>

          <MenuContent align="start" className="w-58">
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
      ) : (
        <p className="truncate px-2.5 py-2 text-body2 font-bold text-content">{company.name}</p>
      )}

      <ul className="mt-2 flex gap-1 overflow-x-auto laptop:mt-4 laptop:flex-col laptop:overflow-visible">
        <NavLink
          href={`/c/${company.id}`}
          active={section === ""}
          icon={<LayoutDashboard className="size-4" aria-hidden="true" />}
        >
          {t("shell.overview")}
        </NavLink>

        {company.services.length > 0 ? (
          <li className="hidden pt-4 pb-1 laptop:block">
            <span className="legend px-2.5 text-content-faint">{t("shell.services")}</span>
          </li>
        ) : null}

        {company.services.map((service) => {
          const Icon = SERVICE_ICONS[service.keycode] ?? FALLBACK_SERVICE_ICON
          return (
            <NavLink
              key={service.keycode}
              href={`/c/${company.id}/${service.keycode}`}
              active={section.split("/")[0] === service.keycode}
              icon={<Icon className="size-4" aria-hidden="true" />}
            >
              {isKnownService(service.keycode) ? t(`services.${service.keycode}`) : service.name}
            </NavLink>
          )
        })}

        {directory.length > 0 ? (
          <li className="hidden pt-4 pb-1 laptop:block">
            <span className="legend px-2.5 text-content-faint">{t("directory.title")}</span>
          </li>
        ) : null}

        {directory.map((entry) => (
          <NavLink
            key={entry.href}
            href={entry.href}
            active={section === entry.section}
            icon={entry.icon}
          >
            {entry.label}
          </NavLink>
        ))}

        {/*
          Configuración. Cada entrada se pinta sólo si su permiso la respalda, que es lo que pide
          `app-shell`: la navegación muestra «únicamente las secciones que el rol del usuario le
          permite».

          Y lo dice la misma spec dos líneas después: **ocultar no es proteger**. Quien escriba la
          dirección a mano llega a un servidor que comprueba por su cuenta y responde `403`.
        */}
        {settings.length > 0 ? (
          <li className="hidden pt-4 pb-1 laptop:block">
            <span className="legend px-2.5 text-content-faint">{t("settings.title")}</span>
          </li>
        ) : null}

        {settings.map((entry) => (
          <NavLink
            key={entry.href}
            href={entry.href}
            active={section === entry.section}
            icon={entry.icon}
          >
            {entry.label}
          </NavLink>
        ))}
      </ul>
    </nav>
  )
}

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <li
      className="shrink-0"
      // En tacto la navegación es una fila que se desplaza, y la sección activa puede cargar
      // recortada en el borde — justo la entrada que dice dónde estás. Se trae a la vista al
      // montar; en escritorio la columna no desborda y esto no hace nada.
      ref={(node) => {
        if (active) node?.scrollIntoView({ inline: "nearest", block: "nearest" })
      }}
    >
      <Link
        href={href}
        // `aria-current` para que un lector de pantalla anuncie cuál es la sección activa. El color
        // solo no lo dice, y quien no ve el color se queda sin esa información.
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-body2 whitespace-nowrap transition-colors",
          // La activa lleva la rúbrica en el icono, no sólo un fondo: con el mismo gris que el
          // hover, «dónde estoy» y «dónde está el puntero» eran indistinguibles. El oro va en su
          // versión de tinta, que sobre panel claro sí se ve (el puro da 1.6:1 ahí).
          active
            ? "bg-panel-hover font-semibold text-content"
            : "font-medium text-content-muted hover:bg-panel-hover hover:text-content",
        )}
      >
        <span className={active ? "text-tinta-aparta" : "text-content-faint"}>{icon}</span>
        {children}
      </Link>
    </li>
  )
}
