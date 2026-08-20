"use client"

import { Button, Callout, Checkbox } from "@tfv/ui"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { Attachments } from "~/components/attachments.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { api } from "~/lib/api.client.ts"
import type {
  ItemRow,
  ProductionCategoryRow,
  ProviderRow,
  ShoppingRow,
} from "../../../../production.ts"
import { ShoppingFields, shoppingBody, shoppingsPath } from "../shopping-form.tsx"

/**
 * Lo que se le hace a un gasto: corregirlo, decir qué artículos trajo, colgarle facturas y darlo de
 * baja.
 *
 * Cada uno con su permiso, igual que en el servidor: componer los artículos es
 * `shoppings.products` y clasificar es `shoppings.select_category`, y las dos son claves distintas
 * de `shoppings.edit`. Quien corrige el importe no reclasifica ni toca el inventario.
 */

export function EditShopping({
  companyId,
  productionId,
  shopping,
  categories,
  providers,
  canSelectCategory,
}: {
  companyId: string
  productionId: string
  shopping: ShoppingRow
  categories: readonly ProductionCategoryRow[]
  providers: readonly ProviderRow[]
  canSelectCategory: boolean
}) {
  const t = useTranslations("productions.budget")

  return (
    <FormDialog
      trigger={<Button variant="secondary">{t("edit")}</Button>}
      title={t("editShoppingTitle")}
      submitLabel={t("save")}
      action={async (data) => {
        await api(`${shoppingsPath(companyId, productionId)}/${shopping.id}`, {
          method: "PATCH",
          body: shoppingBody(data, {
            canSelectCategory,
            hasProviders: providers.length > 0,
            withCard: data.get("method") === "card",
          }),
        })
      }}
    >
      {() => (
        <ShoppingFields
          categories={categories}
          providers={providers}
          canSelectCategory={canSelectCategory}
          shopping={shopping}
        />
      )}
    </FormDialog>
  )
}

/**
 * Decir qué artículos del inventario incorporó esta compra.
 *
 * **Se establece el conjunto entero de una vez**, no se añade de uno en uno, porque eso es lo que el
 * servidor hace y lo que la relación permite: un artículo pertenece como máximo a una compra. Marcar
 * uno que está en otra compra **lo trae aquí y lo quita de allí**, y el diálogo lo dice antes en
 * lugar de dejar que se descubra al abrir la otra.
 *
 * La lista enseña de qué compra viene cada artículo por lo mismo: marcar a ciegas y descubrirlo
 * después es cómo se desarma el inventario de otra compra sin querer.
 */
export function ComposeShopping({
  companyId,
  productionId,
  shopping,
  items,
}: {
  companyId: string
  productionId: string
  shopping: ShoppingRow
  items: readonly ItemRow[]
}) {
  const t = useTranslations("productions.budget")

  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(shopping.items.map((item) => item.id)),
  )

  const toggle = useCallback((itemId: string, on: boolean) => {
    setChosen((previous) => {
      const next = new Set(previous)
      if (on) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }, [])

  // Los que se van a mover: están marcados y hoy pertenecen a otra compra.
  const moved = items.filter(
    (item) => chosen.has(item.id) && item.shoppingId !== null && item.shoppingId !== shopping.id,
  )

  return (
    <FormDialog
      trigger={<Button variant="secondary">{t("composeItems")}</Button>}
      title={t("composeItemsTitle")}
      description={t("composeItemsBody")}
      submitLabel={t("composeItemsConfirm")}
      size="lg"
      action={async () => {
        await api(`${shoppingsPath(companyId, productionId)}/${shopping.id}/items`, {
          method: "PUT",
          body: { itemIds: [...chosen] },
        })
      }}
    >
      {() =>
        items.length === 0 ? (
          <Callout tone="warning">{t("composeNoItems")}</Callout>
        ) : (
          <>
            <p className="text-body2 tabular-nums text-content-muted">
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
                  {item.shoppingId !== null && item.shoppingId !== shopping.id ? (
                    <span className="shrink-0 text-body3 text-tinta-cuida">
                      {t("belongsToAnother")}
                    </span>
                  ) : null}
                  <span className="shrink-0 font-mono text-body3 text-content-faint">
                    {item.code}
                  </span>
                </li>
              ))}
            </ul>

            {moved.length > 0 ? (
              <Callout tone="warning">{t("willMove", { count: moved.length })}</Callout>
            ) : null}

            <Callout tone="info">{t("composeReleases")}</Callout>
          </>
        )
      }
    </FormDialog>
  )
}

/**
 * Las facturas del gasto.
 *
 * Reutiliza el mismo componente que los adjuntos de una tarea: lo único que cambia es el camino.
 * `router.refresh()` porque esta pantalla la resuelve el servidor y el componente no sabe de dónde
 * salieron sus datos.
 */
export function ShoppingInvoices({
  companyId,
  productionId,
  shopping,
  canManage,
}: {
  companyId: string
  productionId: string
  shopping: ShoppingRow
  canManage: boolean
}) {
  const router = useRouter()

  return (
    <Attachments
      companyId={companyId}
      base={`${shoppingsPath(companyId, productionId)}/${shopping.id}/attachments`}
      attachments={shopping.attachments}
      canManage={canManage}
      onChanged={async () => {
        router.refresh()
      }}
    />
  )
}

/**
 * Dar de baja un gasto.
 *
 * La confirmación dice **las dos cosas que pasan y son distintas entre sí**: los artículos se
 * quedan en el inventario sin compra asignada, y las facturas se borran. Meterlas en una sola frase
 * haría creer que los artículos también se van.
 */
export function DeleteShopping({
  companyId,
  productionId,
  shopping,
}: {
  companyId: string
  productionId: string
  shopping: ShoppingRow
}) {
  const t = useTranslations("productions.budget")
  const router = useRouter()

  const cascade = [
    ...(shopping.items.length > 0
      ? [t("deleteReleasesItems", { count: shopping.items.length })]
      : []),
    ...(shopping.attachments.length > 0
      ? [t("deleteInvoices", { count: shopping.attachments.length })]
      : []),
  ]

  return (
    <ConfirmDestructive
      trigger={
        <Button variant="ghost" className="text-tinta-alto">
          {t("delete")}
        </Button>
      }
      title={t("deleteShoppingTitle")}
      entity={shopping.name}
      cascade={cascade}
      confirmLabel={t("delete")}
      action={async () => {
        await api(`${shoppingsPath(companyId, productionId)}/${shopping.id}`, { method: "DELETE" })
        router.push(`/c/${companyId}/productions/${productionId}/budget/shoppings`)
      }}
    />
  )
}
