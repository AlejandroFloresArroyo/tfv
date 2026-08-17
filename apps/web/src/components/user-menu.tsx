"use client"

import { Avatar, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@tfv/ui"
import { Building2, KeyRound, LogOut, UserRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { api } from "~/lib/api.client.ts"
import type { Profile } from "~/lib/session.ts"

/**
 * Menú de la cuenta.
 *
 * Cerrar sesión **no recarga la página**, que es el requisito «Un cambio de sesión no exige
 * recargar» de `app-shell`. Se invalida la credencial, se navega, y el árbol de servidor se vuelve
 * a resolver: la guarda del panel encuentra que ya no hay sesión y manda a la pantalla de acceso.
 *
 * Lo que hace que no quede nada en memoria es que el estado del usuario **no vive en memoria**:
 * viene del servidor en cada navegación. La pila anterior lo guardaba en átomos globales y por eso
 * necesitaba una recarga completa para limpiarlos (`DEFECTS.md` F-01 y F-03).
 */
export function UserMenu({ profile }: { profile: Profile }) {
  const t = useTranslations()
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)

  const fullName = [profile.name, profile.lastname].filter(Boolean).join(" ") || profile.username

  async function logout() {
    if (leaving) return
    setLeaving(true)

    try {
      await api("/auth/logout", { method: "POST", withoutRefresh: true })
    } catch {
      // Si la llamada falla, la credencial puede seguir viva; enviar a la pantalla de acceso de
      // todos modos sería mentirle al usuario. El servidor decide: si la sesión sigue en pie, la
      // guarda del panel lo devuelve aquí.
    }

    router.replace("/login")
    router.refresh()
  }

  return (
    <Menu>
      <MenuTrigger
        aria-label={t("shell.account")}
        className="flex items-center gap-2 rounded-sm p-0.5 transition-colors hover:bg-panel-hover"
      >
        <Avatar name={fullName} />
      </MenuTrigger>

      <MenuContent>
        <div className="px-2.5 py-2">
          <p className="truncate text-body2 font-semibold text-content">{fullName}</p>
          <p className="truncate text-body3 text-content-faint">{profile.email}</p>
        </div>

        <MenuSeparator />

        {/*
          Siempre, no sólo con más de una empresa. La barra lateral ya ofrece cambiar entre las que
          hay; esta entrada es además la única vía para llegar al selector —y con él a crear una
          empresa nueva— desde dentro de una.
        */}
        <MenuLabel>{t("shell.companies")}</MenuLabel>
        <MenuItem
          icon={<Building2 className="size-4" aria-hidden="true" />}
          onSelect={() => router.push("/companies")}
        >
          {profile.companies.length > 1 ? t("shell.switchCompany") : t("shell.companies")}
        </MenuItem>
        <MenuSeparator />

        <MenuItem
          icon={<UserRound className="size-4" aria-hidden="true" />}
          onSelect={() => router.push("/account")}
        >
          {t("shell.account")}
        </MenuItem>
        <MenuItem
          icon={<KeyRound className="size-4" aria-hidden="true" />}
          onSelect={() => router.push("/account/sessions")}
        >
          {t("shell.sessions")}
        </MenuItem>

        <MenuSeparator />

        <MenuItem
          icon={<LogOut className="size-4" aria-hidden="true" />}
          disabled={leaving}
          // `preventDefault` para que el menú no se cierre antes de que la llamada termine: si se
          // cierra, el componente se desmonta y la navegación posterior se pierde.
          onSelect={(event) => {
            event.preventDefault()
            void logout()
          }}
          className="text-danger data-highlighted:bg-red-0 dark:data-highlighted:bg-red-9/25"
        >
          {t("shell.logout")}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
