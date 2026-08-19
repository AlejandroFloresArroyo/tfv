"use client"

import { type ChatEntry, OrderChat } from "@tfv/ui"
import { useFormatter, useTranslations } from "next-intl"
import { useEffect } from "react"
import { useOrderChat } from "~/lib/order-chat.ts"

/**
 * La conversación dentro de la ficha del pedido.
 *
 * Es el cableado y nada más: la reconciliación vive en `~/lib/order-chat.ts` y el dibujo en
 * `@tfv/ui`. Aquí sólo se juntan los tres —la dirección de la API, los textos del idioma y el
 * componente— y se decide **cuándo se marca leído**.
 *
 * Se marca al recibir algo del otro lado estando en la pantalla, que es cuando de verdad se ha
 * visto. Marcar al abrir sin más diría que se leyó lo que llegó mientras la pestaña estaba en otra
 * ventana.
 */
export function OrderConversation({
  companyId,
  warehouseId,
  orderId,
  viewerId,
  canWrite,
}: {
  companyId: string
  warehouseId: string
  orderId: string
  viewerId: string
  canWrite: boolean
}) {
  const t = useTranslations("warehouses.orders.chat")
  const common = useTranslations("common")
  const format = useFormatter()

  const chat = useOrderChat({
    base: `/companies/${companyId}/warehouses/${warehouseId}/orders/${orderId}`,
    viewerId,
  })

  const { unread, markRead } = chat
  useEffect(() => {
    if (unread > 0) markRead()
  }, [unread, markRead])

  const entries: ChatEntry[] = chat.timeline.map((entry) => ({
    id: entry.id,
    side: entry.side,
    body: entry.body,
    authorName: entry.authorName,
    createdAt: entry.createdAt,
    editedAt: entry.editedAt,
    // El acuse es del **otro** lado: lo que interesa de un mensaje propio es si lo vieron.
    read: chat.side === "provider" ? entry.readByClientAt !== null : entry.readByProviderAt !== null,
    pending: entry.pending,
    failed: entry.failed,
    mine: entry.mine,
    canEdit: entry.canEdit && canWrite,
    canDelete: entry.canDelete && canWrite,
  }))

  return (
    <OrderChat
      entries={entries}
      status={chat.status}
      hasOlder={chat.hasOlder}
      loadingOlder={chat.loadingOlder}
      canWrite={canWrite}
      formatTime={(instant) => format.dateTime(new Date(instant), { timeStyle: "short" })}
      onSend={chat.send}
      onRetry={chat.retry}
      onEdit={chat.edit}
      onDelete={chat.remove}
      onOlder={chat.older}
      labels={{
        title: t("title"),
        placeholder: t("placeholder"),
        send: t("send"),
        empty: t("empty"),
        older: t("older"),
        system: t("system"),
        otherSide: chat.side === "provider" ? t("clientSide") : t("providerSide"),
        mySide: chat.side === "provider" ? t("providerSide") : t("clientSide"),
        edited: t("edited"),
        read: t("read"),
        sending: t("sending"),
        failed: t("failed"),
        retry: t("retry"),
        edit: common("edit"),
        save: common("save"),
        cancel: common("cancel"),
        remove: common("delete"),
        reconnecting: t("reconnecting"),
        readOnly: t("readOnly"),
      }}
    />
  )
}
