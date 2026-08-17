"use client"

import { Button } from "@tfv/ui"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { api } from "~/lib/api.client.ts"

/**
 * Cierra todas las sesiones, incluida ésta.
 *
 * Que se cierre también la actual no es un descuido: es lo que hace útil el botón. Quien sospecha
 * que alguien entró en su cuenta necesita cortar de golpe, y dejar viva la sesión desde la que se
 * pulsa obligaría a saber cuál es la propia en la lista.
 */
export function CloseAllButton() {
  const t = useTranslations()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function closeAll() {
    if (pending) return
    setPending(true)

    try {
      await api("/auth/logout-all", { method: "POST", withoutRefresh: true })
    } catch {
      // Aunque falle, el servidor decide: la guarda del panel devuelve a acceder si ya no hay
      // sesión, y deja la pantalla en pie si la sigue habiendo.
    }

    router.replace("/login")
    router.refresh()
  }

  return (
    <Button variant="danger" size="sm" loading={pending} onClick={closeAll}>
      {t("account.sessions.closeAll")}
    </Button>
  )
}
