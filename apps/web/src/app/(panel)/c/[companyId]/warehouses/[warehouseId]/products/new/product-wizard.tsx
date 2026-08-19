"use client"

import { createProductInput, measurementInput, productChildInput } from "@tfv/contracts/catalog"
import {
  AmountInput,
  Button,
  Checkbox,
  type DecimalSeparator,
  Field,
  Input,
  Panel,
  SearchSelect,
  type SelectOption,
  Switch,
  Textarea,
  Wizard,
  type WizardState,
  type WizardStepView,
  wizard,
} from "@tfv/ui"
import { Plus, Trash2 } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { z } from "zod"
import { PhotoPicker, usePhotoUploads } from "~/components/photo-picker.tsx"
import { decimalSeparator } from "~/lib/amount.ts"
import { ApiError, api } from "~/lib/api.client.ts"
import { type FieldErrorCode, fieldErrors } from "~/lib/field-errors.ts"
import {
  amount,
  emptyMeasurement,
  MeasurementCard,
  type MeasurementDraft,
  measurementBody,
  newKey,
  size,
  text,
} from "../measurement-fields.tsx"

/**
 * Alta de un producto, en cinco pasos.
 *
 * Es el primer sitio del almacén donde se puede **crear** algo desde la pantalla. Hasta ahora el
 * catálogo entero venía de la siembra.
 *
 * Cada paso valida con **el esquema del servidor** (`@tfv/contracts/catalog`), no con una copia:
 * lo que aquí deja pasar es exactamente lo que allí se admite. Ver la nota de ese archivo.
 *
 * Los pasos que necesitan un permiso que quien mira no tiene **no aparecen**. No se pintan
 * deshabilitados: un paso gris que nadie puede rellenar sigue contando en «paso 3 de 5» y sigue
 * pareciendo trabajo pendiente.
 */

// ─── Lo que se está escribiendo ──────────────────────────────────────────────

interface ChildDraft {
  readonly key: string
  name: string
  internalCode: string
  price: string
}

interface Values {
  name: string
  description: string
  internalCode: string
  categoryId: string | null
  globalCategoryId: string | null
  storageId: string | null
  responsibleId: string | null
  price: string
  cost: string
  usesPriceLists: boolean
  availableForSale: boolean
  availableForRent: boolean
  isPublished: boolean
  measurements: MeasurementDraft[]
  variants: ChildDraft[]
  accessories: ChildDraft[]
}

const INITIAL: Values = {
  name: "",
  description: "",
  internalCode: "",
  categoryId: null,
  globalCategoryId: null,
  storageId: null,
  responsibleId: null,
  price: "",
  cost: "",
  usesPriceLists: false,
  availableForSale: false,
  availableForRent: true,
  isPublished: false,
  measurements: [emptyMeasurement()],
  variants: [],
  accessories: [],
}

// ─── De lo escrito al cuerpo que la API admite ───────────────────────────────

function childBody(draft: ChildDraft, decimal: DecimalSeparator): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    ...(text(draft.internalCode) === undefined ? {} : { internalCode: text(draft.internalCode) }),
    ...(amount(draft.price, decimal) === undefined ? {} : { price: amount(draft.price, decimal) }),
  }
}

function body(values: Values, decimal: DecimalSeparator): Record<string, unknown> {
  return {
    name: values.name.trim(),
    ...(text(values.description) === undefined ? {} : { description: text(values.description) }),
    ...(text(values.internalCode) === undefined ? {} : { internalCode: text(values.internalCode) }),
    ...(values.categoryId === null ? {} : { categoryId: values.categoryId }),
    ...(values.globalCategoryId === null ? {} : { globalCategoryId: values.globalCategoryId }),
    ...(values.storageId === null ? {} : { storageId: values.storageId }),
    ...(values.responsibleId === null ? {} : { responsibleId: values.responsibleId }),
    ...(amount(values.price, decimal) === undefined
      ? {}
      : { price: amount(values.price, decimal) }),
    ...(amount(values.cost, decimal) === undefined ? {} : { cost: amount(values.cost, decimal) }),
    usesPriceLists: values.usesPriceLists,
    availableForSale: values.availableForSale,
    availableForRent: values.availableForRent,
    isPublished: values.isPublished,
    measurements: values.measurements
      .filter((row) => row.name.trim() !== "")
      .map((row) => measurementBody(row, decimal)),
    variants: values.variants.map((row) => childBody(row, decimal)),
    accessories: values.accessories.map((row) => childBody(row, decimal)),
  }
}

// ─── La pantalla ─────────────────────────────────────────────────────────────

export interface Permissions {
  readonly canEditPayment: boolean
  readonly canSelectCategory: boolean
  readonly canEditLocation: boolean
  readonly canPublish: boolean
  /** Las fotos van con la información del producto. Ver `HALLAZGOS.md` H-69. */
  readonly canEditPhotos: boolean
}

export function ProductWizard({
  companyId,
  warehouseId,
  categories,
  globalCategories,
  storages,
  members,
  permissions,
}: {
  companyId: string
  warehouseId: string
  categories: readonly SelectOption[]
  globalCategories: readonly SelectOption[]
  storages: readonly SelectOption[]
  members: readonly SelectOption[]
  permissions: Permissions
}) {
  const t = useTranslations()
  // El signo decimal es el del idioma en que se sirve la página, no una suposición del campo.
  const decimal = decimalSeparator(useFormatter())
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const photos = usePhotoUploads(companyId)
  const [values, setValues] = useState<Values>(INITIAL)
  const [state, setState] = useState<WizardState>(wizard.start())
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // Estables las dos: entran en las dependencias de los pasos, y recreadas en cada dibujo
  // volverían a construir los cinco pasos con cada tecla.
  const say = useCallback((code: FieldErrorCode) => t(`forms.errors.${code}`), [t])

  const edit = useCallback((patch: Partial<Values>) => {
    setValues((current) => ({ ...current, ...patch }))
  }, [])

  const steps = useMemo<readonly WizardStepView<Values>[]>(
    () => [
      {
        id: "identity",
        label: t("warehouses.wizard.identity"),
        validate: (current) =>
          fieldErrors(
            createProductInput
              .pick({ name: true, description: true, internalCode: true })
              .safeParse({
                name: current.name.trim(),
                description: text(current.description),
                internalCode: text(current.internalCode),
              }),
            say,
          ),
        content: (errors) => (
          <div className="flex flex-col gap-4">
            <Field label={t("warehouses.products.name")} required error={errors.name}>
              {(ids) => (
                <Input
                  {...ids}
                  value={values.name}
                  onChange={(event) => edit({ name: event.target.value })}
                  autoFocus
                />
              )}
            </Field>

            <Field
              label={t("warehouses.products.internalCode")}
              hint={t("warehouses.wizard.internalCodeHint")}
              error={errors.internalCode}
            >
              {(ids) => (
                <Input
                  {...ids}
                  value={values.internalCode}
                  onChange={(event) => edit({ internalCode: event.target.value })}
                />
              )}
            </Field>

            <Field label={t("warehouses.products.description")} error={errors.description}>
              {(ids) => (
                <Textarea
                  {...ids}
                  value={values.description}
                  onChange={(event) => edit({ description: event.target.value })}
                />
              )}
            </Field>
          </div>
        ),
      },

      ...(permissions.canSelectCategory || permissions.canEditLocation
        ? [
            {
              id: "classification",
              label: t("warehouses.wizard.classification"),
              content: () => (
                <div className="flex flex-col gap-4">
                  {permissions.canSelectCategory ? (
                    <>
                      <Field
                        label={t("warehouses.wizard.category")}
                        hint={t("warehouses.wizard.categoryHint")}
                      >
                        {(ids) => (
                          <SearchSelect
                            {...ids}
                            value={values.categoryId}
                            onValueChange={(next) => edit({ categoryId: next })}
                            options={categories}
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
                            value={values.globalCategoryId}
                            onValueChange={(next) => edit({ globalCategoryId: next })}
                            options={globalCategories}
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
                    <Field
                      label={t("warehouses.storage")}
                      hint={t("warehouses.wizard.storageHint")}
                    >
                      {(ids) => (
                        <SearchSelect
                          {...ids}
                          value={values.storageId}
                          onValueChange={(next) => edit({ storageId: next })}
                          options={storages}
                          placeholder={t("warehouses.wizard.nowhere")}
                          searchPlaceholder={t("common.search")}
                          emptyLabel={t("warehouses.wizard.noStorages")}
                          clearLabel={t("common.clear")}
                        />
                      )}
                    </Field>
                  ) : null}

                  <Field
                    label={t("warehouses.wizard.responsible")}
                    hint={t("warehouses.wizard.responsibleHint")}
                  >
                    {(ids) => (
                      <SearchSelect
                        {...ids}
                        value={values.responsibleId}
                        onValueChange={(next) => edit({ responsibleId: next })}
                        options={members}
                        placeholder={t("warehouses.wizard.responsibleDefault")}
                        searchPlaceholder={t("common.search")}
                        emptyLabel={t("warehouses.wizard.noMembers")}
                        clearLabel={t("common.clear")}
                      />
                    )}
                  </Field>
                </div>
              ),
            } satisfies WizardStepView<Values>,
          ]
        : []),

      ...(permissions.canEditPayment
        ? [
            {
              id: "money",
              label: t("warehouses.wizard.money"),
              validate: (current) =>
                fieldErrors(
                  createProductInput.pick({ price: true, cost: true }).safeParse({
                    price: amount(current.price, decimal),
                    cost: amount(current.cost, decimal),
                  }),
                  say,
                ),
              content: (errors) => (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 tablet:flex-row">
                    <Switch
                      label={t("warehouses.forRent")}
                      checked={values.availableForRent}
                      onCheckedChange={(next) => edit({ availableForRent: next })}
                    />
                    <Switch
                      label={t("warehouses.forSale")}
                      checked={values.availableForSale}
                      onCheckedChange={(next) => edit({ availableForSale: next })}
                    />
                  </div>

                  <Field
                    label={t("warehouses.products.basePrice")}
                    hint={t("warehouses.wizard.priceHint")}
                    error={errors.price}
                  >
                    {(ids) => (
                      <AmountInput
                        {...ids}
                        decimal={decimal}
                        value={values.price}
                        onValueChange={(next) => edit({ price: next })}
                      />
                    )}
                  </Field>

                  <Field
                    label={t("warehouses.products.cost")}
                    hint={t("warehouses.wizard.costHint")}
                    error={errors.cost}
                  >
                    {(ids) => (
                      <AmountInput
                        {...ids}
                        decimal={decimal}
                        value={values.cost}
                        onValueChange={(next) => edit({ cost: next })}
                      />
                    )}
                  </Field>

                  <Checkbox
                    label={t("warehouses.wizard.usesPriceLists")}
                    hint={t("warehouses.wizard.usesPriceListsHint")}
                    checked={values.usesPriceLists}
                    onCheckedChange={(next) => edit({ usesPriceLists: next === true })}
                  />

                  {permissions.canPublish ? (
                    <Checkbox
                      label={t("warehouses.wizard.publish")}
                      hint={t("warehouses.wizard.publishHint")}
                      checked={values.isPublished}
                      onCheckedChange={(next) => edit({ isPublished: next === true })}
                    />
                  ) : null}
                </div>
              ),
            } satisfies WizardStepView<Values>,
          ]
        : []),

      {
        id: "measurements",
        label: t("warehouses.wizard.measurements"),
        validate: (current) =>
          fieldErrors(
            z
              .array(measurementInput)
              .safeParse(
                current.measurements
                  .filter((row) => row.name.trim() !== "")
                  .map((row) => measurementBody(row, decimal)),
              ),
            say,
          ),
        content: (errors) => (
          <div className="flex flex-col gap-4">
            <p className="text-body2 text-content-muted">
              {t("warehouses.wizard.measurementsHelp")}
            </p>

            {values.measurements.map((draft, index) => (
              <MeasurementCard
                key={draft.key}
                draft={draft}
                index={index}
                errors={errors}
                decimal={decimal}
                removable={values.measurements.length > 1}
                onChange={(patch) =>
                  edit({
                    measurements: values.measurements.map((row) =>
                      row.key === draft.key ? { ...row, ...patch } : row,
                    ),
                  })
                }
                onRemove={() =>
                  edit({
                    measurements: values.measurements.filter((row) => row.key !== draft.key),
                  })
                }
              />
            ))}

            <Button
              type="button"
              variant="secondary"
              onClick={() => edit({ measurements: [...values.measurements, emptyMeasurement()] })}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("warehouses.wizard.addMeasurement")}
            </Button>
          </div>
        ),
      },

      ...(permissions.canEditPhotos
        ? [
            {
              id: "photos",
              label: t("warehouses.wizard.photos"),
              content: () => (
                <div className="flex flex-col gap-4">
                  <p className="text-body2 text-content-muted">
                    {t("warehouses.wizard.photosHelp")}
                  </p>
                  <PhotoPicker uploads={photos} />
                </div>
              ),
            } satisfies WizardStepView<Values>,
          ]
        : []),

      {
        id: "structure",
        label: t("warehouses.wizard.structure"),
        validate: (current) =>
          fieldErrors(
            z
              .array(productChildInput)
              .safeParse(
                [...current.variants, ...current.accessories].map((row) => childBody(row, decimal)),
              ),
            say,
          ),
        content: (errors) => (
          <div className="flex flex-col gap-6">
            <ChildList
              title={t("warehouses.products.variants")}
              help={t("warehouses.wizard.variantsHelp")}
              addLabel={t("warehouses.wizard.addVariant")}
              drafts={values.variants}
              errors={errors}
              decimal={decimal}
              offset={0}
              onChange={(variants) => edit({ variants })}
            />

            <ChildList
              title={t("warehouses.products.accessories")}
              help={t("warehouses.wizard.accessoriesHelp")}
              addLabel={t("warehouses.wizard.addAccessory")}
              drafts={values.accessories}
              errors={errors}
              decimal={decimal}
              offset={values.variants.length}
              onChange={(accessories) => edit({ accessories })}
            />

            <Summary values={values} />
          </div>
        ),
      },
    ],
    // `values` entra entero porque cada paso pinta lo que se está escribiendo.
    [
      values,
      permissions,
      categories,
      globalCategories,
      storages,
      members,
      photos,
      t,
      say,
      edit,
      decimal,
    ],
  )

  // El paso viaja en la dirección para que el botón de atrás del navegador haga lo que se espera.
  const requested = Number(params.get("paso") ?? "1") - 1

  useEffect(() => {
    if (requested === state.current) return

    const next = wizard.goTo(state, requested)
    if (next.current === state.current) {
      // Se pidió un paso al que todavía no se ha llegado: manda el asistente, no la dirección.
      router.replace(`${pathname}?paso=${state.current + 1}`, { scroll: false })
      return
    }
    setState(next)
  }, [requested, state, router, pathname])

  function change(next: WizardState) {
    setState(next)
    if (next.current !== state.current) {
      router.replace(`${pathname}?paso=${next.current + 1}`, { scroll: false })
    }
  }

  /**
   * Crear, y **después** subir.
   *
   * La escritura de las fotos va directa al almacenamiento y puede fallar por su cuenta. Subiendo
   * antes, una foto caída se llevaría por delante los cinco pasos que la persona acaba de rellenar;
   * subiendo después, lo peor que pasa es que el producto quede creado sin fotos y se añadan desde
   * su ficha, que ya sabe hacerlo.
   */
  async function submit() {
    setPending(true)
    setFailure(null)

    try {
      const created = await api<{ id: string }>(
        `/companies/${companyId}/warehouses/${warehouseId}/products`,
        { method: "POST", body: body(values, decimal) },
      )

      const outcome = await photos.run()
      if (outcome.uploaded.length > 0) {
        await api(
          `/companies/${companyId}/warehouses/${warehouseId}/products/${created.id}/images`,
          { method: "PUT", body: { uploadIds: [...outcome.uploaded] } },
        )
      }

      router.push(`/c/${companyId}/warehouses/${warehouseId}/products/${created.id}`)
    } catch (error) {
      setPending(false)
      setFailure(error instanceof ApiError ? error.message : t("common.unexpectedError"))
    }
  }

  return (
    <Panel className="p-5 tablet:p-6">
      <Wizard
        steps={steps}
        values={values}
        state={state}
        onStateChange={change}
        onSubmit={submit}
        onCancel={() => router.push(`/c/${companyId}/warehouses/${warehouseId}`)}
        dirty={JSON.stringify(values) !== JSON.stringify(INITIAL) || photos.files.length > 0}
        pending={pending}
        {...(failure === null ? {} : { error: failure })}
        labels={{
          back: t("common.back"),
          next: t("common.next"),
          submit: t("warehouses.wizard.create"),
          cancel: t("common.cancel"),
          counter: (step, total) => t("warehouses.wizard.counter", { step, total }),
          stepWithError: t("warehouses.wizard.stepWithError"),
          stepDone: t("warehouses.wizard.stepDone"),
          discardTitle: t("warehouses.wizard.discardTitle"),
          discardDescription: t("warehouses.wizard.discardBody"),
          discardConfirm: t("warehouses.wizard.discard"),
          discardKeep: t("warehouses.wizard.keep"),
          close: t("common.close"),
        }}
      />
    </Panel>
  )
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function ChildList({
  title,
  help,
  addLabel,
  drafts,
  errors,
  decimal,
  offset,
  onChange,
}: {
  title: string
  help: string
  addLabel: string
  drafts: readonly ChildDraft[]
  errors: Readonly<Record<string, string>>
  decimal: DecimalSeparator
  /** Los hijos se validan en una sola lista: las variantes primero y los accesorios después. */
  offset: number
  onChange: (drafts: ChildDraft[]) => void
}) {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-body1 font-semibold text-content">{title}</h2>
        <p className="text-body2 text-content-muted">{help}</p>
      </div>

      {drafts.map((draft, index) => (
        <Panel key={draft.key} className="flex items-start gap-3 bg-panel-sunken p-4">
          <Field
            label={t("warehouses.products.name")}
            required
            error={errors[`${offset + index}.name`]}
            className="flex-1"
          >
            {(ids) => (
              <Input
                {...ids}
                value={draft.name}
                onChange={(event) =>
                  onChange(
                    drafts.map((row) =>
                      row.key === draft.key ? { ...row, name: event.target.value } : row,
                    ),
                  )
                }
              />
            )}
          </Field>

          <Field
            label={t("warehouses.products.basePrice")}
            error={errors[`${offset + index}.price`]}
            className="w-40"
          >
            {(ids) => (
              <AmountInput
                {...ids}
                decimal={decimal}
                value={draft.price}
                onValueChange={(next) =>
                  onChange(
                    drafts.map((row) => (row.key === draft.key ? { ...row, price: next } : row)),
                  )
                }
              />
            )}
          </Field>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-7"
            onClick={() => onChange(drafts.filter((row) => row.key !== draft.key))}
            aria-label={t("common.remove")}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </Panel>
      ))}

      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          onChange([...drafts, { key: newKey(), name: "", internalCode: "", price: "" }])
        }
      >
        <Plus className="size-4" aria-hidden="true" />
        {addLabel}
      </Button>
    </div>
  )
}

/** Lo que se va a crear, antes de crearlo. Es lo que hace que el último paso no sea un salto. */
function Summary({ values }: { values: Values }) {
  const t = useTranslations()

  const measurements = values.measurements.filter((row) => row.name.trim() !== "")
  const units = measurements.reduce((total, row) => total + (size(row.initialQuantity) ?? 0), 0)

  return (
    <Panel className="flex flex-col gap-2 p-4">
      <h2 className="text-body1 font-semibold text-content">{t("warehouses.wizard.summary")}</h2>

      <ul className="flex flex-col gap-1 text-body2 text-content-muted">
        <li>{t("warehouses.wizard.summaryProduct", { name: values.name || "—" })}</li>
        <li>{t("warehouses.wizard.summaryMeasurements", { count: measurements.length })}</li>
        <li>{t("warehouses.wizard.summaryUnits", { count: units })}</li>
        <li>
          {t("warehouses.wizard.summaryChildren", {
            variants: values.variants.length,
            accessories: values.accessories.length,
          })}
        </li>
      </ul>

      <p className="text-body3 text-content-faint">{t("warehouses.wizard.summaryNote")}</p>
    </Panel>
  )
}
