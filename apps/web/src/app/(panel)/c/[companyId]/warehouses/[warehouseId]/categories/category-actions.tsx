"use client"

import { Button, DialogTrigger, Field, Input } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import type { PageEnvelope } from "~/components/collection/collection.tsx"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { flattenTree, subtreeSize } from "~/components/tree/tree.ts"
import { TreeDeleteDialog } from "~/components/tree/tree-delete-dialog.tsx"
import { TreeMoveDialog } from "~/components/tree/tree-move-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import type { ItemsEnvelope, ProductRow, WarehouseCategoryRow } from "../../warehouse.ts"

/**
 * Las cuatro escrituras del árbol de categorías.
 *
 * Es el mismo árbol que el de ubicaciones y las mismas cuatro operaciones. Lo que cambia es lo que
 * se enumera antes de borrar: aquí lo que se queda huérfano son **productos sin clasificar**, y el
 * recuento hay que componerlo, porque las categorías no tienen la consulta de alcance que sí tienen
 * las ubicaciones (H-38):
 *
 * - **Cuántas categorías**, del árbol aplanado que ya hace falta para elegir padre.
 * - **Cuántos productos**, del propio listado del catálogo filtrado por la categoría, que es quien
 *   sabe que filtrar por una incluye a todas sus descendientes. Es exactamente lo que se pregunta.
 *
 * El identificador legible no es un campo: lo deriva el servidor del nombre y lo hace único
 * **dentro del almacén**. Ofrecerlo aquí sería ofrecer algo que no se puede cumplir.
 */

function basePath(companyId: string, warehouseId: string) {
  return `/companies/${companyId}/warehouses/${warehouseId}/categories`
}

/** Baja el árbol entero, aplanado. Lo comparten elegir padre y contar antes de borrar. */
function loadTree(companyId: string, warehouseId: string) {
  const base = basePath(companyId, warehouseId)

  return flattenTree<WarehouseCategoryRow>(
    async (parentId) => {
      const url = parentId === null ? base : `${base}?parentId=${encodeURIComponent(parentId)}`
      return (await api<ItemsEnvelope<WarehouseCategoryRow>>(url)).items
    },
    (node) => node.name,
  )
}

function CategoryFields({
  category,
  fieldErrors,
}: {
  category?: WarehouseCategoryRow
  fieldErrors: ReadonlyMap<string, string>
}) {
  const t = useTranslations()

  return (
    <>
      <Field label={t("common.name")} error={fieldErrors.get("name")} required>
        {(ids) => <Input {...ids} name="name" defaultValue={category?.name} autoFocus />}
      </Field>

      <Field
        label={t("warehouses.categories.descriptionLabel")}
        hint={t("warehouses.categories.descriptionHint")}
        error={fieldErrors.get("description")}
      >
        {(ids) => <Input {...ids} name="description" defaultValue={category?.description} />}
      </Field>
    </>
  )
}

export function CreateCategory({
  companyId,
  warehouseId,
  parentId = null,
  parentName,
}: {
  companyId: string
  warehouseId: string
  parentId?: string | null
  parentName?: string
}) {
  const t = useTranslations()

  return (
    <FormDialog
      title={
        parentName
          ? t("warehouses.categories.createInTitle", { parent: parentName })
          : t("warehouses.categories.createTitle")
      }
      submitLabel={t("common.create")}
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            {parentId === null
              ? t("warehouses.categories.createRoot")
              : t("warehouses.categories.createChild")}
          </Button>
        </DialogTrigger>
      }
      action={(data) =>
        api(basePath(companyId, warehouseId), {
          method: "POST",
          body: {
            name: text(data, "name"),
            description: optional(data, "description"),
            parentId,
          },
        })
      }
    >
      {(state) => <CategoryFields fieldErrors={state.fieldErrors} />}
    </FormDialog>
  )
}

export function EditCategory({
  companyId,
  warehouseId,
  category,
  open,
  onOpenChange,
}: {
  companyId: string
  warehouseId: string
  category: WarehouseCategoryRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("warehouses.categories.editTitle", { name: category.name })}
      submitLabel={t("common.save")}
      open={open}
      onOpenChange={onOpenChange}
      action={(data) =>
        api(`${basePath(companyId, warehouseId)}/${category.id}`, {
          method: "PATCH",
          // La descripción se manda siempre, también vacía: es cómo se borra una que sobraba.
          body: { name: text(data, "name"), description: text(data, "description") },
        })
      }
    >
      {(state) => <CategoryFields category={category} fieldErrors={state.fieldErrors} />}
    </FormDialog>
  )
}

export function MoveCategory({
  companyId,
  warehouseId,
  category,
  open,
  onOpenChange,
}: {
  companyId: string
  warehouseId: string
  category: WarehouseCategoryRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()

  return (
    <TreeMoveDialog
      title={t("warehouses.categories.moveTitle", { name: category.name })}
      submitLabel={t("common.save")}
      fieldLabel={t("warehouses.categories.moveField")}
      hint={t("warehouses.categories.moveHint")}
      rootLabel={t("warehouses.categories.moveRoot")}
      loadingLabel={t("warehouses.categories.moveLoading")}
      cycleMessage={t("warehouses.categories.cycle")}
      node={category}
      load={() => loadTree(companyId, warehouseId)}
      move={(parentId) =>
        api(`${basePath(companyId, warehouseId)}/${category.id}`, {
          method: "PATCH",
          body: { parentId },
        })
      }
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

export function DeleteCategory({
  companyId,
  warehouseId,
  category,
  canCountProducts,
  after,
  open,
  onOpenChange,
}: {
  companyId: string
  warehouseId: string
  category: WarehouseCategoryRow
  after?: string | undefined
  /**
   * Si se puede preguntar al catálogo cuántos productos se quedan sin clasificar.
   *
   * Quien no puede ver el catálogo no puede contarlo, y pedirlo devolvería `403`. En ese caso la
   * confirmación enumera lo que sí sabe en lugar de fallar entera.
   */
  canCountProducts: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()

  return (
    <TreeDeleteDialog
      title={t("warehouses.categories.deleteTitle")}
      entity={category.name}
      confirmLabel={t("common.delete")}
      countingLabel={t("warehouses.categories.counting")}
      countFailedLabel={t("warehouses.categories.countFailed")}
      load={async () => {
        const [tree, products] = await Promise.all([
          loadTree(companyId, warehouseId),
          canCountProducts
            ? api<PageEnvelope<ProductRow>>(
                `/companies/${companyId}/warehouses/${warehouseId}/products?categoryId=${encodeURIComponent(category.id)}&limit=1`,
              )
            : Promise.resolve(null),
        ])

        return [
          t("warehouses.categories.deleteCascade", { count: subtreeSize(tree, category.id) }),
          ...(products
            ? [t("warehouses.categories.deleteProducts", { count: products.totalItems })]
            : []),
        ]
      }}
      remove={() => api(`${basePath(companyId, warehouseId)}/${category.id}`, { method: "DELETE" })}
      after={after}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

export function CategoryActions({
  companyId,
  warehouseId,
  category,
  canEdit,
  canDelete,
  canCountProducts,
  after,
}: {
  companyId: string
  warehouseId: string
  category: WarehouseCategoryRow
  canEdit: boolean
  canDelete: boolean
  canCountProducts: boolean
  /** A dónde ir tras borrar, cuando ésta es la categoría que la pantalla está enseñando. */
  after?: string | undefined
}) {
  const t = useTranslations()
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: t("common.edit"),
      dialog: (control) => (
        <EditCategory
          key="edit"
          companyId={companyId}
          warehouseId={warehouseId}
          category={category}
          {...control}
        />
      ),
    })

    actions.push({
      key: "move",
      label: t("warehouses.categories.move"),
      dialog: (control) => (
        <MoveCategory
          key="move"
          companyId={companyId}
          warehouseId={warehouseId}
          category={category}
          {...control}
        />
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: t("common.delete"),
      danger: true,
      dialog: (control) => (
        <DeleteCategory
          key="delete"
          companyId={companyId}
          warehouseId={warehouseId}
          category={category}
          canCountProducts={canCountProducts}
          after={after}
          {...control}
        />
      ),
    })
  }

  return <ItemActions label={t("common.actions")} actions={actions} />
}
