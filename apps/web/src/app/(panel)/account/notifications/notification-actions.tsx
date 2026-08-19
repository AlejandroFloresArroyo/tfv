"use client"

import { Button } from "@tfv/ui"
import { Archive, ArchiveRestore, Mail, MailOpen } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import { api } from "~/lib/api.client.ts"

/**
 * Leer, no leer, archivar y desarchivar.
 *
 * Cuatro acciones sobre la fila y ninguna confirmación: las cuatro se deshacen con el botón de al
 * lado. Pedir confirmación para algo reversible enseña a confirmar sin leer, y entonces la
 * confirmación deja de servir donde sí importa.
 */
export function NotificationActions({
  id,
  read,
  archived,
}: {
  id: string
  read: boolean
  archived: boolean
}) {
  const t = useTranslations()
  const router = useRouter()
  const [pending, setPending] = useState<"read" | "archive" | null>(null)

  async function change(action: "read" | "archive", body: Record<string, boolean>) {
    if (pending) return
    setPending(action)

    try {
      await api(`/me/notifications/${id}/${action}`, { method: "POST", body })
      router.refresh()
    } catch {
      // Nada que decir aquí: el estado que se ve es el del servidor, y si la llamada no llegó, la
      // fila sigue como estaba. Inventar un aviso por no haber marcado algo como leído sería más
      // ruido que el que se pretendía quitar.
    } finally {
      setPending(null)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        loading={pending === "read"}
        aria-label={read ? t("notifications.markUnread") : t("notifications.markRead")}
        onClick={() => change("read", { read: !read })}
      >
        {read ? (
          <Mail className="size-4" aria-hidden="true" />
        ) : (
          <MailOpen className="size-4" aria-hidden="true" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        loading={pending === "archive"}
        aria-label={archived ? t("notifications.unarchive") : t("notifications.archive")}
        onClick={() => change("archive", { archived: !archived })}
      >
        {archived ? (
          <ArchiveRestore className="size-4" aria-hidden="true" />
        ) : (
          <Archive className="size-4" aria-hidden="true" />
        )}
      </Button>
    </>
  )
}

/**
 * Marca la bandeja como vista al abrirla.
 *
 * Es lo que reinicia el aviso de novedades —«han llegado tres desde que la cerraste»—, que no es lo
 * mismo que el contador de no leídas: haberlas visto pasar cuenta aunque no se abra ninguna.
 *
 * **No refresca el árbol de servidor.** Refrescar aquí volvería a pintar esta misma pantalla para
 * cambiar un número que la persona acaba de leer, y con la mala suerte de que el componente se
 * vuelva a montar, en bucle. El contador de la barra se pone al día en la navegación siguiente, que
 * es cuando vuelve a mirarse.
 */
export function MarkOpened() {
  const marcada = useRef(false)

  useEffect(() => {
    if (marcada.current) return
    marcada.current = true

    void api("/me/notifications/open", { method: "POST" }).catch(() => {})
  }, [])

  return null
}
