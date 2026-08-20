"use client"

import { cn } from "@tfv/ui"
import { ArrowLeft, Building2, History, Inbox, Users } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { FloatingNav } from "~/components/floating-nav.tsx"

/**
 * Navegación del área de administración de plataforma.
 *
 * Es deliberadamente **otra** navegación, no una sección más dentro de una empresa. Lo que se mira
 * aquí atraviesa a todos los arrendatarios, y meterlo entre «Miembros» y «Roles» de una empresa
 * concreta invitaría a confundir el alcance de lo que se está viendo —que es exactamente la
 * confusión que hay que evitar cuando la pantalla enseña datos de todos—.
 *
 * Esta navegación no se pinta a quien no es administración de plataforma. **Y eso no es lo que lo
 * impide**: la guarda del armazón redirige, y la API responde `403` a quien escriba la dirección.
 * Ocultar no es proteger, y aquí menos que en ninguna otra parte.
 */
export function PlatformNav() {
  const t = useTranslations()
  const pathname = usePathname()

  const entries = [
    {
      href: "/platform/prospects",
      label: t("platform.prospects.nav"),
      icon: <Inbox className="size-4" aria-hidden="true" />,
    },
    {
      href: "/platform/companies",
      label: t("platform.companies.nav"),
      icon: <Building2 className="size-4" aria-hidden="true" />,
    },
    {
      href: "/platform/users",
      label: t("platform.users.nav"),
      icon: <Users className="size-4" aria-hidden="true" />,
    },
    {
      href: "/platform/activity",
      label: t("platform.activity.nav"),
      icon: <History className="size-4" aria-hidden="true" />,
    },
  ]

  return (
    <FloatingNav
      label={t("platform.title")}
      header={
        <p className="display truncate px-2 py-1.5 text-h4 text-content">{t("platform.title")}</p>
      }
    >
      <ul className="flex flex-col gap-1">
        {entries.map((entry) => (
          <NavLink
            key={entry.href}
            href={entry.href}
            active={pathname.startsWith(entry.href)}
            icon={entry.icon}
          >
            {entry.label}
          </NavLink>
        ))}

        {/*
          La salida, explícita. Un área que atraviesa arrendatarios sin una vuelta visible al panel
          deja a quien entró sin saber si sigue mirando datos de todos o ya no.
        */}
        <li className="pt-4">
          <span className="legend px-2.5 text-content-faint">{t("platform.leave")}</span>
        </li>
        <NavLink
          href="/companies"
          active={false}
          icon={<ArrowLeft className="size-4" aria-hidden="true" />}
        >
          {t("shell.companies")}
        </NavLink>
      </ul>
    </FloatingNav>
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
    <li>
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
