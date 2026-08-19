"use client"

import {
  LENGTH_UNITS,
  type LengthUnit,
  MASS_UNITS,
  type MassUnit,
  MEASUREMENT_KINDS,
  type MeasurementKind,
} from "@tfv/contracts/catalog"
import {
  AmountInput,
  Button,
  Checkbox,
  DialogTrigger,
  Field,
  Input,
  SearchSelect,
  Select,
  type SelectOption,
  Switch,
  Textarea,
  toDecimalString,
} from "@tfv/ui"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { decimalSeparator } from "~/lib/amount.ts"
import { api } from "~/lib/api.client.ts"
import type { MeasurementRow, ProductDetail } from "../../../warehouse.ts"
import { EditPhotos } from "./product-photos.tsx"

/**
 * Lo que se puede hacer con un producto desde su ficha.
 *
 * **Un diálogo por bloque, y el bloque es la unidad de guardado.** No es una preferencia de estilo:
 * el catálogo reparte la edición de un producto en cinco claves —información, clasificación,
 * precio, publicación y alta—, así que un panel que se guardara solo con campos de tres permisos
 * distintos mandaría peticiones que el servidor rechaza a medias. Aquí cada diálogo agrupa
 * exactamente lo que una clave autoriza, y el que no se puede usar no se pinta.
 *
 * Es lo contrario de lo que hace el constructor de cotizaciones, y a propósito: una cotización se
 * compone, y una ficha de producto se corrige.
 */

export interface ProductOptions {
  readonly categories: readonly SelectOption[]
  readonly globalCategories: readonly SelectOption[]
  readonly storages: readonly SelectOption[]
  readonly members: readonly SelectOption[]
}

export interface ProductPermissions {
  readonly canEditInfo: boolean
  /** Las fotos van con la información: es la clave más cercana del catálogo cerrado. Ver H-64. */
  readonly canSelectCategory: boolean
  readonly canEditLocation: boolean
  readonly canEditPayment: boolean
  readonly canPublish: boolean
  readonly canCreate: boolean
  readonly canDelete: boolean
  readonly canEditMeasurements: boolean
  readonly canDeleteMeasurements: boolean
}

export function ProductActions({
  companyId,
  warehouseId,
  product,
  options,
  permissions,
}: {
  companyId: string
  warehouseId: string
  product: ProductDetail
  options: ProductOptions
  permissions: ProductPermissions
}) {
  const t = useTranslations()
  const router = useRouter()
  const path = `/companies/${companyId}/warehouses/${warehouseId}/products/${product.id}`

  const actions: ItemAction[] = [
    ...(permissions.canEditInfo
      ? [
          {
            key: "info",
            label: t("warehouses.products.editInfo"),
            dialog: (control: { open: boolean; onOpenChange: (open: boolean) => void }) => (
              <EditInfo path={path} product={product} {...control} />
            ),
          },
        ]
      : []),
    ...(permissions.canEditInfo
      ? [
          {
            key: "photos",
            label: t("warehouses.products.editPhotos"),
            dialog: (control: { open: boolean; onOpenChange: (open: boolean) => void }) => (
              <EditPhotos companyId={companyId} path={path} product={product} {...control} />
            ),
          },
        ]
      : []),
    ...(permissions.canSelectCategory || permissions.canEditLocation
      ? [
          {
            key: "classification",
            label: t("warehouses.products.editClassification"),
            dialog: (control: { open: boolean; onOpenChange: (open: boolean) => void }) => (
              <EditClassification
                path={path}
                product={product}
                options={options}
                permissions={permissions}
                {...control}
              />
            ),
          },
        ]
      : []),
    ...(permissions.canEditPayment
      ? [
          {
            key: "pricing",
            label: t("warehouses.products.editPricing"),
            dialog: (control: { open: boolean; onOpenChange: (open: boolean) => void }) => (
              <EditPricing path={path} product={product} {...control} />
            ),
          },
        ]
      : []),
    ...(permissions.canDelete
      ? [
          {
            key: "delete",
            label: t("common.delete"),
            danger: true,
            dialog: (control: { open: boolean; onOpenChange: (open: boolean) => void }) => (
              <ConfirmDestructive
                title={t("warehouses.products.deleteTitle")}
                entity={product.name}
                cascade={cascadeOf(product, t)}
                confirmLabel={t("common.delete")}
                action={async () => {
                  await api(path, { method: "DELETE" })
                  router.push(`/c/${companyId}/warehouses/${warehouseId}`)
                }}
                {...control}
              />
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="flex items-center gap-2">
      {permissions.canPublish ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await api(path, { method: "PATCH", body: { isPublished: !product.isPublished } })
            router.refresh()
          }}
        >
          {product.isPublished
            ? t("warehouses.products.unpublish")
            : t("warehouses.products.publish")}
        </Button>
      ) : null}

      {product.isProvisional && permissions.canCreate ? (
        <Button
          size="sm"
          onClick={async () => {
            await api(path, { method: "PATCH", body: { isProvisional: false } })
            router.refresh()
          }}
        >
          {t("warehouses.products.approve")}
        </Button>
      ) : null}

      <ItemActions label={t("common.actions")} actions={actions} />
    </div>
  )
}

/** Lo que se lleva por delante eliminar el producto, contado de lo que la ficha ya tiene. */
function cascadeOf(
  product: ProductDetail,
  t: (key: string, values?: Record<string, number>) => string,
) {
  const units = product.measurements.reduce(
    (total, measurement) => total + Object.values(measurement.units).reduce((a, b) => a + b, 0),
    0,
  )

  return [
    t("warehouses.products.cascadeMeasurements", { count: product.measurements.length }),
    t("warehouses.products.cascadeUnits", { count: units }),
    t("warehouses.products.cascadeChildren", {
      count: product.variants.length + product.accessories.length,
    }),
  ]
}

// ─── Los cuatro bloques ──────────────────────────────────────────────────────

function EditInfo({
  path,
  product,
  open,
  onOpenChange,
}: {
  path: string
  product: ProductDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const [name, setName] = useState(product.name)
  const [internalCode, setInternalCode] = useState(product.internalCode ?? "")
  const [description, setDescription] = useState(product.description)

  return (
    <FormDialog
      title={t("warehouses.products.editInfo")}
      submitLabel={t("common.save")}
      size="sm"
      open={open}
      onOpenChange={onOpenChange}
      action={() =>
        api(path, {
          method: "PATCH",
          body: { name: name.trim(), internalCode: internalCode.trim() || null, description },
        })
      }
    >
      {(state) => (
        <>
          <Field
            label={t("warehouses.products.name")}
            required
            error={state.fieldErrors.get("name")}
          >
            {(ids) => <Input {...ids} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>

          <Field
            label={t("warehouses.products.internalCode")}
            error={state.fieldErrors.get("internalCode")}
          >
            {(ids) => (
              <Input
                {...ids}
                value={internalCode}
                onChange={(e) => setInternalCode(e.target.value)}
              />
            )}
          </Field>

          <Field
            label={t("warehouses.products.description")}
            error={state.fieldErrors.get("description")}
          >
            {(ids) => (
              <Textarea
                {...ids}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </Field>
        </>
      )}
    </FormDialog>
  )
}

function EditClassification({
  path,
  product,
  options,
  permissions,
  open,
  onOpenChange,
}: {
  path: string
  product: ProductDetail
  options: ProductOptions
  permissions: ProductPermissions
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const [categoryId, setCategoryId] = useState(product.categoryId)
  const [globalCategoryId, setGlobalCategoryId] = useState(product.globalCategoryId)
  const [storageId, setStorageId] = useState(product.storageId)
  const [responsibleId, setResponsibleId] = useState(product.responsibleId)

  return (
    <FormDialog
      title={t("warehouses.products.editClassification")}
      description={t("warehouses.products.classificationBody")}
      submitLabel={t("common.save")}
      size="sm"
      open={open}
      onOpenChange={onOpenChange}
      action={() =>
        api(path, {
          method: "PATCH",
          body: {
            // Sólo se manda lo que la clave de quien edita autoriza: el servidor comprueba campo a
            // campo y rechazaría el envío entero por un campo que ni siquiera se pintó.
            ...(permissions.canSelectCategory ? { categoryId, globalCategoryId } : {}),
            ...(permissions.canEditLocation ? { storageId } : {}),
            responsibleId,
          },
        })
      }
    >
      {() => (
        <>
          {permissions.canSelectCategory ? (
            <>
              <Field label={t("warehouses.wizard.category")}>
                {(ids) => (
                  <SearchSelect
                    {...ids}
                    value={categoryId}
                    onValueChange={setCategoryId}
                    options={options.categories}
                    placeholder={t("warehouses.wizard.unclassified")}
                    searchPlaceholder={t("common.search")}
                    emptyLabel={t("warehouses.wizard.noCategories")}
                    clearLabel={t("common.clear")}
                  />
                )}
              </Field>

              <Field label={t("warehouses.wizard.globalCategory")}>
                {(ids) => (
                  <SearchSelect
                    {...ids}
                    value={globalCategoryId}
                    onValueChange={setGlobalCategoryId}
                    options={options.globalCategories}
                    placeholder={t("warehouses.wizard.unclassified")}
                    searchPlaceholder={t("common.search")}
                    emptyLabel={t("warehouses.wizard.noCategories")}
                    clearLabel={t("common.clear")}
                  />
                )}
              </Field>
            </>
          ) : null}

          {permissions.canEditLocation ? (
            <Field label={t("warehouses.storage")}>
              {(ids) => (
                <SearchSelect
                  {...ids}
                  value={storageId}
                  onValueChange={setStorageId}
                  options={options.storages}
                  placeholder={t("warehouses.wizard.nowhere")}
                  searchPlaceholder={t("common.search")}
                  emptyLabel={t("warehouses.wizard.noStorages")}
                  clearLabel={t("common.clear")}
                />
              )}
            </Field>
          ) : null}

          <Field label={t("warehouses.wizard.responsible")}>
            {(ids) => (
              <SearchSelect
                {...ids}
                value={responsibleId}
                onValueChange={setResponsibleId}
                options={options.members}
                placeholder={t("warehouses.wizard.responsibleDefault")}
                searchPlaceholder={t("common.search")}
                emptyLabel={t("warehouses.wizard.noMembers")}
                clearLabel={t("common.clear")}
              />
            )}
          </Field>
        </>
      )}
    </FormDialog>
  )
}

function EditPricing({
  path,
  product,
  open,
  onOpenChange,
}: {
  path: string
  product: ProductDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const decimal = decimalSeparator(useFormatter())
  const [price, setPrice] = useState(product.price.replace(".", decimal))
  const [cost, setCost] = useState(product.cost.replace(".", decimal))
  const [usesPriceLists, setUsesPriceLists] = useState(product.usesPriceLists)
  const [forRent, setForRent] = useState(product.availableForRent)
  const [forSale, setForSale] = useState(product.availableForSale)

  return (
    <FormDialog
      title={t("warehouses.products.editPricing")}
      submitLabel={t("common.save")}
      size="sm"
      open={open}
      onOpenChange={onOpenChange}
      action={() =>
        api(path, {
          method: "PATCH",
          body: {
            price: toDecimalString(price, decimal) ?? "0",
            cost: toDecimalString(cost, decimal) ?? "0",
            usesPriceLists,
            availableForRent: forRent,
            availableForSale: forSale,
          },
        })
      }
    >
      {(state) => (
        <>
          <div className="flex flex-wrap gap-4">
            <Switch
              label={t("warehouses.forRent")}
              checked={forRent}
              onCheckedChange={setForRent}
            />
            <Switch
              label={t("warehouses.forSale")}
              checked={forSale}
              onCheckedChange={setForSale}
            />
          </div>

          <Field
            label={t("warehouses.products.basePrice")}
            hint={t("warehouses.wizard.priceHint")}
            error={state.fieldErrors.get("price")}
          >
            {(ids) => (
              <AmountInput {...ids} decimal={decimal} value={price} onValueChange={setPrice} />
            )}
          </Field>

          <Field
            label={t("warehouses.products.cost")}
            hint={t("warehouses.wizard.costHint")}
            error={state.fieldErrors.get("cost")}
          >
            {(ids) => (
              <AmountInput {...ids} decimal={decimal} value={cost} onValueChange={setCost} />
            )}
          </Field>

          <Checkbox
            label={t("warehouses.wizard.usesPriceLists")}
            hint={t("warehouses.wizard.usesPriceListsHint")}
            checked={usesPriceLists}
            onCheckedChange={(next) => setUsesPriceLists(next === true)}
          />
        </>
      )}
    </FormDialog>
  )
}

// ─── Medidas ─────────────────────────────────────────────────────────────────

export function AddMeasurement({
  companyId,
  warehouseId,
  productId,
}: {
  companyId: string
  warehouseId: string
  productId: string
}) {
  const t = useTranslations()

  return (
    <MeasurementDialog
      title={t("warehouses.measurements.add")}
      submitLabel={t("common.create")}
      withQuantity
      trigger={
        <DialogTrigger asChild>
          <Button size="sm" variant="secondary">
            <Plus className="size-4" aria-hidden="true" />
            {t("warehouses.measurements.add")}
          </Button>
        </DialogTrigger>
      }
      action={(body) =>
        api(
          `/companies/${companyId}/warehouses/${warehouseId}/products/${productId}/measurements`,
          { method: "POST", body },
        )
      }
    />
  )
}

export function MeasurementActions({
  companyId,
  warehouseId,
  productId,
  measurement,
  canEdit,
  canDelete,
}: {
  companyId: string
  warehouseId: string
  productId: string
  measurement: MeasurementRow
  canEdit: boolean
  canDelete: boolean
}) {
  const t = useTranslations()
  const path = `/companies/${companyId}/warehouses/${warehouseId}/products/${productId}/measurements/${measurement.id}`
  const units = Object.values(measurement.units).reduce((a, b) => a + b, 0)

  const actions: ItemAction[] = [
    ...(canEdit
      ? [
          {
            key: "edit",
            label: t("common.edit"),
            dialog: (control: { open: boolean; onOpenChange: (open: boolean) => void }) => (
              <MeasurementDialog
                title={t("warehouses.measurements.edit")}
                submitLabel={t("common.save")}
                measurement={measurement}
                action={(body) => api(path, { method: "PATCH", body })}
                {...control}
              />
            ),
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            key: "delete",
            label: t("common.delete"),
            danger: true,
            dialog: (control: { open: boolean; onOpenChange: (open: boolean) => void }) => (
              <ConfirmDestructive
                title={t("warehouses.measurements.deleteTitle")}
                entity={measurement.name}
                cascade={[t("warehouses.products.cascadeUnits", { count: units })]}
                confirmLabel={t("common.delete")}
                action={() => api(path, { method: "DELETE" })}
                {...control}
              />
            ),
          },
        ]
      : []),
  ]

  return <ItemActions label={t("common.actions")} actions={actions} />
}

/** El mismo formulario para crear y para corregir. Lo único que cambia es la cantidad inicial. */
function MeasurementDialog({
  title,
  submitLabel,
  measurement,
  withQuantity = false,
  trigger,
  action,
  open,
  onOpenChange,
}: {
  title: string
  submitLabel: string
  measurement?: MeasurementRow | undefined
  /** La cantidad inicial **materializa unidades**, así que sólo existe al crear la medida. */
  withQuantity?: boolean
  trigger?: React.ReactNode
  action: (body: Record<string, unknown>) => Promise<unknown>
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations()
  const decimal = decimalSeparator(useFormatter())

  const [name, setName] = useState(measurement?.name ?? "")
  const [kind, setKind] = useState<MeasurementKind>((measurement?.kind as MeasurementKind) ?? "box")
  const [priceDifference, setPriceDifference] = useState(
    measurement?.priceDifference?.replace(".", decimal) ?? "",
  )
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>(
    (measurement?.lengthUnit as LengthUnit) ?? "cm",
  )
  const [massUnit, setMassUnit] = useState<MassUnit>((measurement?.massUnit as MassUnit) ?? "kg")
  const [quantity, setQuantity] = useState("")

  return (
    <FormDialog
      title={title}
      submitLabel={submitLabel}
      size="sm"
      {...(trigger === undefined ? {} : { trigger })}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      action={() =>
        action({
          name: name.trim(),
          kind,
          ...(priceDifference.trim() === ""
            ? {}
            : { priceDifference: toDecimalString(priceDifference, decimal) }),
          lengthUnit,
          massUnit,
          ...(withQuantity && quantity !== "" ? { initialQuantity: Number(quantity) } : {}),
        })
      }
    >
      {(state) => (
        <>
          <Field
            label={t("warehouses.products.name")}
            required
            error={state.fieldErrors.get("name")}
          >
            {(ids) => <Input {...ids} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>

          <Field label={t("warehouses.wizard.kind")}>
            {(ids) => (
              <Select
                {...ids}
                value={kind}
                onChange={(e) => setKind(e.target.value as MeasurementKind)}
              >
                {MEASUREMENT_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {t(`warehouses.measurements.kinds.${option}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label={t("warehouses.wizard.priceDifference")}
            hint={t("warehouses.wizard.priceDifferenceHint")}
            error={state.fieldErrors.get("priceDifference")}
          >
            {(ids) => (
              <AmountInput
                {...ids}
                negative
                decimal={decimal}
                value={priceDifference}
                onValueChange={setPriceDifference}
              />
            )}
          </Field>

          <div className="grid gap-3 tablet:grid-cols-2">
            <Field label={t("warehouses.wizard.lengthUnit")}>
              {(ids) => (
                <Select
                  {...ids}
                  value={lengthUnit}
                  onChange={(e) => setLengthUnit(e.target.value as LengthUnit)}
                >
                  {LENGTH_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label={t("warehouses.wizard.massUnit")}>
              {(ids) => (
                <Select
                  {...ids}
                  value={massUnit}
                  onChange={(e) => setMassUnit(e.target.value as MassUnit)}
                >
                  {MASS_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          {withQuantity ? (
            <Field
              label={t("warehouses.wizard.initialQuantity")}
              hint={t("warehouses.wizard.initialQuantityHint")}
            >
              {(ids) => (
                <Input
                  {...ids}
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
                />
              )}
            </Field>
          ) : null}
        </>
      )}
    </FormDialog>
  )
}
