"use client"

import { Button, DialogTrigger, Field, Input } from "@tfv/ui"
import { Plus, Tags } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { FormDialog } from "~/components/form-dialog.tsx"
import { text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import { linkButton } from "./link-button.ts"

/**
 * Lo que se hace sobre la medida entera: dar de alta unidades, e imprimir todas sus etiquetas.
 *
 * **El alta masiva es el alta individual.** No hay dos formularios porque no hay dos operaciones:
 * son la misma fila repetida, y una cantidad de uno es el caso de en medio. Ofrecer «crear una» y
 * «crear varias» por separado obligaría a mantener dos caminos que hacen lo mismo.
 *
 * Sin permiso de alta el botón **no se pinta**. No se pinta desactivado: un control apagado sin
 * explicación deja a la persona intentándolo y preguntando por qué no funciona.
 */
export function StockActions({
  companyId,
  warehouseId,
  productId,
  measurementId,
  canCreate,
  hasUnits,
}: {
  companyId: string
  warehouseId: string
  productId: string
  measurementId: string
  canCreate: boolean
  hasUnits: boolean
}) {
  const t = useTranslations("warehouses")
  const screen = `/c/${companyId}/warehouses/${warehouseId}/products/${productId}/measurements/${measurementId}`

  return (
    <>
      {/* Sin unidades no hay etiquetas que imprimir, y una hoja vacía no es una respuesta útil. */}
      {hasUnits ? (
        <Link href={`${screen}/labels`} className={linkButton("secondary")}>
          <Tags className="size-4" aria-hidden="true" />
          {t("stock.labels")}
        </Link>
      ) : null}

      {canCreate ? (
        <FormDialog
          trigger={
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" aria-hidden="true" />
                {t("stock.create")}
              </Button>
            </DialogTrigger>
          }
          title={t("stock.createTitle")}
          description={t("stock.createDescription")}
          submitLabel={t("stock.create")}
          size="sm"
          action={(data) =>
            api(
              `/companies/${companyId}/warehouses/${warehouseId}/measurements/${measurementId}/units`,
              { method: "POST", body: { quantity: Number(text(data, "quantity")) } },
            )
          }
        >
          {(state) => (
            <Field
              label={t("stock.quantity")}
              hint={t("stock.quantityHint")}
              error={state.fieldErrors.get("quantity")}
              required
            >
              {(ids) => (
                <Input
                  {...ids}
                  name="quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={500}
                  defaultValue={1}
                  autoFocus
                />
              )}
            </Field>
          )}
        </FormDialog>
      ) : null}
    </>
  )
}
