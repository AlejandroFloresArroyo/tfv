"use client"

import { Button, Callout, Checkbox, DialogTrigger } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { FormDialog } from "~/components/form-dialog.tsx"
import { apiTyped } from "~/lib/api.client.ts"
import type { ItemRow, SetRow } from "../../../../production.ts"

/**
 * Componer un set: elegir de una vez sus artículos.
 *
 * Mismo patrón que `ComposeDelivery` (`deliveries/[deliveryId]/delivery-actions.tsx`): el conjunto
 * entero se manda de una vez con `PUT`, no altas y bajas sueltas — componer un decorado es decir
 * qué lleva, y una secuencia de operaciones dependería del orden en que llegaran. **Un artículo
 * puede estar en varios sets**, así que marcarlo aquí no lo quita de ningún otro.
 */
export function ComposeSet({
  companyId,
  productionId,
  set,
  items,
}: {
  companyId: string
  productionId: string
  set: SetRow
  items: readonly ItemRow[]
}) {
  const t = useTranslations("productions.sets")

  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set((set.items ?? []).map((item) => item.itemId)),
  )

  function toggle(itemId: string, on: boolean) {
    setChosen((previous) => {
      const next = new Set(previous)
      if (on) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button variant="secondary">{t("compose")}</Button>
        </DialogTrigger>
      }
      title={t("composeTitle")}
      description={t("composeBody")}
      submitLabel={t("composeConfirm")}
      size="lg"
      action={async () => {
        await apiTyped("PUT /companies/{companyId}/productions/{productionId}/sets/{setId}/items", {
          params: { companyId, productionId, setId: set.id },
          body: { itemIds: [...chosen] },
        })
      }}
    >
      {() =>
        items.length === 0 ? (
          <Callout tone="warning">{t("composeNoItems")}</Callout>
        ) : (
          <>
            <p className="text-body2 text-content-muted tabular-nums">
              {t("composeChosen", { count: chosen.size })}
            </p>

            <ul className="max-h-[22rem] overflow-y-auto rounded-lg border border-edge">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2.5 not-last:border-edge not-last:border-b"
                >
                  <Checkbox
                    checked={chosen.has(item.id)}
                    onCheckedChange={(checked) => toggle(item.id, checked === true)}
                    aria-label={item.name}
                  />
                  <span className="min-w-0 flex-1 truncate text-body2 text-content">
                    {item.name}
                  </span>
                  <span className="shrink-0 font-mono text-body3 text-content-faint">
                    {item.code}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )
      }
    </FormDialog>
  )
}
