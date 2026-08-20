"use client"

import { Button, Callout, Checkbox, Field, Input, Select, Textarea } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import {
  type ProductionCategoryRow,
  type ProviderRow,
  SHOPPING_KINDS,
  SHOPPING_METHODS,
  type ShoppingRow,
} from "../../../production.ts"
import { AmountField } from "../amount-field.tsx"

/**
 * El formulario de un gasto, compartido por el alta y la edición.
 *
 * ## La tarjeta sólo aparece cuando se pagó con tarjeta
 *
 * Y sólo caben cuatro dígitos: `maxLength` y patrón de cuatro cifras. **No es una comodidad**, es la
 * misma regla que el tipo del servidor y la del esquema de entrada, dicha por tercera vez en el
 * sitio donde alguien podría teclear el número entero. Un campo de dieciséis caracteres invita a
 * escribirlos, y entonces la protección de las otras dos capas se convierte en un mensaje de error
 * después de que el número ya viajó.
 *
 * ## Deducible es una casilla y no un desplegable
 *
 * Es sí o no, y el valor por defecto es no: marcarlo es un acto —significa que hay factura— y
 * ninguno de los dos valores es el correcto por omisión para todos.
 */

export function shoppingsPath(companyId: string, productionId: string): string {
  return `/companies/${companyId}/productions/${productionId}/shoppings`
}

export function ShoppingFields({
  categories,
  providers,
  canSelectCategory,
  shopping,
}: {
  categories: readonly ProductionCategoryRow[]
  providers: readonly ProviderRow[]
  canSelectCategory: boolean
  shopping?: ShoppingRow | undefined
}) {
  const t = useTranslations("productions.budget")
  const [method, setMethod] = useState(shopping?.method ?? "cash")

  return (
    <>
      <Field label={t("name")} required>
        {(ids) => (
          <Input
            {...ids}
            name="name"
            autoComplete="off"
            maxLength={250}
            defaultValue={shopping?.name ?? ""}
          />
        )}
      </Field>

      <Field label={t("amount")} required>
        {(ids) => <AmountField ids={ids} name="amount" defaultValue={shopping?.amount ?? ""} />}
      </Field>

      <div className="grid gap-4 tablet:grid-cols-2">
        <Field label={t("kind")}>
          {(ids) => (
            <Select {...ids} name="kind" defaultValue={shopping?.kind ?? SHOPPING_KINDS[0]}>
              {SHOPPING_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`kinds.${kind}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t("method")}>
          {(ids) => (
            <Select
              {...ids}
              name="method"
              value={method}
              onChange={(event) => setMethod(event.target.value as ShoppingRow["method"])}
            >
              {SHOPPING_METHODS.map((option) => (
                <option key={option} value={option}>
                  {t(`methods.${option}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {method === "card" ? (
        <>
          <Field label={t("cardLast4")} hint={t("cardLast4Hint")}>
            {(ids) => (
              <Input
                {...ids}
                name="cardLast4"
                inputMode="numeric"
                pattern="\d{1,4}"
                maxLength={4}
                autoComplete="off"
                className="w-28"
                defaultValue={shopping?.cardLast4 ?? ""}
              />
            )}
          </Field>
          <Callout tone="info">{t("cardNeverStored")}</Callout>
        </>
      ) : null}

      <Field label={t("occurredOn")}>
        {(ids) => (
          <Input
            {...ids}
            name="occurredOn"
            type="date"
            defaultValue={shopping?.occurredOn?.slice(0, 10) ?? ""}
          />
        )}
      </Field>

      {providers.length > 0 ? (
        <Field label={t("provider")}>
          {(ids) => (
            <Select {...ids} name="providerId" defaultValue={shopping?.providerId ?? ""}>
              <option value="">{t("noProvider")}</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.alias}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}

      {canSelectCategory && categories.length > 0 ? (
        <Field label={t("category")}>
          {(ids) => (
            <Select {...ids} name="categoryId" defaultValue={shopping?.categoryId ?? ""}>
              <option value="">{t("noCategory")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}

      {/* La casilla ata su propia etiqueta: `Checkbox` genera el identificador y el `htmlFor`, que
          es lo que hace que pulsar el texto la marque y que tenga nombre accesible. */}
      <Checkbox
        name="isDeductible"
        defaultChecked={shopping?.isDeductible ?? false}
        label={t("deductible")}
      />

      <Field label={t("observations")}>
        {(ids) => (
          <Textarea
            {...ids}
            name="observations"
            rows={3}
            maxLength={4000}
            defaultValue={shopping?.observations ?? ""}
          />
        )}
      </Field>
    </>
  )
}

/**
 * Lo que el formulario manda.
 *
 * La fecha del gasto se manda como instante porque la columna es de instante; el campo es de día
 * civil porque **nadie apunta la hora a la que compró unas telas**. La conversión a medianoche se
 * hace aquí y no en el servidor: el servidor no puede saber en qué día está quien escribe.
 */
export function shoppingBody(
  data: FormData,
  options: { canSelectCategory: boolean; hasProviders: boolean; withCard: boolean },
): Record<string, unknown> {
  const day = optional(data, "occurredOn")

  return {
    name: text(data, "name"),
    amount: text(data, "amount"),
    observations: optional(data, "observations") ?? "",
    kind: text(data, "kind"),
    method: text(data, "method"),
    isDeductible: data.get("isDeductible") !== null,
    occurredOn: day === undefined || day === "" ? null : new Date(`${day}T00:00:00`).toISOString(),
    // Sólo se manda cuando el método es tarjeta. Con cualquier otro, el servidor la borra igual.
    ...(options.withCard ? { cardLast4: optional(data, "cardLast4") ?? null } : {}),
    ...(options.hasProviders ? { providerId: optional(data, "providerId") ?? null } : {}),
    ...(options.canSelectCategory ? { categoryId: optional(data, "categoryId") ?? null } : {}),
  }
}

/**
 * Registrar un gasto.
 *
 * Al crearlo se entra a su ficha, como en la nota de entrega: lo siguiente que suele hacerse es
 * colgarle la factura o decir qué artículos trajo, y las dos cosas sólo se pueden hacer dentro.
 */
export function CreateShopping({
  companyId,
  productionId,
  categories,
  providers,
  canSelectCategory,
}: {
  companyId: string
  productionId: string
  categories: readonly ProductionCategoryRow[]
  providers: readonly ProviderRow[]
  canSelectCategory: boolean
}) {
  const t = useTranslations("productions.budget")
  const router = useRouter()

  return (
    <FormDialog
      trigger={
        <Button>
          <Plus className="size-4" aria-hidden="true" />
          {t("newShopping")}
        </Button>
      }
      title={t("newShoppingTitle")}
      description={t("newShoppingBody")}
      submitLabel={t("newShopping")}
      action={async (data) => {
        const created = await api<ShoppingRow>(shoppingsPath(companyId, productionId), {
          method: "POST",
          body: shoppingBody(data, {
            canSelectCategory,
            hasProviders: providers.length > 0,
            withCard: data.get("method") === "card",
          }),
        })

        router.push(`/c/${companyId}/productions/${productionId}/budget/shoppings/${created.id}`)
      }}
    >
      {() => (
        <ShoppingFields
          categories={categories}
          providers={providers}
          canSelectCategory={canSelectCategory}
        />
      )}
    </FormDialog>
  )
}
